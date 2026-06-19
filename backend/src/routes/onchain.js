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
    // Mainnet UMA: native USDC (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359) is whitelisted
    // proposalBond must be >= UMA's finalFee for USDC (typically ~1500 USDC)
    const { ADDRESSES } = require('../config/contracts');
    const nativeUsdc = ADDRESSES.USDC;
    
    const result = await onchainService.createMarketOnChain({
      ancillaryData: req.body.ancillaryData,
      rewardToken: req.body.rewardToken || nativeUsdc,
      reward: req.body.reward || '0',
      proposalBond: req.body.proposalBond || (1500 * 1e6).toString(), // 1500 USDC minimum for mainnet
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
 * POST /api/onchain/market/:marketId/report-payouts (Admin only — TESTNET ONLY)
 * Calls CTF.reportPayouts() via the deployer wallet so that redeemPositions()
 * can pay out USDC to winners. On mainnet this is called automatically by the
 * UmaCtfAdapter after UMA OO resolves. On testnet use this endpoint to test
 * the full redeem flow without needing a live UMA dispute.
 *
 * Body: { outcome: 'yes' | 'no' }
 */
router.post(
  '/market/:marketId/report-payouts',
  requireAdmin,
  param('marketId').isMongoId(),
  body('outcome').isIn(['yes', 'no']),
  handleValidation,
  asyncHandler(async (req, res) => {
    const market = await Market.findById(req.params.marketId).lean();
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    if (!market.questionId) {
      return res.status(400).json({ success: false, error: 'Market has no questionId — publish it on-chain first' });
    }

    const result = await onchainService.reportPayoutsOnChain(market.questionId, req.body.outcome);
    res.json({ success: true, marketId: market._id, ...result });
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
 * GET /api/onchain/markets/status (Admin only)
 * Complete on-chain status report — shows on-chain vs pending markets.
 */
router.get(
  '/markets/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const allMarkets = await Market.find({})
      .select('_id title status onChain conditionId questionId token0 token1 negRisk createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const onChainMarkets = [];
    const pendingMarkets = [];

    for (const m of allMarkets) {
      const isFullyOnChain = m.onChain === true && m.conditionId && m.token0 && m.token1;

      if (isFullyOnChain) {
        onChainMarkets.push({
          _id: m._id.toString(),
          title: m.title,
          status: m.status,
          conditionId: m.conditionId,
          questionId: m.questionId,
          yesTokenId: m.token0,
          noTokenId: m.token1,
          negRisk: m.negRisk,
          createdAt: m.createdAt,
        });
      } else {
        pendingMarkets.push({
          _id: m._id.toString(),
          title: m.title,
          status: m.status,
          onChain: m.onChain,
          hasConditionId: !!m.conditionId,
          hasToken0: !!m.token0,
          hasToken1: !!m.token1,
          missing: [
            !m.conditionId && 'conditionId',
            !m.token0 && 'token0 (yesTokenId)',
            !m.token1 && 'token1 (noTokenId)',
            m.onChain !== true && 'onChain flag',
          ].filter(Boolean),
          createdAt: m.createdAt,
        });
      }
    }

    res.json({
      success: true,
      summary: {
        total: allMarkets.length,
        onChain: onChainMarkets.length,
        pending: pendingMarkets.length,
        onChainPercentage: allMarkets.length > 0
          ? Math.round((onChainMarkets.length / allMarkets.length) * 100)
          : 0,
      },
      onChainMarkets,
      pendingMarkets,
    });
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
    // UMA ancillary data has size limits - keep it concise
    const truncatedTitle = title.slice(0, 200);
    const ancillaryData = ethers.hexlify(ethers.toUtf8Bytes(
      `q: ${truncatedTitle}`
    ));

    // Mainnet UMA: native USDC is whitelisted as reward/collateral
    const { ADDRESSES } = require('../config/contracts');
    const nativeUsdc = ADDRESSES.USDC;
    
    const result = await onchainService.createMarketOnChain({
      ancillaryData,
      rewardToken:   nativeUsdc,
      reward:        '0',
      proposalBond:  (1500 * 1e6).toString(), // 1500 USDC minimum bond for mainnet
      liveness:      7200,
      useNegRisk:    !!market.negRisk,
    });

    await Market.findByIdAndUpdate(market._id, {
      conditionId:   result.conditionId   || null,
      questionId:    result.questionId    || null,
      token0:        result.token0        || null,
      token1:        result.token1        || null,
      onChainTxHash: result.txHash || null,
      onChain:       true,
    });

    res.json({ success: true, marketId: market._id, result });
  })
);

/**
 * POST /api/onchain/markets/migrate (Admin only)
 * Bulk migrate all pending markets to on-chain.
 * Body: { limit?: number, dryRun?: boolean }
 */
router.post(
  '/markets/migrate',
  requireAdmin,
  body('limit').optional().isInt({ min: 1, max: 50 }),
  body('dryRun').optional().isBoolean(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.body.limit || '10', 10);
    const dryRun = req.body.dryRun === true;

    // Find pending markets — only migrate active/pending markets (Polymarket-style)
    // Exclude closed, resolved, cancelled markets as they cannot be traded anyway
    const pendingMarkets = await Market.find({
      $or: [
        { onChain: { $ne: true } },
        { onChain: { $exists: false } },
      ],
      status: { $in: ['active', 'pending'] },
    })
      .select('_id title description negRisk createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (pendingMarkets.length === 0) {
      return res.json({
        success: true,
        message: 'No pending markets found',
        dryRun,
        migrated: 0,
        failed: 0,
        results: [],
      });
    }

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        wouldMigrate: pendingMarkets.length,
        markets: pendingMarkets.map(m => ({
          _id: m._id.toString(),
          title: m.title,
          negRisk: m.negRisk,
        })),
        message: 'Dry run complete. No changes made. Remove dryRun to execute.',
      });
    }

    // Actually migrate
    const results = [];
    let migrated = 0;
    let failed = 0;

    for (const m of pendingMarkets) {
      try {
        const title = m.title || m._id.toString();
        // UMA ancillary data has size limits - keep it concise
        const truncatedTitle = title.slice(0, 200);
        const ancillaryData = ethers.hexlify(ethers.toUtf8Bytes(
          `q: ${truncatedTitle}`
        ));

        // Mainnet UMA: native USDC is whitelisted as reward/collateral
        const { ADDRESSES } = require('../config/contracts');
        const nativeUsdc = ADDRESSES.USDC;
        
        const result = await onchainService.createMarketOnChain({
          ancillaryData,
          rewardToken: nativeUsdc,
          reward: '0',
          proposalBond: (1500 * 1e6).toString(), // 1500 USDC minimum bond for mainnet
          liveness: 7200,
          useNegRisk: !!m.negRisk,
        });

        await Market.findByIdAndUpdate(m._id, {
          conditionId: result.conditionId || null,
          questionId: result.questionId || null,
          token0: result.token0 || null,
          token1: result.token1 || null,
          onChainTxHash: result.txHash || null,
          onChain: true,
        });

        results.push({
          _id: m._id.toString(),
          title: m.title,
          success: true,
          conditionId: result.conditionId,
          txHash: result.txHash,
        });
        migrated++;
      } catch (err) {
        results.push({
          _id: m._id.toString(),
          title: m.title,
          success: false,
          error: err.message,
        });
        failed++;
      }
    }

    res.json({
      success: true,
      dryRun: false,
      migrated,
      failed,
      total: pendingMarkets.length,
      results,
    });
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
