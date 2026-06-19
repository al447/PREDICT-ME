/**
 * depositWatcherService.js — Per-user intake address watcher
 *
 * Monitors all per-user HD-derived intake addresses across EVM, Solana, and Bitcoin
 * for incoming deposits. On detection:
 *   1. Creates a BridgeDeposit(detected) record (idempotent on sourceTxHash).
 *   2. Enqueues sweepService.processDeposit().
 *
 * Controlled by:
 *   BRIDGE_WATCHER_ENABLED=true  — start the watcher on server boot
 *   BRIDGE_SWEEP_ENABLED=true    — enable real sweeps (otherwise mock)
 *
 * Architecture mirrors proxyDepositWatcher.js but for the per-user model.
 */

const { ethers } = require('ethers');
const axios = require('axios');
const User = require('../models/User');
const BridgeDeposit = require('../models/BridgeDeposit');
const { processDeposit } = require('./sweepService');

// ── Config ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS  = parseInt(process.env.BRIDGE_WATCHER_POLL_MS  || '30000');  // 30 s
const BTC_POLL_INTERVAL = parseInt(process.env.BRIDGE_WATCHER_BTC_POLL || '60000');  // 60 s

// Max blocks per getLogs request per chain — public RPCs enforce hard limits.
// BSC public: ~272 blocks. Others are more generous but cap conservatively.
const MAX_BLOCKS_PER_QUERY = {
  1:     2000,  // Ethereum
  // BSC removed — Across SpokePool not available, sweeps would fail
  137:   2000,  // Polygon
  8453:  2000,  // Base
  42161: 2000,  // Arbitrum
  10:    2000,  // Optimism
  // Avalanche removed — not in Polymarket's supported chains
  11155111: 2000, // Sepolia
};
const DEFAULT_MAX_BLOCKS = 500; // fallback for unlisted chains

// How many blocks back to start from on first boot (avoids huge catchup queries).
// At 3s/block on BSC: 600 blocks ≈ 30 minutes of history.
const STARTUP_LOOKBACK_BLOCKS = {
  1:     150,   // ~30 min at 12s/block
  56:    600,   // ~30 min at 3s/block
  137:   900,   // ~30 min at 2s/block
  8453:  900,
  42161: 7200,  // ~30 min at 0.25s/block
  10:    900,
  43114: 900,
  11155111: 150,
};
const DEFAULT_LOOKBACK = 300;

