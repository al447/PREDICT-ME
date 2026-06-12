/**
 * notificationService.js — Polymarket-style notification engine
 *
 * Supports:
 *   - Order fills, market resolution, position outcomes
 *   - Deposits & withdrawals
 *   - Price alerts & price movements
 *   - Whale trade alerts
 *   - Market closing reminders
 *   - System & welcome notifications
 *   - Real-time WebSocket push
 *   - User notification preferences
 */

const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');

let _websocketService = null;
function getWs() {
  if (!_websocketService) {
    try { _websocketService = require('./websocketService'); } catch {}
  }
  return _websocketService;
}

async function getPrefs(userId) {
  let prefs = await NotificationPreference.findOne({ user: userId }).lean();
  if (!prefs) {
    prefs = await NotificationPreference.create({ user: userId });
    return prefs.toObject ? prefs.toObject() : prefs;
  }
  return prefs;
}

function shouldSend(prefs, category) {
  if (!prefs?.categories) return true;
  return prefs.categories[category] !== false;
}

async function create(userId, { type, title, message, data = {}, actionUrl = null, priority = 'normal' }) {
  try {
    const notification = await Notification.create({
      user: userId, type, title, message, data, actionUrl, priority,
      expiresAt: priority === 'low' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
    });

    // Push via WebSocket in real-time
    const ws = getWs();
    if (ws?.sendToUser) {
      ws.sendToUser(userId.toString(), {
        type: 'notification',
        payload: {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          actionUrl: notification.actionUrl,
          priority: notification.priority,
          createdAt: notification.createdAt,
          read: false,
        },
      });
    }

    return notification;
  } catch (err) {
    console.error(`[Notification] Failed to create: ${err.message}`);
    return null;
  }
}

// ── Order Fill ──

async function orderFilled(userId, { orderId, side, price, size, marketTitle, conditionId, partial = false }) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'orderFills')) return null;

  const verb = partial ? 'partially filled' : 'filled';
  const action = side === 'buy' ? 'Buy' : 'Sell';
  return create(userId, {
    type: 'order_fill',
    title: `Order ${verb}`,
    message: `Your ${action} order for ${size.toFixed(2)} shares at $${price.toFixed(2)} was ${verb}${marketTitle ? ` on "${marketTitle.substring(0, 50)}"` : ''}.`,
    data: { orderId, side, price, size, conditionId },
    actionUrl: conditionId ? `/portfolio` : '/portfolio',
    priority: 'normal',
  });
}

async function orderCancelled(userId, { orderId, side, size, marketTitle }) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'orderFills')) return null;

  return create(userId, {
    type: 'order_cancelled',
    title: 'Order Cancelled',
    message: `Your ${side} order for ${size.toFixed(2)} shares${marketTitle ? ` on "${marketTitle.substring(0, 50)}"` : ''} was cancelled.`,
    data: { orderId, side, size },
    actionUrl: '/portfolio',
    priority: 'low',
  });
}

// ── Trade Executed ──

async function tradeExecuted(userId, trade, market) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'tradeExecutions')) return null;

  const action = trade.type === 'buy' ? 'bought' : 'sold';
  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'trade',
    title: 'Trade Executed',
    message: `You ${action} $${(trade.amount || 0).toFixed(2)} of "${title}${market?.title?.length > 50 ? '...' : ''}"`,
    data: { tradeId: trade._id, marketId: market?._id, amount: trade.amount, type: trade.type },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/portfolio',
    priority: 'normal',
  });
}

// ── Market Resolution ──

async function marketResolved(userId, market, outcome) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'marketResolution')) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'market_resolved',
    title: 'Market Resolved',
    message: `"${title}${market?.title?.length > 50 ? '...' : ''}" resolved to ${outcome}.`,
    data: { marketId: market._id, outcome, conditionId: market.conditionId },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/portfolio',
    priority: 'high',
  });
}

async function marketWon(userId, market, winnings) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'positionUpdates')) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'position_won',
    title: 'You Won!',
    message: winnings > 0
      ? `You won $${winnings.toFixed(2)} on "${title}${market?.title?.length > 50 ? '...' : ''}"! Redeem your winnings now.`
      : `Your position on "${title}${market?.title?.length > 50 ? '...' : ''}" won! Redeem your winnings.`,
    data: { marketId: market._id, winnings, conditionId: market.conditionId },
    actionUrl: market?.conditionId ? `/portfolio` : '/portfolio',
    priority: 'urgent',
  });
}

