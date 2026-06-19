/**
 * Emergency Storage Cleanup - Delete Old Data to Free Space
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';

async function freeStorage() {
  console.log('Connecting to MongoDB...\n');
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('predictme');
  
  // 1. Delete old MarketPriceSnapshots (older than 3 days - more aggressive)
  console.log('1. Cleaning MarketPriceSnapshots...');
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const snapshotsColl = db.collection('marketpricesnapshots');
  const snapshotCount = await snapshotsColl.countDocuments({ createdAt: { $lt: threeDaysAgo } });
  console.log(`   Found ${snapshotCount} snapshots older than 3 days`);
  if (snapshotCount > 0) {
    await snapshotsColl.deleteMany({ createdAt: { $lt: threeDaysAgo } });
    console.log(`   ✅ Deleted ${snapshotCount} snapshots`);
  }
  
  // 2. Delete old orders (cancelled/expired older than 7 days)
  console.log('\n2. Cleaning old Orders...');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const ordersColl = db.collection('orders');
  const oldOrders = await ordersColl.countDocuments({
    status: { $in: ['cancelled', 'expired', 'filled'] },
    updatedAt: { $lt: sevenDaysAgo }
  });
  console.log(`   Found ${oldOrders} old completed/cancelled orders`);
  if (oldOrders > 0) {
    await ordersColl.deleteMany({
      status: { $in: ['cancelled', 'expired', 'filled'] },
      updatedAt: { $lt: sevenDaysAgo }
    });
    console.log(`   ✅ Deleted ${oldOrders} orders`);
  }
  
  // 3. Delete old notifications
  console.log('\n3. Cleaning Notifications...');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const notifColl = db.collection('notifications');
  const oldNotifs = await notifColl.countDocuments({ createdAt: { $lt: thirtyDaysAgo } });
  console.log(`   Found ${oldNotifs} old notifications`);
  if (oldNotifs > 0) {
    await notifColl.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
    console.log(`   ✅ Deleted ${oldNotifs} notifications`);
  }
  
  // 4. Count remaining to estimate savings
  console.log('\n4. Current collection sizes:');
  const collections = ['marketpricesnapshots', 'orders', 'markets', 'users', 'notifications'];
  for (const name of collections) {
    const count = await db.collection(name).countDocuments();
    console.log(`   ${name}: ${count} documents`);
  }
  
  await client.close();
  console.log('\n✅ Cleanup complete! Check Atlas dashboard for storage usage.');
  console.log('   May take a few minutes for MongoDB to reclaim space.');
}

freeStorage().catch(console.error);
