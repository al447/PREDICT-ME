/**
 * Chainlink Data Feeds — spot price reader.
 *
 * Reads AggregatorV3Interface.latestRoundData() over existing RPC endpoints.
 * Used by priceFeed.js as the primary source for deposit valuation;
 * also consumed by chainlinkDataStreams.js as on-chain fallback for settlement.
 *
 * Feed addresses sourced from:
 *   https://docs.chain.link/data-feeds/price-feeds/addresses
 *
 * All feeds return price as int256 with `decimals()` decimal places (typically 8).
 * Stale feeds (updatedAt older than CHAINLINK_MAX_STALE_SEC) are rejected so
 * the caller can fall back to Binance (display) or skip (settlement).
 */

const { ethers } = require('ethers');

const ENABLED       = process.env.CHAINLINK_ENABLED === 'true';
const MAX_STALE_SEC = parseInt(process.env.CHAINLINK_MAX_STALE_SEC || '3600', 10);
const CACHE_TTL_MS  = 60_000; // 60-second in-process cache (same as priceFeed)

// Minimal ABI — only the two functions we need.
const AGGREGATOR_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
];

// ── Provider pool ────────────────────────────────────────────────────────────
// One JsonRpcProvider per RPC URL; lazy-created and reused to avoid socket churn.
// RPC env var → chainId, so we can skip eth_chainId detection (fails on Node 25).
const _RPC_ENV_CHAIN_ID = {
  ETH_RPC: 1,
  POLYGON_RPC: 137,
  POLYGON_RPC_URL: 137,
  ARB_RPC: 42161,
  BSC_RPC: 56,
  BASE_RPC: 8453,
};

const _providers = {};
function getProvider(rpcEnvKey) {
  const url = process.env[rpcEnvKey];
  if (!url) throw new Error(`[Chainlink] RPC env var "${rpcEnvKey}" is not set`);
  if (!_providers[url]) {
    // Disable batching: free-tier public RPCs (drpc.org, publicnode.com) reject
    // batch requests. StaticNetwork skips the eth_chainId discovery call.
    const { createProvider } = require('../config/contracts');
    _providers[url] = createProvider(url, _RPC_ENV_CHAIN_ID[rpcEnvKey], { batchMaxCount: 1 });
  }
  return _providers[url];
}

