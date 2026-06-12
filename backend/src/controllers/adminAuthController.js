const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const audit = require('../services/auditService');

const SECRET = () => process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const admin = await User.findOne({ email: email.toLowerCase().trim(), role: 'admin' }).select('+password');
    if (!admin || !admin.password) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    if (!admin.isActive) {
      return res.status(403).json({ success: false, error: 'Account suspended' });
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign({ userId: admin._id, role: 'admin' }, SECRET(), { expiresIn: '7d' });

    await audit.log({
      admin: admin._id,
      action: 'admin_login',
      targetType: 'system',
      details: { email: admin.email },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (e) {
    next(e);
  }
};

const me = async (req, res) => {
  res.json({
    success: true,
    admin: {
      id: req.user._id,
      email: req.user.email,
      username: req.user.username,
      role: req.user.role,
      lastLogin: req.user.lastLogin,
    },
  });
};

const logout = async (req, res) => {
  res.json({ success: true });
};

const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }
    const admin = await User.findById(req.user._id).select('+password');
    if (!admin.password) {
      return res.status(400).json({ success: false, error: 'No password set for this account' });
    }
    const ok = await bcrypt.compare(oldPassword, admin.password);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Old password incorrect' });
    }
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    next(e);
  }
};

module.exports = { login, me, logout, changePassword };
