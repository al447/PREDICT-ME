const { ethers } = require('ethers');
// ambire validator + its bundled ethers v5 (handles EOA + EIP-1271 + ERC-6492)
const { verifyMessage: ambireVerifyMessage } = require('@ambire/signature-validator');

// Try multiple paths for ethers v5 (handles npm workspace hoisting)
let ethersV5;
try {
  // Try ambire's bundled ethers first
  ethersV5 = require('@ambire/signature-validator/node_modules/ethers');
} catch (e) {
  try {
    // Fall back to root ethers (if v5 is installed there)
    ethersV5 = require('ethers');
  } catch (e2) {
    // Last resort: try ambire's internal require
    const path = require('path');
    const ambirePath = require.resolve('@ambire/signature-validator');
    ethersV5 = require(path.join(path.dirname(ambirePath), 'node_modules', 'ethers'));
  }
}

// Per-chain public RPCs used for smart-wallet (EIP-1271 / ERC-6492) verification.
// The frontend reports which chain the wallet is connected to. Multiple RPCs per
// chain provide failover — some public endpoints intermittently reject the
// network-detection probe ("could not detect network").
const CHAIN_RPCS = {
  1: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  137: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  80002: [process.env.POLYGON_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com', 'https://rpc-amoy.polygon.technology'],
  8453: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org'],
  84532: ['https://base-sepolia-rpc.publicnode.com', 'https://sepolia.base.org'],
  11155111: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org'],
};

// Coinbase Smart Wallet defaults to Ethereum mainnet — use it when chainId is unknown.
const DEFAULT_VERIFY_CHAIN = 1;

/**
 * Smart-wallet signature verification via Ambire's universal validator.
 * Handles EOA, deployed EIP-1271 contract wallets, and undeployed
 * (counterfactual) ERC-6492 wallets like Coinbase Smart Wallet.
 *
 * @param {string} signer    claimed wallet address
 * @param {string} message   the signed message
 * @param {string} signature the signature (may be ERC-6492-wrapped)
 * @param {number} chainId   chain the wallet is connected to
 */
const verifyUniversalSignature = async (signer, message, signature, chainId) => {
  const resolvedChain = CHAIN_RPCS[chainId] ? Number(chainId) : DEFAULT_VERIFY_CHAIN;
  const rpcs = CHAIN_RPCS[resolvedChain];

  for (const rpc of rpcs) {
    try {
      // StaticJsonRpcProvider with an explicit network skips the eth_chainId
      // auto-detection probe that some public RPCs reject ("could not detect network").
      const provider = new ethersV5.providers.StaticJsonRpcProvider(rpc, resolvedChain);
      const isValid = await ambireVerifyMessage({ signer, message, signature, provider });
      if (isValid === true) return true;
      // A definitive "false" (signature genuinely invalid) — no point trying other RPCs.
      console.warn(`[WalletAuth] Signature invalid on chain ${resolvedChain} via ${rpc}`);
      return false;
    } catch (e) {
      // RPC-level failure — try the next endpoint.
      console.warn(`[WalletAuth] RPC ${rpc} failed (chain ${resolvedChain}):`, e.message);
    }
  }

  console.warn(`[WalletAuth] All RPCs failed for chain ${resolvedChain} — cannot verify smart-wallet signature`);
  return false;
};

// Max age of a signature before it's considered expired (5 minutes)
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

// Canonical app name that MUST appear in the signed message.
// Prevents cross-app replay: a signature made for a different dApp is rejected.
const EXPECTED_APP_NAME = 'PolyBet365';

const SIG_TTL_SEC = Math.ceil(SIGNATURE_MAX_AGE_MS / 1000);

// Replay store. Prefers Redis (durable + shared across instances) when REDIS_URL is set;
// otherwise falls back to a process-local Map (single-instance only). The Map is also used
// if Redis is configured but momentarily unavailable, so auth never hard-fails on Redis.
const usedSignatures = new Map();

const cleanupUsedSignatures = () => {
  const now = Date.now();
  for (const [sig, ts] of usedSignatures.entries()) {
    if (now - ts > SIGNATURE_MAX_AGE_MS) {
      usedSignatures.delete(sig);
    }
  }
};

// Cleanup every minute (fallback store only)
setInterval(cleanupUsedSignatures, 60 * 1000);

// Optional Redis client — lazy-required so a missing ioredis dependency never crashes the app.
let redis = null;
let redisReady = false;
if (process.env.REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    redis.on('ready', () => { redisReady = true; console.log('[WalletAuth] Redis replay store connected'); });
    redis.on('error', (e) => { redisReady = false; console.error('[WalletAuth] Redis error:', e.message); });
  } catch (e) {
    console.warn('[WalletAuth] REDIS_URL set but ioredis unavailable — using in-memory replay store:', e.message);
  }
}

