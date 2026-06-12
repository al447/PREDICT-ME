/**
 * keyProvider/index.js — Pluggable key-provider factory
 *
 * Selects the active KeyProvider implementation based on KEY_PROVIDER env var.
 *   KEY_PROVIDER=envvar  (default, M3 testnet) — reads DEPOSIT_MASTER_MNEMONIC from env
 *   KEY_PROVIDER=kms     (M7 mainnet)           — decrypts via Cloud KMS
 *
 * All callers import this module; they never import a specific provider directly.
 * Swapping from envvar → KMS at M7 requires only a config change, no code edits.
 */

const provider = process.env.KEY_PROVIDER || 'envvar';

let _instance = null;

function getKeyProvider() {
  if (_instance) return _instance;

  if (provider === 'kms') {
    _instance = require('./kmsKeyProvider');
  } else {
    _instance = require('./envVarKeyProvider');
  }

  return _instance;
}

module.exports = { getKeyProvider };
