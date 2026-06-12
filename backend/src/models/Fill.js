/**
 * Fill Model
 * Records every CLOB match/settlement — the canonical execution history.
 * Used for: last-trade price, activity feed, charts, and audit trail.
 * Mirrors to Trade for platform-user-facing features (positions, leaderboard).
 */

const mongoose = require('mongoose');

const fillSchema = new mongoose.Schema(
  {
    // Market identification
    conditionId: { type: String, required: true, index: true }, // CTF conditionId (market or candidate)
    tokenId: { type: String, required: true, index: true },      // ERC1155 token ID (YES=1 or NO=2)
    market: { type: mongoose.Schema.Types.ObjectId, ref: 'Market', required: true, index: true },
    candidate: { type: String, default: null },                  // For grouped markets: candidate name (e.g. "Spain")

    // Order linkage
    makerOrderId: { type: String, required: true, index: true },
    takerOrderId: { type: String, required: true, index: true },

    // Participants
    makerAddress: { type: String, required: true, lowercase: true, index: true }, // Safe proxy or EOA
    takerAddress: { type: String, required: true, lowercase: true, index: true },
    makerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // null if external/MM
    takerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isMakerBot: { type: Boolean, default: false, index: true }, // true if maker is operator/maker-bot

    // Trade details
    side: { type: String, enum: ['buy', 'sell'], required: true }, // From taker perspective: 'buy' = taker bought YES
    price: { type: Number, required: true, min: 0.01, max: 0.99 },  // Price in dollars (e.g. 0.65 = 65¢)
    size: { type: Number, required: true, min: 0 },                 // Shares filled
    notional: { type: Number, required: true, min: 0 },              // USDC amount (price * size)

    // On-chain settlement
    settlementTxHash: { type: String, required: true, index: true },
    blockNumber: { type: Number, default: null },

    // Fee tracking
    takerFee: { type: Number, default: 0 }, // 2% of notional in USDC

    // NegRisk flag
    negRisk: { type: Boolean, default: false },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient querying
fillSchema.index({ conditionId: 1, createdAt: -1 });           // Last-trade price lookup
fillSchema.index({ market: 1, createdAt: -1 });                // Market activity feed
fillSchema.index({ takerUser: 1, createdAt: -1 });             // User activity
fillSchema.index({ makerUser: 1, createdAt: -1 });           // User activity (as maker)
fillSchema.index({ isMakerBot: 1, createdAt: -1 });            // Bot activity (for filtering)
fillSchema.index({ conditionId: 1, isMakerBot: 1, createdAt: -1 }); // Activity excluding bot

// Virtual for price in cents (for display)
fillSchema.virtual('priceCents').get(function() {
  return Math.round(this.price * 100);
});

// Static method to check if fill exists by settlementTxHash + order combination (idempotency)
fillSchema.statics.existsBySettlement = async function(settlementTxHash, makerOrderId, takerOrderId) {
  const existing = await this.findOne({
    settlementTxHash,
    makerOrderId,
    takerOrderId,
  }).lean();
  return !!existing;
};

module.exports = mongoose.model('Fill', fillSchema);
