const Market = require('../models/Market');
const Trade = require('../models/Trade');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');

const getMarkets = async (req, res, next) => {
  try {
    const { category, search, sort, tag, status = 'active', page = 1, limit = 20, featured } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.categorySlug = category;
    if (tag) query.tags = { $in: [tag] };
    if (search) query.$text = { $search: search };
    if (featured === 'true' || featured === true) query.featured = true;

    let sortObj = {};
    if (sort === 'volume') sortObj = { volume: -1 };
    else if (sort === 'newest') sortObj = { createdAt: -1 };
    else if (sort === 'ending') sortObj = { endDate: 1 };
    else sortObj = { volume: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, markets] = await Promise.all([
      Market.countDocuments(query),
      Market.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('category', 'name slug icon')
        .lean(),
    ]);

    // Allow browsers/CDN to serve the list instantly on repeat navigation while
    // revalidating in the background. Skip caching for user-specific search.
    if (!search) {
      res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    }
    res.json({
      success: true,
      markets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

const getFeaturedMarkets = async (req, res, next) => {
  try {
    const markets = await Market.find({ featured: true, status: 'active' })
      .sort({ volume: -1 })
      .limit(10)
      .populate('category', 'name slug icon')
      .lean();
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    res.json({ success: true, markets });
  } catch (error) {
    next(error);
  }
};

const getMarketBySlug = async (req, res, next) => {
  try {
    const market = await Market.findOne({ slug: req.params.slug }).populate('category', 'name slug icon').lean();
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    res.json({ success: true, market });
  } catch (error) {
    next(error);
  }
};

// Build price history from MarketPriceSnapshot collection — 100% real data
const getMarketPriceHistory = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const numDays = parseInt(days);
    const market = await Market.findOne({ slug: req.params.slug });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);
    const outcomes = (market.outcomes || []).map(o => o.name);

    // Fetch real price snapshots for this market in time range
    const snapshots = await MarketPriceSnapshot.find({
      market: market._id,
      createdAt: { $gte: since },
    }).sort({ createdAt: 1 });

    // Build date labels for each day in range
    const labels = [];
    for (let d = 0; d < numDays; d++) {
      const date = new Date(since.getTime() + d * 24 * 60 * 60 * 1000);
      labels.push(date.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
    }

    // If no snapshots yet, return empty chart with current probability as single point (honest UX)
    if (snapshots.length === 0) {
      const chartData = labels.length > 0
        ? [
            { t: labels[0], ...Object.fromEntries(outcomes.map((o, i) => [o, Math.round(market.outcomes[i]?.probability ?? 50)])) },
            { t: labels[labels.length - 1], ...Object.fromEntries(outcomes.map((o, i) => [o, Math.round(market.outcomes[i]?.probability ?? 50)])) },
          ]
        : [{ t: 'Now', ...Object.fromEntries(outcomes.map((o, i) => [o, Math.round(market.outcomes[i]?.probability ?? 50)])) }];
      return res.json({ success: true, chartData, outcomes, insufficientData: true, message: 'Chart will populate as trading activity occurs' });
    }

    // Bucket snapshots into daily intervals (keep latest snapshot per day per outcome)
    const buckets = {};
    for (const snap of snapshots) {
      const day = snap.createdAt.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      if (!buckets[day]) buckets[day] = {};
      // Overwrite so we keep the last snapshot of the day
      buckets[day][snap.outcome] = snap.probability;
    }

    // Forward-fill: start from earliest known values, fill gaps
    const lastValues = Object.fromEntries(outcomes.map((o, i) => [o, Math.round(market.outcomes[i]?.probability ?? 50)]));

    const chartData = labels.map((t) => {
      const point = { t };
      for (const outcome of outcomes) {
        if (buckets[t]?.[outcome] !== undefined) {
          lastValues[outcome] = Math.round(buckets[t][outcome]);
        }
        point[outcome] = lastValues[outcome];
      }
      return point;
    });

    res.json({ success: true, chartData, outcomes, insufficientData: snapshots.length < 3 });
  } catch (error) {
    next(error);
  }
};

// Extract crypto symbol and target price from market title/description
// Examples: "Will ETH hit $5,000 by August 2026?" → { symbol: 'ETH', target: 5000 }
const parseCryptoMarket = (market) => {
  const text = `${market.title} ${market.description || ''}`;
  const symbolMatch = text.match(/\b(BTC|ETH|SOL|ADA|MATIC|DOT|AVAX|LINK|UNI|XRP|DOGE|SHIB|BNB|LTC|TRX|BITCOIN|ETHEREUM|SOLANA|CARDANO|POLYGON|POLKADOT|AVALANCHE|CHAINLINK)\b/i);
  const targetMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(K|k|M|m)?/);

  if (!symbolMatch) return null;

  const symbolMap = {
    BITCOIN: 'BTC', ETHEREUM: 'ETH', SOLANA: 'SOL', CARDANO: 'ADA',
    POLYGON: 'MATIC', POLKADOT: 'DOT', AVALANCHE: 'AVAX', CHAINLINK: 'LINK',
  };
  const rawSymbol = symbolMatch[1].toUpperCase();
  const symbol = symbolMap[rawSymbol] || rawSymbol;

  let target = null;
  if (targetMatch) {
    target = parseFloat(targetMatch[1].replace(/,/g, ''));
    if (targetMatch[2]) {
      const mult = targetMatch[2].toLowerCase();
      if (mult === 'k') target *= 1000;
      if (mult === 'm') target *= 1_000_000;
    }
  }
  return { symbol, target };
};

const CRYPTO_SYMBOL_TO_ID = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
  MATIC: 'matic-network', DOT: 'polkadot', AVAX: 'avalanche-2',
  LINK: 'chainlink', UNI: 'uniswap', XRP: 'ripple', DOGE: 'dogecoin',
  SHIB: 'shiba-inu', BNB: 'binancecoin', LTC: 'litecoin', TRX: 'tron',
};

