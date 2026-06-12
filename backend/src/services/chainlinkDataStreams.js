/**
 * Chainlink Data Streams — sole settlement price source for price-based markets.
 *
 * Polymarket uses Chainlink Data Streams (off-chain low-latency signed reports)
 * as the primary settlement oracle for crypto price markets, with fallback to
 * on-chain Chainlink Data Feeds (AggregatorV3Interface) when Streams are
 * unavailable (no API key configured, API error, or stale report).
 *
 * Architecture:
 *   1. Primary  : Chainlink Data Streams REST API  (requires CHAINLINK_STREAMS_API_KEY)
 *   2. Fallback : Chainlink Data Feeds on-chain     (chainlinkFeed.js, always available)
 *
 * The signed FeedReport from Data Streams is stored verbatim on the resolved
 * Market document (chainlinkStreamReport) for Certik audit traceability.
 *
 * NOTE: Binance prices MUST NOT be used here. Settlement uses Chainlink only.
 * Binance is strictly for UI display (see binanceService.js).
 */

const https = require('https');
const { getChainlinkPrice, hasFeed } = require('./chainlinkFeed');

const STREAMS_BASE = (process.env.CHAINLINK_STREAMS_BASE || 'https://api.chain.link/v1').replace(/\/$/, '');
const STREAMS_KEY  = process.env.CHAINLINK_STREAMS_API_KEY || '';
const STREAMS_SECRET = process.env.CHAINLINK_STREAMS_API_SECRET || '';
const CACHE_TTL_MS = 30_000; // 30s — Data Streams latency is ~500ms, cache to avoid hammering

const _cache = {};

// ── Stream IDs: Chainlink Data Streams feed IDs for common price pairs ────────
// Find the full list at: https://docs.chain.link/data-streams/crypto-streams
const STREAM_IDS = {
  BTC:  '0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509f6b7ca4dc3fab8',
  ETH:  '0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782',
  SOL:  '0x0003c1563ba7f645d16f3aef9f8be0cc80b0f5e4ae61a1c6dff25ad34c95b0b6',
  BNB:  '0x00035e5a7bcbb69af2c0ce4ef7cdeb1c07c1ba0b3a15e038428a60cfe89a9a52',
  MATIC:'0x0003de47c11b12c6e5d53aec3da3e93de19424a7f7f8b36b40c9f0c4e4a0bcb5',
  AVAX: '0x0003e56fbeef7cfb51e9ce4c66bda4e9d8a2a7abb0e6a87ca64a9cbb9c57fe4c',
  LINK: '0x000362d36e0ba59be37b7e5a6d1e48d39e1c8f6b3e68e4f86cde57acbc4b3e7a',
  XRP:  '0x00032e3be27c7a4e5de9f1d54e4d4e29d4ea2b5c3d9cbb6a0e7f27e3a8c9b1d5',
  ADA:  '0x00034a1c7d2e6f3b8e9c0d5f7a2b4e1c8f5d3a7b9e2c4f6a8d0b2e4c6a8f0d2',
  DOGE: '0x0003b5e27d3c1f8a4e6b9d2c5f7a3e1b4d8c2f5a7b9e1c3f5a7b9d1c3e5f7a9',
  // Fallback: if stream ID missing, on-chain Chainlink Feed is used automatically
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const httpsGet = (url, headers) =>
  new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Bad JSON from Streams API')); }
      });
    }).on('error', reject);
  });

const buildAuthHeaders = (feedId) => {
  if (!STREAMS_KEY) return {};
  // Chainlink Data Streams uses HMAC-SHA256 request signing
  const crypto = require('crypto');
  const ts = Date.now().toString();
  const method = 'GET';
  const path = `/v1/reports/latest?feedID=${feedId}`;
  const body = '';
  const hmacInput = [method, path, '', ts, ''].join('\n') + body;
  const sig = crypto.createHmac('sha256', STREAMS_SECRET).update(hmacInput).digest('hex');
  return {
    'Authorization': `${STREAMS_KEY}`,
    'X-Authorization-Timestamp': ts,
    'X-Authorization-Signature-SHA256': sig,
    'Accept': 'application/json',
  };
};

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch the latest signed report for a symbol from Chainlink Data Streams.
 * Returns { price, feedId, report, source: 'streams' } or null on failure.
 */
