require('dotenv').config();
const mongoose = require('mongoose');
const Market = require('../src/models/Market');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Markets WITH conditionId
  console.log('=== Markets WITH conditionId (sample 5) ===\n');
  const withCid = await Market.find({ conditionId: { $ne: null } })
    .select('title conditionId onChain polymarketSlug questionId token0 token1')
    .limit(5).lean();
  withCid.forEach(m => {
    console.log(m.title);
    console.log('  conditionId:', m.conditionId);
    console.log('  questionId:', m.questionId || '(null)');
    console.log('  token0:', m.token0 || '(null)');
    console.log('  onChain:', m.onChain);
    console.log('  polymarketSlug:', m.polymarketSlug || '(none)');
    console.log();
  });

  // Markets WITHOUT conditionId (the 95 we just reset)
  console.log('=== Markets WITHOUT conditionId (sample 5) ===\n');
  const noCid = await Market.find({ conditionId: null })
    .select('title onChain polymarketSlug')
    .limit(5).lean();
  noCid.forEach(m => {
    console.log(m.title);
    console.log('  onChain:', m.onChain);
    console.log('  polymarketSlug:', m.polymarketSlug || '(none)');
    console.log();
  });

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