const _cryptoCache = {};
const CRYPTO_CACHE_TTL = 5 * 60_000; // 5 min (reduce CoinGecko API calls)

const fetchCryptoHistory = async (symbol, days) => {
  const coinId = CRYPTO_SYMBOL_TO_ID[symbol];
  if (!coinId) return null;

  const cacheKey = `${coinId}_${days}`;
  const cached = _cryptoCache[cacheKey];
  if (cached && Date.now() - cached.ts < CRYPTO_CACHE_TTL) return cached.data;

  const apiKey = process.env.COINGECKO_API_KEY || '';
  // Use the Pro base if an API key is configured, otherwise the public base
  const base = process.env.COINGECKO_BASE
    || (apiKey ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3');
  const url = `${base}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'PolyBet365/1.0 (+https://polybet365.com)',
  };
  // CoinGecko: demo keys use x-cg-demo-api-key, pro keys use x-cg-pro-api-key
  if (apiKey) {
    headers[base.includes('pro-api') ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = apiKey;
  }

  try {
    const fetchFn = global.fetch || require('node-fetch');
    const res = await fetchFn(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[Crypto Price History] CoinGecko HTTP ${res.status} for ${coinId}: ${body.slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    if (!Array.isArray(json.prices)) return null;
    _cryptoCache[cacheKey] = { data: json.prices, ts: Date.now() };
    return json.prices; // [[timestamp, price], ...]
  } catch (err) {
    console.warn('[Crypto Price History] Fetch failed:', err.message);
    return null;
  }
};

// GET /api/markets/:slug/crypto-price-history?days=30
const getMarketCryptoPriceHistory = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const numDays = Math.max(1, Math.min(365, parseInt(days)));
    const market = await Market.findOne({ slug: req.params.slug });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const parsed = parseCryptoMarket(market);
    if (!parsed) {
      return res.json({ success: true, isCrypto: false, message: 'Not a crypto market' });
    }

    const prices = await fetchCryptoHistory(parsed.symbol, numDays);
    if (!prices) {
      console.warn(`[CryptoChart] No price data for ${parsed.symbol} (${market.slug}) - CoinGecko may be rate limited`);
      return res.json({ success: true, isCrypto: true, symbol: parsed.symbol, target: parsed.target, chartData: null, message: 'Price data unavailable' });
    }

    // Sample to max 60 points
    const step = Math.max(1, Math.floor(prices.length / 60));
    const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1);

    const chartData = sampled.map(([ts, price]) => ({
      t: ts,
      date: new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      fullDate: new Date(ts).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      price: Math.round(price * 100) / 100,
    }));

    const currentPrice = chartData[chartData.length - 1]?.price ?? null;
    res.json({
      success: true,
      isCrypto: true,
      symbol: parsed.symbol,
      target: parsed.target,
      currentPrice,
      chartData,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMarkets, getFeaturedMarkets, getMarketBySlug, getMarketPriceHistory, getMarketCryptoPriceHistory };
