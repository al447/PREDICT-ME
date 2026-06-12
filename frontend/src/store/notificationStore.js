import { create } from 'zustand';
import { notificationAPI } from '../services/api';

const ICON_MAP = {
  order_fill: '✅',
  order_cancelled: '❌',
  trade: '📈',
  market_resolved: '🏁',
  position_won: '🏆',
  position_lost: '📉',
  position_refunded: '💵',
  deposit: '💰',
  deposit_pending: '⏳',
  withdrawal: '💸',
  withdrawal_pending: '⏳',
  price_alert: '🔔',
  price_movement: '📊',
  whale_trade: '🐋',
  market_closing: '⏰',
  system: '📢',
  welcome: '🎉',
  referral: '🎁',
  // Legacy
  market: '📊',
  price: '📉',
};

const LINK_MAP = {
  order_fill: '/portfolio',
  trade: '/portfolio',
  market_resolved: '/',
  position_won: '/portfolio',
  position_lost: '/portfolio',
  deposit: '/deposit',
  withdrawal: '/withdraw',
  price_alert: '/',
  system: '/',
  welcome: '/',
  referral: '/referral',
};

const formatNotification = (n) => ({
  id: n._id || n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  timestamp: n.createdAt || n.timestamp,
  read: n.read || false,
  icon: ICON_MAP[n.type] || '🔔',
  link: n.actionUrl || n.data?.link || LINK_MAP[n.type] || '/',
  data: n.data,
  priority: n.priority || 'normal',
});

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  loading: false,
  error: null,
  preferences: null,
  preferencesLoading: false,

  fetchNotifications: async (params = {}) => {
    try {
      set({ loading: true, error: null });
      const response = await notificationAPI.getNotifications(params);
      if (response.data.success) {
        set({
          notifications: response.data.notifications.map(formatNotification),
          unreadCount: response.data.unreadCount,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ error: error.message, loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const response = await notificationAPI.getUnreadCount();
      if (response.data.success) {
        set({ unreadCount: response.data.unreadCount });
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  closePanel: () => set({ isOpen: false }),

  markAsRead: async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  },

  markAllRead: async () => {
    try {
      await notificationAPI.markAllAsRead();
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  },

  deleteNotification: async (id) => {
    try {
      await notificationAPI.deleteNotification(id);
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
        unreadCount: s.notifications.find((n) => n.id === id && !n.read)
          ? Math.max(0, s.unreadCount - 1)
          : s.unreadCount,
      }));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  clearAll: async () => {
    try {
      await notificationAPI.clearAll();
      set({ notifications: [], unreadCount: 0 });
    } catch (error) {
      console.error('Failed to clear all:', error);
    }
  },

  // Real-time WebSocket notification handler
  addNotification: (notification) => {
    const formatted = formatNotification(notification);
    set((s) => ({
      notifications: [formatted, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + 1,
    }));
  },

  // Preferences
  fetchPreferences: async () => {
    try {
      set({ preferencesLoading: true });
      const response = await notificationAPI.getPreferences();
      if (response.data.success) {
        set({ preferences: response.data.preferences, preferencesLoading: false });
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
      set({ preferencesLoading: false });
    }
  },

  updatePreferences: async (updates) => {
    try {
      const response = await notificationAPI.updatePreferences(updates);
      if (response.data.success) {
        set({ preferences: response.data.preferences });
      }
      return response.data;
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  },

  // Price Alerts
  addPriceAlert: async (data) => {
    try {
      const response = await notificationAPI.addPriceAlert(data);
      if (response.data.success) {
        await get().fetchPreferences();
      }
      return response.data;
    } catch (error) {
      console.error('Failed to add price alert:', error);
      throw error;
    }
  },

  removePriceAlert: async (alertId) => {
    try {
      await notificationAPI.removePriceAlert(alertId);
      await get().fetchPreferences();
    } catch (error) {
      console.error('Failed to remove price alert:', error);
    }
  },
}));

export default useNotificationStore;
