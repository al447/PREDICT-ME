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
const { ADDRESSES, ABIS, RPC_URL } = require('../config/contracts');
const walletService = require('./walletService');

const SYNC_INTERVAL_MS = parseInt(process.env.BALANCE_SYNC_MS || '30000', 10);

let _provider = null;
function getProvider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(RPC_URL);
  return _provider;
}

/**
 * Read on-chain USDC balance and CTF position values for a proxy address.
 * @param {string} proxyAddress
 * @returns {Promise<number>} total USDC value (holdings + redeemable positions, simplified)
 */
async function readOnchainBalance(proxyAddress) {
  try {
    const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, ABIS.MOCK_USDC, getProvider());
    const raw = await usdc.balanceOf(proxyAddress);
    return Number(raw) / 1e6;
  } catch (err) {
    console.warn(`[BalanceSync] readOnchainBalance failed for ${proxyAddress}: ${err.message}`);
    return null;
  }
}

/**
 * Sync a single user's cached balance from chain.
 * @param {string|object} userIdOrDoc — User._id string OR Mongoose User document
 * @returns {Promise<{userId, proxy, onchainBalance, synced}>}
 */
async function syncUser(userIdOrDoc) {
  let user = userIdOrDoc;
  if (typeof userIdOrDoc === 'string') {
    user = await User.findById(userIdOrDoc);
  }
  if (!user) return { synced: false, reason: 'user not found' };

  const proxyAddress = user.smartWallet?.proxy;
  if (!proxyAddress) {
    return { userId: user._id.toString(), synced: false, reason: 'no proxy address' };
  }

  const onchainBalance = await readOnchainBalance(proxyAddress);
  if (onchainBalance === null) {
    return { userId: user._id.toString(), synced: false, reason: 'RPC failed' };
  }

  await User.findByIdAndUpdate(user._id, {
    balance: onchainBalance,
    onchainBalance,
    onchainBalanceSyncedAt: new Date(),
  });

  return {
    userId:         user._id.toString(),
    proxy:          proxyAddress,
    onchainBalance,
    synced:         true,
  };
}

/**
 * Sync all users who have a proxy address (batch, used by interval job).
 * Runs in chunks to avoid overwhelming the RPC.
 */
async function syncAll(chunkSize = 20) {
  if (process.env.ONCHAIN_ENABLED !== 'true') return;

  const users = await User.find({ 'smartWallet.proxy': { $ne: null } })
    .select('_id smartWallet balance')
    .lean();

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize);
    const results = await Promise.allSettled(chunk.map(u => syncUser(u)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.synced) synced++;
      else failed++;
    }
    // Small pause between chunks
    if (i + chunkSize < users.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`[BalanceSync] syncAll done: ${synced} synced, ${failed} failed of ${users.length} total`);
  return { synced, failed, total: users.length };
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
