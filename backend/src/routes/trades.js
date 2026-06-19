const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { placeTrade, getMyTrades, getPositions, getRedeemablePositions, getLeaderboard, getActivity } = require('../controllers/tradeController');

router.post(
  '/',
  protect,
  [
    body('marketId').isMongoId().withMessage('Valid Market ID is required'),
    body('outcome').isString().trim().notEmpty().withMessage('Outcome is required'),
    body('amount').isFloat({ min: 1, max: 100000 }).withMessage('Amount must be between $1 and $100,000'),
  ],
  validate,
  placeTrade
);

router.get('/my', protect, getMyTrades);
router.get('/positions', protect, getPositions);
router.get('/positions/redeemable', protect, getRedeemablePositions);
router.get('/leaderboard', getLeaderboard); // Public endpoint
router.get('/activity', getActivity); // Public global activity feed

module.exports = router;