const USDC_BY_CHAIN = {
  1:     { addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', rpcs: [process.env.ETH_RPC_URL,    'https://ethereum-rpc.publicnode.com',           'https://eth.llamarpc.com',             'https://rpc.ankr.com/eth'       ].filter(Boolean) },
  8453:  { addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpcs: [process.env.BASE_RPC_URL,   'https://mainnet.base.org',                      'https://base.llamarpc.com',            'https://rpc.ankr.com/base'      ].filter(Boolean) },
  42161: { addr: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', rpcs: [process.env.ARB_RPC_URL,    'https://arb1.arbitrum.io/rpc',                  'https://arbitrum-one-rpc.publicnode.com', 'https://rpc.ankr.com/arbitrum'  ].filter(Boolean) },
  10:    { addr: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', rpcs: [process.env.OP_RPC_URL,     'https://mainnet.optimism.io',                   'https://optimism.llamarpc.com',        'https://rpc.ankr.com/optimism'  ].filter(Boolean) },
  // Avalanche removed — no Across SpokePool for sweep
  137:   { addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', rpcs: [process.env.POLYGON_RPC_URL, 'https://polygon-bor-rpc.publicnode.com',         'https://polygon.llamarpc.com',         'https://rpc.ankr.com/polygon'   ].filter(Boolean) },
  // BSC removed — no Across SpokePool available for sweep
};

// Testnet chains removed — mainnet only

const SOLANA_RPC  = process.env.SOLANA_RPC_URL  || 'https://api.mainnet-beta.solana.com';
const BTC_API_URL = process.env.BTC_API_URL     || 'https://mempool.space/api';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // mainnet

let _running = false;

// ── Entry point ───────────────────────────────────────────────────────────────

async function start() {
  if (_running) return;
  _running = true;
  console.log('[DepositWatcher] Starting per-user intake address watchers');

  // Launch EVM watchers per chain (mainnet)
  for (const [chainId] of Object.entries(USDC_BY_CHAIN)) {
    watchEvmChain(parseInt(chainId)).catch(err =>
      console.error(`[DepositWatcher][EVM:${chainId}] Fatal error:`, err.message)
    );
  }

  // Testnet watchers removed — mainnet only

  // Solana watcher
  watchSolana().catch(err =>
    console.error('[DepositWatcher][Solana] Fatal error:', err.message)
  );

  // Bitcoin watcher (Relay deposit address polling)
  watchBtcRelay().catch(err =>
    console.error('[DepositWatcher][BTC-Relay] Fatal error:', err.message)
  );
}

// ── EVM watcher ───────────────────────────────────────────────────────────────

function isTransientRpcError(err) {
  const msg = (err?.message || '') + (err?.info?.responseBody || '') + (err?.info?.responseStatus || '');
  return (
    msg.includes('500') ||
    msg.includes('SERVER_ERROR') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('Rate limit') ||
    msg.includes('Too Many Requests') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET')
  );
}

async function watchEvmChain(chainId) {
  const chainConfig = USDC_BY_CHAIN[chainId];
  if (!chainConfig) {
    console.error(`[DepositWatcher][EVM:${chainId}] No chain config found`);
    return;
  }
  const { addr: usdcAddr, rpcs } = chainConfig;
  const { createProvider } = require('../config/contracts');
  let rpcIndex = 0;
  let provider = createProvider(rpcs[rpcIndex], chainId);
  const erc20Iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);

  const currentBlockOnStart = await provider.getBlockNumber();
  const lookback = STARTUP_LOOKBACK_BLOCKS[chainId] ?? DEFAULT_LOOKBACK;
  let lastBlock = currentBlockOnStart - lookback;
  console.log(`[DepositWatcher][EVM:${chainId}] Starting from block ${lastBlock} (lookback ${lookback} blocks)`);

  while (_running) {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Build address→user map for this poll cycle
      const addrMap = await buildEvmAddressMap();
      if (addrMap.size === 0) {
        lastBlock = currentBlock; // advance so blocks don't accumulate when no users exist
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Query Transfer events in chunks to respect RPC getLogs block-range limits.
      const maxChunk = MAX_BLOCKS_PER_QUERY[chainId] ?? DEFAULT_MAX_BLOCKS;
      const topics = [
        ethers.id('Transfer(address,address,uint256)'),
        null,
        [...addrMap.keys()].map(a => ethers.zeroPadValue(a.toLowerCase(), 32)),
      ];

      // Fetch all chunks — if ANY chunk fails we throw so lastBlock is NOT advanced
      // and the entire range is retried next poll cycle (idempotent via sourceTxHash).
      let chunkFrom = lastBlock + 1;
      const logs = [];
      while (chunkFrom <= currentBlock) {
        const chunkTo = Math.min(chunkFrom + maxChunk - 1, currentBlock);
        const chunk = await provider.getLogs({
          address:   usdcAddr,
          fromBlock: chunkFrom,
          toBlock:   chunkTo,
          topics,
        });
        logs.push(...chunk);
        chunkFrom = chunkTo + 1;
        if (chunkFrom <= currentBlock) await sleep(200); // brief pause between chunks
      }

      // All chunks succeeded — process logs then advance lastBlock.
      // lastBlock is only updated here, AFTER all getLogs calls complete,
      // so a mid-loop RPC error causes a full retry next poll (no blocks skipped).
      for (const log of logs) {
        const parsed = erc20Iface.parseLog(log);
        const toAddr  = parsed.args.to.toLowerCase();
        const user    = addrMap.get(toAddr);
        if (!user) continue;

        const amount = Number(ethers.formatUnits(parsed.args.value, 6));
        if (amount < (parseFloat(process.env.BRIDGE_MIN_DEPOSIT_USD || '1'))) continue;

        await onDepositDetected({
          userId:        user._id,
          chainType:     'evm',
          sourceChainId: chainId,
          sourceToken:   'USDC',
          sourceAmount:  amount,
          sourceTxHash:  log.transactionHash.toLowerCase(),
          intakeAddress: toAddr,
        });
      }

      lastBlock = currentBlock; // advance only after full success
    } catch (err) {
      // lastBlock is NOT updated on error — next poll retries the same range.
      // onDepositDetected is idempotent (deduped by sourceTxHash) so re-processing
      // already-seen logs on retry is safe.
      if (isTransientRpcError(err) && rpcs.length > 1) {
        rpcIndex = (rpcIndex + 1) % rpcs.length;
        provider = createProvider(rpcs[rpcIndex], chainId);
        console.warn(`[DepositWatcher][EVM:${chainId}] Transient RPC error — rotated to fallback ${rpcIndex} (${rpcs[rpcIndex]})`);
      } else {
        console.error(`[DepositWatcher][EVM:${chainId}] Poll error (will retry same range):`, err.message);
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function buildEvmAddressMap() {
  const users = await User.find(
    { 'depositAddresses.evm': { $exists: true, $ne: null } },
    { _id: 1, 'depositAddresses.evm': 1, 'smartWallet.proxy': 1 }
  ).lean();

  const map = new Map();
  for (const u of users) {
    if (u.depositAddresses?.evm) {
      map.set(u.depositAddresses.evm.toLowerCase(), u);
    }
  }
  return map;
}

// ── Solana watcher ────────────────────────────────────────────────────────────

async function watchSolana() {
  const seenSigs = new Set();
  console.log('[DepositWatcher][Solana] Starting');

  while (_running) {
    try {
      const users = await User.find(
        { 'depositAddresses.solana': { $exists: true, $ne: null } },
        { _id: 1, 'depositAddresses.solana': 1 }
      ).lean();

      for (const user of users) {
        const addr = user.depositAddresses.solana;
        try {
          const { data } = await axios.post(
            SOLANA_RPC,
            { jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [addr, { limit: 10 }] },
            { timeout: 10000 }
          );

          for (const sig of data?.result || []) {
            if (seenSigs.has(sig.signature)) continue;
            seenSigs.add(sig.signature);

            // Fetch tx to confirm token + amount
            const txData = await axios.post(
              SOLANA_RPC,
              { jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }] },
              { timeout: 10000 }
            );

            const amount = parseSolanaUSDCAmount(txData.data?.result, addr);
            if (!amount) continue;

            await onDepositDetected({
              userId:        user._id,
              chainType:     'svm',
              sourceChainId: null,
              sourceToken:   'USDC',
              sourceAmount:  amount,
              sourceTxHash:  sig.signature.toLowerCase(),
              intakeAddress: addr,
            });
          }
        } catch (err) {
          console.error(`[DepositWatcher][Solana] User ${user._id} error:`, err.message);
        }
      }
    } catch (err) {
      console.error('[DepositWatcher][Solana] Poll error:', err.message);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function parseSolanaUSDCAmount(tx, toAddr) {
  if (!tx?.meta?.postTokenBalances) return null;
  for (const bal of tx.meta.postTokenBalances) {
    if (bal.mint === SOLANA_USDC && bal.owner === toAddr) {
      const pre  = tx.meta.preTokenBalances?.find(b => b.accountIndex === bal.accountIndex)?.uiTokenAmount?.uiAmount || 0;
      const post = bal.uiTokenAmount?.uiAmount || 0;
      const diff = post - pre;
      return diff > 0 ? diff : null;
    }
  }
  return null;
}

// ── Bitcoin watcher (Relay deposit address) ──────────────────────────────────

const RELAY_WATCHER_POLL_MS = parseInt(process.env.RELAY_WATCHER_POLL_MS || '30000');
const SWEEP_ENABLED = process.env.BRIDGE_SWEEP_ENABLED === 'true';

async function watchBtcRelay() {
  const seenRelayIds = new Set();
  console.log('[DepositWatcher][BTC-Relay] Starting');

  // Pre-load already-processed relay request IDs to avoid re-creating on restart
  try {
    const existing = await BridgeDeposit.find(
      { chainType: 'btc', relayRequestId: { $ne: null } },
      { relayRequestId: 1 }
    ).lean();
    for (const dep of existing) seenRelayIds.add(dep.relayRequestId);
    console.log(`[DepositWatcher][BTC-Relay] Pre-loaded ${seenRelayIds.size} known relay request IDs`);
  } catch (err) {
    console.warn('[DepositWatcher][BTC-Relay] Failed to pre-load relay IDs:', err.message);
  }

  while (_running) {
    if (!SWEEP_ENABLED) {
      // Mock mode: no external Relay calls
      await sleep(RELAY_WATCHER_POLL_MS);
      continue;
    }

    try {
      const users = await User.find(
        { 'depositAddresses.btc': { $exists: true, $ne: null } },
        { _id: 1, 'depositAddresses.btc': 1, 'smartWallet.proxy': 1 }
      ).lean();

      for (const user of users) {
        const addr = user.depositAddresses.btc;
        // Skip mock addresses
        if (!addr || addr.startsWith('bc1q-mock')) continue;

        try {
          const relayProvider = require('./bridgeProviders/relayProvider');
          const requests = await relayProvider.getRequestsByDepositAddress(addr);

          for (const req of requests) {
            if (!req.requestId || seenRelayIds.has(req.requestId)) continue;
            seenRelayIds.add(req.requestId);

            // Only process successful fills (Relay has already confirmed + swapped)
            if (req.status !== 'success') {
              // Track refunds/failures for logging but don't create deposits
              if (req.status === 'refund' || req.status === 'failure') {
                console.log(`[DepositWatcher][BTC-Relay] Request ${req.requestId} status: ${req.status} — skipping`);
              }
              continue;
            }

            // Create BridgeDeposit — Relay has already bridged, go straight to 'bridging'
            // (completion poller will finalize with creditDeposit)
            await onRelayDepositDetected({
              userId:             user._id,
              relayRequestId:     req.requestId,
              relayDepositAddress:addr,
              sourceAmount:       req.inAmountBtc || 0,
              outAmountUsdc:      req.outAmountUsdc || 0,
              inTxHash:           req.inTxHash,
              outTxHash:          req.outTxHash,
              intakeAddress:      addr,
            });
          }
        } catch (err) {
          console.error(`[DepositWatcher][BTC-Relay] User ${user._id} error:`, err.message);
        }
      }
    } catch (err) {
      console.error('[DepositWatcher][BTC-Relay] Poll error:', err.message);
    }

    await sleep(RELAY_WATCHER_POLL_MS);
  }
}

/**
 * Handle a Relay BTC deposit detection.
 * Relay has already confirmed + swapped — we just need to create the BridgeDeposit
 * and let the completion poller credit the user.
 */
async function onRelayDepositDetected(params) {
  const { relayRequestId } = params;
  try {
    // Idempotent: check by relayRequestId
    const existing = await BridgeDeposit.findOne({ relayRequestId });
    if (existing) return;

    const deposit = await BridgeDeposit.create({
      userId:              params.userId,
      chainType:           'btc',
      sourceChainId:       null,
      sourceToken:         'BTC',
      sourceAmount:        params.sourceAmount,
      sourceTxHash:        relayRequestId.toLowerCase(), // use requestId as sourceTxHash for sparse-unique
      intakeAddress:       params.intakeAddress,
      status:              'bridging',
      bridgeProvider:      'relay',
      bridgeTxHash:        params.inTxHash || null,
      outboundTxHash:      params.outTxHash || null,
      relayRequestId:      relayRequestId,
      relayDepositAddress: params.relayDepositAddress,
    });

    console.log(`[DepositWatcher][BTC-Relay] Detected deposit ${deposit._id} — ${params.sourceAmount} BTC, relay request: ${relayRequestId}`);

    // Don't enqueue processDeposit — Relay already handled the sweep + bridge.
    // The completion poller will credit based on Relay's actual USDC output.
  } catch (err) {
    if (err.code === 11000) return; // duplicate key — already handled
    console.error('[DepositWatcher][BTC-Relay] onRelayDepositDetected error:', err.message);
  }
}

// ── Shared detection handler ──────────────────────────────────────────────────

async function onDepositDetected(params) {
  const { sourceTxHash } = params;
  try {
    // Idempotent upsert — only creates if sourceTxHash is new
    const existing = await BridgeDeposit.findOne({ sourceTxHash });
    if (existing) return; // already processed

    const deposit = await BridgeDeposit.create(params);
    console.log(`[DepositWatcher] Detected deposit ${deposit._id} — ${params.sourceAmount} ${params.sourceToken} (${params.chainType})`);

    // Enqueue sweep
    setImmediate(() => processDeposit(deposit._id.toString()));
  } catch (err) {
    if (err.code === 11000) return; // duplicate key — already handled
    console.error('[DepositWatcher] onDepositDetected error:', err.message);
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stop() {
  _running = false;
}

module.exports = { start, stop };
