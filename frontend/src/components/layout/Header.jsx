import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../../assets/Logo';
import { HelpCircle, ChevronUp, Moon, Sun, Settings, Copy, Menu, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchBar from '../common/SearchBar';
import Button from '../common/Button';
import useAuthStore from '../../store/authStore';
import useDepositModalStore from '../../store/depositModalStore';
import useThemeStore from '../../store/themeStore';
import { formatBalance, truncateAddress } from '../../utils/format';
import HowItWorksModal from '../common/HowItWorksModal';
import NotificationPanel from '../common/NotificationPanel';
import useNotificationStore from '../../store/notificationStore';
import toast from 'react-hot-toast';

/* ── Shared menu items (Polymarket-style) ── */
const primaryMenuItems = (close) => [
  { emoji: '🏆', label: 'Leaderboard', to: '/leaderboard', onClick: close },
  { emoji: '🎁', label: 'Refer & Earn', to: '/referral', onClick: close },
  // { emoji: '�', label: 'Rewards', to: '/rewards', onClick: close },
  // { emoji: '🔗', label: 'APIs', href: 'https://docs.polymarket.com/api-reference', onClick: close },
];

const secondaryMenuItems = (close, openHelp) => [
  { label: 'Support', onClick: () => { close(); openHelp(); } },
  // { label: 'Terms of Use', to: '/', onClick: close },
];

const MenuItem = ({ emoji, label, to, href, onClick }) => {
  const cls = "flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-surface2)] text-sm font-medium text-[var(--color-text)] transition-colors cursor-pointer";
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>{emoji && <span className="text-base w-5 text-center">{emoji}</span>}{label}</a>;
  if (to) return <Link to={to} onClick={onClick} className={cls}>{emoji && <span className="text-base w-5 text-center">{emoji}</span>}{label}</Link>;
  return <button onClick={onClick} className={`w-full text-left ${cls}`}>{emoji && <span className="text-base w-5 text-center">{emoji}</span>}{label}</button>;
};

const SecondaryItem = ({ label, to, href, onClick }) => {
  const cls = "block w-full text-left px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors cursor-pointer";
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>{label}</a>;
  if (to) return <Link to={to} onClick={onClick} className={cls}>{label}</Link>;
  return <button onClick={onClick} className={cls}>{label}</button>;
};

const Header = () => {
  const { user, logout, openAuthModal } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { notifications, isOpen: notifOpen, togglePanel: toggleNotif, unreadCount, fetchUnreadCount, fetchNotifications } = useNotificationStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Fetch notifications when user logs in
  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      // Fetch full notifications when panel is opened
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 30000); // Poll every 30 seconds for unread count
      return () => clearInterval(interval);
    }
  }, [user, fetchUnreadCount]);

  const closeMenu = () => setMenuOpen(false);
  const unread = unreadCount;

  const copyAddress = () => {
    if (user?.walletAddress) {
      navigator.clipboard.writeText(user.walletAddress);
      toast.success('Address copied!');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)]" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <Logo size={44} showText={false} />
            <span className="font-black text-base tracking-wide hidden sm:block" style={{ background: 'linear-gradient(135deg, #FFD700, #D4AF37)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              PolyBet365
            </span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-xl hidden md:block">
            <SearchBar placeholder="Search markets..." />
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setHowItWorksOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>How it works</span>
            </button>

            {user ? (
              <>
                {/* Balance */}
                <Link to="/portfolio" className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] hover:bg-[var(--color-border)]/50 transition-colors text-xs">
                  <span className="text-[var(--color-text-muted)]">Balance</span>
                  <span className="font-semibold text-[var(--color-gold)]">{formatBalance(user.balance || 0)}</span>
                </Link>

                {/* Deposit button */}
                <button
                  onClick={() => useDepositModalStore.getState().openDepositModal()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#4060e0] transition-all"
                >
                  Deposit
                </button>

                {/* Notifications bell */}
                <div className="relative hidden sm:block">
                  <button
                    onClick={toggleNotif}
                    className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    <Bell className="w-5 h-5" />
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                        {unread}
                      </span>
                    )}
                  </button>
                  <NotificationPanel />
                </div>

                {/* Avatar button (Polymarket-style) */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-1 pl-1 pr-2 py-1 rounded-full bg-[var(--color-surface2)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)]/30 transition-colors"
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                        {(user.username || user.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <ChevronUp className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${menuOpen ? '' : 'rotate-180'}`} />
                  </button>

                  <AnimatePresence>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={closeMenu} />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-20 overflow-hidden"
                        >
                          {/* ── User Profile Section ── */}
                          <div className="px-4 py-3 flex items-center gap-3">
                            {user.avatar ? (
                              <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                                {(user.username || user.email || 'U')[0].toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[var(--color-text)] truncate">
                                {user.username || user.email?.split('@')[0] || 'User'}
                              </p>
                              {user.walletAddress && (
                                <button onClick={copyAddress} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                                  {truncateAddress(user.walletAddress)}
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {/* <Link to="/profile" onClick={closeMenu} className="p-1.5 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                              <Settings className="w-4.5 h-4.5" />
                            </Link> */}
                          </div>

                          <div className="border-t border-[var(--color-border)]" />

                          {/* ── User Links ── */}
                          <div className="py-1">
                            <MenuItem emoji="👤" label="Profile" to="/profile" onClick={closeMenu} />
                            <MenuItem emoji="💼" label="Portfolio" to="/portfolio" onClick={closeMenu} />
                          </div>

                          <div className="border-t border-[var(--color-border)]" />

                          {/* ── Primary Links ── */}
                          <div className="py-1">
                            {primaryMenuItems(closeMenu).map((item) => (
                              <MenuItem key={item.label} {...item} />
                            ))}

                            {/* Theme toggle */}
                            <button
                              onClick={toggleTheme}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--color-surface2)] text-sm font-medium text-[var(--color-text)] transition-colors"
                            >
                              <span className="flex items-center gap-3">
                                {theme === 'dark' ? (
                                  <Moon className="w-5 h-5 text-center" />
                                ) : (
                                  <Sun className="w-5 h-5 text-center" />
                                )}
                                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                              </span>
                              <div className={`w-9 h-5 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-[#4f6ef7]' : 'bg-[var(--color-border)]'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${theme === 'dark' ? 'left-[18px]' : 'left-0.5'}`} />
                              </div>
                            </button>
                          </div>

                          <div className="border-t border-[var(--color-border)]" />

                          {/* ── Secondary Links ── */}
                          <div className="py-1">
                            {secondaryMenuItems(closeMenu, () => setHowItWorksOpen(true)).map((item) => (
                              <SecondaryItem key={item.label} {...item} />
                            ))}
                          </div>

                          <div className="border-t border-[var(--color-border)]" />

                          {/* ── Logout ── */}
                          <div className="py-1">
                            <button
                              onClick={() => { logout(); closeMenu(); }}
                              className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/5 transition-colors"
                            >
                              Logout
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={openAuthModal}>
                    Log In
                  </Button>
                  <Button variant="primary" size="sm" onClick={openAuthModal}>
                    Sign Up
                  </Button>
                </div>

                {/* Hamburger for non-logged-in users */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface2)] hover:bg-[var(--color-border)]/50 transition-colors"
                    aria-label="Open menu"
                  >
                    <Menu className="w-5 h-5 text-[var(--color-text)]" />
                  </button>

                  <AnimatePresence>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={closeMenu} />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-20 overflow-hidden"
                        >
                          <div className="py-1">
                            {primaryMenuItems(closeMenu).map((item) => (
                              <MenuItem key={item.label} {...item} />
                            ))}
                            <button
                              onClick={toggleTheme}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--color-surface2)] text-sm font-medium text-[var(--color-text)] transition-colors"
                            >
                              <span className="flex items-center gap-3">
                                {theme === 'dark' ? (
                                  <Moon className="w-5 h-5" />
                                ) : (
                                  <Sun className="w-5 h-5" />
                                )}
                                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                              </span>
                              <div className={`w-9 h-5 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-[#4f6ef7]' : 'bg-[var(--color-border)]'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${theme === 'dark' ? 'left-[18px]' : 'left-0.5'}`} />
                              </div>
                            </button>
                          </div>
                          <div className="border-t border-[var(--color-border)]" />
                          <div className="py-1">
                            {secondaryMenuItems(closeMenu, () => setHowItWorksOpen(true)).map((item) => (
                              <SecondaryItem key={item.label} {...item} />
                            ))}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <HowItWorksModal isOpen={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
    </>
  );
};

export default Header;
