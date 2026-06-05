const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const {
  getMyReferral,
  getMyReferralHistory,
  applyReferralCode,
  validateReferralCodePublic,
} = require('../controllers/referralController');

// Public route
router.get('/validate/:code', validateReferralCodePublic);

// Protected routes
router.get('/me', protect, getMyReferral);
router.get('/history', protect, getMyReferralHistory);
router.post(
  '/apply',
  protect,
  [body('code').isString().isLength({ min: 4, max: 12 }).withMessage('Valid referral code is required')],
  validate,
  applyReferralCode
);

module.exports = router;
