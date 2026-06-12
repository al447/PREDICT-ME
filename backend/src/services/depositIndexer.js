/**
 * Automated Deposit Indexer — Phase 2
 *
 * Watches platform wallet for incoming transfers and auto-credits users.
 * Set INDEXER_ENABLED=true in .env to activate auto-indexing.
 *
 * For MVP fallback: users can still manually submit tx hashes via DepositModal.
 */

const { ethers } = require('ethers');
const PendingDeposit = require('../models/PendingDeposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const IndexerCursor = require('../models/IndexerCursor');
const UserPosition = require('../models/UserPosition');
const { getUsdPrice } = require('./priceFeed');

const enabled = () => process.env.INDEXER_ENABLED === 'true';

// Minimum confirmations before a deposit is credited (reorg protection).
// Lower default on testnets; override via env for mainnet (e.g. 12).
const MIN_CONFIRMATIONS = parseInt(process.env.DEPOSIT_MIN_CONFIRMATIONS, 10) || 3;

// Platform wallet to watch
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || process.env.EVM_DEPOSIT_ADDRESS;

// RPC endpoints — each chain gets a list of fallbacks tried in order.
// Primary is the env-var override; then free public endpoints are tried on rate-limit.
const RPC_FALLBACKS = {
  ethereum:       [ process.env.ETH_RPC, 'https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth' ].filter(Boolean),
  polygon:        [ process.env.POLYGON_RPC_URL, 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com', 'https://rpc.ankr.com/polygon' ].filter(Boolean),
  bsc:            [ process.env.BSC_RPC, 'https://bsc-rpc.publicnode.com', 'https://bsc.llamarpc.com', 'https://rpc.ankr.com/bsc' ].filter(Boolean),
  base:           [ process.env.BASE_RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com', 'https://rpc.ankr.com/base' ].filter(Boolean),
  arbitrum:       [ process.env.ARB_RPC, 'https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.llamarpc.com', 'https://rpc.ankr.com/arbitrum' ].filter(Boolean),
  sepolia:        [ process.env.SEPOLIA_RPC, 'https://ethereum-sepolia-rpc.publicnode.com' ].filter(Boolean),
  'polygon-amoy': [ process.env.POLYGON_AMOY_RPC_URL, 'https://polygon-amoy-bor-rpc.publicnode.com' ].filter(Boolean),
};

// Keep compat: single-URL map used by old callers
const RPC_URLS = Object.fromEntries(
  Object.entries(RPC_FALLBACKS).map(([k, v]) => [k, v[0]])
);

// Etherscan V2 unified API — one key works across multiple EVM chains
// (free tier covers Ethereum, Sepolia, Polygon, Polygon Amoy, Arbitrum)
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';

// Per-chain explorer config. mode='v2' uses Etherscan V2 unified API (free tier
// covers ETH/Sepolia/Polygon/Arbitrum). mode='rpc' uses direct RPC + eth_getLogs
// for ERC-20 plus per-block scanning for native (used on BSC/Base where Etherscan
// V2 free tier doesn't apply and the legacy V1 endpoints are deprecated).
const EXPLORERS = {
  ethereum:       { mode: 'v2',  chainId: 1 },
  sepolia:        { mode: 'v2',  chainId: 11155111 },
  polygon:        { mode: 'v2',  chainId: 137 },
  'polygon-amoy': { mode: 'v2',  chainId: 80002 },
  arbitrum:       { mode: 'v2',  chainId: 42161 },
  // maxNativeBlocks kept small: full-block RPC fetches are memory-heavy on Render 512MB.
  // Cron persistence ensures no deposits are missed across restarts.
  bsc:            { mode: 'rpc', maxNativeBlocks: 200 },   // ~10min @ 3s blocks
  base:           { mode: 'rpc', maxNativeBlocks: 300 },   // ~10min @ 2s blocks
};

// Backward-compat alias used elsewhere in this file.
const CHAIN_IDS = Object.fromEntries(
  Object.entries(EXPLORERS).filter(([, c]) => c.chainId).map(([k, c]) => [k, c.chainId])
);

// Token contracts per chain
const TOKEN_CONFIGS = {
  sepolia: {
    USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 },
  },
  'polygon-amoy': {
    USDC: { address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6 }, // Circle's official Amoy USDC
  },
  ethereum: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  },
  polygon: {
    USDC:  { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 }, // native Circle USDC
    USDCe: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 }, // bridged USDC.e
    USDT:  { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    DAI:   { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
  },
  bsc: {
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }, // BSC USDC = 18 decimals
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }, // BSC USDT = 18 decimals
    DAI:  { address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
    BUSD: { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
  },
  base: {
    USDC:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  },
  arbitrum: {
    USDC:  { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDCe: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
    USDT:  { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    DAI:   { address: '0xDA10009cbd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    ARB:   { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  },
};

// Helper to checksum addresses
const checksumAddress = (address) => {
  try {
    return ethers.getAddress(address);
  } catch {
    return address;
  }
};

// Native token symbols per chain (for native value transfers, not ERC-20)
const NATIVE_TOKENS = {
  ethereum: 'ETH',
  sepolia: 'ETH',
  polygon: 'MATIC',
  'polygon-amoy': 'MATIC',
  bsc: 'BNB',
  base: 'ETH',
  arbitrum: 'ETH',
};

// Max blocks to scan per pass (avoid heavy load on free RPC)
const MAX_BLOCK_RANGE = 50;

const _providers = {};
// Tracks which fallback index each chain is currently using
const _providerIndex = {};
// Tracks cooldown time (epoch ms) for each chain — skip scans while cooling down
const _rateLimitCooldown = {};
const _lastCheckedBlocks = {};

// How long to pause a chain after a 429 / SERVER_ERROR (ms): starts at 2 min, caps at 30 min
const RATE_LIMIT_BASE_MS  = 2 * 60 * 1000;
const RATE_LIMIT_MAX_MS   = 30 * 60 * 1000;
const _rateLimitStrike    = {}; // count consecutive failures per chain

function isRateLimitError(err) {
  const msg = (err?.message || '') + (err?.info?.responseBody || '') + (err?.info?.responseStatus || '');
  // Only treat as rate-limit if there is explicit 429 / rate-limit signal.
  // Do NOT flag generic SERVER_ERROR (e.g. ETIMEDOUT, ECONNREFUSED) as a rate-limit
  // because that would suppress real connectivity errors in the logs.
  return (
    msg.includes('429') ||
    msg.includes('Rate limit') ||
    msg.includes('Too Many Requests') ||
    msg.includes('exceeded maximum retry limit') ||
    msg.includes('rate limit')
  );
}

function markRateLimit(chain) {
  _rateLimitStrike[chain] = (_rateLimitStrike[chain] || 0) + 1;
  const backoff = Math.min(
    RATE_LIMIT_BASE_MS * Math.pow(2, _rateLimitStrike[chain] - 1),
    RATE_LIMIT_MAX_MS
  );
  _rateLimitCooldown[chain] = Date.now() + backoff;
  // Rotate to next fallback provider
  const urls = RPC_FALLBACKS[chain] || [];
  if (urls.length > 1) {
    _providerIndex[chain] = ((_providerIndex[chain] || 0) + 1) % urls.length;
    delete _providers[chain]; // force re-init on next getProvider call
  }
  console.warn(
    `[DepositIndexer] Rate limit on ${chain} (strike ${_rateLimitStrike[chain]}).` +
    ` Cooldown ${Math.round(backoff / 60000)}min. Rotating to fallback ${_providerIndex[chain] || 0}.`
  );
}

function clearRateLimit(chain) {
  if (_rateLimitStrike[chain]) {
    _rateLimitStrike[chain] = 0;
    console.log(`[DepositIndexer] ${chain} RPC recovered — rate limit cleared.`);
  }
}

function isOnCooldown(chain) {
  return _rateLimitCooldown[chain] && Date.now() < _rateLimitCooldown[chain];
}

const getProvider = (chain) => {
  if (_providers[chain]) return _providers[chain];
  const urls = RPC_FALLBACKS[chain];
  if (!urls?.length) throw new Error(`No RPC for chain: ${chain}`);
  const idx = _providerIndex[chain] || 0;
  const url = urls[idx] || urls[0];
  // batchMaxCount: 3 — full getBlock(n,true) responses are large; keep batches tiny
  // to avoid OOM on Render's 512 MB free tier.
  _providers[chain] = new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 3 });
  return _providers[chain];
};

/**
 * Find a user by wallet address (case-insensitive).
 * Checks both `walletAddress` and `linkedWallets` arrays if present.
 */
const findUserBySender = async (sender) => {
  const senderLower = sender.toLowerCase();
  // walletAddress is stored lowercase — exact match (no regex, avoids ReDoS surface)
  let user = await User.findOne({ walletAddress: senderLower });
  if (user) return user;
  // Optional: linked wallets array
  user = await User.findOne({ linkedWallets: senderLower });
  return user;
};

/**
 * Credit a deposit. Idempotent (checks for existing PendingDeposit).
 */
const creditDeposit = async ({ chain, token, txHash, sender, amount, blockNumber, confirmations, note }) => {
  const txHashLower = txHash.toLowerCase();
  const senderLower = sender.toLowerCase();

  // Reorg protection: require minimum confirmations before crediting.
  // If confirmations is undefined (caller couldn't compute), we proceed (best-effort).
  if (typeof confirmations === 'number' && confirmations < MIN_CONFIRMATIONS) {
    return { skipped: true, reason: 'insufficient_confirmations' };
  }

  // Skip if already processed
  const existing = await PendingDeposit.findOne({ txHash: txHashLower });
  if (existing) return { skipped: true, reason: 'already_processed' };

  // Find user by sender address
  const user = await findUserBySender(senderLower);
  if (!user) {
    // Log unmatched deposit so admin can manually credit later
    await PendingDeposit.create({
      user: null,
      chain,
      token,
      txHash: txHashLower,
      claimedAmountUsd: amount,
      sender: senderLower,
      status: 'pending',
      source: 'auto-indexer',
      notes: `Unmatched: no user has wallet ${senderLower}. Block ${blockNumber}.`,
    }).catch(() => {});
    console.log(`[DepositIndexer] ⚠️  No user matches sender ${senderLower}, tx: ${txHashLower}`);
    return { skipped: true, reason: 'no_user_match' };
  }

  // Skip native coin deposits (ETH/MATIC/BNB) — these need to go through the Bridge
  // UI which swaps them to USDC before crediting. Polymarket model: only USDC enters the account.
  const NATIVE_SYMBOLS = new Set(['ETH', 'MATIC', 'BNB', 'ARB', 'SOL']);
  if (NATIVE_SYMBOLS.has(token.toUpperCase())) {
    await PendingDeposit.create({
      user: user._id,
      chain,
      token,
      txHash: txHashLower,
      claimedAmountUsd: amount,
      sender: senderLower,
      status: 'pending',
      source: 'auto-indexer',
      notes: `Native ${token} deposit detected. User must use the Bridge tab to swap to USDC. Block ${blockNumber}.`,
    }).catch(() => {});
    console.log(`[DepositIndexer] ⚠️  Native ${token} deposit — flagged for manual bridge, tx: ${txHashLower}`);
    return { skipped: true, reason: 'native_token_needs_bridge' };
  }

  // Stablecoins credit 1:1 USD (USDC/USDT/DAI ≈ $1.00).
  // Matches Polymarket: platform only accepts USDC, no oracle-price risk on the credit path.
  const STABLE_TOKENS = new Set(['USDC', 'USDCE', 'USDT', 'DAI', 'BUSD']);
  let creditedAmountUsd;
  if (STABLE_TOKENS.has(token.toUpperCase().replace('.', ''))) {
    creditedAmountUsd = amount; // 1:1
  } else {
    const price = await getUsdPrice(token);
    creditedAmountUsd = price ? price * amount : null;
  }

  if (!creditedAmountUsd || creditedAmountUsd <= 0) {
    console.log(`[DepositIndexer] ⚠️  Could not get USD price for ${token}, tx: ${txHashLower}`);
    return { skipped: true, reason: 'no_price' };
  }

  // ── Non-custodial (on-chain) mode guard ───────────────────────────────────
  // When ONCHAIN_ENABLED=true the source of truth for User.balance is the user's
  // on-chain proxy USDC balance (balanceSyncService overwrites it every cycle).
  // These legacy custodial deposits land in PLATFORM_WALLET, NOT the user's proxy,
  // so a $inc here would be erased by the next sync (and would credit funds the
  // user can't actually trade). Record the deposit as pending for manual sweep
  // to the proxy instead of touching the chain-mirrored balance.
  if (process.env.ONCHAIN_ENABLED === 'true') {
    await PendingDeposit.create({
      user: user._id,
      chain,
      token,
      txHash: txHashLower,
      claimedAmountUsd: amount,
      creditedAmountUsd,
      sender: senderLower,
      status: 'pending',
      source: 'auto-indexer',
      reviewedAt: new Date(),
      notes: note || `On-chain mode: custodial deposit to platform wallet at block ${blockNumber}. Sweep to user proxy required before crediting (balance is chain-mirrored).`,
    }).catch(() => {});
    console.log(`[DepositIndexer] ⏸️  On-chain mode — recorded $${creditedAmountUsd.toFixed(2)} ${token} as pending (no balance $inc) for user ${user._id}, tx: ${txHashLower}`);
    return { skipped: true, reason: 'onchain_mode_pending_sweep', amountUsd: creditedAmountUsd, userId: user._id };
  }

  // Atomic credit: PendingDeposit (idempotency lock via unique txHash) + balance + audit
  // all in one transaction. A crash can never leave a deposit marked credited without
  // the matching balance increment, and a concurrent duplicate aborts on the unique index.
  const session = await PendingDeposit.startSession();
  let finalBalance = 0;
  try {
    await session.withTransaction(async () => {
      await PendingDeposit.create([{
        user: user._id,
        chain,
        token,
        txHash: txHashLower,
        claimedAmountUsd: amount,
        sender: senderLower,
        status: 'credited',
        creditedAmountUsd,
        source: 'auto-indexer',
        reviewedAt: new Date(),
        notes: note || `Auto-detected by indexer at block ${blockNumber}`,
      }], { session });

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $inc: { balance: creditedAmountUsd } },
        { new: true, session }
      );
      finalBalance = updatedUser?.balance ?? 0;

      await Transaction.create([{
        user: user._id,
        type: 'deposit',
        amount: creditedAmountUsd,
        balance: finalBalance,
        status: 'completed',
        metadata: { txHash: txHashLower },
      }], { session });
    });
  } catch (err) {
    // Duplicate txHash (concurrent scan) or transient failure — idempotent skip
    if (err.code === 11000) return { skipped: true, reason: 'already_processed' };
    console.error('[DepositIndexer] creditDeposit transaction failed:', err.message);
    return { skipped: true, reason: 'tx_error' };
  } finally {
    await session.endSession();
  }

  console.log(`[DepositIndexer] ✅ Auto-credited $${creditedAmountUsd.toFixed(2)} ${token} to user ${user._id}, tx: ${txHashLower}`);
  return { credited: true, amountUsd: creditedAmountUsd, userId: user._id };
};

/**
 * Fetch from Etherscan V2 unified API (used for chains in mode='v2').
 */
const etherscanV2 = async (chain, params) => {
  const cfg = EXPLORERS[chain];
  if (!cfg || cfg.mode !== 'v2') throw new Error(`Etherscan V2 not enabled for ${chain}`);
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error('ETHERSCAN_API_KEY not set');

  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set('chainid', String(cfg.chainId));
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const fetchFn = global.fetch || require('node-fetch');
  const res = await fetchFn(url.toString());
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === '0' && json.message !== 'No transactions found' && json.message !== 'OK') {
    if (typeof json.result === 'string') return [];
  }
  return Array.isArray(json.result) ? json.result : [];
};

/**
 * RPC fallback: scan ERC-20 Transfer events to platform wallet via eth_getLogs.
 */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPC_LOG_CHUNK = 5000; // Most public RPCs cap getLogs ranges around 5-10k blocks

const scanERC20ViaRpc = async (chain, fromBlock) => {
  const tokens = TOKEN_CONFIGS[chain] || {};
  if (!Object.keys(tokens).length) return;
  if (isOnCooldown(chain)) {
    console.log(`[DepositIndexer] ${chain} on rate-limit cooldown — skipping ERC20 scan`);
    return;
  }
  let provider, head;
  try {
    provider = getProvider(chain);
    head = await provider.getBlockNumber();
  } catch (err) {
    if (isRateLimitError(err)) { markRateLimit(chain); }
    else { console.error(`[DepositIndexer] getBlockNumber error (${chain}):`, err.message); }
    return;
  }
  const platformLower = PLATFORM_WALLET.toLowerCase();

  // topic2 = padded recipient address
  const recipientTopic = '0x' + platformLower.slice(2).padStart(64, '0');

  const tokenAddrs = Object.values(tokens).map(t => t.address);
  const contractMap = {};
  for (const [symbol, config] of Object.entries(tokens)) {
    contractMap[config.address.toLowerCase()] = { symbol, decimals: config.decimals };
  }

  for (let start = fromBlock; start <= head; start += RPC_LOG_CHUNK) {
    const end = Math.min(start + RPC_LOG_CHUNK - 1, head);
    let logs;
    try {
      logs = await provider.getLogs({
        fromBlock: start,
        toBlock: end,
        address: tokenAddrs,
        topics: [TRANSFER_TOPIC, null, recipientTopic],
      });
      clearRateLimit(chain);
    } catch (err) {
      if (isRateLimitError(err)) {
        markRateLimit(chain);
        console.warn(`[DepositIndexer] Rate limit on getLogs (${chain} ${start}-${end}) — aborting scan pass`);
        return;
      }
      console.error(`[DepositIndexer] getLogs error (${chain} ${start}-${end}):`, err.message);
      continue;
    }
    for (const log of logs) {
      const meta = contractMap[log.address.toLowerCase()];
      if (!meta) continue;
      const sender = '0x' + log.topics[1].slice(26);
      const amount = parseFloat(ethers.formatUnits(log.data, meta.decimals));
      await creditDeposit({
        chain,
        token: meta.symbol,
        txHash: log.transactionHash,
        sender,
        amount,
        blockNumber: Number(log.blockNumber),
        confirmations: head - Number(log.blockNumber),
        note: `Auto-detected ${meta.symbol} ERC-20 via RPC at block ${log.blockNumber}`,
      });
    }
  }
};

/**
 * RPC fallback: scan native transfers to platform wallet by iterating blocks
 * in parallel batches. Cap of `maxNativeBlocks` only applies on cold starts
 * to avoid runaway scans; persistent cursor + cron prevent missed deposits.
 */
// Parallel getBlock calls per batch. Kept at 3 because each full block with
// transactions can be 500 KB–2 MB of JSON; batching more than 3 at once on
// Render's 512 MB free-tier heap causes OOM during BSC/Base cold-start scans.
const NATIVE_BATCH_SIZE = 3;

const scanNativeViaRpc = async (chain, fromBlock) => {
  const nativeSymbol = NATIVE_TOKENS[chain];
  if (!nativeSymbol) return;
  if (isOnCooldown(chain)) {
    console.log(`[DepositIndexer] ${chain} on rate-limit cooldown — skipping native scan`);
    return;
  }
  const cfg = EXPLORERS[chain];
  let provider;
  let head;
  try {
    provider = getProvider(chain);
    head = await provider.getBlockNumber();
    clearRateLimit(chain);
  } catch (err) {
    if (isRateLimitError(err)) { markRateLimit(chain); }
    else { console.error(`[DepositIndexer] getBlockNumber error (${chain}):`, err.message); }
    return;
  }
  const platformLower = PLATFORM_WALLET.toLowerCase();

  const cap = cfg.maxNativeBlocks || 6000;
  const start = Math.max(fromBlock, head - cap);
  if (start > head) return;

  if (head - fromBlock > cap) {
    console.warn(`[DepositIndexer] ${chain} native scan window capped: ${head - fromBlock} > ${cap}; only scanning last ${cap} blocks`);
  }

  const total = head - start + 1;
  if (total > 500) {
    console.log(`[DepositIndexer] ${chain} native: scanning ${total} blocks (parallel batches of ${NATIVE_BATCH_SIZE})`);
  }

  let consecutiveErrors = 0;
  for (let batchStart = start; batchStart <= head; batchStart += NATIVE_BATCH_SIZE) {
    // Abort this scan pass if too many consecutive RPC errors (rate limited mid-scan)
    if (consecutiveErrors >= 3) {
      markRateLimit(chain);
      console.warn(`[DepositIndexer] ${chain} native scan aborted at block ${batchStart} — too many consecutive RPC errors`);
      return;
    }

    // Small delay between batches: lets GC reclaim memory + reduces RPC req rate
    if (batchStart > start) await new Promise(r => setTimeout(r, 150));

    const batchEnd = Math.min(batchStart + NATIVE_BATCH_SIZE - 1, head);

    // Use raw JSON-RPC instead of provider.getBlock() to avoid ethers.js v6
    // choking on OP-stack type-0x7e deposit txs which have nonce=null.
    const blocks = await Promise.all(
      Array.from({ length: batchEnd - batchStart + 1 }, async (_, i) => {
        const blockNum = batchStart + i;
        try {
          const raw = await provider.send('eth_getBlockByNumber', [
            '0x' + blockNum.toString(16),
            true,
          ]);
          consecutiveErrors = 0; // reset on success
          return raw ? { transactions: raw.transactions || [], blockNum } : null;
        } catch (err) {
          consecutiveErrors++;
          if (isRateLimitError(err)) {
            // Don't log every block — just count and abort
          } else {
            console.error(`[DepositIndexer] getBlock error (${chain} ${blockNum}):`, err.message);
          }
          return null;
        }
      })
    );

    // Collect candidate native transfers from this batch (without awaiting credit yet)
    const candidates = [];
    for (const entry of blocks) {
      if (!entry) continue;
      const { transactions, blockNum } = entry;
      for (const tx of transactions) {
        if (!tx || typeof tx === 'string') continue;
        // Skip OP-stack deposit txs (type 0x7e) — system txs, not real transfers
        if (tx.type === '0x7e') continue;
        if (!tx.to || tx.to.toLowerCase() !== platformLower) continue;
        const txValue = tx.value || '0x0';
        if (txValue === '0x0' || txValue === '0') continue;
        candidates.push({ tx: { hash: tx.hash, from: tx.from, to: tx.to, value: BigInt(txValue) }, blockNum });
      }
    }

    // Verify receipts in parallel (only for candidates — usually 0)
    if (candidates.length === 0) continue;
    const verified = await Promise.all(
      candidates.map(async ({ tx, blockNum }) => {
        try {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          if (!receipt || receipt.status !== 1) return null;
          return { tx, blockNum };
        } catch {
          return null;
        }
      })
    );

    for (const v of verified) {
      if (!v) continue;
      const { tx, blockNum } = v;
      const valBig = typeof tx.value === 'bigint' ? tx.value : BigInt(tx.value);
      const amount = parseFloat(ethers.formatEther(valBig));
      await creditDeposit({
        chain,
        token: nativeSymbol,
        txHash: tx.hash,
        sender: tx.from,
        amount,
        blockNumber: blockNum,
        confirmations: head - blockNum,
        note: `Auto-detected native ${nativeSymbol} via RPC at block ${blockNum}`,
      });
    }
  }
};

/**
 * Scan native ETH/MATIC transfers to platform wallet via Etherscan V2 API
 */
const scanNativeViaEtherscan = async (chain, fromBlock) => {
  const nativeSymbol = NATIVE_TOKENS[chain];
  if (!nativeSymbol) return;

  try {
    const txs = await etherscanV2(chain, {
      module: 'account',
      action: 'txlist',
      address: PLATFORM_WALLET,
      startblock: fromBlock,
      endblock: 99999999,
      sort: 'asc',
    });

    const platformLower = PLATFORM_WALLET.toLowerCase();
    for (const tx of txs) {
      // Only credit incoming transfers with value > 0 and successful execution
      if (!tx.to || tx.to.toLowerCase() !== platformLower) continue;
      if (!tx.value || tx.value === '0') continue;
      if (tx.isError === '1' || tx.txreceipt_status === '0') continue;

      const amount = parseFloat(ethers.formatEther(tx.value));
      await creditDeposit({
        chain,
        token: nativeSymbol,
        txHash: tx.hash,
        sender: tx.from,
        amount,
        blockNumber: parseInt(tx.blockNumber, 10),
        confirmations: tx.confirmations !== undefined ? parseInt(tx.confirmations, 10) : undefined,
        note: `Auto-detected native ${nativeSymbol} via Etherscan V2 at block ${tx.blockNumber}`,
      });
    }
  } catch (err) {
    console.error(`[DepositIndexer] Native scan error (${chain}):`, err.message);
  }
};

/**
 * Scan ERC-20 transfers to platform wallet via Etherscan V2 API
 */
const scanERC20ViaEtherscan = async (chain, fromBlock) => {
  const tokens = TOKEN_CONFIGS[chain] || {};
  if (!Object.keys(tokens).length) return;

  try {
    const transfers = await etherscanV2(chain, {
      module: 'account',
      action: 'tokentx',
      address: PLATFORM_WALLET,
      startblock: fromBlock,
      endblock: 99999999,
      sort: 'asc',
    });

    // Build map of contract address (lowercase) → { symbol, decimals }
    const contractMap = {};
    for (const [symbol, config] of Object.entries(tokens)) {
      contractMap[config.address.toLowerCase()] = { symbol, decimals: config.decimals };
    }

    const platformLower = PLATFORM_WALLET.toLowerCase();
    for (const t of transfers) {
      if (!t.to || t.to.toLowerCase() !== platformLower) continue;
      const meta = contractMap[t.contractAddress?.toLowerCase()];
      if (!meta) continue; // Unknown token

      const decimals = parseInt(t.tokenDecimal, 10) || meta.decimals;
      const amount = parseFloat(ethers.formatUnits(t.value, decimals));
      await creditDeposit({
        chain,
        token: meta.symbol,
        txHash: t.hash,
        sender: t.from,
        amount,
        blockNumber: parseInt(t.blockNumber, 10),
        confirmations: t.confirmations !== undefined ? parseInt(t.confirmations, 10) : undefined,
        note: `Auto-detected ${meta.symbol} ERC-20 via Etherscan V2 at block ${t.blockNumber}`,
      });
    }
  } catch (err) {
    console.error(`[DepositIndexer] ERC20 scan error (${chain}):`, err.message);
  }
};

/**
 * Scan chain for all transfers to platform wallet (native + ERC-20)
 * Uses Etherscan V2 API for reliable, fast detection across all EVM chains.
 */
const scanDeposits = async (chain, opts = {}) => {
  if (!PLATFORM_WALLET) {
    console.log('[DepositIndexer] PLATFORM_WALLET not configured');
    return;
  }

  if (!EXPLORERS[chain]) {
    console.warn(`[DepositIndexer] No explorer config for ${chain}, skipping`);
    return;
  }

  try {
    // Resolve the start block. Priority:
    //   1. explicit opts.fromBlock (used by rescan scripts)
    //   2. in-memory cursor (warm)
    //   3. persistent cursor in MongoDB (survives restarts)
    //   4. cold-start fallback: head - 1000
    let fromBlock = opts.fromBlock;
    if (fromBlock === undefined || fromBlock === null) {
      fromBlock = _lastCheckedBlocks[chain];
    }
    if (fromBlock === undefined || fromBlock === null) {
      try {
        const cursor = await IndexerCursor.findOne({ chain });
        if (cursor && typeof cursor.lastBlock === 'number') {
          fromBlock = cursor.lastBlock;
        }
      } catch (err) {
        console.warn(`[DepositIndexer] Cursor read failed for ${chain}:`, err.message);
      }
    }
    if (fromBlock === undefined || fromBlock === null) {
      try {
        const provider = getProvider(chain);
        const currentBlock = await provider.getBlockNumber();
        fromBlock = Math.max(0, currentBlock - 1000);
      } catch {
        fromBlock = 0;
      }
    }

    const cfg = EXPLORERS[chain];
    const mode = cfg.mode;
    console.log(`[DepositIndexer] Scanning ${chain} from block ${fromBlock} via ${mode === 'v2' ? 'Etherscan V2' : 'RPC'}`);

    if (mode === 'v2') {
      await Promise.all([
        scanNativeViaEtherscan(chain, fromBlock),
        scanERC20ViaEtherscan(chain, fromBlock),
      ]);
    } else if (mode === 'rpc') {
      await Promise.all([
        scanNativeViaRpc(chain, fromBlock),
        scanERC20ViaRpc(chain, fromBlock),
      ]);
    }

    // Persist cursor: track the latest block we've seen.
    // Subtract a small overlap so we re-check recent blocks (reorg safety).
    try {
      const provider = getProvider(chain);
      const head = await provider.getBlockNumber();
      const newCursor = Math.max(0, head - 5);
      _lastCheckedBlocks[chain] = newCursor;
      await IndexerCursor.findOneAndUpdate(
        { chain },
        { chain, lastBlock: newCursor, updatedAt: new Date() },
        { upsert: true, new: true }
      ).catch((err) => console.warn(`[DepositIndexer] Cursor persist failed (${chain}):`, err.message));
    } catch {
      _lastCheckedBlocks[chain] = fromBlock + 100;
    }
  } catch (err) {
    console.error(`[DepositIndexer] Error scanning ${chain}:`, err.message);
  }
};

/**
 * Start the indexer - runs every 30 seconds for testnet, 5 min for mainnet
 */
const start = () => {
  if (!enabled()) {
    console.log('[DepositIndexer] Auto-indexer disabled. Set INDEXER_ENABLED=true to activate.');
    return;
  }

  if (!PLATFORM_WALLET) {
    console.error('[DepositIndexer] Cannot start: PLATFORM_WALLET not configured');
    return;
  }

  console.log('[DepositIndexer] Starting auto-indexer...');
  console.log(`[DepositIndexer] Watching wallet: ${PLATFORM_WALLET}`);

  // Scan testnets frequently (30s), mainnets less often (5min)
  const TESTNETS = ['sepolia', 'polygon-amoy'];
  const MAINNETS = ['ethereum', 'polygon', 'bsc', 'base', 'arbitrum'];

  const safeScan = (chain) =>
    scanDeposits(chain).catch(err => console.error(`[DepositIndexer] scanDeposits(${chain}) unhandled error:`, err.message));

  TESTNETS.forEach(chain => {
    if (RPC_URLS[chain]) {
      setInterval(() => safeScan(chain), 30_000);
      safeScan(chain); // Initial scan
    }
  });

  // Base and BSC use direct RPC (no Etherscan V2) — scan less aggressively to
  // avoid hitting public RPC rate limits (publicnode: 1200 req/60s).
  const RPC_SCAN_CHAINS  = new Set(['bsc', 'base']);
  const FAST_INTERVAL_MS = 5 * 60_000;   // 5 min — Etherscan V2 chains
  const SLOW_INTERVAL_MS = 15 * 60_000;  // 15 min — direct RPC chains

  MAINNETS.forEach(chain => {
    if (RPC_URLS[chain]) {
      const interval = RPC_SCAN_CHAINS.has(chain) ? SLOW_INTERVAL_MS : FAST_INTERVAL_MS;
      setInterval(() => safeScan(chain), interval);
      // Stagger initial scan: RPC chains start after a 60 s delay to let the
      // Etherscan chains finish first and not burst all RPCs simultaneously.
      if (RPC_SCAN_CHAINS.has(chain)) {
        setTimeout(() => safeScan(chain), 60_000);
      } else {
        safeScan(chain);
      }
    }
  });

  // CTF ERC-1155 position indexer — scans Polygon Amoy every 60s
  // (Amoy is a testnet using a free public RPC; 60s is conservative enough to avoid 429s)
  if (process.env.CTF_ADDRESS) {
    setTimeout(() => {
      setInterval(() => scanCtfPositions().catch(err => console.error('[DepositIndexer] CTF scan error:', err.message)), 60_000);
      scanCtfPositions().catch(err => console.error('[DepositIndexer] CTF initial scan error:', err.message));
    }, 30_000); // 30s startup delay to stagger with mainnet chain scans
  }

  console.log('[DepositIndexer] Auto-indexer running');
};

/**
 * Manual resolution fallback - used by deposit controller
 */
const resolveDepositByTx = async ({ chain, txHash }) => {
  // Not used in auto-indexer mode - deposits are caught by scanning
  return null;
};

/**
 * Force re-scan a specific transaction (admin/debug tool)
 */
const rescanTransaction = async (chain, txHash) => {
  try {
    const provider = getProvider(chain);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) return { found: false, error: 'Transaction not found' };
    if (receipt.status !== 1) return { found: false, error: 'Transaction failed' };

    const tokens = TOKEN_CONFIGS[chain] || {};
    
    for (const [tokenSymbol, config] of Object.entries(tokens)) {
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const transferLog = receipt.logs.find(log => 
        log.address.toLowerCase() === config.address.toLowerCase() &&
        log.topics[0] === transferTopic &&
        log.topics[2]?.toLowerCase().includes(PLATFORM_WALLET.toLowerCase().slice(2))
      );

      if (transferLog) {
        const sender = '0x' + transferLog.topics[1].slice(26).toLowerCase();
        const amount = parseFloat(ethers.formatUnits(transferLog.data, config.decimals));
        
        return { found: true, sender, token: tokenSymbol, amount, chain };
      }
    }

    return { found: false, error: 'No matching transfer found' };
  } catch (err) {
    return { found: false, error: err.message };
  }
};

