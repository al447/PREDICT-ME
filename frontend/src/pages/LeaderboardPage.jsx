import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Trophy } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { formatBalance } from '../utils/format';
import { tradesAPI } from '../services/api';

const PER_PAGE = 20;

const PERIOD_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'All', value: 'all' },
];

const SORT_OPTIONS = [
  { label: 'Profit/Loss', value: 'profit' },
  { label: 'Volume', value: 'volume' },
];

const CATEGORY_OPTIONS = ['All Categories', 'Crypto', 'Sports', 'Politics', 'Finance', 'Weather'];

const LeaderboardPage = () => {
  const [period, setPeriod] = useState('all');
  const [sort, setSort] = useState('profit');
  const [category, setCategory] = useState('All Categories');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [catOpen, setCatOpen] = useState(false);
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch leaderboard data from API
  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const { data } = await tradesAPI.getLeaderboard({ period, sort, limit: 100 });
        setTraders(data.leaderboard || []);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [period, sort]);

  const filtered = useMemo(() => {
    let data = [...traders];
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((t) => t.name?.toLowerCase().includes(q) || t.address?.toLowerCase().includes(q));
    }
    // Re-sort locally if needed
    if (sort === 'volume') data.sort((a, b) => b.volume - a.volume);
    else data.sort((a, b) => b.profit - a.profit);
    return data.map((t, i) => ({ ...t, rank: i + 1 }));
  }, [search, sort, traders]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const formatMoney = (n) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Title */}
        <h1 className="text-3xl font-bold text-[var(--color-text)] mb-6">Leaderboard</h1>

        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setPeriod(opt.value); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === opt.value
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Category dropdown */}
          <div className="relative ml-auto">
            <button
              onClick={() => setCatOpen(!catOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] hover:border-[var(--color-gold)]/50 transition-colors"
            >
              {category}
              <ChevronRight className={`w-4 h-4 transition-transform ${catOpen ? 'rotate-90' : ''}`} />
            </button>
            {catOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCatOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-20 p-1">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setCategory(cat); setCatOpen(false); setPage(1); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        category === cat ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)]' : 'text-[var(--color-text)] hover:bg-[var(--color-surface2)]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search by name"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSort(opt.value); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sort === opt.value
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-text-muted)]">
              <p>No traders yet</p>
            </div>
          ) : (
            paged.map((trader, idx) => {
              const isTop3 = trader.rank <= 3;
              const rankColors = ['', 'text-yellow-400', 'text-gray-300', 'text-amber-600'];

              return (
                <div
                  key={trader.address || idx}
                  className={`flex items-center px-4 py-3.5 hover:bg-[var(--color-surface2)] transition-colors cursor-pointer ${
                    idx < paged.length - 1 ? 'border-b border-[var(--color-border)]' : ''
                  }`}
                >
                  {/* Rank */}
                  <div className={`w-10 text-sm font-bold ${isTop3 ? rankColors[trader.rank] : 'text-[var(--color-text-muted)]'}`}>
                    {isTop3 && <span className="mr-0.5">{trader.rank === 1 ? '🥇' : trader.rank === 2 ? '🥈' : '🥉'}</span>}
                    {!isTop3 && trader.rank}
                  </div>

                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-gold)]/30 to-[var(--color-gold)]/10 flex items-center justify-center text-xs font-bold text-[var(--color-gold)] border border-[var(--color-gold)]/20 flex-shrink-0">
                      {trader.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text)] truncate">{trader.name || 'Unknown'}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-right">
                    <div className="hidden md:block">
                      <p className="text-xs text-[var(--color-text-muted)]">Win Rate</p>
                      <p className="text-sm font-medium text-[var(--color-text)]">{trader.winRate || 0}%</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs text-[var(--color-text-muted)]">Trades</p>
                      <p className="text-sm font-medium text-[var(--color-text)]">{trader.trades || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-400">+{formatMoney(trader.profit || 0)}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{formatMoney(trader.volume || 0)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-border)]/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-[var(--color-text)]" />
            </button>
            {Array.from({ length: Math.min(6, totalPages) }, (_, i) => {
              let num;
              if (totalPages <= 6) num = i + 1;
              else if (page <= 3) num = i + 1;
              else if (page >= totalPages - 2) num = totalPages - 5 + i;
              else num = page - 2 + i;
              return (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    page === num
                      ? 'bg-[var(--color-gold)] text-black'
                      : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {num}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] disabled:opacity-30 hover:bg-[var(--color-border)]/50 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-[var(--color-text)]" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default LeaderboardPage;
