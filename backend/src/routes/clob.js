/**
 * CLOB (Central Limit Order Book) API Routes
 * REST API for orders + WebSocket upgrade for real-time order book
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const clobService = require('../services/clobService');
const Order = require('../models/Order');
const { protect: authenticate } = require('../middleware/auth');

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
  asyncHandler(async (req, res) => {
    // TODO: Add admin check
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

module.exports = router;
