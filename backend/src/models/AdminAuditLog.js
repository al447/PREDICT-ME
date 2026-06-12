const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      required: true,
      index: true,
      enum: [
        'admin_login', 'market_create', 'market_edit', 'market_close',
        'market_reopen', 'market_resolve', 'market_delete',
        'user_ban', 'user_unban', 'balance_adjust', 'role_change',
        'referral.adjust_balance', 'referral.ban', 'referral.unban',
        'referral.force_qualify', 'referral.revoke', 'referral.config_update',
      ],
    },
    targetType: { type: String, enum: ['market', 'user', 'system'] },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    txHash: { type: String, default: null },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', auditLogSchema);
