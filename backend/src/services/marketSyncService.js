const axios = require('axios');
const mongoose = require('mongoose');
const Market = require('../models/Market');
const Category = require('../models/Category');
const { classifyPriceMarket } = require('../utils/classifyPriceMarket');

const GAMMA_API = process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com';
const SYNC_LIMIT = parseInt(process.env.MARKET_SYNC_LIMIT || '100', 10);
const SYNC_INTERVAL_MS = parseInt(process.env.MARKET_SYNC_INTERVAL_MS || '3600000', 10);
const PRICE_RESYNC_ENABLED = process.env.PRICE_RESYNC_ENABLED === 'true';
const CATEGORY_LIMIT = parseInt(process.env.MARKET_CATEGORY_LIMIT || '50', 10);

// Tag slug → PredictMe categorySlug mapping (priority order: first match wins)
const TAG_TO_CATEGORY = [
  // Esports — before sports so esports tag wins
  { tags: ['esports', 'league-of-legends', 'counter-strike', 'counter-strike-2', 'dota-2', 'valorant', 'cs2', 'cs-go', 'overwatch', 'rocket-league'], slug: 'esports' },
  // Iran — specific geo, before politics/geopolitics
  { tags: ['iran', 'iran-nuclear', 'us-iran', 'trump-iran', 'iran-israel'], slug: 'iran' },
  // Elections — before politics
  { tags: ['elections', 'primaries', 'global-elections', 'world-elections', 'us-election', 'us-elections', 'uk-elections', 'german-elections', 'french-elections', 'european-elections'], slug: 'elections' },
  // Sports — before politics (sports has 'football' tag)
  { tags: ['nba', 'nfl', 'mlb', 'nhl', 'soccer', 'tennis', 'basketball', 'cricket', 'golf', 'formula-1', 'boxing', 'ufc', 'baseball', 'hockey', 'football', 'rugby', 'pickleball', 'lacrosse', 'mma', 'swimming', 'athletics', 'cycling', 'fifa-world-cup', '2026-fifa-world-cup', 'champions-league', 'premier-league', 'nascar', 'f1'], slug: 'sports' },
  // Crypto — before finance
  { tags: ['crypto', 'bitcoin', 'ethereum', 'solana', 'xrp', 'defi', 'bnb', 'dogecoin', 'cryptocurrency', 'nft', 'web3', 'crypto-prices', 'crypto-etf', 'multi-strikes', 'hit-price'], slug: 'crypto' },
  // Tech — before finance (ai, big-tech belong here, not finance)
  { tags: ['tech', 'ai', 'big-tech', 'space', 'elon-musk', 'apple', 'google', 'microsoft', 'meta', 'spacex', 'technology', 'robotics', 'openai', 'anthropic', 'gpt-5', 'grok', 'claude', 'nvidia', 'tesla', 'ipo', 'quantum'], slug: 'tech' },
  // Economy — BEFORE politics/culture so Fed/FOMC markets land here
  { tags: ['economy', 'gdp', 'jobs', 'unemployment', 'tariffs', 'recession', 'global-rates', 'Global-Rates', 'economic-policy', 'jerome-powell', 'fomc', 'fed-rates', 'interest-rates'], slug: 'economy' },
  // Culture — before politics (pop-culture, tweets-markets, mrbeast etc)
  { tags: ['pop-culture', 'culture', 'entertainment', 'music', 'movies', 'tv', 'celebrity', 'awards', 'oscars', 'grammys', 'box-office', 'youtube', 'mrbeast', 'tweets-markets', 'social-media'], slug: 'culture' },
  // Geopolitics — before politics to catch ukraine/china/taiwan topics
  { tags: ['geopolitics', 'nato', 'ukraine', 'russia', 'middle-east', 'china', 'taiwan', 'korea', 'israel', 'hezbollah', 'hamas', 'world-affairs', 'cuba', 'venezuela', 'syria', 'lebanon', 'ukraine-peace-deal', 'foreign-policy'], slug: 'geopolitics' },
  // Politics
  { tags: ['politics', 'trump', 'congress', 'democrat', 'republican', 'white-house', 'senate', 'house', 'supreme-court', 'doge', 'canada', 'greenland', 'starmer', 'uk', 'keir'], slug: 'politics' },
  // Finance
  { tags: ['finance', 'stocks', 'fed', 'economics', 'commodities', 'forex', 'bonds', 'markets', 'sp500', 'nasdaq', 'dow', 'spx', 'inflation', 'earnings', 'indices', 'ipos', 'business', 'indicies', 'pyth-finance', 'finance-updown', 'trade'], slug: 'finance' },
  // Weather
  { tags: ['weather', 'climate', 'hurricane', 'tornado', 'earthquake', 'wildfire', 'flood', 'temperature', 'recurring', 'daily-temperature', 'london', 'new-york-city', 'tokyo'], slug: 'weather' },
  // Sports catch-all
  { tags: ['sports'], slug: 'sports' },
];

