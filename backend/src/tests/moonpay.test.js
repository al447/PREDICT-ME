/**
 * moonpay.test.js
 * Unit tests for buildBuyUrl, buildSellUrl, verifyWebhookSignature, estimateUsdc.
 * No real network required.
 */

const crypto = require('crypto');

// Set required env vars before requiring the module
beforeEach(() => {
  jest.resetModules();
  process.env.MOONPAY_API_KEY     = 'pk_test_KEY';
  process.env.MOONPAY_SECRET_KEY  = 'sk_test_SECRET';
  process.env.MOONPAY_WEBHOOK_KEY = 'wk_test_WEBHOOK';
  process.env.MOONPAY_ENV         = 'sandbox';
  process.env.FRONTEND_URL        = 'http://localhost:5173';
  process.env.EVM_DEPOSIT_ADDRESS = '0xPLATFORM';
});

const fakeUser = {
  _id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  walletAddress: '0xUSER',
  depositAddresses: { evm: '0xSAFE' },
};

describe('buildBuyUrl', () => {
  it('returns a signed URL with correct params', () => {
    const moonpay = require('../services/moonpay');
    const { url, signed, externalTxId } = moonpay.buildBuyUrl({
      user: fakeUser,
      amountUsd: 50,
      paymentMethod: 'credit_debit_card',
    });

    expect(signed).toBe(true);
    expect(url).toContain('buy-sandbox.moonpay.com');
    expect(url).toContain('currencyCode=usdc');
    expect(url).toContain('baseCurrencyAmount=50');
    expect(url).toContain('signature=');
    expect(externalTxId).toMatch(/^pb_/);
  });

  it('returns unsigned URL when no secret key', () => {
    delete process.env.MOONPAY_SECRET_KEY;
    const moonpay = require('../services/moonpay');
    const { url, signed } = moonpay.buildBuyUrl({
      user: fakeUser, amountUsd: 20, paymentMethod: 'apple_pay',
    });
    expect(signed).toBe(false);
    expect(url).not.toContain('signature=');
  });

  it('uses live URL when MOONPAY_ENV=live', () => {
    process.env.MOONPAY_ENV = 'live';
    const moonpay = require('../services/moonpay');
    const { url } = moonpay.buildBuyUrl({
      user: fakeUser, amountUsd: 100, paymentMethod: 'credit_debit_card',
    });
    expect(url).toContain('buy.moonpay.com');
    expect(url).not.toContain('sandbox');
    expect(url).toContain('currencyCode=usdc_polygon');
  });
});

describe('buildSellUrl', () => {
  it('returns a signed sell URL with correct params', () => {
    const moonpay = require('../services/moonpay');
    const { url, signed, externalTxId } = moonpay.buildSellUrl({
      user: fakeUser,
      amountUsdc: 100,
      baseCurrencyCode: 'usd',
    });

    expect(signed).toBe(true);
    expect(url).toContain('sell-sandbox.moonpay.com');
    expect(url).toContain('currencyCode=usdc');
    expect(url).toContain('baseCurrencyAmount=100');
    expect(url).toContain('signature=');
    expect(externalTxId).toMatch(/^ps_/);
  });

  it('externalTxId encodes user._id as second segment', () => {
    const moonpay = require('../services/moonpay');
    const { externalTxId } = moonpay.buildSellUrl({ user: fakeUser, amountUsdc: 50 });
    const [prefix, userId] = externalTxId.split('_');
    expect(prefix).toBe('ps');
    expect(userId).toBe(String(fakeUser._id));
  });

  it('minimum $20 is enforced by caller — URL is still built for any amount', () => {
    const moonpay = require('../services/moonpay');
    const { url } = moonpay.buildSellUrl({ user: fakeUser, amountUsdc: 10 });
    expect(url).toContain('baseCurrencyAmount=10');
  });

  it('uses live sell URL when MOONPAY_ENV=live', () => {
    process.env.MOONPAY_ENV = 'live';
    const moonpay = require('../services/moonpay');
    const { url } = moonpay.buildSellUrl({ user: fakeUser, amountUsdc: 200 });
    expect(url).toContain('sell.moonpay.com');
    expect(url).not.toContain('sandbox');
  });

  it('returns unsigned URL when no secret key', () => {
    delete process.env.MOONPAY_SECRET_KEY;
    const moonpay = require('../services/moonpay');
    const { signed } = moonpay.buildSellUrl({ user: fakeUser, amountUsdc: 50 });
    expect(signed).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature', () => {
    const moonpay = require('../services/moonpay');
    const body = Buffer.from(JSON.stringify({ data: { status: 'completed' } }));
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac('sha256', process.env.MOONPAY_WEBHOOK_KEY)
      .update(`${ts}.${body.toString('utf8')}`)
      .digest('hex');
    expect(moonpay.verifyWebhookSignature(body, `t=${ts},s=${sig}`)).toBe(true);
  });

  it('returns false for a stale timestamp', () => {
    const moonpay = require('../services/moonpay');
    const body = Buffer.from('{}');
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = crypto
      .createHmac('sha256', process.env.MOONPAY_WEBHOOK_KEY)
      .update(`${oldTs}.{}`)
      .digest('hex');
    expect(moonpay.verifyWebhookSignature(body, `t=${oldTs},s=${sig}`)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const moonpay = require('../services/moonpay');
    const body = Buffer.from('{}');
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac('sha256', process.env.MOONPAY_WEBHOOK_KEY)
      .update(`${ts}.tampered`)
      .digest('hex');
    expect(moonpay.verifyWebhookSignature(body, `t=${ts},s=${sig}`)).toBe(false);
  });

  it('returns false when no MOONPAY_WEBHOOK_KEY', () => {
    delete process.env.MOONPAY_WEBHOOK_KEY;
    const moonpay = require('../services/moonpay');
    expect(moonpay.verifyWebhookSignature(Buffer.from('{}'), 't=123,s=abc')).toBe(false);
  });
});

describe('estimateUsdc', () => {
  it('applies ~4.5% fee for credit_debit_card', () => {
    const moonpay = require('../services/moonpay');
    const { usdcAmount, feePercent } = moonpay.estimateUsdc(100, 'credit_debit_card');
    expect(feePercent).toBe(4.5);
    expect(usdcAmount).toBeCloseTo(95.5);
  });

  it('applies ~3.9% fee for apple_pay', () => {
    const moonpay = require('../services/moonpay');
    const { feePercent } = moonpay.estimateUsdc(100, 'apple_pay');
    expect(feePercent).toBe(3.9);
  });

  it('defaults to 4.5% for unknown payment method', () => {
    const moonpay = require('../services/moonpay');
    const { feePercent } = moonpay.estimateUsdc(100, 'unknown_method');
    expect(feePercent).toBe(4.5);
  });
});
