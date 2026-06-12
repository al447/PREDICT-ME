/**
 * classifyPriceMarket — Phase 4.2
 *
 * Examines a market document (or raw fields) and returns classification fields:
 *   resolutionSource : 'chainlink' | 'uma' | 'admin'
 *   priceMarket      : Boolean
 *   priceSymbol      : String | null
 *   priceTarget      : Number | null
 *   priceComparator  : 'gte' | 'lte' | null
 *
 * Rule:
 *   - If market has a detectable crypto symbol + price target + a Chainlink
 *     settlement source available → resolutionSource='chainlink', priceMarket=true.
 *   - Otherwise → resolutionSource='uma' (left for UMA / admin), priceMarket=false.
 *
 * This is the single source of truth for classification; called from:
 *   - marketSyncService.js  (on every upsert)
 *   - scripts/classifyExistingMarkets.js  (one-off backfill)
 *   - adminMarketController  (on manual create)
 */

const { hasSettlementSource } = require('../services/chainlinkDataStreams');

const SYMBOL_MAP = {
  BITCOIN: 'BTC', ETHEREUM: 'ETH', SOLANA: 'SOL', CARDANO: 'ADA',
  POLYGON: 'MATIC', POLKADOT: 'DOT', AVALANCHE: 'AVAX', CHAINLINK: 'LINK',
  BINANCE: 'BNB', LITECOIN: 'LTC', RIPPLE: 'XRP', DOGECOIN: 'DOGE',
};

const KNOWN_SYMBOLS = new Set([
  'BTC','ETH','SOL','ADA','MATIC','DOT','AVAX','LINK','UNI','XRP',
  'DOGE','SHIB','BNB','LTC','TRX','POL','ARB',
]);

/**
 * Parse a market title + description for a crypto symbol and price target.
 * Returns { symbol, target, comparator } or null.
 */
const parsePriceMarket = (title = '', description = '') => {
  const text = `${title} ${description}`;

  // Symbol detection
  const symbolMatch = text.match(
    /\b(BTC|ETH|SOL|ADA|MATIC|DOT|AVAX|LINK|UNI|XRP|DOGE|SHIB|BNB|LTC|TRX|POL|ARB|BITCOIN|ETHEREUM|SOLANA|CARDANO|POLYGON|POLKADOT|AVALANCHE|CHAINLINK|BINANCE|LITECOIN|RIPPLE|DOGECOIN)\b/i
  );
  if (!symbolMatch) return null;

  // Price target detection: $100k, $100,000, $1.5M
  const targetMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(K|k|M|m)?/);
  if (!targetMatch) return null;

  const rawSymbol = symbolMatch[1].toUpperCase();
  const symbol = SYMBOL_MAP[rawSymbol] || (KNOWN_SYMBOLS.has(rawSymbol) ? rawSymbol : null);
  if (!symbol) return null;

  let target = parseFloat(targetMatch[1].replace(/,/g, ''));
  if (isNaN(target) || target <= 0) return null;

  if (targetMatch[2]) {
    const mult = targetMatch[2].toLowerCase();
    if (mult === 'k') target *= 1_000;
    if (mult === 'm') target *= 1_000_000;
  }

  // Comparator: below/drop/fall/under → lte; default → gte
  const comparator = /\b(below|drop|fall|under|less than|dip)\b/i.test(text) ? 'lte' : 'gte';

  return { symbol, target, comparator };
};

/**
 * Classify a market and return the fields to $set on the Market document.
 * Accepts either a full Market document or plain { title, description, priceSymbol, priceTarget, priceComparator }.
 */
const classifyPriceMarket = (market) => {
  // If fields already set explicitly, respect them
  if (market.priceSymbol && market.priceTarget && market.resolutionSource) {
    return {
      resolutionSource: market.resolutionSource,
      priceMarket: !!market.priceMarket,
      priceSymbol: market.priceSymbol,
      priceTarget: market.priceTarget,
      priceComparator: market.priceComparator || 'gte',
    };
  }

  const parsed = parsePriceMarket(market.title || '', market.description || '');

  if (!parsed || !hasSettlementSource(parsed.symbol)) {
    return {
      resolutionSource: market.resolutionSource || 'uma',
      priceMarket: false,
      priceSymbol: null,
      priceTarget: null,
      priceComparator: null,
    };
  }

  return {
    resolutionSource: 'chainlink',
    priceMarket: true,
    priceSymbol: parsed.symbol,
    priceTarget: parsed.target,
    priceComparator: parsed.comparator,
  };
};

module.exports = { classifyPriceMarket, parsePriceMarket };
