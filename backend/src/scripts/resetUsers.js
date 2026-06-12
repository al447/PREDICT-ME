/**
 * resetUsers.js — Reset all non-admin users and all trading/deposit data.
 *
 * Preserves: admin user, markets, categories, referral config.
 * Wipes:     all non-admin users + their smart wallets, all orders, trades,
 *            deposits, withdrawals, positions, notifications, referral history,
 *            indexer cursors, refresh tokens.
 *
 * Usage:
 *   node src/scripts/resetUsers.js           -- dry run (shows counts)
 *   node src/scripts/resetUsers.js --confirm -- executes the wipe
 *
 * ⚠️  DESTRUCTIVE — testnet only.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--confirm');

if (DRY_RUN) {
  console.log('=== DRY RUN mode — pass --confirm to execute ===\n');
}

const User               = require('../models/User');
const Order              = require('../models/Order');
const Trade              = require('../models/Trade');
const Transaction        = require('../models/Transaction');
const Deposit            = require('../models/Deposit');
const PendingDeposit     = require('../models/PendingDeposit');
const Withdrawal         = require('../models/Withdrawal');
const RefreshToken       = require('../models/RefreshToken');
const Referral           = require('../models/Referral');
const ReferralCode       = require('../models/ReferralCode');
const ReferralCommission = require('../models/ReferralCommission');
const IndexerCursor      = require('../models/IndexerCursor');
const Notification       = require('../models/Notification');

// ── Magic Admin SDK (best-effort session revocation) ────────────────────────
let magicAdmin = null;
if (process.env.MAGIC_SECRET_KEY) {
  try {
    const { Magic } = require('@magic-sdk/admin');
    magicAdmin = new Magic(process.env.MAGIC_SECRET_KEY);
  } catch (_) {}
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected\n');

  // Find admin emails to preserve
  const adminUsers = await User.find({ role: 'admin' }, 'email _id').lean();
  const adminIds   = adminUsers.map(u => u._id);
  const adminEmails = adminUsers.map(u => u.email).filter(Boolean);
  console.log(`[Admin] Preserving ${adminUsers.length} admin user(s): ${adminEmails.join(', ') || '(none)'}\n`);

  // Non-admin users to wipe
  const nonAdminUsers = await User.find({ role: { $ne: 'admin' } }, 'email authProvider').lean();

  const counts = {
    'non-admin users':    nonAdminUsers.length,
    orders:               await Order.countDocuments(),
    trades:               await Trade.countDocuments(),
    transactions:         await Transaction.countDocuments(),
    deposits:             await Deposit.countDocuments(),
    pendingDeposits:      await PendingDeposit.countDocuments(),
    withdrawals:          await Withdrawal.countDocuments(),
    refreshTokens:        await RefreshToken.countDocuments({ userId: { $nin: adminIds } }),
    referrals:            await Referral.countDocuments(),
    referralCodes:        await ReferralCode.countDocuments({ userId: { $nin: adminIds } }),
    referralCommissions:  await ReferralCommission.countDocuments(),
    indexerCursors:       await IndexerCursor.countDocuments(),
    notifications:        await Notification.countDocuments({ userId: { $nin: adminIds } }),
  };

  console.log('=== Records to be deleted ===');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(24)} ${v}`));
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN complete. Re-run with --confirm to execute.\n');
    await mongoose.disconnect();
    return;
  }

  // Revoke Magic sessions (best-effort)
  if (magicAdmin) {
    const magicUsers = nonAdminUsers.filter(u => u.authProvider === 'magic' && u.email);
    console.log(`[Magic] Revoking sessions for ${magicUsers.length} Magic user(s)...`);
    for (const u of magicUsers) {
      try { await magicAdmin.users.logoutByEmail(u.email); } catch (_) {}
    }
  }

  // Wipe collections
  const ops = [
    ['non-admin users',   User.deleteMany({ role: { $ne: 'admin' } })],
    ['orders',            Order.deleteMany({})],
    ['trades',            Trade.deleteMany({})],
    ['transactions',      Transaction.deleteMany({})],
    ['deposits',          Deposit.deleteMany({})],
    ['pendingDeposits',   PendingDeposit.deleteMany({})],
    ['withdrawals',       Withdrawal.deleteMany({})],
    ['refreshTokens',     RefreshToken.deleteMany({ userId: { $nin: adminIds } })],
    ['referrals',         Referral.deleteMany({})],
    ['referralCodes',     ReferralCode.deleteMany({ userId: { $nin: adminIds } })],
    ['referralCommissions', ReferralCommission.deleteMany({})],
    ['indexerCursors',    IndexerCursor.deleteMany({})],
    ['notifications',     Notification.deleteMany({ userId: { $nin: adminIds } })],
  ];

  const results = await Promise.allSettled(ops.map(([, q]) => q));
  results.forEach((r, i) => {
    const label = ops[i][0].padEnd(24);
    if (r.status === 'fulfilled') {
      console.log(`  ✅  ${label} deleted ${r.value.deletedCount}`);
    } else {
      console.error(`  ❌  ${label} FAILED: ${r.reason?.message}`);
    }
  });

  console.log('\n✅  Reset complete.');
  console.log('    Admin user(s) preserved. Markets and categories untouched.');
  console.log('    Re-seed admin if needed: node src/scripts/seedAdmin.js\n');

  await mongoose.disconnect();
};

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
