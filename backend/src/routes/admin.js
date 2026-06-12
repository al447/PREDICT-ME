const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminAuth');
const auth = require('../controllers/adminAuthController');
const mkt = require('../controllers/adminMarketController');
const usr = require('../controllers/adminUserController');
const dash = require('../controllers/adminDashboardController');

// Auth (no middleware for login)
router.post('/auth/login', auth.login);
router.post('/auth/logout', adminAuth, auth.logout);
router.get('/auth/me', adminAuth, auth.me);
router.post('/auth/change-password', adminAuth, auth.changePassword);

// Markets
router.get('/markets', adminAuth, mkt.list);
router.get('/markets/:id', adminAuth, mkt.getOne);
router.post('/markets', adminAuth, mkt.create);
router.patch('/markets/:id', adminAuth, mkt.update);
router.post('/markets/:id/close', adminAuth, mkt.close);
router.post('/markets/:id/reopen', adminAuth, mkt.reopen);
router.post('/markets/:id/resolve', adminAuth, mkt.resolve);
router.delete('/markets/:id', adminAuth, mkt.remove);

// Users
router.get('/users', adminAuth, usr.list);
router.get('/users/:id', adminAuth, usr.getOne);
router.patch('/users/:id/ban', adminAuth, usr.ban);
router.patch('/users/:id/unban', adminAuth, usr.unban);
router.patch('/users/:id/balance', adminAuth, usr.adjustBalance);
router.patch('/users/:id/role', adminAuth, usr.changeRole);

// Dashboard
router.get('/dashboard/stats', adminAuth, dash.stats);
router.get('/dashboard/volume-chart', adminAuth, dash.volumeChart);
router.get('/dashboard/recent-activity', adminAuth, dash.recentActivity);
router.get('/dashboard/trending-markets', adminAuth, dash.trending);
router.get('/dashboard/audit-log', adminAuth, dash.auditLog);

module.exports = router;
