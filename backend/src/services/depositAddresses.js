const { ethers } = require('ethers');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const bs58 = require('bs58');
const User = require('../models/User');

let _mnemonic = null;

const getMnemonic = () => {
  if (_mnemonic) return _mnemonic;
  const m = process.env.DEPOSIT_MASTER_MNEMONIC;
  if (!m) {
    console.warn('[DepositAddresses] DEPOSIT_MASTER_MNEMONIC not set — deposit address derivation disabled');
    return null;
  }
  if (!bip39.validateMnemonic(m)) {
    console.error('[DepositAddresses] DEPOSIT_MASTER_MNEMONIC is not a valid BIP39 mnemonic');
    return null;
  }
  _mnemonic = m;
  return _mnemonic;
};

/**
 * Derive the EVM deposit address for a given user index.
 * Uses BIP44 path m/44'/60'/0'/0/{index}
 */
const deriveEvmAddress = (userIndex) => {
  const mnemonic = getMnemonic();
  if (!mnemonic) return null;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${userIndex}`);
  return wallet.address;
};

/**
 * Derive the Solana deposit address for a given user index.
 * Uses BIP44 path m/44'/501'/{index}'/0'
 */
const deriveSolanaAddress = (userIndex) => {
  const mnemonic = getMnemonic();
  if (!mnemonic) return null;
  try {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = `m/44'/501'/${userIndex}'/0'`;
    const { key } = derivePath(path, seed.toString('hex'));
    // Solana public key from ed25519 private key (first 32 bytes = private, derive pub)
    // ed25519-hd-key returns 64-byte keypair; first 32 are private key
    const { PublicKey } = require('@solana/web3.js');
    const nacl = require('tweetnacl');
    const keypair = nacl.sign.keyPair.fromSeed(key);
    const pubkey = new PublicKey(keypair.publicKey);
    return pubkey.toBase58();
  } catch (err) {
    console.error('[DepositAddresses] Solana derivation failed:', err.message);
    return null;
  }
};

// Counter collection name used for atomic index allocation
const DEPOSIT_INDEX_COUNTER = 'deposit_index_seq';

/**
 * Atomically allocate the next deposit index using MongoDB's findOneAndUpdate
 * with upsert. Keeps a single counter document in the User collection's
 * sibling "counters" collection (via mongoose model fallback to a raw collection).
 */
const allocateDepositIndex = async () => {
  // Use a dedicated counter doc on the User model's db connection
  const db = User.db;
  const counters = db.collection('counters');
  const result = await counters.findOneAndUpdate(
    { _id: DEPOSIT_INDEX_COUNTER },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
};

/**
 * Ensure the user has unique HD-derived deposit addresses.
 *
 * Strategy:
 *  - If DEPOSIT_MASTER_MNEMONIC is set → derive per-user addresses from BIP44 HD wallet.
 *    Each user gets their own address derived at m/44'/60'/0'/0/{index} (EVM) so
 *    deposits can be automatically matched to the sender without the user submitting a txHash.
 *  - If mnemonic is NOT set (dev / sandbox) → fall back to the shared PLATFORM_WALLET
 *    env var so the app still works without the mnemonic.
 *
 * The derived addresses are persisted on the user document on first call and
 * returned from DB on every subsequent call (no re-derivation overhead).
 *
 * @param {import('../models/User').default} user - Mongoose user document
 * @returns {Promise<{evm: string|null, solana: string|null}>}
 */
const ensureUserDepositAddresses = async (user) => {
  // Fast path: already persisted — return immediately (no DB write, no derivation)
  if (user.depositAddresses?.evm) {
    return { evm: user.depositAddresses.evm, solana: user.depositAddresses.solana || null };
  }

  // If mnemonic not configured, fall back to shared platform wallet
  const mnemonic = getMnemonic();
  if (!mnemonic) {
    const fallback = process.env.PLATFORM_WALLET || process.env.EVM_DEPOSIT_ADDRESS || null;
    console.warn('[DepositAddresses] No mnemonic — using shared platform wallet as fallback deposit address');
    return { evm: fallback, solana: process.env.SOLANA_DEPOSIT_ADDRESS || null };
  }

  // Allocate a unique index for this user atomically
  const index = await allocateDepositIndex();

  // Derive addresses
  const evm = deriveEvmAddress(index);
  const solana = deriveSolanaAddress(index);

  // Persist on user doc so we never re-derive
  await User.findByIdAndUpdate(user._id, {
    depositIndex: index,
    'depositAddresses.evm': evm,
    'depositAddresses.solana': solana,
  });

  // Keep the in-memory user object consistent for the current request
  user.depositIndex = index;
  if (!user.depositAddresses) user.depositAddresses = {};
  user.depositAddresses.evm = evm;
  user.depositAddresses.solana = solana;

  console.log(`[DepositAddresses] Assigned index ${index} → EVM: ${evm} for user ${user._id}`);
  return { evm, solana };
};

module.exports = { ensureUserDepositAddresses, deriveEvmAddress, deriveSolanaAddress };
