const express = require('express');
const router = express.Router();
const { moonpayWebhook, exchangeWebhook } = require('../controllers/depositController');

// MoonPay webhook with raw body already attached
router.post('/', moonpayWebhook);

// Fun.xyz (Funkit) exchange webhook with raw body already attached
router.post('/exchange', exchangeWebhook);

module.exports = router;
