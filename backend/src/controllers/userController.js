const User = require('../models/User');
const Trade = require('../models/Trade');
const Market = require('../models/Market');
const PendingDeposit = require('../models/PendingDeposit');
const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');
const balanceSyncService = require('../services/balanceSyncService');
const withdrawalService = require('../services/withdrawalService');

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
    const tradeCount = await Trade.countDocuments({ user: req.user._id });
    const openTrades = await Trade.find({ user: req.user._id, status: 'open' })
      .populate('market', 'outcomes');

    let portfolioValue = 0;
    let totalInvested = 0;
    openTrades.forEach((trade) => {
      if (trade.market && trade.market.outcomes) {
        const outcomeObj = trade.market.outcomes.find(
          (o) => o.name.toLowerCase() === trade.outcome.toLowerCase()
        );
        if (outcomeObj) {
          portfolioValue += trade.shares * (outcomeObj.price / 100);
        }
      }
      totalInvested += trade.amount;
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        onchainBalance: user.onchainBalance,
        onchainBalanceSyncedAt: user.onchainBalanceSyncedAt,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
        smartWallet: user.smartWallet
          ? {
              proxy:         user.smartWallet.proxy,
              proxyType:     user.smartWallet.proxyType,
              signatureType: user.smartWallet.signatureType,
              deployed:      user.smartWallet.deployed,
              chainId:       user.smartWallet.chainId,
            }
          : null,
      },
      stats: {
        tradeCount,
        portfolioValue: Math.round(portfolioValue),
        totalInvested,
        totalPnL: Math.round(portfolioValue - totalInvested),
        openPositions: openTrades.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getPositions = async (req, res, next) => {
  try {
    const trades = await Trade.find({ user: req.user._id, status: 'open' })
      .populate('market', 'title slug outcomes categorySlug');

    const positionsMap = {};
    trades.forEach((trade) => {
      const key = `${trade.market._id}-${trade.outcome}`;
      if (!positionsMap[key]) {
        positionsMap[key] = {
          market: trade.market,
          outcome: trade.outcome,
          totalShares: 0,
          totalAmount: 0,
          avgPrice: 0,
          currentPrice: 0,
          currentValue: 0,
          unrealizedPnL: 0,
        };
      }
      positionsMap[key].totalShares += trade.shares;
      positionsMap[key].totalAmount += trade.amount;
    });

    const positions = Object.values(positionsMap).map((pos) => {
      const outcomeObj = pos.market.outcomes?.find(
        (o) => o.name.toLowerCase() === pos.outcome.toLowerCase()
      );
      pos.avgPrice = pos.totalShares > 0 ? pos.totalAmount / pos.totalShares : 0;
      pos.currentPrice = outcomeObj ? outcomeObj.price : 0;
      pos.currentValue = pos.totalShares * (pos.currentPrice / 100);
      pos.unrealizedPnL = pos.currentValue - pos.totalAmount;
      return pos;
    });

    res.json({ success: true, positions });
  } catch (error) {
    next(error);
  }
};

const toggleFavorite = async (req, res, next) => {
  try {
    const { marketId } = req.params;
    const user = await User.findById(req.user._id);
    const market = await Market.findById(marketId);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const idx = user.favorites.indexOf(marketId);
    let isFavorited;
    if (idx === -1) {
      user.favorites.push(marketId);
      isFavorited = true;
    } else {
      user.favorites.splice(idx, 1);
      isFavorited = false;
    }
    await user.save();
    res.json({ success: true, isFavorited, favorites: user.favorites });
  } catch (error) {
    next(error);
  }
};

const getFavorites = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'favorites',
      populate: { path: 'category', select: 'name slug icon' },
    });
    res.json({ success: true, favorites: user.favorites });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/deposit
 * Proxy-wallet deposit acknowledgement.
 *
 * The user sends USDC directly to their proxy wallet address on-chain.
 * This endpoint:
 *   1. Ensures the user has a provisioned proxy wallet
 *   2. Verifies the USDC Transfer event went TO the user's proxy (not platform wallet)
 *   3. Syncs the on-chain balance → User.balance cache
 *   4. Records the deposit for dedup
 *
 * NO manual $inc — the balance is always read from chain (via balanceSyncService).
 */
