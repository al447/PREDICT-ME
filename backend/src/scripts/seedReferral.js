const mongoose = require('mongoose');
const User = require('../models/User');
const ReferralCode = require('../models/ReferralCode');
const ReferralConfig = require('../models/ReferralConfig');
const { generateUniqueCode } = require('../services/referralService');
require('dotenv').config();

const seedReferral = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Seed] Connected to MongoDB');

    // 1. Ensure ReferralConfig singleton exists
    let config = await ReferralConfig.findById('singleton');
    if (!config) {
      config = await ReferralConfig.create({ _id: 'singleton' });
      console.log('[Seed] Created ReferralConfig with defaults:', {
        signupBonusReferrer: config.signupBonusReferrer,
        signupBonusReferee: config.signupBonusReferee,
        commissionRate: config.commissionRate,
      });
    } else {
      console.log('[Seed] ReferralConfig already exists');
    }

    // 2. Backfill referral codes for existing users that have none
    const usersWithoutCode = await User.find({
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
      ],
    });

    console.log(`[Seed] Found ${usersWithoutCode.length} users without referral codes`);

    let created = 0;
    let failed = 0;

    for (const user of usersWithoutCode) {
      try {
        await generateUniqueCode(user._id);
        created++;
        if (created % 100 === 0) {
          console.log(`[Seed] Created ${created} codes so far...`);
        }
      } catch (err) {
        console.error(`[Seed] Failed to create code for user ${user._id}:`, err.message);
        failed++;
      }
    }

    console.log(`[Seed] Complete. Created: ${created}, Failed: ${failed}`);
    console.log('[Seed] Referral system ready');
  } catch (err) {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

if (require.main === module) {
  seedReferral();
}

module.exports = { seedReferral };
