/**
 * migrateBalancesToProxy.js — Phase 3 migration script
 *
 * For each user with a positive DB balance who does NOT yet have a proxy wallet:
 *   1. Provision their proxy address (predict, no deploy)
 *   2. Set proxyType / signatureType based on authProvider
 *   3. Leave balance in DB as-is (on-chain sync will overwrite once they deposit)
 *
 * For users who already have a proxy:
 *   - Patch proxyType / signatureType if missing (upgrade from old schema)
 *
 * Run once after deploying the schema change:
 *   node src/scripts/migrateBalancesToProxy.js
 *
 * Safe to re-run (idempotent).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const walletService = require('../services/walletService');

const BATCH_SIZE = 50;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Migrate] Connected to MongoDB');

  const total = await User.countDocuments({});
  console.log(`[Migrate] Total users: ${total}`);

  let processed = 0;
  let provisioned = 0;
  let patched = 0;
  let skipped = 0;
  let errors = 0;

  let offset = 0;
  while (offset < total) {
    const users = await User.find({}).skip(offset).limit(BATCH_SIZE).lean();
    if (!users.length) break;

    for (const user of users) {
      try {
        const { proxyType, signatureType } = walletService.resolveProxyType(user);

        if (user.smartWallet?.proxy) {
          // Already has proxy — patch type fields if missing
          if (!user.smartWallet.proxyType || !user.smartWallet.signatureType) {
            await User.findByIdAndUpdate(user._id, {
              'smartWallet.proxyType':     proxyType,
              'smartWallet.signatureType': signatureType,
            });
            patched++;
            console.log(`[Migrate] Patched user ${user._id} → ${proxyType} sigType=${signatureType}`);
          } else {
            skipped++;
          }
          continue;
        }

        // No proxy yet — need a wallet address to predict from
        const owner = user.walletAddress;
        if (!owner) {
          console.warn(`[Migrate] User ${user._id} has no walletAddress — cannot provision proxy`);
          skipped++;
          continue;
        }

        // Provision proxy address (predict only, no on-chain tx)
        const userDoc = await User.findById(user._id);
        await walletService.ensureSmartWallet(userDoc);
        provisioned++;
        console.log(`[Migrate] Provisioned ${proxyType} proxy for user ${user._id}`);

      } catch (err) {
        errors++;
        console.error(`[Migrate] Error for user ${user._id}: ${err.message}`);
      }

      processed++;
    }

    offset += BATCH_SIZE;
    console.log(`[Migrate] Progress: ${offset}/${total} (provisioned=${provisioned}, patched=${patched}, skipped=${skipped}, errors=${errors})`);
  }

  console.log(`\n[Migrate] Done.`);
  console.log(`  Total processed : ${processed}`);
  console.log(`  Provisioned     : ${provisioned}`);
  console.log(`  Type-patched    : ${patched}`);
  console.log(`  Skipped         : ${skipped}`);
  console.log(`  Errors          : ${errors}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('[Migrate] Fatal:', err.message);
  process.exit(1);
});
