const { getChainlinkPrice } = require('./chainlinkFeed');
const { getSpotPrice: getBinanceSpotPrice } = require('./binanceService');

const STABLE_SYMBOLS = new Set(['USDC', 'USDCe', 'USDT', 'DAI', 'BUSD', 'USDCE']);

/**
 * Get USD price for a token symbol (used for deposit valuation display).
 * Returns null if unknown.
 *
 * Source priority (display only — settlement uses chainlinkDataStreams.js):
 *   1. Chainlink Data Feed (on-chain, primary)
 *   2. Binance spot price (public REST, display fallback)
 */
const getUsdPrice = async (symbol) => {
  const upper = symbol?.toUpperCase();
  if (!upper) return null;

  // Stablecoins always $1
  if (STABLE_SYMBOLS.has(upper)) return 1.0;

  // ── 1. Chainlink Data Feed (primary) ─────────────────────────────────────
  const chainlinkPrice = await getChainlinkPrice(symbol);
  if (chainlinkPrice !== null) return chainlinkPrice;

  // ── 2. Binance spot price (display fallback) ──────────────────────────────
  const binancePrice = await getBinanceSpotPrice(symbol);
  if (binancePrice !== null) return binancePrice;

  return null;
};

/**
 * Calculate the USD value of a given raw token amount.
 */
const toUsd = async (symbol, amount) => {
  const price = await getUsdPrice(symbol);
  if (price == null) return null;
  return price * amount;
};

module.exports = { getUsdPrice, toUsd };
