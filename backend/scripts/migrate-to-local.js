/**
 * Copy Production Data to Local Database
 * Copies from 'predictme' to 'polybet365' on same cluster
 */

const { MongoClient } = require('mongodb');

const SOURCE_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';
const TARGET_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/polybet365';

const COLLECTIONS_TO_COPY = [
  'markets',
  'users',
  'orders',
  'transactions',
  'notifications',
  'userpositions',
  'onchainorders',
  'bridgedeposits',
  'bridgewithdrawals'
  // Note: NOT copying marketpricesnapshots (too large, auto-generated)
];

async function migrate() {
  console.log('Copying production data to local database...\n');
  
  const sourceClient = new MongoClient(SOURCE_URI);
  const targetClient = new MongoClient(TARGET_URI);
  
  await sourceClient.connect();
  await targetClient.connect();
  
  const sourceDb = sourceClient.db('predictme');
  const targetDb = targetClient.db('polybet365');
  
  for (const collectionName of COLLECTIONS_TO_COPY) {
    try {
      const sourceColl = sourceDb.collection(collectionName);
      const targetColl = targetDb.collection(collectionName);
      
      const count = await sourceColl.countDocuments();
      console.log(`${collectionName}: ${count} documents`);
      
      if (count === 0) {
        console.log(`  → Skipping (empty)\n`);
        continue;
      }
      
      // Clear target first
      await targetColl.deleteMany({});
      
      // Copy in batches
      const batchSize = 1000;
      let copied = 0;
      
      const cursor = sourceColl.find({});
      let batch = [];
      
      for await (const doc of cursor) {
        batch.push(doc);
        
        if (batch.length >= batchSize) {
          await targetColl.insertMany(batch);
          copied += batch.length;
          batch = [];
          process.stdout.write(`  → Copied ${copied}/${count}\r`);
        }
      }
      
      if (batch.length > 0) {
        await targetColl.insertMany(batch);
        copied += batch.length;
      }
      
      console.log(`  → ✅ Copied ${copied} documents\n`);
      
    } catch (err) {
      console.error(`  → ❌ Error: ${err.message}\n`);
    }
  }
  
  await sourceClient.close();
  await targetClient.close();
  
  console.log('Local database now has production data!');
  console.log('You can now view markets locally.');
}

migrate().catch(console.error);
