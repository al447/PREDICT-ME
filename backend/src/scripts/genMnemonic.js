/**
 * Generate a fresh BIP39 mnemonic for DEPOSIT_MASTER_MNEMONIC.
 * Run: node src/scripts/genMnemonic.js
 * Copy the output to backend/.env as DEPOSIT_MASTER_MNEMONIC
 * KEEP THIS SAFE — it controls all deposit addresses!
 */
const bip39 = require('bip39');
const mnemonic = bip39.generateMnemonic(256); // 24 words
console.log('\n✅ New BIP39 mnemonic (24 words):');
console.log(mnemonic);
console.log('\n⚠️  Store this securely. Add to backend/.env as:');
console.log(`DEPOSIT_MASTER_MNEMONIC=${mnemonic}\n`);
