/**
 * relayProvider.js — Relay (relay.link) bridge for Bitcoin → Polygon USDC
 *
 * Uses Relay's deposit-address API for a no-keys, reusable BTC deposit address.
 * Relay handles:
 *   - BTC mempool monitoring + confirmation gating (1-2 blocks)
 *   - BTC → USDC swap
 *   - USDC delivery to the recipient on Polygon
 *   - Auto-refund on failure (via refundTo sentinel)
 *
 * BRIDGE_SWEEP_ENABLED=true  → real Relay API calls
 * BRIDGE_SWEEP_ENABLED=false → mock addresses and statuses
 */

const axios = require('axios');
const { RELAY_CONFIG } = require('../../config/contracts');

const SWEEP_ENABLED = process.env.BRIDGE_SWEEP_ENABLED === 'true';

// ── Create BTC deposit address ──────────────────────────────────────────────

/**
 * Provision a reusable BTC deposit address via Relay /quote/v2.
 * The address is open (not strict), tolerant of variable amounts.
 *
 * @param {object} params
 * @param {string} params.recipientSafe - user's Polygon Safe address (USDC recipient)
 * @returns {{ depositAddress: string, requestId: string }}
 */
async function createBtcDepositAddress({ recipientSafe }) {
  if (!SWEEP_ENABLED) {
    const mockAddr = `bc1q-mock-${Date.now().toString(36)}`;
    const mockReqId = `relay-mock-${Date.now()}`;
    console.log(`[Relay] Mock mode — returning synthetic BTC address: ${mockAddr}`);
    return { depositAddress: mockAddr, requestId: mockReqId };
  }

  const { data } = await axios.post(
    `${RELAY_CONFIG.apiUrl}/quote/v2`,
    {
      user:                recipientSafe,
      originChainId:       RELAY_CONFIG.bitcoinChainId,
      originCurrency:      '0x0000000000000000000000000000000000000000', // BTC native
      destinationChainId:  RELAY_CONFIG.polygonChainId,
      destinationCurrency: RELAY_CONFIG.polygonUsdc,
      tradeType:           'EXACT_INPUT',
      recipient:           recipientSafe,
      amount:              '10000', // nominal satoshis for address provisioning
      useDepositAddress:   true,
      refundTo:            RELAY_CONFIG.btcNativeSentinel,
    },
    { timeout: 30000 }
  );

  // Extract deposit address and requestId from response
  const depositAddress = data?.steps?.[0]?.items?.[0]?.data?.to || data?.depositAddress;
  const requestId = data?.requestId || data?.steps?.[0]?.requestId;

  if (!depositAddress) {
    throw new Error('[Relay] No depositAddress in /quote/v2 response');
  }

  console.log(`[Relay] Provisioned BTC deposit address: ${depositAddress}, requestId: ${requestId}`);
  return { depositAddress, requestId };
}

// ── Poll requests by deposit address ────────────────────────────────────────

/**
 * Fetch recent requests/fills for a Relay deposit address.
 * Each BTC send to the address creates a "child request" tracked independently.
 *
 * @param {string} depositAddress - BTC deposit address
 * @returns {Array<{ requestId, status, inTxHash, outTxHash, inAmountBtc, outAmountUsdc }>}
 */
async function getRequestsByDepositAddress(depositAddress) {
  if (!SWEEP_ENABLED) {
    return []; // mock mode: no external calls
  }

  try {
    const { data } = await axios.get(`${RELAY_CONFIG.apiUrl}/requests/v2`, {
      params: {
        depositAddress,
        includeChildRequests: true,
        sortBy:        'updatedAt',
        sortDirection: 'desc',
        limit:         20,
      },
      timeout: 15000,
    });

    const requests = data?.requests || data || [];
    return requests.map(normalizeRelayRequest);
  } catch (err) {
    console.warn('[Relay] getRequestsByDepositAddress error:', err.message);
    return [];
  }
}

// ── Get single request status ───────────────────────────────────────────────

/**
 * Get status of a specific Relay request by requestId.
 *
 * @param {string} requestId
 * @returns {{ status: 'pending'|'success'|'refund'|'failure', outTxHash, outAmountUsdc, provider }}
 */
async function getStatus(requestId) {
  if (!SWEEP_ENABLED) {
    return { status: 'pending', outTxHash: null, outAmountUsdc: null, provider: 'relay' };
  }

  if (!requestId) return { status: 'pending', provider: 'relay' };

  try {
    const { data } = await axios.get(`${RELAY_CONFIG.apiUrl}/intents/status/v3`, {
      params: { requestId },
      timeout: 15000,
    });

    const status = mapRelayStatus(data?.status);
    return {
      status,
      outTxHash:    data?.txHashes?.outTx || data?.outTx || null,
      outAmountUsdc: data?.outputAmount ? parseFloat(data.outputAmount) / 1e6 : null,
      inAmountBtc:   data?.inputAmount ? parseFloat(data.inputAmount) / 1e8 : null,
      provider:     'relay',
      raw:          data,
    };
  } catch (err) {
    console.warn('[Relay] getStatus error:', err.message);
    return { status: 'pending', error: err.message, provider: 'relay' };
  }
}

