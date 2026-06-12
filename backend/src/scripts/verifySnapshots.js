require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const markets = await Market.find({ status: 'active' }).select('_id title slug categorySlug');
  const total = markets.length;

  // Group counts by category
  const byCategory = {};
  let withSnapshots = 0;
  let withoutSnapshots = 0;
  const missingSamples = [];

  for (const m of markets) {
    const count = await MarketPriceSnapshot.countDocuments({ market: m._id });
    const cat = m.categorySlug || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, withData: 0, snapshots: 0 };
    byCategory[cat].total++;
    byCategory[cat].snapshots += count;
    if (count > 0) {
      withSnapshots++;
      byCategory[cat].withData++;
    } else {
      withoutSnapshots++;
      if (missingSamples.length < 5) missingSamples.push(m.slug);
    }
  }

  console.log('\n=== Real-time Live Data Coverage ===');
  console.log(`Total active markets:         ${total}`);
  console.log(`Markets with real snapshots:  ${withSnapshots}`);
  console.log(`Markets missing snapshots:    ${withoutSnapshots}`);
  console.log(`Coverage:                     ${((withSnapshots / total) * 100).toFixed(1)}%`);

  console.log('\n=== Per Category ===');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = ((stats.withData / stats.total) * 100).toFixed(1);
    console.log(`${cat.padEnd(15)} ${stats.withData}/${stats.total} markets (${pct}%) — ${stats.snapshots} total snapshots`);
  }

  if (missingSamples.length) {
    console.log('\nSample markets missing snapshots:');
    missingSamples.forEach(s => console.log(`  - ${s}`));
  }

  const totalSnapshots = await MarketPriceSnapshot.countDocuments();
  console.log(`\nTotal snapshots in DB: ${totalSnapshots}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
