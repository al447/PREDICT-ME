/**
 * withdrawService.js — Multi-chain withdrawal from user's Gnosis Safe → destination
 *
 * Enforces User.withdrawalLimits before executing.
 * Routes to the correct bridge provider based on destination chain type.
 */

const User = require('../models/User');
const BridgeWithdrawal = require('../models/BridgeWithdrawal');
const across    = require('./bridgeProviders/acrossProvider');
const cctp      = require('./bridgeProviders/cctpProvider');
const relay     = require('./bridgeProviders/relayProvider');
const debridge  = require('./bridgeProviders/debridgeProvider');

const MIN_WITHDRAW_USD   = parseFloat(process.env.BRIDGE_MIN_WITHDRAW_USD || '10');
const MAX_WITHDRAW_USD   = parseFloat(process.env.BRIDGE_MAX_WITHDRAW_USD || '100000');

/**
 * Get a withdrawal quote.
 * @param {object} params
 * @param {number} params.fromAmountUsdc - USDC amount to withdraw
 * @param {string} params.toChainType    - 'evm' | 'svm' | 'btc'
 * @param {number} params.toChainId      - EVM dest chain id (null for btc/svm)
 * @param {string} params.toToken        - destination token symbol
 * @param {string} params.recipientAddr  - destination wallet address
 */
async function getQuote({ fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr }) {
  validateAmount(fromAmountUsdc);

  const amountBase = Math.round(fromAmountUsdc * 1e6).toString();

  if (toChainType === 'evm') {
    const primary = await across.getQuote({
      fromChainId:  137,       // Polygon (Safe)
      inputToken:   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      outputToken:  resolveDestToken(toChainId, toToken),
      amount:       amountBase,
      recipient:    recipientAddr,
    });
    const fallback = await debridge.getQuote({
      fromChainId:      137,
      srcTokenAddress:  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      dstTokenAddress:  resolveDestToken(toChainId, toToken),
      srcTokenAmount:   amountBase,
      recipient:        recipientAddr,
    });
    return { primary, fallback };
  }

  if (toChainType === 'svm') {
    return { primary: cctp.getQuote({ amount: amountBase, recipient: recipientAddr }) };
  }

  if (toChainType === 'btc') {
    const relayQuote = await relay.getWithdrawQuote({ amountUsdc: fromAmountUsdc, btcRecipient: recipientAddr });
    return { primary: relayQuote };
  }

  throw new Error(`[Withdraw] Unsupported toChainType: ${toChainType}`);
}

/**
 * Execute a cross-chain bridge withdrawal.
 *
 * NON-CUSTODIAL FLOW (no operator-funded leak):
 *   1. Validate amount + limits + on-chain Safe balance.
 *   2. Debit the user's Safe by executing a USER-SIGNED USDC transfer
 *      (proxy → operator) on Polygon. The relayer pays gas; the user's Safe
 *      balance actually drops, so balanceSyncService stays truthful.
 *   3. Operator bridges its own USDC (now including the user's) to the
 *      destination chain.
 *   4. On bridge failure, the operator refunds USDC back to the user's Safe.
 *
 * The user MUST provide `userSignature` — the EIP-712 SafeTx signature for the
 * proxy→operator USDC transfer (obtained via /api/onchain/withdraw/prepare with
 * recipient = operator address). Without it we cannot debit the Safe and refuse.
 *
 * @param {string} userId
 * @param {object} params - getQuote params + { provider, userSignature }
 */
