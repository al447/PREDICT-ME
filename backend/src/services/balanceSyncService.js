/**
 * balanceSyncService.js — Sync on-chain USDC balance → User.balance cache.
 *
 * Source of truth = on-chain (proxy wallet USDC balance).
 * DB User.balance is a read-only cached mirror updated here.
 *
 * Called after:
 *   - Login / session refresh
 *   - Deposit confirmed
 *   - Trade settled
 *   - Redeem confirmed
 *   - On interval (BALANCE_SYNC_MS, default 30s)
 *
 * Env:
 *   BALANCE_SYNC_MS — polling interval (default 30000)
 */

const { ethers } = require('ethers');
const User = require('../models/User');
const Trade = require('../models/Trade');
const { ADDRESSES, ABIS, RPC_URL, getPolygonProvider } = require('../config/contracts');
const walletService = require('./walletService');

const SYNC_INTERVAL_MS = parseInt(process.env.BALANCE_SYNC_MS || '30000', 10);

let _provider = null;
function getProvider() {
  if (!_provider) _provider = getPolygonProvider();
  return _provider;
}

/**
 * Read on-chain USDC balance and CTF position values for a proxy address.
 * @param {string} proxyAddress
 * @returns {Promise<number>} total USDC value (holdings + redeemable positions, simplified)
 */
async function readOnchainBalance(proxyAddress) {
  try {
    const usdc = new ethers.Contract(ADDRESSES.USDC, ABIS.USDC, getProvider());
    const raw = await usdc.balanceOf(proxyAddress);
    return Number(raw) / 1e6;
  } catch (err) {
    console.warn(`[BalanceSync] readOnchainBalance failed for ${proxyAddress}: ${err.message}`);
    return null;
  }
}

/**
 * Check if user has any on-chain trading activity (CLOB trades with conditionId).
 * Paper-only users should not have their balance overwritten by on-chain sync.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasOnChainActivity(userId) {
  try {
    const onChainTrade = await Trade.findOne({ user: userId, conditionId: { $exists: true, $ne: null } }).lean();
    return !!onChainTrade;
  } catch {
    return false;
  }
}

/**
 * Sync a single user's cached balance from chain.
 * @param {string|object} userIdOrDoc — User._id string OR Mongoose User document
 * @param {Object} opts — Options { force: boolean } to skip on-chain activity check
 * @returns {Promise<{userId, proxy, onchainBalance, synced}>}
 */
async function syncUser(userIdOrDoc, opts = {}) {
  let user = userIdOrDoc;
  if (typeof userIdOrDoc === 'string') {
    user = await User.findById(userIdOrDoc);
  }
  if (!user) return { synced: false, reason: 'user not found' };

  const proxyAddress = user.smartWallet?.proxy;
  if (!proxyAddress) {
    return { userId: user._id.toString(), synced: false, reason: 'no proxy address' };
  }

  // Read on-chain balance first (needed for both eligibility check and sync)
  const onchainBalance = await readOnchainBalance(proxyAddress);
  if (onchainBalance === null) {
    return { userId: user._id.toString(), synced: false, reason: 'RPC failed' };
  }

  // Delta-reconciliation model (paper balance is authoritative):
  //   User.balance is the source of truth and is mutated additively by all flows
  //   (paper trades, settlement winnings, deposits, withdrawals). This sync does NOT
  //   overwrite balance — it applies only the CHANGE in the proxy's on-chain USDC
  //   since the last sync, so on-chain deposits/withdrawals are reflected without
  //   erasing paper-side deltas (settlement payouts, paper trade debits, etc.).
  //
  //   onchainBalance stores the last-seen on-chain value (the reconciliation baseline).
  const prevOnchain = user.onchainBalance;        // may be null on first sync
  const baseline = prevOnchain == null ? 0 : prevOnchain;
  const delta = onchainBalance - baseline;

  // Skip paper-only users with no on-chain footprint and nothing to reconcile.
  if (!opts.force && delta === 0) {
    const hasOnChain = await hasOnChainActivity(user._id);
    if (!hasOnChain && onchainBalance === 0) {
      return { userId: user._id.toString(), synced: false, reason: 'paper-only user' };
    }
  }

  if (delta === 0) {
    // Nothing changed on-chain; just refresh the baseline timestamp (and set the
    // baseline value on first sync so future deltas compute correctly).
    await User.updateOne(
      { _id: user._id },
      { $set: { onchainBalance, onchainBalanceSyncedAt: new Date() } }
    );
    return { userId: user._id.toString(), proxy: proxyAddress, onchainBalance, delta: 0, synced: true };
  }

  // Apply the on-chain delta atomically, guarded by the previous baseline to avoid
  // double-applying when two syncs race (the loser's filter won't match).
  const updated = await User.findOneAndUpdate(
    { _id: user._id, onchainBalance: prevOnchain },
    { $inc: { balance: delta }, $set: { onchainBalance, onchainBalanceSyncedAt: new Date() } },
    { new: true }
  );

  if (!updated) {
    // Another sync already applied this delta — no-op.
    return { userId: user._id.toString(), proxy: proxyAddress, onchainBalance, delta: 0, synced: false, reason: 'concurrent sync' };
  }

  return {
    userId:         user._id.toString(),
    proxy:          proxyAddress,
    onchainBalance,
    delta,
    synced:         true,
  };
}

/**
 * Sync all users who have a proxy address and on-chain activity (batch, used by interval job).
 * Paper-only users are skipped to preserve their DB balance as source of truth.
 * Runs in chunks to avoid overwhelming the RPC.
 */
async function syncAll(chunkSize = 20) {
  if (process.env.ONCHAIN_ENABLED !== 'true') return;

  const users = await User.find({ 'smartWallet.proxy': { $ne: null } })
    .select('_id smartWallet balance')
    .lean();

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize);
    const results = await Promise.allSettled(chunk.map(u => syncUser(u)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.synced) synced++;
        else if (r.value.reason === 'paper-only user') skipped++;
        else failed++;
      } else {
        failed++;
      }
    }
    // Small pause between chunks
    if (i + chunkSize < users.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`[BalanceSync] syncAll done: ${synced} synced, ${skipped} skipped (paper-only), ${failed} failed of ${users.length} total`);
  return { synced, skipped, failed, total: users.length };
}

// ── Interval job ───────────────────────────────────────────────────────────────

let _syncTimer = null;

function startSyncJob() {
  if (_syncTimer) return;
  if (process.env.ONCHAIN_ENABLED !== 'true') return;

  _syncTimer = setInterval(() => {
    syncAll().catch(err => console.error('[BalanceSync] syncAll error:', err.message));
  }, SYNC_INTERVAL_MS);

  console.log(`[BalanceSync] Interval job started (${SYNC_INTERVAL_MS}ms)`);
}

function stopSyncJob() {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
    console.log('[BalanceSync] Interval job stopped');
  }
}

module.exports = {
  syncUser,
  syncAll,
  readOnchainBalance,
  startSyncJob,
  stopSyncJob,
  SYNC_INTERVAL_MS,
};
