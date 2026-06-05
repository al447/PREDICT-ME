const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
  }
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      console.error('[AdminAuth] ADMIN_JWT_SECRET is not set — refusing all admin requests');
      return res.status(500).json({ success: false, error: 'Server misconfiguration' });
    }
    const decoded = jwt.verify(token, secret);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const admin = await User.findById(decoded.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access revoked' });
    }
    if (!admin.isActive) {
      return res.status(403).json({ success: false, error: 'Account suspended' });
    }
    req.user = admin;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Not authorized, invalid token' });
  }
};

module.exports = { adminAuth };
