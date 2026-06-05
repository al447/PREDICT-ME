const mongoose = require('mongoose');
const Trade = require('../models/Trade');
const Market = require('../models/Market');
const User = require('../models/User');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');

// ── Recompute outcome prices using Laplace-smoothed ratio ──
const recomputePrices = async (marketId) => {
  const agg = await Trade.aggregate([
    { $match: { market: new mongoose.Types.ObjectId(marketId), status: 'open', type: 'buy' } },
    { $group: { _id: { $toLower: '$outcome' }, totalAmount: { $sum: '$amount' } } },
  ]);
  const yesVol = agg.find((a) => a._id === 'yes')?.totalAmount || 0;
  const noVol = agg.find((a) => a._id === 'no')?.totalAmount || 0;
  let yesPrice = Math.round(100 * (yesVol + 1) / (yesVol + noVol + 2));
  yesPrice = Math.max(1, Math.min(99, yesPrice));
  const noPrice = 100 - yesPrice;
  return { yesPrice, noPrice };
};

const placeTrade = async (req, res, next) => {
  try {
    const { marketId, outcome, amount, idempotencyKey } = req.body;
    const userId = req.user._id;
    const parsedAmount = parseFloat(amount);

    if (!marketId || !outcome || !parsedAmount || parsedAmount < 1 || parsedAmount > 100000) {
      return res.status(400).json({ success: false, error: 'Invalid trade parameters' });
    }

    // Idempotency: if this key was already used, return the existing trade immediately
    if (idempotencyKey) {
      const existing = await Trade.findOne({ idempotencyKey }).populate('market', 'title slug categorySlug outcomes');
      if (existing) {
        const existingUser = await User.findById(userId).select('balance');
        return res.status(200).json({
          success: true,
          trade: existing,
          newBalance: existingUser?.balance,
          market: existing.market,
          idempotent: true,
        });
      }
    }

    const normalizedOutcome = outcome.charAt(0).toUpperCase() + outcome.slice(1).toLowerCase();

    const market = await Market.findById(marketId);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    if (market.status !== 'active') return res.status(400).json({ success: false, error: 'Market is not active for trading' });

    const now = new Date();
    if (market.closeDate && new Date(market.closeDate) < now) {
      return res.status(400).json({ success: false, error: 'Market trading has closed' });
    }
    if (market.endDate && new Date(market.endDate) < now) {
      return res.status(400).json({ success: false, error: 'Market has ended' });
    }

    const outcomeObj = market.outcomes.find((o) => o.name.toLowerCase() === normalizedOutcome.toLowerCase());
    if (!outcomeObj) return res.status(400).json({ success: false, error: 'Invalid outcome. Must be Yes or No.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.balance < parsedAmount) {
      return res.status(400).json({ success: false, error: `Insufficient balance. You have $${user.balance.toFixed(2)}` });
    }

    const price = outcomeObj.price / 100;
    const shares = price > 0 ? parsedAmount / price : 0;

    // Atomic balance deduction — recheck inside findOneAndUpdate
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: parsedAmount } },
      { $inc: { balance: -parsedAmount } },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(400).json({ success: false, error: 'Insufficient balance (concurrent check)' });
    }

    const trade = await Trade.create({
      user: userId,
      market: marketId,
      outcome: normalizedOutcome,
      amount: parsedAmount,
      price: outcomeObj.price,
      shares,
      type: 'buy',
      status: 'open',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    // Atomic volume + tradeCount increment (no read-modify-write race)
    await Market.findByIdAndUpdate(marketId, {
      $inc: { volume: parsedAmount, tradeCount: 1 },
    });

    // Recompute prices from aggregated trade data, then apply atomically
    const { yesPrice, noPrice } = await recomputePrices(marketId);
    const updatedMarket = await Market.findByIdAndUpdate(
      marketId,
      {
        $set: {
          'outcomes.$[yes].price': yesPrice,
          'outcomes.$[yes].probability': yesPrice,
          'outcomes.$[no].price': noPrice,
          'outcomes.$[no].probability': noPrice,
        },
      },
      {
        arrayFilters: [
          { 'yes.name': { $regex: /^yes$/i } },
          { 'no.name': { $regex: /^no$/i } },
        ],
        new: true,
      }
    );

    // Snapshot current market prices for transparent chart history
    try {
      for (const o of updatedMarket.outcomes) {
        await MarketPriceSnapshot.create({
          market: updatedMarket._id,
          outcome: o.name,
          price: o.price,
          probability: o.probability,
          volume: updatedMarket.volume,
          liquidity: updatedMarket.liquidity || 0,
          source: 'trade',
        });
      }
    } catch (snapErr) {
      console.error('[Trade] Failed to create price snapshot:', snapErr.message);
    }

    await trade.populate('market', 'title slug categorySlug outcomes');

    res.status(201).json({
      success: true,
      trade,
      newBalance: updatedUser.balance,
      market: { _id: updatedMarket._id, outcomes: updatedMarket.outcomes, volume: updatedMarket.volume, tradeCount: updatedMarket.tradeCount },
    });

    // Fire-and-forget: record trade for referral commission/qualification
    console.log(`[Trade] Triggering referral check for user ${userId}, amount ${parsedAmount}`);
    const { recordTradeForReferral } = require('../services/referralService');
    recordTradeForReferral({
      refereeUserId: userId,
      tradeId: trade._id,
      tradeAmount: parsedAmount,
    }).then(result => {
      console.log(`[Trade] Referral result:`, result);
    }).catch(err => console.error('[Trade] Referral trade hook failed:', err.message));
  } catch (error) {
    next(error);
  }
};