async function positionLost(userId, market) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'positionUpdates')) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'position_lost',
    title: 'Position Settled',
    message: `Your position on "${title}${market?.title?.length > 50 ? '...' : ''}" did not win.`,
    data: { marketId: market._id },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/portfolio',
    priority: 'normal',
  });
}

async function positionRefunded(userId, market) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'positionUpdates')) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'position_refunded',
    title: 'Position Refunded',
    message: `"${title}${market?.title?.length > 50 ? '...' : ''}" was cancelled. Your position has been refunded.`,
    data: { marketId: market._id },
    actionUrl: '/portfolio',
    priority: 'high',
  });
}

// ── Deposits ──

async function depositReceived(userId, deposit) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'deposits')) return null;

  const methods = { card: 'Card', bank: 'Bank Transfer', crypto: 'Crypto', apple_pay: 'Apple Pay', google_pay: 'Google Pay' };
  return create(userId, {
    type: 'deposit',
    title: 'Deposit Confirmed',
    message: `Your ${methods[deposit.method] || deposit.method} deposit of $${(deposit.amountUSD || deposit.amount || 0).toFixed(2)} has been credited.`,
    data: { depositId: deposit._id, amount: deposit.amountUSD || deposit.amount, method: deposit.method },
    actionUrl: '/deposit',
    priority: 'high',
  });
}

async function depositPending(userId, deposit) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'deposits')) return null;

  return create(userId, {
    type: 'deposit_pending',
    title: 'Deposit Processing',
    message: `Your deposit of $${(deposit.amountUSD || deposit.amount || 0).toFixed(2)} is being processed. We'll notify you when it's confirmed.`,
    data: { depositId: deposit._id, amount: deposit.amountUSD || deposit.amount },
    actionUrl: '/deposit',
    priority: 'normal',
  });
}

// ── Withdrawals ──

async function withdrawalProcessed(userId, withdrawal) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'withdrawals')) return null;

  return create(userId, {
    type: 'withdrawal',
    title: 'Withdrawal Complete',
    message: `Your withdrawal of $${(withdrawal.amount || withdrawal.fromAmountUsdc || 0).toFixed(2)} has been processed.`,
    data: { withdrawalId: withdrawal._id, amount: withdrawal.amount || withdrawal.fromAmountUsdc },
    actionUrl: '/withdraw',
    priority: 'high',
  });
}

async function withdrawalPending(userId, withdrawal) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'withdrawals')) return null;

  return create(userId, {
    type: 'withdrawal_pending',
    title: 'Withdrawal In Progress',
    message: `Your withdrawal of $${(withdrawal.amount || withdrawal.fromAmountUsdc || 0).toFixed(2)} is being processed.`,
    data: { withdrawalId: withdrawal._id, amount: withdrawal.amount || withdrawal.fromAmountUsdc },
    actionUrl: '/withdraw',
    priority: 'normal',
  });
}

// ── Price Alerts ──

async function priceAlert(userId, market, { targetPrice, currentPrice, direction, outcome }) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'priceAlerts')) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'price_alert',
    title: 'Price Alert Triggered',
    message: `"${title}" ${outcome || 'Yes'} price hit $${currentPrice.toFixed(2)} (your target: $${targetPrice.toFixed(2)} ${direction}).`,
    data: { marketId: market._id, targetPrice, currentPrice, direction, outcome },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/',
    priority: 'high',
  });
}

async function priceMovement(userId, market, { priceChange, currentPrice, outcome }) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'priceMovements')) return null;

  const dir = priceChange >= 0 ? 'up' : 'down';
  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'price_movement',
    title: 'Price Movement',
    message: `"${title}" moved ${dir} ${Math.abs(priceChange).toFixed(1)}% to $${currentPrice.toFixed(2)}.`,
    data: { marketId: market._id, priceChange, currentPrice, outcome },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/',
    priority: 'normal',
  });
}

// ── Whale Alerts ──

