/**
 * bridgeService.js — Multi-chain non-custodial deposit routing
 *
 * Abstraction over Relay (api.relay.link) and LI.FI (li.quest).
 * Users deposit any asset on any supported chain; the bridge aggregator
 * swaps + bridges it to USDC on Polygon, credited to the user's Safe proxy.
 *
 * Non-custodial: funds always route directly to the user's Gnosis Safe.
 * Admin never receives or holds funds.
 *
 * Usage:
 *   const { depositAddress, routeId, estimatedOutput } = await getBridgeQuote({
 *     user, fromChainId, fromToken, fromAmount
 *   });
 */

const axios = require('axios');
const { BRIDGE_CONFIG, CHAIN_ID } = require('../config/contracts');
const walletService = require('./walletService');

// ── Relay protocol ────────────────────────────────────────────────────────────
// Relay assigns a deposit address per quote. User sends funds there;
// Relay bridges + swaps to USDC on dest chain, sends to recipient (user's Safe).
// Docs: https://docs.relay.link/

async function getRelayQuote({ fromChainId, fromToken, fromAmount, recipientAddress }) {
  const url = `${BRIDGE_CONFIG.relayApiUrl}/quote`;
  const body = {
    user:          recipientAddress,
    originChainId: fromChainId,
    destinationChainId: BRIDGE_CONFIG.destChainId,
    originCurrency: fromToken,
    destinationCurrency: 'usdc',
    recipient:     recipientAddress,
    amount:        fromAmount.toString(),
    tradeType:     'EXACT_INPUT',
  };

  const { data } = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  return {
    routeId:           data.requestId || data.id,
    depositAddress:    data.steps?.[0]?.items?.[0]?.data?.to || recipientAddress,
    callData:          data.steps?.[0]?.items?.[0]?.data?.data || null,
    estimatedOutput:   data.details?.currencyOut?.amountFormatted || '0',
    estimatedFee:      data.fees?.relayer?.amountFormatted || '0',
    estimatedTime:     data.details?.timeEstimate || 60,
    fromChainId,
    fromToken,
    fromAmount,
    recipient:         recipientAddress,
    provider:          'relay',
    rawQuote:          data,
  };
}

// ── LI.FI protocol ────────────────────────────────────────────────────────────
// Docs: https://docs.li.fi/integrate-li.fi-sdk/get-a-quote

async function getLifiQuote({ fromChainId, fromToken, fromAmount, recipientAddress }) {
  const url = `${BRIDGE_CONFIG.lifiApiUrl}/quote`;
  const params = {
    fromChain:    fromChainId,
    toChain:      BRIDGE_CONFIG.destChainId,
    fromToken,
    toToken:      'USDC',
    fromAmount:   fromAmount.toString(),
    fromAddress:  recipientAddress,
    toAddress:    recipientAddress,
    integrator:   'PredictMe',
  };

  const { data } = await axios.get(url, { params, timeout: 15000 });
  const step = data.transactionRequest || {};

  return {
    routeId:           data.id || data.action?.fromToken?.address,
    depositAddress:    step.to || recipientAddress,
    callData:          step.data || null,
    estimatedOutput:   data.estimate?.toAmountMin
      ? (Number(data.estimate.toAmountMin) / 1e6).toFixed(2)
      : '0',
    estimatedFee:      data.estimate?.feeCosts?.[0]?.amountUSD || '0',
    estimatedTime:     data.estimate?.executionDuration || 60,
    fromChainId,
    fromToken,
    fromAmount,
    recipient:         recipientAddress,
    provider:          'lifi',
    rawQuote:          data,
  };
}

// ── Relay status polling ──────────────────────────────────────────────────────
async function getRelayStatus(routeId) {
  const { data } = await axios.get(`${BRIDGE_CONFIG.relayApiUrl}/requests/${routeId}`, {
    timeout: 10000,
  });
  const status = data.status || 'pending';
  return {
    routeId,
    status:   mapRelayStatus(status),
    txHash:   data.data?.inTxHash || null,
    outTxHash: data.data?.outTxHash || null,
    provider: 'relay',
    raw:      data,
  };
}

