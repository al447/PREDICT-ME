/**
 * proxyDepositWatcher.js — Per-user proxy wallet deposit watcher (Phase 3)
 *
 * Watches Polygon Amoy for USDC transfers TO any user's proxy wallet address.
 * On confirmation: triggers balanceSyncService.syncUser + ensures proxy has
 * approved the CTFExchange (gasless via relayer).
 *
 * Why a separate service (not modifying depositIndexer):
 *   - depositIndexer watches one platform wallet across many chains (multi-chain legacy).
 *   - proxyDepositWatcher watches MANY per-user addresses on ONE chain (Amoy / Polygon).
 *   - Two different indexing patterns → separate services.
 *
 * Env:
 *   PROXY_DEPOSIT_WATCHER_ENABLED — 'true' to activate (default: same as ONCHAIN_ENABLED)
 *   PROXY_DEPOSIT_POLL_MS         — polling interval (default 15000 = 15s)
 *   DEPOSIT_MIN_CONFIRMATIONS     — blocks before crediting (default 3)
 */

const { ethers } = require('ethers');
const User = require('../models/User');
const balanceSyncService = require('./balanceSyncService');
const walletService = require('./walletService');
const { ADDRESSES, ABIS, RPC_URL, getPolygonProvider } = require('../config/contracts');

const POLL_MS      = parseInt(process.env.PROXY_DEPOSIT_POLL_MS || '15000', 10);
const MIN_CONF     = parseInt(process.env.DEPOSIT_MIN_CONFIRMATIONS || '3', 10);
const USDC_ADDRESS = ADDRESSES.USDC;

// ERC-20 Transfer event topic
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

let _provider   = null;
let _pollTimer  = null;
let _lastBlock  = 0;

function getProvider() {
  if (!_provider) _provider = getPolygonProvider();
  return _provider;
}

function enabled() {
  return (
    process.env.PROXY_DEPOSIT_WATCHER_ENABLED === 'true' ||
    (process.env.ONCHAIN_ENABLED === 'true' && process.env.PROXY_DEPOSIT_WATCHER_ENABLED !== 'false')
  );
}

/**
 * Build a map of lowercase proxy address → User doc for all provisioned users.
 */
async function buildProxyMap() {
  const users = await User.find({ 'smartWallet.proxy': { $ne: null } })
    .select('_id smartWallet balance authProvider')
    .lean();
  const map = new Map();
  for (const u of users) {
    map.set(u.smartWallet.proxy.toLowerCase(), u);
  }
  return map;
}

/**
 * Scan one block range for USDC Transfer events to any known proxy address.
 */
async function scanRange(fromBlock, toBlock, proxyMap) {
  if (fromBlock > toBlock) return;
  const provider = getProvider();

  let logs;
  try {
    logs = await provider.getLogs({
      address:   USDC_ADDRESS,
      topics:    [TRANSFER_TOPIC],
      fromBlock,
      toBlock,
    });
  } catch (err) {
    console.warn(`[ProxyWatcher] getLogs(${fromBlock}-${toBlock}) failed: ${err.message}`);
    return;
  }

  for (const log of logs) {
    // topic[2] = padded recipient address
    if (!log.topics[2]) continue;
    const recipient = '0x' + log.topics[2].slice(26).toLowerCase();

    const user = proxyMap.get(recipient);
    if (!user) continue;

    const amount = Number(BigInt(log.data)) / 1e6;
    console.log(`[ProxyWatcher] USDC deposit detected: ${amount.toFixed(2)} USDC → proxy ${recipient} (user ${user._id})`);

    try {
      // Wait for MIN_CONF before syncing (re-check via syncing after brief settle)
      const syncResult = await balanceSyncService.syncUser(user);
      console.log(`[ProxyWatcher] Balance synced for user ${user._id}: ${syncResult.onchainBalance} USDC`);

      // Ensure proxy has approved exchange (returns calldata or null if already approved)
      const approvalCalldata = await walletService.ensureProxyExchangeApproval(recipient);
      if (approvalCalldata) {
        console.log(`[ProxyWatcher] Exchange approval needed for proxy ${recipient} — calldata prepared (submit via relayer)`);
      }
    } catch (err) {
      console.error(`[ProxyWatcher] Post-deposit handler failed for user ${user._id}: ${err.message}`);
    }
  }
}

/**
 * Main polling loop.
 */
async function poll() {
  if (!enabled()) return;

  const provider = getProvider();
  let headBlock;
  try {
    headBlock = await provider.getBlockNumber();
  } catch (err) {
    console.warn('[ProxyWatcher] getBlockNumber failed:', err.message);
    return;
  }

  const safeHead = headBlock - MIN_CONF;
  if (_lastBlock === 0) {
    _lastBlock = safeHead - 5; // scan last 5 blocks on startup
  }

  if (_lastBlock >= safeHead) return;

  // Cap range to 200 blocks per poll to avoid getLogs size limits
  const fromBlock = _lastBlock + 1;
  const toBlock   = Math.min(safeHead, fromBlock + 199);

  const proxyMap = await buildProxyMap();
  if (proxyMap.size === 0) {
    _lastBlock = toBlock;
    return;
  }

  await scanRange(fromBlock, toBlock, proxyMap);
  _lastBlock = toBlock;
}

function start() {
  if (!enabled()) {
    console.log('[ProxyWatcher] Disabled (set PROXY_DEPOSIT_WATCHER_ENABLED=true or ONCHAIN_ENABLED=true)');
    return;
  }
  if (_pollTimer) return;

  console.log(`[ProxyWatcher] Starting — polling every ${POLL_MS}ms, min ${MIN_CONF} confirmations`);
  // Run once immediately, then on interval
  poll().catch(err => console.error('[ProxyWatcher] Initial poll error:', err.message));
  _pollTimer = setInterval(() => {
    poll().catch(err => console.error('[ProxyWatcher] Poll error:', err.message));
  }, POLL_MS);
}

function stop() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    console.log('[ProxyWatcher] Stopped');
  }
}

module.exports = { start, stop, poll, buildProxyMap };
