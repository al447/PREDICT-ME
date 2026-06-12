/**
 * kmsKeyProvider.js — KeyProvider backed by Cloud KMS (M7 mainnet)
 *
 * Implements the same interface as envVarKeyProvider.
 * The master mnemonic is stored encrypted in Cloud KMS (AWS/GCP/Azure).
 * At M7, set KEY_PROVIDER=kms and configure the provider below.
 *
 * To activate:
 *   1. Choose a Cloud KMS provider (AWS KMS, GCP Cloud KMS, or Azure Key Vault).
 *   2. Store the encrypted mnemonic ciphertext in KMS_ENCRYPTED_MNEMONIC env var.
 *   3. Configure KMS credentials (AWS_REGION + KMS_KEY_ID, or GCP equivalent).
 *   4. Implement the `_decryptMnemonic()` function below.
 *   5. Set KEY_PROVIDER=kms on Render.
 *
 * All other derivation logic is identical to envVarKeyProvider — the only
 * difference is HOW the mnemonic is obtained.
 */

/* eslint-disable no-unused-vars */

async function _decryptMnemonic() {
  // TODO (M7): Implement KMS decryption.
  // Example AWS KMS:
  //   const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms');
  //   const client = new KMSClient({ region: process.env.AWS_REGION });
  //   const ciphertext = Buffer.from(process.env.KMS_ENCRYPTED_MNEMONIC, 'base64');
  //   const { Plaintext } = await client.send(new DecryptCommand({ CiphertextBlob: ciphertext }));
  //   return Buffer.from(Plaintext).toString('utf8');
  throw new Error('[kmsKeyProvider] Not yet implemented. Configure KMS at M7 and implement _decryptMnemonic().');
}

let _mnemonic = null;

async function getMnemonicAsync() {
  if (_mnemonic) return _mnemonic;
  _mnemonic = await _decryptMnemonic();
  return _mnemonic;
}

// Sync facade — throws if not yet initialised. Call initKeyProvider() at startup.
function getMnemonic() {
  if (_mnemonic) return _mnemonic;
  throw new Error('[kmsKeyProvider] Mnemonic not initialised. Call await initKeyProvider() at server startup before using KMS provider.');
}

async function initKeyProvider() {
  await getMnemonicAsync();
}

// Re-export derivation helpers from envVarKeyProvider but with mnemonic sourced from KMS.
// At M7: refactor these to use getMnemonic() from this module once _decryptMnemonic() is implemented.
const {
  getEvmSigner,
  getSolanaKeypair,
  getBtcKeyPair,
} = require('./envVarKeyProvider');

module.exports = {
  getMnemonic,
  getMnemonicAsync,
  initKeyProvider,
  getEvmSigner,
  getSolanaKeypair,
  getBtcKeyPair,
};