/**
 * Atomically reserve a signature. Returns true if it was unused (now reserved),
 * false if it was already used within the validity window (replay).
 */
const markSignatureIfNew = async (signature) => {
  if (redis && redisReady) {
    try {
      // SET key 1 EX ttl NX — atomic check-and-set. 'OK' = new, null = already existed.
      const res = await redis.set(`walletsig:${signature}`, '1', 'EX', SIG_TTL_SEC, 'NX');
      return res === 'OK';
    } catch (e) {
      console.error('[WalletAuth] Redis set failed, falling back to in-memory:', e.message);
      // fall through to memory store
    }
  }
  if (usedSignatures.has(signature)) return false;
  usedSignatures.set(signature, Date.now());
  return true;
};

/**
 * Verify wallet signature with replay protection.
 * Expected message format:
 *   "Sign in to PolyBet365\nAddress: 0x...\nTimestamp: <ms>"
 * 
 * @param {string} message
 * @param {string} signature
 * @param {number} [chainId] chain the wallet is connected to (for smart-wallet verification)
 * @returns {Promise<string|null>} recovered address (lowercase) if valid, null otherwise
 */
const verifyWalletSignature = async (message, signature, chainId) => {
  try {
    // 0. Reject excessively short messages (can't contain all required fields)
    if (!message || message.length < 40) {
      console.warn('[WalletAuth] Message too short to be valid');
      return null;
    }

    // 0b. Domain binding — reject messages not signed for this app
    if (!message.includes(EXPECTED_APP_NAME)) {
      console.warn('[WalletAuth] Message missing expected app name — cross-app replay attempt?');
      return null;
    }

    // 1. Extract timestamp from message (needed for both EOA + EIP-1271 paths)
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/);
    if (!timestampMatch) {
      console.warn('[WalletAuth] Message missing timestamp');
      return null;
    }

    const timestamp = parseInt(timestampMatch[1], 10);
    const now = Date.now();
    const age = now - timestamp;

    // 2. Reject if timestamp is in the future (clock skew > 30s) or expired
    if (age < -30 * 1000) {
      console.warn('[WalletAuth] Signature timestamp is in the future');
      return null;
    }
    if (age > SIGNATURE_MAX_AGE_MS) {
      console.warn(`[WalletAuth] Signature expired (age: ${Math.floor(age / 1000)}s)`);
      return null;
    }

    // 3. Try standard EOA recovery first
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      recoveredAddress = null;
    }

    // 4. Replay protection — reserve the signature; reject if already used.
    const isNew = await markSignatureIfNew(signature);
    if (!isNew) {
      console.warn('[WalletAuth] Signature replay detected');
      return null;
    }

    // 5. Return EOA address if recovery succeeded and matches expected format
    if (recoveredAddress && ethers.isAddress(recoveredAddress)) {
      return recoveredAddress.toLowerCase();
    }

    // 6. Smart-wallet fallback (ERC-6492 / EIP-1271): extract the claimed address
    //    from the message and verify on-chain. Covers Coinbase Smart Wallet, Safe, etc.
    //    Works for both deployed and undeployed (counterfactual) wallets.
    const addressMatch = message.match(/Address:\s*(0x[0-9a-fA-F]{40})/);
    if (addressMatch) {
      const claimedAddress = addressMatch[1];
      console.log('[WalletAuth] EOA recovery failed — trying ERC-6492/EIP-1271 for', claimedAddress);
      const valid = await verifyUniversalSignature(claimedAddress, message, signature, chainId);
      if (valid) {
        console.log('[WalletAuth] Smart-wallet signature verified for', claimedAddress);
        return claimedAddress.toLowerCase();
      }
      console.warn('[WalletAuth] Smart-wallet verification failed for', claimedAddress);
    }

    return null;
  } catch (error) {
    console.error('[WalletAuth] Signature verification failed:', error.message);
    return null;
  }
};

module.exports = { verifyWalletSignature, SIGNATURE_MAX_AGE_MS };
