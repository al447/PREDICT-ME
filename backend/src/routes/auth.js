const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { googleAuth, walletAuth, magicAuth, getMe, logout, refreshTokenHandler } = require('../controllers/authController');

// Google One-Tap credential auth
router.post(
  '/google',
  [body('credential').notEmpty().withMessage('Google credential is required')],
  validate,
  googleAuth
);

// Magic Labs — embedded wallet auth (email + Google social handled by Magic SDK)
router.post(
  '/magic',
  [body('didToken').notEmpty().withMessage('Magic DID token is required')],
  validate,
  magicAuth
);

router.post(
  '/wallet',
  [
    body('walletAddress').notEmpty().withMessage('Wallet address is required'),
    body('signature').notEmpty().withMessage('Signature is required'),
    body('message').notEmpty().withMessage('Message is required'),
  ],
  validate,
  walletAuth
);

router.post('/refresh', [body('refreshToken').notEmpty().withMessage('Refresh token required')], validate, refreshTokenHandler);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

module.exports = router;
