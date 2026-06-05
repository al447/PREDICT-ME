const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const {
  getAddresses,
  claimDeposit,
  getMyDeposits,
  adminList,
  adminStats,
  priceSuggestion,
  adminCredit,
  adminReject,
  moonpaySign,
  moonpayWebhook,
  moonpaySimulatePayment,
  createExchangeSession,
  getExchangeSession,
  exchangeWebhook,
  getBridgeQuote,
  getBridgeStatus,
} = require('../controllers/depositController');

// User routes (require normal auth JWT)
router.get('/addresses', protect, getAddresses);
router.post('/claim', protect, claimDeposit);
router.get('/mine', protect, getMyDeposits);

// Admin routes (require admin JWT)
router.get('/admin/list', adminAuth, adminList);
router.get('/admin/stats', adminAuth, adminStats);
router.get('/admin/:id/price-suggestion', adminAuth, priceSuggestion);
router.post('/admin/:id/credit', adminAuth, adminCredit);
router.post('/admin/:id/reject', adminAuth, adminReject);

// MoonPay routes
router.post('/moonpay/sign', protect, moonpaySign);
router.post('/moonpay/simulate-payment', protect, moonpaySimulatePayment);
// MoonPay webhook is mounted with raw body parser in server.js

// Exchange Connect (Fun.xyz) routes
router.post('/exchange/session', protect, createExchangeSession);
router.get('/exchange/session/:id', protect, getExchangeSession);
// Fun.xyz webhook is mounted with raw body parser in server.js

// Non-custodial bridge deposit routes (Relay / LI.FI)
// Funds route to user's Gnosis Safe — admin never receives them
router.post('/bridge/quote', protect, getBridgeQuote);
router.get('/bridge/status/:id', protect, getBridgeStatus);

module.exports = router;
