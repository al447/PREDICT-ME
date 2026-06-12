require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { runSync } = require('../services/marketSyncService');

// Override env to ensure sync runs regardless of MARKET_SYNC_ENABLED
process.env.MARKET_SYNC_ENABLED = 'true';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[SyncScript] MongoDB connected');
  await runSync();
  await mongoose.disconnect();
  console.log('[SyncScript] Done');
}

main().catch(err => {
  console.error('[SyncScript] Fatal:', err.message);
  process.exit(1);
});
