const { body } = require('express-validator');
const referralService = require('../services/referralService');
const Referral = require('../models/Referral');
const Transaction = require('../models/Transaction');

// ── GET /api/referral/me ──
const getMyReferral = async (req, res, next) => {
  try {
    const dashboard = await referralService.getUserDashboard(req.user._id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/referral/history ──
const getMyReferralHistory = async (req, res, next) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;
    const query = { user: req.user._id };
    
    if (type !== 'all') {
      const typeMap = {
        signup: 'referral_signup_bonus',
        commission: 'referral_commission',
        milestone: 'referral_milestone',
      };
      if (typeMap[type]) query.type = typeMap[type];
    } else {
      query.type = { $in: ['referral_signup_bonus', 'referral_commission', 'referral_milestone', 'referral_admin_adjustment'] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('metadata.refereeId', 'username')
        .populate('metadata.referralId'),
      Transaction.countDocuments(query),
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

// ── POST /api/referral/apply ──
const applyReferralCode = async (req, res, next) => {
  try {
    const { code } = req.body;
    const userId = req.user._id;

    // Check if user already has a referral
    const existing = await Referral.findOne({ referee: userId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'You have already used a referral code' });
    }

    // Check if account is too old (7 days limit)
    const user = req.user;
    const daysSinceCreation = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation > 7) {
      return res.status(400).json({ success: false, error: 'Referral codes can only be applied within 7 days of account creation' });
    }

    // Check if user has made any trades
    const Trade = require('../models/Trade');
    const hasTrades = await Trade.exists({ user: userId });
    if (hasTrades) {
      return res.status(400).json({ success: false, error: 'Cannot apply referral code after making trades' });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const result = await referralService.attributeReferral({
      refereeUserId: userId,
      code,
      ipAddress,
    });

    if (!result.success) {
      const errorMap = {
        code_not_found: 'Invalid referral code',
        code_banned: 'This referral code has been banned',
        referrer_not_found: 'Referrer not found',
        self_referral: 'Cannot refer yourself',
        referrer_banned: 'This referrer has been banned',
        already_referred: 'You have already used a referral code',
        ip_rate_limited: 'Too many referrals from this location',
        disabled: 'Referral program is currently disabled',
      };
      return res.status(400).json({ success: false, error: errorMap[result.reason] || 'Failed to apply referral code' });
    }

    res.json({ success: true, message: 'Referral code applied successfully' });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/referral/validate/:code ──
const validateReferralCodePublic = async (req, res, next) => {
  try {
    const { code } = req.params;

    const ReferralCode = require('../models/ReferralCode');
    const ReferralConfig = require('../models/ReferralConfig');

    // Check program is enabled
    let config = await ReferralConfig.findById('singleton');
    if (!config || !config.enabled) {
      return res.json({ valid: false, error: 'Referral program is currently disabled' });
    }

    // Look up the code
    const refCode = await ReferralCode.findOne({ code: code.toUpperCase() }).populate('owner', 'username');
    if (!refCode) {
      return res.json({ valid: false, error: 'Invalid referral code' });
    }
    if (refCode.isBanned) {
      return res.json({ valid: false, error: 'This referral code has been banned' });
    }
    if (!refCode.owner) {
      return res.json({ valid: false, error: 'Invalid referral code' });
    }

    res.json({
      valid: true,
      code: refCode.code,
      referrerUsername: refCode.owner.username || 'Unknown',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyReferral,
  getMyReferralHistory,
  applyReferralCode,
  validateReferralCodePublic,
};
