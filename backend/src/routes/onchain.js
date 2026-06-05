/**
 * On-Chain API Routes
 * Read operations for market/position data; status check
 */

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const onchainService = require('../services/onchainService');
const walletService = require('../services/walletService');
const withdrawalService = require('../services/withdrawalService');
const Market = require('../models/Market');
const { protect: authenticate } = require('../middleware/auth');
const { adminAuth: requireAdmin } = require('../middleware/adminAuth');

// Helper for async route error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation error handler
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

/**
 * GET /api/onchain/status
 * Returns on-chain connectivity status and addresses
 */
router.get('/status', asyncHandler(async (req, res) => {
  const status = await onchainService.getChainStatus();
  res.json({ success: true, status });
}));

/**
 * GET /api/onchain/usdc/balance/:address
 * Get USDC balance for an address
 */
router.get(
  '/usdc/balance/:address',
  param('address').isEthereumAddress(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const balance = await onchainService.getUsdcBalance(req.params.address);
    res.json({ success: true, address: req.params.address, balance });
  })
);

/**
 * GET /api/onchain/usdc/allowance/:owner/:spender
 * Get USDC allowance
 */
router.get(
  '/usdc/allowance/:owner/:spender',
  param('owner').isEthereumAddress(),
  param('spender').isEthereumAddress(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const allowance = await onchainService.getUsdcAllowance(
      req.params.owner,
      req.params.spender
    );
    res.json({
      success: true,
      owner: req.params.owner,
      spender: req.params.spender,
      allowance,
    });
  })
);

/**
 * GET /api/onchain/market/:conditionId
 * Get on-chain market info by conditionId
 */
router.get(
  '/market/:conditionId',
  param('conditionId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const info = await onchainService.getMarketInfo(req.params.conditionId);
    res.json({ success: true, conditionId: req.params.conditionId, info });
  })
);

/**
 * GET /api/onchain/position/:address/:tokenId
 * Get ERC1155 position balance for an address
 */
router.get(
  '/position/:address/:tokenId',
  param('address').isEthereumAddress(),
  param('tokenId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const balance = await onchainService.getPositionBalance(
      req.params.address,
      req.params.tokenId
    );
    res.json({
      success: true,
      address: req.params.address,
      tokenId: req.params.tokenId,
      balance,
    });
  })
);

/**
 * GET /api/onchain/payouts/:conditionId
 * Get payout info (resolution status)
 */
router.get(
  '/payouts/:conditionId',
  param('conditionId').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const payouts = await onchainService.getConditionPayouts(req.params.conditionId);
    res.json({ success: true, conditionId: req.params.conditionId, payouts });
  })
);

/**
 * GET /api/onchain/wallet/:owner
 * Get predicted proxy and deployed proxy for an owner
 */
router.get(
  '/wallet/:owner',
  param('owner').isEthereumAddress(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const [predicted, deployed] = await Promise.all([
      onchainService.predictWallet(req.params.owner),
      onchainService.proxyOf(req.params.owner),
    ]);
    res.json({
      success: true,
      owner: req.params.owner,
      predicted,
      deployed: deployed === '0x0000000000000000000000000000000000000000' ? null : deployed,
    });
  })
);

/**
 * GET /api/onchain/my-wallet
 * Provision + return the authenticated user's Gnosis Safe proxy address.
 * Predicts the address (no gas) on first call, then returns cached value.
 * Also returns on-chain USDC balance of the Safe.
 */
router.get(
  '/my-wallet',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user;
    const ownerAddress = user.walletAddress;
    if (!ownerAddress) {
      return res.status(400).json({
        success: false,
        error: 'No wallet address associated with this account. Connect a wallet first.',
      });
    }

    const wallet = await walletService.ensureSmartWallet(user, ownerAddress);
    let balance = 0;
    try {
      balance = await walletService.getSmartWalletBalance(wallet.proxy);
    } catch {
      // balance read can fail if Safe not yet deployed — return 0
    }

    res.json({
      success: true,
      owner:    wallet.owner,
      proxy:    wallet.proxy,
      deployed: wallet.deployed,
      balance,
    });
  })
);

/**
 * POST /api/onchain/my-wallet/deploy
 * Deploy the user's Safe on-chain (relayer pays gas).
 * Idempotent — safe to call multiple times.
 */
router.post(
  '/my-wallet/deploy',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user.walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'No wallet address associated with this account.',
      });
    }

    const result = await walletService.ensureSmartWalletDeployed(user);
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/onchain/market (Admin only)
 * Create market on-chain via MarketFactory
 * Body: { ancillaryData, rewardToken, reward, proposalBond, liveness, useNegRisk }
 */
router.post(
  '/market',
  authenticate,
  requireAdmin,
  body('ancillaryData').isString().notEmpty(),
  body('rewardToken').isEthereumAddress(),
  body('reward').optional().isString(),
  body('proposalBond').optional().isString(),
  body('liveness').optional().isInt(),
  body('useNegRisk').optional().isBoolean(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const result = await onchainService.createMarketOnChain({
      ancillaryData: req.body.ancillaryData,
      rewardToken: req.body.rewardToken,
      reward: req.body.reward || '0',
      proposalBond: req.body.proposalBond || (100 * 1e6).toString(),
      liveness: req.body.liveness || 7200,
      useNegRisk: req.body.useNegRisk || false,
    });
    res.json({ success: true, result });
  })
);