// ── CTF ERC-1155 Position Indexer ─────────────────────────────────────────────

const ERC1155_ABI = [
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
];

const CTF_POSITION_CURSOR_KEY = 'ctf-positions-amoy';

/**
 * Apply a single ERC-1155 transfer to UserPosition records.
 * Mints (from == 0x0) add to balance; burns (to == 0x0) subtract.
 */
async function _applyCtfTransfer({ from, to, tokenId, value, txHash, blockNumber }) {
  const tokenIdStr = tokenId.toString();
  const valueNum   = Number(ethers.formatUnits(value, 6)); // 6-decimal shares

  // Determine side from tokenId parity (convention: even = YES, odd = NO)
  const side = BigInt(tokenIdStr) % 2n === 0n ? 'YES' : 'NO';

  // Derive conditionId: tokenId encodes conditionId + index via CTF spec
  // tokenId = keccak256(conditionId, index) — we store the raw tokenId and
  // attempt a reverse lookup from the Market collection.
  const Market = require('../models/Market');
  const market = await Market.findOne({
    $or: [{ yesTokenId: tokenIdStr }, { noTokenId: tokenIdStr }],
  }).select('conditionId').lean();
  const conditionId = market?.conditionId || tokenIdStr;

  const findUser = async (addr) => {
    if (!addr || addr === ethers.ZeroAddress) return null;
    return User.findOne({ walletAddress: addr.toLowerCase() });
  };

  const [fromUser, toUser] = await Promise.all([findUser(from), findUser(to)]);

  const upsert = async (user, delta) => {
    if (!user) return;
    await UserPosition.findOneAndUpdate(
      { user: user._id, conditionId, tokenId: tokenIdStr },
      {
        $inc:  { balance: delta },
        $set:  { walletAddress: user.walletAddress, side, lastTxHash: txHash, lastBlock: blockNumber, syncedAt: new Date() },
        $setOnInsert: { user: user._id },
      },
      { upsert: true, new: true }
    );
  };

  await Promise.all([
    upsert(fromUser, -valueNum),
    upsert(toUser,   +valueNum),
  ]);
}

