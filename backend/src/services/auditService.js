const AdminAuditLog = require('../models/AdminAuditLog');

const log = async ({ admin, action, targetType, targetId, details, txHash, ipAddress }) => {
  try {
    await AdminAuditLog.create({ admin, action, targetType, targetId, details: details || {}, txHash: txHash || null, ipAddress });
  } catch (e) {
    console.error('[Audit] Failed to log action:', e.message);
  }
};

module.exports = { log };