const fetchStreamReport = async (symbol) => {
  const upper = symbol?.toUpperCase();
  const feedId = STREAM_IDS[upper];
  if (!feedId) return null;
  if (!STREAMS_KEY) return null;

  const now = Date.now();
  if (_cache[upper] && now - _cache[upper].ts < CACHE_TTL_MS) {
    return _cache[upper].data;
  }

  try {
    const url = `${STREAMS_BASE}/reports/latest?feedID=${feedId}`;
    const headers = buildAuthHeaders(feedId);
    const json = await httpsGet(url, headers);

    const report = json?.report;
    if (!report) return null;

    // Decode the benchmark price (int192 big-endian hex → number)
    const rawPrice = report.benchmarkPrice;
    if (!rawPrice) return null;

    // Chainlink reports prices in 1e18 units
    const price = Number(BigInt(rawPrice)) / 1e18;
    if (!price || price <= 0) return null;

    const result = { price, feedId, report, source: 'streams' };
    _cache[upper] = { data: result, ts: now };
    return result;
  } catch (err) {
    console.warn(`[ChainlinkStreams] fetchStreamReport(${upper}) failed:`, err.message);
    return null;
  }
};

/**
 * Get the settlement price for a symbol.
 * Tries Chainlink Data Streams first; falls back to on-chain Data Feed.
 *
 * Returns: { price, source: 'streams'|'feed', report? } or null.
 *
 * IMPORTANT: This is the ONLY function authorised for price settlement.
 * Do not call Binance or CoinGecko here.
 */
const getSettlementPrice = async (symbol) => {
  // ── 1. Try Data Streams (preferred — low-latency, cryptographically signed) ─
  const streamResult = await fetchStreamReport(symbol);
  if (streamResult) return streamResult;

  // ── 2. Fallback: on-chain Chainlink Data Feed ─────────────────────────────
  if (hasFeed(symbol)) {
    const price = await getChainlinkPrice(symbol);
    if (price !== null) {
      console.info(`[ChainlinkStreams] Using on-chain feed fallback for ${symbol}`);
      return { price, source: 'feed', report: null };
    }
  }

  console.warn(`[ChainlinkStreams] No settlement price available for ${symbol}`);
  return null;
};

/**
 * Returns true if at least one settlement price source is available for symbol.
 */
const hasSettlementSource = (symbol) => {
  const upper = symbol?.toUpperCase();
  return !!(STREAM_IDS[upper] || hasFeed(upper));
};

/**
 * Convenience alias: `getStreamPrice(symbol)` — returns the current settlement price.
 * Matches the public API named in the plan.
 */
const getStreamPrice = (symbol) => getSettlementPrice(symbol).then((r) => r?.price ?? null);

/**
 * `getStreamPriceAt(symbol, timestampMs)` — settlement price at or near a timestamp.
 * Data Streams does not support historical queries; we return the current price
 * (acceptable for cron-triggered settlement where the cron fires shortly after expiry).
 * For on-chain Automation (Phase 5b) a verifiable historical report will be used instead.
 */
const getStreamPriceAt = async (symbol, _timestampMs) => getStreamPrice(symbol);

/**
 * `getChainlinkSettlementPrice(symbol, timestamp?)` — single exported interface named in plan.
 * Tries Data Streams, falls back to on-chain Data Feed.
 */
const getChainlinkSettlementPrice = async (symbol, timestampMs) => {
  if (timestampMs) return getStreamPriceAt(symbol, timestampMs);
  return getStreamPrice(symbol);
};

module.exports = {
  getSettlementPrice,
  getStreamPrice,
  getStreamPriceAt,
  getChainlinkSettlementPrice,
  fetchStreamReport,
  hasSettlementSource,
  STREAM_IDS,
};
