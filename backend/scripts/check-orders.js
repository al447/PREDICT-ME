/**
 * Check Order Statistics
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';

async function checkOrders() {
  await mongoose.connect(MONGODB_URI);
  
  const Order = require('../src/models/Order');
  
  console.log('=== PRODUCTION ORDERS ANALYSIS ===\n');
  
  const total = await Order.countDocuments();
  console.log('Total orders:', total);
  
  // Count by status
  const byStatus = await Order.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  console.log('\nBy status:');
  byStatus.forEach(s => console.log(`  - ${s._id}: ${s.count}`));
  
  // Check if these are maker bot orders
  const sampleOrders = await Order.find().limit(3).lean();
  console.log('\nSample order makers:');
  sampleOrders.forEach((o, i) => {
    console.log(`  ${i+1}. ${o.maker.substring(0, 20)}... (${o.side} ${o.size} shares @ $${o.price})`);
  });
  
  // Check unique makers
  const uniqueMakers = await Order.distinct('maker');
  console.log('\nUnique makers:', uniqueMakers.length);
  
  // Check date range
  const oldest = await Order.findOne().sort({ createdAt: 1 }).lean();
  const newest = await Order.findOne().sort({ createdAt: -1 }).lean();
  console.log('\nDate range:');
  console.log('  Oldest:', oldest ? oldest.createdAt : 'N/A');
  console.log('  Newest:', newest ? newest.createdAt : 'N/A');
  
  await mongoose.disconnect();
}

checkOrders().catch(console.error);
