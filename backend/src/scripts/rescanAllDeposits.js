/**
 * Force rescan all chains via the new Etherscan V2 API indexer.
 * Catches any deposits that were missed due to bugs or downtime.
 * Usage: node src/scripts/rescanAllDeposits.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const indexer = require('../services/depositIndexer');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  console.log(`Platform wallet: ${process.env.PLATFORM_WALLET || process.env.EVM_DEPOSIT_ADDRESS}`);
  console.log('');

  const chains = ['sepolia', 'polygon-amoy', 'ethereum', 'polygon', 'bsc', 'base', 'arbitrum'];

  for (const chain of chains) {
    console.log(`\n=== Scanning ${chain} ===`);
    try {
      await indexer.scanDeposits(chain, { fromBlock: 0 });
    } catch (err) {
      console.error(`Failed to scan ${chain}:`, err.message);
    }
  }

  console.log('\nDone!');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
