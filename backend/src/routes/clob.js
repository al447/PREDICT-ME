/**
 * CLOB (Central Limit Order Book) API Routes
 * REST API for orders + WebSocket upgrade for real-time order book
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const clobService = require('../services/clobService');
const Order = require('../models/Order');
const Fill = require('../models/Fill');
const Trade = require('../models/Trade');
const User = require('../models/User');
const { protect: authenticate } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

// Validation helper
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// Async handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/clob/orderbook/:conditionId/:tokenId
 * Get order book (bids and asks) for a market
 */
router.get(
  '/orderbook/:conditionId/:tokenId',
  param('conditionId').isString().notEmpty(),
  param('tokenId').isString().notEmpty(),
  query('depth').optional().isInt({ min: 1, max: 100 }),
  handleValidation,
  asyncHandler(async (req, res) => {
    const { conditionId, tokenId } = req.params;
    const depth = parseInt(req.query.depth) || 20;
    
    const orderBook = await clobService.getOrderBook(conditionId, tokenId, depth);
    
    res.json({
      success: true,
      conditionId,
      tokenId,
      ...orderBook,
    });
  })
);

/**
 * POST /api/clob/order
 * Submit a new limit order
 */
router.post(
  '/order',
  authenticate,
  [
    body('conditionId').isString().notEmpty(),
    body('tokenId').isString().notEmpty(),
    body('side').isIn([0, 1, 'buy', 'sell']),
    body('price').isFloat({ min: 0.01, max: 0.99 }),
    body('size').isFloat({ min: 1 }),
    body('expiration').isInt(), // Unix timestamp
    body('signature').isString().notEmpty(),
    body('nonce').isInt(),
    body('makerAmount').isString(), // Wei amount
    body('takerAmount').isString(), // Wei amount
    handleValidation,
  ],
  asyncHandler(async (req, res) => {
    // maker = user's Safe proxy if provisioned, else fall back to their EOA.
    // The request body may supply a specific maker override (from useClob.js).
    const eoa = req.user.walletAddress || req.user.address;
    const safeMaker = req.user.smartWallet?.proxy || null;
    const bodyMaker = req.body.maker;

    // Priority: body.maker → Safe proxy → EOA
    const maker = bodyMaker || safeMaker || eoa;
    const signer = req.body.signer || eoa;

    const orderData = {
      conditionId:   req.body.conditionId,
      tokenId:       req.body.tokenId,
      maker,
      signer,
      salt:          req.body.salt,
      side:          req.body.side === 'buy' || req.body.side === 0 ? 0 : 1,
      price:         req.body.price,
      makerAmount:   req.body.makerAmount,
      takerAmount:   req.body.takerAmount,
      expiration:    req.body.expiration,
      signature:     req.body.signature,
      signatureType: req.body.signatureType || 0,
      nonce:         req.body.nonce,
      orderType:     req.body.orderType || 'GTC',
    };

    const order = await clobService.createOrder(orderData);

    res.status(201).json({
      success: true,
      order,
      message: 'Order created and matching initiated',
    });
  })
);

/**
 * DELETE /api/clob/order/:orderId
 * Cancel an order
 */
router.delete(
  '/order/:orderId',
  authenticate,
  param('orderId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    // Accept cancellation from either the Safe proxy or the EOA signer
    const eoa       = req.user.walletAddress || req.user.address;
    const safeMaker = req.user.smartWallet?.proxy || null;

    const order = await clobService.cancelOrder(orderId, eoa, safeMaker);
    
    res.json({
      success: true,
      message: 'Order cancelled',
      order,
    });
  })
);

/**
 * GET /api/clob/orders
 * Get user's orders
 */
router.get(
  '/orders',
  authenticate,
  query('status').optional().isIn(['open', 'partially_filled', 'filled', 'cancelled', 'expired']),
  handleValidation,
  asyncHandler(async (req, res) => {
    const eoa       = req.user.walletAddress || req.user.address;
    const safeMaker = req.user.smartWallet?.proxy || null;
    const { status } = req.query;

    const orders = await clobService.getUserOrders(eoa, status, safeMaker);
    
    res.json({
      success: true,
      count: orders.length,
      orders,
    });
  })
);

/**
 * GET /api/clob/order/:orderId
 * Get specific order details
 */
router.get(
  '/order/:orderId',
  param('orderId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.orderId });
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    res.json({ success: true, order });
  })
);

/**
 * GET /api/clob/markets
 * Get list of markets with CLOB activity
 */
router.get(
  '/markets',
  asyncHandler(async (req, res) => {
    // Aggregate active markets from orders
    const markets = await Order.aggregate([
      {
        $match: {
          status: { $in: ['open', 'partially_filled'] },
          expiration: { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: { conditionId: '$conditionId', tokenId: '$tokenId' },
          bidCount: {
            $sum: { $cond: [{ $eq: ['$side', 'buy'] }, 1, 0] },
          },
          askCount: {
            $sum: { $cond: [{ $eq: ['$side', 'sell'] }, 1, 0] },
          },
          totalVolume: { $sum: '$remainingNotional' },
          bestBid: { $max: { $cond: [{ $eq: ['$side', 'buy'] }, '$price', 0] } },
          bestAsk: { $min: { $cond: [{ $eq: ['$side', 'sell'] }, '$price', 999] } },
        },
      },
      {
        $project: {
          conditionId: '$_id.conditionId',
          tokenId: '$_id.tokenId',
          bidCount: 1,
          askCount: 1,
          totalVolume: 1,
          bestBid: 1,
          bestAsk: 1,
          spread: { $subtract: ['$bestAsk', '$bestBid'] },
        },
      },
    ]);
    
    res.json({
      success: true,
      count: markets.length,
      markets,
    });
  })
);

/**
 * POST /api/clob/admin/cleanup (Admin only)
 * Clean up expired orders
 */
router.post(
  '/admin/cleanup',
  authenticate,
  adminAuth,
  asyncHandler(async (req, res) => {
    const cleaned = await clobService.cleanupExpiredOrders();
    
    res.json({
      success: true,
      cleaned,
      message: `${cleaned} expired orders cleaned up`,
    });
  })
);

/**
 * GET /api/clob/domain
 * Get EIP-712 domain for signing orders
 */
router.get('/domain', (req, res) => {
  res.json({
    success: true,
    domain: clobService.ORDER_DOMAIN,
    types: clobService.ORDER_TYPES,
    feeRateBps: clobService.TAKER_FEE_BPS,
  });
});

// ── Market-maker bot admin endpoints (admin only, ONCHAIN_ENABLED required) ───

const makerBotService = require('../services/makerBotService');

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  next();
}

