const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../middleware/cache');
const {
  getMarkets,
  getFeaturedMarkets,
  getMarketBySlug,
  getMarketPriceHistory,
  getMarketCryptoPriceHistory,
} = require('../controllers/marketController');

router.get('/', cacheMiddleware(30), getMarkets);
router.get('/featured', cacheMiddleware(60), getFeaturedMarkets);
router.get('/:slug/price-history', cacheMiddleware(60), getMarketPriceHistory);
router.get('/:slug/crypto-price-history', cacheMiddleware(30), getMarketCryptoPriceHistory);
router.get('/:slug', cacheMiddleware(30), getMarketBySlug);

module.exports = router;
