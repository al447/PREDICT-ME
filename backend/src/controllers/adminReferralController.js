const referralService = require('../services/referralService');
const ReferralConfig = require('../models/ReferralConfig');
const Referral = require('../models/Referral');
const ReferralCommission = require('../models/ReferralCommission');
const ReferralCode = require('../models/ReferralCode');
const User = require('../models/User');
const auditService = require('../services/auditService');

// ── GET /api/admin/referral/stats ──
const getStats = async (req, res, next) => {
  try {
    const stats = await referralService.getAdminStats();
    res.json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/admin/referral/config ──
const getConfig = async (req, res, next) => {
  try {
    const config = await referralService.getOrCreateConfig();
    res.json({ success: true, config });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/admin/referral/config ──
const updateConfig = async (req, res, next) => {
  try {
    const updates = req.body;
    const allowedFields = [
      'signupBonusReferrer',
      'signupBonusReferee',
      'commissionRate',
      'platformFeeRate',
      'qualifyingTradeThreshold',
      'milestoneTiers',
      'cookieDaysTTL',
      'enabled',
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    updateData.updatedBy = req.user._id;

    const config = await ReferralConfig.findByIdAndUpdate(
      'singleton',
      updateData,
      { new: true, upsert: true }
    );

    await auditService.log({
      admin: req.user._id,
      action: 'referral.config_update',
      targetType: 'system',
      targetId: null,
      details: updateData,
    });

    res.json({ success: true, config });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/admin/referral/list ──
const listReferrals = async (req, res, next) => {
  try {
    const { status, q, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (status && status !== 'all') query.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let referrals = await Referral.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('referrer', 'username email')
      .populate('referee', 'username email');

    // Filter by search query if provided
    if (q) {
      const searchRegex = new RegExp(q, 'i');
      referrals = referrals.filter(r =>
        searchRegex.test(r.code) ||
        searchRegex.test(r.referrer?.username) ||
        searchRegex.test(r.referrer?.email) ||
        searchRegex.test(r.referee?.username) ||
        searchRegex.test(r.referee?.email)
      );
    }

    const total = await Referral.countDocuments(query);

    res.json({
      success: true,
      referrals,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/admin/referral/commissions ──
const listCommissions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [commissions, total] = await Promise.all([
      ReferralCommission.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('referrer', 'username email')
        .populate('referee', 'username email')
        .populate('trade', 'amount market'),
      ReferralCommission.countDocuments(),
    ]);

    res.json({
      success: true,
      commissions,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/admin/referral/users/:id/adjust ──
const adjustUserBalance = async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const userId = req.params.id;

    if (amount === undefined || !reason) {
      return res.status(400).json({ success: false, error: 'Amount and reason are required' });
    }

    const result = await referralService.adminAdjustBalance({
      adminId: req.user._id,
      userId,
      amount: parseFloat(amount),
      reason,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      newBalance: result.newBalance,
      transactionId: result.transactionId,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/admin/referral/users/:id/ban ──
const banUserFromProgram = async (req, res, next) => {
  try {
    const { banned } = req.body;
    const userId = req.params.id;

    if (banned === undefined) {
      return res.status(400).json({ success: false, error: 'Banned status is required' });
    }

    const result = await referralService.adminBanFromProgram({
      adminId: req.user._id,
      userId,
      banned: !!banned,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      isBanned: result.isBanned,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/admin/referral/:referralId/qualify ──
const forceQualify = async (req, res, next) => {
  try {
    const referralId = req.params.referralId;
    const result = await referralService.adminForceQualify({
      adminId: req.user._id,
      referralId,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.reason || 'Failed to qualify referral' });
    }

    res.json({
      success: true,
      referral: result.referral,
      referrerBonus: result.referrerBonus,
      refereeBonus: result.refereeBonus,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/admin/referral/:referralId/revoke ──
const revokeReferral = async (req, res, next) => {
  try {
    const referralId = req.params.referralId;
    const { clawback = true } = req.body;

    const result = await referralService.adminRevokeReferral({
      adminId: req.user._id,
      referralId,
      clawback,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, message: 'Referral revoked successfully' });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/admin/referral/leaderboard ──
const getLeaderboard = async (req, res, next) => {
  try {
    const { limit = 10, range = 'all' } = req.query;
    const leaderboard = await referralService.getLeaderboard({ limit: parseInt(limit), range });
    res.json({ success: true, leaderboard });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  getConfig,
  updateConfig,
  listReferrals,
  listCommissions,
  adjustUserBalance,
  banUserFromProgram,
  forceQualify,
  revokeReferral,
  getLeaderboard,
};
