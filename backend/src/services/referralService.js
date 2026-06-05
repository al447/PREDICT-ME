const crypto = require('crypto');
const ReferralCode = require('../models/ReferralCode');
const Referral = require('../models/Referral');
const ReferralCommission = require('../models/ReferralCommission');
const ReferralConfig = require('../models/ReferralConfig');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auditService = require('./auditService');

// ── Helper: generate unique code ──
const generateCode = () => {
  // Base32-like charset excluding 0/O/1/I
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
};

const generateUniqueCode = async (userId) => {
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    const code = generateCode();
    const exists = await ReferralCode.findOne({ code });
    if (!exists) {
      const refCode = await ReferralCode.create({ code, owner: userId });
      await User.findByIdAndUpdate(userId, { referralCode: code });
      return refCode;
    }
    attempts++;
  }
  throw new Error('Failed to generate unique referral code after max attempts');
};

const getCodeForUser = async (userId) => {
  let refCode = await ReferralCode.findOne({ owner: userId });
  if (!refCode) {
    refCode = await generateUniqueCode(userId);
  }
  return refCode;
};

// ── Get or create config singleton — atomic upsert prevents cold-start race ──
const getOrCreateConfig = async () => {
  // $setOnInsert only fires on INSERT; leaves existing fields untouched on UPDATE
  let config = await ReferralConfig.findByIdAndUpdate(
    'singleton',
    { $setOnInsert: { _id: 'singleton' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Correct stale values that were set before the program update
  const updates = {};
  if (config.commissionRate === 0.10) updates.commissionRate = 0.05;
  if (config.qualifyingTradeThreshold === 0 || config.qualifyingTradeThreshold === 25) updates.qualifyingTradeThreshold = 5;
  if (Object.keys(updates).length > 0) {
    config = await ReferralConfig.findByIdAndUpdate('singleton', { $set: updates }, { new: true });
    console.log('[ReferralConfig] Auto-corrected stale config values:', updates);
  }
  return config;
};

// ── Validate code before use ──
const validateCode = async (code, refereeUserId, ipAddress) => {
  console.log(`[Referral] Validating code ${code} for user ${refereeUserId}`);
  
  const config = await getOrCreateConfig();
  if (!config.enabled) {
    console.log(`[Referral] Validation failed: referral_program_disabled`);
    return { valid: false, reason: 'referral_program_disabled' };
  }

  const refCode = await ReferralCode.findOne({ code }).populate('owner');
  if (!refCode) {
    console.log(`[Referral] Validation failed: code_not_found for ${code}`);
    return { valid: false, reason: 'code_not_found' };
  }
  if (refCode.isBanned) {
    console.log(`[Referral] Validation failed: code_banned for ${code}`);
    return { valid: false, reason: 'code_banned' };
  }

  const referrer = refCode.owner;
  if (!referrer) {
    console.log(`[Referral] Validation failed: referrer_not_found for ${code}`);
    return { valid: false, reason: 'referrer_not_found' };
  }

  // Self-referral block
  if (referrer._id.toString() === refereeUserId.toString()) {
    console.log(`[Referral] Validation failed: self_referral for user ${refereeUserId}`);
    return { valid: false, reason: 'self_referral' };
  }

  // Check if referrer is banned
  if (referrer.referralBannedFromProgram) {
    console.log(`[Referral] Validation failed: referrer_banned for ${referrer._id}`);
    return { valid: false, reason: 'referrer_banned' };
  }

  // Check for existing referral from this referee
  const existing = await Referral.findOne({ referee: refereeUserId });
  if (existing) {
    console.log(`[Referral] Validation failed: already_referred for user ${refereeUserId}`);
    return { valid: false, reason: 'already_referred' };
  }

  // Same IP check (3+ signups from same IP+code in 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentSameIp = await Referral.countDocuments({
    code,
    ipAtSignup: ipAddress,
    createdAt: { $gte: oneDayAgo },
  });
  if (recentSameIp >= 3) {
    console.log(`[Referral] Validation failed: ip_rate_limited for IP ${ipAddress}`);
    return { valid: false, reason: 'ip_rate_limited' };
  }

  console.log(`[Referral] Validation passed for code ${code}, referrer: ${referrer._id}`);
  return { valid: true, referrerId: referrer._id };
};

// ── Attribute referral at signup ──
const attributeReferral = async ({ refereeUserId, code, ipAddress }) => {
  console.log(`[Referral] Starting attribution for user ${refereeUserId} with code ${code}`);
  
  const config = await getOrCreateConfig();
  if (!config.enabled) {
    console.log(`[Referral] Program disabled`);
    return { success: false, reason: 'disabled' };
  }

  const validation = await validateCode(code, refereeUserId, ipAddress);
  if (!validation.valid) {
    console.log(`[Referral] Validation failed: ${validation.reason}`);
    return { success: false, reason: validation.reason };
  }

  const session = await Referral.startSession();
  try {
    const result = await session.withTransaction(async () => {
      // Create referral record
      const referral = await Referral.create([{
        referrer: validation.referrerId,
        referee: refereeUserId,
        code,
        status: 'pending',
        signupBonusReferrer: config.signupBonusReferrer,
        signupBonusReferee: config.signupBonusReferee,
        ipAtSignup: ipAddress,
      }], { session });

      // Update referrer stats
      await ReferralCode.findOneAndUpdate(
        { owner: validation.referrerId },
        { $inc: { pendingReferred: 1, pendingEarned: config.signupBonusReferrer } },
        { session }
      );

      await User.findByIdAndUpdate(
        validation.referrerId,
        {
          $inc: {
            'referralStats.pendingReferred': 1,
            pendingReferralBalance: config.signupBonusReferrer,
          },
        },
        { session }
      );

      // Update referee record
      await User.findByIdAndUpdate(
        refereeUserId,
        {
          referredBy: validation.referrerId,
          referralCodeUsed: code,
          $inc: { pendingReferralBalance: config.signupBonusReferee },
        },
        { session }
      );

      return referral[0];
    });

    console.log(`[Referral] Successfully attributed referral ${result._id} for user ${refereeUserId}`);
    return { success: true, referral: result };
  } catch (err) {
    console.error('[Referral] attributeReferral error:', err);
    return { success: false, reason: 'error' };
  } finally {
    await session.endSession();
  }
};

// ── Credit qualifying referral (unlock bonuses) ──
const creditQualifyingReferral = async (referralId) => {
  const referral = await Referral.findById(referralId);
  if (!referral || referral.status !== 'pending') return { success: false, reason: 'not_pending' };

  const config = await getOrCreateConfig();
  const session = await Referral.startSession();

  try {
    const result = await session.withTransaction(async () => {
      // Update referral status
      referral.status = 'qualified';
      referral.qualifiedAt = new Date();
      referral.signupBonusPaid = true;
      await referral.save({ session });

      const referrerBonus = referral.signupBonusReferrer;
      const refereeBonus = referral.signupBonusReferee;

      // Credit referrer — floor pendingReferralBalance at 0 to prevent underflow
      const referrerDoc = await User.findById(referral.referrer).session(session);
      const safeReferrerDeduct = Math.min(referrerBonus, referrerDoc?.pendingReferralBalance || 0);
      await User.findByIdAndUpdate(
        referral.referrer,
        {
          $inc: {
            balance: referrerBonus,
            'referralStats.totalReferred': 1,
            'referralStats.pendingReferred': -1,
            'referralStats.totalEarned': referrerBonus,
            pendingReferralBalance: -safeReferrerDeduct,
          },
        },
        { session }
      );

      // Credit referee — floor pendingReferralBalance at 0
      const refereeDoc = await User.findById(referral.referee).session(session);
      const safeRefereeDeduct = Math.min(refereeBonus, refereeDoc?.pendingReferralBalance || 0);
      await User.findByIdAndUpdate(
        referral.referee,
        {
          $inc: {
            balance: refereeBonus,
            pendingReferralBalance: -safeRefereeDeduct,
          },
        },
        { session }
      );

      // Update referrer code stats
      await ReferralCode.findOneAndUpdate(
        { owner: referral.referrer },
        {
          $inc: {
            totalReferred: 1,
            pendingReferred: -1,
            totalEarned: referrerBonus,
            pendingEarned: -referrerBonus,
          },
        },
        { session }
      );

      // Create transactions
      const referrerTx = await Transaction.create([{
        user: referral.referrer,
        type: 'referral_signup_bonus',
        amount: referrerBonus,
        balance: 0, // will be fetched below
        metadata: {
          referralId: referral._id,
          refereeId: referral.referee,
        },
      }], { session });

      const refereeTx = await Transaction.create([{
        user: referral.referee,
        type: 'referral_signup_bonus',
        amount: refereeBonus,
        balance: 0,
        metadata: {
          referralId: referral._id,
        },
      }], { session });

      // Get updated balances for transaction records
      const [referrerUser, refereeUser] = await Promise.all([
        User.findById(referral.referrer).session(session),
        User.findById(referral.referee).session(session),
      ]);

      await Transaction.findByIdAndUpdate(referrerTx[0]._id, { balance: referrerUser.balance }, { session });
      await Transaction.findByIdAndUpdate(refereeTx[0]._id, { balance: refereeUser.balance }, { session });

      // Check milestones
      await checkAndPayMilestones(referral.referrer, config, session);

      return { referral, referrerBonus, refereeBonus };
    });

    return { success: true, ...result };
  } catch (err) {
    console.error('[Referral] creditQualifyingReferral error:', err);
    return { success: false, reason: 'error' };
  } finally {
    await session.endSession();
  }
};

// ── Record trade and compute commission ──
const recordTradeForReferral = async ({ refereeUserId, tradeId, tradeAmount }) => {
  const referee = await User.findById(refereeUserId);
  if (!referee || !referee.referredBy) return { success: false, reason: 'no_referrer' };

  const config = await getOrCreateConfig();
  if (!config.enabled) return { success: false, reason: 'disabled' };

  const referral = await Referral.findOne({ referee: refereeUserId });
  if (!referral) return { success: false, reason: 'no_referral_record' };

  // Update qualifying volume atomically to prevent concurrent-trade race
  if (referral.status === 'pending') {
    const updated = await Referral.findOneAndUpdate(
      { _id: referral._id, status: 'pending' },
      { $inc: { qualifyingTradeVolume: tradeAmount } },
      { new: true }
    );
    if (updated && updated.qualifyingTradeVolume >= config.qualifyingTradeThreshold) {
      await creditQualifyingReferral(referral._id);
    }
  }

  // Commission only for qualified referrals
  if (referral.status === 'qualified') {
    // Check for duplicate commission
    const existing = await ReferralCommission.findOne({ trade: tradeId });
    if (existing) return { success: false, reason: 'commission_exists' };

    const commissionAmount = Math.round(tradeAmount * config.platformFeeRate * config.commissionRate * 100) / 100;
    if (commissionAmount <= 0) return { success: false, reason: 'zero_commission' };

    const session = await ReferralCommission.startSession();
    try {
      await session.withTransaction(async () => {
        // Create commission record
        await ReferralCommission.create([{
          referrer: referral.referrer,
          referee: refereeUserId,
          trade: tradeId,
          tradeAmount,
          commissionAmount,
          rate: config.commissionRate,
        }], { session });

        // Credit referrer
        await User.findByIdAndUpdate(
          referral.referrer,
          {
            $inc: {
              balance: commissionAmount,
              'referralStats.totalEarned': commissionAmount,
            },
          },
          { session }
        );

        // Update referrer code stats
        await ReferralCode.findOneAndUpdate(
          { owner: referral.referrer },
          { $inc: { totalEarned: commissionAmount } },
          { session }
        );

        // Create transaction
        const referrer = await User.findById(referral.referrer).session(session);
        await Transaction.create([{
          user: referral.referrer,
          type: 'referral_commission',
          amount: commissionAmount,
          balance: referrer.balance,
          metadata: {
            referralId: referral._id,
            refereeId: refereeUserId,
            tradeId,
          },
        }], { session });
      });

      return { success: true, commissionAmount };
    } catch (err) {
      console.error('[Referral] recordTradeForReferral commission error:', err);
      return { success: false, reason: 'error' };
    } finally {
      await session.endSession();
    }
  }

  return { success: true, commissionAmount: 0 };
};

// ── Check and pay milestones ──
const checkAndPayMilestones = async (referrerUserId, config, session) => {
  const refCode = await ReferralCode.findOne({ owner: referrerUserId }).session(session);
  if (!refCode) return;

  const tiers = config.milestoneTiers || [];
  for (const tier of tiers) {
    if (refCode.totalReferred >= tier.count && !refCode.milestonesPaid.includes(tier.count)) {
      // Pay milestone
      await User.findByIdAndUpdate(
        referrerUserId,
        {
          $inc: {
            balance: tier.reward,
            'referralStats.totalEarned': tier.reward,
          },
        },
        { session }
      );

      await ReferralCode.findOneAndUpdate(
        { owner: referrerUserId },
        {
          $addToSet: { milestonesPaid: tier.count },
          $inc: { totalEarned: tier.reward },
        },
        { session }
      );

      const referrer = await User.findById(referrerUserId).session(session);
      await Transaction.create([{
        user: referrerUserId,
        type: 'referral_milestone',
        amount: tier.reward,
        balance: referrer.balance,
        metadata: {
          milestone: tier.count,
        },
      }], { session });
    }
  }
};

// ── Get user dashboard data ──
const getUserDashboard = async (userId) => {
  const [refCode, referral, config] = await Promise.all([
    ReferralCode.findOne({ owner: userId }),
    Referral.findOne({ referee: userId }),
    getOrCreateConfig(),
  ]);

  const user = await User.findById(userId);

  // Recent activity
  const recentReferrals = await Referral.find({ referrer: userId })
    .populate('referee', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(10);

  const recentCommissions = await ReferralCommission.find({ referrer: userId })
    .populate('referee', 'username')
    .sort({ createdAt: -1 })
    .limit(10);

  // Milestone progress
  const milestonesProgress = (config.milestoneTiers || []).map(tier => ({
    count: tier.count,
    reward: tier.reward,
    reached: (refCode?.totalReferred || 0) >= tier.count,
    paid: refCode?.milestonesPaid?.includes(tier.count) || false,
  }));

  return {
    code: refCode?.code || null,
    link: refCode?.code ? `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?ref=${refCode.code}` : null,
    totalEarned: user?.referralStats?.totalEarned || 0,
    totalReferred: refCode?.totalReferred || 0,
    pendingReferred: refCode?.pendingReferred || 0,
    pendingEarned: refCode?.pendingEarned || 0,
    isBanned: refCode?.isBanned || false,
    referredBy: referral ? {
      code: referral.code,
      status: referral.status,
      qualifyingTradeVolume: referral.qualifyingTradeVolume,
      threshold: config.qualifyingTradeThreshold,
    } : null,
    recentReferrals,
    recentCommissions,
    milestonesProgress,
  };
};

// ── Get leaderboard ──
const getLeaderboard = async ({ limit = 10, range = 'all' } = {}) => {
  const query = {};
  if (range !== 'all') {
    const days = parseInt(range) || 30;
    query.updatedAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  const topReferrers = await ReferralCode.find(query)
    .populate('owner', 'username avatar')
    .sort({ totalReferred: -1 })
    .limit(limit);

  const topEarners = await ReferralCode.find(query)
    .populate('owner', 'username avatar')
    .sort({ totalEarned: -1 })
    .limit(limit);

  return { topReferrers, topEarners };
};

// ── Admin: adjust user balance ──
const adminAdjustBalance = async ({ adminId, userId, amount, reason }) => {
  const session = await User.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');

      const roundedAmount = Math.round(amount * 100) / 100;
      
      // Prevent negative balance
      if (user.balance + roundedAmount < 0) {
        throw new Error('Adjustment would result in negative balance');
      }

      await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: roundedAmount } },
        { session }
      );

      const updatedUser = await User.findById(userId).session(session);

      const tx = await Transaction.create([{
        user: userId,
        type: 'referral_admin_adjustment',
        amount: roundedAmount,
        balance: updatedUser.balance,
        metadata: {
          reason,
          adjustedBy: adminId,
        },
      }], { session });

      await auditService.log({
        admin: adminId,
        action: 'referral.adjust_balance',
        targetType: 'user',
        targetId: userId,
        details: { amount: roundedAmount, reason, transactionId: tx[0]._id },
      });

      return { newBalance: updatedUser.balance, transactionId: tx[0]._id };
    });

    return { success: true, ...result };
  } catch (err) {
    console.error('[Referral] adminAdjustBalance error:', err);
    return { success: false, error: err.message };
  } finally {
    await session.endSession();
  }
};