const deposit = async (req, res, next) => {
  try {
    const { amount, txHash } = req.body;
    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount < 1 || depositAmount > 100000) {
      return res.status(400).json({ success: false, error: 'Amount must be between $1 and $100,000' });
    }
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return res.status(400).json({ success: false, error: 'A valid transaction hash is required' });
    }

    const normalizedTxHash = txHash.toLowerCase();

    const existingDeposit = await PendingDeposit.findOne({ txHash: normalizedTxHash });
    if (existingDeposit) {
      return res.status(409).json({ success: false, error: 'This transaction has already been credited' });
    }

    const user = await User.findById(req.user._id);

    // Ensure proxy wallet is provisioned (predict address, no deploy)
    let proxyAddress;
    try {
      const wallet = await walletService.ensureSmartWallet(user);
      proxyAddress = wallet.proxy;
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Could not resolve proxy wallet: ' + err.message });
    }

    // Verify the USDC transfer on-chain
    let netAmount = 0;
    try {
      const { ethers } = require('ethers');
      const UsdcABI = [
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'function decimals() view returns (uint8)',
      ];
      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) return res.status(400).json({ success: false, error: 'Transaction not found' });
      if (receipt.status !== 1) return res.status(400).json({ success: false, error: 'Transaction failed on-chain' });

      const usdcAddr = (process.env.USDC_ADDRESS || process.env.MOCK_USDC_ADDRESS || '').toLowerCase();
      const usdcContract = new ethers.Contract(process.env.USDC_ADDRESS || process.env.MOCK_USDC_ADDRESS, UsdcABI, provider);

      let matched = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== usdcAddr) continue;
        let parsed;
        try { parsed = usdcContract.interface.parseLog(log); } catch { continue; }
        if (parsed.name !== 'Transfer') continue;
        if (parsed.args[1] && parsed.args[1].toLowerCase() === proxyAddress.toLowerCase()) {
          matched = parsed;
          break;
        }
      }

      if (!matched) {
        return res.status(400).json({
          success: false,
          error: `No USDC transfer to your proxy wallet (${proxyAddress}) found in this transaction`,
        });
      }

      let decimals = 6;
      try { decimals = Number(await usdcContract.decimals()); } catch {}
      const scale = 10 ** decimals;
      const value = matched.args[2];
      const expectedAmount = BigInt(Math.round(depositAmount * scale));
      const diff = value > expectedAmount ? value - expectedAmount : expectedAmount - value;
      if (diff > 1n) {
        return res.status(400).json({
          success: false,
          error: `Amount mismatch. Expected: ${depositAmount} USDC, Got: ${(Number(value) / scale).toFixed(decimals)} USDC`,
        });
      }

      netAmount = Math.round(depositAmount * 100) / 100;
      console.log(`[Deposit] Verified ${netAmount} USDC → proxy ${proxyAddress}, tx: ${normalizedTxHash}`);

    } catch (e) {
      console.error('[Deposit] Verification error:', e);
      return res.status(400).json({ success: false, error: 'Transaction verification failed: ' + e.message });
    }

    // Sync balance from chain — applies the on-chain deposit delta to User.balance.
    await balanceSyncService.syncUser(user);
    const refreshed = await User.findById(user._id).select('balance');
    const newBalance = refreshed?.balance ?? user.balance;

    // Record deposit to permanently block txHash replay
    await PendingDeposit.create({
      user: user._id,
      chain: 'polygon',
      token: 'USDC',
      txHash: normalizedTxHash,
      claimedAmountUsd: netAmount,
      status: 'credited',
      source: 'proxy-verified',
      creditedAmountUsd: netAmount,
    });

    try {
      await Transaction.create({
        user: user._id,
        type: 'deposit',
        amount: netAmount,
        balance: newBalance,
        status: 'completed',
        metadata: { txHash: normalizedTxHash, proxyAddress },
      });
    } catch (txErr) {
      console.error('[Deposit] Transaction record failed:', txErr.message);
    }

    res.json({
      success: true,
      deposit: {
        amount: depositAmount,
        fee: 0,
        net: netAmount,
        method: 'crypto',
        currency: 'USDC',
        status: 'verified',
        txHash: normalizedTxHash,
        proxyAddress,
        timestamp: new Date().toISOString(),
      },
      newBalance,
    });
  } catch (error) {
    console.error('[Deposit] Error:', error);
    next(error);
  }
};

