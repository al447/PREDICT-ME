const User = require('../models/User');
const Trade = require('../models/Trade');
const Market = require('../models/Market');
const PendingDeposit = require('../models/PendingDeposit');
const Transaction = require('../models/Transaction');

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
        authProvider: user.authProvider,
        createdAt: user.createdAt,
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
 * Verify on-chain USDT transfer from user to platform wallet, then credit balance.
 * Frontend sends txHash after user confirms MetaMask transfer.
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

    // Normalize to lowercase so dedup is robust across hex casing and consistent with
    // the /api/deposits/claim path + the indexer (all lowercase). Without this, the same
    // on-chain tx submitted with different casing to each endpoint bypasses the unique
    // index and double-credits the user.
    const normalizedTxHash = txHash.toLowerCase();

    // CRITICAL: Reject duplicate txHash — prevents double-credit replay attacks
    const existingDeposit = await PendingDeposit.findOne({ txHash: normalizedTxHash });
    if (existingDeposit) {
      return res.status(409).json({ success: false, error: 'This transaction has already been credited' });
    }

    const user = await User.findById(req.user._id);

    // CRITICAL: Verify the actual USDT transfer on-chain
    let verified = false;
    try {
      const { ethers } = require('ethers');
      // Inline minimal ERC20 ABI (Transfer event) — no external file dependency
      const UsdtABI = [
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return res.status(400).json({ success: false, error: 'Transaction not found' });
      }
      
      if (receipt.status !== 1) {
        return res.status(400).json({ success: false, error: 'Transaction failed' });
      }

      // Get the transaction to verify it's a USDT transfer
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        return res.status(400).json({ success: false, error: 'Transaction details not found' });
      }

      // Verify it's a transfer to the correct USDT contract
      if (!tx.to || tx.to.toLowerCase() !== process.env.MOCK_USDT_ADDRESS.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Invalid transaction: not a USDT transfer' });
      }

      if (!process.env.PLATFORM_WALLET) {
        console.log('[Deposit] Error: PLATFORM_WALLET environment variable not set');
        return res.status(500).json({ success: false, error: 'Server configuration error' });
      }
      const platformWallet = process.env.PLATFORM_WALLET.toLowerCase();
      const usdtContract = new ethers.Contract(process.env.MOCK_USDT_ADDRESS, UsdtABI, provider);

      // Find the Transfer event emitted by the USDT contract whose recipient is the
      // platform wallet. Do NOT assume the first log — a tx can emit many Transfers,
      // and only the one crediting the platform wallet is valid.
      let matched = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== process.env.MOCK_USDT_ADDRESS.toLowerCase()) continue;
        let parsed;
        try { parsed = usdtContract.interface.parseLog(log); } catch { continue; }
        if (parsed.name !== 'Transfer') continue;
        if (parsed.args[1] && parsed.args[1].toLowerCase() === platformWallet) {
          matched = parsed;
          break;
        }
      }

      if (!matched) {
        return res.status(400).json({ success: false, error: 'No USDT transfer to the platform wallet found in this transaction' });
      }

      const from = matched.args[0];
      const to = matched.args[1];
      const value = matched.args[2];

      // Verify the transfer amount matches the token's ACTUAL decimals (don't hardcode 6).
      let decimals = 6;
      try { decimals = Number(await usdtContract.decimals()); } catch { /* default to 6 */ }
      const scale = 10 ** decimals;
      // ±1 base-unit tolerance to avoid float→BigInt rounding false rejects
      const expectedAmount = BigInt(Math.round(depositAmount * scale));
      const diff = value > expectedAmount ? value - expectedAmount : expectedAmount - value;
      if (diff > 1n) {
        return res.status(400).json({ 
          success: false, 
          error: `Transfer amount mismatch. Expected: ${depositAmount} USDT, Got: ${(Number(value) / scale).toFixed(decimals)} USDT` 
        });
      }

      // Verify the sender is the user (if they have a wallet address linked)
      if (user.walletAddress && from.toLowerCase() !== user.walletAddress.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Transfer sender does not match your wallet address' });
      }

      verified = true;
      // Avoid logging wallet addresses (log hygiene) — amount + tx hash are sufficient.
      console.log(`[Deposit] Verified ${depositAmount} USDT, tx: ${normalizedTxHash}`);
      
    } catch (e) {
      console.error('[Deposit] Verification error:', e);
      return res.status(400).json({ success: false, error: 'Transaction verification failed: ' + e.message });
    }

    if (!verified) {
      return res.status(400).json({ success: false, error: 'Transaction could not be verified' });
    }

    // Only credit balance after successful verification
    const netAmount = Math.round(depositAmount * 100) / 100;
    user.balance += netAmount;
    await user.save();

    // Record deposit to permanently block txHash replay (lowercase — see normalizedTxHash)
    await PendingDeposit.create({
      user: user._id,
      chain: 'polygon',
      token: 'USDT',
      txHash: normalizedTxHash,
      claimedAmountUsd: netAmount,
      status: 'credited',
      source: 'auto-verified',
      creditedAmountUsd: netAmount,
    });

    // Write Transaction audit record
    try {
      await Transaction.create({
        user: user._id,
        type: 'deposit',
        amount: netAmount,
        balance: user.balance,
        status: 'completed',
        metadata: { txHash: normalizedTxHash },
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
        currency: 'USDT',
        status: 'verified',
        txHash: normalizedTxHash,
        timestamp: new Date().toISOString(),
      },
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('[Deposit] Error:', error);
    next(error);
  }
};

