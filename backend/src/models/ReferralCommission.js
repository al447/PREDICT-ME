const mongoose = require('mongoose');

const referralCommissionSchema = new mongoose.Schema(
  {
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trade: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true, index: true },
    tradeAmount: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    rate: { type: Number, required: true }, // the % applied
    status: { type: String, enum: ['paid', 'reversed'], default: 'paid' },
  },
  { timestamps: true }
);

// Unique index to prevent duplicate commissions per trade
referralCommissionSchema.index({ referrer: 1, referee: 1, trade: 1 }, { unique: true });

module.exports = mongoose.model('ReferralCommission', referralCommissionSchema);
