const crypto = require('crypto');

const BASE_URL = process.env.MOONPAY_ENV === 'live'
  ? 'https://buy.moonpay.com'
  : 'https://buy-sandbox.moonpay.com';

/**
 * Build a signed or unsigned MoonPay buy URL
 * @param {Object} opts
 * @param {Object} opts.user - User doc with depositAddresses.evm and email
 * @param {number} opts.amountUsd - USD amount to purchase
 * @param {string} opts.paymentMethod - credit_debit_card | apple_pay | google_pay | revolut_pay
 * @returns {{url: string, signed: boolean, externalTxId: string}}
 */
exports.buildBuyUrl = ({ user, amountUsd, paymentMethod }) => {
  const externalTxId = `pb_${user._id}_${Date.now()}`;

  const params = new URLSearchParams({
    apiKey: process.env.MOONPAY_API_KEY,
    currencyCode: 'usdc_polygon',
    walletAddress: user.depositAddresses?.evm || process.env.EVM_DEPOSIT_ADDRESS,
    baseCurrencyAmount: String(amountUsd),
    baseCurrencyCode: 'usd',
    paymentMethod,
    email: user.email || '',
    externalCustomerId: String(user._id),
    externalTransactionId: externalTxId,
    redirectURL: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/deposit/moonpay/return`,
    showWalletAddressForm: 'false',
  });

  const url = `${BASE_URL}?${params.toString()}`;

  // If no secret key, return unsigned URL (sandbox works without signing)
  if (!process.env.MOONPAY_SECRET_KEY) {
    return { url, signed: false, externalTxId };
  }

  // Sign the query string with HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', process.env.MOONPAY_SECRET_KEY)
    .update(new URL(url).search)
    .digest('base64');

  return {
    url: `${url}&signature=${encodeURIComponent(signature)}`,
    signed: true,
    externalTxId,
  };
};

/**
 * Verify MoonPay webhook signature (Moonpay-Signature-V2 header)
 * Format: t=<timestamp>,s=<hex-hmac>
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - Full header value
 * @returns {boolean}
 */
const WEBHOOK_TIMESTAMP_TOLERANCE_S = 300; // 5 minutes — reject stale/replayed webhooks

exports.verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!process.env.MOONPAY_WEBHOOK_KEY || !signatureHeader) {
    return false;
  }

  try {
    const [tsPart, sigPart] = signatureHeader.split(',');
    const timestamp = tsPart?.split('=')[1];
    const signature = sigPart?.split('=')[1];

    if (!timestamp || !signature) return false;

    // Reject requests older than tolerance window (replay-attack guard)
    const tsSeconds = parseInt(timestamp, 10);
    if (!tsSeconds || Math.abs(Date.now() / 1000 - tsSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_S) {
      console.warn('[MoonPay] Webhook timestamp out of tolerance:', timestamp);
      return false;
    }

    const expected = crypto
      .createHmac('sha256', process.env.MOONPAY_WEBHOOK_KEY)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    console.error('Webhook signature verification error:', err);
    return false;
  }
};

/**
 * Estimate USDC received after MoonPay fees
 * @param {number} usdAmount
 * @param {string} paymentMethod
 * @returns {{usdcAmount: number, feePercent: number, feeUsd: number}}
 */
exports.estimateUsdc = (usdAmount, paymentMethod) => {
  // Approximate MoonPay fees (card ~4.5%, wallet pay ~3.9%)
  const feeMap = {
    credit_debit_card: 4.5,
    apple_pay: 3.9,
    google_pay: 3.9,
    revolut_pay: 3.9,
  };

  const feePercent = feeMap[paymentMethod] || 4.5;
  const feeUsd = (usdAmount * feePercent) / 100;
  const usdcAmount = usdAmount - feeUsd; // 1:1 approx for USDC

  return { usdcAmount: Math.max(0, usdcAmount), feePercent, feeUsd };
};
