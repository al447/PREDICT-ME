/**
 * sweepService.js — Core sweep orchestrator
 *
 * Called by depositWatcherService when a deposit is detected on an intake address.
 * Responsibilities:
 *   1. Look up the user's deposit index (to derive the intake signer).
 *   2. Select the best bridge provider for the chain.
 *   3. Get a quote.
 *   4. Build + sign + broadcast the sweep → bridge transaction.
 *   5. Advance BridgeDeposit.status through sweeping → bridging.
 *   6. Idempotent — keyed on sourceTxHash; safe to retry.
 *
 * BRIDGE_SWEEP_ENABLED=true   — execute real on-chain sweeps
 * BRIDGE_SWEEP_ENABLED=false  — log intent, mark bridging, skip actual tx
 */

const { ethers } = require('ethers');
const User = require('../models/User');
const BridgeDeposit = require('../models/BridgeDeposit');
const { getEvmSigner } = require('./depositAddresses');
const across = require('./bridgeProviders/acrossProvider');
const cctp = require('./bridgeProviders/cctpProvider');
const relay = require('./bridgeProviders/relayProvider');
const debridge = require('./bridgeProviders/debridgeProvider');
const { ensureSolanaGas } = require('./bridgeGasFunder');

const SWEEP_ENABLED = process.env.BRIDGE_SWEEP_ENABLED === 'true';

// Testnet chains: detection is real, but bridging is mock-credited
// (Across/relayers don't reliably support testnet → Amoy routes).
const TESTNET_CHAIN_IDS = new Set([11155111]); // Sepolia

// EVM RPC providers (lazy-initialised per chain)
const _providers = {};
function getProvider(chainId) {
  if (_providers[chainId]) return _providers[chainId];
  const urls = {
    1:     process.env.ETH_RPC_URL       || 'https://eth.llamarpc.com',
    8453:  process.env.BASE_RPC_URL      || 'https://mainnet.base.org',
    42161: process.env.ARB_RPC_URL       || 'https://arb1.arbitrum.io/rpc',
    10:    process.env.OP_RPC_URL        || 'https://mainnet.optimism.io',
    43114: process.env.AVAX_RPC_URL      || 'https://api.avax.network/ext/bc/C/rpc',
    137:   process.env.POLYGON_RPC_URL   || 'https://polygon-rpc.com',
  };
  const url = urls[chainId];
  if (!url) throw new Error(`[Sweep] No RPC for chainId ${chainId}`);
  _providers[chainId] = new ethers.JsonRpcProvider(url);
  return _providers[chainId];
}

/**
 * Process a detected deposit.
 *
 * @param {string} depositId - BridgeDeposit._id
 */
async function processDeposit(depositId) {
  const deposit = await BridgeDeposit.findById(depositId).lean();
  if (!deposit) {
    console.error(`[Sweep] BridgeDeposit ${depositId} not found`);
    return;
  }

  // Idempotency guard — don't re-sweep deposits past the 'detected' stage
  if (['sweeping', 'bridging', 'attesting', 'minting', 'credited', 'failed'].includes(deposit.status)) {
    console.log(`[Sweep] Deposit ${depositId} already in state ${deposit.status} — skipping`);
    return;
  }

  const user = await User.findById(deposit.userId).lean();
  if (!user) {
    await BridgeDeposit.findByIdAndUpdate(depositId, { status: 'failed', errorMessage: 'User not found' });
    return;
  }

  try {
    await BridgeDeposit.findByIdAndUpdate(depositId, { status: 'sweeping' });

    let result;
    if (deposit.chainType === 'evm') {
      result = await sweepEvm(deposit, user);
    } else if (deposit.chainType === 'svm') {
      result = await sweepSolana(deposit, user);
    } else if (deposit.chainType === 'btc') {
      result = await sweepBtc(deposit, user);
    } else {
      throw new Error(`[Sweep] Unknown chainType: ${deposit.chainType}`);
    }

    // CCTP goes to 'attesting' (waiting for Circle attestation); all others go to 'bridging'
    const nextStatus = result.provider === 'cctp' ? 'attesting' : 'bridging';
    await BridgeDeposit.findByIdAndUpdate(depositId, {
      status:        nextStatus,
      bridgeProvider: result.provider,
      bridgeTxHash:  result.txHash || null,
    });

    console.log(`[Sweep] Deposit ${depositId} → ${nextStatus} via ${result.provider}, txHash: ${result.txHash}`);
  } catch (err) {
    console.error(`[Sweep] Deposit ${depositId} failed:`, err.message);
    await BridgeDeposit.findByIdAndUpdate(depositId, {
      status:       'failed',
      errorMessage: err.message,
      $inc:         { retryCount: 1 },
    });
  }
}

