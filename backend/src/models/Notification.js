const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: [
      'order_fill',       // Order filled (partial or full)
      'order_cancelled',  // Order was cancelled
      'trade',            // Trade executed
      'market_resolved',  // Market resolved (you have a position)
      'position_won',     // Your position won
      'position_lost',    // Your position lost
      'position_refunded',// Market cancelled, position refunded
      'deposit',          // Deposit confirmed
      'deposit_pending',  // Deposit being processed
      'withdrawal',       // Withdrawal processed
      'withdrawal_pending',// Withdrawal in progress
      'price_alert',      // Watched market hit your target price
      'price_movement',   // Significant price movement on a position
      'whale_trade',      // Large trade on a market you watch
      'market_closing',   // Market approaching close date
      'system',           // System announcement
      'welcome',          // Welcome message for new users
      'referral',         // Referral bonus received
      // Legacy types (kept for backward compat)
      'market', 'price',
    ],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  dismissed: { type: Boolean, default: false },
  actionUrl: { type: String, default: null },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, dismissed: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
