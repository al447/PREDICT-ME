import { create } from 'zustand';
import { notificationAPI } from '../services/api';

// Map notification type to icon
const ICON_MAP = {
  trade: '📈',
  deposit: '💰',
  withdrawal: '💸',
  market: '📊',
  system: '🎉',
  price: '📉',
};

// Map notification type to default link
const LINK_MAP = {
  trade: '/portfolio',
  deposit: '/deposit',
  withdrawal: '/withdraw',
  market: '/',
  system: '/',
  price: '/portfolio',
};

// Convert backend notification to frontend format
const formatNotification = (n) => ({
  id: n._id,
  type: n.type,
  title: n.title,
  message: n.message,
  timestamp: n.createdAt,
  read: n.read,
  icon: ICON_MAP[n.type] || '�',
  link: n.data?.link || LINK_MAP[n.type] || '/',
  data: n.data,
});

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  loading: false,
  error: null,

  // Fetch notifications from API
  fetchNotifications: async (params = {}) => {
    try {
      set({ loading: true, error: null });
      const response = await notificationAPI.getNotifications(params);
      
      if (response.data.success) {
        const notifications = response.data.notifications.map(formatNotification);
        set({ 
          notifications, 
          unreadCount: response.data.unreadCount,
          loading: false 
        });
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ error: error.message, loading: false });
    }
  },

  // Fetch unread count only
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

  addNotification: (notification) =>
    set((s) => ({
      notifications: [
        { 
          ...notification, 
          id: notification.id || `n_${Date.now()}`, 
          timestamp: notification.timestamp || new Date().toISOString(), 
          read: false 
        },
        ...s.notifications,
      ],
      unreadCount: s.unreadCount + 1,
    })),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));

export default useNotificationStore;
