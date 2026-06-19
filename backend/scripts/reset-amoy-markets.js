#!/usr/bin/env node
/**
 * Reset Amoy testnet on-chain fields from all markets.
 *
 * After running this, markets will have onChain=false and null conditionId/questionId/token0/token1,
 * making them eligible for mainnet re-migration via POST /api/onchain/markets/migrate.
 *
 * Usage:
 *   DRY_RUN=true  node scripts/reset-amoy-markets.js   # Preview (no changes)
 *   DRY_RUN=false node scripts/reset-amoy-markets.js   # Execute reset
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Market = require('../src/models/Market');

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find all markets that have stale Amoy on-chain data
  const amoyMarkets = await Market.find({
    onChain: true,
    conditionId: { $ne: null },
  }).select('_id title conditionId questionId token0 token1 onChainTxHash').lean();

  console.log(`\nFound ${amoyMarkets.length} markets with on-chain data (Amoy testnet)\n`);

  if (amoyMarkets.length === 0) {
    console.log('Nothing to reset.');
    process.exit(0);
  }

  // Show first 5 as sample
  console.log('Sample markets to reset:');
  amoyMarkets.slice(0, 5).forEach(m => {
    console.log(`  - ${m.title}`);
    console.log(`    conditionId: ${m.conditionId}`);
    console.log(`    questionId:  ${m.questionId}`);
  });
  if (amoyMarkets.length > 5) console.log(`  ... and ${amoyMarkets.length - 5} more\n`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no changes made ===');
    console.log(`Would reset ${amoyMarkets.length} markets.`);
    console.log('Run with DRY_RUN=false to execute.\n');
    process.exit(0);
  }

  // Reset all Amoy on-chain fields
  const result = await Market.updateMany(
    {
      onChain: true,
      conditionId: { $ne: null },
    },
    {
      $set: {
        onChain: false,
        conditionId: null,
        questionId: null,
        token0: null,
        token1: null,
        onChainTxHash: null,
      },
    }
  );

  console.log(`\n✅ Reset ${result.modifiedCount} markets`);
  console.log('Markets are now eligible for mainnet migration via:');
  console.log('  POST /api/onchain/markets/migrate { "limit": 50 }\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