async function executeWithdrawal(userId, { fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr, provider = 'across', userSignature }) {
  validateAmount(fromAmountUsdc);

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const proxyAddress = user.smartWallet?.proxy;
  if (!proxyAddress) {
    throw new Error('[Withdraw] No smart wallet provisioned — deposit first.');
  }
  if (!userSignature) {
    throw new Error('[Withdraw] Missing signature. A signed Safe authorization is required to debit your wallet.');
  }

  // On-chain Safe balance is the source of truth
  const balSync = require('./balanceSyncService');
  const onchainBalance = await balSync.readOnchainBalance(proxyAddress);
  const effectiveBalance = onchainBalance !== null ? onchainBalance : (user.balance || 0);
  if (effectiveBalance < fromAmountUsdc) {
    throw new Error(`[Withdraw] Insufficient balance: have ${effectiveBalance.toFixed(2)}, need ${fromAmountUsdc}`);
  }

  // Enforce withdrawalLimits
  enforceWithdrawalLimits(user, fromAmountUsdc);

  // ── Step 1: Debit the Safe (proxy → operator) using the user's signature ──
  // This is the SAME signed Safe-transfer used by the same-chain withdrawal path.
  // The user's on-chain USDC actually moves to the operator, so there is no
  // operator-funded leak and the DB balance does not need a (sync-erasable) $inc.
  //
  // Gated on BRIDGE_SWEEP_ENABLED so the debit stays consistent with the bridge
  // step: in simulation/mock mode (sweep disabled) executeAsync does NOT perform a
  // real bridge, so we must NOT perform a real Safe debit either (otherwise the
  // user's funds would leave the Safe with nothing delivered to the destination).
  const sweepEnabled = process.env.BRIDGE_SWEEP_ENABLED === 'true';
  let safeDebitTxHash = null;
  if (sweepEnabled) {
    const { getOperatorAddress } = require('../config/contracts');
    const withdrawalService = require('./withdrawalService');
    const operatorAddress = getOperatorAddress();
    try {
      const debit = await withdrawalService.executeWithdrawal(
        proxyAddress,
        operatorAddress,
        fromAmountUsdc,
        userSignature,
      );
      safeDebitTxHash = debit?.txHash || null;
    } catch (err) {
      throw new Error(`[Withdraw] Safe debit failed: ${err.message}`);
    }
    // Reflect the on-chain debit in the cached balance immediately.
    balSync.syncUser(userId).catch(() => {});
  } else {
    console.warn(`[Withdraw] BRIDGE_SWEEP_ENABLED=false — simulating withdrawal of ${fromAmountUsdc} USDC (no Safe debit, no bridge) for user ${userId}`);
  }

  const record = await BridgeWithdrawal.create({
    userId,
    fromAmountUsdc,
    toChainId:    toChainId || null,
    toChainType,
    toToken,
    recipientAddr,
    provider,
    safeDebitTxHash,
    status: 'pending',
  });

  // Execute async (non-blocking). Funds are already at the operator.
  executeAsync(record._id.toString(), { toChainType, provider, fromAmountUsdc, toChainId, toToken, recipientAddr, userId, proxyAddress })
    .catch(err => console.error(`[Withdraw] Async execution failed for ${record._id}:`, err.message));

  return { withdrawalId: record._id, status: 'pending', safeDebitTxHash };
}

/**
 * Refund a failed bridge withdrawal: operator sends the USDC back to the user's
 * Safe (operator controls its own wallet, so no user signature is needed).
 */
async function refundToProxy(proxyAddress, fromAmountUsdc) {
  if (!proxyAddress) return null;
  if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
    console.warn(`[Withdraw] BRIDGE_SWEEP_ENABLED=false — skipping on-chain refund of ${fromAmountUsdc} to ${proxyAddress} (mock mode)`);
    return null;
  }
  const { ethers } = require('ethers');
  const { ADDRESSES, RPC_URL: POLYGON_RPC, getOperatorKey } = require('../config/contracts');
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
  const wallet = new ethers.Wallet(getOperatorKey(), provider);
  const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, ['function transfer(address to, uint256 amount) returns (bool)'], wallet);
  const amountBase = Math.round(fromAmountUsdc * 1e6);
  const tx = await usdc.transfer(proxyAddress, amountBase);
  const receipt = await tx.wait();
  console.log(`[Withdraw] Refunded ${fromAmountUsdc} USDC → proxy ${proxyAddress} tx=${receipt.hash}`);
  return receipt.hash;
}

