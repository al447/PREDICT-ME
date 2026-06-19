/**
 * Migrate all non-onChain markets directly (no HTTP server needed).
 * Processes in batches of 25 with progress logging.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Market = require('../src/models/Market');
const onchainService = require('../src/services/onchainService');

const BATCH_SIZE = 25;

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const pending = await Market.find({
    $or: [
      { onChain: { $ne: true } },
      { onChain: { $exists: false } },
    ],
  }).select('_id title negRisk').sort({ createdAt: -1 }).lean();

  console.log(`Found ${pending.length} markets to migrate`);
  if (pending.length === 0) { mongoose.disconnect(); return; }

  let migrated = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < pending.length; i++) {
    const m = pending[i];
    try {
      const title = (m.title || m._id.toString()).slice(0, 200);
      const ancillaryData = ethers.hexlify(ethers.toUtf8Bytes(`q: ${title}`));

      const result = await onchainService.createMarketOnChain({
        ancillaryData,
        rewardToken: process.env.UMA_REWARD_TOKEN_ADDRESS || process.env.USDC_ADDRESS || process.env.MOCK_USDC_ADDRESS,
        reward: '0',
        proposalBond: '0',
        liveness: 7200,
        useNegRisk: !!m.negRisk,
      });

      await Market.findByIdAndUpdate(m._id, {
        conditionId:   result.conditionId || null,
        questionId:    result.questionId  || null,
        token0:        result.token0      || null,
        token1:        result.token1      || null,
        onChainTxHash: result.txHash      || null,
        onChain:       true,
      });

      migrated++;
      const pct = ((i + 1) / pending.length * 100).toFixed(1);
      console.log(`[${i+1}/${pending.length}] (${pct}%) ✅ ${title.slice(0, 60)} | conditionId=${result.conditionId?.slice(0,10)}...`);

      // Progress checkpoint every BATCH_SIZE
      if ((i + 1) % BATCH_SIZE === 0) {
        console.log(`\n--- Checkpoint: ${migrated} migrated, ${failed} failed so far ---\n`);
      }
    } catch (err) {
      failed++;
      failures.push({ id: m._id.toString(), title: m.title?.slice(0, 60), error: err.message });
      console.error(`[${i+1}/${pending.length}] ❌ ${m.title?.slice(0, 60)} | ${err.message}`);
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Migrated: ${migrated}`);
  console.log(`Failed:   ${failed}`);
  if (failures.length > 0) {
    console.log('\nFailed markets:');
    failures.forEach(f => console.log(`  ${f.id} | ${f.title} | ${f.error}`));
  }

  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
