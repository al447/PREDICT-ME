import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Users, ScrollText, LogOut, Crown, Settings, ChevronRight, Gift, ArrowDownToLine, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAdminAuthStore from '../../store/adminAuthStore';
import { adminAuthAPI } from '../../services/adminApi';
import toast from 'react-hot-toast';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/admin/markets', label: 'Markets', icon: BarChart3 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/deposits', label: 'Deposits', icon: ArrowDownToLine },
  { to: '/admin/referrals', label: 'Referrals', icon: Gift },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
];

const PAGE_TITLES = {
  '/admin': 'Dashboard',
  '/admin/markets': 'Markets',
  '/admin/markets/create': 'Create Market',
  '/admin/users': 'Users',
  '/admin/deposits': 'Deposits',
  '/admin/referrals': 'Referral Program',
  '/admin/audit-log': 'Audit Log',
};

const ChangePasswordModal = ({ open, onClose }) => {
  const [form, setForm] = useState({ oldPassword: '', newPassword: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminAuthAPI.changePassword(form);
      toast.success('Password updated');
      onClose();
      setForm({ oldPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-4">Change Password</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="password" placeholder="Current password" value={form.oldPassword} onChange={(e) => setForm(f => ({ ...f, oldPassword: e.target.value }))} required
                className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]" />
              <input type="password" placeholder="New password (min 8 chars)" value={form.newPassword} onChange={(e) => setForm(f => ({ ...f, newPassword: e.target.value }))} required minLength={8}
                className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl bg-[var(--color-gold)] text-black text-sm font-semibold disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const AdminLayout = () => {
  const { admin, logout } = useAdminAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPwModal, setShowPwModal] = useState(false);

  const pageTitle = Object.entries(PAGE_TITLES).sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => location.pathname === path || location.pathname.startsWith(path + '/'))?.[1] || 'Admin';

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const initials = admin?.username?.slice(0, 2).toUpperCase() || admin?.email?.slice(0, 2).toUpperCase() || 'AD';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-60 min-h-screen bg-[var(--color-surface)] border-r border-[var(--color-border)] flex-col fixed left-0 top-0 z-40">
        {/* Logo */}
        <div className="p-5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--color-gold)]/15 rounded-lg flex items-center justify-center">
              <Crown size={16} className="text-[var(--color-gold)]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--color-gold)]">PolyBet365</p>
              <p className="text-xs text-[var(--color-text-muted)]">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)] border-l-2 border-[var(--color-gold)] pl-[10px]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
                }`
              }>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Admin info + Logout */}
        <div className="p-3 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 bg-[var(--color-gold)]/20 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-gold)] flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--color-text)] truncate">{admin?.username || 'Admin'}</p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">{admin?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-red)] transition-all">
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="lg:ml-60 flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center px-4 lg:px-6 gap-4 sticky top-0 z-30">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)]"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="hidden sm:inline">Admin</span>
            <ChevronRight size={14} className="hidden sm:block" />
            <span className="text-[var(--color-text)] font-medium">{pageTitle}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowPwModal(true)}
              className="p-2 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all" title="Change password">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-60 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col z-50 lg:hidden">
            {/* Mobile Logo */}
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[var(--color-gold)]/15 rounded-lg flex items-center justify-center">
                  <Crown size={16} className="text-[var(--color-gold)]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-gold)]">PolyBet365</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Admin Panel</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mobile Nav */}
            <nav className="flex-1 p-3 space-y-1">
              {NAV.map(({ to, label, icon: Icon, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)] border-l-2 border-[var(--color-gold)] pl-[10px]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Mobile Admin info + Logout */}
            <div className="p-3 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-3 px-3 py-2 mb-1">
                <div className="w-8 h-8 bg-[var(--color-gold)]/20 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-gold)] flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--color-text)] truncate">{admin?.username || 'Admin'}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{admin?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-red)] transition-all"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </aside>
        </>
      )}

      <ChangePasswordModal open={showPwModal} onClose={() => setShowPwModal(false)} />
    </div>
  );
};

export default AdminLayout;
