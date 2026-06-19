/**
 * Cleanup Cancelled/Filled Orders
 * Deletes orders older than 2 days to free storage space
 * Run this periodically until TTL index takes effect
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';

async function cleanupCancelledOrders() {
  console.log('Connecting to MongoDB...\n');
  
  await mongoose.connect(MONGODB_URI);
  
  const Order = require('../src/models/Order');
  
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  
  console.log('=== CLEANING CANCELLED/FILLED ORDERS ===');
  console.log('Cutoff date:', twoDaysAgo.toISOString());
  
  // Count cancelled orders older than 2 days
  const cancelledQuery = {
    status: 'cancelled',
    updatedAt: { $lt: twoDaysAgo }
  };
  const cancelledCount = await Order.countDocuments(cancelledQuery);
  console.log('\nCancelled orders > 2 days:', cancelledCount);
  
  // Count filled orders older than 2 days
  const filledQuery = {
    status: 'filled',
    updatedAt: { $lt: twoDaysAgo }
  };
  const filledCount = await Order.countDocuments(filledQuery);
  console.log('Filled orders > 2 days:', filledCount);
  
  const totalToDelete = cancelledCount + filledCount;
  console.log('\nTotal to delete:', totalToDelete);
  
  if (totalToDelete === 0) {
    console.log('\n✅ No old orders to clean up');
    await mongoose.disconnect();
    return;
  }
  
  // Delete in batches using bulk delete by IDs
  const batchSize = 5000;
  let deletedCancelled = 0;
  let deletedFilled = 0;
  
  // Delete cancelled orders by fetching IDs and deleting
  while (deletedCancelled < cancelledCount) {
    const ordersToDelete = await Order.find(cancelledQuery).select('_id').limit(batchSize).lean();
    if (ordersToDelete.length === 0) break;
    
    const ids = ordersToDelete.map(o => o._id);
    const result = await Order.deleteMany({ _id: { $in: ids } });
    deletedCancelled += result.deletedCount;
    process.stdout.write(`\rDeleted cancelled: ${deletedCancelled}/${cancelledCount}`);
  }
  
  console.log(`\n✅ Deleted ${deletedCancelled} cancelled orders`);
  
  // Delete filled orders
  while (deletedFilled < filledCount) {
    const ordersToDelete = await Order.find(filledQuery).select('_id').limit(batchSize).lean();
    if (ordersToDelete.length === 0) break;
    
    const ids = ordersToDelete.map(o => o._id);
    const result = await Order.deleteMany({ _id: { $in: ids } });
    deletedFilled += result.deletedCount;
    process.stdout.write(`\rDeleted filled: ${deletedFilled}/${filledCount}`);
  }
  
  console.log(`\n✅ Deleted ${deletedFilled} filled orders`);
  
  // Final stats
  const remaining = await Order.countDocuments();
  console.log('\n=== FINAL STATS ===');
  console.log('Total orders remaining:', remaining);
  
  await mongoose.disconnect();
  console.log('\n✅ Cleanup complete!');
}

cleanupCancelledOrders().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
