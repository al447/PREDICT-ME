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
    tabs: ['All', 'Up / Down', 'Above / Below', 'Price Range', 'Hit Price'],
    tabTagMap: {
      'All': null,
      'Up / Down': 'up-down',
      'Above / Below': 'above-below',
      'Price Range': 'price-range',
      'Hit Price': 'hit-price',
    },
    coins: [
      { label: 'Bitcoin',      tag: 'bitcoin',      icon: '₿',  color: '#f97316' },
      { label: 'Ethereum',     tag: 'ethereum',     icon: 'Ξ',  color: '#6366f1' },
      { label: 'Solana',       tag: 'solana',       icon: '◎',  color: '#9945FF' },
      { label: 'XRP',          tag: 'xrp',          icon: '✕',  color: '#346AA9' },
      { label: 'Dogecoin',     tag: 'dogecoin',     icon: 'Ð',  color: '#C2A633' },
      { label: 'BNB',          tag: 'bnb',          icon: 'B',  color: '#F0B90B' },
      { label: 'Microstrategy', tag: 'microstrategy', icon: 'M', color: '#e11d48' },
    ],
    timeTabs: ['5 Min', '15 Min', '1 Hour', '4 Hours', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Pre-Market', 'ETF'],
    timeTagMap: {
      '5 Min': '5-minute-crypto',
      '15 Min': '15-minute-crypto',
      '1 Hour': '1-hour-crypto',
      '4 Hours': '4-hour-crypto',
      'Daily': 'daily-crypto',
      'Weekly': 'weekly-crypto',
      'Monthly': 'monthly-crypto',
      'Yearly': 'yearly-crypto',
      'Pre-Market': 'pre-market',
      'ETF': 'etf',
    },
    filters: [],
    filterTagMap: {},
  },
  sports: {
    title: 'Sports',
    subtitle: 'Sports Odds & Prediction Markets 2026',
    tabs: ['All', 'NBA', 'MLB', 'NHL', 'NFL', 'Soccer', 'Tennis', 'Cricket', 'Basketball', 'Baseball', 'Hockey', 'UFC', 'Boxing', 'Golf', 'F1', 'Rugby', 'Pickleball', 'Lacrosse'],
    tabTagMap: {
      'All': null,
      'NBA': 'nba',
      'MLB': 'mlb',
      'NHL': 'nhl',
      'NFL': 'nfl',
      'Soccer': 'soccer',
      'Tennis': 'tennis',
      'Cricket': 'cricket',
      'Basketball': 'basketball',
      'Baseball': 'baseball',
      'Hockey': 'hockey',
      'UFC': 'ufc',
      'Boxing': 'boxing',
      'Golf': 'golf',
      'F1': 'formula-1',
      'Rugby': 'rugby',
      'Pickleball': 'pickleball',
      'Lacrosse': 'lacrosse',
    },
    filters: [
      { label: 'Sport', items: ['All', 'NBA', 'MLB', 'NHL', 'UFC', 'NFL', 'Soccer', 'Tennis', 'Cricket', 'Golf', 'F1', 'Boxing', 'Rugby', 'Pickleball'] },
    ],
    filterTagMap: {
      'NBA': 'nba', 'MLB': 'mlb', 'NHL': 'nhl', 'UFC': 'ufc',
      'NFL': 'nfl', 'Soccer': 'soccer', 'Tennis': 'tennis',
      'Cricket': 'cricket', 'Golf': 'golf', 'F1': 'formula-1',
      'Boxing': 'boxing', 'Rugby': 'rugby', 'Pickleball': 'pickleball',
    },
  },
  weather: {
    title: 'Weather',
    subtitle: 'Weather Odds & Predictions 2026',
    tabs: ['All', 'Hurricane', 'Tornado', 'Earthquake', 'Climate', 'Wildfire', 'Flood'],
    tabTagMap: {
      'All': null,
      'Hurricane': 'hurricane',
      'Tornado': 'tornado',
      'Earthquake': 'earthquake',
      'Climate': 'climate',
      'Wildfire': 'wildfire',
      'Flood': 'flood',
    },
    filters: [],
    filterTagMap: {},
  },
  politics: {
    title: 'Politics',
    subtitle: 'Politics Prediction Markets & Live Odds 2026',
    tabs: ['All', 'Trump', 'US', 'UK', 'Germany', 'France', 'Congress', 'Courts'],
    tabTagMap: {
      'All': null,
      'Trump': 'trump',
      'US': 'us-politics',
      'UK': 'uk-elections',
      'Germany': 'german-elections',
      'France': 'french-elections',
      'Congress': 'congress',
      'Courts': 'supreme-court',
    },
    filters: [
      { label: 'Topic', items: ['All', 'Trump', 'Congress', 'Courts', 'UK', 'Germany', 'France', 'South Korea', 'Japan', 'Canada', 'Brazil', 'Ukraine', 'Israel'] },
    ],
    filterTagMap: {
      'Trump': 'trump', 'Congress': 'congress', 'Courts': 'supreme-court',
      'UK': 'uk-elections', 'Germany': 'german-elections', 'France': 'french-elections',
      'South Korea': 'south-korea', 'Japan': 'japan', 'Canada': 'canada',
      'Brazil': 'brazil', 'Ukraine': 'ukraine', 'Israel': 'israel',
    },
  },
  finance: {
    title: 'Finance',
    subtitle: 'Finance Odds & Predictions 2026',
    tabs: ['All', 'Stocks', 'Fed Rates', 'IPOs', 'Earnings', 'Indices', 'Commodities', 'Forex'],
    tabTagMap: {
      'All': null,
      'Stocks': 'stocks',
      'Fed Rates': 'interest-rates',
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
      'Stocks': 'stocks', 'Earnings': 'earnings', 'Indices': 'indices',
      'Commodities': 'commodities', 'Forex': 'forex', 'IPOs': 'ipos',
      'Fed Rates': 'interest-rates', 'Treasuries': 'bonds', 'Economics': 'economics',
    },
  },
  esports: {
    title: 'Esports',
    subtitle: 'Esports Odds & Predictions 2026',
    tabs: ['All', 'League of Legends', 'CS2', 'Dota 2', 'Valorant', 'Overwatch'],
    tabTagMap: {
      'All': null,
      'League of Legends': 'league-of-legends',
      'CS2': 'counter-strike',
      'Dota 2': 'dota-2',
      'Valorant': 'valorant',
      'Overwatch': 'overwatch',
    },
    filters: [],
    filterTagMap: {},
  },
  iran: {
    title: 'Iran',
    subtitle: 'Iran News & Prediction Markets 2026',
    tabs: ['All'],
    tabTagMap: { 'All': null },
    filters: [],
    filterTagMap: {},
  },
  geopolitics: {
    title: 'Geopolitics',
    subtitle: 'Global Geopolitics Prediction Markets 2026',
    tabs: ['All', 'Ukraine', 'Middle East', 'China', 'NATO', 'Korea', 'India-Pakistan'],
    tabTagMap: {
      'All': null,
      'Ukraine': 'ukraine',
      'Middle East': 'middle-east',
      'China': 'china',
      'NATO': 'nato',
      'Korea': 'korea',
      'India-Pakistan': 'india-pakistan',
    },
    filters: [],
    filterTagMap: {},
  },
  tech: {
    title: 'Tech',
    subtitle: 'Technology Prediction Markets 2026',
    tabs: ['All', 'AI', 'Space', 'Elon Musk', 'Apple', 'Google', 'Meta'],
    tabTagMap: {
      'All': null,
      'AI': 'ai',
      'Space': 'space',
      'Elon Musk': 'elon-musk',
      'Apple': 'apple',
      'Google': 'google',
      'Meta': 'meta',
    },
    filters: [],
    filterTagMap: {},
  },
  culture: {
    title: 'Culture',
    subtitle: 'Culture & Entertainment Prediction Markets 2026',
    tabs: ['All', 'Music', 'Movies', 'TV', 'Celebrity', 'Awards'],
    tabTagMap: {
      'All': null,
      'Music': 'music',
      'Movies': 'movies',
      'TV': 'tv',
      'Celebrity': 'celebrity',
      'Awards': 'awards',
    },
    filters: [],
    filterTagMap: {},
  },
  economy: {
    title: 'Economy',
    subtitle: 'Economy Prediction Markets 2026',
    tabs: ['All', 'Inflation', 'Jobs', 'GDP', 'Trade', 'Tariffs'],
    tabTagMap: {
      'All': null,
      'Inflation': 'inflation',
      'Jobs': 'jobs',
      'GDP': 'gdp',
      'Trade': 'trade',
      'Tariffs': 'tariffs',
    },
    filters: [],
    filterTagMap: {},
  },
  elections: {
    title: 'Elections',
    subtitle: 'Election Prediction Markets 2026',
    tabs: ['All', 'US', 'Global', 'Europe', 'Asia'],
    tabTagMap: {
      'All': null,
      'US': 'us-election',
      'Global': 'global-elections',
      'Europe': 'european-elections',
      'Asia': 'asia-elections',
    },
    filters: [],
    filterTagMap: {},
  },
  breaking: {
    title: 'Breaking News',
    subtitle: 'See the markets that moved the most in the last 24 hours',
    tabs: ['All', 'Politics', 'Sports', 'Crypto', 'Finance', 'Tech', 'Weather'],
    tabCategoryMap: {
      'All': null,
      'Politics': 'politics',
      'Sports': 'sports',
      'Crypto': 'crypto',
      'Finance': 'finance',
      'Tech': 'tech',
      'Weather': 'weather',
    },
    filters: [],
    filterTagMap: {},
  },
  new: {
    title: 'New Markets',
    subtitle: 'Freshly added prediction markets',
    tabs: ['All', 'Politics', 'Sports', 'Crypto', 'Finance', 'Tech'],
    tabCategoryMap: {
      'All': null,
      'Politics': 'politics',
      'Sports': 'sports',
      'Crypto': 'crypto',
      'Finance': 'finance',
      'Tech': 'tech',
    },
    filters: [],
    filterTagMap: {},
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

// Polymarket-style left coin sidebar for the crypto page
const CryptoSidebar = ({ coins, activeCoin, onCoinChange, coinCounts, activeTimeTab, onTimeTabChange, config }) => (
  <aside className="w-44 flex-shrink-0 hidden lg:block">
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      {/* All row */}
      <button
        onClick={() => onCoinChange(null)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors border-b border-[var(--color-border)] ${
          activeCoin === null
            ? 'bg-[var(--color-surface2)] text-[var(--color-text)] font-semibold'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
        }`}
      >
        <span>All</span>
        {coinCounts?.total != null && (
          <span className="text-[11px] text-[var(--color-text-muted)]">{coinCounts.total}</span>
        )}
      </button>
      {/* Per-coin rows */}
      {coins.map((coin) => (
        <button
          key={coin.tag}
          onClick={() => onCoinChange(coin.tag)}
          className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors border-b border-[var(--color-border)] last:border-0 ${
            activeCoin === coin.tag
              ? 'bg-[var(--color-surface2)] text-[var(--color-text)] font-semibold'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
          }`}
        >
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: coin.color }}
          >
            {coin.icon}
          </span>
          <span className="flex-1 text-left truncate">{coin.label}</span>
          {coinCounts?.[coin.tag] != null && (
            <span className="text-[11px] text-[var(--color-text-muted)]">{coinCounts[coin.tag]}</span>
          )}
        </button>
      ))}
      {/* Time tabs section */}
      {config.timeTabs && (
        <div className="border-t border-[var(--color-border)] pt-1">
          {config.timeTabs.map((t) => (
            <button
              key={t}
              onClick={() => onTimeTabChange(t === activeTimeTab ? null : t)}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                activeTimeTab === t
                  ? 'bg-[var(--color-surface2)] text-[var(--color-text)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
              }`}
            >
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  </aside>
);

const CategoryPage = () => {
  const { pathname } = useLocation();
  const slug = pathname.replace('/', '').split('/')[0] || 'crypto';
  const isBreaking = slug === 'breaking';
  const isNew = slug === 'new';
  const isVirtual = isBreaking || isNew; // virtual tabs — no DB category
  const isCrypto = slug === 'crypto';
  const categorySlug = isVirtual ? null : slug;
  const config = CATEGORY_CONFIG[slug] || CATEGORY_CONFIG.breaking;
  const [activeTab, setActiveTab] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeCoin, setActiveCoin] = useState(null);       // crypto sidebar
  const [activeTimeTab, setActiveTimeTab] = useState(null); // crypto time sidebar
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allMarkets, setAllMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [coinCounts, setCoinCounts] = useState({});

  useEffect(() => {
    setPage(1);
    setAllMarkets([]);
    setActiveTab('All');
    setActiveFilter('All');
    setActiveCoin(null);
    setActiveTimeTab(null);
  }, [slug]);

  // Pre-fetch per-coin counts for the crypto sidebar
  useEffect(() => {
    if (!isCrypto || !config.coins) return;
    const fetchCounts = async () => {
      const counts = {};
      const { data: all } = await marketsAPI.getMarkets({ category: 'crypto', limit: 1 }).catch(() => ({ data: {} }));
      counts.total = all?.total ?? 0;
      await Promise.all((config.coins || []).map(async (coin) => {
        const { data } = await marketsAPI.getMarkets({ category: 'crypto', tag: coin.tag, limit: 1 }).catch(() => ({ data: {} }));
        counts[coin.tag] = data?.total ?? 0;
      }));
      setCoinCounts(counts);
    };
    fetchCounts();
  }, [isCrypto]);

  useEffect(() => {
    let ignore = false; // guard against out-of-order responses overwriting state
    const fetchMarkets = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 16, sort: 'volume' };

        if (isBreaking) {
          params.sort = 'volume24hr';
          const mappedCategory = (config.tabCategoryMap || {})[activeTab];
          if (mappedCategory) params.category = mappedCategory;
        } else if (isNew) {
          params.sort = 'newest';
          const mappedCategory = (config.tabCategoryMap || {})[activeTab];
          if (mappedCategory) params.category = mappedCategory;
        } else {
          params.category = categorySlug;
          // Crypto page: coin sidebar takes priority, then time tab, then market-type tab
          if (isCrypto) {
            if (activeCoin) params.tag = activeCoin;
            else if (activeTimeTab) params.tag = (config.timeTagMap || {})[activeTimeTab];
            else {
              const tabTag = (config.tabTagMap || {})[activeTab];
              if (tabTag) params.tag = tabTag;
            }
          } else {
            const tabTag = (config.tabTagMap || {})[activeTab];
            if (tabTag) params.tag = tabTag;
          }
        }

        // Sidebar filter overrides tab tag (more specific)
        if (activeFilter !== 'All') {
          const filterTag = (config.filterTagMap || {})[activeFilter] || activeFilter.toLowerCase();
          params.tag = filterTag;
        }
        const { data } = await marketsAPI.getMarkets(params);
        if (ignore) return; // a newer filter selection superseded this request
        if (data.success) {
          if (page === 1) {
            setAllMarkets(data.markets);
          } else {
            setAllMarkets((prev) => {
              const existingIds = new Set(prev.map((m) => m._id));
              const fresh = data.markets.filter((m) => !existingIds.has(m._id));
              return [...prev, ...fresh];
            });
          }
          setTotal(data.total);
          setPages(data.pages);
        }
      } catch {}
      if (!ignore) setLoading(false);
    };
    fetchMarkets();
    return () => { ignore = true; };
  }, [slug, page, activeFilter, activeTab, activeCoin, activeTimeTab, isBreaking, isNew, isCrypto, categorySlug]);

  const { data: newMarketsData } = useMarkets({ category: isVirtual ? null : categorySlug, sort: 'newest', limit: 4 });
  const newMarkets = newMarketsData?.markets || [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] mb-1">{config.title}</h1>
          <p className="text-[var(--color-text-muted)] text-sm">{config.subtitle}</p>
        </div>

        <div className="flex gap-5">
          {/* Crypto: Polymarket-style left coin sidebar */}
          {isCrypto && config.coins && (
            <CryptoSidebar
              coins={config.coins}
              activeCoin={activeCoin}
              onCoinChange={(c) => { setActiveCoin(c); setActiveTimeTab(null); setActiveTab('All'); setPage(1); setAllMarkets([]); }}
              coinCounts={coinCounts}
              activeTimeTab={activeTimeTab}
              onTimeTabChange={(t) => { setActiveTimeTab(t); setActiveCoin(null); setActiveTab('All'); setPage(1); setAllMarkets([]); }}
              config={config}
            />
          )}

          {/* Other categories: filter sidebar */}
          {!isCrypto && config.filters.length > 0 && (
            <div className="hidden md:block">
              <Sidebar config={config} activeFilter={activeFilter} onFilterChange={(f) => { setActiveFilter(f); setPage(1); }} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Top filter tabs + search */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-center">
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-1 min-w-max">
                  {config.tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => { setActiveTab(tab); setActiveCoin(null); setActiveTimeTab(null); setPage(1); setAllMarkets([]); }}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab
                          ? 'bg-[var(--color-gold)] text-black'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <SearchBar placeholder={`Search ${config.title}...`} className="w-full sm:w-48" />
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

            {/* Active filter breadcrumb */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                {total > 0 && <span className="font-medium text-[var(--color-text)]">{total}</span>} {total === 1 ? 'market' : 'markets'}
                {activeCoin && <span className="text-[var(--color-gold)] ml-1">· {config.coins?.find(c => c.tag === activeCoin)?.label}</span>}
                {activeTimeTab && <span className="text-[var(--color-gold)] ml-1">· {activeTimeTab}</span>}
                {activeFilter !== 'All' && <span className="text-[var(--color-gold)] ml-1">· {activeFilter}</span>}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading && page === 1
                ? Array.from({ length: 9 }).map((_, i) => <MarketCardSkeleton key={i} />)
                : allMarkets.map((market) => <MarketCard key={`main-${market._id}`} market={market} />)
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

            {/* {newMarkets.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">
                  🆕 New {config.title} markets
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {newMarkets.filter((m) => !allMarkets.some((x) => x._id === m._id)).map((m) => <MarketCard key={`new-${m._id}`} market={m} />)}
                </div>
              </section>
            )} */}
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
