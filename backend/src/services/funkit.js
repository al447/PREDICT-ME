/**
 * Fun.xyz Checkout service
 * Provider-adapter interface for exchange deposits (Coinbase + Bybit)
 * Fun.xyz internally uses Bluvo (Coinbase) and Swapped (Bybit)
 * 
 * ARCHITECTURE NOTE: This service routes deposits to the DepositRouter contract
 * (non-custodial), NOT the admin wallet. FUNKIT_DESTINATION_ADDRESS must be
 * the deployed DepositRouter.sol address for true Polymarket-style non-custodial flow.
 * See: CONNECT_EXCHANGE_ARCHITECTURE_FIX.md
 */

const crypto = require('crypto');

// Environment configuration
const FUNKIT_API_KEY = process.env.FUNKIT_API_KEY;
const FUNKIT_WEBHOOK_SECRET = process.env.FUNKIT_WEBHOOK_SECRET;
const FUNKIT_ENV = process.env.FUNKIT_ENV || 'sandbox';
const FUNKIT_DESTINATION_ADDRESS = process.env.FUNKIT_DESTINATION_ADDRESS; // Must be DepositRouter, NOT admin
const WEBHOOK_TIMESTAMP_TOLERANCE_S = 300; // 5 minutes

/**
 * Minimal provider-adapter interface
 * { createCheckoutSession, verifyWebhookSignature, parseWebhook }
 * Can be swapped for direct Bluvo + Swapped integration if needed
 */

/**
 * Create a checkout session for exchange deposit
 * @param {Object} params
 * @param {string} params.exchange - 'coinbase' | 'bybit'
 * @param {number} params.amountUsd - Amount in USD (for bybit)
 * @param {Object} params.user - User object with _id
 * @returns {Promise<{sessionId: string, checkoutUrl: string}>}
 */
async function createCheckoutSession({ exchange, amountUsd, user }) {
  if (!FUNKIT_API_KEY) {
    throw new Error('FUNKIT_API_KEY not configured');
  }

  // TODO: Implement actual Fun.xyz API call
  // This is a scaffold - replace with actual Fun.xyz Checkout API integration
  // POST https://api.fun.xyz/v1/checkout/sessions
  //
  // IMPORTANT: FUNKIT_DESTINATION_ADDRESS MUST be the DepositRouter contract,
  // NOT the admin wallet. Deploy contracts/DepositRouter.sol first.
  //
  // Request body:
  // {
  //   type: 'exchange_deposit',
  //   exchange: exchange, // 'coinbase' | 'bybit'
  //   amount: amountUsd ? { currency: 'USD', amount: amountUsd.toString() } : undefined,
  //   destination: {
  //     address: FUNKIT_DESTINATION_ADDRESS, // MUST be DepositRouter.sol
  //     chains: ['base', 'polygon'],
  //     currency: 'USDC'
  //   },
  //   externalCustomerId: Buffer.from(JSON.stringify({
  //     customerId: user._id.toString(),
  //     paymentProviderId: 'FUNKIT',
  //     userId: user.walletAddress || user._id.toString()
  //   })).toString('base64'),
  //   webhookUrl: `${process.env.BACKEND_URL}/api/deposits/exchange/webhook`,
  //   metadata: {
  //     platform: 'PolyBet365',
  //     userId: user._id.toString()
  //   }
  // }

  // For now, return mock data for UI testing
  const mockSessionId = `funkit_${exchange}_${Date.now()}_${user._id.toString().slice(0, 8)}`;
  
  if (exchange === 'coinbase') {
    // Bluvo-powered Coinbase OAuth URL
    return {
      sessionId: mockSessionId,
      checkoutUrl: `https://login.coinbase.com/signin?client_id=MOCK&oauth_challenge=MOCK&redirect=bluvo`,
    };
  } else if (exchange === 'bybit') {
    // Swapped-powered Bybit Pay URL
    return {
      sessionId: mockSessionId,
      checkoutUrl: `https://connect.swapped.com/exchange-pay/deposit/summary?apiKey=MOCK&connection=bybit&name=PolyBet365&amount=${amountUsd}`,
    };
  }

  throw new Error(`Unsupported exchange: ${exchange}`);
}

/**
 * Verify Fun.xyz webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - Webhook signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!FUNKIT_WEBHOOK_SECRET || !signatureHeader) {
    return false;
  }

  try {
    // Parse timestamp and signature from header
    // Format: t=<timestamp>,v1=<signature>
    const [tsPart, sigPart] = signatureHeader.split(',');
    const timestamp = tsPart?.split('=')[1];
    const signature = sigPart?.split('=')[1];

    if (!timestamp || !signature) return false;

    // Reject requests older than tolerance window (replay-attack guard)
    const tsSeconds = parseInt(timestamp, 10);
    if (!tsSeconds || Math.abs(Date.now() / 1000 - tsSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_S) {
      console.warn('[Fun.xyz] Webhook timestamp out of tolerance:', timestamp);
      return false;
    }

    // Compute expected signature (HMAC-SHA256)
    const expected = crypto
      .createHmac('sha256', FUNKIT_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    // Constant-time comparison
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    console.error('Fun.xyz webhook signature verification error:', err);
    return false;
  }
}

/**
 * Parse and validate webhook payload
 * @param {Buffer} rawBody
 * @returns {Object|null}
 */
function parseWebhook(rawBody) {
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    return payload;
  } catch (err) {
    console.error('Fun.xyz webhook parse error:', err);
    return null;
  }
}

/**
 * Get session status from Fun.xyz
 * @param {string} sessionId
 * @returns {Promise<{status: string, creditedAmountUsd?: number}>}
 */
async function getSessionStatus(sessionId) {
  // TODO: Implement actual Fun.xyz API call
  // GET https://api.fun.xyz/v1/checkout/sessions/{sessionId}
  
  // For now, return mock status
  return {
    status: 'waiting_payment', // 'waiting_payment' | 'completed' | 'failed' | 'expired'
  };
}

module.exports = {
  createCheckoutSession,
  verifyWebhookSignature,
  parseWebhook,
  getSessionStatus,
};
