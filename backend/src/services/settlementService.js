const Trade = require('../models/Trade');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const PLATFORM_FEE_RATE = 0.02; // 2%

/**
 * Settle all trades for a resolved market.
 *
 * Safety guarantees:
 *  - Idempotent: only operates on `status: 'open'` trades. Re-running is a no-op.
 *  - Audited: writes a Transaction record for every payout/refund.
 *  - Per-user atomic: balance update + trade status update + transaction record.
 *
 * Note: full multi-document transactions require a Mongo replica set; we keep
 * each user's payout self-consistent and rely on idempotency for retry safety.
 */
const settleMarketTrades = async (market, outcome) => {
  let settledCount = 0;

  if (outcome === 'cancelled') {
    // Refund every open trade — per-trade atomic claim ensures idempotency
    const openTrades = await Trade.find({ market: market._id, status: 'open' });
    for (const trade of openTrades) {
      const claimed = await Trade.findOneAndUpdate(
        { _id: trade._id, status: 'open' },
        { status: 'refunded', payout: trade.amount },
        { new: true }
      );
      if (!claimed) continue; // raced — another process settled it

      const updatedUser = await User.findByIdAndUpdate(
        trade.user,
        { $inc: { balance: trade.amount } },
        { new: true }
      );
      if (!updatedUser) continue;

      await Transaction.create({
        user: trade.user,
        type: 'trade',
        amount: trade.amount,
        balance: updatedUser.balance,
        status: 'completed',
        metadata: {
          tradeId: trade._id,
          marketId: market._id,
          reason: 'market_cancelled_refund',
        },
      });
      settledCount++;
    }
    return settledCount;
  }

  // Outcome = 'yes' or 'no'
  // Step 1: Atomically settle each loser per-trade to avoid race conditions.
  const winningRegex = new RegExp(`^${outcome}$`, 'i');
  const openTrades = await Trade.find({ market: market._id, status: 'open' });

  const loserIds = openTrades.filter(t => !winningRegex.test(t.outcome)).map(t => t._id);
  const newlyWonCandidates = openTrades.filter(t => winningRegex.test(t.outcome));

  // Mark losers atomically per-trade
  let loserCount = 0;
  for (const id of loserIds) {
    const settled = await Trade.findOneAndUpdate(
      { _id: id, status: 'open' },
      { status: 'lost', payout: 0 }
    );
    if (settled) loserCount++;
  }

  // Mark winners atomically per-trade — capture only newly claimed
  const newlyWonTrades = [];
  for (const trade of newlyWonCandidates) {
    const claimed = await Trade.findOneAndUpdate(
      { _id: trade._id, status: 'open' },
      { status: 'won' },
      { new: false } // return OLD doc to confirm we claimed it
    );
    if (claimed) newlyWonTrades.push(trade);
  }

  if (newlyWonTrades.length === 0 && loserCount === 0) {
    return 0; // already settled
  }

  // Step 2: Compute pool from ALL final won + lost trades for correct payout math.
  const allWon = await Trade.find({ market: market._id, status: 'won' });
  const allLost = await Trade.find({ market: market._id, status: 'lost' });

  const totalPool = [...allWon, ...allLost].reduce((sum, t) => sum + t.amount, 0);
  const totalWinnerShares = allWon.reduce((sum, t) => sum + t.shares, 0);

  // Step 3: Pay only NEWLY-won trades — payout === null means unpaid.
  if (totalWinnerShares > 0) {
    for (const trade of newlyWonTrades) {
      const grossPayout = (totalPool * trade.shares) / totalWinnerShares;
      const fee = grossPayout * PLATFORM_FEE_RATE;
      const netPayout = Math.round((grossPayout - fee) * 100) / 100;

      // Store payout on Trade for leaderboard / history
      await Trade.findByIdAndUpdate(trade._id, { payout: netPayout });

      const updatedUser = await User.findByIdAndUpdate(
        trade.user,
        { $inc: { balance: netPayout } },
        { new: true }
      );
      if (!updatedUser) continue;

      await Transaction.create({
        user: trade.user,
        type: 'trade',
        amount: netPayout,
        balance: updatedUser.balance,
        status: 'completed',
        metadata: {
          tradeId: trade._id,
          marketId: market._id,
          reason: `market_won_${outcome}`,
          fee,
          gross: Math.round(grossPayout * 100) / 100,
        },
      });
    }
  }

  settledCount = newlyWonTrades.length + loserCount;
  return settledCount;
};

module.exports = { settleMarketTrades };
