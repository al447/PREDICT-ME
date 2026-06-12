const User = require('../models/User');
const Market = require('../models/Market');
const Trade = require('../models/Trade');
const AdminAuditLog = require('../models/AdminAuditLog');

// GET /api/admin/dashboard/stats
const stats = async (req, res, next) => {
  try {
    const now = new Date();
    const startOf7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const startOf24h = new Date(now - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers, newUsersToday,
      totalMarkets, activeMarkets, closedMarkets, resolvedMarkets,
      totalTrades, trades24h,
      volumeResult, volume24hResult, volume7dResult,
      active7dUserIds, pendingResolutionCount,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      Market.countDocuments(),
      Market.countDocuments({ status: 'active' }),
      Market.countDocuments({ status: 'closed' }),
      Market.countDocuments({ status: 'resolved' }),
      Trade.countDocuments(),
      Trade.countDocuments({ createdAt: { $gte: startOf24h } }),
      Trade.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Trade.aggregate([{ $match: { createdAt: { $gte: startOf24h } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Trade.aggregate([{ $match: { createdAt: { $gte: startOf7d } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Trade.distinct('user', { createdAt: { $gte: startOf7d } }),
      Market.countDocuments({ $or: [{ status: 'closed' }, { status: 'active', endDate: { $lt: now } }] }),
    ]);

    const totalVolume = volumeResult[0]?.total || 0;
    const volume24h = volume24hResult[0]?.total || 0;
    const volume7d = volume7dResult[0]?.total || 0;
    const platformFees = totalVolume * 0.02;

    res.json({
      success: true,
      stats: {
        users: { total: totalUsers, active7d: active7dUserIds.length, newToday: newUsersToday },
        markets: { total: totalMarkets, active: activeMarkets, closed: closedMarkets, resolved: resolvedMarkets, pendingResolution: pendingResolutionCount },
        trades: { total: totalTrades, last24h: trades24h, totalVolume, volume24h, volume7d },
        platformFees: Math.round(platformFees * 100) / 100,
      },
    });
  } catch (e) { next(e); }
};

// GET /api/admin/dashboard/volume-chart?days=30
const volumeChart = async (req, res, next) => {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 30);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Trade.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          volume: { $sum: '$amount' },
          trades: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', volume: 1, trades: 1 } },
    ]);

    res.json({ success: true, data });
  } catch (e) { next(e); }
};

// GET /api/admin/dashboard/recent-activity?limit=20
const recentActivity = async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const [recentTrades, recentAuditLogs] = await Promise.all([
      Trade.find().sort({ createdAt: -1 }).limit(limit).populate('user', 'email username walletAddress').populate('market', 'title slug').lean(),
      AdminAuditLog.find().sort({ createdAt: -1 }).limit(limit).populate('admin', 'email username').lean(),
    ]);

    const tradeActivity = recentTrades.map((t) => ({
      type: 'trade',
      actor: t.user,
      target: t.market,
      details: { outcome: t.outcome, amount: t.amount, shares: t.shares, status: t.status },
      createdAt: t.createdAt,
    }));

    const auditActivity = recentAuditLogs.map((l) => ({
      type: l.action,
      actor: l.admin,
      target: { _id: l.targetId, type: l.targetType },
      details: l.details,
      txHash: l.txHash,
      createdAt: l.createdAt,
    }));

    const merged = [...tradeActivity, ...auditActivity].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

    res.json({ success: true, activity: merged });
  } catch (e) { next(e); }
};

// GET /api/admin/dashboard/trending-markets?limit=10
const trending = async (req, res, next) => {
  try {
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const startOf24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const topMarketIds = await Trade.aggregate([
      { $match: { createdAt: { $gte: startOf24h } } },
      { $group: { _id: '$market', volume24h: { $sum: '$amount' }, tradeCount: { $sum: 1 } } },
      { $sort: { volume24h: -1 } },
      { $limit: limit },
    ]);

    const marketIds = topMarketIds.map((m) => m._id);
    const markets = await Market.find({ _id: { $in: marketIds } }).select('title slug status image categorySlug volume').lean();

    const marketMap = {};
    markets.forEach((m) => { marketMap[m._id.toString()] = m; });

    const result = topMarketIds
      .map((t) => ({ ...marketMap[t._id.toString()], volume24h: t.volume24h, tradeCount24h: t.tradeCount }))
      .filter(Boolean);

    res.json({ success: true, markets: result });
  } catch (e) { next(e); }
};

// GET /api/admin/dashboard/audit-log?page=1&limit=50&action=&adminId=
const auditLog = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.adminId) filter.admin = req.query.adminId;

    const [logs, total] = await Promise.all([
      AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('admin', 'email username').lean(),
      AdminAuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, logs, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
};

module.exports = { stats, volumeChart, recentActivity, trending, auditLog };
