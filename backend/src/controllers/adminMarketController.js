const Market = require('../models/Market');
const Category = require('../models/Category');
const Trade = require('../models/Trade');
const settlement = require('../services/settlementService');
const audit = require('../services/auditService');
const { uniqueSlug } = require('../utils/slug');
const { invalidateCache } = require('../middleware/cache');

const VALID_CATEGORIES = ['crypto', 'sports', 'weather', 'politics', 'finance', 'breaking'];

// GET /api/admin/markets
const list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && req.query.status !== 'any') filter.status = req.query.status;
    if (req.query.category) filter.categorySlug = req.query.category;
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: escaped, $options: 'i' };
    }

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, volume: { volume: -1 }, endDate: { endDate: 1 } };
    const sort = sortMap[req.query.sort] || { createdAt: -1 };

    const [markets, total] = await Promise.all([
      Market.find(filter).sort(sort).skip(skip).limit(limit).populate('category', 'name slug').populate('createdBy', 'email username').lean(),
      Market.countDocuments(filter),
    ]);

    const marketIds = markets.map((m) => m._id);
    const tradeCounts = await Trade.aggregate([
      { $match: { market: { $in: marketIds } } },
      { $group: { _id: '$market', count: { $sum: 1 } } },
    ]);
    const tradeCountMap = {};
    tradeCounts.forEach((t) => { tradeCountMap[t._id.toString()] = t.count; });

    const marketsWithCounts = markets.map((m) => ({ ...m, tradeCount: tradeCountMap[m._id.toString()] || 0 }));

    res.json({ success: true, markets: marketsWithCounts, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
};

// GET /api/admin/markets/:id
const getOne = async (req, res, next) => {
  try {
    const market = await Market.findById(req.params.id).populate('category', 'name slug').populate('createdBy', 'email username').populate('resolvedBy', 'email username');
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const [tradeStats, topTraders] = await Promise.all([
      Trade.aggregate([
        { $match: { market: market._id } },
        {
          $group: {
            _id: null,
            tradeCount: { $sum: 1 },
            uniqueTraders: { $addToSet: '$user' },
            totalVolume: { $sum: '$amount' },
            yesShares: { $sum: { $cond: [{ $regexMatch: { input: '$outcome', regex: /^yes$/i } }, '$shares', 0] } },
            noShares: { $sum: { $cond: [{ $regexMatch: { input: '$outcome', regex: /^no$/i } }, '$shares', 0] } },
          },
        },
      ]),
      Trade.aggregate([
        { $match: { market: market._id } },
        { $group: { _id: '$user', volume: { $sum: '$amount' }, shares: { $sum: '$shares' } } },
        { $sort: { volume: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { 'user.email': 1, 'user.username': 1, 'user.walletAddress': 1, volume: 1, shares: 1 } },
      ]),
    ]);

    const stats = tradeStats[0] || { tradeCount: 0, uniqueTraders: [], totalVolume: 0, yesShares: 0, noShares: 0 };
    stats.uniqueTraders = stats.uniqueTraders ? stats.uniqueTraders.length : 0;

    res.json({ success: true, market, stats, topTraders });
  } catch (e) { next(e); }
};

// POST /api/admin/markets
const create = async (req, res, next) => {
  try {
    const { title, description, categorySlug, image, endDate, closeDate, rules, sourceOfTruth, tags, featured, outcomes, createOnChain, useNegRisk } = req.body;

    // Validation
    if (!title || title.trim().length < 5 || title.trim().length > 200)
      return res.status(400).json({ success: false, error: 'Title must be 5-200 characters' });
    if (description && description.length > 2000)
      return res.status(400).json({ success: false, error: 'Description must be under 2000 characters' });
    if (!categorySlug || !VALID_CATEGORIES.includes(categorySlug))
      return res.status(400).json({ success: false, error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    if (!endDate || new Date(endDate) <= new Date())
      return res.status(400).json({ success: false, error: 'End date must be in the future' });
    if (closeDate && new Date(closeDate) > new Date(endDate))
      return res.status(400).json({ success: false, error: 'Close date must be on or before end date' });
    if (!rules || rules.trim().length === 0)
      return res.status(400).json({ success: false, error: 'Rules are required' });
    if (rules.length > 5000)
      return res.status(400).json({ success: false, error: 'Rules must be under 5000 characters' });
    if (!sourceOfTruth || sourceOfTruth.trim().length < 5 || sourceOfTruth.trim().length > 500)
      return res.status(400).json({ success: false, error: 'Source of truth must be 5-500 characters' });
    if (tags && tags.length > 10)
      return res.status(400).json({ success: false, error: 'Maximum 10 tags allowed' });

    const category = await Category.findOne({ slug: categorySlug });
    if (!category) return res.status(400).json({ success: false, error: `Category not found: ${categorySlug}` });

    const slug = await uniqueSlug(title.trim());
    const marketOutcomes = outcomes && outcomes.length >= 2 ? outcomes : [
      { name: 'Yes', probability: 50, price: 50 },
      { name: 'No', probability: 50, price: 50 },
    ];

    // Determine initial status: draft if createOnChain requested, active otherwise
    const initialStatus = createOnChain ? 'draft' : 'active';

    let market = await Market.create({
      title: title.trim(),
      description: description || '',
      category: category._id,
      categorySlug,
      slug,
      image: image || '📊',
      endDate: new Date(endDate),
      closeDate: closeDate ? new Date(closeDate) : new Date(endDate),
      rules: rules.trim(),
      sourceOfTruth: sourceOfTruth.trim(),
      tags: tags || [],
      featured: featured || false,
      outcomes: marketOutcomes,
      status: initialStatus,
      negRisk: useNegRisk || false,
      createdBy: req.user._id,
    });

    // ── Optional: Create on-chain market ─────────────────────────────────
    let onChainResult = null;
    let onChainError = null;

    if (createOnChain) {
      const onchainService = require('../services/onchainService');
      if (onchainService.ONCHAIN_ENABLED) {
        try {
          // Build ancillaryData from market info
          const ancillaryData = `q:${title.trim()} res_data:p1:0,p2:1 category:${categorySlug}`;
          const collateralAddress = process.env.MOCK_USDC_ADDRESS;

          onChainResult = await onchainService.createMarketOnChain({
            ancillaryData,
            rewardToken: collateralAddress,
            reward: '0',
            proposalBond: (100 * 1e6).toString(), // 100 USDC
            liveness: 7200, // 2 hours
            useNegRisk: useNegRisk || false,
          });

          // Update market with on-chain data
          market = await Market.findByIdAndUpdate(
            market._id,
            {
              conditionId: onChainResult.conditionId,
              questionId: onChainResult.questionId,
              token0: onChainResult.token0,
              token1: onChainResult.token1,
              onChainTxHash: onChainResult.txHash,
              onChain: true,
              status: 'active',
            },
            { new: true }
          );
        } catch (err) {
          onChainError = err.message;
          console.error('[Admin] On-chain market creation failed:', err.message);
          // Market stays as 'draft' — admin can retry later
        }
      } else {
        onChainError = 'ONCHAIN_ENABLED is false';
      }
    }

    await audit.log({ admin: req.user._id, action: 'market_create', targetType: 'market', targetId: market._id, details: { title: market.title, categorySlug, onChain: market.onChain }, ipAddress: req.ip });

    invalidateCache('/api/markets');
    invalidateCache('/api/categories');

    const response = { success: true, market };
    if (onChainError) {
      response.warning = `On-chain creation failed: ${onChainError}`;
      response.market = market.toObject(); // Ensure we return the updated market
    }

    res.status(201).json(response);
  } catch (e) { next(e); }
};

// PATCH /api/admin/markets/:id
const update = async (req, res, next) => {
  try {
    const market = await Market.findById(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    if (market.status === 'resolved') return res.status(400).json({ success: false, error: 'Cannot edit resolved market' });

    const tradeCount = await Trade.countDocuments({ market: market._id });
    const isLocked = tradeCount > 0;

    const alwaysEditable = ['rules', 'sourceOfTruth', 'image', 'tags', 'featured', 'description'];
    const fullEditable = [...alwaysEditable, 'title', 'endDate', 'closeDate', 'outcomes'];
    const allowedFields = isLocked ? alwaysEditable : fullEditable;

    const updates = {};
    const changedFields = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        changedFields.push(field);
      }
    }

    if (changedFields.length === 0) return res.status(400).json({ success: false, error: 'No editable fields provided' });

    Object.assign(market, updates);
    await market.save();

    await audit.log({ admin: req.user._id, action: 'market_edit', targetType: 'market', targetId: market._id, details: { changedFields }, ipAddress: req.ip });

    invalidateCache('/api/markets');
    invalidateCache('/api/categories');

    res.json({ success: true, market });
  } catch (e) { next(e); }
};

// POST /api/admin/markets/:id/close
const close = async (req, res, next) => {
  try {
    const market = await Market.findById(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    if (market.status !== 'active') return res.status(400).json({ success: false, error: `Cannot close market with status: ${market.status}` });

    market.status = 'closed';
    await market.save();

    await audit.log({ admin: req.user._id, action: 'market_close', targetType: 'market', targetId: market._id, details: { title: market.title }, ipAddress: req.ip });

    invalidateCache('/api/markets');
    invalidateCache('/api/categories');

    res.json({ success: true, market });
  } catch (e) { next(e); }
};

// POST /api/admin/markets/:id/reopen
const reopen = async (req, res, next) => {
  try {
    const market = await Market.findById(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    if (market.status !== 'closed') return res.status(400).json({ success: false, error: `Cannot reopen market with status: ${market.status}` });

    market.status = 'active';
    await market.save();

    await audit.log({ admin: req.user._id, action: 'market_reopen', targetType: 'market', targetId: market._id, details: { title: market.title }, ipAddress: req.ip });

    invalidateCache('/api/markets');
    invalidateCache('/api/categories');

    res.json({ success: true, market });
  } catch (e) { next(e); }
};

// POST /api/admin/markets/:id/resolve
const resolve = async (req, res, next) => {
  try {
    const { outcome } = req.body;
    if (!['yes', 'no', 'cancelled'].includes(outcome)) {
      return res.status(400).json({ success: false, error: 'Outcome must be yes, no, or cancelled' });
    }

    // Atomically flip market.status to 'resolved' BEFORE running settlement.
    // This closes the race window in which a trade could be created between
    // settleMarketTrades() scanning open trades and the market being marked
    // resolved — which would otherwise leave the trade stranded as 'open'.
    // placeTrade rejects on `market.status !== 'active'`, so once this flip
    // commits, no new trades can be placed against this market.
    const market = await Market.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: 'resolved' } },
      {
        status: 'resolved',
        resolvedOutcome: outcome,
        resolution: outcome === 'yes' ? 'Yes' : outcome === 'no' ? 'No' : 'Cancelled',
        resolvedBy: req.user._id,
        resolvedAt: new Date(),
      },
      { new: true }
    );
    if (!market) {
      // Either not found, or already resolved
      const exists = await Market.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ success: false, error: 'Market not found' });
      return res.status(400).json({ success: false, error: 'Market already resolved' });
    }

    const settledCount = await settlement.settleMarketTrades(market, outcome);

    // ── On-chain markets: cancel all open CLOB orders and log resolution ──
    let onChainNote = null;
    if (market.onChain && market.conditionId) {
      try {
        const Order = require('../models/Order');
        const cancelResult = await Order.updateMany(
          { conditionId: market.conditionId, status: { $in: ['open', 'partially_filled'] } },
          { status: 'cancelled' }
        );
        onChainNote = `Cancelled ${cancelResult.modifiedCount} open CLOB orders. Users may now redeem via /api/onchain/positions/${market.conditionId}/redeem`;
        console.log(`[Admin] On-chain market resolved: conditionId=${market.conditionId} outcome=${outcome} ${onChainNote}`);
      } catch (err) {
        console.error('[Admin] Failed to cancel CLOB orders on resolve:', err.message);
        onChainNote = `Warning: CLOB order cleanup failed: ${err.message}`;
      }
    }

    await audit.log({ admin: req.user._id, action: 'market_resolve', targetType: 'market', targetId: market._id, details: { outcome, settledCount, title: market.title, onChainNote }, ipAddress: req.ip });

    invalidateCache('/api/markets');
    invalidateCache('/api/categories');

    res.json({ success: true, market, settledTrades: settledCount, onChainNote });
  } catch (e) { next(e); }
};

// DELETE /api/admin/markets/:id
const remove = async (req, res, next) => {
  try {
    const market = await Market.findById(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const tradeCount = await Trade.countDocuments({ market: market._id });
    if (tradeCount > 0) return res.status(400).json({ success: false, error: 'Cannot delete market with existing trades' });
    // Allow deletion if no trades (even if on-chain) - for test cleanup

    await Market.deleteOne({ _id: market._id });

    await audit.log({ admin: req.user._id, action: 'market_delete', targetType: 'market', targetId: market._id, details: { title: market.title }, ipAddress: req.ip });

    invalidateCache('/api/markets');
    invalidateCache('/api/categories');

    res.json({ success: true });
  } catch (e) { next(e) }
};

module.exports = { list, getOne, create, update, close, reopen, resolve, remove };