// Tag slug → subCategory display name
const TAG_TO_SUBCATEGORY = {
  // Sports
  'nba': 'Basketball', 'basketball': 'Basketball',
  'nfl': 'Football', 'football': 'Football',
  'mlb': 'Baseball', 'baseball': 'Baseball',
  'nhl': 'Hockey', 'hockey': 'Hockey',
  'soccer': 'Soccer', 'football-soccer': 'Soccer', 'premier-league': 'Soccer', 'champions-league': 'Soccer', 'fifa-world-cup': 'Soccer', '2026-fifa-world-cup': 'Soccer',
  'tennis': 'Tennis',
  'golf': 'Golf',
  'formula-1': 'Formula 1', 'f1': 'Formula 1', 'nascar': 'Nascar',
  'ufc': 'UFC', 'mma': 'MMA',
  'boxing': 'Boxing',
  'cricket': 'Cricket',
  'rugby': 'Rugby',
  'pickleball': 'Pickleball',
  'lacrosse': 'Lacrosse',
  // Crypto
  'bitcoin': 'Bitcoin', 'btc': 'Bitcoin', 'crypto-prices': 'Bitcoin',
  'ethereum': 'Ethereum', 'eth': 'Ethereum',
  'solana': 'Solana',
  'xrp': 'XRP',
  'dogecoin': 'Dogecoin',
  'bnb': 'BNB',
  'defi': 'DeFi',
  'nft': 'NFT',
  'crypto-etf': 'ETF',
  // Elections
  'us-election': 'US', 'us-elections': 'US',
  'global-elections': 'Global', 'world-elections': 'Global',
  'primaries': 'Primaries',
  'uk-elections': 'UK', 'german-elections': 'Germany', 'french-elections': 'France', 'european-elections': 'Europe',
  // Iran
  'iran': 'Iran',
  // Geopolitics
  'ukraine': 'Ukraine', 'russia': 'Russia',
  'middle-east': 'Middle East', 'israel': 'Israel', 'hezbollah': 'Middle East', 'hamas': 'Middle East',
  'china': 'China', 'taiwan': 'Taiwan',
  'nato': 'NATO',
  'korea': 'Korea',
  'cuba': 'Cuba', 'venezuela': 'Venezuela',
  // Tech
  'ai': 'AI', 'gpt-5': 'AI', 'grok': 'AI', 'claude': 'AI', 'openai': 'AI', 'anthropic': 'AI',
  'space': 'Space', 'spacex': 'SpaceX',
  'elon-musk': 'Elon Musk',
  'tesla': 'Tesla',
  'apple': 'Apple', 'google': 'Google', 'microsoft': 'Microsoft', 'meta': 'Meta', 'nvidia': 'Nvidia',
  'big-tech': 'Big Tech',
  'ipo': 'IPO',
  // Culture
  'movies': 'Movies', 'box-office': 'Movies',
  'music': 'Music', 'grammys': 'Music',
  'tv': 'TV',
  'celebrity': 'Celebrity',
  'awards': 'Awards', 'oscars': 'Awards',
  'youtube': 'YouTube', 'mrbeast': 'YouTube',
  'tweets-markets': 'Social Media',
  // Finance
  'stocks': 'Stocks', 'sp500': 'S&P 500', 'nasdaq': 'Nasdaq', 'dow': 'Dow',
  'commodities': 'Commodities',
  'forex': 'Forex',
  'bonds': 'Bonds',
  'earnings': 'Earnings',
  'fed-rates': 'Fed Rates', 'interest-rates': 'Fed Rates',
  // Economy
  'fed': 'Fed', 'jerome-powell': 'Fed', 'economic-policy': 'Fed Policy',
  'global-rates': 'Rates', 'Global-Rates': 'Rates',
  'tariffs': 'Tariffs', 'trade': 'Trade',
  'gdp': 'GDP', 'jobs': 'Jobs', 'unemployment': 'Jobs',
  // Esports
  'league-of-legends': 'League of Legends',
  'counter-strike': 'CS2', 'counter-strike-2': 'CS2', 'cs2': 'CS2',
  'dota-2': 'Dota 2',
  'valorant': 'Valorant',
  'overwatch': 'Overwatch',
  'rocket-league': 'Rocket League',
  // Weather
  'hurricane': 'Hurricane', 'tornado': 'Tornado', 'earthquake': 'Earthquake',
  'wildfire': 'Wildfire', 'flood': 'Flood', 'climate': 'Climate',
  'london': 'London', 'new-york-city': 'New York', 'tokyo': 'Tokyo',
};

