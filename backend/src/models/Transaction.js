const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'trade', 'referral_signup_bonus', 'referral_commission', 'referral_milestone', 'referral_admin_adjustment'],
      required: true,
    },
    amount: { type: Number, required: true }, // positive for credit, negative for debit
    balance: { type: Number, required: true }, // balance after this transaction
    metadata: {
      referralId: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral' },
      refereeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      milestone: { type: Number }, // milestone tier count if applicable
      reason: { type: String }, // for admin adjustments
      txHash: { type: String }, // for crypto deposits
      tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
      marketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Market' },
      fee: { type: Number },   // platform fee deducted
      gross: { type: Number }, // gross before fee
      toAddress: { type: String },        // withdrawal destination wallet
      needsReview: { type: Boolean },      // flagged for manual review (ambiguous withdrawal)
      error: { type: String },             // failure reason on failed/pending tx
      adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who adjusted
      originalCommissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralCommission' }, // reversed commission
    },
    status: {
      type: String,
      enum: ['completed', 'pending', 'failed', 'reversed'],
      default: 'completed',
    },
  },
  { timestamps: true }
);

// Index for querying user history
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
