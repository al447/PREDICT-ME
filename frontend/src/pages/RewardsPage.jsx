import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Star, Heart, Briefcase, Filter, ArrowUpDown } from 'lucide-react';
import Layout from '../components/layout/Layout';

/* ── Mock rewards data ── */
const CATEGORY_TABS = ['all', 'politics', 'sports', 'crypto', 'finance', 'weather'];

const generateRewardsMarkets = () => {
  const markets = [
    { title: 'Will Bitcoin reach $150,000 by end of 2026?', category: 'crypto', spread: '±1¢', minShares: 500, reward: 45, comp: 165, price: { yes: 62.5, no: 37.5 }, img: '₿' },
    { title: 'Will Ethereum flip Bitcoin market cap in 2026?', category: 'crypto', spread: '±1¢', minShares: 500, reward: 38, comp: 120, price: { yes: 8.5, no: 91.5 }, img: 'Ξ' },
    { title: 'Will SOL reach $500 by December 2026?', category: 'crypto', spread: '±2¢', minShares: 300, reward: 32, comp: 95, price: { yes: 22, no: 78 }, img: '◎' },
    { title: 'Will Trump win 2028 Republican Primary?', category: 'politics', spread: '±1¢', minShares: 1000, reward: 85, comp: 340, price: { yes: 45, no: 55 }, img: '🏛️' },
    { title: 'Will Democrats win Senate in 2026 Midterms?', category: 'politics', spread: '±1¢', minShares: 500, reward: 62, comp: 210, price: { yes: 38.5, no: 61.5 }, img: '🗳️' },
    { title: 'Will there be a US government shutdown in 2026?', category: 'politics', spread: '±2¢', minShares: 300, reward: 28, comp: 80, price: { yes: 55, no: 45 }, img: '🏦' },
    { title: 'Champions League Winner 2026/27', category: 'sports', spread: '±1¢', minShares: 1000, reward: 72, comp: 290, price: { yes: 15, no: 85 }, img: '⚽' },
    { title: 'NBA Finals MVP 2026', category: 'sports', spread: '±1¢', minShares: 500, reward: 55, comp: 180, price: { yes: 28, no: 72 }, img: '🏀' },
    { title: 'Will F1 have a new champion in 2026?', category: 'sports', spread: '±2¢', minShares: 300, reward: 35, comp: 110, price: { yes: 42, no: 58 }, img: '🏎️' },
    { title: 'Will S&P 500 reach 7000 by end of 2026?', category: 'finance', spread: '±1¢', minShares: 500, reward: 48, comp: 155, price: { yes: 35, no: 65 }, img: '📈' },
    { title: 'Will Fed cut rates below 3% in 2026?', category: 'finance', spread: '±1¢', minShares: 500, reward: 42, comp: 140, price: { yes: 25, no: 75 }, img: '🏛️' },
    { title: 'Will NVIDIA hit $200/share in 2026?', category: 'finance', spread: '±2¢', minShares: 300, reward: 30, comp: 90, price: { yes: 55, no: 45 }, img: '💹' },
    { title: 'Will there be a Category 5 hurricane in 2026 Atlantic season?', category: 'weather', spread: '±2¢', minShares: 300, reward: 25, comp: 75, price: { yes: 65, no: 35 }, img: '🌀' },
    { title: 'Will global avg temp exceed 1.5°C above pre-industrial?', category: 'weather', spread: '±1¢', minShares: 500, reward: 40, comp: 130, price: { yes: 72, no: 28 }, img: '🌡️' },
    { title: 'Record rainfall in any US state in 2026?', category: 'weather', spread: '±2¢', minShares: 300, reward: 22, comp: 65, price: { yes: 45, no: 55 }, img: '🌧️' },
    { title: 'Will XRP reach $5 by end of 2026?', category: 'crypto', spread: '±2¢', minShares: 300, reward: 28, comp: 85, price: { yes: 18, no: 82 }, img: '✕' },
    { title: 'Will DOGE reach $1?', category: 'crypto', spread: '±2¢', minShares: 200, reward: 20, comp: 60, price: { yes: 5, no: 95 }, img: '🐶' },
    { title: 'Will UK call snap election in 2026?', category: 'politics', spread: '±2¢', minShares: 300, reward: 30, comp: 95, price: { yes: 12, no: 88 }, img: '🇬🇧' },
    { title: 'Super Bowl LXII Winner', category: 'sports', spread: '±1¢', minShares: 1000, reward: 90, comp: 350, price: { yes: 8, no: 92 }, img: '🏈' },
    { title: 'Will Tesla stock double in 2026?', category: 'finance', spread: '±2¢', minShares: 300, reward: 25, comp: 70, price: { yes: 20, no: 80 }, img: '🚗' },
  ];
  return markets.map((m, i) => ({ ...m, id: i, earnings: 0, isFav: false }));
};

const ALL_REWARDS = generateRewardsMarkets();
const PER_PAGE = 15;

const SORT_FIELDS = ['market', 'spread', 'minShares', 'reward', 'comp', 'earnings', 'price'];

