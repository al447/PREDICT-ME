const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { placeTrade, getMyTrades, getPositions, getLeaderboard } = require('../controllers/tradeController');

router.post(
  '/',
  protect,
  [
    body('marketId').isMongoId().withMessage('Valid Market ID is required'),
    body('outcome').isIn(['Yes', 'No', 'yes', 'no']).withMessage('Outcome must be Yes or No'),
    body('amount').isFloat({ min: 1, max: 100000 }).withMessage('Amount must be between $1 and $100,000'),
  ],
  validate,
  placeTrade
);

router.get('/my', protect, getMyTrades);
router.get('/positions', protect, getPositions);
router.get('/leaderboard', getLeaderboard); // Public endpoint

module.exports = router;
