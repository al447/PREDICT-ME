import { useState, useEffect, useRef } from 'react';
import { Search, X, TrendingUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { marketsAPI } from '../../services/api';
import { formatVolume } from '../../utils/format';

const BROWSE_TOPICS = [
  { label: 'Crypto', slug: 'crypto', icon: '🪙' },
  { label: 'Sports', slug: 'sports', icon: '🏆' },
  { label: 'Politics', slug: 'politics', icon: '🏛️' },
  { label: 'Finance', slug: 'finance', icon: '📈' },
  { label: 'Weather', slug: 'weather', icon: '☀️' },
  { label: 'News', slug: 'news', icon: '📰' },
];

const SearchBar = ({ placeholder = 'Search markets...', className = '' }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('browse');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  let debounceTimer = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data } = await marketsAPI.getMarkets({ search: query, limit: 6 });
        setResults(data.markets || []);
      } catch {}
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [query]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className={`flex items-center gap-2 bg-[var(--color-surface2)] border rounded-xl px-3 py-2 transition-all ${isOpen ? 'border-[var(--color-gold)]' : 'border-[var(--color-border)]'}`}>
        <Search className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute top-full mt-2 left-0 right-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {!query && (
              <div className="flex border-b border-[var(--color-border)]">
                <button
                  onClick={() => setActiveSection('browse')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSection === 'browse' ? 'text-[var(--color-gold)] border-b-2 border-[var(--color-gold)]' : 'text-[var(--color-text-muted)]'}`}
                >
                  Browse
                </button>
                <button
                  onClick={() => setActiveSection('topics')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSection === 'topics' ? 'text-[var(--color-gold)] border-b-2 border-[var(--color-gold)]' : 'text-[var(--color-text-muted)]'}`}
                >
                  Topics
                </button>
              </div>
            )}

            {!query && activeSection === 'browse' && (
              <div className="p-3 grid grid-cols-2 gap-1">
                {BROWSE_TOPICS.map((topic) => (
                  <Link
                    key={topic.slug}
                    to={`/${topic.slug}`}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface2)] transition-colors text-sm text-[var(--color-text)]"
                  >
                    <span>{topic.icon}</span>
                    <span>{topic.label}</span>
                  </Link>
                ))}
              </div>
            )}

            {!query && activeSection === 'topics' && (
              <div className="p-3 space-y-1">
                {['Bitcoin', 'Ethereum', 'Trump', 'NBA', 'S&P 500', 'Elections', 'AI', 'Climate'].map((topic) => (
                  <button
                    key={topic}
                    onClick={() => { setQuery(topic); setActiveSection('browse'); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface2)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-left"
                  >
                    <TrendingUp className="w-3.5 h-3.5" /> {topic}
                  </button>
                ))}
              </div>
            )}

            {query && (
              <div className="p-2">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">Searching...</div>
                ) : results.length > 0 ? (
                  results.map((market) => (
                    <Link
                      key={market._id}
                      to={`/market/${market.slug}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--color-surface2)] transition-colors"
                    >
                      <span className="text-xl">{market.image}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text)] truncate">{market.title}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {market.outcomes?.[0]?.price}¢ Yes · {formatVolume(market.volume)}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">No markets found</div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;