/**
 * GET /api/onchain/positions/:conditionId/redeemable
 * Check if user has redeemable CTF positions for a resolved market.
 * Uses user's Safe proxy from DB, falling back to walletAddress.
 */
router.get(
  '/positions/:conditionId/redeemable',
  authenticate,
  param('conditionId').isHexadecimal().isLength({ min: 64, max: 66 }),
  handleValidation,
  asyncHandler(async (req, res) => {
    const userAddress = req.user.smartWallet?.proxy || req.user.walletAddress;
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'No wallet address for user' });
    }
    const result = await onchainService.getRedeemablePositions(req.params.conditionId, userAddress);
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/onchain/positions/:conditionId/redeem
 * Redeem resolved positions gaslessly (operator sponsors tx).
 * Body: (none required — user identified from JWT, wallet from DB)
 */
router.post(
  '/positions/:conditionId/redeem',
  authenticate,
  param('conditionId').isHexadecimal().isLength({ min: 64, max: 66 }),
  handleValidation,
  asyncHandler(async (req, res) => {
    const userAddress = req.user.smartWallet?.proxy || req.user.walletAddress;
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'No wallet address for user' });
    }
    const result = await onchainService.redeemPositions(req.params.conditionId, userAddress);
    res.json({ success: true, ...result });
  })
);

/**
 * GET /api/onchain/markets/pending (Admin only)
 * List DB markets that have not yet been published on-chain.
 */
router.get(
  '/markets/pending',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const markets = await Market.find({ onChain: { $ne: true } })
      .select('_id title question category negRisk createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: markets.length, markets });
  })
);

/**
 * POST /api/onchain/market/:marketId/publish (Admin only)
 * Publish a single DB market on-chain via MarketFactory.
 * Stores conditionId, token0, token1, onChainTxHash back to DB.
 */
router.post(
  '/market/:marketId/publish',
  requireAdmin,
  param('marketId').isMongoId(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const market = await Market.findById(req.params.marketId);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    if (market.onChain) {
      return res.json({
        success: true,
        message: 'Already on-chain',
        conditionId: market.conditionId,
        token0: market.token0,
        token1: market.token1,
      });
    }

    const title = market.title || market.question || market._id.toString();
    const ancillaryData = ethers.hexlify(ethers.toUtf8Bytes(
      `title: "${title}", description: "${market.description || ''}", source: polybet365`
    ));

    const result = await onchainService.createMarketOnChain({
      ancillaryData,
      rewardToken:   process.env.MOCK_USDC_ADDRESS,
      reward:        '0',
      proposalBond:  (100 * 1e6).toString(),
      liveness:      7200,
      useNegRisk:    !!market.negRisk,
    });

    await Market.findByIdAndUpdate(market._id, {
      conditionId:   result.conditionId   || null,
      questionId:    result.questionId    || null,
      token0:        result.token0        || null,
      token1:        result.token1        || null,
      onChainTxHash: result.transactionHash || null,
      onChain:       true,
    });

    res.json({ success: true, marketId: market._id, result });
  })
);

/**
 * POST /api/onchain/withdraw/prepare
 * Return EIP-712 payload for user to sign a USDC withdrawal from their Safe.
 * Body: { recipient, amount }
 */
router.post(
  '/withdraw/prepare',
  authenticate,
  body('recipient').isEthereumAddress(),
  body('amount').isFloat({ min: 0.000001 }),
  handleValidation,
  asyncHandler(async (req, res) => {
    const safeAddress = req.user.smartWallet?.proxy;
    if (!safeAddress) {
      return res.status(400).json({ success: false, error: 'No smart wallet provisioned for this user' });
    }
    const payload = await withdrawalService.prepareWithdrawal(
      safeAddress,
      req.body.recipient,
      parseFloat(req.body.amount)
    );
    res.json({ success: true, safeAddress, ...payload });
  })
);

/**
 * POST /api/onchain/withdraw/exec
 * Execute a signed USDC withdrawal. Relayer pays gas.
 * Body: { recipient, amount, userSignature }
 */
router.post(
  '/withdraw/exec',
  authenticate,
  body('recipient').isEthereumAddress(),
  body('amount').isFloat({ min: 0.000001 }),
  body('userSignature').isString().notEmpty(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const safeAddress = req.user.smartWallet?.proxy;
    if (!safeAddress) {
      return res.status(400).json({ success: false, error: 'No smart wallet provisioned for this user' });
    }
    const result = await withdrawalService.executeWithdrawal(
      safeAddress,
      req.body.recipient,
      parseFloat(req.body.amount),
      req.body.userSignature
    );
    res.json({ success: true, ...result });
  })
);

module.exports = router;
