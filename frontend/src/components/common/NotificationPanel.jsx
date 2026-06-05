import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import useNotificationStore from '../../store/notificationStore';

const timeAgo = (ts) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const NotificationPanel = () => {
  const { notifications, isOpen, closePanel, markAsRead, markAllRead, clearAll, unreadCount, fetchNotifications, loading } = useNotificationStore();

  // Fetch full notifications when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const count = unreadCount;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={closePanel} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-20 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--color-text)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Notifications</h3>
                {count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#4f6ef7] text-white font-bold">{count}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                    title="Mark all read"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={closePanel}
                  className="p-1.5 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notifications list */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-10 h-10 mx-auto mb-3 text-[var(--color-text-muted)] opacity-30" />
                  <p className="text-sm text-[var(--color-text-muted)]">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    to={n.link || '/'}
                    onClick={() => { markAsRead(n.id); closePanel(); }}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-[var(--color-surface2)] transition-colors border-b border-[var(--color-border)] last:border-b-0 ${
                      !n.read ? 'bg-[#4f6ef7]/5' : ''
                    }`}
                  >
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] flex items-center justify-center text-lg flex-shrink-0 mt-0.5">
                      {n.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium truncate ${!n.read ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-[#4f6ef7] flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{timeAgo(n.timestamp)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)]">
                <button
                  onClick={clearAll}
                  className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear all
                </button>
                <Link
                  to="/profile"
                  onClick={closePanel}
                  className="text-xs text-[#4f6ef7] hover:underline font-medium"
                >
                  View all
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationPanel;
