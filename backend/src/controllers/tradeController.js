const mongoose = require('mongoose');
const Trade = require('../models/Trade');
const Market = require('../models/Market');
const User = require('../models/User');
const MarketPriceSnapshot = require('../models/MarketPriceSnapshot');
const walletService = require('../services/walletService');
const balanceSyncService = require('../services/balanceSyncService');

// ── Recompute binary outcome prices using Laplace-smoothed ratio ──
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

// ── Recompute candidate probabilities for grouped markets ──────────────────
// Uses the ratio of YES-vote amounts across all candidates (normalised to 100%).
const recomputeGroupedCandidatePrices = async (marketId) => {
  const agg = await Trade.aggregate([
    { $match: { market: new mongoose.Types.ObjectId(marketId), status: 'open', type: 'buy', outcome: 'Yes' } },
    { $group: { _id: '$candidate', totalAmount: { $sum: '$amount' } } },
  ]);
  const totalYesAmount = agg.reduce((s, a) => s + a.totalAmount, 0);
  const priceMap = {};
  for (const a of agg) {
    if (!a._id) continue;
    let p = totalYesAmount > 0 ? Math.round(100 * a.totalAmount / totalYesAmount) : 1;
    p = Math.max(1, Math.min(99, p));
    priceMap[a._id] = p;
  }
  return priceMap; // { candidateName: probability }
};