// ── Create BTC withdrawal (reverse: Polygon USDC → BTC) ────────────────────

/**
 * Initiate a reverse bridge: Polygon USDC → BTC via Relay.
 * Returns a Polygon deposit address where the operator sends USDC from the Safe,
 * and Relay swaps to BTC and sends to the recipient.
 *
 * @param {object} params
 * @param {string} params.fromSafe       - user's Polygon Safe address
 * @param {string} params.btcRecipient   - destination BTC address
 * @param {number} params.amountUsdc     - USDC amount (human-readable)
 * @returns {{ depositAddress, requestId, estimatedBtc }}
 */
async function createBtcWithdrawal({ fromSafe, btcRecipient, amountUsdc }) {
  if (!SWEEP_ENABLED) {
    console.log('[Relay] Mock mode — skipping real BTC withdrawal');
    return {
      depositAddress: '0xmock-relay-withdraw',
      requestId:      `relay-wd-mock-${Date.now()}`,
      estimatedBtc:   null,
      provider:       'relay',
    };
  }

  const amountBase = Math.round(amountUsdc * 1e6).toString();

  const { data } = await axios.post(
    `${RELAY_CONFIG.apiUrl}/quote/v2`,
    {
      user:                fromSafe,
      originChainId:       RELAY_CONFIG.polygonChainId,
      originCurrency:      RELAY_CONFIG.polygonUsdc,
      destinationChainId:  RELAY_CONFIG.bitcoinChainId,
      destinationCurrency: '0x0000000000000000000000000000000000000000', // BTC native
      tradeType:           'EXACT_INPUT',
      recipient:           btcRecipient,
      amount:              amountBase,
      useDepositAddress:   true,
    },
    { timeout: 30000 }
  );

  const depositAddress = data?.steps?.[0]?.items?.[0]?.data?.to || data?.depositAddress;
  const requestId = data?.requestId || data?.steps?.[0]?.requestId;
  const estimatedBtc = data?.details?.currencyOut?.amountFormatted || null;

  return { depositAddress, requestId, estimatedBtc, provider: 'relay' };
}

// ── Get withdrawal quote ────────────────────────────────────────────────────

/**
 * Get a quote for USDC→BTC withdrawal via Relay.
 *
 * @param {object} params
 * @param {number} params.amountUsdc   - USDC amount
 * @param {string} params.btcRecipient - destination BTC address
 */
async function getWithdrawQuote({ amountUsdc, btcRecipient }) {
  if (!SWEEP_ENABLED) {
    return {
      quoteId:         `relay-q-mock-${Date.now()}`,
      estimatedOutput: null,
      estimatedFee:    null,
      estimatedTime:   600,
      provider:        'relay',
    };
  }

  const amountBase = Math.round(amountUsdc * 1e6).toString();

  const { data } = await axios.post(
    `${RELAY_CONFIG.apiUrl}/quote/v2`,
    {
      user:                '0x0000000000000000000000000000000000000001',
      originChainId:       RELAY_CONFIG.polygonChainId,
      originCurrency:      RELAY_CONFIG.polygonUsdc,
      destinationChainId:  RELAY_CONFIG.bitcoinChainId,
      destinationCurrency: '0x0000000000000000000000000000000000000000',
      tradeType:           'EXACT_INPUT',
      recipient:           btcRecipient,
      amount:              amountBase,
    },
    { timeout: 15000 }
  );

  return {
    quoteId:         `relay-q-${Date.now()}`,
    estimatedOutput: data?.details?.currencyOut?.amountFormatted || null,
    estimatedFee:    data?.fees?.relayer || '0',
    estimatedTime:   data?.details?.timeEstimate || 600,
    provider:        'relay',
    raw:             data,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRelayRequest(req) {
  return {
    requestId:    req.requestId || req.id,
    status:       mapRelayStatus(req.status),
    inTxHash:     req.inTx?.hash || req.inTxHash || null,
    outTxHash:    req.outTx?.hash || req.outTxHash || null,
    inAmountBtc:  req.inTx?.value ? parseFloat(req.inTx.value) / 1e8 : null,
    outAmountUsdc: req.outTx?.value ? parseFloat(req.outTx.value) / 1e6 : null,
    updatedAt:    req.updatedAt || null,
  };
}

function mapRelayStatus(s) {
  if (!s) return 'pending';
  const l = s.toLowerCase();
  if (l === 'success' || l === 'completed' || l === 'filled') return 'success';
  if (l === 'refund' || l === 'refunded') return 'refund';
  if (l === 'failure' || l === 'failed') return 'failure';
  return 'pending';
}

module.exports = {
  createBtcDepositAddress,
  getRequestsByDepositAddress,
  getStatus,
  createBtcWithdrawal,
  getWithdrawQuote,
};
