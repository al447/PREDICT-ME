/**
 * Gasless Relayer API Routes
 * For Magic/social users to submit transactions without paying gas
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const relayerService = require('../services/relayerService');
const { protect: authenticate } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

// Helper for async error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation middleware
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

/**
 * GET /api/relayer/status
 * Get relayer status, balance, and configuration
 */
router.get('/status', asyncHandler(async (req, res) => {
  const status = await relayerService.getRelayerStatus();
  res.json({
    success: true,
    status,
    allowedMethods: relayerService.RELAYER_CONFIG.ALLOWED_METHODS,
  });
}));

/**
 * GET /api/relayer/domain
 * Get EIP-712 domain for signing relay requests
 */
router.get('/domain', (req, res) => {
  res.json({
    success: true,
    domain: relayerService.getRelayDomain(),
    types: relayerService.RELAY_TYPES,
  });
});

/**
 * POST /api/relayer/estimate
 * Estimate gas for a relay transaction
 */
router.post(
  '/estimate',
  authenticate,
  [
    body('targetContract').isEthereumAddress(),
    body('method').isString().notEmpty(),
    body('params').isString(), // hex encoded
    handleValidation,
  ],
  asyncHandler(async (req, res) => {
    const estimate = await relayerService.estimateRelayGas({
      targetContract: req.body.targetContract,
      method: req.body.method,
      params: req.body.params,
    });
    res.json({ success: true, estimate });
  })
);

/**
 * POST /api/relayer/submit
 * Submit a signed relay request
 * User signs EIP-712 message authorizing the relayer to execute tx
 */
router.post(
  '/submit',
  authenticate,
  [
    body('userAddress').isEthereumAddress(),
    body('targetContract').isEthereumAddress(),
    body('method').isString().notEmpty(),
    body('params').isString(), // hex encoded params
    body('signature').isString().notEmpty(), // EIP-712 signature
    body('nonce').isInt(), // Unique nonce to prevent replay
    body('deadline').isInt(), // Unix timestamp when signature expires
    handleValidation,
  ],
  asyncHandler(async (req, res) => {
    const request = {
      userAddress: req.body.userAddress.toLowerCase(),
      targetContract: req.body.targetContract.toLowerCase(),
      method: req.body.method,
      params: req.body.params,
      signature: req.body.signature,
      nonce: req.body.nonce,
      deadline: req.body.deadline,
    };

    // Queue the relay request
    const result = await relayerService.queueRelay(request);
    
    res.json({
      success: true,
      message: 'Transaction queued for relay',
      ...result,
    });
  })
);

/**
 * POST /api/relayer/process
 * Admin endpoint: Process relay queue immediately
 * Normally queue processes automatically, but admin can force processing
 */
router.post(
  '/process',
  authenticate,
  adminAuth,
  asyncHandler(async (req, res) => {
    const results = await relayerService.processRelayQueue();
    res.json({
      success: true,
      processed: results.length,
      results,
    });
  })
);

/**
 * POST /api/relayer/safe/prepare
 * Build Safe transaction data for user to sign (EIP-712 domain + message).
 * Body: { safeAddress, to, value?, data }
 * Returns: { domain, types, message } — user calls signTypedData on frontend
 */
router.post(
  '/safe/prepare',
  authenticate,
  [
    body('safeAddress').isEthereumAddress(),
    body('to').isEthereumAddress(),
    body('data').isString(),
    handleValidation,
  ],
  asyncHandler(async (req, res) => {
    const { safeAddress, to, value, data } = req.body;
    const result = await relayerService.buildSafeTxForSigning({
      safeAddress,
      to,
      value: value || '0',
      data: data || '0x',
    });
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/relayer/safe/exec
 * Execute a transaction through user's Gnosis Safe (relayer pays gas).
 * Body: { safeAddress, to, value?, data, userSignature }
 * userSignature = EIP-712 SafeTx signature from the Safe owner
 */
router.post(
  '/safe/exec',
  authenticate,
  [
    body('safeAddress').isEthereumAddress(),
    body('to').isEthereumAddress(),
    body('data').isString(),
    body('userSignature').isString().notEmpty(),
    handleValidation,
  ],
  asyncHandler(async (req, res) => {
    const { safeAddress, to, value, data, userSignature } = req.body;

    // Rate limit by the authenticated user
    const rateCheck = relayerService.checkRateLimit
      ? relayerService.checkRateLimit(req.user.walletAddress || req.user._id.toString())
      : { allowed: true };
    if (rateCheck && !rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Retry after ${rateCheck.retryAfter}s`,
      });
    }

    const result = await relayerService.execSafeTransaction({
      safeAddress,
      to,
      value: value || '0',
      data: data || '0x',
      userSignature,
    });

    res.json({ success: true, ...result });
  })
);

/**
 * GET /api/relayer/estimate-gas-prices
 * Get current gas prices for user to estimate costs
 */
router.get('/gas-prices', asyncHandler(async (req, res) => {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(
    process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com'
  );
  
  const feeData = await provider.getFeeData();
  
  res.json({
    success: true,
    gasPrices: {
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      gasPrice: feeData.gasPrice?.toString(),
    },
  });
}));

module.exports = router;
