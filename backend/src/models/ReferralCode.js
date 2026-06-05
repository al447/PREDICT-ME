const mongoose = require('mongoose');

const referralCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    totalReferred: { type: Number, default: 0 }, // qualifying count
    pendingReferred: { type: Number, default: 0 }, // signed up but not yet qualified
    totalEarned: { type: Number, default: 0 }, // lifetime $ earned
    pendingEarned: { type: Number, default: 0 }, // currently locked $
    isBanned: { type: Boolean, default: false },
    milestonesPaid: { type: [Number], default: [] }, // e.g. [5, 10] — already-paid milestone counts
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReferralCode', referralCodeSchema);
