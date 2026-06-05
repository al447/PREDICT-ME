import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import Layout from '../components/layout/Layout';
import MarketCard from '../components/market/MarketCard';
import SearchBar from '../components/common/SearchBar';
import Tabs from '../components/common/Tabs';
import { MarketCardSkeleton } from '../components/common/Skeleton';
import Button from '../components/common/Button';
import { useMarkets } from '../hooks/useMarkets';
import { marketsAPI } from '../services/api';

const CATEGORY_CONFIG = {
  crypto: {
    title: 'Crypto',
    subtitle: 'Crypto Odds & Predictions 2026',
    tabs: ['All', 'Price', 'ETF', 'Regulation', 'Mining', 'DeFi'],
    tabTagMap: {
      'All': null,
      'Price': 'price',
      'ETF': 'etf',
      'Regulation': 'regulation',
      'Mining': 'mining',
      'DeFi': 'defi',
    },
    filters: [
      { label: 'Asset', items: ['All', 'Bitcoin', 'Ethereum', 'Solana', 'XRP', 'Dogecoin', 'BNB', 'Microstrategy'] },
    ],
    filterTagMap: {
      'Bitcoin': 'bitcoin',
      'Ethereum': 'ethereum',
      'Solana': 'solana',
      'XRP': 'xrp',
      'Dogecoin': 'dogecoin',
      'BNB': 'bnb',
      'Microstrategy': 'microstrategy',
    },
  },
  sports: {
    title: 'Sports',
    subtitle: 'Sports Odds & Prediction Markets 2026',
    tabs: ['All', 'NBA', 'Soccer', 'Tennis', 'Golf', 'F1', 'Boxing', 'NFL'],
    tabTagMap: {
      'All': null,
      'NBA': 'nba',
      'Soccer': 'soccer',
      'Tennis': 'tennis',
      'Golf': 'golf',
      'F1': 'f1',
      'Boxing': 'boxing',
      'NFL': 'nfl',
    },
    filters: [
      { label: 'Sport', items: ['All', 'NBA', 'MLB', 'NHL', 'UFC', 'NFL', 'Soccer', 'Tennis', 'Cricket', 'Golf', 'F1', 'Boxing', 'Cycling', 'Olympics'] },
    ],
    filterTagMap: {
      'NBA': 'nba', 'MLB': 'mlb', 'NHL': 'nhl', 'UFC': 'ufc',
      'NFL': 'nfl', 'Soccer': 'soccer', 'Tennis': 'tennis',
      'Cricket': 'cricket', 'Golf': 'golf', 'F1': 'f1',
      'Boxing': 'boxing', 'Cycling': 'cycling', 'Olympics': 'olympics',
    },
  },
  weather: {
    title: 'Weather',
    subtitle: 'Weather Odds & Predictions 2026',
    tabs: ['All', 'Temperature', 'Precipitation', 'Hurricane', 'Tornado', 'Earthquake', 'Volcano', 'Pandemic', 'Climate'],
    tabTagMap: {
      'All': null,
      'Temperature': 'temperature',
      'Precipitation': 'precipitation',
      'Hurricane': 'hurricane',
      'Tornado': 'tornado',
      'Earthquake': 'earthquake',
      'Volcano': 'volcano',
      'Pandemic': 'pandemic',
      'Climate': 'climate',
    },
    filters: [
      { label: 'Type', items: ['All', 'Temperature', 'Precipitation', 'Hurricane', 'Tornado', 'Earthquake', 'Volcano', 'Pandemic', 'Climate', 'Wildfire', 'Drought'] },
    ],
    filterTagMap: {
      'Temperature': 'temperature',
      'Precipitation': 'precipitation',
      'Hurricane': 'hurricane',
      'Tornado': 'tornado',
      'Earthquake': 'earthquake',
      'Volcano': 'volcano',
      'Pandemic': 'pandemic',
      'Climate': 'climate',
      'Wildfire': 'wildfire',
      'Drought': 'drought',
    },
  },
  politics: {
    title: 'Politics',
    subtitle: 'Politics Prediction Markets & Live Odds 2026',
    tabs: ['All', 'Trump', 'Midterms', 'Congress', 'Courts', 'NATO', 'Ukraine', 'China'],
    tabTagMap: {
      'All': null,
      'Trump': 'trump',
      'Midterms': 'midterms',
      'Congress': 'congress',
      'Courts': 'courts',
      'NATO': 'nato',
      'Ukraine': 'ukraine',
      'China': 'china',
    },
    filters: [
      { label: 'Topic', items: ['All', 'Trump', 'Midterms', 'Congress', 'Courts', 'UK', 'Germany', 'France', 'South Korea', 'Japan', 'China', 'Canada', 'Brazil', 'NATO', 'Ukraine', 'Israel'] },
    ],
    filterTagMap: {
      'Trump': 'trump',
      'Midterms': 'midterms',
      'Congress': 'congress',
      'Courts': 'courts',
      'UK': 'uk',
      'Germany': 'germany',
      'France': 'france',
      'South Korea': 'south-korea',
      'Japan': 'japan',
      'China': 'china',
      'Canada': 'canada',
      'Brazil': 'brazil',
      'NATO': 'nato',
      'Ukraine': 'ukraine',
      'Israel': 'israel',
    },
  },
  finance: {
    title: 'Finance',
    subtitle: 'Finance Odds & Predictions 2026',
    tabs: ['All', 'Stocks', 'Fed Rates', 'IPOs', 'Earnings', 'Indices', 'Commodities', 'Forex'],
    tabTagMap: {
      'All': null,
      'Stocks': 'stocks',
      'Fed Rates': 'fed-rates',
      'IPOs': 'ipos',
      'Earnings': 'earnings',
      'Indices': 'indices',
      'Commodities': 'commodities',
      'Forex': 'forex',
    },
    filters: [
      { label: 'Category', items: ['All', 'Stocks', 'Earnings', 'Indices', 'Commodities', 'Forex', 'IPOs', 'Fed Rates', 'Treasuries', 'Economics'] },
    ],
    filterTagMap: {
      'Stocks': 'stocks',
      'Earnings': 'earnings',
      'Indices': 'indices',
      'Commodities': 'commodities',
      'Forex': 'forex',
      'IPOs': 'ipos',
      'Fed Rates': 'fed-rates',
      'Treasuries': 'treasuries',
      'Economics': 'economics',
    },
  },
  news: {
    title: 'Breaking News',
    subtitle: 'Breaking News | PolyBet365',
    tabs: ['All', 'Politics', 'World', 'Sports', 'Crypto', 'Finance', 'Tech', 'Culture'],
    filters: [],
  },
  breaking: {
    title: 'Breaking News',
    subtitle: 'See the markets that moved the most in the last 24 hours',
    tabs: ['All', 'Politics', 'Sports', 'Crypto', 'Finance', 'Weather'],
    tabCategoryMap: {
      'All': null,
      'Politics': 'politics',
      'Sports': 'sports',
      'Crypto': 'crypto',
      'Finance': 'finance',
      'Weather': 'weather',
    },
    filters: [],
  },
};

