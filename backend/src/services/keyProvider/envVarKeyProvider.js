/**
 * envVarKeyProvider.js — KeyProvider backed by a Render encrypted env var
 *
 * M3 (testnet): reads DEPOSIT_MASTER_MNEMONIC from the environment.
 * Render encrypts secrets at rest; never commit this value to source control.
 *
 * Interface (shared with kmsKeyProvider):
 *   getMnemonic()                     → string BIP39 mnemonic
 *   getEvmSigner(index)               → ethers.Wallet (in-memory, not persisted)
 *   getSolanaKeypair(index)           → { publicKey: string, secretKey: Uint8Array }
 *   getBtcKeyPair(index)              → { address: string, wif: string, ecpair }
 */

const { ethers } = require('ethers');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const tinysecp = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');

const ECPair = ECPairFactory(tinysecp);
const bip32 = BIP32Factory(tinysecp);

let _mnemonic = null;

function getMnemonic() {
  if (_mnemonic) return _mnemonic;
  const m = process.env.DEPOSIT_MASTER_MNEMONIC;
  if (!m) throw new Error('[KeyProvider] DEPOSIT_MASTER_MNEMONIC env var is not set');
  if (!bip39.validateMnemonic(m)) throw new Error('[KeyProvider] DEPOSIT_MASTER_MNEMONIC is not a valid BIP39 mnemonic');
  _mnemonic = m;
  return _mnemonic;
}

/**
 * Derive an ethers Wallet for a given user index.
 * Path: m/44'/60'/0'/0/{index}
 * Caller must discard after use — do NOT persist or log.
 */
function getEvmSigner(index) {
  const mnemonic = getMnemonic();
  return ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
}

/**
 * Derive a Solana keypair for a given user index.
 * Path: m/44'/501'/{index}'/0'
 * Returns { publicKeyBase58, secretKey (Uint8Array) }
 */
function getSolanaKeypair(index) {
  const mnemonic = getMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const path = `m/44'/501'/${index}'/0'`;
  const { key } = derivePath(path, seed.toString('hex'));
  const keypair = nacl.sign.keyPair.fromSeed(key);
  const pubkey = new PublicKey(keypair.publicKey);
  return {
    publicKeyBase58: pubkey.toBase58(),
    secretKey: keypair.secretKey,
  };
}

/**
 * Derive a Bitcoin keypair (BIP84 native segwit) for a given user index.
 * Path: m/84'/0'/0'/0/{index}
 * Returns { address (bc1q... / testnet tb1q...), wif, ecpair }
 */
function getBtcKeyPair(index, network = bitcoin.networks.testnet) {
  const mnemonic = getMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);
  const path = `m/84'/0'/0'/0/${index}`;
  const child = root.derivePath(path);
  const ecpair = ECPair.fromPrivateKey(child.privateKey, { network });
  const { address } = bitcoin.payments.p2wpkh({ pubkey: ecpair.publicKey, network });
  return {
    address,
    wif: child.toWIF(),
    ecpair,
    network,
  };
}

module.exports = { getMnemonic, getEvmSigner, getSolanaKeypair, getBtcKeyPair };