// Configurable limits — override via env vars in production
const WITHDRAW_DAILY_LIMIT_USD = parseFloat(process.env.WITHDRAW_DAILY_LIMIT_USD) || 10000;
const WITHDRAW_COOLDOWN_MS = (parseInt(process.env.WITHDRAW_COOLDOWN_SECONDS, 10) || 60) * 1000;
const WITHDRAW_MAX_SINGLE_USD = parseFloat(process.env.WITHDRAW_MAX_SINGLE_USD) || 100000;

/**
 * POST /api/users/withdraw
 * Non-custodial proxy withdrawal (compatibility shim).
 *
 * When ONCHAIN_ENABLED=true AND LEGACY_WITHDRAW!=true → 410 Gone.
 * Clients must migrate to POST /api/onchain/withdraw/prepare + /exec.
 */
const withdraw = async (req, res, next) => {
  if (process.env.ONCHAIN_ENABLED === 'true' && process.env.LEGACY_WITHDRAW !== 'true') {
    return res.status(410).json({
      success: false,
      error: 'This endpoint is deprecated. Use POST /api/onchain/withdraw/prepare then /api/onchain/withdraw/exec.',
      migrateToRoutes: ['/api/onchain/withdraw/prepare', '/api/onchain/withdraw/exec'],
    });
  }
  try {
    const { amount, toAddress, signedTx, signature } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount < 1) {
      return res.status(400).json({ success: false, error: 'Minimum withdrawal is $1' });
    }
    if (withdrawAmount > WITHDRAW_MAX_SINGLE_USD) {
      return res.status(400).json({ success: false, error: `Maximum single withdrawal is $${WITHDRAW_MAX_SINGLE_USD.toLocaleString()}` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Rate-limit checks
    const now = new Date();
    if (user.withdrawalLimits?.lastWithdrawAt) {
      const msSinceLast = now - new Date(user.withdrawalLimits.lastWithdrawAt);
      if (msSinceLast < WITHDRAW_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((WITHDRAW_COOLDOWN_MS - msSinceLast) / 1000);
        return res.status(429).json({ success: false, error: `Please wait ${secondsLeft}s before making another withdrawal` });
      }
    }

    const limits = user.withdrawalLimits || {};
    const windowStart = limits.dailyResetAt ? new Date(limits.dailyResetAt) : null;
    const windowExpired = !windowStart || (now - windowStart) >= 24 * 60 * 60 * 1000;
    const dailyUsed = windowExpired ? 0 : (limits.dailyTotal || 0);
    if (dailyUsed + withdrawAmount > WITHDRAW_DAILY_LIMIT_USD) {
      const remaining = Math.max(0, WITHDRAW_DAILY_LIMIT_USD - dailyUsed);
      return res.status(429).json({
        success: false,
        error: `Daily withdrawal limit reached. $${remaining.toFixed(2)} remaining today.`,
        dailyLimit: WITHDRAW_DAILY_LIMIT_USD, dailyUsed, remaining,
      });
    }

    // Proxy must be provisioned
    const wallet = await walletService.ensureSmartWallet(user);
    if (!wallet.proxy) {
      return res.status(400).json({ success: false, error: 'No proxy wallet provisioned' });
    }

    const destination = toAddress || user.walletAddress;
    if (!destination) {
      return res.status(400).json({ success: false, error: 'No destination address provided' });
    }

    // Execute via withdrawalService (relayer-assisted proxy tx)
    let result;
    try {
      result = await withdrawalService.executeWithdrawal({
        user,
        proxyAddress: wallet.proxy,
        toAddress: destination,
        amount: withdrawAmount,
        signedTx,
        signature,
      });
    } catch (err) {
      console.error('[Withdraw] withdrawalService.executeWithdrawal failed:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }

    // Sync balance from chain — applies the on-chain withdrawal delta to User.balance.
    await balanceSyncService.syncUser(user).catch(() => {});
    const refreshed = await User.findById(user._id).select('balance');
    const newBalance = refreshed?.balance ?? user.balance;

    // Update rate-limit counters
    await User.findByIdAndUpdate(user._id, windowExpired
      ? { 'withdrawalLimits.lastWithdrawAt': now, 'withdrawalLimits.dailyResetAt': now, 'withdrawalLimits.dailyTotal': withdrawAmount }
      : { 'withdrawalLimits.lastWithdrawAt': now, $inc: { 'withdrawalLimits.dailyTotal': withdrawAmount } }
    );

    await Transaction.create({
      user: user._id,
      type: 'withdrawal',
      amount: -withdrawAmount,
      balance: newBalance,
      status: 'completed',
      metadata: { txHash: result.txHash, toAddress: destination, proxyAddress: wallet.proxy },
    }).catch(err => console.error('[Withdraw] Transaction record failed:', err.message));

    const newDailyUsed = windowExpired ? withdrawAmount : dailyUsed + withdrawAmount;
    return res.json({
      success: true,
      withdrawal: {
        amount: withdrawAmount,
        fee: 0,
        net: withdrawAmount,
        currency: 'USDC',
        toAddress: destination,
        txHash: result.txHash,
        status: 'completed',
        timestamp: new Date().toISOString(),
      },
      newBalance,
      withdrawalLimits: {
        dailyUsed: newDailyUsed,
        dailyLimit: WITHDRAW_DAILY_LIMIT_USD,
        remainingToday: Math.max(0, WITHDRAW_DAILY_LIMIT_USD - newDailyUsed),
      },
    });
  } catch (error) {
    console.error('[Withdraw] Unexpected error:', error);
    next(error);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { user: req.user._id };
    if (type && type !== 'all') filter.type = type;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      transactions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { username, email, avatar } = req.body;
    const updates = {};

    if (username !== undefined) {
      const trimmed = username.trim();
      if (trimmed.length < 2 || trimmed.length > 30) {
        return res.status(400).json({ success: false, error: 'Username must be 2–30 characters' });
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
        return res.status(400).json({ success: false, error: 'Username may only contain letters, numbers, _, . and -' });
      }
      // Check uniqueness (case-insensitive), excluding current user
      const taken = await User.findOne({ username: { $regex: `^${trimmed}$`, $options: 'i' }, _id: { $ne: req.user._id } });
      if (taken) {
        return res.status(409).json({ success: false, error: 'Username already taken' });
      }
      updates.username = trimmed;
    }

    if (email !== undefined) {
      if (email !== '') {
        const trimmedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          return res.status(400).json({ success: false, error: 'Invalid email address' });
        }
        const taken = await User.findOne({ email: trimmedEmail, _id: { $ne: req.user._id } });
        if (taken) {
          return res.status(409).json({ success: false, error: 'Email already linked to another account' });
        }
        updates.email = trimmedEmail;
      }
    }

    if (avatar !== undefined) {
      updates.avatar = avatar.trim().slice(0, 500);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-__v');

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProfile, updateProfile, getPositions, toggleFavorite, getFavorites, deposit, withdraw, getTransactions };
