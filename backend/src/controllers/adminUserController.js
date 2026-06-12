const User = require('../models/User');
const Trade = require('../models/Trade');
const audit = require('../services/auditService');
const walletService = require('../services/walletService');

// GET /api/admin/users
const list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escaped, $options: 'i' };
      filter.$or = [{ email: regex }, { username: regex }, { walletAddress: regex }];
    }
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

    const sortMap = { createdAt: { createdAt: -1 }, balance: { balance: -1 } };
    const sort = sortMap[req.query.sort] || { createdAt: -1 };

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).select('email username role balance walletAddress isActive avatar authProvider createdAt referralCode referredBy').lean(),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);
    const tradeCounts = await Trade.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
    ]);
    const tradeCountMap = {};
    tradeCounts.forEach((t) => { tradeCountMap[t._id.toString()] = t.count; });

    const usersWithStats = users.map((u) => ({ ...u, tradeCount: tradeCountMap[u._id.toString()] || 0 }));

    res.json({ success: true, users: usersWithStats, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
};

// GET /api/admin/users/:id
const getOne = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-__v');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const [tradeStats, recentTrades, activePositions] = await Promise.all([
      Trade.aggregate([
        { $match: { user: user._id } },
        {
          $group: {
            _id: null,
            tradeCount: { $sum: 1 },
            totalVolume: { $sum: '$amount' },
            winCount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            lossCount: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          },
        },
      ]),
      Trade.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).populate('market', 'title slug status').lean(),
      Trade.find({ user: user._id, status: 'open' }).populate('market', 'title slug status').lean(),
    ]);

    const stats = tradeStats[0] || { tradeCount: 0, totalVolume: 0, winCount: 0, lossCount: 0 };
    const totalSettled = stats.winCount + stats.lossCount;
    stats.winRate = totalSettled > 0 ? Math.round((stats.winCount / totalSettled) * 100) : 0;

    // Fetch live on-chain Safe balance if the user has a non-custodial wallet
    let safeUsdcBalance = null;
    const safeProxy = user.smartWallet?.proxy;
    if (safeProxy) {
      try {
        safeUsdcBalance = await walletService.getSmartWalletBalance(safeProxy);
      } catch (err) {
        console.warn('[Admin] Could not fetch Safe balance for', safeProxy, err.message);
      }
    }

    res.json({ success: true, user, stats, recentTrades, activePositions, safeUsdcBalance });
  } catch (e) { next(e); }
};

// PATCH /api/admin/users/:id/ban
const ban = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot ban yourself' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.isActive = false;
    await user.save();

    await audit.log({ admin: req.user._id, action: 'user_ban', targetType: 'user', targetId: user._id, details: { email: user.email, username: user.username }, ipAddress: req.ip });

    res.json({ success: true, user });
  } catch (e) { next(e); }
};

// PATCH /api/admin/users/:id/unban
const unban = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.isActive = true;
    await user.save();

    await audit.log({ admin: req.user._id, action: 'user_unban', targetType: 'user', targetId: user._id, details: { email: user.email }, ipAddress: req.ip });

    res.json({ success: true, user });
  } catch (e) { next(e); }
};

// PATCH /api/admin/users/:id/balance
const adjustBalance = async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    if (amount === undefined || isNaN(amount)) {
      return res.status(400).json({ success: false, error: 'Amount is required and must be a number' });
    }
    if (!reason || reason.trim().length < 10 || reason.trim().length > 500) {
      return res.status(400).json({ success: false, error: 'Reason must be 10-500 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Non-custodial users hold funds in their own Gnosis Safe on-chain.
    // Adjusting the custodial balance field has no effect on their real funds.
    if (user.smartWallet?.deployed) {
      return res.status(400).json({
        success: false,
        error: 'This user has a deployed non-custodial Safe wallet. Their balance is held on-chain and cannot be adjusted here. Use the blockchain directly or a contract-level admin action.',
        safeProxy: user.smartWallet.proxy,
      });
    }

    const before = user.balance;
    const newBalance = before + Number(amount);
    if (newBalance < 0) {
      return res.status(400).json({ success: false, error: 'Cannot result in negative balance' });
    }

    user.balance = newBalance;
    await user.save();

    await audit.log({ admin: req.user._id, action: 'balance_adjust', targetType: 'user', targetId: user._id, details: { delta: amount, reason: reason.trim(), before, after: newBalance }, ipAddress: req.ip });

    res.json({ success: true, user, newBalance });
  } catch (e) { next(e); }
};

// PATCH /api/admin/users/:id/role
const changeRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Role must be admin or user' });
    }
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot change your own role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (user.role === 'admin' && role === 'user') {
      const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: 'Cannot demote the last admin' });
      }
    }

    if (role === 'admin' && !user.email) {
      return res.status(400).json({ success: false, error: 'User must have an email address to be promoted to admin' });
    }

    const fromRole = user.role;
    user.role = role;
    await user.save();

    await audit.log({ admin: req.user._id, action: 'role_change', targetType: 'user', targetId: user._id, details: { from: fromRole, to: role, email: user.email }, ipAddress: req.ip });

    res.json({ success: true, user });
  } catch (e) { next(e); }
};

module.exports = { list, getOne, ban, unban, adjustBalance, changeRole };
