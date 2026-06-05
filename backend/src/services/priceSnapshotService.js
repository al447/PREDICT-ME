const Market = require('../models/Market');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');

/**
 * Create price snapshots for all active markets.
 * Called hourly by cron job, and can be called manually.
 */
const snapshotAllActiveMarkets = async () => {
  const activeMarkets = await Market.find({ status: 'active' });
  let created = 0;

  for (const market of activeMarkets) {
    try {
      for (const o of market.outcomes || []) {
        await MarketPriceSnapshot.create({
          market: market._id,
          outcome: o.name,
          price: o.price,
          probability: o.probability,
          volume: market.volume || 0,
          liquidity: market.liquidity || 0,
          source: 'cron',
        });
        created++;
      }
    } catch (err) {
      console.error(`[PriceSnapshot] Failed to snapshot market ${market._id}:`, err.message);
    }
  }

  console.log(`[PriceSnapshot] Created ${created} snapshots for ${activeMarkets.length} active markets`);
  return { markets: activeMarkets.length, snapshots: created };
};

/**
 * Create price snapshot for a single market (called after trade)
 */
const snapshotMarket = async (marketId) => {
  const market = await Market.findById(marketId);
  if (!market) return null;

  const docs = [];
  for (const o of market.outcomes || []) {
    docs.push({
      market: market._id,
      outcome: o.name,
      price: o.price,
      probability: o.probability,
      volume: market.volume || 0,
      liquidity: market.liquidity || 0,
      source: 'trade',
    });
  }
  if (docs.length) {
    await MarketPriceSnapshot.insertMany(docs);
  }
  return docs.length;
};

module.exports = { snapshotAllActiveMarkets, snapshotMarket };
