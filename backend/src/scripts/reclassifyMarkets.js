require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Market = require('../models/Market');
const Category = require('../models/Category');

// ── Copy of the corrected rules from marketSyncService.js ──────────────────
const TAG_TO_CATEGORY = [
  { tags: ['esports', 'league-of-legends', 'counter-strike', 'counter-strike-2', 'dota-2', 'valorant', 'cs2', 'cs-go', 'overwatch', 'rocket-league'], slug: 'esports' },
  { tags: ['iran', 'iran-nuclear', 'us-iran', 'trump-iran', 'iran-israel'], slug: 'iran' },
  { tags: ['elections', 'primaries', 'global-elections', 'world-elections', 'us-election', 'us-elections', 'uk-elections', 'german-elections', 'french-elections', 'european-elections'], slug: 'elections' },
  { tags: ['nba', 'nfl', 'mlb', 'nhl', 'soccer', 'tennis', 'basketball', 'cricket', 'golf', 'formula-1', 'boxing', 'ufc', 'baseball', 'hockey', 'football', 'rugby', 'pickleball', 'lacrosse', 'mma', 'swimming', 'athletics', 'cycling', 'fifa-world-cup', '2026-fifa-world-cup', 'champions-league', 'premier-league', 'nascar', 'f1'], slug: 'sports' },
  { tags: ['crypto', 'bitcoin', 'ethereum', 'solana', 'xrp', 'defi', 'bnb', 'dogecoin', 'cryptocurrency', 'nft', 'web3', 'crypto-prices', 'crypto-etf', 'multi-strikes', 'hit-price'], slug: 'crypto' },
  { tags: ['tech', 'ai', 'big-tech', 'space', 'elon-musk', 'apple', 'google', 'microsoft', 'meta', 'spacex', 'technology', 'robotics', 'openai', 'anthropic', 'gpt-5', 'grok', 'claude', 'nvidia', 'tesla', 'ipo', 'quantum'], slug: 'tech' },
  { tags: ['economy', 'gdp', 'jobs', 'unemployment', 'tariffs', 'recession', 'global-rates', 'Global-Rates', 'economic-policy', 'jerome-powell', 'fomc', 'fed-rates', 'interest-rates'], slug: 'economy' },
  { tags: ['pop-culture', 'culture', 'entertainment', 'music', 'movies', 'tv', 'celebrity', 'awards', 'oscars', 'grammys', 'box-office', 'youtube', 'mrbeast', 'tweets-markets', 'social-media'], slug: 'culture' },
  { tags: ['geopolitics', 'nato', 'ukraine', 'russia', 'middle-east', 'china', 'taiwan', 'korea', 'israel', 'hezbollah', 'hamas', 'world-affairs', 'cuba', 'venezuela', 'syria', 'lebanon', 'ukraine-peace-deal', 'foreign-policy'], slug: 'geopolitics' },
  { tags: ['politics', 'trump', 'congress', 'democrat', 'republican', 'white-house', 'senate', 'house', 'supreme-court', 'doge', 'canada', 'greenland', 'starmer', 'uk', 'keir'], slug: 'politics' },
  { tags: ['finance', 'stocks', 'fed', 'economics', 'commodities', 'forex', 'bonds', 'markets', 'sp500', 'nasdaq', 'dow', 'spx', 'inflation', 'earnings', 'indices', 'ipos', 'business', 'indicies', 'pyth-finance', 'finance-updown', 'trade'], slug: 'finance' },
  { tags: ['weather', 'climate', 'hurricane', 'tornado', 'earthquake', 'wildfire', 'flood', 'temperature', 'recurring', 'daily-temperature', 'london', 'new-york-city', 'tokyo'], slug: 'weather' },
  { tags: ['sports'], slug: 'sports' },
];

