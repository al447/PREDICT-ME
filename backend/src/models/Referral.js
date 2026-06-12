const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    code: { type: String, required: true },
    status: { type: String, enum: ['pending', 'qualified', 'rejected'], default: 'pending' },
    signupBonusReferrer: { type: Number, default: 10 },
    signupBonusReferee: { type: Number, default: 5 },
    signupBonusPaid: { type: Boolean, default: false },
    qualifyingTradeVolume: { type: Number, default: 0 }, // cumulative; updated on each trade until threshold met
    qualifiedAt: { type: Date },
    rejectedReason: { type: String }, // e.g. 'self_referral','same_ip','same_wallet','admin_ban'
    ipAtSignup: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Referral', referralSchema);
