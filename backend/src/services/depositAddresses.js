const User = require('../models/User');
const { getKeyProvider } = require('./keyProvider');

/**
 * Derive the EVM deposit address for a given user index.
 * Uses BIP44 path m/44'/60'/0'/0/{index}
 */
const deriveEvmAddress = (userIndex) => {
  try {
    const kp = getKeyProvider();
    const wallet = kp.getEvmSigner(userIndex);
    return wallet.address;
  } catch (err) {
    console.warn('[DepositAddresses] EVM derivation failed:', err.message);
    return null;
  }
};

/**
 * Derive the Solana deposit address for a given user index.
 * Uses BIP44 path m/44'/501'/{index}'/0'
 */
const deriveSolanaAddress = (userIndex) => {
  try {
    const kp = getKeyProvider();
    return kp.getSolanaKeypair(userIndex).publicKeyBase58;
  } catch (err) {
    console.error('[DepositAddresses] Solana derivation failed:', err.message);
    return null;
  }
};

/**
 * Derive the Bitcoin deposit address for a given user index.
 * Uses BIP84 path m/84'/0'/0'/0/{index} — native segwit (bc1q / tb1q)
 */
const deriveBtcAddress = (userIndex) => {
  try {
    const kp = getKeyProvider();
    const IS_MAINNET = process.env.NETWORK === 'mainnet';
    const bitcoin = require('bitcoinjs-lib');
    const network = IS_MAINNET ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    return kp.getBtcKeyPair(userIndex, network).address;
  } catch (err) {
    console.error('[DepositAddresses] BTC derivation failed:', err.message);
    return null;
  }
};

// ── Signer getters (in-memory only — for sweep service) ──────────────────────

/**
 * Get an ethers Wallet signer for sweep transactions.
 * Caller must discard after use — never persist or log.
 */
const getEvmSigner = (userIndex) => getKeyProvider().getEvmSigner(userIndex);

/**
 * Get a Solana keypair for sweep transactions.
 * Returns { publicKeyBase58, secretKey }
 */
const getSolanaKeypair = (userIndex) => getKeyProvider().getSolanaKeypair(userIndex);

/**
 * Get a Bitcoin ECPair for sweep transactions.
 * Returns { address, wif, ecpair, network }
 */
const getBtcKeyPair = (userIndex) => {
  const IS_MAINNET = process.env.NETWORK === 'mainnet';
  const bitcoin = require('bitcoinjs-lib');
  const network = IS_MAINNET ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  return getKeyProvider().getBtcKeyPair(userIndex, network);
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
  // Fast path: EVM + Solana already persisted — check if BTC needs provisioning
  if (user.depositAddresses?.evm) {
    const result = {
      evm:    user.depositAddresses.evm,
      solana: user.depositAddresses.solana || null,
      btc:    user.depositAddresses.btc    || null,
    };

    // Deferred BTC provisioning: if btc is null and Safe exists, provision now
    if (!result.btc && user.smartWallet?.proxy) {
      try {
        const btcAddr = await provisionRelayBtcAddress(user);
        if (btcAddr) result.btc = btcAddr;
      } catch (err) {
        console.warn(`[DepositAddresses] Deferred BTC provisioning failed for user ${user._id}:`, err.message);
      }
    }

    return result;
  }

  // If key provider not configured, fall back to shared platform wallet
  let mnemonicAvailable = true;
  try { getKeyProvider().getMnemonic(); } catch { mnemonicAvailable = false; }

  if (!mnemonicAvailable) {
    const fallback = process.env.PLATFORM_WALLET || process.env.EVM_DEPOSIT_ADDRESS || null;
    console.warn('[DepositAddresses] No mnemonic — using shared platform wallet as fallback deposit address');
    return { evm: fallback, solana: process.env.SOLANA_DEPOSIT_ADDRESS || null, btc: null };
  }

  // Allocate a unique index for this user atomically
  const index = await allocateDepositIndex();

  // Derive EVM + Solana addresses (HD-derived)
  const evm    = deriveEvmAddress(index);
  const solana = deriveSolanaAddress(index);

  // BTC: provision via Relay (requires Safe proxy to exist)
  let btc = null;
  const safeProxy = user.smartWallet?.proxy;
  if (safeProxy) {
    try {
      const relayProvider = require('./bridgeProviders/relayProvider');
      const { depositAddress, requestId } = await relayProvider.createBtcDepositAddress({ recipientSafe: safeProxy });
      btc = depositAddress;
      // Persist Relay request ID on user doc
      await User.findByIdAndUpdate(user._id, { relayBtcRequestId: requestId });
    } catch (err) {
      console.warn(`[DepositAddresses] Relay BTC provisioning failed for user ${user._id}:`, err.message);
      // BTC will be null — deferred provisioning on next call when Safe exists
    }
  } else {
    console.log(`[DepositAddresses] User ${user._id} has no Safe proxy — deferring BTC provisioning`);
  }

  // Persist on user doc so we never re-derive
  await User.findByIdAndUpdate(user._id, {
    depositIndex: index,
    'depositAddresses.evm':    evm,
    'depositAddresses.solana': solana,
    'depositAddresses.btc':    btc,
  });

  // Keep the in-memory user object consistent for the current request
  user.depositIndex = index;
  if (!user.depositAddresses) user.depositAddresses = {};
  user.depositAddresses.evm    = evm;
  user.depositAddresses.solana = solana;
  user.depositAddresses.btc    = btc;

  console.log(`[DepositAddresses] Assigned index ${index} → EVM: ${evm}, BTC: ${btc || '(deferred)'} for user ${user._id}`);
  return { evm, solana, btc };
};

/**
 * Provision a Relay BTC deposit address for a user who already has EVM/Solana
 * addresses but was missing BTC (because their Safe wasn't deployed yet).
 */
async function provisionRelayBtcAddress(user) {
  const relayProvider = require('./bridgeProviders/relayProvider');
  const safeProxy = user.smartWallet?.proxy;
  if (!safeProxy) return null;

  const { depositAddress, requestId } = await relayProvider.createBtcDepositAddress({ recipientSafe: safeProxy });

  await User.findByIdAndUpdate(user._id, {
    'depositAddresses.btc': depositAddress,
    relayBtcRequestId:      requestId,
  });

  // Update in-memory
  if (!user.depositAddresses) user.depositAddresses = {};
  user.depositAddresses.btc = depositAddress;
  user.relayBtcRequestId = requestId;

  console.log(`[DepositAddresses] Deferred BTC provisioned: ${depositAddress} for user ${user._id}`);
  return depositAddress;
}

module.exports = {
  ensureUserDepositAddresses,
  deriveEvmAddress,
  deriveSolanaAddress,
  deriveBtcAddress,
  getEvmSigner,
  getSolanaKeypair,
  getBtcKeyPair,
};
