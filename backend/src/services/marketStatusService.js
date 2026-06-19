/**
 * Market Status Service — Polymarket-style market lifecycle management.
 *
 * Handles the complete flow from active → closed → resolved for both
 * paper (off-chain) and on-chain markets.
 *
 * Market Lifecycle:
 *   1. active → trading open, orders accepted
 *   2. expired (endDate passed) → auto-close cron sets status: 'closed'
 *   3. pendingResolution (closed, waiting for oracle/admin) → intermediate state
 *   4. resolved → outcome determined, payouts executed
 *
 * On-chain vs Paper distinction:
 *   - Paper markets: Resolved via admin UI or Chainlink (crypto prices)
 *   - On-chain markets: UMA oracle handles resolution (propose + 2h dispute window)
 *     OR Chainlink Automation (for crypto price markets)
 */

const Market = require('../models/Market');
const { resolveExpiredPriceMarkets } = require('./priceMarketResolver');

const ENABLED = process.env.MARKET_STATUS_SERVICE_ENABLED !== 'false'; // default: enabled

// ── Configuration ───────────────────────────────────────────────────────────

const CRON_INTERVAL_MS = parseInt(
  process.env.MARKET_STATUS_INTERVAL_MS || '60000', // default: 1 minute
  10
);

// ── Phase 1: Auto-Close Expired Markets ─────────────────────────────────────

/**
 * Find and close markets where endDate has passed but status is still 'active'.
 * This is the critical "trading stops" transition Polymarket uses.
 *
 * Returns: { closed: number, alreadyClosed: number, errors: number }
 */
const closeExpiredMarkets = async () => {
  const now = new Date();

  // Find active markets past their endDate
  // Both paper and on-chain markets get closed when they expire
  const expiredMarkets = await Market.find({
    status: 'active',
    endDate: { $lte: now },
  }).lean();

  if (!expiredMarkets.length) {
    return { closed: 0, alreadyClosed: 0, errors: 0 };
  }

  let closed = 0;
  let errors = 0;

  for (const market of expiredMarkets) {
    try {
      const result = await Market.findOneAndUpdate(
        { _id: market._id, status: 'active' }, // ensure atomic
        {
          status: 'closed',
          closedAt: new Date(),
          closedBy: 'system', // auto-close by cron
        },
        { new: true }
      );

      if (result) {
        closed++;
        console.log(
          `[MarketStatus] Auto-closed expired market: "${market.title}" (${market._id}) | ` +
          `On-chain: ${market.onChain ? 'yes' : 'no'} | EndDate: ${market.endDate.toISOString()}`
        );

        // Cancel any open CLOB orders for this market
        if (market.conditionId) {
          await cancelClobOrders(market.conditionId);
        }
      }
    } catch (err) {
      errors++;
      console.error(`[MarketStatus] Failed to close market ${market._id}:`, err.message);
    }
  }

  if (closed > 0 || errors > 0) {
    console.log(`[MarketStatus] Close cycle complete — closed: ${closed}  errors: ${errors}`);
  }

  return { closed, alreadyClosed: 0, errors };
};

/**
 * Cancel all open CLOB orders for a given conditionId.
 */
const cancelClobOrders = async (conditionId) => {
  try {
    const Order = require('../models/Order');
    const cancelResult = await Order.updateMany(
      { conditionId, status: { $in: ['open', 'partially_filled'] } },
      { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'market_expired' }
    );
    if (cancelResult.modifiedCount > 0) {
      console.log(`[MarketStatus] Cancelled ${cancelResult.modifiedCount} open orders for condition ${conditionId}`);
    }
  } catch (err) {
    console.error(`[MarketStatus] Failed to cancel orders for ${conditionId}:`, err.message);
  }
};

// ── Phase 2: Auto-Resolve Eligible Markets ──────────────────────────────────

/**
 * Trigger auto-resolution for markets that are:
 * 1. Closed/expired
 * 2. Eligible for auto-resolution (crypto price markets via Chainlink)
 *
 * This delegates to priceMarketResolver for actual resolution logic.
 */
const resolveEligibleMarkets = async () => {
  // priceMarketResolver handles its own enabled check and finds eligible markets
  const result = await resolveExpiredPriceMarkets();
  return result;
};

// ── Phase 3: Track Pending Resolution ───────────────────────────────────────

/**
 * Count markets that are closed but not yet resolved.
 * These are "awaiting resolution" — either waiting for:
 * - UMA oracle proposal (on-chain subjective markets)
 * - Admin manual resolution (paper markets)
 * - Chainlink Automation (crypto price markets — should auto-resolve quickly)
 */
const getPendingResolutionStats = async () => {
  const now = new Date();

  const [pendingPaper, pendingOnChain, pendingCrypto] = await Promise.all([
    // Paper markets (not on-chain) that are closed but not resolved
    Market.countDocuments({
      status: 'closed',
      onChain: { $ne: true },
      resolvedAt: null,
    }),

    // On-chain markets (UMA-based) awaiting resolution
    Market.countDocuments({
      status: 'closed',
      onChain: true,
      resolvedAt: null,
      // Exclude crypto price markets (these auto-resolve via Chainlink)
      $or: [
        { priceMarket: false },
        { priceMarket: null },
        { resolutionSource: { $ne: 'chainlink' } },
      ],
    }),

    // Crypto price markets that should auto-resolve
    Market.countDocuments({
      status: 'closed',
      onChain: true,
      priceMarket: true,
      resolutionSource: 'chainlink',
      resolvedAt: null,
    }),
  ]);

  return {
    total: pendingPaper + pendingOnChain + pendingCrypto,
    paper: pendingPaper,
    onChain: pendingOnChain,
    cryptoAuto: pendingCrypto,
  };
};