const TAG_TO_SUBCATEGORY = {
  'nba': 'Basketball', 'basketball': 'Basketball',
  'nfl': 'Football', 'football': 'Football',
  'mlb': 'Baseball', 'baseball': 'Baseball',
  'nhl': 'Hockey', 'hockey': 'Hockey',
  'soccer': 'Soccer', 'football-soccer': 'Soccer', 'premier-league': 'Soccer', 'champions-league': 'Soccer', 'fifa-world-cup': 'Soccer', '2026-fifa-world-cup': 'Soccer',
  'tennis': 'Tennis', 'golf': 'Golf',
  'formula-1': 'Formula 1', 'f1': 'Formula 1', 'nascar': 'Nascar',
  'ufc': 'UFC', 'mma': 'MMA', 'boxing': 'Boxing', 'cricket': 'Cricket',
  'rugby': 'Rugby', 'pickleball': 'Pickleball', 'lacrosse': 'Lacrosse',
  'bitcoin': 'Bitcoin', 'btc': 'Bitcoin', 'crypto-prices': 'Bitcoin',
  'ethereum': 'Ethereum', 'eth': 'Ethereum',
  'solana': 'Solana', 'xrp': 'XRP', 'dogecoin': 'Dogecoin', 'bnb': 'BNB',
  'defi': 'DeFi', 'nft': 'NFT', 'crypto-etf': 'ETF',
  'us-election': 'US', 'us-elections': 'US',
  'global-elections': 'Global', 'world-elections': 'Global',
  'primaries': 'Primaries',
  'uk-elections': 'UK', 'german-elections': 'Germany', 'french-elections': 'France', 'european-elections': 'Europe',
  'iran': 'Iran',
  'ukraine': 'Ukraine', 'russia': 'Russia',
  'middle-east': 'Middle East', 'israel': 'Israel', 'hezbollah': 'Middle East', 'hamas': 'Middle East',
  'china': 'China', 'taiwan': 'Taiwan', 'nato': 'NATO', 'korea': 'Korea',
  'cuba': 'Cuba', 'venezuela': 'Venezuela',
  'ai': 'AI', 'gpt-5': 'AI', 'grok': 'AI', 'claude': 'AI', 'openai': 'AI', 'anthropic': 'AI',
  'space': 'Space', 'spacex': 'SpaceX', 'elon-musk': 'Elon Musk', 'tesla': 'Tesla',
  'apple': 'Apple', 'google': 'Google', 'microsoft': 'Microsoft', 'meta': 'Meta', 'nvidia': 'Nvidia',
  'big-tech': 'Big Tech', 'ipo': 'IPO',
  'movies': 'Movies', 'box-office': 'Movies',
  'music': 'Music', 'grammys': 'Music',
  'tv': 'TV', 'celebrity': 'Celebrity',
  'awards': 'Awards', 'oscars': 'Awards',
  'youtube': 'YouTube', 'mrbeast': 'YouTube',
  'tweets-markets': 'Social Media',
  'stocks': 'Stocks', 'sp500': 'S&P 500', 'nasdaq': 'Nasdaq', 'dow': 'Dow',
  'commodities': 'Commodities', 'forex': 'Forex', 'bonds': 'Bonds', 'earnings': 'Earnings',
  'fed-rates': 'Fed Rates', 'interest-rates': 'Fed Rates',
  'fed': 'Fed', 'jerome-powell': 'Fed', 'economic-policy': 'Fed Policy',
  'global-rates': 'Rates', 'Global-Rates': 'Rates',
  'tariffs': 'Tariffs', 'trade': 'Trade', 'gdp': 'GDP', 'jobs': 'Jobs', 'unemployment': 'Jobs',
  'league-of-legends': 'League of Legends',
  'counter-strike': 'CS2', 'counter-strike-2': 'CS2', 'cs2': 'CS2',
  'dota-2': 'Dota 2', 'valorant': 'Valorant', 'overwatch': 'Overwatch', 'rocket-league': 'Rocket League',
  'hurricane': 'Hurricane', 'tornado': 'Tornado', 'earthquake': 'Earthquake',
  'wildfire': 'Wildfire', 'flood': 'Flood', 'climate': 'Climate',
  'london': 'London', 'new-york-city': 'New York', 'tokyo': 'Tokyo',
};

function resolveCategorySlug(tags) {
  for (const rule of TAG_TO_CATEGORY) {
    if (rule.tags.some(t => tags.includes(t))) return rule.slug;
  }
  return null;
}

function resolveSubCategory(tags) {
  for (const tag of tags) {
    if (TAG_TO_SUBCATEGORY[tag]) return TAG_TO_SUBCATEGORY[tag];
  }
  return null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const categories = await Category.find({}).lean();
  const catMap = {};
  for (const c of categories) catMap[c.slug] = c._id;

  const markets = await Market.find({}, 'tags categorySlug subCategory').lean();
  console.log(`Checking ${markets.length} markets...`);

  let reclassified = 0;
  let subFixed = 0;
  let unchanged = 0;

  const bulkOps = [];

  for (const m of markets) {
    const tags = (m.tags || []).map(t => t.toLowerCase());
    const newSlug = resolveCategorySlug(tags);
    const newSub = resolveSubCategory(tags);
    const newCatId = newSlug ? catMap[newSlug] : null;

    const slugChanged = newSlug && newSlug !== m.categorySlug;
    const subChanged = newSub !== m.subCategory;

    if (slugChanged || subChanged) {
      const set = {};
      if (slugChanged) { set.categorySlug = newSlug; set.category = newCatId; }
      if (subChanged) set.subCategory = newSub;
      bulkOps.push({ updateOne: { filter: { _id: m._id }, update: { $set: set } } });
      if (slugChanged) reclassified++;
      if (subChanged) subFixed++;
    } else {
      unchanged++;
    }
  }

  if (bulkOps.length) {
    await Market.bulkWrite(bulkOps);
  }

  console.log(`\n=== Reclassification complete ===`);
  console.log(`  Category changed: ${reclassified}`);
  console.log(`  SubCategory fixed: ${subFixed}`);
  console.log(`  Unchanged: ${unchanged}`);

  // Final distribution
  const byCategory = await Market.aggregate([
    { $group: { _id: '$categorySlug', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log('\n=== New distribution ===');
  for (const row of byCategory) {
    console.log(`  ${(row._id || 'NULL').padEnd(15)} ${row.count}`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