const placeTrade = async (req, res, next) => {
  try {
    const { marketId, outcome, candidate, amount, idempotencyKey } = req.body;
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

    const isGrouped = market.marketType === 'grouped';

    let normalizedOutcome;
    let outcomePrice;
    let normalizedCandidate = null;

    if (isGrouped) {
      // For grouped markets: outcome must be 'Yes' or 'No', candidate is required
      normalizedOutcome = outcome.charAt(0).toUpperCase() + outcome.slice(1).toLowerCase();
      if (!['Yes', 'No'].includes(normalizedOutcome)) {
        return res.status(400).json({ success: false, error: 'Outcome must be Yes or No for grouped markets' });
      }
      if (!candidate) {
        return res.status(400).json({ success: false, error: 'Candidate is required for grouped markets' });
      }
      normalizedCandidate = candidate.trim();
      const candidateObj = market.candidates.find(c => c.name.toLowerCase() === normalizedCandidate.toLowerCase());
      if (!candidateObj) {
        return res.status(400).json({ success: false, error: `Candidate "${normalizedCandidate}" not found in this market` });
      }
      // Price: YES = candidate's current probability, NO = 100 - that
      outcomePrice = normalizedOutcome === 'Yes' ? candidateObj.probability : (100 - candidateObj.probability);
    } else {
      normalizedOutcome = outcome.charAt(0).toUpperCase() + outcome.slice(1).toLowerCase();
      const outcomeObj = market.outcomes.find((o) => o.name.toLowerCase() === normalizedOutcome.toLowerCase());
      if (!outcomeObj) return res.status(400).json({ success: false, error: 'Invalid outcome. Must be Yes or No.' });
      outcomePrice = outcomeObj.price;
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.balance < parsedAmount) {
      return res.status(400).json({ success: false, error: `Insufficient balance. You have $${user.balance.toFixed(2)}` });
    }

    const price = outcomePrice / 100;
    const shares = price > 0 ? parsedAmount / price : 0;

    let updatedUser;
    if (process.env.ONCHAIN_ENABLED === 'true') {
      // On-chain mode: balance is a cached mirror from chain — do NOT debit here.
      // The on-chain CLOB deducts from the proxy wallet; balanceSyncService will
      // update User.balance after settlement. Just verify cached balance is sufficient.
      updatedUser = user;
    } else {
      // Legacy paper-trading: atomic balance deduction
      updatedUser = await User.findOneAndUpdate(
        { _id: userId, balance: { $gte: parsedAmount } },
        { $inc: { balance: -parsedAmount } },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(400).json({ success: false, error: 'Insufficient balance (concurrent check)' });
      }
    }

    // Lazy proxy deployment on first trade — fire-and-forget (non-blocking).
    if (process.env.NONCUSTODIAL_ENABLED === 'true') {
      walletService.ensureSmartWalletDeployed(updatedUser).catch((err) => {
        console.warn(`[Trade] Proxy deployment failed for user ${userId}:`, err.message);
      });
    }

    const trade = await Trade.create({
      user: userId,
      market: marketId,
      outcome: normalizedOutcome,
      candidate: normalizedCandidate,
      amount: parsedAmount,
      price: outcomePrice,
      shares,
      type: 'buy',
      status: 'open',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    // Atomic volume + tradeCount increment (no read-modify-write race)
    await Market.findByIdAndUpdate(marketId, {
      $inc: { volume: parsedAmount, tradeCount: 1 },
    });

    let updatedMarket = market;

    // Determine if this is an on-chain binary market (CLOB owns the price)
    const isOnChainBinary = !isGrouped &&
      process.env.ONCHAIN_ENABLED === 'true' &&
      market.onChain === true &&
      market.token0 &&
      market.token1;

    if (isOnChainBinary) {
      // CLOB owns the price via clobPriceService.syncMarketPrice — skip legacy AMM recompute
      // Just fetch the market with current CLOB-derived prices for the snapshot
      updatedMarket = await Market.findById(marketId);
    } else if (isGrouped) {
      // Recompute candidate probabilities and apply to candidates array
      // (Legacy path until Phase 2 grouped/NegRisk migration)
      const priceMap = await recomputeGroupedCandidatePrices(marketId);
      const candidateUpdates = {};
      market.candidates.forEach((c, idx) => {
        const newProb = priceMap[c.name] ?? c.probability;
        candidateUpdates[`candidates.${idx}.probability`] = newProb;
      });
      updatedMarket = await Market.findByIdAndUpdate(
        marketId,
        { $set: candidateUpdates },
        { new: true }
      );
    } else {
      // Recompute binary prices (legacy off-chain paper trading)
      const { yesPrice, noPrice } = await recomputePrices(marketId);
      updatedMarket = await Market.findByIdAndUpdate(
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
    }

    // Snapshot current market prices for transparent chart history
    try {
      for (const o of (updatedMarket?.outcomes || [])) {
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

    await trade.populate('market', 'title slug categorySlug outcomes candidates');

    // Post-trade balance sync from chain (async, non-blocking)
    if (process.env.ONCHAIN_ENABLED === 'true') {
      balanceSyncService.syncUser(updatedUser).catch(err =>
        console.warn('[Trade] Post-trade balance sync failed:', err.message)
      );
    }

    res.status(201).json({
      success: true,
      trade,
      newBalance: updatedUser.balance,
      market: { _id: updatedMarket._id, outcomes: updatedMarket.outcomes, candidates: updatedMarket.candidates, volume: updatedMarket.volume, tradeCount: updatedMarket.tradeCount },
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

    // Aggregate all open trades (both buy and sell).
    // For CLOB: sells are stored with negative shares, so summing nets the position.
    const positions = await Trade.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: 'open' } },
      {
        $group: {
          _id: { market: '$market', outcome: '$outcome', candidate: { $ifNull: ['$candidate', null] } },
          totalAmount: { $sum: '$amount' },
          totalShares: { $sum: '$shares' }, // Net shares: buys (+) + sells (-)
          avgPrice: { $avg: '$price' },
          firstBuy: { $min: '$createdAt' },
          lastBuy: { $max: '$createdAt' },
          tradeCount: { $sum: 1 },
        },
      },
      // Filter out zero-share positions (fully closed/sold out)
      { $match: { totalShares: { $gt: 0 } } },
      { $lookup: { from: 'markets', localField: '_id.market', foreignField: '_id', as: 'market' } },
      { $unwind: '$market' },
      { $sort: { lastBuy: -1 } },
    ]);

    const result = positions.map((p) => {
      const isGrouped = p.market.marketType === 'grouped';
      let currentPrice = 50;
      if (isGrouped && p._id.candidate) {
        const c = (p.market.candidates || []).find(c => c.name.toLowerCase() === p._id.candidate.toLowerCase());
        const candidateProb = c ? c.probability : 50;
        currentPrice = p._id.outcome === 'Yes' ? candidateProb : (100 - candidateProb);
      } else {
        const currentOutcome = p.market.outcomes?.find((o) => o.name.toLowerCase() === p._id.outcome.toLowerCase());
        currentPrice = currentOutcome ? currentOutcome.price : 50;
      }
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
          marketType: p.market.marketType,
        },
        outcome: p._id.outcome,
        candidate: p._id.candidate || null,
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

// GET /api/trades/activity - Public global activity feed
const getActivity = async (req, res, next) => {
  try {
    const { limit = 50, page = 1, outcome, marketSlug } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const matchStage = {};
    if (outcome) matchStage.outcome = { $regex: new RegExp(`^${outcome}$`, 'i') };

    const trades = await Trade.find(matchStage)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('market', 'title slug categorySlug image outcomes')
      .populate('user', 'username walletAddress avatar')
      .lean();

    // Filter by marketSlug after populate if provided
    const filtered = marketSlug
      ? trades.filter(t => t.market?.slug === marketSlug)
      : trades;

    const result = filtered.map(t => ({
      _id: t._id,
      type: t.type,
      outcome: t.outcome,
      amount: t.amount,
      shares: t.shares,
      price: t.price,
      status: t.status,
      createdAt: t.createdAt,
      market: t.market
        ? { title: t.market.title, slug: t.market.slug, categorySlug: t.market.categorySlug, image: t.market.image }
        : null,
      user: t.user
        ? {
            username: t.user.username,
            avatar: t.user.avatar,
            address: t.user.walletAddress
              ? `${t.user.walletAddress.slice(0, 6)}…${t.user.walletAddress.slice(-4)}`
              : null,
          }
        : null,
    }));

    const total = await Trade.countDocuments(matchStage);
    res.json({ success: true, trades: result, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    next(error);
  }
};

module.exports = { placeTrade, getMyTrades, getPositions, getLeaderboard, getActivity };
