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
const { getUsdPrice } = require('./priceFeed');

const enabled = () => process.env.INDEXER_ENABLED === 'true';

// Minimum confirmations before a deposit is credited (reorg protection).
// Lower default on testnets; override via env for mainnet (e.g. 12).
const MIN_CONFIRMATIONS = parseInt(process.env.DEPOSIT_MIN_CONFIRMATIONS, 10) || 3;

// Platform wallet to watch
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || process.env.EVM_DEPOSIT_ADDRESS;

// RPC endpoints
const RPC_URLS = {
  ethereum: process.env.ETH_RPC || 'https://ethereum-rpc.publicnode.com',
  polygon: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  bsc: process.env.BSC_RPC || 'https://bsc-rpc.publicnode.com',
  base: process.env.BASE_RPC || 'https://mainnet.base.org',
  arbitrum: process.env.ARB_RPC || 'https://arbitrum-one-rpc.publicnode.com',
  sepolia: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
  'polygon-amoy': process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com',
};

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
const _lastCheckedBlocks = {};

const getProvider = (chain) => {
  if (_providers[chain]) return _providers[chain];
  const url = RPC_URLS[chain];
  if (!url) throw new Error(`No RPC for chain: ${chain}`);
  // Cap ethers' JSON-RPC batching at 10 calls/HTTP request. Base's public RPC
  // rejects batches >10 with -32014; this is also a safe default for other
  // public RPCs. Ethers transparently splits concurrent calls across multiple
  // HTTP requests when the limit is hit.
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

  // Calculate USD value
  const price = await getUsdPrice(token);
  const creditedAmountUsd = price ? price * amount : null;

  if (!creditedAmountUsd || creditedAmountUsd <= 0) {
    console.log(`[DepositIndexer] ⚠️  Could not get USD price for ${token}, tx: ${txHashLower}`);
    return { skipped: true, reason: 'no_price' };
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
  const provider = getProvider(chain);
  const head = await provider.getBlockNumber();
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
    } catch (err) {
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
  const cfg = EXPLORERS[chain];
  const provider = getProvider(chain);
  const head = await provider.getBlockNumber();
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

  for (let batchStart = start; batchStart <= head; batchStart += NATIVE_BATCH_SIZE) {
    // Small delay between batches: lets GC reclaim memory from previous batch
    // before new full-block JSON responses arrive. Critical on Render 512MB.
    if (batchStart > start) await new Promise(r => setTimeout(r, 100));

    const batchEnd = Math.min(batchStart + NATIVE_BATCH_SIZE - 1, head);
    const blocks = await Promise.all(
      Array.from({ length: batchEnd - batchStart + 1 }, (_, i) =>
        provider.getBlock(batchStart + i, true).catch((err) => {
          console.error(`[DepositIndexer] getBlock error (${chain} ${batchStart + i}):`, err.message);
          return null;
        })
      )
    );

    // Collect candidate native transfers from this batch (without awaiting credit yet)
    const candidates = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const blockNum = batchStart + i;
      if (!block || !block.transactions) continue;
      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue;
        if (!tx.to || tx.to.toLowerCase() !== platformLower) continue;
        if (!tx.value || tx.value === 0n || tx.value === '0x0') continue;
        candidates.push({ tx, blockNum });
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

  TESTNETS.forEach(chain => {
    if (RPC_URLS[chain]) {
      setInterval(() => scanDeposits(chain), 30_000);
      scanDeposits(chain); // Initial scan
    }
  });

  MAINNETS.forEach(chain => {
    if (RPC_URLS[chain]) {
      setInterval(() => scanDeposits(chain), 5 * 60_000);
      scanDeposits(chain);
    }
  });

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

module.exports = { enabled, start, resolveDepositByTx, rescanTransaction, scanDeposits };
