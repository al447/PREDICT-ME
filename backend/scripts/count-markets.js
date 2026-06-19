#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const Market = require('../src/models/Market');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const total = await Market.countDocuments();
  const active = await Market.countDocuments({ status: 'active' });
  const pending = await Market.countDocuments({ status: 'pending' });
  const closed = await Market.countDocuments({ status: { $in: ['closed', 'resolved', 'cancelled'] } });
  const onChainTrue = await Market.countDocuments({ onChain: true });
  const withCondition = await Market.countDocuments({ conditionId: { $ne: null } });
  const grouped = await Market.countDocuments({ marketType: 'grouped' });
  const binary = total - grouped;

  // Category breakdown
  const categories = await Market.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log('=== PredictMe Market Summary ===\n');
  console.log(`Total markets:             ${total}`);
  console.log(`  Active:                  ${active}`);
  console.log(`  Pending:                 ${pending}`);
  console.log(`  Closed/Resolved/Cancel:  ${closed}`);
  console.log(`  Binary:                  ${binary}`);
  console.log(`  Grouped (multi-candidate): ${grouped}`);
  console.log(`  onChain flag = true:     ${onChainTrue}`);
  console.log(`  Has conditionId:         ${withCondition}`);
  console.log(`  No conditionId (off-chain): ${total - withCondition}`);
  console.log('\n--- By Category ---');
  for (const c of categories) {
    console.log(`  ${c._id || '(none)'}: ${c.count}`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