function mapRelayStatus(s) {
  if (!s) return 'pending';
  const lower = s.toLowerCase();
  if (lower === 'success' || lower === 'complete') return 'completed';
  if (lower === 'failure' || lower === 'failed')   return 'failed';
  if (lower === 'refunded')                         return 'refunded';
  return 'pending';
}

// ── LI.FI status polling ──────────────────────────────────────────────────────
async function getLifiStatus(txHash, fromChainId) {
  const { data } = await axios.get(`${BRIDGE_CONFIG.lifiApiUrl}/status`, {
    params: { txHash, bridge: 'lifi', fromChain: fromChainId, toChain: BRIDGE_CONFIG.destChainId },
    timeout: 10000,
  });
  return {
    routeId:  txHash,
    status:   mapLifiStatus(data.status),
    txHash:   data.sending?.txHash || txHash,
    outTxHash: data.receiving?.txHash || null,
    provider: 'lifi',
    raw:      data,
  };
}

function mapLifiStatus(s) {
  if (!s) return 'pending';
  const lower = s.toLowerCase();
  if (lower === 'done')          return 'completed';
  if (lower === 'failed')        return 'failed';
  if (lower === 'not_found')     return 'pending';
  return 'pending';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a bridge quote for a user deposit.
 * Ensures the user has a Safe proxy (predicts address if not yet deployed).
 *
 * @param {object} params
 * @param {import('../models/User').default} params.user
 * @param {number|string} params.fromChainId - source chain ID (e.g. 1 = Ethereum)
 * @param {string} params.fromToken - token symbol or address (e.g. 'ETH', 'USDC')
 * @param {string|number} params.fromAmount - amount in smallest units
 * @returns {Promise<object>} quote including depositAddress + routeId
 */
async function getBridgeQuote({ user, fromChainId, fromToken, fromAmount }) {
  const wallet = await walletService.ensureSmartWallet(user);
  const recipientAddress = wallet.proxy;

  const provider = BRIDGE_CONFIG.provider;

  try {
    if (provider === 'relay') {
      return await getRelayQuote({ fromChainId, fromToken, fromAmount, recipientAddress });
    } else {
      return await getLifiQuote({ fromChainId, fromToken, fromAmount, recipientAddress });
    }
  } catch (err) {
    // Try fallback provider if primary fails
    console.warn(`[Bridge] ${provider} quote failed, trying fallback:`, err.message);
    try {
      if (provider === 'relay') {
        return await getLifiQuote({ fromChainId, fromToken, fromAmount, recipientAddress });
      } else {
        return await getRelayQuote({ fromChainId, fromToken, fromAmount, recipientAddress });
      }
    } catch (fallbackErr) {
      // Both providers failed — return a direct-send fallback so the UI can still show the deposit address
      console.warn(`[Bridge] Both providers failed, returning direct fallback. LI.FI error: ${fallbackErr.message}`);
      return {
        routeId:         null,
        depositAddress:  recipientAddress,
        callData:        null,
        estimatedOutput: null,
        estimatedFee:    '0',
        estimatedTime:   null,
        fromChainId,
        fromToken,
        fromAmount,
        recipient:       recipientAddress,
        provider:        'direct',
        fallback:        true,
      };
    }
  }
}

/**
 * Get bridge route/transaction status.
 *
 * @param {object} params
 * @param {string} params.routeId - route ID from getBridgeQuote
 * @param {string} [params.txHash] - on-chain tx hash (for LI.FI)
 * @param {string} params.provider - 'relay' | 'lifi'
 * @param {number} [params.fromChainId] - needed for LI.FI status
 */
async function getBridgeStatus({ routeId, txHash, provider, fromChainId }) {
  provider = provider || BRIDGE_CONFIG.provider;
  if (provider === 'relay') {
    return await getRelayStatus(routeId);
  } else {
    return await getLifiStatus(txHash || routeId, fromChainId);
  }
}

module.exports = { getBridgeQuote, getBridgeStatus };
