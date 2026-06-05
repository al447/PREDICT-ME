const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { adminAuth } = require('../middleware/adminAuth');
const {
  getStats,
  getConfig,
  updateConfig,
  listReferrals,
  listCommissions,
  adjustUserBalance,
  banUserFromProgram,
  forceQualify,
  revokeReferral,
  getLeaderboard,
} = require('../controllers/adminReferralController');

router.get('/stats', adminAuth, getStats);
router.get('/config', adminAuth, getConfig);
router.put('/config', adminAuth, updateConfig);
router.get('/list', adminAuth, listReferrals);
router.get('/commissions', adminAuth, listCommissions);
router.get('/leaderboard', adminAuth, getLeaderboard);

router.post(
  '/users/:id/adjust',
  adminAuth,
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('reason').isString().isLength({ min: 3, max: 500 }).withMessage('Reason is required'),
  ],
  validate,
  adjustUserBalance
);

router.post(
  '/users/:id/ban',
  adminAuth,
  [body('banned').isBoolean().withMessage('Banned must be a boolean')],
  validate,
  banUserFromProgram
);

router.post('/:referralId/qualify', adminAuth, forceQualify);
router.post('/:referralId/revoke', adminAuth, revokeReferral);

module.exports = router;
