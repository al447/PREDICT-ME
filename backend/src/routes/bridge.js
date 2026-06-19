/**
 * routes/bridge.js — Bridge API router
 * Mounted at /api/bridge in server.js
 */

const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const { ensureUserDepositAddresses } = require('../services/depositAddresses');
const { getQuote: getWithdrawQuote, executeWithdrawal } = require('../services/withdrawService');
const BridgeDeposit    = require('../models/BridgeDeposit');
const BridgeWithdrawal = require('../models/BridgeWithdrawal');

// Auth middleware — reuse existing pattern
const { protect: authenticate } = require('../middleware/auth');

// Rate limiter for withdraw
const withdrawLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      5,
  message:  { error: 'Too many withdrawal requests — please wait a minute' },
});

// ── Supported assets config (mainnet only) ───────────────────────────────────

// Polymarket-compatible withdrawal chains
// Source: https://docs.polymarket.com/trading/bridge/supported-assets
const SUPPORTED_CHAINS = [
  // Native settlement chain
  { chainId: 137,   chainType: 'evm', name: 'Polygon',     symbol: 'POL',  minDepositUsd: 1,  tokens: ['USDC'], isNative: true },
  // EVM L1/L2 chains (via Across Protocol)
  { chainId: 1,     chainType: 'evm', name: 'Ethereum',    symbol: 'ETH',  minDepositUsd: 7,  tokens: ['USDC', 'ETH'] },
  { chainId: 8453,  chainType: 'evm', name: 'Base',        symbol: 'ETH',  minDepositUsd: 2,  tokens: ['USDC', 'ETH'] },
  { chainId: 42161, chainType: 'evm', name: 'Arbitrum',    symbol: 'ETH',  minDepositUsd: 2,  tokens: ['USDC', 'ETH'] },
  { chainId: 10,    chainType: 'evm', name: 'Optimism',    symbol: 'ETH',  minDepositUsd: 2,  tokens: ['USDC', 'ETH'] },
  // Non-EVM chains
  { chainId: null,  chainType: 'svm', name: 'Solana',      symbol: 'SOL',  minDepositUsd: 2,  tokens: ['USDC', 'SOL'] },
  { chainId: null,  chainType: 'btc', name: 'Bitcoin',     symbol: 'BTC',  minDepositUsd: 9,  tokens: ['BTC'] },
];

/**
 * GET /api/bridge/supported-assets
 * Returns the list of supported chains and tokens for deposit/withdrawal.
 * Public — no auth required.
 */
router.get('/supported-assets', (req, res) => {
  // withdrawDebitAddress = the operator wallet the user's Safe is debited to
  // (proxy → operator) before the operator bridges to the destination chain.
  // The frontend uses it as the `recipient` when preparing/signing the Safe tx.
  let withdrawDebitAddress = null;
  try {
    withdrawDebitAddress = require('../config/contracts').getOperatorAddress();
  } catch { /* operator key not configured */ }

  res.json({
    success: true,
    chains: SUPPORTED_CHAINS,
    settlementToken: 'USDC',
    settlementChain: 'Polygon',
    settlementChainId: 137,
    withdrawDebitAddress,
    isTestnet: false,
  });
});

/**
 * GET /api/bridge/deposit-addresses
 * Returns { evm, solana, btc } for the authenticated user.
 * Lazily derives and persists if not yet assigned.
 */
router.get('/deposit-addresses', authenticate, async (req, res, next) => {
  try {
    const addresses = await ensureUserDepositAddresses(req.user);
    res.json({ success: true, addresses });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/bridge/status/:depositId
 * Returns the BridgeDeposit lifecycle status for a deposit.
 */
router.get('/status/:depositId', authenticate, async (req, res, next) => {
  try {
    const deposit = await BridgeDeposit.findOne({
      _id:    req.params.depositId,
      userId: req.user._id,
    }).lean();

    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/bridge/deposits
 * List user's recent deposits (last 20).
 */
router.get('/deposits', authenticate, async (req, res, next) => {
  try {
    const deposits = await BridgeDeposit.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ success: true, deposits });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bridge/quote
 * Get a withdrawal quote (bridge fee preview).
 * Body: { fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr }
 */
router.post('/quote', authenticate, async (req, res, next) => {
  try {
    const { fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr } = req.body;

    if (!fromAmountUsdc || !toChainType || !recipientAddr) {
      return res.status(400).json({ error: 'Missing required fields: fromAmountUsdc, toChainType, recipientAddr' });
    }

    const quote = await getWithdrawQuote({
      fromAmountUsdc: parseFloat(fromAmountUsdc),
      toChainType,
      toChainId:      toChainId ? parseInt(toChainId) : null,
      toToken:        toToken || 'USDC',
      recipientAddr,
    });

    res.json({ success: true, quote });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bridge/withdraw
 * Execute a withdrawal.
 * Body: { fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr, provider? }
 */
router.post('/withdraw', authenticate, withdrawLimiter, async (req, res, next) => {
  try {
    const { fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr, provider, userSignature } = req.body;

    if (!fromAmountUsdc || !toChainType || !recipientAddr) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!userSignature) {
      return res.status(400).json({ error: 'Missing userSignature — sign the Safe authorization to debit your wallet.' });
    }

    const result = await executeWithdrawal(req.user._id.toString(), {
      fromAmountUsdc: parseFloat(fromAmountUsdc),
      userSignature,
      toChainType,
      toChainId:      toChainId ? parseInt(toChainId) : null,
      toToken:        toToken || 'USDC',
      recipientAddr,
      provider:       provider || 'across',
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/bridge/withdrawals
 * List user's recent withdrawals (last 20).
 */
router.get('/withdrawals', authenticate, async (req, res, next) => {
  try {
    const withdrawals = await BridgeWithdrawal.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ success: true, withdrawals });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
