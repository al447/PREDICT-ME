const Market = require('../models/Market');
const Trade = require('../models/Trade');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');

const CLOB_API = process.env.CLOB_API_URL || 'https://clob.polymarket.com';

// Map a day-range to Polymarket CLOB interval + fidelity (resolution in minutes).
const clobIntervalForDays = (numDays) => {
  if (numDays <= 1) return { interval: '1d', fidelity: 5 };
  if (numDays <= 7) return { interval: '1w', fidelity: 60 };
  if (numDays <= 30) return { interval: '1m', fidelity: 180 };
  return { interval: 'all', fidelity: 720 };
};

// Fetch real historical YES-price points for a Polymarket CLOB token id.
// Returns [{ t: unixSeconds, p: 0..1 }] or null on failure.
const fetchPolymarketHistory = async (tokenId, numDays) => {
  if (!tokenId || !/^[a-fx0-9]+$/i.test(tokenId)) return null;
  const { interval, fidelity } = clobIntervalForDays(numDays);
  try {
    const fetchFn = global.fetch || require('node-fetch');
    const url = `${CLOB_API}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`;
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[PriceHistory] CLOB HTTP ${res.status} for token ${tokenId}`);
      return null;
    }
    const json = await res.json();
    const history = Array.isArray(json?.history) ? json.history : [];
    return history.length ? history : null;
  } catch (err) {
    console.warn('[PriceHistory] CLOB fetch failed:', err.message);
    return null;
  }
};

const getMarkets = async (req, res, next) => {
  try {
    const { category, search, sort, tag, status = 'active', page = 1, limit = 20, featured } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.categorySlug = category;
    if (tag) query.tags = { $in: [tag] };
    if (search) query.$text = { $search: search };
    if (featured === 'true' || featured === true) query.featured = true;
    if (req.query.hotTopic === 'true') query.hotTopic = true;

    let sortObj = {};
    if (sort === 'volume') sortObj = { volume: -1 };
    else if (sort === 'volume24hr') sortObj = { volume24hr: -1 };
    else if (sort === 'newest') sortObj = { createdAt: -1 };
    else if (sort === 'ending') sortObj = { endDate: 1 };
    else if (sort === 'liquidity') sortObj = { liquidity: -1 };
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

    // ── Real Polymarket price history (primary source) ──────────────────────
    const intraday = numDays <= 1;
    const labelFor = (sec) => {
      const d = new Date(sec * 1000);
      return intraday
        ? d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    };

    // ── Grouped (multi-candidate) market: fetch top candidates in parallel ──
    if (market.marketType === 'grouped' && market.candidates?.length) {
      const TOP_N = 4; // show top-4 candidates by probability
      const topCandidates = [...market.candidates]
        .sort((a, b) => b.probability - a.probability)
        .slice(0, TOP_N)
        .filter(c => c.polymarketTokenId);

      if (topCandidates.length) {
        const histories = await Promise.all(
          topCandidates.map(c => fetchPolymarketHistory(c.polymarketTokenId, numDays))
        );

        // Find a candidate that has data, use its timestamps as the x-axis
        const refIdx = histories.findIndex(h => h && h.length > 1);
        if (refIdx !== -1) {
          const refHistory = histories[refIdx];
          const step = Math.max(1, Math.floor(refHistory.length / 90));
          const sampledTimes = refHistory
            .filter((_, i) => i % step === 0 || i === refHistory.length - 1)
            .map(pt => pt.t);

          // For each candidate, build a sorted array for nearest-neighbour lookup
          const sortedHistories = histories.map(h => h ? [...h].sort((a, b) => a.t - b.t) : null);

          // Find nearest price for a given timestamp (binary search)
          const nearestPrice = (sorted, t) => {
            if (!sorted || !sorted.length) return null;
            let lo = 0, hi = sorted.length - 1;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (sorted[mid].t < t) lo = mid + 1; else hi = mid;
            }
            // pick closest of lo and lo-1
            const a = sorted[lo];
            const b = lo > 0 ? sorted[lo - 1] : null;
            const best = b && Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a;
            // reject if more than 2× the fidelity window away (avoids wild extrapolation)
            const { fidelity } = clobIntervalForDays(numDays);
            if (Math.abs(best.t - t) > fidelity * 60 * 2) return null;
            return best.p;
          };

          const chartData = sampledTimes.map(t => {
            const point = { t: labelFor(t), time: t };
            topCandidates.forEach((c, i) => {
              const p = nearestPrice(sortedHistories[i], t);
              if (p !== null) point[c.name] = Math.round(p * 1000) / 10;
            });
            return point;
          });

          const chartOutcomes = topCandidates.map(c => c.name);
          return res.json({ success: true, chartData, outcomes: chartOutcomes, source: 'polymarket', marketType: 'grouped' });
        }
      }
    }

    // ── On-chain binary market: use own CLOB MarketPriceSnapshot data ─────
    const isOnChainBinary = process.env.ONCHAIN_ENABLED === 'true' &&
      market.onChain === true &&
      market.token0 &&
      market.token1 &&
      outcomes.length === 2;

    // ── Binary market: prefer own CLOB data, fall back to Polymarket ───────
    if (isOnChainBinary) {
      // Use own CLOB snapshots (source='clob') for chart data
      const snapshots = await MarketPriceSnapshot.find({
        market: market._id,
        source: 'clob', // Only CLOB-derived snapshots
        createdAt: { $gte: since },
      }).sort({ createdAt: 1 });

      if (snapshots.length > 1) {
        const yesName = outcomes[0] || 'Yes';
        const noName = outcomes[1];

        // Sample to ~90 points max
        const step = Math.max(1, Math.floor(snapshots.length / 90));
        const sampled = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);

        const chartData = sampled.map((snap) => {
          const yesPct = snap.probability ?? 50;
          const point = {
            t: intraday
              ? snap.createdAt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
              : snap.createdAt.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
            time: Math.floor(snap.createdAt.getTime() / 1000),
          };
          point[yesName] = yesPct;
          point[noName] = Math.round((100 - yesPct) * 10) / 10;
          return point;
        });

        return res.json({
          success: true,
          chartData,
          outcomes: [yesName, noName],
          source: 'predictme-clob',
        });
      }
      // Fall through to snapshot-based fallback if insufficient CLOB data
    }

    // ── Binary market: Polymarket mirror (legacy) ───────────────────────────
    if (market.polymarketTokenId && !isOnChainBinary) {
      const history = await fetchPolymarketHistory(market.polymarketTokenId, numDays);
      if (history && history.length > 1) {
        // Sample down to keep the payload light (~90 points max).
        const step = Math.max(1, Math.floor(history.length / 90));
        const sampled = history.filter((_, i) => i % step === 0 || i === history.length - 1);

        // The stored token is the YES side. For a binary Yes/No market the No
        // line is simply the mirror (100 - Yes). For non-binary markets we only
        // have one token, so we plot the first outcome's real series.
        const isBinary = outcomes.length === 2;
        const yesName = outcomes[0] || 'Yes';
        const noName = outcomes[1];

        const chartData = sampled.map((pt) => {
          const yesPct = Math.round(pt.p * 1000) / 10; // 0..100, 1 decimal
          const point = { t: labelFor(pt.t), time: pt.t };
          point[yesName] = yesPct;
          if (isBinary && noName) point[noName] = Math.round((100 - yesPct) * 10) / 10;
          return point;
        });

        return res.json({
          success: true,
          chartData,
          outcomes: isBinary && noName ? [yesName, noName] : [yesName],
          source: 'polymarket',
        });
      }
    }

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

const { getChartHistory: getBinanceChartHistory } = require('../services/binanceService');

// GET /api/markets/:slug/crypto-price-history?days=30&range=1W
const getMarketCryptoPriceHistory = async (req, res, next) => {
  try {
    // `range` (e.g. '1H','6H','1D','1W','1M','ALL') takes priority over numeric `days`
    const { days = 30, range } = req.query;
    const rangeOrDays = range || Math.max(1, Math.min(365, parseInt(days)));
    const market = await Market.findOne({ slug: req.params.slug });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const parsed = parseCryptoMarket(market);
    if (!parsed) {
      return res.json({ success: true, isCrypto: false, message: 'Not a crypto market' });
    }

    const chartData = await getBinanceChartHistory(parsed.symbol, rangeOrDays);
    if (!chartData) {
      console.warn(`[CryptoChart] No price data for ${parsed.symbol} (${market.slug}) - Binance unavailable`);
      return res.json({ success: true, isCrypto: true, symbol: parsed.symbol, target: parsed.target, chartData: null, message: 'Price data unavailable' });
    }

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