// ── EVM sweep ─────────────────────────────────────────────────────────────────

async function sweepEvm(deposit, user) {
  const { sourceChainId, sourceToken, sourceAmount, intakeAddress } = deposit;
  const safeAddress = user.smartWallet?.proxy;
  if (!safeAddress) throw new Error('[Sweep][EVM] User has no Safe proxy');

  // Testnet: skip real Across bridge — mock-credit via completion poller.
  if (TESTNET_CHAIN_IDS.has(sourceChainId)) {
    console.log(`[Sweep][EVM] TESTNET — mock-bridging ${sourceAmount} ${sourceToken} from chain ${sourceChainId} → ${safeAddress}`);
    return { provider: 'testnet-mock', txHash: null };
  }

  const signer = getEvmSigner(user.depositIndex).connect(getProvider(sourceChainId));
  const amountBN = ethers.parseUnits(sourceAmount.toString(), 6); // USDC = 6 decimals

  // Get Across quote
  const quote = await across.getQuote({
    fromChainId: sourceChainId,
    inputToken:  resolveUSDCAddress(sourceChainId),
    outputToken: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
    amount:      amountBN.toString(),
    recipient:   safeAddress,
  });

  if (!SWEEP_ENABLED) {
    console.log(`[Sweep][EVM] MOCK — would bridge ${sourceAmount} USDC from chain ${sourceChainId} via Across`);
    return { provider: 'across', txHash: null };
  }

  // Build and send deposit tx to Across SpokePool
  const calldata = await across.buildDepositCalldata({
    fromChainId:     sourceChainId,
    inputToken:      resolveUSDCAddress(sourceChainId),
    outputToken:     '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    amount:          amountBN.toString(),
    recipient:       safeAddress,
    quoteTimestamp:  Math.floor(Date.now() / 1000),
  });

  const tx = await signer.sendTransaction({
    to:    calldata.to,
    data:  calldata.data,
    value: calldata.value,
  });

  const receipt = await tx.wait();
  return { provider: 'across', txHash: receipt.hash };
}

// ── Solana sweep (CCTP) ───────────────────────────────────────────────────────

async function sweepSolana(deposit, user) {
  const safeAddress = user.smartWallet?.proxy;
  if (!safeAddress) throw new Error('[Sweep][SVM] User has no Safe proxy');

  const { getSolanaKeypair } = require('./depositAddresses');
  const keypair = getSolanaKeypair(user.depositIndex);

  // 1. Ensure the intake address has enough SOL for gas
  const { PublicKey } = require('@solana/web3.js');
  const intakePubkey = new PublicKey(keypair.secretKey.slice(32)).toBase58();
  await ensureSolanaGas(intakePubkey);

  // 2. Burn USDC on Solana via CCTP
  const result = await cctp.burnOnSolana({
    secretKey:        keypair.secretKey,
    amount:           ethers.parseUnits(deposit.sourceAmount.toString(), 6).toString(),
    mintRecipientEvm: safeAddress,
  });

  // 3. Persist CCTP-specific fields
  if (result.txHash) {
    await BridgeDeposit.findByIdAndUpdate(deposit._id, {
      cctpMessageHash:  result.messageHash || null,
      cctpMessageBytes: result.messageBytes || null,
    });
  }

  return { provider: 'cctp', txHash: result.txHash };
}

// ── BTC sweep (Relay — no-op) ─────────────────────────────────────────────────
// BTC deposits are handled entirely by Relay (no PredictMe keys, no PSBT).
// The depositWatcherService creates BridgeDeposit records directly in 'bridging'
// status when Relay reports a successful fill. This function is only called
// if a BTC deposit somehow enters processDeposit (shouldn't happen with Relay).

