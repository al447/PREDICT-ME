const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../middleware/cache');
const { adminAuth } = require('../middleware/adminAuth');
const {
  getMarkets,
  getFeaturedMarkets,
  getMarketBySlug,
  getMarketPriceHistory,
  getMarketCryptoPriceHistory,
} = require('../controllers/marketController');
const marketStatusService = require('../services/marketStatusService');

router.get('/', cacheMiddleware(30), getMarkets);
router.get('/featured', cacheMiddleware(60), getFeaturedMarkets);

// Status-filtered markets (Polymarket-style): active, closed, pending, resolved, expired
router.get('/status/:statusFilter', cacheMiddleware(30), async (req, res, next) => {
  try {
    const { statusFilter } = req.params;
    const options = {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      sortBy: req.query.sortBy || 'endDate',
      sortOrder: req.query.sortOrder || 'desc',
      categorySlug: req.query.category,
    };

    const result = await marketStatusService.getMarketsByStatus(statusFilter, options);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Pending resolution stats (admin only — requires authentication)
router.get('/admin/pending-stats', adminAuth, async (req, res, next) => {
  try {
    const stats = await marketStatusService.getPendingResolutionStats();
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/price-history', cacheMiddleware(60), getMarketPriceHistory);
router.get('/:slug/crypto-price-history', cacheMiddleware(30), getMarketCryptoPriceHistory);
router.get('/:slug', cacheMiddleware(30), getMarketBySlug);

module.exports = router;
