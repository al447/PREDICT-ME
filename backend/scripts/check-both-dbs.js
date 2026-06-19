/**
 * Compare Local and Production Databases
 */

const { MongoClient } = require('mongodb');

const PROD_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';
const LOCAL_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/polybet365';

async function analyze(label, uri, dbName) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`\n========== ${label} (${dbName}) ==========`);

  const Order = db.collection('orders');
  const total = await Order.countDocuments();
  console.log('Total orders:', total);

  const byStatus = await Order.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();
  console.log('By status:');
  byStatus.forEach(s => console.log(`  - ${s._id}: ${s.count}`));

  const makers = await Order.distinct('maker');
  console.log('Unique makers:', makers.length);
  makers.slice(0, 5).forEach(m => console.log(`  - ${m}`));

  // Markets, users
  console.log('Markets:', await db.collection('markets').countDocuments());
  console.log('Users:', await db.collection('users').countDocuments());
  console.log('PriceSnapshots:', await db.collection('marketpricesnapshots').countDocuments());

  // Storage stats
  const stats = await db.stats();
  console.log('Storage used:', (stats.dataSize / 1024 / 1024).toFixed(2), 'MB');

  await client.close();
}

async function main() {
  await analyze('PRODUCTION (Render)', PROD_URI, 'predictme');
  await analyze('LOCAL (Dev)', LOCAL_URI, 'polybet365');
  console.log('\n✅ Analysis complete');
}

main().catch(console.error);