async function sweepBtc(deposit, user) {
  console.log(`[Sweep][BTC] Relay handles BTC deposits — no sweep needed for ${deposit._id}`);
  return { provider: 'relay', txHash: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const USDC_BY_CHAIN = {
  1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  137:   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
};

function resolveUSDCAddress(chainId) {
  const addr = USDC_BY_CHAIN[chainId];
  if (!addr) throw new Error(`[Sweep] No USDC address for chainId ${chainId}`);
  return addr;
}

// ── Bridge completion poller ───────────────────────────────────────────────────
// Polls deposits stuck in 'bridging' state and credits user balance on completion.

let _pollRunning = false;
const BRIDGE_POLL_MS = parseInt(process.env.BRIDGE_COMPLETION_POLL_MS || '60000'); // 60 s

async function startBridgeCompletionPoller() {
  if (_pollRunning) return;
  _pollRunning = true;
  console.log('[Sweep] Bridge completion poller started');

  while (_pollRunning) {
    try {
      // Query all active statuses that need polling
      const pending = await BridgeDeposit.find({
        status: { $in: ['bridging', 'attesting', 'minting'] },
      })
        .limit(50)
        .lean();

      for (const dep of pending) {
        try {
          // ── Mock mode ──────────────────────────────────────────────────
          if (!SWEEP_ENABLED) {
            let creditUsd;
            if (dep.bridgeProvider === 'cctp' || dep.chainType === 'svm') {
              creditUsd = dep.sourceAmount; // CCTP is 1:1
            } else {
              creditUsd = dep.sourceAmount * 0.997;
            }
            await creditDeposit(dep._id.toString(), dep.userId.toString(), creditUsd);
            continue;
          }

          // ── Across (EVM) ───────────────────────────────────────────────
          if (dep.bridgeProvider === 'across' && dep.bridgeTxHash) {
            const status = await across.getStatus(dep.bridgeTxHash, dep.sourceChainId, 137);
            if (status.status === 'filled' || status.status === 'completed') {
              const creditUsd = status.outputAmount
                ? Number(ethers.formatUnits(status.outputAmount, 6))
                : dep.sourceAmount * 0.997;
              await creditDeposit(dep._id.toString(), dep.userId.toString(), creditUsd);
            } else if (status.status === 'expired' || status.status === 'failed') {
              await BridgeDeposit.findByIdAndUpdate(dep._id, { status: 'failed', errorMessage: 'Bridge tx expired' });
            }
          }

          // ── CCTP (Solana) ──────────────────────────────────────────────
          else if (dep.bridgeProvider === 'cctp') {
            await pollCctpDeposit(dep);
          }

          // ── Relay (Bitcoin) ────────────────────────────────────────────
          else if (dep.bridgeProvider === 'relay') {
            await pollRelayDeposit(dep);
          }

          // ── No txHash, no provider — mock sweep fallback ──────────────
          else if (!dep.bridgeTxHash && !dep.bridgeProvider) {
            if (!SWEEP_ENABLED) {
              await creditDeposit(dep._id.toString(), dep.userId.toString(), dep.sourceAmount * 0.997);
            }
          }
        } catch (err) {
          console.error(`[Sweep][Poller] Deposit ${dep._id} status check failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Sweep][Poller] Fatal error:', err.message);
    }

    await new Promise(r => setTimeout(r, BRIDGE_POLL_MS));
  }
}

/**
 * Poll a CCTP deposit through attesting → minting → credited.
 */
async function pollCctpDeposit(dep) {
  const MAX_RETRIES = 60; // ~60 min at 60s poll

  if (dep.status === 'attesting') {
    // Check if Circle has attested the burn
    const att = await cctp.getAttestation(dep.bridgeTxHash);
    if (att.status === 'complete') {
      // Persist attestation data and advance to 'minting'
      await BridgeDeposit.findByIdAndUpdate(dep._id, {
        status:           'minting',
        cctpAttestation:  att.attestation,
        cctpMessageBytes: att.message,
        cctpMessageHash:  att.messageHash || dep.cctpMessageHash,
      });
      console.log(`[Sweep][Poller] CCTP deposit ${dep._id} → minting (attestation complete)`);
    } else if (dep.retryCount >= MAX_RETRIES) {
      await BridgeDeposit.findByIdAndUpdate(dep._id, {
        status:       'failed',
        errorMessage: 'CCTP attestation timeout',
      });
    } else {
      await BridgeDeposit.findByIdAndUpdate(dep._id, { $inc: { retryCount: 1 } });
    }
  }

  if (dep.status === 'minting' || (dep.cctpAttestation && dep.cctpMessageBytes)) {
    // Execute the Polygon mint
    const msgBytes = dep.cctpMessageBytes;
    const attestation = dep.cctpAttestation;
    if (!msgBytes || !attestation) return; // wait for next poll

    try {
      const mintResult = await cctp.mintOnPolygon({ messageBytes: msgBytes, attestation });
      // Credit 1:1 (CCTP has zero protocol fee)
      await BridgeDeposit.findByIdAndUpdate(dep._id, {
        outboundTxHash: mintResult.txHash || null,
      });
      await creditDeposit(dep._id.toString(), dep.userId.toString(), dep.sourceAmount);
      console.log(`[Sweep][Poller] CCTP deposit ${dep._id} → credited (mint tx: ${mintResult.txHash})`);
    } catch (err) {
      console.error(`[Sweep][Poller] CCTP mint failed for ${dep._id}:`, err.message);
      if (dep.retryCount >= MAX_RETRIES) {
        await BridgeDeposit.findByIdAndUpdate(dep._id, {
          status:       'failed',
          errorMessage: `Polygon mint failed: ${err.message}`,
        });
      } else {
        await BridgeDeposit.findByIdAndUpdate(dep._id, { $inc: { retryCount: 1 } });
      }
    }
  }
}

/**
 * Poll a Relay deposit — check status and credit with Relay's actual USDC output.
 */
async function pollRelayDeposit(dep) {
  const requestId = dep.relayRequestId;
  if (!requestId) {
    console.warn(`[Sweep][Poller] Relay deposit ${dep._id} has no relayRequestId`);
    return;
  }

  const status = await relay.getStatus(requestId);

  if (status.status === 'success') {
    // Use Relay's actual USDC output (no hardcoded BTC price)
    const creditUsd = status.outAmountUsdc || dep.sourceAmount * 0.99;
    await BridgeDeposit.findByIdAndUpdate(dep._id, {
      outboundTxHash: status.outTxHash || null,
    });
    await creditDeposit(dep._id.toString(), dep.userId.toString(), creditUsd);
    console.log(`[Sweep][Poller] Relay deposit ${dep._id} → credited $${creditUsd} USDC`);
  } else if (status.status === 'refund' || status.status === 'failure') {
    await BridgeDeposit.findByIdAndUpdate(dep._id, {
      status:       'failed',
      errorMessage: `Relay ${status.status}: BTC auto-refunded to sender`,
    });
    console.log(`[Sweep][Poller] Relay deposit ${dep._id} → failed (${status.status})`);
  }
  // 'pending' → wait for next poll cycle
}

/**
 * Credit a user's platform balance and mark deposit as credited.
 * Idempotent — guarded by status check.
 *
 * @param {string} depositId
 * @param {string} userId
 * @param {number} amountUsd  - USDC amount to credit
 */
async function creditDeposit(depositId, userId, amountUsd) {
  // Guard: only credit if still in an active bridge state (not already credited/failed)
  const updated = await BridgeDeposit.findOneAndUpdate(
    { _id: depositId, status: { $in: ['bridging', 'attesting', 'minting'] } },
    { status: 'credited', creditedAmount: amountUsd, creditedAt: new Date() },
    { new: true }
  );

  if (!updated) return; // already credited or in another state

  await User.findByIdAndUpdate(userId, { $inc: { balance: amountUsd } });
  console.log(`[Sweep] Deposit ${depositId} CREDITED — $${amountUsd.toFixed(2)} USDC to user ${userId}`);
}

module.exports = { processDeposit, creditDeposit, startBridgeCompletionPoller };