const Sidebar = ({ config, activeFilter, onFilterChange, onClose, isMobile }) => {
  return (
    <aside className={`${isMobile ? 'w-full' : 'w-56 flex-shrink-0'}`}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
        {isMobile && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Filters</h3>
            <button onClick={onClose}><X className="w-5 h-5" /></button>
          </div>
        )}
        {config.filters.map((group) => (
          <div key={group.label} className="mb-5">
            <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{group.label}</h4>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <button
                  key={item}
                  onClick={() => onFilterChange(item)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activeFilter === item
                      ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold)] font-medium'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

const CategoryPage = () => {
  const { pathname } = useLocation();
  const slug = pathname.replace('/', '').split('/')[0] || 'crypto';
  const isBreaking = slug === 'breaking';
  const categorySlug = isBreaking ? null : slug;
  const config = CATEGORY_CONFIG[slug] || CATEGORY_CONFIG.news;
  const [activeTab, setActiveTab] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allMarkets, setAllMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    setPage(1);
    setAllMarkets([]);
    setActiveTab('All');
    setActiveFilter('All');
  }, [slug]);

  useEffect(() => {
    const fetchMarkets = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 16, sort: 'volume' };

        if (isBreaking) {
          // Breaking news: filter by category based on tab selection
          const mappedCategory = (config.tabCategoryMap || {})[activeTab];
          if (mappedCategory) params.category = mappedCategory;
          // 'All' — no category filter; show all categories
        } else {
          // Normal category page
          params.category = categorySlug;
          // Tab tag filter
          const tabTag = (config.tabTagMap || {})[activeTab];
          if (tabTag) params.tag = tabTag;
        }

        // Sidebar filter overrides tab tag (more specific)
        if (activeFilter !== 'All') {
          const filterTag = (config.filterTagMap || {})[activeFilter] || activeFilter.toLowerCase();
          params.tag = filterTag;
        }
        const { data } = await marketsAPI.getMarkets(params);
        if (data.success) {
          if (page === 1) setAllMarkets(data.markets);
          else setAllMarkets((prev) => [...prev, ...data.markets]);
          setTotal(data.total);
          setPages(data.pages);
        }
      } catch {}
      setLoading(false);
    };
    fetchMarkets();
  }, [slug, page, activeFilter, activeTab, isBreaking, categorySlug]);

  const { data: newMarketsData } = useMarkets({ category: isBreaking ? null : categorySlug, sort: 'newest', limit: 4 });
  const newMarkets = newMarketsData?.markets || [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] mb-1">{config.title}</h1>
          <p className="text-[var(--color-text-muted)] text-sm">{config.subtitle}</p>
        </div>

        <div className="flex gap-6">
          {config.filters.length > 0 && (
            <div className="hidden md:block">
              <Sidebar config={config} activeFilter={activeFilter} onFilterChange={(f) => { setActiveFilter(f); setPage(1); }} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1">
                <Tabs
                  tabs={config.tabs}
                  activeTab={activeTab}
                  onTabChange={(t) => { setActiveTab(t); setPage(1); setAllMarkets([]); }}
                  className="!flex-wrap !gap-0.5"
                />
              </div>
              <div className="flex items-center gap-2">
                <SearchBar placeholder={`Search ${config.title}...`} className="w-full sm:w-52" />
                {config.filters.length > 0 && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)]"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="text-sm">Filters</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                {total} markets
                {activeFilter !== 'All' && <span className="text-[var(--color-gold)] ml-1">· {activeFilter}</span>}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading && page === 1
                ? Array.from({ length: 9 }).map((_, i) => <MarketCardSkeleton key={i} />)
                : allMarkets.map((market) => <MarketCard key={market._id} market={market} />)
              }
            </div>

            {!loading && allMarkets.length === 0 && (
              <div className="text-center py-16 text-[var(--color-text-muted)]">
                <p className="text-lg mb-2">No markets found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            )}

            {page < pages && (
              <div className="text-center mt-8">
                <Button variant="secondary" size="md" loading={loading} onClick={() => setPage((p) => p + 1)}>
                  Load more markets
                </Button>
              </div>
            )}

            {newMarkets.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">
                  🆕 New {config.title} markets
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {newMarkets.map((m) => <MarketCard key={m._id} market={m} />)}
                </div>
              </section>
            )}
          </div>
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-bg)] rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto">
              <Sidebar config={config} activeFilter={activeFilter} onFilterChange={(f) => { setActiveFilter(f); setPage(1); setSidebarOpen(false); }} isMobile onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CategoryPage;
