const crypto = require('crypto');

const BASE_URL = process.env.MOONPAY_ENV === 'live'
  ? 'https://buy.moonpay.com'
  : 'https://buy-sandbox.moonpay.com';

/**
 * Resolve the on-ramp/off-ramp crypto currency code for the current environment.
 * MoonPay sandbox only supports base-chain currencies (usdc, eth); Polygon variants
 * like usdc_polygon return "Currency not supported in test mode". Live mode uses the
 * real Polygon USDC currency code.
 * @returns {string}
 */
const getCurrencyCode = () => {
  if (process.env.MOONPAY_ENV === 'live') {
    return process.env.MOONPAY_CURRENCY_LIVE || 'usdc_polygon';
  }
  return process.env.MOONPAY_CURRENCY_TEST || 'usdc';
};
exports.getCurrencyCode = getCurrencyCode;

/**
 * Sign any arbitrary MoonPay widget URL for use with onUrlSignature callback.
 * Returns the base64-encoded HMAC-SHA256 signature of the full query string.
 * @param {string} url - Full widget URL including query params
 * @returns {string} base64 signature
 */
exports.signWidgetUrl = (url) => {
  if (!process.env.MOONPAY_SECRET_KEY) {
    throw new Error('MOONPAY_SECRET_KEY is required to sign widget URLs');
  }
  const queryString = new URL(url).search;
  return crypto
    .createHmac('sha256', process.env.MOONPAY_SECRET_KEY)
    .update(queryString)
    .digest('base64');
};

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
    currencyCode: getCurrencyCode(),
    walletAddress: user.smartWallet?.proxy || user.depositAddresses?.evm || (() => { throw new Error('No deposit address available — user must have a proxy wallet or deposit address'); })(),
    baseCurrencyAmount: String(amountUsd),
    baseCurrencyCode: 'usd',
    paymentMethod,
    email: user.email || '',
    externalCustomerId: String(user._id),
    externalTransactionId: externalTxId,
    redirectURL: `${process.env.FRONTEND_URL}/deposit/moonpay/return`,
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
 * Build a signed or unsigned MoonPay sell (off-ramp) URL.
 * Routes the user to a widget where they can sell USDC for fiat.
 * @param {Object} opts
 * @param {Object} opts.user - User doc with walletAddress and email
 * @param {number} opts.amountUsdc - USDC amount to sell
 * @param {string} opts.baseCurrencyCode - Target fiat currency e.g. 'usd', 'gbp', 'eur'
 * @returns {{url: string, signed: boolean, externalTxId: string}}
 */
exports.buildSellUrl = ({ user, amountUsdc, baseCurrencyCode = 'usd' }) => {
  const SELL_BASE_URL = process.env.MOONPAY_ENV === 'live'
    ? 'https://sell.moonpay.com'
    : 'https://sell-sandbox.moonpay.com';

  const externalTxId = `ps_${user._id}_${Date.now()}`;

  const params = new URLSearchParams({
    apiKey:                process.env.MOONPAY_API_KEY,
    currencyCode:          getCurrencyCode(),
    quoteCurrencyCode:     baseCurrencyCode,
    baseCurrencyAmount:    String(amountUsdc),
    walletAddress:         user.smartWallet?.proxy || user.walletAddress || '',
    email:                 user.email || '',
    externalCustomerId:    String(user._id),
    externalTransactionId: externalTxId,
    redirectURL: `${process.env.FRONTEND_URL}/withdraw/moonpay/return`,
    showWalletAddressForm: 'false',
  });

  const url = `${SELL_BASE_URL}?${params.toString()}`;

  if (!process.env.MOONPAY_SECRET_KEY) {
    return { url, signed: false, externalTxId };
  }

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
