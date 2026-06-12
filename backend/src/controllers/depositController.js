const User = require('../models/User');
const PendingDeposit = require('../models/PendingDeposit');
const { ensureUserDepositAddresses } = require('../services/depositAddresses');
const { getUsdPrice } = require('../services/priceFeed');
const indexer = require('../services/depositIndexer');
const moonpay = require('../services/moonpay');
const { verifyDepositTx, verifyDepositTxAutoDetect } = require('../services/txVerifier');
const bridgeService = require('../services/bridgeService');

/* ─────────────────────────────────────────────
   GET /api/deposits/addresses
   Returns { evm, solana } for the authenticated user.
   Lazy-derives and persists if not yet assigned.
───────────────────────────────────────────── */
const getAddresses = async (req, res, next) => {
  try {
    const addresses = await ensureUserDepositAddresses(req.user);
    res.json({ success: true, addresses });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/claim
   Body: { chain, token, txHash, amount? }
   Creates a PendingDeposit. If indexer resolves the tx, auto-credits.
───────────────────────────────────────────── */
// Tokens accepted on the manual claim path — must arrive as a stable USD-pegged asset.
// Native coins (ETH, MATIC, BNB) are NOT accepted here; users must bridge via the
// multi-chain deposit UI which swaps everything to USDC before crediting (Polymarket model).
const ACCEPTED_STABLE_TOKENS = ['USDC', 'USDCe', 'USDC.e', 'USDT', 'DAI'];

const claimDeposit = async (req, res, next) => {
  try {
    const { chain, token, txHash, amount } = req.body;
    if (!chain || !token || !txHash) {
      return res.status(400).json({ success: false, error: 'chain, token, and txHash are required' });
    }

    // Only accept stablecoin deposits on the manual path.
    // For ETH/MATIC/BNB etc. direct the user to the Bridge tab which swaps to USDC first.
    const tokenUpper = token.toUpperCase().replace('.', '');
    const isAccepted = ACCEPTED_STABLE_TOKENS.some(t => t.toUpperCase().replace('.', '') === tokenUpper);
    if (!isAccepted) {
      return res.status(400).json({
        success: false,
        error: `Direct ${token} deposits are not supported. Please use the "Bridge" tab to deposit crypto — it automatically converts ${token} to USDC on Polygon.`,
      });
    }

    // Prevent duplicate claims on same txHash (case-insensitive)
    const normalizedTxHash = txHash.toLowerCase();
    const existing = await PendingDeposit.findOne({ txHash: normalizedTxHash });
    if (existing) {
      // Allow retry if the previous attempt was rejected
      if (existing.status === 'rejected') {
        await PendingDeposit.deleteOne({ _id: existing._id });
        console.log(`[Deposit] Removed previous rejected attempt for tx ${normalizedTxHash}`);
      } else {
        return res.status(409).json({ 
          success: false, 
          error: existing.status === 'credited' 
            ? 'This deposit has already been credited to your account' 
            : 'This transaction has already been submitted'
        });
      }
    }

    // Get platform deposit address (where funds should have been sent)
    const addresses = await ensureUserDepositAddresses(req.user);
    const expectedRecipient = addresses.evm;
    if (!expectedRecipient) {
      return res.status(500).json({ success: false, error: 'Platform deposit address not configured' });
    }

    // Verify the transaction on-chain
    let verification = await verifyDepositTx({
      chain,
      token,
      txHash: normalizedTxHash,
      expectedRecipient,
    });

    // Fallback: If failed because tx not found on selected chain, try auto-detect
    if (!verification.verified && verification.error?.includes('not found')) {
      console.log(`[Deposit] Tx not found on ${chain}, trying auto-detect...`);
      const autoResult = await verifyDepositTxAutoDetect({
        token,
        txHash: normalizedTxHash,
        expectedRecipient,
      });
      if (autoResult.verified) {
        verification = autoResult;
        console.log(`[Deposit] Auto-detected on chain: ${autoResult.chain}`);
      }
    }

    if (!verification.verified) {
      // Save as rejected with reason
      await PendingDeposit.create({
        user: req.user._id,
        chain,
        token,
        txHash: normalizedTxHash,
        claimedAmountUsd: amount ? parseFloat(amount) : null,
        status: 'rejected',
        source: 'manual',
        notes: verification.error,
      });
      return res.status(400).json({ 
        success: false, 
        error: verification.error || 'Transaction verification failed' 
      });
    }

    // Stablecoins credit 1:1 USD (USDC/USDT/DAI ≈ $1.00 — no oracle risk on the claim path).
    // This matches Polymarket's model: the platform only accepts USDC so no price conversion needed.
    const isUsdc = ['USDC', 'USDCe'].some(t => t.toLowerCase() === token.toLowerCase().replace('.', ''));
    let creditedAmountUsd;
    if (isUsdc) {
      creditedAmountUsd = verification.amount; // 1:1
    } else {
      // For USDT/DAI use price feed but cap slippage at ±2%
      const price = await getUsdPrice(token);
      creditedAmountUsd = price ? Math.min(price, 1.02) * verification.amount : verification.amount;
    }

    if (!creditedAmountUsd || creditedAmountUsd <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not determine USD value of deposit. Please try again later.' 
      });
    }

    // Atomic credit + record creation (use verified chain in case auto-detect changed it)
    const verifiedChain = verification.chain || chain;
    const deposit = await PendingDeposit.create({
      user: req.user._id,
      chain: verifiedChain,
      token,
      txHash: normalizedTxHash,
      claimedAmountUsd: verification.amount,
      sender: verification.sender,
      status: 'credited',
      creditedAmountUsd,
      source: 'auto-verified',
      reviewedAt: new Date(),
      notes: `Verified on-chain (${verifiedChain}). Block: ${verification.blockNumber}, Confirmations: ${verification.confirmations}`,
    });

    // Credit user balance
    await User.findByIdAndUpdate(req.user._id, { $inc: { balance: creditedAmountUsd } });

    // Write Transaction audit record
    try {
      const Transaction = require('../models/Transaction');
      const updatedUser = await User.findById(req.user._id).select('balance').lean();
      await Transaction.create({
        user: req.user._id,
        type: 'deposit',
        amount: creditedAmountUsd,
        balance: updatedUser?.balance ?? 0,
        status: 'completed',
        metadata: { txHash: normalizedTxHash },
      });
    } catch (txErr) {
      console.error('[Deposit] Transaction record failed:', txErr.message);
    }

    res.json({
      success: true,
      deposit,
      autoCredited: true,
      creditedAmountUsd,
      message: `Deposit verified and credited: ${verification.amount} ${token} (~$${creditedAmountUsd.toFixed(2)})`,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/mine
   Returns the authenticated user's deposit history.
───────────────────────────────────────────── */
const getMyDeposits = async (req, res, next) => {
  try {
    const deposits = await PendingDeposit.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, deposits });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/admin/list?status=pending&page=1&limit=20
───────────────────────────────────────────── */
const adminList = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const total = await PendingDeposit.countDocuments(filter);
    const deposits = await PendingDeposit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('user', 'username email walletAddress')
      .populate('reviewedBy', 'username')
      .lean();

    res.json({ success: true, deposits, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/admin/stats
───────────────────────────────────────────── */
const adminStats = async (req, res, next) => {
  try {
    const [pending, credited24h, allCredited] = await Promise.all([
      PendingDeposit.countDocuments({ status: 'pending' }),
      PendingDeposit.countDocuments({
        status: 'credited',
        reviewedAt: { $gte: new Date(Date.now() - 86400_000) },
      }),
      PendingDeposit.aggregate([
        { $match: { status: 'credited' } },
        { $group: { _id: null, total: { $sum: '$creditedAmountUsd' } } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        pending,
        credited24h,
        totalCredited: allCredited[0]?.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/admin/:id/price-suggestion
   Returns a Chainlink/Binance-based suggested USD value.
───────────────────────────────────────────── */
const priceSuggestion = async (req, res, next) => {
  try {
    const deposit = await PendingDeposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit not found' });

    const price = await getUsdPrice(deposit.token);
    const suggestedUsd = price && deposit.claimedAmountUsd ? price * deposit.claimedAmountUsd : null;

    res.json({ success: true, tokenPrice: price, suggestedUsd, claimedAmountUsd: deposit.claimedAmountUsd });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/admin/:id/credit
   Body: { amountUsd }
───────────────────────────────────────────── */
const adminCredit = async (req, res, next) => {
  try {
    const { amountUsd } = req.body;
    if (!amountUsd || isNaN(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amountUsd is required' });
    }

    const deposit = await PendingDeposit.findById(req.params.id).populate('user');
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit not found' });
    if (deposit.status === 'credited') return res.status(409).json({ success: false, error: 'Already credited' });

    // Atomic balance credit — use returned doc so newBalance is accurate
    const creditAmount = parseFloat(amountUsd);
    const creditedUser = await User.findByIdAndUpdate(
      deposit.user._id,
      { $inc: { balance: creditAmount } },
      { new: true }
    );

    // Update deposit record
    deposit.status = 'credited';
    deposit.creditedAmountUsd = creditAmount;
    deposit.reviewedBy = req.user._id;
    deposit.reviewedAt = new Date();
    await deposit.save();

    // Write Transaction audit record
    try {
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: deposit.user._id,
        type: 'deposit',
        amount: creditAmount,
        balance: creditedUser?.balance ?? 0,
        status: 'completed',
        metadata: { txHash: deposit.txHash || null },
      });
    } catch (txErr) {
      console.error('[AdminCredit] Transaction record failed:', txErr.message);
    }

    res.json({ success: true, deposit, newBalance: creditedUser?.balance ?? 0 });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/admin/:id/reject
   Body: { reason }
───────────────────────────────────────────── */
const adminReject = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const deposit = await PendingDeposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit not found' });
    if (deposit.status === 'credited') return res.status(409).json({ success: false, error: 'Already credited — cannot reject' });

    deposit.status = 'rejected';
    deposit.notes = reason || '';
    deposit.reviewedBy = req.user._id;
    deposit.reviewedAt = new Date();
    await deposit.save();

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/session
   Body: { amountUsd, paymentMethod }
   Creates a pending deposit and returns session config for the embedded widget.
───────────────────────────────────────────── */
const moonpaySession = async (req, res, next) => {
  try {
    const { amountUsd, paymentMethod } = req.body;

    if (!amountUsd || isNaN(amountUsd) || parseFloat(amountUsd) < 20) {
      return res.status(400).json({ success: false, error: 'Minimum deposit is $20' });
    }
    if (parseFloat(amountUsd) > 115000) {
      return res.status(400).json({ success: false, error: 'Maximum deposit is $115,000' });
    }

    const validMethods = ['credit_debit_card', 'apple_pay', 'google_pay'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: 'Invalid payment method' });
    }

    const user = req.user;
    const addresses = await ensureUserDepositAddresses(user);
    const walletAddress = addresses.evm || process.env.EVM_DEPOSIT_ADDRESS;

    const externalTxId = `pb_${user._id}_${Date.now()}`;

    await PendingDeposit.create({
      user: user._id,
      chain: 'polygon',
      token: 'USDC',
      claimedAmountUsd: parseFloat(amountUsd),
      provider: 'moonpay',
      providerTxId: externalTxId,
      providerStatus: 'waitingPayment',
      status: 'pending',
      source: 'moonpay',
    });

    console.log(`[MoonPay] Session created: ${externalTxId} for user ${user._id} amt=$${amountUsd} method=${paymentMethod}`);

    res.json({
      success: true,
      externalTxId,
      walletAddress,
      currencyCode: moonpay.getCurrencyCode(),
      baseCurrencyCode: 'usd',
      baseCurrencyAmount: parseFloat(amountUsd),
      paymentMethod,
      environment: process.env.MOONPAY_ENV === 'live' ? 'production' : 'sandbox',
      apiKey: process.env.MOONPAY_API_KEY,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/sign-url
   Body: { url }
   Signs an arbitrary MoonPay widget URL via HMAC-SHA256 for onUrlSignature callback.
───────────────────────────────────────────── */
const moonpaySignUrl = async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'url is required' });
    }
    const signature = moonpay.signWidgetUrl(url);
    res.json({ success: true, signature });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/moonpay/session/:externalTxId
   Returns status of a MoonPay deposit session (for polling after widget events).
───────────────────────────────────────────── */
const moonpayGetSession = async (req, res, next) => {
  try {
    const { externalTxId } = req.params;
    const deposit = await PendingDeposit.findOne({
      providerTxId: externalTxId,
      user: req.user._id,
    }).lean();

    if (!deposit) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      status: deposit.status,
      providerStatus: deposit.providerStatus,
      creditedAmountUsd: deposit.creditedAmountUsd,
      credited: deposit.status === 'credited',
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/webhook
   Raw body, HMAC verified
   Handles transaction_updated / transaction_completed
───────────────────────────────────────────── */
const moonpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['moonpay-signature-v2'];
    const rawBody = req.rawBody;

    // Verify signature
    if (!moonpay.verifyWebhookSignature(rawBody, signature)) {
      console.warn('MoonPay webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const { data, type: eventType } = payload;

    if (!data || !data.externalTransactionId) {
      return res.status(400).json({ error: 'Missing externalTransactionId' });
    }

    // ── MoonPay OFF-RAMP (sell) webhook ──────────────────────────────────────
    // Sell transactions have externalTransactionId prefixed with "ps_" (set in buildSellUrl)
    // or event type contains "sell"
    const isSellEvent = String(data.externalTransactionId).startsWith('ps_') ||
                        String(eventType || '').toLowerCase().includes('sell');

    if (isSellEvent) {
      const Withdrawal = require('../models/Withdrawal');
      const externalTxId = data.externalTransactionId;
      const userId = externalTxId.split('_')[1]; // ps_{userId}_{timestamp}

      // Parse USDC amount sold
      const usdcAmount = data.baseCurrencyAmount || data.quoteCurrencyAmount || 0;

      let withdrawal = await Withdrawal.findOne({ providerSessionId: externalTxId });
      if (!withdrawal && userId) {
        const sellUser = await User.findById(userId).select('walletAddress balance').lean();
        if (sellUser) {
          withdrawal = await Withdrawal.create({
            userId,
            providerSessionId: externalTxId,
            amount: usdcAmount,
            currency: 'USDC',
            network: 'polygon',
            walletAddress: sellUser.walletAddress || '',
            destinationAddress: data.walletAddress || sellUser.walletAddress || '',
            provider: 'moonpay',
            status: 'pending',
          });
        }
      }

      if (withdrawal) {
        if (data.status === 'completed' && withdrawal.status !== 'completed') {
          withdrawal.status = 'completed';
          withdrawal.completedAt = new Date();
          withdrawal.txHash = data.cryptoTransactionId || null;

          // Debit user balance
          if (usdcAmount > 0 && userId) {
            await User.findByIdAndUpdate(userId, { $inc: { balance: -usdcAmount } });
            try {
              const Transaction = require('../models/Transaction');
              const updatedUser = await User.findById(userId).select('balance').lean();
              await Transaction.create({
                user: userId, type: 'withdrawal', amount: usdcAmount,
                balance: updatedUser?.balance ?? 0, status: 'completed',
                metadata: { provider: 'moonpay_sell', txHash: data.cryptoTransactionId || null },
              });
            } catch {}
          }
          console.log(`[MoonPaySell] Sell completed: ${externalTxId} amount=${usdcAmount} USDC`);
        } else if (['failed', 'rejected'].includes(data.status)) {
          withdrawal.status = 'failed';
          withdrawal.failureReason = data.failureReason || 'MoonPay sell failed';
        } else {
          withdrawal.status = 'pending';
        }
        await withdrawal.save();
      }

      return res.json({ received: true, sell: true, status: data.status });
    }

    // ── MoonPay ON-RAMP (buy) webhook — original logic below ─────────────────
    // Find pending deposit by providerTxId
    const deposit = await PendingDeposit.findOne({
      providerTxId: data.externalTransactionId,
    });

    if (!deposit) {
      console.warn('MoonPay webhook: no matching deposit', data.externalTransactionId);
      return res.status(200).json({ received: true, matched: false });
    }

    // Update provider status and payload
    deposit.providerStatus = data.status;
    deposit.providerPayload = payload;

    // On completion, credit user balance
    if (data.status === 'completed' && deposit.status !== 'credited') {
      const usdcAmount = data.quoteCurrencyAmount || deposit.claimedAmountUsd;
      if (!usdcAmount || usdcAmount <= 0) {
        console.warn('[MoonPayWebhook] Skipping credit: zero or missing quoteCurrencyAmount', data);
        await deposit.save();
        return res.json({ received: true, matched: true, credited: false });
      }
      deposit.creditedAmountUsd = usdcAmount;
      deposit.status = 'credited';
      deposit.reviewedAt = new Date();

      // Credit user balance atomically
      await User.findByIdAndUpdate(deposit.user, {
        $inc: { balance: usdcAmount },
      });

      // Write Transaction audit record
      try {
        const Transaction = require('../models/Transaction');
        const updatedUser = await User.findById(deposit.user).select('balance').lean();
        await Transaction.create({
          user: deposit.user,
          type: 'deposit',
          amount: usdcAmount,
          balance: updatedUser?.balance ?? 0,
          status: 'completed',
          metadata: { txHash: data.cryptoTransactionId || null },
        });
      } catch (txErr) {
        console.error('[MoonPayWebhook] Transaction record failed:', txErr.message);
      }
    }

    // On failure/rejection
    if (['failed', 'rejected'].includes(data.status) && deposit.status === 'pending') {
      deposit.status = 'rejected';
      deposit.notes = data.failureReason || 'MoonPay transaction failed';
    }

    await deposit.save();

    res.json({ received: true, matched: true, credited: deposit.status === 'credited' });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/bridge/quote
   Body: { fromChainId, fromToken, fromAmount }
   Returns bridge quote with depositAddress + routeId.
   Funds route directly to user's Gnosis Safe — non-custodial.
───────────────────────────────────────────── */
const getBridgeQuote = async (req, res, next) => {
  try {
    const { fromChainId, fromToken, fromAmount } = req.body;
    if (!fromChainId || !fromToken || !fromAmount) {
      return res.status(400).json({ success: false, error: 'fromChainId, fromToken, and fromAmount are required' });
    }
    const user = req.user;
    const quote = await bridgeService.getBridgeQuote({
      user,
      fromChainId: Number(fromChainId),
      fromToken,
      fromAmount,
    });
    res.json({ success: true, quote });
  } catch (err) {
    console.error('[BridgeQuote] Error:', err);
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/bridge/status/:id
   Query: { provider?, txHash?, fromChainId? }
   Returns bridge route status.
───────────────────────────────────────────── */
const getBridgeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { provider, txHash, fromChainId } = req.query;
    const status = await bridgeService.getBridgeStatus({
      routeId:     id,
      txHash:      txHash || id,
      provider:    provider || process.env.BRIDGE_PROVIDER || 'relay',
      fromChainId: fromChainId ? Number(fromChainId) : undefined,
    });
    res.json({ success: true, status });
  } catch (err) {
    console.error('[BridgeStatus] Error:', err);
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/sell-session
   Body: { amountUsdc, quoteCurrencyCode }
   Creates a MoonPay off-ramp sell session (USDC → fiat).
───────────────────────────────────────────── */
const moonpaySellSession = async (req, res, next) => {
  try {
    const { amountUsdc, quoteCurrencyCode = 'usd' } = req.body;

    if (!amountUsdc || isNaN(amountUsdc) || parseFloat(amountUsdc) < 20) {
      return res.status(400).json({ success: false, error: 'Minimum sell amount is 20 USDC' });
    }
    if (parseFloat(amountUsdc) > 50000) {
      return res.status(400).json({ success: false, error: 'Maximum sell amount is 50,000 USDC' });
    }

    const { buildSellUrl } = require('../services/moonpay');
    const user = req.user;

    const { url, signed, externalTxId } = buildSellUrl({
      user,
      amountUsdc: parseFloat(amountUsdc),
      baseCurrencyCode: quoteCurrencyCode,
    });

    console.log(`[MoonPay Sell] Session created: ${externalTxId} for user ${user._id} amt=${amountUsdc} USDC`);

    res.json({
      success: true,
      externalTxId,
      widgetUrl: url,
      signed,
      environment: process.env.MOONPAY_ENV === 'live' ? 'production' : 'sandbox',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAddresses,
  claimDeposit,
  getMyDeposits,
  adminList,
  adminStats,
  priceSuggestion,
  adminCredit,
  adminReject,
  // MoonPay embedded widget
  moonpaySession,
  moonpaySignUrl,
  moonpayGetSession,
  moonpayWebhook,
  moonpaySellSession,
  // Non-custodial bridge deposits
  getBridgeQuote,
  getBridgeStatus,
};
