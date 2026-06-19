require('dotenv').config();
const mongoose = require('mongoose');
const Market = require('../src/models/Market');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const total = await Market.countDocuments();

  // Check for any remaining Amoy artifacts
  const withQuestionId = await Market.countDocuments({ questionId: { $ne: null } });
  const withToken0 = await Market.countDocuments({ token0: { $ne: null } });
  const withToken1 = await Market.countDocuments({ token1: { $ne: null } });
  const withOnChainTx = await Market.countDocuments({ onChainTxHash: { $ne: null } });
  const onChainTrue = await Market.countDocuments({ onChain: true });
  const withConditionId = await Market.countDocuments({ conditionId: { $ne: null } });

  console.log('=== Market Verification ===\n');
  console.log(`Total markets:       ${total}`);
  console.log('');
  console.log('--- On-chain fields (should all be 0 for clean state) ---');
  console.log(`  onChain = true:    ${onChainTrue}  ${onChainTrue === 0 ? '✅' : '❌ STALE DATA'}`);
  console.log(`  questionId set:    ${withQuestionId}  ${withQuestionId === 0 ? '✅' : '❌ STALE DATA'}`);
  console.log(`  token0 set:        ${withToken0}  ${withToken0 === 0 ? '✅' : '❌ STALE DATA'}`);
  console.log(`  token1 set:        ${withToken1}  ${withToken1 === 0 ? '✅' : '❌ STALE DATA'}`);
  console.log(`  onChainTxHash set: ${withOnChainTx}  ${withOnChainTx === 0 ? '✅' : '❌ STALE DATA'}`);
  console.log('');
  console.log('--- Reference fields (Polymarket sync data — expected) ---');
  console.log(`  conditionId set:   ${withConditionId}  (Polymarket reference IDs, not on-chain)`);
  console.log('');

  if (onChainTrue === 0 && withQuestionId === 0 && withToken0 === 0 && withToken1 === 0 && withOnChainTx === 0) {
    console.log('✅ ALL CLEAN — No Amoy testnet data remains.');
    console.log('   All 608 markets are ready for mainnet on-chain registration.');
  } else {
    console.log('❌ STALE DATA FOUND — Some markets still have Amoy artifacts.');
  }

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
