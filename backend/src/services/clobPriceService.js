/**
 * CLOB Price Service
 * Derives market YES/NO prices from CLOB order book and fills.
 * Replaces the legacy AMM aggregate for on-chain binary markets.
 */

const Fill = require('../models/Fill');
const Market = require('../models/Market');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');
const clobService = require('./clobService');

// Price derivation priority:
// 1. Last Fill price for YES token (most recent trade)
// 2. Mid of best bid/ask from order book
// 3. Existing market.outcomes[].price (fallback)

/**
 * Get the last traded price for a condition/token from Fill records
 */
async function getLastFillPrice(conditionId, tokenId) {
  const lastFill = await Fill.findOne({
    conditionId,
    tokenId,
  })
    .sort({ createdAt: -1 })
    .lean();

  return lastFill ? lastFill.price : null;
}

/**
 * Get mid price from order book (best bid + best ask) / 2
 */
async function getOrderBookMidPrice(conditionId, tokenId) {
  try {
    const book = await clobService.getOrderBook(conditionId, tokenId, 1);
    const bestBid = book.bids[0]?.price || 0;
    const bestAsk = book.asks[0]?.price || 0;

    if (bestBid > 0 && bestAsk > 0) {
      return (bestBid + bestAsk) / 2;
    }
    if (bestBid > 0) return bestBid;
    if (bestAsk > 0) return bestAsk;
    return null;
  } catch (err) {
    console.warn(`[ClobPrice] Failed to get order book mid: ${err.message}`);
    return null;
  }
}

/**
 * Derive YES price for a market (in dollars 0.01-0.99)
 */
async function getMarketYesPrice(conditionId, yesTokenId, fallbackPrice = 0.5) {
  // Priority 1: Last Fill price
  const lastFillPrice = await getLastFillPrice(conditionId, yesTokenId);
  if (lastFillPrice) {
    return { price: lastFillPrice, source: 'last_fill' };
  }

  // Priority 2: Order book mid
  const midPrice = await getOrderBookMidPrice(conditionId, yesTokenId);
  if (midPrice) {
    return { price: midPrice, source: 'order_book_mid' };
  }

  // Priority 3: Fallback
  return { price: fallbackPrice, source: 'fallback' };
}

/**
 * Sync market prices from CLOB to Market.outcomes and MarketPriceSnapshot
 * @param {string} conditionId - Market conditionId
 * @returns {Promise<{yesPrice: number, noPrice: number, source: string}>}
 */
async function syncMarketPrice(conditionId) {
  const market = await Market.findOne({ conditionId });
  if (!market) {
    throw new Error(`Market not found for conditionId: ${conditionId}`);
  }

  if (!market.token0 || !market.token1) {
    throw new Error(`Market ${market._id} missing token0/token1`);
  }

  // Get current YES price in dollars (0.01-0.99)
  const fallbackPrice = (market.outcomes?.[0]?.price || 50) / 100;
  const { price: yesPriceDollars, source } = await getMarketYesPrice(
    conditionId,
    market.token0, // YES token
    fallbackPrice
  );

  // Convert to cents (0-100) for outcomes
  const yesPriceCents = Math.round(yesPriceDollars * 100);
  const noPriceCents = 100 - yesPriceCents;

  // Clamp to valid range
  const clampedYes = Math.max(1, Math.min(99, yesPriceCents));
  const clampedNo = 100 - clampedYes;

  // Update market outcomes
  if (market.outcomes && market.outcomes.length >= 2) {
    market.outcomes[0].price = clampedYes;
    market.outcomes[0].probability = clampedYes;
    market.outcomes[1].price = clampedNo;
    market.outcomes[1].probability = clampedNo;
  }

  // Calculate volume from fills
  const volumeAgg = await Fill.aggregate([
    { $match: { conditionId, isMakerBot: false } },
    { $group: { _id: null, total: { $sum: '$notional' } } },
  ]);
  const volume = volumeAgg[0]?.total || market.volume || 0;
  market.volume = volume;

  await market.save();

  // Write MarketPriceSnapshot with source 'clob'
  const snapshot = new MarketPriceSnapshot({
    market: market._id,
    outcome: 'Yes',
    price: clampedYes,
    probability: clampedYes,
    volume,
    liquidity: 0, // Could calculate from order book depth
    source: 'clob',
  });
  await snapshot.save();

  console.log(`[ClobPrice] Synced ${conditionId}: YES=${clampedYes}¢ NO=${clampedNo}¢ (source: ${source})`);

  return {
    yesPrice: clampedYes,
    noPrice: clampedNo,
    source,
    volume,
  };
}

/**
 * Sync all active binary on-chain markets
 * Called periodically or after significant trading activity
 */
async function syncAllActiveMarkets() {
  const markets = await Market.find({
    status: 'active',
    onChain: true,
    marketType: 'binary',
    conditionId: { $exists: true, $ne: null },
    token0: { $exists: true, $ne: null },
  }).select('conditionId token0');

  const results = [];
  for (const market of markets) {
    try {
      const result = await syncMarketPrice(market.conditionId);
      results.push({ conditionId: market.conditionId, ...result });
    } catch (err) {
      console.error(`[ClobPrice] Failed to sync ${market.conditionId}: ${err.message}`);
      results.push({
        conditionId: market.conditionId,
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = {
  getLastFillPrice,
  getOrderBookMidPrice,
  getMarketYesPrice,
  syncMarketPrice,
  syncAllActiveMarkets,
};
