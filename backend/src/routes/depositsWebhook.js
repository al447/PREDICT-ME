const express = require('express');
const router = express.Router();
const { moonpayWebhook } = require('../controllers/depositController');

// MoonPay webhook with raw body already attached
router.post('/', moonpayWebhook);

module.exports = router;
