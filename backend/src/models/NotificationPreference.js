const mongoose = require('mongoose');

const priceAlertSchema = new mongoose.Schema({
  marketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Market', required: true },
  conditionId: { type: String },
  targetPrice: { type: Number, required: true },
  direction: { type: String, enum: ['above', 'below'], required: true },
  outcome: { type: String, default: 'Yes' },
  triggered: { type: Boolean, default: false },
  triggeredAt: { type: Date },
}, { _id: true, timestamps: true });

const notificationPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  // Channel preferences
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push:  { type: Boolean, default: false },
  },

  // Per-category toggles (Polymarket-style)
  categories: {
    orderFills:       { type: Boolean, default: true },
    tradeExecutions:  { type: Boolean, default: true },
    marketResolution: { type: Boolean, default: true },
    positionUpdates:  { type: Boolean, default: true },
    deposits:         { type: Boolean, default: true },
    withdrawals:      { type: Boolean, default: true },
    priceAlerts:      { type: Boolean, default: true },
    priceMovements:   { type: Boolean, default: false },
    whaleAlerts:      { type: Boolean, default: false },
    marketClosing:    { type: Boolean, default: true },
    system:           { type: Boolean, default: true },
    referral:         { type: Boolean, default: true },
  },

  // Price alert thresholds
  priceMovementThreshold: { type: Number, default: 10 }, // % change to trigger
  whaleTradeThreshold: { type: Number, default: 10000 }, // USD amount

  // Custom price alerts
  priceAlerts: [priceAlertSchema],

  // Digest settings
  digestFrequency: { type: String, enum: ['instant', 'hourly', 'daily', 'off'], default: 'instant' },

  // Quiet hours
  quietHoursEnabled: { type: Boolean, default: false },
  quietHoursStart: { type: Number, default: 22 }, // 10 PM
  quietHoursEnd: { type: Number, default: 8 },    // 8 AM
  timezone: { type: String, default: 'UTC' },
}, { timestamps: true });

notificationPreferenceSchema.index({ 'priceAlerts.marketId': 1, 'priceAlerts.triggered': 1 });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
