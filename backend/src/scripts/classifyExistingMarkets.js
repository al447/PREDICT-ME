/**
 * One-off backfill script — Phase 4.3
 *
 * Iterates all active/closed/resolved markets and applies classifyPriceMarket()
 * to set resolutionSource, priceMarket, priceSymbol, priceTarget, priceComparator.
 *
 * Run once after deploying the Chainlink + Binance integration:
 *   node src/scripts/classifyExistingMarkets.js
 *
 * Safe to re-run: only updates markets that do NOT already have resolutionSource set.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');
const { classifyPriceMarket } = require('../utils/classifyPriceMarket');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Classify] Connected to MongoDB');

  // Only process markets without resolutionSource set
  const markets = await Market.find({ resolutionSource: null }).lean();
  console.log(`[Classify] Found ${markets.length} unclassified markets`);

  let chainlink = 0, uma = 0, errors = 0;

  for (const market of markets) {
    try {
      const fields = classifyPriceMarket(market);
      await Market.updateOne({ _id: market._id }, { $set: fields });
      if (fields.resolutionSource === 'chainlink') chainlink++;
      else uma++;
    } catch (err) {
      console.error(`[Classify] Error on "${market.title}": ${err.message}`);
      errors++;
    }
  }

  console.log(`[Classify] Done — chainlink: ${chainlink}  uma/admin: ${uma}  errors: ${errors}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[Classify] Fatal:', err.message);
  process.exit(1);
});
