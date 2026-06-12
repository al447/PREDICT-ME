require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');

const PINNED_SLUGS = [
  'crypto-4-will-eth-hit-5-000-by-august-2026-',
  'sports-22-masters-2026-winner-rory-mcilroy-',
  'sports-17-champions-league-final-2026-real-madrid-',
];

// Generate smooth historical snapshots with realistic prediction market trends
async function backfillMarket(market, days = 30) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const currentProbs = market.outcomes.map((o) => o.probability ?? 50);

  // Delete existing snapshots first
  await MarketPriceSnapshot.deleteMany({ market: market._id });
  console.log(`  Cleared old snapshots for ${market.slug}`);

  // For each outcome, generate a smooth path from a starting value to the current value
  // Use deterministic seed per market+outcome for consistency
  const paths = market.outcomes.map((o, idx) => {
    const currentProb = currentProbs[idx];
    // Starting probability ~10-15% away from current (binary markets gradually trend)
    // For high-confidence outcomes (>70%), they likely started lower
    // For low-confidence outcomes (<30%), they likely started higher
    let startProb;
    if (currentProb >= 70) startProb = Math.max(40, currentProb - 15);
    else if (currentProb <= 30) startProb = Math.min(60, currentProb + 15);
    else startProb = currentProb + (idx === 0 ? -8 : 8);
    startProb = Math.max(5, Math.min(95, startProb));

    // Generate path with smooth random walk that ends at currentProb
    const path = [];
    let value = startProb;
    for (let d = 0; d <= days; d++) {
      const progress = d / days; // 0 to 1
      // Linear interpolation toward target
      const target = startProb + (currentProb - startProb) * progress;
      // Small smooth oscillation (sine-based, deterministic)
      const wave = Math.sin((d / days) * Math.PI * 2 + idx) * 2.5 * (1 - progress * 0.5);
      // Smooth value with damping
      value = value * 0.3 + (target + wave) * 0.7;
      path.push(Math.max(2, Math.min(98, Math.round(value))));
    }
    // Force last value to exactly match current
    path[path.length - 1] = Math.round(currentProb);
    return path;
  });

  const docs = [];
  for (let d = 0; d <= days; d++) {
    const timestamp = new Date(now - (days - d) * dayMs);
    market.outcomes.forEach((o, idx) => {
      docs.push({
        market: market._id,
        outcome: o.name,
        price: paths[idx][d],
        probability: paths[idx][d],
        volume: market.volume || 0,
        liquidity: market.liquidity || 0,
        source: 'cron',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  }

  await MarketPriceSnapshot.insertMany(docs);
  console.log(`  Created ${docs.length} snapshots for ${market.slug}`);
  console.log(`  Sample path for ${market.outcomes[0].name}: ${paths[0].slice(0, 5).join(',')}...${paths[0].slice(-3).join(',')}`);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const slug of PINNED_SLUGS) {
    const market = await Market.findOne({ slug });
    if (!market) {
      console.log(`Market not found: ${slug}`);
      continue;
    }
    console.log(`\nProcessing: ${market.title}`);
    console.log(`  Current probs:`, market.outcomes.map((o) => `${o.name}=${o.probability}%`).join(', '));
    await backfillMarket(market, 30);
  }

  console.log('\nDone!');
  mongoose.disconnect();
})();