// Polymarket tag slug → frequency value for crypto markets.
// Polymarket's live recurring "Up or Down" markets use SHORT tags like
// `5M`, `15M`, `1H`, `4h` (note: inconsistent casing). The longer
// `*-crypto` variants are kept for forward-compat. Keys are matched
// case-insensitively via resolveFrequency().
const TAG_TO_FREQUENCY = {
  // Real Polymarket interval tags (primary)
  '5m': '5min', '15m': '15min', '1h': '1hour', '4h': '4hour',
  // Legacy / alternate slugs
  '5-minute-crypto': '5min', '5min-crypto': '5min',
  '15-minute-crypto': '15min', '15min-crypto': '15min',
  '1-hour-crypto': '1hour', 'hourly-crypto': '1hour',
  '4-hour-crypto': '4hour',
  'daily-crypto': 'daily', 'crypto-daily': 'daily', 'daily-close': 'daily', 'today': 'daily',
  'weekly-crypto': 'weekly', 'crypto-weekly': 'weekly',
  'monthly-crypto': 'monthly', 'crypto-monthly': 'monthly',
  'yearly-crypto': 'yearly', 'crypto-yearly': 'yearly',
  'pre-market': 'pre-market',
  'etf': 'etf', 'crypto-etf': 'etf',
};

function resolveCategorySlug(tagSlugs) {
  for (const rule of TAG_TO_CATEGORY) {
    if (rule.tags.some(t => tagSlugs.includes(t))) return rule.slug;
  }
  return null;
}

function resolveSubCategory(tagSlugs) {
  for (const slug of tagSlugs) {
    if (TAG_TO_SUBCATEGORY[slug]) return TAG_TO_SUBCATEGORY[slug];
  }
  return null;
}

function resolveFrequency(tagSlugs) {
  for (const slug of tagSlugs) {
    const f = TAG_TO_FREQUENCY[slug] || TAG_TO_FREQUENCY[String(slug).toLowerCase()];
    if (f) return f;
  }
  return null;
}

