/**
 * settlementService.js — Off-chain (paper) settlement of resolved markets.
 *
 * Pays winning PAPER trades by crediting User.balance, marks losers, and refunds
 * stakes for cancelled markets. This is the authoritative payout path for the
 * paper/demo model (grouped markets + off-chain binary).
 *
 * IMPORTANT — only PAPER trades are settled here.
 *   Paper trades are created via tradeController.placeTrade and have NO conditionId.
 *   On-chain CLOB trades (created in clobService) DO have a conditionId — their value
 *   lives on-chain as CTF tokens and must be redeemed on-chain, NOT credited here.
 *   So every query below filters `conditionId: null` to exclude on-chain positions.
 *
 * Payout model: each winning share redeems for $1, so payout = trade.shares.
 *   Refund (cancelled): stake returned, payout = trade.amount.
 *
 * Idempotency: only trades currently `status: 'open'` are processed, and each
 *   bulk update re-checks `status: 'open'`, so calling twice is a no-op.
 *
 * Balance crediting is additive ($inc), which survives balanceSyncService's
 *   delta-reconciliation (on-chain deltas are applied without erasing paper credits).
 */

const Trade = require('../models/Trade');
const User = require('../models/User');

// Paper trades only: conditionId is unset (null or missing) for placeTrade trades.
const PAPER_FILTER = { conditionId: null };

/**
 * Settle all open PAPER trades for a resolved market.
 *
 * @param {object} market - Market document/lean (needs _id, marketType, candidates)
 * @param {object} params
 * @param {'yes'|'no'|'cancelled'} params.outcome
 * @param {string} [params.winningCandidate] - winning candidate name (grouped markets)
 * @returns {Promise<{won:number, lost:number, refunded:number, totalPaid:number, settledTradeCount:number}>}
 */
async function settleMarket(market, { outcome, winningCandidate } = {}) {
  const marketId = market._id;
  const isGrouped = market.marketType === 'grouped';

  if (outcome === 'cancelled') {
    return refundAll(marketId);
  }

  // Only settle BUY trades — sells have already been cashed out and their
  // negative shares reduce position but shouldn't generate new payouts.
  const openTrades = await Trade.find({
    market: marketId, status: 'open', type: 'buy', shares: { $gt: 0 }, ...PAPER_FILTER
  }).lean();
  if (!openTrades.length) {
    // Still mark sell trades as settled
    await Trade.updateMany(
      { market: marketId, status: 'open', type: 'sell', ...PAPER_FILTER },
      { $set: { status: 'lost', payout: 0, settledAt: new Date() } }
    );
    return { won: 0, lost: 0, refunded: 0, totalPaid: 0, settledTradeCount: 0 };
  }

  const winningOutcome = outcome === 'yes' ? 'Yes' : 'No';

  const isWinner = (t) => {
    if (isGrouped) {
      if (!winningCandidate) return false;
      const candMatches = (t.candidate || '').toLowerCase() === winningCandidate.toLowerCase();
      return t.outcome === 'Yes' ? candMatches : !candMatches;
    }
    return t.outcome === winningOutcome;
  };

  // Net positions per user+outcome+candidate to handle partial sells correctly
  const positionKey = (t) => `${t.user}|${t.outcome}|${t.candidate || ''}`;
  const netShares = new Map();

  // Calculate net shares per position (buys add, sells subtract)
  const allTrades = await Trade.find({
    market: marketId, status: 'open', ...PAPER_FILTER
  }).lean();
  for (const t of allTrades) {
    const key = positionKey(t);
    netShares.set(key, (netShares.get(key) || 0) + (t.shares || 0));
  }

  const now = new Date();
  const bulk = [];
  const payoutByUser = new Map();
  let won = 0, lost = 0, totalPaid = 0;

  for (const t of openTrades) {
    if (isWinner(t)) {
      // Use net shares for this position to avoid overpaying when user partially sold
      const key = positionKey(t);
      const net = netShares.get(key) || 0;

      // Only pay based on proportional remaining net shares
      const proportion = net > 0 ? Math.min(1, net / t.shares) : 0;
      const payout = Math.max(0, t.shares * proportion);

      bulk.push({
        updateOne: {
          filter: { _id: t._id, status: 'open' },
          update: { $set: { status: 'won', payout, settledAt: now } },
        },
      });
      if (payout > 0) {
        payoutByUser.set(String(t.user), (payoutByUser.get(String(t.user)) || 0) + payout);
        totalPaid += payout;
      }
      // Deduct from net so we don't double-pay across multiple buy trades
      netShares.set(key, Math.max(0, net - t.shares));
      won++;
    } else {
      bulk.push({
        updateOne: {
          filter: { _id: t._id, status: 'open' },
          update: { $set: { status: 'lost', payout: 0, settledAt: now } },
        },
      });
      lost++;
    }
  }

  // Also mark sell trades as settled
  bulk.push({
    updateMany: {
      filter: { market: marketId, status: 'open', type: 'sell', ...PAPER_FILTER },
      update: { $set: { status: 'lost', payout: 0, settledAt: now } },
    },
  });

  if (bulk.length) await Trade.bulkWrite(bulk, { ordered: false });
  await creditUsers(payoutByUser);

  // Create Transaction audit records for settlement payouts
  const Transaction = require('../models/Transaction');
  for (const [userId, amount] of payoutByUser) {
    if (amount > 0) {
      await Transaction.create({
        user: userId,
        type: 'trade',
        amount,
        description: `Market settlement payout: ${market.title || marketId}`,
        status: 'completed',
      }).catch(err => console.warn('[Settlement] Transaction audit failed:', err.message));
    }
  }

  console.log(
    `[Settlement] Market ${marketId} settled — won: ${won}, lost: ${lost}, paid: $${totalPaid.toFixed(2)} to ${payoutByUser.size} user(s)`
  );

  return { won, lost, refunded: 0, totalPaid, settledTradeCount: won + lost };
}

/**
 * Refund stakes for all open PAPER trades (cancelled market).
 */
async function refundAll(marketId) {
  const openTrades = await Trade.find({ market: marketId, status: 'open', ...PAPER_FILTER }).lean();
  if (!openTrades.length) {
    return { won: 0, lost: 0, refunded: 0, totalPaid: 0, settledTradeCount: 0 };
  }

  const now = new Date();
  const bulk = [];
  const refundByUser = new Map();
  let refunded = 0, totalPaid = 0;

  for (const t of openTrades) {
    bulk.push({
      updateOne: {
        filter: { _id: t._id, status: 'open' },
        update: { $set: { status: 'refunded', payout: t.amount, settledAt: now } },
      },
    });
    refundByUser.set(String(t.user), (refundByUser.get(String(t.user)) || 0) + t.amount);
    refunded++;
    totalPaid += t.amount;
  }

  if (bulk.length) await Trade.bulkWrite(bulk, { ordered: false });
  await creditUsers(refundByUser);

  console.log(
    `[Settlement] Market ${marketId} cancelled — refunded ${refunded} trade(s), $${totalPaid.toFixed(2)} to ${refundByUser.size} user(s)`
  );

  return { won: 0, lost: 0, refunded, totalPaid, settledTradeCount: refunded };
}

/**
 * Credit a map of userId → amount via atomic $inc.
 */
async function creditUsers(amountByUser) {
  for (const [userId, amount] of amountByUser) {
    if (amount > 0) {
      await User.findByIdAndUpdate(userId, { $inc: { balance: amount } });
    }
  }
}

module.exports = { settleMarket };
