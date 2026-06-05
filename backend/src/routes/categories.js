const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../middleware/cache');
const { getCategories, getCategoryBySlug } = require('../controllers/categoryController');

router.get('/', cacheMiddleware(300), getCategories);
router.get('/:slug', cacheMiddleware(300), getCategoryBySlug);

module.exports = router;