// Minimal ERC20 ABI — inline so we don't depend on the (deleted) MockUSDT.json file
const ERC20_MIN_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

// Configurable limits — override via env vars in production
const WITHDRAW_DAILY_LIMIT_USD = parseFloat(process.env.WITHDRAW_DAILY_LIMIT_USD) || 10000;
const WITHDRAW_COOLDOWN_MS = (parseInt(process.env.WITHDRAW_COOLDOWN_SECONDS, 10) || 60) * 1000;
const WITHDRAW_MAX_SINGLE_USD = parseFloat(process.env.WITHDRAW_MAX_SINGLE_USD) || 100000;

/**
 * POST /api/users/withdraw
 * Transfer USDT from platform wallet to user's wallet address on-chain.
 *
 * Safety design:
 *   0. Rate-limit: per-request cooldown (60s default) + daily cap ($10k default).
 *   1. Atomic balance deduction FIRST (with concurrency guard). User's balance can
 *      never be over-drawn, even with concurrent calls.
 *   2. Pending Transaction record created BEFORE on-chain tx (audit trail).
 *   3. On-chain transfer executed.
 *   4. On success → mark Transaction completed + update rate-limit counters.
 *   5. On failure → refund balance and mark Transaction failed.
 */
const withdraw = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const withdrawAmount = parseFloat(amount);
    if (!withdrawAmount || withdrawAmount < 1) {
      return res.status(400).json({ success: false, error: 'Minimum withdrawal is $1' });
    }
    if (withdrawAmount > WITHDRAW_MAX_SINGLE_USD) {
      return res.status(400).json({ success: false, error: `Maximum single withdrawal is $${WITHDRAW_MAX_SINGLE_USD.toLocaleString()}` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (!user.walletAddress) {
      return res.status(400).json({ success: false, error: 'No wallet address linked to your account' });
    }

    // STEP 0: Rate-limit checks (read-only, before any mutation)
    const now = new Date();

    // 0a. Per-withdrawal cooldown — prevent rapid-fire withdrawals
    if (user.withdrawalLimits?.lastWithdrawAt) {
      const msSinceLast = now - new Date(user.withdrawalLimits.lastWithdrawAt);
      if (msSinceLast < WITHDRAW_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((WITHDRAW_COOLDOWN_MS - msSinceLast) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${secondsLeft}s before making another withdrawal`,
        });
      }
    }

    // 0b. Daily cap — rolling 24h window
    const limits = user.withdrawalLimits || {};
    const windowStart = limits.dailyResetAt ? new Date(limits.dailyResetAt) : null;
    const windowExpired = !windowStart || (now - windowStart) >= 24 * 60 * 60 * 1000;
    const dailyUsed = windowExpired ? 0 : (limits.dailyTotal || 0);

    if (dailyUsed + withdrawAmount > WITHDRAW_DAILY_LIMIT_USD) {
      const remaining = Math.max(0, WITHDRAW_DAILY_LIMIT_USD - dailyUsed);
      return res.status(429).json({
        success: false,
        error: `Daily withdrawal limit reached. You can withdraw up to $${remaining.toFixed(2)} more today.`,
        dailyLimit: WITHDRAW_DAILY_LIMIT_USD,
        dailyUsed,
        remaining,
      });
    }

    // STEP 1: Atomic balance deduction with concurrency guard.
    // findOneAndUpdate is atomic in Mongo — prevents race conditions on concurrent calls.
    const debited = await User.findOneAndUpdate(
      { _id: user._id, balance: { $gte: withdrawAmount } },
      { $inc: { balance: -withdrawAmount } },
      { new: true }
    );
    if (!debited) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. You have $${user.balance.toFixed(2)}`,
      });
    }

    // STEP 2: Create pending Transaction record (audit trail).
    const Transaction = require('../models/Transaction');
    const txRecord = await Transaction.create({
      user: user._id,
      type: 'withdrawal',
      amount: -withdrawAmount,
      balance: debited.balance,
      status: 'pending',
      metadata: { toAddress: user.walletAddress },
    });

    // STEP 3: Attempt on-chain transfer.
    // submittedTxHash marks the point of no return: once a tx is broadcast we must
    // NOT refund, because the transfer may still mine even if tx.wait() errors.
    let submittedTxHash = null;
    try {
      const { ethers } = require('ethers');

      const rpcUrl = process.env.WITHDRAW_RPC_URL || process.env.POLYGON_AMOY_RPC_URL;
      const tokenAddress = process.env.WITHDRAW_TOKEN_ADDRESS || process.env.MOCK_USDT_ADDRESS;
      const privateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

      if (!rpcUrl || !tokenAddress || !privateKey) {
        throw new Error('Withdrawal not configured (missing RPC / token / signer key)');
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const platformWallet = new ethers.Wallet(privateKey, provider);
      const token = new ethers.Contract(tokenAddress, ERC20_MIN_ABI, platformWallet);

      // Detect token decimals (USDT/USDC = 6, most others = 18)
      let decimals = 6;
      try { decimals = Number(await token.decimals()); } catch { /* fall back to 6 */ }
      const amountWei = ethers.parseUnits(withdrawAmount.toFixed(decimals), decimals);

      // Verify platform liquidity
      const platformBalance = await token.balanceOf(platformWallet.address);
      if (platformBalance < amountWei) {
        throw new Error('Platform liquidity insufficient. Please try a smaller amount or contact support.');
      }

      const tx = await token.transfer(user.walletAddress, amountWei);
      submittedTxHash = tx.hash; // point of no return — tx is now in the mempool
      const receipt = await tx.wait();

      // STEP 4: Mark transaction completed + update rate-limit counters atomically.
      // If the daily window expired (or never started), reset the counter; otherwise increment it.
      await User.findByIdAndUpdate(user._id, windowExpired
        ? { 'withdrawalLimits.lastWithdrawAt': now, 'withdrawalLimits.dailyResetAt': now, 'withdrawalLimits.dailyTotal': withdrawAmount }
        : { 'withdrawalLimits.lastWithdrawAt': now, $inc: { 'withdrawalLimits.dailyTotal': withdrawAmount } }
      );

      txRecord.status = 'completed';
      txRecord.metadata = { ...txRecord.metadata, txHash: receipt.hash };
      await txRecord.save();

      console.log(`[Withdraw] $${withdrawAmount} → ${user.walletAddress}, tx: ${receipt.hash}`);

      const newDailyUsed = windowExpired ? withdrawAmount : dailyUsed + withdrawAmount;
      return res.json({
        success: true,
        withdrawal: {
          amount: withdrawAmount,
          fee: 0,
          net: withdrawAmount,
          currency: 'USDT',
          toAddress: user.walletAddress,
          txHash: receipt.hash,
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
        newBalance: debited.balance,
        withdrawalLimits: {
          dailyUsed: newDailyUsed,
          dailyLimit: WITHDRAW_DAILY_LIMIT_USD,
          remainingToday: Math.max(0, WITHDRAW_DAILY_LIMIT_USD - newDailyUsed),
        },
      });
    } catch (chainErr) {
      // STEP 5: Handle failure.
      // CRITICAL: only refund if the tx was NEVER broadcast. If we have a hash,
      // the transfer may still mine on-chain — refunding would double-pay the user.
      if (submittedTxHash) {
        console.error(`[Withdraw] tx ${submittedTxHash} broadcast but wait() failed — NOT refunding, flagging for review:`, chainErr.message);
        txRecord.status = 'pending';
        txRecord.metadata = {
          ...txRecord.metadata,
          txHash: submittedTxHash,
          needsReview: true,
          error: `Broadcast but confirmation failed: ${chainErr.message}`,
        };
        await txRecord.save();
        // Still update rate-limit counters since funds likely left the platform wallet
        await User.findByIdAndUpdate(user._id, windowExpired
          ? { 'withdrawalLimits.lastWithdrawAt': now, 'withdrawalLimits.dailyResetAt': now, 'withdrawalLimits.dailyTotal': withdrawAmount }
          : { 'withdrawalLimits.lastWithdrawAt': now, $inc: { 'withdrawalLimits.dailyTotal': withdrawAmount } }
        );
        return res.status(202).json({
          success: true,
          pending: true,
          withdrawal: { amount: withdrawAmount, txHash: submittedTxHash, status: 'pending' },
          message: 'Withdrawal broadcast on-chain but confirmation timed out. It is being reviewed — your balance will not be refunded automatically to prevent double-payment.',
          newBalance: debited.balance,
        });
      }

      // Tx was never broadcast — safe to refund.
      console.error('[Withdraw] On-chain transfer failed before broadcast, refunding:', chainErr.message);
      const refunded = await User.findByIdAndUpdate(
        user._id,
        { $inc: { balance: withdrawAmount } },
        { new: true }
      );
      txRecord.status = 'failed';
      txRecord.metadata = { ...txRecord.metadata, error: chainErr.message };
      await txRecord.save();

      const userMsg = chainErr.code === 'INSUFFICIENT_FUNDS'
        ? 'Platform wallet needs gas. Contact admin.'
        : chainErr.message || 'On-chain transfer failed';
      return res.status(500).json({
        success: false,
        error: userMsg,
        newBalance: refunded?.balance ?? debited.balance,
      });
    }
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