// ── Feed registry ─────────────────────────────────────────────────────────────
// symbol → { rpcEnv, address }
// Verified against https://docs.chain.link/data-feeds/price-feeds/addresses
//
// Strategy: read ALL feeds from Ethereum mainnet (ETH_RPC) where available —
// the price of ETH/BTC/BNB is chain-agnostic, so we don't need to match the
// source chain of the deposit. Polygon mainnet (POLYGON_RPC) for MATIC/POL/SOL.
// Arbitrum mainnet (ARB_RPC) for ARB.
//
// ⚠️  Double-check addresses at the link above before mainnet deployment.
const FEED_REGISTRY = {
  // ── Ethereum mainnet feeds (via ETH_RPC) ───────────────────────────────────
  ETH:   { rpcEnv: 'ETH_RPC',     address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419' }, // ETH/USD
  BTC:   { rpcEnv: 'ETH_RPC',     address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' }, // BTC/USD
  BNB:   { rpcEnv: 'BSC_RPC',     address: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE' }, // BNB/USD on BSC (active)

  // ── Polygon mainnet feeds (via POLYGON_RPC) ────────────────────────────────
  MATIC: { rpcEnv: 'POLYGON_RPC', address: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0' }, // MATIC/USD
  POL:   { rpcEnv: 'POLYGON_RPC', address: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0' }, // MATIC/USD (same feed)
  SOL:   { rpcEnv: 'POLYGON_RPC', address: '0x10C8264C0935b3B9870013e057f330Ff3e9C56dC' }, // SOL/USD

  // ── Arbitrum mainnet feeds (via ARB_RPC) ───────────────────────────────────
  ARB:   { rpcEnv: 'ARB_RPC',     address: '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6' }, // ARB/USD

  // ── Mapped feeds (no dedicated feed — use closest proxy) ──────────────────
  // cbBTC is a 1:1 BTC-backed Coinbase token; BTC/USD is an acceptable proxy.
  cbBTC: { rpcEnv: 'ETH_RPC',     address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' }, // BTC/USD proxy

  // ── Crypto market auto-resolution feeds ───────────────────────────────────
  LINK:  { rpcEnv: 'ETH_RPC',     address: '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c' }, // LINK/USD
  XRP:   { rpcEnv: 'POLYGON_RPC', address: '0x785ba89291f676b5386652eB12b30cF361020694' }, // XRP/USD on Polygon
  DOGE:  { rpcEnv: 'POLYGON_RPC', address: '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444' }, // DOGE/USD on Polygon
  ADA:   { rpcEnv: 'POLYGON_RPC', address: '0x882554df528115a743c4537828DA8D5B58e52544' }, // ADA/USD on Polygon
  AVAX:  { rpcEnv: 'POLYGON_RPC', address: '0xe01eA2fbd8D76ee323FbEd03eB9a8625EC981A10' }, // AVAX/USD on Polygon
  // DOT: no reliable public feed confirmed — skipped by settlement, Binance used for display
};

// ── In-process cache ─────────────────────────────────────────────────────────
const _cache = {};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the latest USD price for a symbol from a Chainlink Data Feed.
 * Returns null if:
 *   - CHAINLINK_ENABLED !== 'true'
 *   - No feed registered for the symbol
 *   - RPC call fails
 *   - Feed answer is non-positive
 *   - Feed is stale (updatedAt older than MAX_STALE_SEC)
 */
const getChainlinkPrice = async (symbol) => {
  if (!ENABLED) return null;

  const upper = symbol?.toUpperCase();
  const feed = FEED_REGISTRY[symbol] || FEED_REGISTRY[upper];
  if (!feed) return null;

  // Cache hit
  const now = Date.now();
  const cacheKey = `${upper}`;
  if (_cache[cacheKey] && now - _cache[cacheKey].ts < CACHE_TTL_MS) {
    return _cache[cacheKey].price;
  }

  try {
    const provider = getProvider(feed.rpcEnv);
    const aggregator = new ethers.Contract(feed.address, AGGREGATOR_ABI, provider);

    const roundData = await aggregator.latestRoundData();
    const decimals  = await aggregator.decimals();

    const { answer, updatedAt } = roundData;

    // Positivity guard
    if (!answer || answer <= 0n) {
      console.warn(`[Chainlink] Non-positive answer for ${upper}`);
      return null;
    }

    // Staleness guard
    const ageSeconds = Math.floor(now / 1000) - Number(updatedAt);
    if (ageSeconds > MAX_STALE_SEC) {
      console.warn(`[Chainlink] Stale feed for ${upper}: ${ageSeconds}s old (max ${MAX_STALE_SEC}s)`);
      return null;
    }

    const price = Number(answer) / Math.pow(10, Number(decimals));

    // Sanity clamp (same as priceFeed.js)
    const clamped = Math.min(Math.max(price, 0.0001), 10_000_000);
    _cache[cacheKey] = { price: clamped, ts: now };

    return clamped;
  } catch (err) {
    console.warn(`[Chainlink] Feed read failed for ${upper}: ${err.message}`);
    return null;
  }
};

/**
 * Returns the feed registry entry for a symbol, or null if unsupported.
 * Used by cryptoResolutionService to know if auto-resolution is possible.
 */
const hasFeed = (symbol) => {
  const upper = symbol?.toUpperCase();
  return !!(FEED_REGISTRY[symbol] || FEED_REGISTRY[upper]);
};

module.exports = { getChainlinkPrice, hasFeed, FEED_REGISTRY };
