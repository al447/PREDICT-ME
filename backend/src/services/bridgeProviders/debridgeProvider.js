/**
 * debridgeProvider.js — DeBridge bridge (EVM fallback / large amounts)
 *
 * Used as a fallback when Across is unavailable, or for large deposits
 * where DeBridge offers better rates.
 *
 * REST API: https://api.dln.trade/v1.0
 */

const axios = require('axios');

const BASE_URL = process.env.DEBRIDGE_API_URL || 'https://api.dln.trade/v1.0';
const DEST_CHAIN_ID = 137; // Polygon

/**
 * Get a DeBridge DLN quote.
 */
async function getQuote({ fromChainId, srcTokenAddress, dstTokenAddress, srcTokenAmount, recipient }) {
  try {
    const url = `${BASE_URL}/dln/order/quote`;
    const { data } = await axios.get(url, {
      params: {
        srcChainId:        fromChainId,
        srcChainTokenIn:   srcTokenAddress,
        srcChainTokenInAmount: srcTokenAmount,
        dstChainId:        DEST_CHAIN_ID,
        dstChainTokenOut:  dstTokenAddress || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        dstChainTokenOutRecipient: recipient,
        prependOperatingExpenses: false,
      },
      timeout: 15000,
    });

    return {
      quoteId:          data.orderId || `db-${Date.now()}`,
      estimatedOutput:  data.estimation?.dstChainTokenOut?.recommendedAmount || null,
      estimatedFee:     data.estimation?.costsDetails?.[0]?.payload?.feeAmount || '0',
      estimatedTime:    data.order?.approximateFulfillmentDelay || 300,
      orderCalldata:    data.tx || null,
      provider:         'debridge',
      raw:              data,
    };
  } catch (err) {
    console.warn('[DeBridge] Quote failed:', err.message);
    return { quoteId: null, error: err.message, provider: 'debridge' };
  }
}

/**
 * Execute a DeBridge order using a pre-fetched quote.
 * The sweep service signs and broadcasts the calldata returned by getQuote.
 */
async function execute({ orderCalldata }) {
  if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
    console.log('[DeBridge] Sandbox mode — skipping real execution');
    return { status: 'simulated', txHash: null, provider: 'debridge' };
  }
  if (!orderCalldata) throw new Error('[DeBridge] No order calldata — call getQuote first');
  return { calldata: orderCalldata, provider: 'debridge' };
}

/**
 * Poll order status.
 */
async function getStatus(orderId) {
  if (!orderId) return { status: 'pending', provider: 'debridge' };
  try {
    const { data } = await axios.get(`${BASE_URL}/dln/order/${orderId}/status`, { timeout: 10000 });
    return {
      status:   mapStatus(data.status),
      fillTxHash: data.fill?.transactionHash || null,
      provider: 'debridge',
      raw:      data,
    };
  } catch (err) {
    return { status: 'pending', error: err.message, provider: 'debridge' };
  }
}

function mapStatus(s) {
  if (!s) return 'pending';
  const l = s.toLowerCase();
  if (l === 'fulfilled' || l === 'sentunlock' || l === 'claimedunlock') return 'completed';
  if (l === 'cancelled' || l === 'ordercancelled') return 'failed';
  return 'pending';
}

module.exports = { getQuote, execute, getStatus };
