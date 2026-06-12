const mongoose = require('mongoose');

const outcomeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  probability: { type: Number, min: 0, max: 100, default: 50 },
  price: { type: Number, min: 0, max: 100, default: 50 },
});

// One candidate in a grouped/negRisk event (e.g. "Spain", "France" in World Cup)
const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },          // groupItemTitle e.g. "Spain"
  probability: { type: Number, default: 50 },       // YES % (0-100)
  polymarketTokenId: { type: String, default: null }, // CLOB YES token
  conditionId: { type: String, default: null },
  image: { type: String, default: null },
});

const newsLinkSchema = new mongoose.Schema({
  source: { type: String },
  title: { type: String },
  url: { type: String, default: '#' },
  timestamp: { type: String },
});

const marketSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    categorySlug: { type: String, required: true, lowercase: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    status: { type: String, enum: ['draft', 'active', 'closed', 'resolved'], default: 'active' },
    outcomes: [outcomeSchema],
    volume: { type: Number, default: 0 },
    tradeCount: { type: Number, default: 0 },
    liquidity: { type: Number, default: 0 },
    endDate: { type: Date },
    resolution: { type: String, default: null },
    resolvedOutcome: { type: String, enum: ['yes', 'no', 'cancelled', null], default: null },
    polymarketTokenId: { type: String, default: null }, // For real CLOB orderbook data
    conditionId: { type: String, default: null },       // Polymarket condition ID
    // ── M1 On-Chain Fields ───────────────────────────────────────────────
    questionId: { type: String, default: null },        // UMA questionId
    token0: { type: String, default: null },            // YES tokenId (ERC1155)
    token1: { type: String, default: null },            // NO tokenId (ERC1155)
    negRisk: { type: Boolean, default: false },        // NegRisk market flag
    onChainTxHash: { type: String, default: null },     // MarketFactory tx hash
    onChain: { type: Boolean, default: false },          // Successfully published on-chain
    // ── Grouped / multi-candidate fields ────────────────────────────────
    marketType: { type: String, enum: ['binary', 'grouped'], default: 'binary' },
    candidates: [candidateSchema],                      // populated for grouped events
    polymarketEventSlug: { type: String, default: null }, // Polymarket event slug
    faq: { type: String, default: '' },                  // FAQ / rules text from event
    // ────────────────────────────────────────────────────────────────────
    image: { type: String, default: '📊' },
    tags: [{ type: String }],
    featured: { type: Boolean, default: false },
    isNewMarket: { type: Boolean, default: false },
    rewards: { type: Number, default: 0 },
    volume24hr: { type: Number, default: 0 },
    hotTopic: { type: Boolean, default: false },
    frequency: { type: String, default: null },  // e.g. '5min', 'daily', 'weekly'
    subCategory: { type: String, default: null }, // e.g. 'Basketball', 'Bitcoin'
    newsLinks: [newsLinkSchema],
    rules: { type: String, default: '' },
    sourceOfTruth: { type: String, default: '' },
    closeDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    chainlinkResolved: { type: Boolean, default: false }, // true if auto-resolved by Chainlink
    chainlinkPrice: { type: Number, default: null },       // Chainlink price at resolution time
    // ── Price Market fields (Chainlink settlement) ───────────────────────────
    resolutionSource: { type: String, enum: ['chainlink', 'uma', 'admin', null], default: null },
    priceMarket: { type: Boolean, default: false },         // true for crypto price-based markets
    priceSymbol: { type: String, default: null },           // e.g. 'BTC'
    priceTarget: { type: Number, default: null },           // e.g. 100000
    priceComparator: { type: String, enum: ['gte', 'lte', null], default: null }, // gte=above, lte=below
    // ── Chainlink Data Streams audit report ─────────────────────────────────
    chainlinkStreamReport: {
      feedId: { type: String, default: null },
      benchmarkPrice: { type: String, default: null },
      observationsTimestamp: { type: Number, default: null },
      validFromTimestamp: { type: Number, default: null },
      nativeFee: { type: String, default: null },
      fullReport: { type: String, default: null },
      resolvedAt: { type: Date, default: null },
      source: { type: String, default: null }, // 'streams' | 'feed'
    },
  },
  { timestamps: true }
);

marketSchema.index({ categorySlug: 1 });
marketSchema.index({ featured: 1 });
marketSchema.index({ volume: -1 });
marketSchema.index({ createdAt: -1 });
marketSchema.index({ title: 'text' });
// Compound indexes matching the homepage query patterns (status + sort field)
marketSchema.index({ status: 1, volume: -1 });
marketSchema.index({ status: 1, createdAt: -1 });
marketSchema.index({ status: 1, categorySlug: 1, volume: -1 });
marketSchema.index({ featured: 1, status: 1, volume: -1 });
marketSchema.index({ status: 1, volume24hr: -1 });
marketSchema.index({ hotTopic: 1, status: 1 });
marketSchema.index({ conditionId: 1 }, { sparse: true });

// Virtual fields for frontend compatibility — token0=YES, token1=NO
marketSchema.virtual('yesTokenId').get(function() {
  return this.token0;
});

marketSchema.virtual('noTokenId').get(function() {
  return this.token1;
});

// Ensure virtuals are included in JSON responses
marketSchema.set('toJSON', { virtuals: true });
marketSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Market', marketSchema);
