const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    market: { type: mongoose.Schema.Types.ObjectId, ref: 'Market', required: true },
    outcome: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    shares: { type: Number, required: true },
    type: { type: String, enum: ['buy', 'sell'], default: 'buy' },
    status: { type: String, enum: ['open', 'closed', 'won', 'lost', 'refunded'], default: 'open' },
    txHash: { type: String, default: null },
    idempotencyKey: { type: String, default: null },
    payout: { type: Number, default: null }, // net payout credited on win/refund
  },
  { timestamps: true }
);

tradeSchema.index({ user: 1 });
tradeSchema.index({ market: 1 });
tradeSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Trade', tradeSchema);
