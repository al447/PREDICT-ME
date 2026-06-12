const mongoose = require('mongoose');

const pendingDepositSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    chain: { type: String, required: true },
    token: { type: String, required: true },
    txHash: { type: String, unique: true, sparse: true },
    claimedAmountUsd: { type: Number, default: null },
    sender: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'credited', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    creditedAmountUsd: { type: Number, default: null },
    notes: { type: String, default: '' },
    source: { type: String, enum: ['manual', 'indexer', 'moonpay', 'auto-verified', 'auto-indexer', 'manual-admin', 'funkit'], default: 'manual' },
    provider: { type: String, enum: ['manual', 'moonpay', 'funkit'], default: 'manual' },
    providerTxId: { type: String, unique: true, sparse: true, index: true },
    providerStatus: { type: String, default: null },
    providerPayload: { type: Object, default: null },
    exchange: { type: String, enum: ['coinbase', 'bybit', null], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingDeposit', pendingDepositSchema);