async function whaleTrade(userId, { market, tradeSize, side, traderAddress }) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'whaleAlerts')) return null;
  if (tradeSize < (prefs.whaleTradeThreshold || 10000)) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  return create(userId, {
    type: 'whale_trade',
    title: 'Whale Trade Detected',
    message: `$${tradeSize.toLocaleString()} ${side} on "${title}" by ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}.`,
    data: { marketId: market._id, tradeSize, side, traderAddress },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/',
    priority: 'normal',
  });
}

// ── Market Closing ──

async function marketClosing(userId, market, hoursRemaining) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'marketClosing')) return null;

  const title = market?.title?.substring(0, 50) || 'Unknown Market';
  const timeStr = hoursRemaining >= 24 ? `${Math.round(hoursRemaining / 24)} days` : `${hoursRemaining} hours`;
  return create(userId, {
    type: 'market_closing',
    title: 'Market Closing Soon',
    message: `"${title}" closes in ${timeStr}. Place your final predictions now.`,
    data: { marketId: market._id, hoursRemaining },
    actionUrl: market?.slug ? `/market/${market.slug}` : '/',
    priority: 'normal',
  });
}

// ── System & Welcome ──

async function systemNotification(userId, title, message, actionUrl = null) {
  return create(userId, {
    type: 'system',
    title,
    message,
    actionUrl,
    priority: 'normal',
  });
}

async function welcomeNotification(userId, username) {
  return create(userId, {
    type: 'welcome',
    title: 'Welcome to PredictMe!',
    message: `Hi ${username || 'there'}, welcome to PredictMe! Start exploring markets and make your first prediction.`,
    actionUrl: '/',
    priority: 'high',
  });
}

async function referralBonus(userId, { amount, referredUser }) {
  const prefs = await getPrefs(userId);
  if (!shouldSend(prefs, 'referral')) return null;

  return create(userId, {
    type: 'referral',
    title: 'Referral Bonus!',
    message: `You earned $${amount.toFixed(2)} from your referral${referredUser ? ` of ${referredUser}` : ''}!`,
    data: { amount, referredUser },
    actionUrl: '/referral',
    priority: 'high',
  });
}

// ── Preference Management ──

async function getPreferences(userId) {
  return getPrefs(userId);
}

async function updatePreferences(userId, updates) {
  const prefs = await NotificationPreference.findOneAndUpdate(
    { user: userId },
    { $set: updates },
    { new: true, upsert: true }
  );
  return prefs;
}

async function addPriceAlert(userId, { marketId, conditionId, targetPrice, direction, outcome }) {
  const prefs = await NotificationPreference.findOneAndUpdate(
    { user: userId },
    { $push: { priceAlerts: { marketId, conditionId, targetPrice, direction, outcome } } },
    { new: true, upsert: true }
  );
  return prefs.priceAlerts[prefs.priceAlerts.length - 1];
}

async function removePriceAlert(userId, alertId) {
  await NotificationPreference.findOneAndUpdate(
    { user: userId },
    { $pull: { priceAlerts: { _id: alertId } } }
  );
}

// ── Bulk: Notify all users with positions in a market ──

async function notifyMarketParticipants(marketId, notifyFn) {
  const Trade = require('../models/Trade');
  const trades = await Trade.find({ market: marketId }).select('user').lean();
  const userIds = [...new Set(trades.map(t => t.user.toString()))];

  const results = [];
  for (const uid of userIds) {
    try {
      const result = await notifyFn(uid);
      if (result) results.push(result);
    } catch (err) {
      console.warn(`[Notification] Failed for user ${uid}: ${err.message}`);
    }
  }
  return results;
}

module.exports = {
  create,
  orderFilled,
  orderCancelled,
  tradeExecuted,
  marketResolved,
  marketWon,
  positionLost,
  positionRefunded,
  depositReceived,
  depositPending,
  withdrawalProcessed,
  withdrawalPending,
  priceAlert,
  priceMovement,
  whaleTrade,
  marketClosing,
  systemNotification,
  welcomeNotification,
  referralBonus,
  getPreferences,
  updatePreferences,
  addPriceAlert,
  removePriceAlert,
  notifyMarketParticipants,
  // Legacy compat
  createNotification: (userId, type, title, message, data) => create(userId, { type, title, message, data }),
};
