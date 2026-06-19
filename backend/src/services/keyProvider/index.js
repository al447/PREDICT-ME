/**
 * keyProvider/index.js — Pluggable key-provider factory
 *
 * Selects the active KeyProvider implementation based on KEY_PROVIDER env var.
 *   KEY_PROVIDER=envvar  (default) — reads DEPOSIT_MASTER_MNEMONIC from env
 *   KEY_PROVIDER=kms     (production) — decrypts via Cloud KMS
 *
 * All callers import this module; they never import a specific provider directly.
 * Swapping from envvar → KMS requires only a config change, no code edits.
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