// ── Admin: ban/unban from program ──
const adminBanFromProgram = async ({ adminId, userId, banned }) => {
  try {
    const refCode = await ReferralCode.findOneAndUpdate(
      { owner: userId },
      { isBanned: banned },
      { new: true }
    );

    if (!refCode) {
      return { success: false, error: 'Referral code not found for user' };
    }

    await User.findByIdAndUpdate(userId, { referralBannedFromProgram: banned });

    await auditService.log({
      admin: adminId,
      action: banned ? 'referral.ban' : 'referral.unban',
      targetType: 'user',
      targetId: userId,
      details: { code: refCode.code },
    });

    return { success: true, isBanned: banned };
  } catch (err) {
    console.error('[Referral] adminBanFromProgram error:', err);
    return { success: false, error: err.message };
  }
};

// ── Admin: force qualify ──
const adminForceQualify = async ({ adminId, referralId }) => {
  const result = await creditQualifyingReferral(referralId);
  if (result.success) {
    await auditService.log({
      admin: adminId,
      action: 'referral.force_qualify',
      targetType: 'referral',
      targetId: referralId,
      details: { referrerBonus: result.referrerBonus, refereeBonus: result.refereeBonus },
    });
  }
  return result;
};

// ── Admin: revoke referral ──
const adminRevokeReferral = async ({ adminId, referralId, clawback = true }) => {
  const session = await Referral.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const referral = await Referral.findById(referralId).session(session);
      if (!referral) throw new Error('Referral not found');

      const previousStatus = referral.status;
      referral.status = 'rejected';
      referral.rejectedReason = 'admin_revoke';
      await referral.save({ session });

      if (clawback && previousStatus === 'qualified' && referral.signupBonusPaid) {
        // Claw back signup bonuses
        const referrerDeduction = -referral.signupBonusReferrer;
        const refereeDeduction = -referral.signupBonusReferee;

        const [referrer, referee] = await Promise.all([
          User.findById(referral.referrer).session(session),
          User.findById(referral.referee).session(session),
        ]);

        // Cap at zero
        const actualReferrerDeduction = Math.max(referrerDeduction, -referrer.balance);
        const actualRefereeDeduction = Math.max(refereeDeduction, -referee.balance);

        await User.findByIdAndUpdate(referral.referrer, {
          $inc: {
            balance: actualReferrerDeduction,
            'referralStats.totalReferred': -1,
            'referralStats.totalEarned': actualReferrerDeduction,
          },
        }, { session });

        await User.findByIdAndUpdate(referral.referee, {
          $inc: {
            balance: actualRefereeDeduction,
          },
        }, { session });

        // Create reversal transactions
        await Transaction.create([{
          user: referral.referrer,
          type: 'referral_admin_adjustment',
          amount: actualReferrerDeduction,
          balance: referrer.balance + actualReferrerDeduction,
          metadata: {
            reason: 'Referral revoked by admin',
            referralId: referral._id,
            adjustedBy: adminId,
          },
        }], { session });

        await Transaction.create([{
          user: referral.referee,
          type: 'referral_admin_adjustment',
          amount: actualRefereeDeduction,
          balance: referee.balance + actualRefereeDeduction,
          metadata: {
            reason: 'Referral revoked by admin',
            referralId: referral._id,
            adjustedBy: adminId,
          },
        }], { session });

        // Reverse commissions
        const commissions = await ReferralCommission.find({
          referrer: referral.referrer,
          referee: referral.referee,
          status: 'paid',
        }).session(session);

        for (const comm of commissions) {
          const reversalAmount = -comm.commissionAmount;
          const actualReversal = Math.max(reversalAmount, -referrer.balance);

          await User.findByIdAndUpdate(referral.referrer, {
            $inc: {
              balance: actualReversal,
              'referralStats.totalEarned': actualReversal,
            },
          }, { session });

          comm.status = 'reversed';
          await comm.save({ session });

          await Transaction.create([{
            user: referral.referrer,
            type: 'referral_admin_adjustment',
            amount: actualReversal,
            balance: referrer.balance + actualReversal,
            metadata: {
              reason: `Commission reversed: Referral revoked`,
              originalCommissionId: comm._id,
              adjustedBy: adminId,
            },
          }], { session });
        }
      }

      await auditService.log({
        admin: adminId,
        action: 'referral.revoke',
        targetType: 'referral',
        targetId: referralId,
        details: { previousStatus, clawback },
      });

      return { success: true };
    });

    return result;
  } catch (err) {
    console.error('[Referral] adminRevokeReferral error:', err);
    return { success: false, error: err.message };
  } finally {
    await session.endSession();
  }
};

