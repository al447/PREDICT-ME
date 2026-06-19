/**
 * cleanup-db.js
 * Frees Atlas storage by removing stale data.
 * Run: node scripts/cleanup-db.js
 * Safe to run on a live cluster — only deletes old / expired records.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ── Helper ──────────────────────────────────────────────────────────────────
  async function drop(collectionName, filter, label) {
    try {
      const col = db.collection(collectionName);
      const count = await col.countDocuments(filter);
      if (count === 0) {
        console.log(`  [SKIP] ${label}: 0 documents match`);
        return;
      }
      const result = await col.deleteMany(filter);
      console.log(`  [DEL]  ${label}: removed ${result.deletedCount} / ${count} documents`);
    } catch (err) {
      console.error(`  [ERR]  ${label}: ${err.message}`);
    }
  }

  const now = new Date();

  // ── 1. Price Snapshots older than 7 days ────────────────────────────────────
  console.log('1. MarketPriceSnapshots (keep last 7 days)');
  const snapshotCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
  await drop('marketpricesnapshots', { createdAt: { $lt: snapshotCutoff } }, '> 7 days old');

  // ── 2. Notifications ─────────────────────────────────────────────────────────
  console.log('\n2. Notifications');
  const notifCutoff30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const notifCutoff90 = new Date(now - 90 * 24 * 60 * 60 * 1000);

  await drop('notifications', { dismissed: true, createdAt: { $lt: notifCutoff30 } },   'dismissed > 30 days');
  await drop('notifications', { read: true,      createdAt: { $lt: notifCutoff30 } },   'read > 30 days');
  await drop('notifications', {                  createdAt: { $lt: notifCutoff90 } },   'any > 90 days');
  await drop('notifications', { expiresAt: { $lt: now, $ne: null } },                   'past expiresAt');

  // ── 3. Expired / revoked Refresh Tokens ─────────────────────────────────────
  console.log('\n3. RefreshTokens');
  await drop('refreshtokens', { expiresAt: { $lt: now } },   'expired');
  await drop('refreshtokens', { revoked: true,
                                 updatedAt: { $lt: new Date(now - 7 * 24 * 60 * 60 * 1000) } },
             'revoked > 7 days');

  // ── 4. Admin Audit Logs older than 90 days ──────────────────────────────────
  console.log('\n4. AdminAuditLogs');
  const auditCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
  await drop('adminauditlogs', { createdAt: { $lt: auditCutoff } }, '> 90 days old');

  // ── 5. Cancelled / expired CLOB Orders older than 30 days ───────────────────
  console.log('\n5. Orders (cancelled/expired > 30 days)');
  const orderCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  await drop('orders', {
    status: { $in: ['cancelled', 'expired', 'filled'] },
    updatedAt: { $lt: orderCutoff },
  }, 'terminal status > 30 days');

  // ── 6. Completed/failed BridgeDeposits & BridgeWithdrawals > 30 days ────────
  console.log('\n6. BridgeDeposits / BridgeWithdrawals (completed/failed > 30 days)');
  const bridgeCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  await drop('bridgedeposits',    { status: { $in: ['completed', 'failed'] }, updatedAt: { $lt: bridgeCutoff } }, 'completed/failed > 30d');
  await drop('bridgewithdrawals', { status: { $in: ['completed', 'failed'] }, updatedAt: { $lt: bridgeCutoff } }, 'completed/failed > 30d');

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\nDone. Run db.stats() in Atlas to confirm storage freed.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
