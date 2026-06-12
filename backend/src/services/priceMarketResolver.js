/**
 * Price Market Resolver — cron-based settlement for crypto price markets.
 *
 * Replaces cryptoResolutionService.js. Key differences:
 *  - Uses Chainlink Data Streams as primary settlement source (not just on-chain feeds).
 *  - Stores the signed Chainlink report on the Market document for audit traceability.
 *  - Classifies markets by resolutionSource before attempting settlement.
 *
 * Resolution source classification (Polymarket parity):
 *   'chainlink' — crypto price markets (e.g. "Will BTC hit $100k?")
 *   'uma'       — subjective markets (elections, sports, events) → left for UMA/admin
 *   'admin'     — manually managed markets  → left for admin
 *
 * Settlement trigger: backend cron (this file).
 * Upgrade path      : CryptoMarketResolver.sol + Chainlink Automation (scaffolded in
 *                     contracts/src/CryptoMarketResolver.sol).
 *
 * IMPORTANT: Binance is NOT used here. Settlement uses Chainlink only.
 */

const Market = require('../models/Market');
const { getSettlementPrice, hasSettlementSource } = require('./chainlinkDataStreams');
const { parsePriceMarket: _parsePriceMarket } = require('../utils/classifyPriceMarket');

const ENABLED =
  process.env.PRICE_RESOLVER_ENABLED === 'true' ||
  process.env.CHAINLINK_AUTO_RESOLVE_ENABLED === 'true';

// ── Market helpers ────────────────────────────────────────────────────

/**
 * Extract settlement params from a market.
 * Prefers explicit schema fields (priceSymbol/priceTarget/priceComparator),
 * falls back to heuristic parsing via classifyPriceMarket util.
 */
const parsePriceMarket = (market) => {
  if (market.priceSymbol && market.priceTarget) {
    return {
      symbol: market.priceSymbol.toUpperCase(),
      target: market.priceTarget,
      comparator: market.priceComparator || 'gte',
    };
  }
  const parsed = _parsePriceMarket(market.title || '', market.description || '');
  return parsed || null;
};

const classifyResolutionSource = (market) => {
  if (market.resolutionSource) return market.resolutionSource;
  const parsed = parsePriceMarket(market);
  if (parsed && hasSettlementSource(parsed.symbol)) return 'chainlink';
  return 'uma';
};

// ── Resolution logic ──────────────────────────────────────────────────────────

/**
 * Resolve a single market via Chainlink.
 * Returns: 'yes' | 'no' | 'skipped' | 'error'
 */
const resolveOne = async (market) => {
  const parsed = parsePriceMarket(market);
  if (!parsed || !parsed.target) return 'skipped';
  if (!hasSettlementSource(parsed.symbol)) return 'skipped';

  const result = await getSettlementPrice(parsed.symbol);
  if (!result) {
    console.warn(`[PriceResolver] No settlement price for ${parsed.symbol}, skipping "${market.title}"`);
    return 'skipped';
  }

  const { price, source, report } = result;
  const outcome = parsed.comparator === 'lte'
    ? (price <= parsed.target ? 'yes' : 'no')
    : (price >= parsed.target ? 'yes' : 'no');

  try {
    const updateData = {
      status: 'resolved',
      resolvedOutcome: outcome,
      resolution: outcome === 'yes' ? 'Yes' : 'No',
      resolvedBy: null,
      resolvedAt: new Date(),
      chainlinkResolved: true,
      chainlinkPrice: price,
    };

    // Audit: store the signed stream report if available
    if (report) {
      updateData.chainlinkStreamReport = {
        feedId: result.feedId,
        benchmarkPrice: report.benchmarkPrice,
        observationsTimestamp: report.observationsTimestamp,
        validFromTimestamp: report.validFromTimestamp,
        nativeFee: report.nativeFee,
        fullReport: report.fullReport,
        resolvedAt: new Date(),
        source,
      };
    }

    const updated = await Market.findOneAndUpdate(
      { _id: market._id, status: 'active' },
      updateData,
      { new: true }
    );

    if (!updated) return 'skipped'; // already resolved by another process

    // Note: Legacy off-chain settlement removed. Users redeem positions on-chain via Conditional Tokens.

    console.log(
      `[PriceResolver] Auto-resolved "${market.title}" → ${outcome.toUpperCase()} ` +
      `(${parsed.symbol} @ $${price.toFixed(2)} vs target $${parsed.target.toLocaleString()}, source: ${source})`
    );
    return outcome;
  } catch (err) {
    console.error(`[PriceResolver] Failed to resolve "${market.title}": ${err.message}`);
    return 'error';
  }
};

/**
 * Main cron entry point.
 * Scans all active markets past endDate; resolves those classified as 'chainlink'.
 * Markets classified as 'uma' or 'admin' are skipped (left for their own resolvers).
 */
const resolveExpiredPriceMarkets = async () => {
  if (!ENABLED) return { resolved: 0, skipped: 0, errors: 0 };

  const now = new Date();
  // Prefer indexed query using stored classification fields (Phase 5.1)
  // Falls back to scanning all expired active markets for any unclassified ones.
  const expired = await Market.find({
    status: 'active',
    endDate: { $lte: now },
    $or: [
      { priceMarket: true, resolutionSource: 'chainlink' },
      { resolutionSource: null }, // unclassified markets (pre-backfill)
    ],
  }).lean();

  if (!expired.length) return { resolved: 0, skipped: 0, errors: 0 };

  let resolved = 0, skipped = 0, errors = 0;

  for (const market of expired) {
    const src = classifyResolutionSource(market);
    if (src !== 'chainlink') {
      skipped++;
      continue;
    }
    const result = await resolveOne(market);
    if (result === 'yes' || result === 'no') resolved++;
    else if (result === 'error') errors++;
    else skipped++;
  }

  if (resolved > 0 || errors > 0) {
    console.log(`[PriceResolver] Cycle complete — resolved: ${resolved}  skipped: ${skipped}  errors: ${errors}`);
  }

  return { resolved, skipped, errors };
};

module.exports = { resolveExpiredPriceMarkets, parsePriceMarket, classifyResolutionSource };
