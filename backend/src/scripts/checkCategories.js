require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const byCategory = await Market.aggregate([
    { $group: { _id: '$categorySlug', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log('\n=== Markets by category ===');
  for (const row of byCategory) {
    console.log(`  ${(row._id || 'NULL').padEnd(15)} ${row.count}`);
  }

  // Show 3 sample titles per category
  console.log('\n=== Sample titles per category ===');
  for (const row of byCategory) {
    const samples = await Market.find({ categorySlug: row._id }, 'title tags subCategory').limit(3).lean();
    console.log(`\n[${row._id}]`);
    samples.forEach(m => console.log(`  "${m.title}" | tags: ${(m.tags || []).slice(0, 4).join(', ')} | sub: ${m.subCategory}`));
  }

  // Check for potential miscategorised markets — title keywords vs assigned category
  console.log('\n=== Potential miscategorisation checks ===');

  // Sports markets in wrong category
  const sportsKeywords = /\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|cricket|tennis|golf|f1|formula.1|ufc|boxing|mma|rugby|lacrosse|pickleball)\b/i;
  const nonSportsWithSportsTitle = await Market.find({ categorySlug: { $ne: 'sports' }, title: sportsKeywords }, 'title categorySlug').limit(5).lean();
  if (nonSportsWithSportsTitle.length) {
    console.log('\nSports-title markets NOT in sports:');
    nonSportsWithSportsTitle.forEach(m => console.log(`  [${m.categorySlug}] ${m.title}`));
  }

  // Crypto markets in wrong category
  const cryptoKeywords = /\b(bitcoin|ethereum|solana|btc|eth|crypto|xrp|dogecoin|bnb|defi|nft)\b/i;
  const nonCryptoWithCryptoTitle = await Market.find({ categorySlug: { $ne: 'crypto' }, title: cryptoKeywords }, 'title categorySlug').limit(5).lean();
  if (nonCryptoWithCryptoTitle.length) {
    console.log('\nCrypto-title markets NOT in crypto:');
    nonCryptoWithCryptoTitle.forEach(m => console.log(`  [${m.categorySlug}] ${m.title}`));
  }

  // Null/missing category
  const nullCat = await Market.countDocuments({ categorySlug: null });
  console.log(`\nMarkets with null categorySlug: ${nullCat}`);

  // Markets with no subCategory
  const noSub = await Market.countDocuments({ subCategory: null });
  console.log(`Markets with no subCategory: ${noSub} / ${await Market.countDocuments()}`);

  process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
