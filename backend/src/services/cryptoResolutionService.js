/**
 * Chainlink Automation — crypto market auto-resolution.
 *
 * Checks all active crypto markets whose endDate has passed, reads the
 * current price from a Chainlink Data Feed, and resolves them as YES/NO
 * based on whether the price hit the target.
 *
 * Examples of markets resolved here:
 *   "Will BTC hit $100,000 by July 2026?"   → Chainlink BTC/USD vs $100k
 *   "Will ETH reach $5,000?"                → Chainlink ETH/USD vs $5k
 *
 * Subjective markets (elections, sports, events) have no `target` price
 * extracted from their title, so parseCryptoMarket returns null and they
 * are skipped — left for UMA / admin resolution as designed.
 *
 * This service is called by the Chainlink Automation cron in server.js.
 * The on-chain equivalent (CryptoMarketResolver.sol) is scaffolded in
 * contracts/src/CryptoMarketResolver.sol for the mainnet M7 milestone.
 */

const Market = require('../models/Market');
const { getChainlinkPrice, hasFeed } = require('./chainlinkFeed');

const ENABLED = process.env.CHAINLINK_AUTO_RESOLVE_ENABLED === 'true';

// ── Inline copy of parseCryptoMarket (avoids circular dep with marketController) ──
const SYMBOL_MAP = {
  BITCOIN: 'BTC', ETHEREUM: 'ETH', SOLANA: 'SOL', CARDANO: 'ADA',
  POLYGON: 'MATIC', POLKADOT: 'DOT', AVALANCHE: 'AVAX', CHAINLINK: 'LINK',
};

const parseCryptoMarket = (market) => {
  const text = `${market.title} ${market.description || ''}`;
  const symbolMatch = text.match(
    /\b(BTC|ETH|SOL|ADA|MATIC|DOT|AVAX|LINK|UNI|XRP|DOGE|SHIB|BNB|LTC|TRX|BITCOIN|ETHEREUM|SOLANA|CARDANO|POLYGON|POLKADOT|AVALANCHE|CHAINLINK)\b/i
  );
  const targetMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(K|k|M|m)?/);

  if (!symbolMatch || !targetMatch) return null;

  const rawSymbol = symbolMatch[1].toUpperCase();
  const symbol = SYMBOL_MAP[rawSymbol] || rawSymbol;

  let target = parseFloat(targetMatch[1].replace(/,/g, ''));
  if (targetMatch[2]) {
    const mult = targetMatch[2].toLowerCase();
    if (mult === 'k') target *= 1_000;
    if (mult === 'm') target *= 1_000_000;
  }

  return { symbol, target };
};

// ── Resolution logic ─────────────────────────────────────────────────────────

/**
 * Resolve a single market.
 * Returns: 'yes' | 'no' | 'skipped' | 'error'
 */
const resolveOne = async (market) => {
  const parsed = parseCryptoMarket(market);
  if (!parsed || !parsed.target) return 'skipped'; // no target — leave for UMA/admin
  if (!hasFeed(parsed.symbol)) return 'skipped';    // no Chainlink feed — leave for UMA/admin

  const price = await getChainlinkPrice(parsed.symbol);
  if (price === null) {
    console.warn(`[CryptoResolution] Chainlink feed unavailable for ${parsed.symbol}, skipping "${market.title}"`);
    return 'skipped';
  }

  const outcome = price >= parsed.target ? 'yes' : 'no';

  try {
    // Atomically mark resolved (same race-safe pattern as adminMarketController)
    const updated = await Market.findOneAndUpdate(
      { _id: market._id, status: 'active' },
      {
        status: 'resolved',
        resolvedOutcome: outcome,
        resolution: outcome === 'yes' ? 'Yes' : 'No',
        resolvedBy: null,
        resolvedAt: new Date(),
        chainlinkResolved: true,
        chainlinkPrice: price,
      },
      { new: true }
    );

    if (!updated) return 'skipped'; // already resolved by someone else

    // Note: Legacy off-chain settlement removed. Users redeem positions on-chain via Conditional Tokens.

    console.log(
      `[CryptoResolution] Auto-resolved "${market.title}" → ${outcome.toUpperCase()} ` +
      `(${parsed.symbol} @ $${price.toFixed(2)} vs target $${parsed.target.toLocaleString()})`
    );
    return outcome;
  } catch (err) {
    console.error(`[CryptoResolution] Failed to resolve "${market.title}": ${err.message}`);
    return 'error';
  }
};

/**
 * Main entry point called by the cron.
 * Scans all active markets past their endDate that have a crypto price target
 * and a Chainlink feed, and resolves them.
 */
const resolveExpiredCryptoMarkets = async () => {
  if (!ENABLED) return { resolved: 0, skipped: 0, errors: 0 };

  const now = new Date();
  const expired = await Market.find({
    status: 'active',
    endDate: { $lte: now },
  }).lean();

  if (!expired.length) return { resolved: 0, skipped: 0, errors: 0 };

  let resolved = 0, skipped = 0, errors = 0;

  for (const market of expired) {
    const result = await resolveOne(market);
    if (result === 'yes' || result === 'no') resolved++;
    else if (result === 'error') errors++;
    else skipped++;
  }

  if (resolved > 0 || errors > 0) {
    console.log(`[CryptoResolution] Cycle complete — resolved: ${resolved}  skipped: ${skipped}  errors: ${errors}`);
  }

  return { resolved, skipped, errors };
};

module.exports = { resolveExpiredCryptoMarkets };