const RewardsPage = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('reward');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [filterPanel, setFilterPanel] = useState(null); // 'positions' | 'orders' | 'mergeable' | 'favorites' | null

  const filtered = useMemo(() => {
    let data = [...ALL_REWARDS];
    if (activeTab !== 'all') data = data.filter((m) => m.category === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((m) => m.title.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [activeTab, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
    setPage(1);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="relative mb-8 p-6 rounded-2xl bg-gradient-to-r from-[var(--color-gold)]/10 via-[var(--color-gold)]/5 to-transparent border border-[var(--color-gold)]/20 overflow-hidden">
          <div className="absolute top-2 right-6 text-6xl opacity-20 select-none">💰</div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-[var(--color-text)]">Daily Rewards</h1>
            <span className="text-2xl">✨</span>
          </div>
          <p className="text-base text-[var(--color-text-muted)] max-w-lg">
            Earn rewards by placing competitive limit orders. The tighter your spread, the higher your reward.
          </p>
        </div>

        {/* Category Tabs + Search */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1); }}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search markets"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
              />
            </div>

            <div className="flex gap-2">
              {[
                { key: 'positions', icon: '📊', label: 'Positions' },
                { key: 'orders', icon: '📋', label: 'Open Orders' },
                { key: 'favorites', icon: '⭐', label: 'Favorites' },
              ].map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setFilterPanel(filterPanel === btn.key ? null : btn.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    filterPanel === btn.key
                      ? 'bg-[var(--color-gold)]/10 border-[var(--color-gold)]/30 text-[var(--color-gold)]'
                      : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <span>{btn.icon}</span>
                  <span className="hidden sm:inline">{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Rewards Table */}
        <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[1fr_70px_80px_70px_70px_80px_120px_40px] gap-2 px-4 py-3 bg-[var(--color-surface2)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            <button onClick={() => toggleSort('market')} className="text-left flex items-center gap-1 hover:text-[var(--color-text)]">
              Market <ArrowUpDown className="w-3 h-3" />
            </button>
            <button onClick={() => toggleSort('spread')} className="text-left flex items-center gap-1 hover:text-[var(--color-text)]">
              Spread
            </button>
            <button onClick={() => toggleSort('minShares')} className="text-left flex items-center gap-1 hover:text-[var(--color-text)]">
              Min Shares
            </button>
            <button onClick={() => toggleSort('reward')} className="text-left flex items-center gap-1 hover:text-[var(--color-text)]">
              Reward <ArrowUpDown className="w-3 h-3" />
            </button>
            <button onClick={() => toggleSort('comp')} className="text-left flex items-center gap-1 hover:text-[var(--color-text)]">
              Comp.
            </button>
            <button onClick={() => toggleSort('earnings')} className="text-left flex items-center gap-1 hover:text-[var(--color-text)]">
              Earnings
            </button>
            <div className="text-left">Price</div>
            <div></div>
          </div>

          {/* Table Rows */}
          {paged.length === 0 ? (
            <div className="py-16 text-center text-[var(--color-text-muted)]">
              No markets found matching your criteria.
            </div>
          ) : (
            paged.map((market, idx) => (
              <div
                key={market.id}
                className={`grid grid-cols-1 md:grid-cols-[1fr_70px_80px_70px_70px_80px_120px_40px] gap-2 px-4 py-3.5 hover:bg-[var(--color-surface2)] transition-colors cursor-pointer items-center ${
                  idx < paged.length - 1 ? 'border-b border-[var(--color-border)]' : ''
                }`}
              >
                {/* Market */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] flex items-center justify-center text-lg flex-shrink-0">
                    {market.img}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text)] truncate">{market.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)] md:hidden mt-0.5">
                      {market.spread} | {market.minShares} shares | Reward: {market.reward}
                    </p>
                  </div>
                </div>

                {/* Spread */}
                <div className="hidden md:block text-sm text-[var(--color-text)]">{market.spread}</div>

                {/* Min Shares */}
                <div className="hidden md:block text-sm text-[var(--color-text)]">{market.minShares.toLocaleString()}</div>

                {/* Reward */}
                <div className="hidden md:flex items-center gap-1.5">
                  <span className="text-xs">💰</span>
                  <span className="text-sm font-semibold text-[var(--color-gold)]">{market.reward}</span>
                </div>

                {/* Comp */}
                <div className="hidden md:flex items-center gap-1.5">
                  <span className="text-xs">👥</span>
                  <span className="text-sm text-[var(--color-text)]">{market.comp}</span>
                </div>

                {/* Earnings */}
                <div className="hidden md:block">
                  <span className="text-sm text-[var(--color-text-muted)]">$0.00</span>
                </div>

                {/* Price */}
                <div className="hidden md:block">
                  <div className="text-xs">
                    <span className="text-emerald-400">Yes {market.price.yes}¢</span>
                    <span className="mx-1 text-[var(--color-text-muted)]">/</span>
                    <span className="text-red-400">No {market.price.no}¢</span>
                  </div>
                </div>

                {/* Favorite */}
                <div className="hidden md:flex justify-center">
                  <button className="p-1 rounded hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors">
                    <Heart className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
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
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const num = i + 1;
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

export default RewardsPage;