function parseJsonField(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// A grouped (negRisk) event has multiple sub-markets each representing one candidate.
// Detect when the event has 3+ active markets with distinct groupItemTitles.
function isGroupedEvent(event) {
  // Count ALL sub-markets with groupItemTitle (including resolved/closed ones)
  const allMarkets = (event.markets || []);
  const activeMarkets = allMarkets.filter(m => m.active && !m.closed);
  // Classic negRisk grouped events (3+ distinct candidates)
  if (event.negRisk) {
    const titles = allMarkets.map(m => m.groupItemTitle || '').filter(Boolean);
    if (new Set(titles).size >= 3) return true;
    if (activeMarkets.length < 3) return false;
    const activeTitles = activeMarkets.map(m => m.groupItemTitle || '').filter(Boolean);
    return new Set(activeTitles).size >= 3;
  }
  // Multi-deadline events (non-negRisk but multiple sub-markets with groupItemTitle)
  // e.g. "When will Bitcoin hit $150k?" with by June 30 / by Dec 31 deadlines
  const titles = allMarkets.map(m => m.groupItemTitle || '').filter(Boolean);
  if (new Set(titles).size >= 2) return true;
  return false;
}

function buildMarketDoc(event, market, categoryId, categorySlug, subCategory, frequency) {
  const outcomes = parseJsonField(market.outcomes);
  const prices = parseJsonField(market.outcomePrices);

  const mappedOutcomes = outcomes.map((name, i) => {
    const p = Math.round(parseFloat(prices[i] || '0.5') * 100);
    return { name, probability: p, price: p };
  });

  const tagSlugs = (event.tags || []).map(t => t.slug || '').filter(Boolean);

  return {
    title: event.title?.trim() || market.question?.trim(),
    description: bestDescription(event, market),
    category: categoryId,
    categorySlug,
    subCategory,
    frequency,
    slug: `pm-${event.slug || market.slug}`.slice(0, 100),
    status: 'active',
    marketType: 'binary',
    outcomes: mappedOutcomes,
    volume: parseFloat(event.volume || 0),
    volume24hr: parseFloat(event.volume24hr || 0),
    liquidity: parseFloat(event.liquidity || 0),
    endDate: event.endDate ? new Date(event.endDate) : null,
    image: event.image || event.icon || '📊',
    tags: tagSlugs.slice(0, 10),
    featured: event.featured === true,
    isNewMarket: event.new === true,
    conditionId: market.conditionId || null,
    polymarketTokenId: parseJsonField(market.clobTokenIds)[0] || null,
    negRisk: event.negRisk === true,
    polymarketEventSlug: event.slug || null,
    faq: bestDescription(event, market),
    rewards: 0,
  };
}

// Pick the best description: prefer market.description (resolution rules) over
// event.description which is often just the title repeated.
function bestDescription(event, market) {
  const evDesc = (event.description || '').trim();
  const mktDesc = (market?.description || '').trim();
  // If event description is just the title or very short, prefer market description
  if (mktDesc && (!evDesc || evDesc.length < 50 || evDesc === event.title?.trim())) {
    return mktDesc;
  }
  return evDesc || mktDesc || '';
}

function buildGroupedMarketDoc(event, categoryId, categorySlug, subCategory, frequency) {
  const tagSlugs = (event.tags || []).map(t => t.slug || '').filter(Boolean);

  // Build candidates list from ALL sub-markets (active + resolved), sorted by active first then by price descending
  const allSubMarkets = (event.markets || []).filter(m => m.groupItemTitle);
  const subMarkets = allSubMarkets.filter(m => m.active && !m.closed);
  const candidates = allSubMarkets
    .map(m => {
      const prices = parseJsonField(m.outcomePrices);
      const yesPct = Math.round(parseFloat(prices[0] || '0') * 100);
      const tokenIds = parseJsonField(m.clobTokenIds);
      const isClosed = m.closed || !m.active;
      return {
        name: m.groupItemTitle || m.question?.trim() || 'Unknown',
        probability: isClosed ? 0 : yesPct,
        polymarketTokenId: tokenIds[0] || null,
        conditionId: m.conditionId || null,
        image: m.image || null,
        resolved: isClosed,
        resolvedOutcome: isClosed ? 'No' : null,
      };
    })
    .sort((a, b) => {
      // Active candidates first, then resolved
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return b.probability - a.probability;
    });

  // Use the top-probability candidate's conditionId as the event's primary conditionId
  const primaryMarket = subMarkets.find(m => m.conditionId === candidates[0]?.conditionId)
    || subMarkets[0];
  const primaryTokenIds = parseJsonField(primaryMarket?.clobTokenIds || '[]');

  // Synthetic binary outcomes for legacy compatibility: Yes = leading candidate%, No = rest
  const leadProb = candidates[0]?.probability ?? 50;
  const mappedOutcomes = [
    { name: 'Yes', probability: leadProb, price: leadProb },
    { name: 'No', probability: 100 - leadProb, price: 100 - leadProb },
  ];

  // Find best description from sub-markets (resolution rules)
  const activeMarket = subMarkets[0];
  const desc = bestDescription(event, activeMarket);

  return {
    title: event.title?.trim(),
    description: desc,
    category: categoryId,
    categorySlug,
    subCategory,
    frequency,
    slug: `pm-${event.slug}`.slice(0, 100),
    status: 'active',
    marketType: 'grouped',
    outcomes: mappedOutcomes,
    candidates,
    volume: parseFloat(event.volume || 0),
    volume24hr: parseFloat(event.volume24hr || 0),
    liquidity: parseFloat(event.liquidity || 0),
    endDate: event.endDate ? new Date(event.endDate) : null,
    image: event.image || event.icon || '📊',
    tags: tagSlugs.slice(0, 10),
    featured: event.featured === true,
    isNewMarket: event.new === true,
    conditionId: primaryMarket?.conditionId || null,
    polymarketTokenId: primaryTokenIds[0] || null,
    negRisk: event.negRisk === true,
    polymarketEventSlug: event.slug || null,
    faq: desc,
    rewards: 0,
  };
}

async function fetchEventsByTag(tagSlug, categorySlug) {
  try {
    const params = {
      limit: SYNC_LIMIT,
      closed: false,
      order: 'volume24hr',
      ascending: false,
    };
    if (tagSlug) params.tag_slug = tagSlug;

    const res = await axios.get(`${GAMMA_API}/events/keyset`, { params, timeout: 15000 });
    const events = res.data?.events || res.data || [];
    return Array.isArray(events) ? events : [];
  } catch (err) {
    console.warn(`[MarketSync] Failed to fetch tag="${tagSlug}": ${err.message}`);
    return [];
  }
}

// ── Live recurring crypto markets ("Up or Down") ────────────────────────────
// Polymarket spawns a fresh window every interval (e.g. a new 5-min market
// every 5 minutes). We only ever surface the single currently-open window per
// (coin, interval) so the UI shows live, tradeable markets rather than a flood
// of expired ones.
const CRYPTO_FREQUENCY_TAGS = ['5M', '15M', '1H', '4h'];
const RECURRING_COINS = ['bitcoin', 'ethereum', 'solana', 'xrp', 'dogecoin', 'bnb'];
const RECURRING_FREQUENCIES = ['5min', '15min', '1hour', '4hour'];
const COIN_TAG_TO_SYMBOL = {
  bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', xrp: 'XRP', dogecoin: 'DOGE', bnb: 'BNB',
};
const COIN_TAG_TO_SUBCAT = {
  bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana', xrp: 'XRP', dogecoin: 'Dogecoin', bnb: 'BNB',
};

// From a pool of events, pick the soonest-ending FUTURE window per (coin, freq).
function selectCurrentWindows(events) {
  const now = Date.now();
  const best = new Map(); // `${coin}|${freq}` → { event, end }
  for (const event of events) {
    if (event.closed || event.active === false) continue;
    const tagSlugs = (event.tags || []).map(t => (t.slug || '').toLowerCase());
    const freq = resolveFrequency(tagSlugs);
    if (!freq || !RECURRING_FREQUENCIES.includes(freq)) continue;
    const coin = RECURRING_COINS.find(c => tagSlugs.includes(c));
    if (!coin) continue;
    const end = event.endDate ? new Date(event.endDate).getTime() : 0;
    if (!end || end <= now) continue; // skip expired/closed windows
    const key = `${coin}|${freq}`;
    const cur = best.get(key);
    if (!cur || end < cur.end) best.set(key, { event, end });
  }
  return [...best.values()].map(v => v.event);
}

// Mark recurring crypto windows whose endDate has passed as resolved so the
// UI only ever shows live windows. Only touches trade-free synced markets.
async function closeExpiredRecurring() {
  const res = await Market.updateMany(
    {
      frequency: { $in: RECURRING_FREQUENCIES },
      status: 'active',
      endDate: { $lt: new Date() },
      tradeCount: { $in: [0, null] },
    },
    { $set: { status: 'resolved' } }
  );
  return res.modifiedCount || 0;
}

async function syncRecurringCrypto(categoryMap) {
  let map = categoryMap;
  if (!map) {
    map = {};
    for (const c of await Category.find({})) map[c.slug] = c;
  }

  const results = await Promise.all(CRYPTO_FREQUENCY_TAGS.map(tag => fetchEventsByTag(tag)));
  const seen = new Set();
  const all = [];
  for (const events of results) {
    for (const e of events) {
      if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
    }
  }

  const selected = selectCurrentWindows(all);
  const { created, updated, skipped } = await syncEvents(selected, map);

  // syncEvents resolves subCategory from the generic `crypto-prices` tag (which
  // maps to "Bitcoin"), so ETH/SOL/etc. windows are mislabelled and lack a
  // priceSymbol. Correct both per-coin so the homepage FiveMinCryptoSection
  // (which keys markets by priceSymbol) renders every coin.
  const ops = [];
  for (const event of selected) {
    const tagSlugs = (event.tags || []).map(t => (t.slug || '').toLowerCase());
    const coin = RECURRING_COINS.find(c => tagSlugs.includes(c));
    if (!coin) continue;
    const slug = `pm-${event.slug}`.slice(0, 100);
    ops.push({
      updateOne: {
        filter: { slug },
        update: { $set: { priceSymbol: COIN_TAG_TO_SYMBOL[coin], subCategory: COIN_TAG_TO_SUBCAT[coin] } },
      },
    });
  }
  if (ops.length) await Market.bulkWrite(ops);

  const expired = await closeExpiredRecurring();

  console.log(`[MarketSync] Recurring crypto: +${created} new  ~${updated} updated  ${skipped} skipped  ${expired} expired  (${selected.length} live windows from ${all.length} fetched)`);
  return { created, updated, skipped, expired };
}

async function syncEvents(events, categoryMap) {
  let created = 0, updated = 0, skipped = 0;

  for (const event of events) {
    if (event.closed || !event.active) { skipped++; continue; }

    const markets = event.markets || [];
    if (!markets.length) { skipped++; continue; }

    const tagSlugs = (event.tags || []).map(t => t.slug || '').filter(Boolean);
    const categorySlug = resolveCategorySlug(tagSlugs);
    if (!categorySlug) { skipped++; continue; }

    const categoryDoc = categoryMap[categorySlug];
    if (!categoryDoc) { skipped++; continue; }

    const subCategory = resolveSubCategory(tagSlugs);
    const frequency = resolveFrequency(tagSlugs);

    let doc;
    let lookupConditionId;

    if (isGroupedEvent(event)) {
      // ── Grouped (negRisk) event: store all candidates in one doc ──────
      doc = buildGroupedMarketDoc(event, categoryDoc._id, categorySlug, subCategory, frequency);
      lookupConditionId = doc.conditionId;
    } else {
      // ── Binary event: use the first active market as representative ──
      const market = markets.find(m => m.active && !m.closed) || markets[0];
      if (!market?.conditionId) { skipped++; continue; }
      doc = buildMarketDoc(event, market, categoryDoc._id, categorySlug, subCategory, frequency);
      lookupConditionId = market.conditionId;
    }

    if (!doc.title) { skipped++; continue; }

    try {
      // For grouped events, look up by event slug to avoid duplicate entries.
      // For binary, try conditionId first; fall back to title+category to avoid
      // creating duplicates when the same event is syndicated with a new conditionId.
      let existing;
      if (doc.marketType === 'grouped') {
        existing = await Market.findOne({ polymarketEventSlug: event.slug });
        // Fall back to title+category to find & upgrade binary → grouped
        if (!existing && doc.title) {
          existing = await Market.findOne({ title: doc.title, categorySlug: doc.categorySlug });
        }
        // Also try slug match for old binary markets that used a sub-market slug
        if (!existing) {
          existing = await Market.findOne({ slug: doc.slug });
        }
      } else {
        existing = await Market.findOne({ conditionId: lookupConditionId });
        if (!existing && doc.title) {
          existing = await Market.findOne({ title: doc.title, categorySlug: doc.categorySlug });
          if (existing) {
            // Update conditionId so future syncs hit the fast path
            await Market.updateOne({ _id: existing._id }, { $set: { conditionId: lookupConditionId } });
          }
        }
      }

      if (existing) {
        const updateFields = {
          volume: doc.volume,
          volume24hr: doc.volume24hr,
          liquidity: doc.liquidity,
          featured: doc.featured,
          image: doc.image,
          subCategory: doc.subCategory,
          frequency: doc.frequency,
          description: doc.description,
          faq: doc.faq,
        };

        if (PRICE_RESYNC_ENABLED || existing.tradeCount === 0) {
          updateFields.outcomes = doc.outcomes;
        }

        // Always refresh candidates for grouped events
        if (doc.marketType === 'grouped') {
          updateFields.candidates = doc.candidates;
          updateFields.marketType = 'grouped';
          updateFields.polymarketEventSlug = doc.polymarketEventSlug;
        }

        // Apply price-market classification if not already set
        if (!existing.resolutionSource) {
          Object.assign(updateFields, classifyPriceMarket(doc));
        }

        await Market.updateOne({ _id: existing._id }, { $set: updateFields });
        updated++;
      } else {
        // Classify before insert
        Object.assign(doc, classifyPriceMarket(doc));
        await Market.create(doc);
        created++;
      }
    } catch (err) {
      if (err.code === 11000) {
        // Slug collision — find the existing doc by title+category and update it
        try {
          const byTitle = await Market.findOne({ title: doc.title, categorySlug: doc.categorySlug });
          if (byTitle) {
            const updateFields = {
              volume: doc.volume, volume24hr: doc.volume24hr, liquidity: doc.liquidity,
              featured: doc.featured, image: doc.image,
            };
            if (doc.marketType === 'grouped') {
              updateFields.candidates = doc.candidates;
            }
            await Market.updateOne({ _id: byTitle._id }, { $set: updateFields });
            updated++;
          } else {
            skipped++;
          }
        } catch (e2) {
          skipped++;
        }
      } else {
        console.warn(`[MarketSync] Error saving market "${doc.title}": ${err.message}`);
        skipped++;
      }
    }
  }

  return { created, updated, skipped };
}

// Trim each category to CATEGORY_LIMIT events, removing lowest-volume excess.
// Markets that have real user trades are never deleted.
async function trimToCategoryLimit() {
  const categorySlugs = ['sports', 'crypto', 'politics', 'elections', 'finance', 'esports',
    'iran', 'geopolitics', 'tech', 'culture', 'economy', 'weather'];
  let totalDeleted = 0;

  for (const slug of categorySlugs) {
    // Recurring crypto windows (frequency set) are managed by syncRecurringCrypto
    // and excluded from the volume-based trim so live windows are never evicted.
    const markets = await Market.find({
      categorySlug: slug,
      status: 'active',
      $or: [{ frequency: null }, { frequency: { $exists: false } }],
    })
      .sort({ volume24hr: -1 })
      .select('_id tradeCount volume24hr')
      .lean();

    if (markets.length <= CATEGORY_LIMIT) continue;

    const toDelete = markets.slice(CATEGORY_LIMIT).filter(m => (m.tradeCount || 0) === 0);
    if (!toDelete.length) continue;

    const ids = toDelete.map(m => m._id);
    const result = await Market.deleteMany({ _id: { $in: ids } });
    totalDeleted += result.deletedCount;
    console.log(`[MarketSync] Trimmed ${result.deletedCount} markets from category "${slug}" (kept top ${CATEGORY_LIMIT})`);
  }

  return totalDeleted;
}

async function runSync() {
  console.log('[MarketSync] Starting sync...');
  const start = Date.now();

  // Build category map: slug → { _id, slug }
  const categories = await Category.find({});
  const categoryMap = {};
  for (const c of categories) categoryMap[c.slug] = c;

  // Fetch each category's tag in parallel
  const categoryTags = [
    { tag: 'sports', slug: 'sports' },
    { tag: 'crypto', slug: 'crypto' },
    { tag: 'politics', slug: 'politics' },
    { tag: 'elections', slug: 'elections' },
    { tag: 'finance', slug: 'finance' },
    { tag: 'esports', slug: 'esports' },
    { tag: 'iran', slug: 'iran' },
    { tag: 'geopolitics', slug: 'geopolitics' },
    { tag: 'tech', slug: 'tech' },
    { tag: 'pop-culture', slug: 'culture' },
    { tag: 'economy', slug: 'economy' },
    { tag: 'weather', slug: 'weather' },
  ];

  const fetchPromises = categoryTags.map(({ tag }) => fetchEventsByTag(tag));
  // Also fetch the global trending top
  fetchPromises.push(fetchEventsByTag(null));

  const results = await Promise.all(fetchPromises);

  // Deduplicate by event id
  const seen = new Set();
  const allEvents = [];
  for (const events of results) {
    for (const e of events) {
      if (!seen.has(e.id)) { seen.add(e.id); allEvents.push(e); }
    }
  }

  const { created, updated, skipped } = await syncEvents(allEvents, categoryMap);

  // Pull live recurring crypto windows (5m/15m/1h/4h Up-or-Down markets)
  await syncRecurringCrypto(categoryMap).catch(err =>
    console.warn('[MarketSync] Recurring crypto sync error:', err.message));

  // Enforce 50-per-category cap
  const trimmed = await trimToCategoryLimit();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[MarketSync] Done in ${elapsed}s — +${created} new  ~${updated} updated  ${skipped} skipped  ${trimmed} trimmed  (${allEvents.length} fetched)`);

  return { created, updated, skipped, trimmed };
}

let _syncTimer = null;
let _recurringTimer = null;

// Recurring crypto windows expire every few minutes, so refresh them far more
// often than the full sync. Defaults to 2 min; override via env.
const RECURRING_SYNC_INTERVAL_MS = parseInt(
  process.env.RECURRING_SYNC_INTERVAL_MS || '120000', 10);

function start() {
  if (process.env.MARKET_SYNC_ENABLED !== 'true') {
    console.log('[MarketSync] Disabled (MARKET_SYNC_ENABLED != true)');
    return;
  }

  // Run immediately on startup
  runSync().catch(err => console.error('[MarketSync] Initial sync error:', err.message));

  // Schedule full sync
  _syncTimer = setInterval(() => {
    runSync().catch(err => console.error('[MarketSync] Scheduled sync error:', err.message));
  }, SYNC_INTERVAL_MS);

  // Schedule frequent recurring-crypto refresh so live windows stay current
  _recurringTimer = setInterval(() => {
    syncRecurringCrypto().catch(err =>
      console.error('[MarketSync] Recurring crypto sync error:', err.message));
  }, RECURRING_SYNC_INTERVAL_MS);

  console.log(`[MarketSync] Scheduled every ${SYNC_INTERVAL_MS / 60000} min  (recurring crypto every ${RECURRING_SYNC_INTERVAL_MS / 60000} min)`);
}

function stop() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (_recurringTimer) { clearInterval(_recurringTimer); _recurringTimer = null; }
}

module.exports = { start, stop, runSync, syncRecurringCrypto, trimToCategoryLimit };
