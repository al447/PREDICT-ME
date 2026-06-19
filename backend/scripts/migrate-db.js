/**
 * Database Migration Script
 * Copies all data from old MongoDB to new MongoDB
 */

const { MongoClient } = require('mongodb');

const OLD_URI = 'mongodb+srv://peonyk007_db_user:eWWIdD0OovhKc0Xc@cluster0.caozlq5.mongodb.net/polybet365';
const NEW_URI = 'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';

const COLLECTIONS_TO_COPY = [
  'markets',
  'users',
  'orders',
  'transactions',
  'marketpricesnapshots',
  'notifications',
  'userpositions',
  'onchainorders',
  'bridgedeposits',
  'bridgewithdrawals'
];

async function migrate() {
  console.log('Connecting to databases...');
  
  const oldClient = new MongoClient(OLD_URI);
  const newClient = new MongoClient(NEW_URI);
  
  await oldClient.connect();
  await newClient.connect();
  
  const oldDb = oldClient.db('polybet365');
  const newDb = newClient.db('predictme');
  
  console.log('Connected! Starting migration...\n');
  
  for (const collectionName of COLLECTIONS_TO_COPY) {
    try {
      const oldCollection = oldDb.collection(collectionName);
      const newCollection = newDb.collection(collectionName);
      
      const count = await oldCollection.countDocuments();
      console.log(`${collectionName}: ${count} documents found`);
      
      if (count === 0) {
        console.log(`  → Skipping (empty)\n`);
        continue;
      }
      
      // Clear new collection first
      await newCollection.deleteMany({});
      
      // Copy in batches
      const batchSize = 1000;
      let copied = 0;
      
      const cursor = oldCollection.find({});
      let batch = [];
      
      for await (const doc of cursor) {
        batch.push(doc);
        
        if (batch.length >= batchSize) {
          await newCollection.insertMany(batch);
          copied += batch.length;
          batch = [];
          process.stdout.write(`  → Copied ${copied}/${count}\r`);
        }
      }
      
      if (batch.length > 0) {
        await newCollection.insertMany(batch);
        copied += batch.length;
      }
      
      console.log(`  → ✅ Copied ${copied} documents\n`);
      
    } catch (err) {
      console.error(`  → ❌ Error: ${err.message}\n`);
    }
  }
  
  await oldClient.close();
  await newClient.close();
  
  console.log('Migration complete!');
}

migrate().catch(console.error);
