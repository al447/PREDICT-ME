const mongoose = require('mongoose');

const tierSchema = new mongoose.Schema({
  count: { type: Number, required: true },
  reward: { type: Number, required: true },
}, { _id: false });

const referralConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },
    signupBonusReferrer: { type: Number, default: 10 },
    signupBonusReferee: { type: Number, default: 5 },
    commissionRate: { type: Number, default: 0.05 }, // 5% of platform fee
    platformFeeRate: { type: Number, default: 0.02 }, // baseline (mirrors trade fee)
    qualifyingTradeThreshold: { type: Number, default: 5 },
    milestoneTiers: { type: [tierSchema], default: [
      { count: 5, reward: 50 },
      { count: 10, reward: 150 },
      { count: 25, reward: 500 },
      { count: 100, reward: 2500 },
    ]},
    cookieDaysTTL: { type: Number, default: 30 },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Ensure singleton via compound index
referralConfigSchema.index({ _id: 1 });

module.exports = mongoose.model('ReferralConfig', referralConfigSchema);