/**
 * Scan CTF ERC-1155 TransferSingle + TransferBatch events on Polygon Amoy.
 * Keeps a separate cursor under CTF_POSITION_CURSOR_KEY.
 */
const scanCtfPositions = async () => {
  if (!enabled()) return;

  const ctfAddress = process.env.CTF_ADDRESS;
  if (!ctfAddress) return;

  const chain = 'polygon-amoy';
  if (isOnCooldown(chain)) {
    console.log('[DepositIndexer] polygon-amoy on cooldown — skipping CTF scan');
    return;
  }

  let provider, head;
  try {
    provider = getProvider(chain);
    head = await provider.getBlockNumber();
    clearRateLimit(chain);
  } catch (err) {
    if (isRateLimitError(err)) { markRateLimit(chain); }
    else { console.error('[DepositIndexer] CTF position scan error:', err.message); }
    return;
  }

  let cursor = await IndexerCursor.findOne({ chain: CTF_POSITION_CURSOR_KEY });
  const fromBlock = cursor?.lastBlock ? cursor.lastBlock + 1 : Math.max(0, head - 1000);
  if (fromBlock > head) return;
  const toBlock = Math.min(head, fromBlock + MAX_BLOCK_RANGE - 1);

  const ctf = new ethers.Contract(ctfAddress, ERC1155_ABI, provider);

  try {
    const [singleEvents, batchEvents] = await Promise.all([
      ctf.queryFilter(ctf.filters.TransferSingle(), fromBlock, toBlock),
      ctf.queryFilter(ctf.filters.TransferBatch(), fromBlock, toBlock),
    ]);

    for (const ev of singleEvents) {
      const { from, to, id, value } = ev.args;
      await _applyCtfTransfer({ from, to, tokenId: id, value, txHash: ev.transactionHash, blockNumber: ev.blockNumber });
    }

    for (const ev of batchEvents) {
      const { from, to, ids, values } = ev.args;
      for (let i = 0; i < ids.length; i++) {
        await _applyCtfTransfer({ from, to, tokenId: ids[i], value: values[i], txHash: ev.transactionHash, blockNumber: ev.blockNumber });
      }
    }

    const newCursor = Math.max(0, toBlock - 5);
    await IndexerCursor.findOneAndUpdate(
      { chain: CTF_POSITION_CURSOR_KEY },
      { chain: CTF_POSITION_CURSOR_KEY, lastBlock: newCursor, updatedAt: new Date() },
      { upsert: true }
    );
  } catch (err) {
    console.error('[DepositIndexer] CTF position scan error:', err.message);
  }
};

module.exports = { enabled, start, resolveDepositByTx, rescanTransaction, scanDeposits, scanCtfPositions };
