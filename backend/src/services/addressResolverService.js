/**
 * Address Resolver Service
 * Maps on-chain addresses (Safe proxy or EOA) to platform Users.
 * Used by: Fill model, Trade mirroring, activity/holders endpoints.
 */

const User = require('../models/User');

// Cache for address lookups (short-lived, per-process)
const _cache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Resolve an address to a User document
 * @param {string} address - Ethereum address (0x...)
 * @returns {Promise<{user: User|null, isMakerBot: boolean}>}
 */
async function resolveAddressToUser(address) {
  if (!address) return { user: null, isMakerBot: false };

  const normalized = address.toLowerCase();

  // Check cache
  const cached = _cache.get(normalized);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  // Check if it's the operator/maker-bot address
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
  if (operatorKey) {
    const { ethers } = require('ethers');
    const operatorWallet = new ethers.Wallet(operatorKey);
    if (operatorWallet.address.toLowerCase() === normalized) {
      const result = { user: null, isMakerBot: true };
      _cache.set(normalized, { result, ts: Date.now() });
      return result;
    }
  }

  // Look up user by smartWallet.proxy or walletAddress
  const user = await User.findOne({
    $or: [
      { 'smartWallet.proxy': normalized },
      { walletAddress: normalized },
    ],
  }).lean();

  const result = { user: user || null, isMakerBot: false };
  _cache.set(normalized, { result, ts: Date.now() });
  return result;
}

/**
 * Resolve multiple addresses in parallel
 * @param {string[]} addresses
 * @returns {Promise<Map<string, {user: User|null, isMakerBot: boolean}>>}
 */
async function resolveMultipleAddresses(addresses) {
  const uniqueAddresses = [...new Set(addresses.filter(Boolean))];
  const results = await Promise.all(
    uniqueAddresses.map(async (addr) => ({
      addr: addr.toLowerCase(),
      result: await resolveAddressToUser(addr),
    }))
  );

  const map = new Map();
  results.forEach(({ addr, result }) => map.set(addr, result));
  return map;
}

/**
 * Clear the cache (useful for testing)
 */
function clearCache() {
  _cache.clear();
}

module.exports = {
  resolveAddressToUser,
  resolveMultipleAddresses,
  clearCache,
};
