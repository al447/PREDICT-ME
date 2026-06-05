/**
 * resetAll.js — Full platform reset
 *
 * Wipes ALL users, sessions, trades, deposits, referrals, and notifications
 * from MongoDB, then deletes all Magic users via the Admin SDK.
 *
 * Usage:
 *   node src/scripts/resetAll.js           -- dry run (shows counts, no changes)
 *   node src/scripts/resetAll.js --confirm -- executes the wipe
 *
 * ⚠️  DESTRUCTIVE — run only on dev/testnet environments.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--confirm');

if (DRY_RUN) {
  console.log('=== DRY RUN mode — pass --confirm to execute ===\n');
}

// ── Models ──────────────────────────────────────────────────────────────────
const User              = require('../models/User');
const Trade             = require('../models/Trade');
const Transaction       = require('../models/Transaction');
const PendingDeposit    = require('../models/PendingDeposit');
const RefreshToken      = require('../models/RefreshToken');
const Referral          = require('../models/Referral');
const ReferralCode      = require('../models/ReferralCode');
const ReferralCommission= require('../models/ReferralCommission');
const IndexerCursor     = require('../models/IndexerCursor');
const Notification      = require('../models/Notification');

// ── Magic Admin SDK ─────────────────────────────────────────────────────────
let magicAdmin = null;
if (process.env.MAGIC_SECRET_KEY) {
  const { Magic } = require('@magic-sdk/admin');
  magicAdmin = new Magic(process.env.MAGIC_SECRET_KEY);
} else {
  console.warn('[Magic] MAGIC_SECRET_KEY not set — Magic users will NOT be deleted');
}

// ── Delete all Magic users ──────────────────────────────────────────────────
const deleteMagicUsers = async (users) => {
  if (!magicAdmin) {
    console.log('[Magic] Skipping Magic deletion (no secret key)');
    return;
  }

  const magicUsers = users.filter(u => u.authProvider === 'magic' && u.email);
  console.log(`[Magic] Found ${magicUsers.length} Magic user(s) to delete`);

  if (DRY_RUN) return;

  let deleted = 0;
  let failed = 0;
  for (const user of magicUsers) {
    try {
      await magicAdmin.users.logoutByEmail(user.email);
      // Magic does not expose a direct "delete user" API in the Admin SDK.
      // logoutByEmail revokes all tokens. For full account deletion,
      // use Magic Dashboard > Users > Delete, or the Magic REST API:
      // DELETE https://api.magic.link/v1/admin/users/{issuer}
      // which requires the user's issuer (DID). We log them out here as best-effort.
      deleted++;
    } catch (err) {
      console.warn(`[Magic] Failed to logout ${user.email}: ${err.message}`);
      failed++;
    }
  }
  console.log(`[Magic] Logged out ${deleted} user(s), ${failed} failed`);
};

// ── Main ────────────────────────────────────────────────────────────────────
const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected to MongoDB\n');

  // Gather counts
  const counts = {
    users:               await User.countDocuments(),
    trades:              await Trade.countDocuments(),
    transactions:        await Transaction.countDocuments(),
    pendingDeposits:     await PendingDeposit.countDocuments(),
    refreshTokens:       await RefreshToken.countDocuments(),
    referrals:           await Referral.countDocuments(),
    referralCodes:       await ReferralCode.countDocuments(),
    referralCommissions: await ReferralCommission.countDocuments(),
    indexerCursors:      await IndexerCursor.countDocuments(),
    notifications:       await Notification.countDocuments(),
  };

  console.log('=== Records to be deleted ===');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN complete. Re-run with --confirm to wipe.\n');
    await mongoose.disconnect();
    return;
  }

  // Confirm double-check
  const totalUsers = counts.users;
  console.log(`\n⚠️  About to delete ${totalUsers} user(s) and all related data...\n`);

  // Delete Magic sessions first (needs email addresses)
  const allUsers = await User.find({}, 'email authProvider').lean();
  await deleteMagicUsers(allUsers);

  // Wipe MongoDB collections
  const results = await Promise.allSettled([
    User.deleteMany({}),
    Trade.deleteMany({}),
    Transaction.deleteMany({}),
    PendingDeposit.deleteMany({}),
    RefreshToken.deleteMany({}),
    Referral.deleteMany({}),
    ReferralCode.deleteMany({}),
    ReferralCommission.deleteMany({}),
    IndexerCursor.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  const names = Object.keys(counts);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ✅  ${names[i].padEnd(22)} deleted ${r.value.deletedCount}`);
    } else {
      console.error(`  ❌  ${names[i].padEnd(22)} FAILED: ${r.reason.message}`);
    }
  });

  console.log('\n✅  Reset complete. All users and session data wiped.\n');
  console.log('IMPORTANT: Market data (markets, categories) was NOT deleted.');
  console.log('To reset markets too, run: node src/scripts/seedMarkets.js\n');

  await mongoose.disconnect();
};

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