// ── Phase 4: Main Cron Entry Point ───────────────────────────────────────────

/**
 * Purge closed/resolved markets that have no real user trades.
 * These are Gamma-synced markets that expired naturally — no cleanup needed,
 * just remove them so the DB stays lean.
 */
const purgeExpiredSyncedMarkets = async () => {
  const result = await Market.deleteMany({
    status: { $in: ['closed', 'resolved'] },
    tradeCount: { $in: [0, null] },
  });
  return result.deletedCount || 0;
};

/**
 * Main cron entry point — runs every minute (configurable).
 *
 * Sequence:
 * 1. Close expired markets (active → closed)
 * 2. Purge closed/resolved markets with no trades
 * 3. Auto-resolve eligible markets (Chainlink crypto prices)
 * 4. Log pending resolution stats
 */
const runMarketStatusCycle = async () => {
  if (!ENABLED) {
    return { status: 'disabled' };
  }

  const startTime = Date.now();

  try {
    // Step 1: Close expired markets
    const closeResult = await closeExpiredMarkets();

    // Step 2: Purge closed/resolved markets with no user trades (keep DB lean)
    const purged = await purgeExpiredSyncedMarkets();

    // Step 3: Auto-resolve eligible markets (delegates to priceMarketResolver)
    const resolveResult = await resolveEligibleMarkets();

    // Step 4: Get pending stats for monitoring
    const pendingStats = await getPendingResolutionStats();

    const duration = Date.now() - startTime;

    // Only log if something happened or stats changed significantly
    if (closeResult.closed > 0 ||
        purged > 0 ||
        resolveResult.resolved > 0 ||
        resolveResult.errors > 0 ||
        pendingStats.total > 0) {
      console.log(
        `[MarketStatus] Cycle complete in ${duration}ms — ` +
        `closed: ${closeResult.closed}, purged: ${purged}, ` +
        `resolved: ${resolveResult.resolved}, ` +
        `pending: ${pendingStats.total} (${pendingStats.paper} paper, ${pendingStats.onChain} on-chain, ${pendingStats.cryptoAuto} crypto)`
      );
    }

    return {
      status: 'success',
      duration,
      closed: closeResult.closed,
      purged,
      resolved: resolveResult.resolved,
      skipped: resolveResult.skipped,
      errors: closeResult.errors + resolveResult.errors,
      pending: pendingStats,
    };
  } catch (err) {
    console.error('[MarketStatus] Cycle failed:', err.message);
    return { status: 'error', error: err.message };
  }
};

// ── Cron Scheduler ─────────────────────────────────────────────────────────

let cronInterval = null;

const startMarketStatusCron = () => {
  if (!ENABLED) {
    console.log('[MarketStatus] Service disabled (MARKET_STATUS_SERVICE_ENABLED=false)');
    return;
  }

  // Run immediately on startup
  runMarketStatusCycle().catch(err =>
    console.error('[MarketStatus] Initial run failed:', err.message)
  );

  // Schedule recurring runs
  cronInterval = setInterval(() => {
    runMarketStatusCycle().catch(err =>
      console.error('[MarketStatus] Cron run failed:', err.message)
    );
  }, CRON_INTERVAL_MS);

  console.log(`[MarketStatus] Cron scheduled every ${CRON_INTERVAL_MS / 1000}s (${CRON_INTERVAL_MS / 60000} min)`);
};

const stopMarketStatusCron = () => {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[MarketStatus] Cron stopped');
  }
};

// ── API Helpers ─────────────────────────────────────────────────────────────

/**
 * Get markets by status with pagination.
 * Used by frontend to filter: active, closed, pending, resolved.
 */
const getMarketsByStatus = async (statusFilter, options = {}) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'endDate',
    sortOrder = 'desc',
    categorySlug,
  } = options;

  const query = {};

  // Handle special status filters
  switch (statusFilter) {
    case 'pending':
      // Closed but not resolved (awaiting oracle/admin)
      query.status = 'closed';
      query.resolvedAt = null;
      break;
    case 'expired':
      // End date passed, regardless of status
      query.endDate = { $lte: new Date() };
      break;
    default:
      // Direct status filter: active, closed, resolved
      if (['active', 'closed', 'resolved'].includes(statusFilter)) {
        query.status = statusFilter;
      }
  }

  if (categorySlug) {
    query.categorySlug = categorySlug;
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [markets, total] = await Promise.all([
    Market.find(query).sort(sort).skip(skip).limit(limit).lean(),
    Market.countDocuments(query),
  ]);

  return {
    markets,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Cron management
  startMarketStatusCron,
  stopMarketStatusCron,
  runMarketStatusCycle,

  // Individual operations
  closeExpiredMarkets,
  resolveEligibleMarkets,
  getPendingResolutionStats,

  // API helpers
  getMarketsByStatus,
};
