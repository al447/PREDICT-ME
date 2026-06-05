import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Zap, HelpCircle, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchBar from '../common/SearchBar';
import HowItWorksModal from '../common/HowItWorksModal';

const BottomNav = () => {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems = [
    { label: 'Home', to: '/', Icon: Home },
    { label: 'Search', Icon: Search, action: () => setSearchOpen(true) },
    { label: 'Breaking', to: '/news', Icon: Zap },
    { label: 'How it works', Icon: HelpCircle, action: () => setHowItWorksOpen(true) },
    { label: 'More', Icon: Menu, action: () => setMoreOpen(true) },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[var(--color-bg)]/95 backdrop-blur border-t border-[var(--color-border)]">
        <div className="flex items-center justify-around px-2 py-2 pb-safe">
          {navItems.map(({ label, to, Icon, action }) => {
            const active = to && (pathname === to || (to !== '/' && pathname.startsWith(to)));
            return (
              <button
                key={label}
                onClick={to ? undefined : action}
                className="flex flex-col items-center gap-0.5 px-3 py-1"
              >
                {to ? (
                  <Link to={to} className="flex flex-col items-center gap-0.5">
                    <Icon className={`w-5 h-5 ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-muted)]'}`} />
                    <span className={`text-xs ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-muted)]'}`}>{label}</span>
                  </Link>
                ) : (
                  <>
                    <Icon className="w-5 h-5 text-[var(--color-text-muted)]" />
                    <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-50 md:hidden bg-[var(--color-bg)] p-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <SearchBar className="flex-1" />
              <button onClick={() => setSearchOpen(false)} className="p-2 rounded-lg hover:bg-[var(--color-surface2)]">
                <X className="w-5 h-5 text-[var(--color-text)]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 md:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-[var(--color-surface)] rounded-t-2xl p-4 border-t border-[var(--color-border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {['Crypto', 'Sports', 'Weather', 'Politics', 'Finance', 'News'].map((cat) => (
                  <Link
                    key={cat}
                    to={`/${cat.toLowerCase()}`}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--color-surface2)] text-sm text-[var(--color-text)]"
                  >
                    {cat}
                  </Link>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <HowItWorksModal isOpen={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
    </>
  );
};

export default BottomNav;