const getMyTrades = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = { user: req.user._id };
    if (status && status !== 'all') query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Trade.countDocuments(query);
    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('market', 'title slug categorySlug outcomes image');

    res.json({
      success: true,
      trades,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

const getPositions = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const positions = await Trade.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'open', type: 'buy' } },
      {
        $group: {
          _id: { market: '$market', outcome: '$outcome' },
          totalAmount: { $sum: '$amount' },
          totalShares: { $sum: '$shares' },
          avgPrice: { $avg: '$price' },
          firstBuy: { $min: '$createdAt' },
          lastBuy: { $max: '$createdAt' },
          tradeCount: { $sum: 1 },
        },
      },
      { $lookup: { from: 'markets', localField: '_id.market', foreignField: '_id', as: 'market' } },
      { $unwind: '$market' },
      { $sort: { lastBuy: -1 } },
    ]);

    const result = positions.map((p) => {
      const currentOutcome = p.market.outcomes?.find((o) => o.name.toLowerCase() === p._id.outcome.toLowerCase());
      const currentPrice = currentOutcome ? currentOutcome.price : 50;
      const currentValue = p.totalShares * (currentPrice / 100);
      const pnl = currentValue - p.totalAmount;
      return {
        market: {
          _id: p.market._id,
          title: p.market.title,
          slug: p.market.slug,
          categorySlug: p.market.categorySlug,
          image: p.market.image,
          status: p.market.status,
          outcomes: p.market.outcomes,
        },
        outcome: p._id.outcome,
        totalAmount: p.totalAmount,
        totalShares: p.totalShares,
        avgPrice: Math.round(p.avgPrice * 100) / 100,
        currentPrice,
        currentValue: Math.round(currentValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        tradeCount: p.tradeCount,
        firstBuy: p.firstBuy,
        lastBuy: p.lastBuy,
      };
    });

    res.json({ success: true, positions: result });
  } catch (error) {
    next(error);
  }
};

// GET /api/trades/leaderboard - Public leaderboard
const getLeaderboard = async (req, res, next) => {
  try {
    const { period = 'all', sort = 'profit', limit = 50 } = req.query;
    
    // Calculate date filter based on period
    const now = new Date();
    let dateFilter = {};
    if (period === 'today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFilter = { createdAt: { $gte: startOfToday } };
    } else if (period === 'weekly') {
      const startOfWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
      dateFilter = { createdAt: { $gte: startOfWeek } };
    } else if (period === 'monthly') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { createdAt: { $gte: startOfMonth } };
    }

    // Aggregate trades by user
    const pipeline = [
      { $match: { ...dateFilter, status: { $in: ['open', 'closed', 'won', 'lost'] } } },
      {
        $group: {
          _id: '$user',
          totalVolume: { $sum: '$amount' },
          tradeCount: { $sum: 1 },
          marketsTraded: { $addToSet: '$market' },
          wonCount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          lostCount: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          wonAmount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, { $ifNull: ['$payout', 0] }, 0] } },
          investedAmount: { $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$amount', 0] } },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: { $ifNull: ['$user.username', { $concat: [{ $substr: ['$user.walletAddress', 0, 6] }, '...', { $substr: ['$user.walletAddress', -4, 4] }] }] },
          address: '$user.walletAddress',
          avatar: '$user.avatar',
          profit: { $subtract: ['$wonAmount', '$investedAmount'] },
          volume: '$totalVolume',
          trades: '$tradeCount',
          markets: { $size: '$marketsTraded' },
          winRate: {
            $cond: [
              { $gt: [{ $add: ['$wonCount', '$lostCount'] }, 0] },
              { $multiply: [{ $divide: ['$wonCount', { $add: ['$wonCount', '$lostCount'] }] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: sort === 'volume' ? { volume: -1 } : { profit: -1 } },
      { $limit: parseInt(limit) },
    ];

    const leaderboard = await Trade.aggregate(pipeline);

    // Add rank to each trader
    const result = leaderboard.map((trader, index) => ({
      ...trader,
      rank: index + 1,
    }));

    res.json({ success: true, leaderboard: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { placeTrade, getMyTrades, getPositions, getLeaderboard };
