/**
 * priceAlertCronService.js — Checks user price alerts and market-closing reminders
 *
 * Runs periodically to:
 *   1. Check if any user's price alerts have been triggered
 *   2. Notify users about markets closing within 24h
 */

const Market = require('../models/Market');
const Trade = require('../models/Trade');
const NotificationPreference = require('../models/NotificationPreference');
const notificationService = require('./notificationService');

const ALERT_CHECK_MS = parseInt(process.env.PRICE_ALERT_CHECK_MS || '60000');
let _timer = null;

async function checkPriceAlerts() {
  try {
    const prefs = await NotificationPreference.find({
      'priceAlerts.triggered': false,
    }).populate('priceAlerts.marketId', 'title slug outcomes').lean();

    for (const pref of prefs) {
      for (const alert of pref.priceAlerts) {
        if (alert.triggered) continue;

        const market = alert.marketId;
        if (!market?.outcomes) continue;

        const outcomeData = market.outcomes.find(o =>
          o.name === (alert.outcome || 'Yes')
        );
        if (!outcomeData) continue;

        const currentPrice = (outcomeData.price || outcomeData.probability || 50) / 100;
        const target = alert.targetPrice;
        const hit = alert.direction === 'above'
          ? currentPrice >= target
          : currentPrice <= target;

        if (hit) {
          await NotificationPreference.updateOne(
            { _id: pref._id, 'priceAlerts._id': alert._id },
            { $set: { 'priceAlerts.$.triggered': true, 'priceAlerts.$.triggeredAt': new Date() } }
          );
          await notificationService.priceAlert(pref.user, market, {
            targetPrice: target,
            currentPrice,
            direction: alert.direction,
            outcome: alert.outcome,
          });
        }
      }
    }
  } catch (err) {
    console.error('[PriceAlertCron] checkPriceAlerts error:', err.message);
  }
}

async function checkMarketClosing() {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const closingMarkets = await Market.find({
      status: 'active',
      closeDate: { $gte: in24h, $lt: in25h },
    }).select('_id title slug').lean();

    for (const market of closingMarkets) {
      const hoursRemaining = Math.round(
        (new Date(market.closeDate).getTime() - now.getTime()) / (60 * 60 * 1000)
      );

      const trades = await Trade.find({ market: market._id, status: 'open' })
        .select('user')
        .lean();

      const userIds = [...new Set(trades.map(t => t.user.toString()))];

      for (const userId of userIds) {
        await notificationService.marketClosing(userId, market, hoursRemaining);
      }
    }
  } catch (err) {
    console.error('[PriceAlertCron] checkMarketClosing error:', err.message);
  }
}

function start() {
  if (_timer) return;
  _timer = setInterval(async () => {
    await checkPriceAlerts();
    await checkMarketClosing();
  }, ALERT_CHECK_MS);
  console.log(`[PriceAlertCron] Started (${ALERT_CHECK_MS}ms interval)`);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, checkPriceAlerts, checkMarketClosing };