function requireOnchain(req, res, next) {
  if (process.env.ONCHAIN_ENABLED !== 'true') {
    return res.status(503).json({ success: false, error: 'ONCHAIN_ENABLED is not true' });
  }
  next();
}

/**
 * POST /api/clob/maker/seed
 * Split USDC → YES+NO for a market (fund operator inventory).
 */
router.post(
  '/maker/seed',
  authenticate,
  requireAdmin,
  requireOnchain,
  body('conditionId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const result = await makerBotService.seedMarket(req.body.conditionId);
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/clob/maker/refresh
 * Cancel + re-quote operator orders for a market at current probability.
 */
router.post(
  '/maker/refresh',
  authenticate,
  requireAdmin,
  requireOnchain,
  body('conditionId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    await makerBotService.refreshMarket(req.body.conditionId);
    res.json({ success: true, message: 'Market refreshed' });
  })
);

/**
 * POST /api/clob/maker/start
 * Start periodic re-quoting for a market.
 */
router.post(
  '/maker/start',
  authenticate,
  requireAdmin,
  requireOnchain,
  body('conditionId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    makerBotService.startMarket(req.body.conditionId);
    res.json({ success: true, message: `Market-making started for ${req.body.conditionId}` });
  })
);

/**
 * POST /api/clob/maker/stop
 * Stop periodic re-quoting. Pass conditionId to stop one, omit to stop all.
 */
router.post(
  '/maker/stop',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { conditionId } = req.body;
    if (conditionId) {
      makerBotService.stopMarket(conditionId);
      res.json({ success: true, message: `Stopped ${conditionId}` });
    } else {
      makerBotService.stopAll();
      res.json({ success: true, message: 'All markets stopped' });
    }
  })
);

/**
 * GET /api/clob/activity?conditionId=<id>&limit=20
 * Get own CLOB activity for a market, excluding maker-bot fills.
 */
router.get(
  '/activity',
  [query('conditionId').notEmpty(), query('limit').optional().isInt({ min: 1, max: 100 })],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { conditionId, limit = 20 } = req.query;

    // Query Fill records for this conditionId, excluding bot fills
    const fills = await Fill.find({
      conditionId,
      isMakerBot: false, // Exclude maker-bot activity
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('takerUser', 'username avatar')
      .lean();

    // Format for frontend
    const activities = fills.map((fill) => ({
      id: fill._id,
      type: fill.side === 'buy' ? 'buy' : 'sell',
      user: fill.takerUser
        ? {
            username: fill.takerUser.username,
            avatar: fill.takerUser.avatar,
          }
        : { username: fill.takerAddress.slice(0, 6) + '...' + fill.takerAddress.slice(-4), avatar: null },
      outcome: fill.side === 'buy' ? 'Yes' : 'No',
      amount: fill.notional,
      shares: fill.size,
      price: fill.priceCents, // cents (0-100)
      txHash: fill.settlementTxHash,
      timestamp: fill.createdAt,
    }));

    res.json({ activities, source: 'predictme', total: activities.length });
  })
);

/**
 * GET /api/clob/holders?conditionId=<id>&limit=10
 * Get own holders for a market (real PredictMe users who bought), excluding bot inventory.
 */
router.get(
  '/holders',
  [query('conditionId').notEmpty(), query('limit').optional().isInt({ min: 1, max: 50 })],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { conditionId, limit = 10 } = req.query;

    // Aggregate shares held by users from Trade records (net buys against sells)
    // For CLOB: sells are stored with negative shares, so summing nets the position.
    const holderStats = await Trade.aggregate([
      {
        $match: {
          conditionId,
          user: { $exists: true, $ne: null }, // Only platform users
        },
      },
      {
        $group: {
          _id: '$user',
          totalShares: { $sum: '$shares' }, // Net shares: buys (+) + sells (-)
          totalSpent: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, '$amount', 0] } },
          avgPrice: { $avg: '$price' },
          tradeCount: { $sum: 1 },
        },
      },
      // Filter out zero-share positions (fully closed/sold out)
      { $match: { totalShares: { $gt: 0 } } },
      { $sort: { totalShares: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // Populate user details
    const userIds = holderStats.map((h) => h._id);
    const users = await User.find({ _id: { $in: userIds } })
      .select('username avatar')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const holders = holderStats.map((stat) => {
      const user = userMap.get(stat._id.toString());
      return {
        user: user
          ? {
              username: user.username,
              avatar: user.avatar,
            }
          : { username: 'Unknown', avatar: null },
        shares: stat.totalShares,
        avgPrice: stat.avgPrice,
        spent: stat.totalSpent,
        tradeCount: stat.tradeCount,
      };
    });

    res.json({ holders, source: 'predictme', total: holders.length });
  })
);

module.exports = router;
