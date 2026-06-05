const mongoose = require('mongoose');

const marketPriceSnapshotSchema = new mongoose.Schema(
  {
    market: { type: mongoose.Schema.Types.ObjectId, ref: 'Market', required: true, index: true },
    outcome: { type: String, required: true }, // e.g., "Yes" or "No"
    price: { type: Number, required: true }, // 0-100
    probability: { type: Number, required: true }, // 0-100
    volume: { type: Number, default: 0 }, // total market volume at this moment
    liquidity: { type: Number, default: 0 }, // market liquidity at this moment
    source: { type: String, enum: ['trade', 'cron', 'manual'], default: 'trade' }, // why this snapshot was taken
  },
  { timestamps: true }
);

// Compound index for efficient querying by market + time range
marketPriceSnapshotSchema.index({ market: 1, createdAt: -1 });
marketPriceSnapshotSchema.index({ market: 1, outcome: 1, createdAt: -1 });

module.exports = mongoose.model('MarketPriceSnapshot', marketPriceSnapshotSchema);
