const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const notificationService = require('../services/notificationService');
const { protect } = require('../middleware/auth');

// GET /api/notifications — paginated, filterable
router.get('/', protect, async (req, res) => {
  try {
    const { limit = 20, offset = 0, unreadOnly, type } = req.query;
    
    const query = { user: req.user._id, dismissed: { $ne: true } };
    if (unreadOnly === 'true') query.read = false;
    if (type) query.type = type;
    
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: req.user._id, read: false, dismissed: { $ne: true } }),
    ]);
    
    res.json({ success: true, notifications, total, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/notifications/count — lightweight unread count
router.get('/count', protect, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      user: req.user._id, read: false, dismissed: { $ne: true },
    });
    res.json({ success: true, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', protect, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true, count: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/notifications/:id/dismiss
router.put('/:id/dismiss', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { dismissed: true, read: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/notifications — clear all (dismiss)
router.delete('/', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id },
      { dismissed: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Notification Preferences ──

// GET /api/notifications/preferences
router.get('/preferences', protect, async (req, res) => {
  try {
    const prefs = await notificationService.getPreferences(req.user._id);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/notifications/preferences
router.put('/preferences', protect, async (req, res) => {
  try {
    const allowed = ['channels', 'categories', 'priceMovementThreshold', 'whaleTradeThreshold', 'digestFrequency', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd', 'timezone'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const prefs = await notificationService.updatePreferences(req.user._id, updates);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Price Alerts ──

// POST /api/notifications/price-alerts
router.post('/price-alerts', protect, async (req, res) => {
  try {
    const { marketId, conditionId, targetPrice, direction, outcome } = req.body;
    if (!marketId || targetPrice == null || !direction) {
      return res.status(400).json({ success: false, error: 'marketId, targetPrice, and direction are required' });
    }
    const alert = await notificationService.addPriceAlert(req.user._id, {
      marketId, conditionId, targetPrice: parseFloat(targetPrice), direction, outcome,
    });
    res.json({ success: true, alert });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/notifications/price-alerts/:alertId
router.delete('/price-alerts/:alertId', protect, async (req, res) => {
  try {
    await notificationService.removePriceAlert(req.user._id, req.params.alertId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