// ── Admin: get stats ──
const getAdminStats = async () => {
  const [
    totalReferrals,
    qualifiedReferrals,
    pendingReferrals,
    rejectedReferrals,
    totalPaidOut,
    pendingAmount,
    totalCommissions,
  ] = await Promise.all([
    Referral.countDocuments(),
    Referral.countDocuments({ status: 'qualified' }),
    Referral.countDocuments({ status: 'pending' }),
    Referral.countDocuments({ status: 'rejected' }),
    Transaction.aggregate([
      { $match: { type: { $in: ['referral_signup_bonus', 'referral_milestone'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    ReferralCode.aggregate([
      { $group: { _id: null, total: { $sum: '$pendingEarned' } } },
    ]),
    ReferralCommission.countDocuments({ status: 'paid' }),
  ]);

  const commissionSum = await ReferralCommission.aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$commissionAmount' } } },
  ]);

  return {
    totalReferrals,
    qualifiedReferrals,
    pendingReferrals,
    rejectedReferrals,
    totalPaidOut: totalPaidOut[0]?.total || 0,
    pendingAmount: pendingAmount[0]?.total || 0,
    totalCommissions,
    totalCommissionAmount: commissionSum[0]?.total || 0,
  };
};

module.exports = {
  generateUniqueCode,
  getCodeForUser,
  getOrCreateConfig,
  validateCode,
  attributeReferral,
  creditQualifyingReferral,
  recordTradeForReferral,
  getUserDashboard,
  getLeaderboard,
  adminAdjustBalance,
  adminBanFromProgram,
  adminForceQualify,
  adminRevokeReferral,
  getAdminStats,
};
