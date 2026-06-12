const mongoose = require('mongoose');
const Market = require('./src/models/Market');

mongoose.connect(process.env.MONGODB_URI)
.then(async () => {
  const total = await Market.countDocuments();
  const onChain = await Market.countDocuments({ onChain: true });
  const binary = await Market.countDocuments({ marketType: 'binary', onChain: true });
  const withTokens = await Market.countDocuments({ 
    onChain: true, 
    token0: { $exists: true, $ne: null }, 
    token1: { $exists: true, $ne: null } 
  });
  
  const grouped = await Market.countDocuments({ marketType: 'grouped' });
  const groupedOnChain = await Market.countDocuments({ marketType: 'grouped', onChain: true });
  
  console.log('=== ON-CHAIN DEPLOYMENT STATUS ===');
  console.log('Total Markets:', total);
  console.log('Markets with onChain=true:', onChain);
  console.log('Binary Markets on-chain:', binary);
  console.log('Markets with token0/token1 populated:', withTokens);
  console.log('Grouped Markets:', grouped);
  console.log('Grouped Markets on-chain:', groupedOnChain);
  console.log('');
  console.log('Binary Completion:', Math.round((withTokens / total) * 100) + '%');
  
  // Check sample markets
  const sampleBinary = await Market.findOne({ marketType: 'binary', onChain: true }).select('slug token0 token1 conditionId');
  const sampleGrouped = await Market.findOne({ marketType: 'grouped' }).select('slug candidates.onChain');
  
  console.log('');
  console.log('Sample Binary Market:');
  console.log('  Slug:', sampleBinary?.slug);
  console.log('  Token0 (YES):', sampleBinary?.token0);
  console.log('  Token1 (NO):', sampleBinary?.token1);
  console.log('  ConditionId:', sampleBinary?.conditionId);
  
  console.log('');
  console.log('Sample Grouped Market:');
  console.log('  Slug:', sampleGrouped?.slug);
  console.log('  Candidates on-chain:', sampleGrouped?.candidates?.filter(c => c.onChain).length, '/', sampleGrouped?.candidates?.length);
  
  process.exit(0);
})
.catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
