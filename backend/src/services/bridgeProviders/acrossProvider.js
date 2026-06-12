/**
 * acrossProvider.js — Across Protocol bridge for EVM → Polygon USDC
 *
 * Primary provider for all EVM chain deposits.
 * REST API: https://app.across.to/api
 *
 * Across fills work by:
 *   1. GET /suggested-fees   → get fee quote for the route
 *   2. Caller deposits funds into the Across SpokePool on source chain
 *   3. GET /deposit/status   → poll until filled on destination
 */

const axios = require('axios');
const { ethers } = require('ethers');

const BASE_URL = process.env.ACROSS_API_URL || 'https://app.across.to/api';

// Across SpokePool addresses per chain (verified mainnet)
const SPOKE_POOLS = {
  1:     '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5', // Ethereum
  8453:  '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64', // Base
  42161: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A', // Arbitrum
  10:    '0x6f26Bf09B1C792e3228e5467807a900A503c0281', // Optimism
  43114: '0x1Cb2cB0Bb2f7fDCB8a5b26cCcCd4A05bE1aF18B0', // Avalanche
  137:   '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096', // Polygon (direct, no bridge needed)
};

// USDC token addresses per source chain for fill calldata
const USDC_ADDRESSES = {
  1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

const DEST_CHAIN_ID = 137; // Polygon mainnet — USDC destination

/**
 * Get a bridge quote for depositing via Across.
 * @param {object} params
 * @param {number} params.fromChainId
 * @param {string} params.inputToken  - source token address
 * @param {string} params.outputToken - destination token address (USDC on Polygon)
 * @param {string} params.amount      - amount in smallest units (string)
 * @param {string} params.recipient   - user's Safe address on Polygon
 * @returns {Promise<{quoteId, depositCalldata, estimatedOutput, estimatedFee, estimatedTime, raw}>}
 */
async function getQuote({ fromChainId, inputToken, outputToken, amount, recipient }) {
  const url = `${BASE_URL}/suggested-fees`;
  const params = {
    inputToken,
    outputToken: outputToken || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
    originChainId: fromChainId,
    destinationChainId: DEST_CHAIN_ID,
    amount,
    recipient,
  };

  const { data } = await axios.get(url, { params, timeout: 15000 });

  return {
    quoteId:        data.timestamp?.toString() || Date.now().toString(),
    totalFee:       data.totalRelayFee?.total || '0',
    relayFee:       data.relayFee?.total || '0',
    estimatedOutput: data.expectedFillTime
      ? (BigInt(amount) - BigInt(data.totalRelayFee?.total || '0')).toString()
      : null,
    estimatedFeeUsd: data.totalRelayFee?.pct || '0',
    estimatedTime:   data.expectedFillTime || 300,
    limits:          data.limits || {},
    provider:        'across',
    raw:             data,
  };
}

/**
 * Build + sign the SpokePool.deposit() calldata for the sweep transaction.
 * The sweep service signs and broadcasts this from the intake address.
 *
 * @returns {Promise<{to, data, value}>} — unsigned tx fields
 */
async function buildDepositCalldata({ fromChainId, inputToken, outputToken, amount, recipient, quoteTimestamp }) {
  const spokePool = SPOKE_POOLS[fromChainId];
  if (!spokePool) throw new Error(`[Across] No SpokePool for chainId ${fromChainId}`);

  const iface = new ethers.Interface([
    'function deposit(address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes calldata message)',
  ]);

  const fillDeadline = Math.floor(Date.now() / 1000) + 21600; // +6 hours
  const data = iface.encodeFunctionData('deposit', [
    recipient,
    inputToken,
    outputToken || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    amount,
    0,                     // outputAmount = 0 (relayer fills best-effort)
    DEST_CHAIN_ID,
    ethers.ZeroAddress,    // no exclusive relayer
    quoteTimestamp || Math.floor(Date.now() / 1000),
    fillDeadline,
    0,                     // no exclusivity deadline
    '0x',                  // no message
  ]);

  return { to: spokePool, data, value: '0x0' };
}

/**
 * Poll deposit fill status.
 * @param {string} depositTxHash - the source-chain deposit tx hash
 * @param {number} fromChainId
 */
async function getStatus(depositTxHash, fromChainId) {
  try {
    const { data } = await axios.get(`${BASE_URL}/deposit/status`, {
      params: { depositTxHash, originChainId: fromChainId },
      timeout: 10000,
    });
    return {
      status:       mapStatus(data.status),
      fillTxHash:   data.fillTx || null,
      destChainId:  DEST_CHAIN_ID,
      provider:     'across',
      raw:          data,
    };
  } catch (err) {
    return { status: 'pending', error: err.message, provider: 'across' };
  }
}

function mapStatus(s) {
  if (!s) return 'pending';
  const l = s.toLowerCase();
  if (l === 'filled')  return 'completed';
  if (l === 'expired' || l === 'failed') return 'failed';
  return 'pending';
}

module.exports = { getQuote, buildDepositCalldata, getStatus, SPOKE_POOLS, DEST_CHAIN_ID };