async function executeAsync(withdrawalId, { toChainType, provider, fromAmountUsdc, toChainId, toToken, recipientAddr, userId, proxyAddress }) {
  try {
    await BridgeWithdrawal.findByIdAndUpdate(withdrawalId, { status: 'bridging' });

    let result;
    if (toChainType === 'evm') {
      if (provider === 'debridge') {
        const amountBase = Math.round(fromAmountUsdc * 1e6).toString();
        const quote = await debridge.getQuote({
          fromChainId: 137,
          srcTokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          dstTokenAddress: resolveDestToken(toChainId, toToken),
          srcTokenAmount:  amountBase,
          recipient:       recipientAddr,
        });
        result = await debridge.execute({ orderCalldata: quote.orderCalldata });
      } else {
        // Across: operator deposits USDC into the Polygon SpokePool → fills on dest chain
        const amountBase = Math.round(fromAmountUsdc * 1e6).toString();

        if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
          result = { provider: 'across', txHash: null, status: 'simulated' };
        } else {
          const { ethers } = require('ethers');
          const { RPC_URL: POLYGON_RPC, getOperatorKey } = require('../config/contracts');

          const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC);
          const wallet = new ethers.Wallet(getOperatorKey(), rpcProvider);

          const POLYGON_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
          const POLYGON_SPOKE_POOL = across.SPOKE_POOLS[137];
          if (!POLYGON_SPOKE_POOL) throw new Error('[Withdraw][Across] No SpokePool configured for Polygon (137)');

          // 1. Approve USDC to SpokePool (skip if already approved)
          const usdcAbi = [
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
          ];
          const usdc = new ethers.Contract(POLYGON_USDC, usdcAbi, wallet);
          const currentAllowance = await usdc.allowance(wallet.address, POLYGON_SPOKE_POOL);
          if (currentAllowance < BigInt(amountBase)) {
            await (await usdc.approve(POLYGON_SPOKE_POOL, ethers.MaxUint256)).wait();
          }

          // 2. Build and send SpokePool.deposit() to bridge USDC to destination chain
          const destToken = resolveDestToken(toChainId, toToken);
          const fillDeadline = Math.floor(Date.now() / 1000) + 21600; // +6 hours
          const quoteTimestamp = Math.floor(Date.now() / 1000);

          const spokePoolAbi = [
            'function deposit(address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes calldata message) external',
          ];
          const spokePool = new ethers.Contract(POLYGON_SPOKE_POOL, spokePoolAbi, wallet);

          const tx = await spokePool.deposit(
            recipientAddr,          // recipient on dest chain
            POLYGON_USDC,           // inputToken (Polygon USDC)
            destToken,              // outputToken on dest chain
            amountBase,             // inputAmount
            0,                      // outputAmount = 0 (relayer fills best-effort)
            toChainId,              // destinationChainId
            ethers.ZeroAddress,     // no exclusive relayer
            quoteTimestamp,
            fillDeadline,
            0,                      // no exclusivity deadline
            '0x',                   // no message
          );
          const receipt = await tx.wait();
          result = { provider: 'across', txHash: receipt.hash };
        }
      }
    } else if (toChainType === 'svm') {
      // CCTP reverse: burn USDC on Polygon → mint on Solana
      // For reverse, we need to burn from Polygon (domain 7) to Solana (domain 5)
      // The operator sends USDC from the Safe to the CCTP TokenMessenger on Polygon
      const { ethers } = require('ethers');
      const { CCTP_CONFIG, MESSAGE_TRANSMITTER_ABI, RPC_URL: POLYGON_RPC, getOperatorKey } = require('../config/contracts');

      if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
        result = { provider: 'cctp', txHash: null, status: 'simulated' };
      } else {
        // Build depositForBurn on Polygon TokenMessenger for Solana destination
        const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
        const wallet = new ethers.Wallet(getOperatorKey(), provider);
        const tokenMessengerAbi = [
          'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) external returns (uint64 nonce)',
        ];
        const tokenMessenger = new ethers.Contract(CCTP_CONFIG.polygonTokenMessenger, tokenMessengerAbi, wallet);

        // Pad Solana recipient (base58) to 32 bytes
        const { PublicKey } = require('@solana/web3.js');
        const recipientPubkey = new PublicKey(recipientAddr);
        const mintRecipient = '0x' + Buffer.from(recipientPubkey.toBytes()).toString('hex').padStart(64, '0');

        const amountBase = Math.round(fromAmountUsdc * 1e6);
        // Approve USDC spend first
        const usdcAbi = ['function approve(address spender, uint256 amount) external returns (bool)'];
        const usdc = new ethers.Contract(CCTP_CONFIG.polygonUsdc, usdcAbi, wallet);
        await (await usdc.approve(CCTP_CONFIG.polygonTokenMessenger, amountBase)).wait();

        const tx = await tokenMessenger.depositForBurn(
          amountBase,
          CCTP_CONFIG.solanaDomain, // 5
          mintRecipient,
          CCTP_CONFIG.polygonUsdc
        );
        const receipt = await tx.wait();
        result = { provider: 'cctp', txHash: receipt.hash };
      }
    } else if (toChainType === 'btc') {
      // Relay reverse: Polygon USDC → BTC
      if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
        result = { provider: 'relay', txHash: null, status: 'simulated' };
      } else {
        const withdrawal = await relay.createBtcWithdrawal({
          fromSafe:     null, // operator sends from Safe
          btcRecipient: recipientAddr,
          amountUsdc:   fromAmountUsdc,
        });
        // The operator needs to send USDC to Relay's Polygon deposit address
        // This is done via a standard ERC20 transfer
        const { ethers } = require('ethers');
        const { RPC_URL: POLYGON_RPC, getOperatorKey, RELAY_CONFIG: RC } = require('../config/contracts');
        const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
        const wallet = new ethers.Wallet(getOperatorKey(), provider);
        const usdcAbi = ['function transfer(address to, uint256 amount) external returns (bool)'];
        const polygonUsdc = RC?.polygonUsdc || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
        const usdc = new ethers.Contract(polygonUsdc, usdcAbi, wallet);
        const amountBase = Math.round(fromAmountUsdc * 1e6);
        const tx = await usdc.transfer(withdrawal.depositAddress, amountBase);
        const receipt = await tx.wait();
        result = { provider: 'relay', txHash: receipt.hash, relayRequestId: withdrawal.requestId };
      }
    }

    await BridgeWithdrawal.findByIdAndUpdate(withdrawalId, {
      status:  'completed',
      txHash:  result?.txHash || null,
    });
  } catch (err) {
    console.error(`[Withdraw] executeAsync ${withdrawalId} failed:`, err.message);
    // Refund on failure: the Safe was already debited (proxy → operator), so the
    // operator returns the USDC on-chain to the user's Safe. balanceSyncService
    // then reflects the restored balance. Do NOT $inc the DB balance (it would be
    // erased by the next sync and would not match the on-chain Safe balance).
    let refundTxHash = null;
    try {
      refundTxHash = await refundToProxy(proxyAddress, fromAmountUsdc);
      if (refundTxHash) {
        require('./balanceSyncService').syncUser(userId).catch(() => {});
      }
    } catch (refundErr) {
      console.error(`[Withdraw] On-chain refund FAILED for ${withdrawalId} (proxy ${proxyAddress}, $${fromAmountUsdc}):`, refundErr.message);
    }
    await BridgeWithdrawal.findByIdAndUpdate(withdrawalId, {
      status:       'failed',
      errorMessage: err.message,
      refundTxHash: refundTxHash || undefined,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateAmount(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) throw new Error('[Withdraw] Invalid amount');
  if (amount < MIN_WITHDRAW_USD) throw new Error(`[Withdraw] Minimum withdrawal is $${MIN_WITHDRAW_USD}`);
  if (amount > MAX_WITHDRAW_USD) throw new Error(`[Withdraw] Maximum withdrawal is $${MAX_WITHDRAW_USD}`);
}

function enforceWithdrawalLimits(user, amount) {
  const limits = user.withdrawalLimits;
  if (!limits) return;
  const now = Date.now();
  const dayMs  = 86400000;
  const weekMs = 604800000;

  if (limits.dailyLimit && limits.dailyUsed != null) {
    const dayReset = (limits.lastWithdrawAt?.getTime() || 0) + dayMs;
    const dailyUsed = now > dayReset ? 0 : (limits.dailyUsed || 0);
    if (dailyUsed + amount > limits.dailyLimit) {
      throw new Error(`[Withdraw] Daily limit exceeded (${dailyUsed + amount} > ${limits.dailyLimit})`);
    }
  }

  if (limits.weeklyLimit && limits.weeklyUsed != null) {
    const weekReset = (limits.weekResetAt?.getTime() || 0) + weekMs;
    const weeklyUsed = now > weekReset ? 0 : (limits.weeklyUsed || 0);
    if (weeklyUsed + amount > limits.weeklyLimit) {
      throw new Error(`[Withdraw] Weekly limit exceeded (${weeklyUsed + amount} > ${limits.weeklyLimit})`);
    }
  }
}

const USDC_DEST_BY_CHAIN = {
  1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

function resolveDestToken(chainId, token) {
  if (token === 'USDC' && USDC_DEST_BY_CHAIN[chainId]) return USDC_DEST_BY_CHAIN[chainId];
  throw new Error(`[Withdraw] Cannot resolve token ${token} on chain ${chainId}`);
}

// ── Withdrawal Completion Poller ──────────────────────────────────────────────

const POLL_MS = parseInt(process.env.WITHDRAWAL_POLL_MS || '60000');
let _pollerTimer = null;

async function pollPendingWithdrawals() {
  try {
    const pending = await BridgeWithdrawal.find({
      status: { $in: ['pending', 'bridging'] },
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // last 24h
    }).lean();

    if (pending.length === 0) return;

    for (const w of pending) {
      try {
        // Check if bridging has been too long (> 2 hours) — mark as requires_attention
        const age = Date.now() - new Date(w.createdAt).getTime();
        if (age > 2 * 60 * 60 * 1000 && w.status === 'bridging') {
          await BridgeWithdrawal.findByIdAndUpdate(w._id, {
            status: 'requires_attention',
            errorMessage: `Bridge has been pending for ${Math.round(age / 60000)} minutes`,
          });
          console.warn(`[Withdraw] Withdrawal ${w._id} stuck in bridging for ${Math.round(age / 60000)}min`);
        }

        // For completed Across withdrawals, verify tx on-chain
        if (w.txHash && w.provider === 'across') {
          const { ethers } = require('ethers');
          const rpcUrl = w.toChainId === 137
            ? (process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com')
            : (process.env.ETH_RPC_URL || 'https://eth.llamarpc.com');
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const receipt = await provider.getTransactionReceipt(w.txHash).catch(() => null);
          if (receipt && receipt.status === 1) {
            await BridgeWithdrawal.findByIdAndUpdate(w._id, { status: 'completed' });

            // Notify user
            try {
              const notificationService = require('./notificationService');
              await notificationService.withdrawalProcessed(w.userId, { _id: w._id, amount: w.fromAmountUsdc });
            } catch {}
          }
        }
      } catch (err) {
        console.error(`[Withdraw] Poll check failed for ${w._id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[Withdraw] pollPendingWithdrawals error:', err.message);
  }
}

function startWithdrawalPoller() {
  if (_pollerTimer) return;
  _pollerTimer = setInterval(() => {
    pollPendingWithdrawals().catch(err => console.error('[Withdraw] Poller error:', err.message));
  }, POLL_MS);
  console.log(`[Withdraw] Completion poller started (${POLL_MS}ms interval)`);
}

function stopWithdrawalPoller() {
  if (_pollerTimer) { clearInterval(_pollerTimer); _pollerTimer = null; }
}

module.exports = { getQuote, executeWithdrawal, startWithdrawalPoller, stopWithdrawalPoller };
