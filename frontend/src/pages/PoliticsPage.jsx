import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, Eye, ChevronDown, ChevronUp, Bookmark } from 'lucide-react';
import Layout from '../components/layout/Layout';
import MarketCard from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/common/Skeleton';
import { marketsAPI } from '../services/api';
import { formatVolume } from '../utils/format';

// ── Sub-category pills (mirrors Polymarket /politics sidebar) ─────────────────
const SUB_CATEGORIES = [
  { label: 'All', count: null, tag: null },
  { label: 'Trump', tag: 'trump' },
  { label: 'Trump Daily', tag: 'trump-daily' },
  { label: 'Midterms', tag: 'midterms' },
  { label: 'Global Elections', tag: 'global-elections' },
  { label: 'Primaries', tag: 'primaries' },
  { label: 'Congress', tag: 'congress' },
  { label: 'Trump Cabinet', tag: 'trump-cabinet' },
  { label: 'Courts', tag: 'supreme-court' },
  { label: 'US Election', tag: 'us-politics' },
  { label: 'UK Elections', tag: 'uk-elections' },
  { label: 'Germany', tag: 'german-elections' },
  { label: 'France', tag: 'french-elections' },
  { label: 'South Korea', tag: 'south-korea' },
  { label: 'Japan', tag: 'japan' },
  { label: 'China', tag: 'china' },
  { label: 'Brazil', tag: 'brazil' },
  { label: 'Canada', tag: 'canada' },
  { label: 'Venezuela', tag: 'venezuela' },
  { label: 'Israel', tag: 'israel' },
  { label: 'Iran', tag: 'iran' },
  { label: 'Ukraine', tag: 'ukraine' },
];

// ── Featured event groups (curated sections) ─────────────────────────────────
const FEATURED_GROUPS = [
  { label: '2026 Midterms', tag: 'midterms', icon: '🗳️' },
  { label: 'Trump', tag: 'trump', icon: '🇺🇸' },
  { label: 'Global Elections', tag: 'global-elections', icon: '🌍' },
  { label: 'Congress', tag: 'congress', icon: '🏛️' },
];

const SORT_OPTIONS = [
  { label: 'Volume', value: 'volume' },
  { label: 'New', value: 'newest' },
  { label: 'Ending soon', value: 'endDate' },
];

// ── Inline market row (Polymarket list-style) ─────────────────────────────────
const MarketRow = ({ market }) => {
  const yes = market.outcomes?.find(o => o.name === 'Yes') || market.outcomes?.[0];
  const no = market.outcomes?.find(o => o.name === 'No') || market.outcomes?.[1];
  const yesPct = Math.min(99, Math.max(1, yes?.probability ?? Math.round((yes?.price ?? 0.5) * 100)));
  const noPct = no ? Math.min(99, Math.max(1, no?.probability ?? Math.round((no?.price ?? 0.5) * 100))) : 100 - yesPct;
  const isMulti = market.outcomes?.length > 2;

  return (
    <Link
      to={`/market/${market.slug}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface2)] transition-colors rounded-xl group"
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--color-surface2)]">
        {market.image
          ? <img src={market.image} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">{market.title?.charAt(0)}</div>
        }
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1 group-hover:text-[var(--color-gold)] transition-colors">{market.title}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{formatVolume(market.volume || 0)} Vol.</p>
      </div>

      {/* Outcome buttons */}
      <div className="flex gap-1.5 flex-shrink-0">
        {isMulti
          ? market.outcomes.slice(0, 3).map((o, i) => {
              const pct = Math.min(99, Math.max(1, o.probability ?? Math.round((o.price ?? 0) * 100)));
              const COLORS = ['#22c55e', '#ef4444', '#f97316'];
              return (
                <div key={o.name} className="flex flex-col items-center min-w-[52px] px-2 py-1 rounded-lg bg-[var(--color-surface2)]">
                  <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[48px]">{o.name}</span>
                  <span className="text-xs font-bold" style={{ color: COLORS[i] }}>{pct}%</span>
                </div>
              );
            })
          : <>
              <button className="px-3 py-1.5 rounded-lg bg-[var(--color-btn-yes)] text-[var(--color-btn-yes-text)] text-xs font-bold hover:brightness-110 transition-all min-w-[52px]">
                Yes {yesPct}¢
              </button>
              <button className="px-3 py-1.5 rounded-lg bg-[var(--color-btn-no)] text-[var(--color-btn-no-text)] text-xs font-bold hover:brightness-110 transition-all min-w-[52px]">
                No {noPct}¢
              </button>
            </>
        }
      </div>

      <Bookmark className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </Link>
  );
};

// ── Featured group section ────────────────────────────────────────────────────
const FeaturedGroup = ({ group }) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    marketsAPI.getMarkets({ category: 'politics', tag: group.tag, limit: 10, sort: 'volume' })
      .then(r => setMarkets(r.data?.markets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [group.tag]);

  const shown = expanded ? markets : markets.slice(0, 5);

  if (!loading && markets.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
          <span>{group.icon}</span> {group.label}
        </h2>
        <Link to={`/politics?tag=${group.tag}`} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors">
          View all
        </Link>
      </div>
      <div className="bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-surface2)]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-[var(--color-surface2)] rounded w-3/4" />
                  <div className="h-2.5 bg-[var(--color-surface2)] rounded w-1/4" />
                </div>
                <div className="flex gap-1.5">
                  <div className="w-14 h-7 bg-[var(--color-surface2)] rounded-lg" />
                  <div className="w-14 h-7 bg-[var(--color-surface2)] rounded-lg" />
                </div>
              </div>
            ))
          : shown.map(m => <MarketRow key={m._id} market={m} />)
        }
      </div>
      {!loading && markets.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors ml-4"
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> View more ({markets.length - 5} more)</>}
        </button>
      )}
    </section>
  );
};

// ── Left sub-category sidebar ─────────────────────────────────────────────────
const PoliticsSidebar = ({ active, onSelect, counts }) => (
  <aside className="w-52 flex-shrink-0 hidden lg:block">
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden sticky top-20">
      <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
        <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Politics</p>
      </div>
      <div className="py-1 max-h-[70vh] overflow-y-auto">
        {SUB_CATEGORIES.map(({ label, tag }) => (
          <button
            key={label}
            onClick={() => onSelect(tag)}
            className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${
              active === tag
                ? 'bg-[var(--color-surface2)] text-[var(--color-text)] font-semibold'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
            }`}
          >
            <span>{label}</span>
            {counts[tag ?? 'all'] != null && (
              <span className="text-[11px] text-[var(--color-text-muted)]">{counts[tag ?? 'all']}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  </aside>
);

// ── Main page ─────────────────────────────────────────────────────────────────
const PoliticsPage = () => {
  const [activeTag, setActiveTag] = useState(null);
  const [sort, setSort] = useState('volume');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [markets, setMarkets] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [newMarkets, setNewMarkets] = useState([]);

  // Fetch sub-category counts for sidebar
  useEffect(() => {
    const fetchCounts = async () => {
      const c = {};
      const { data: all } = await marketsAPI.getMarkets({ category: 'politics', limit: 1 }).catch(() => ({ data: {} }));
      c.all = all?.total ?? 0;
      await Promise.all(
        SUB_CATEGORIES.filter(s => s.tag).map(async ({ tag }) => {
          const { data } = await marketsAPI.getMarkets({ category: 'politics', tag, limit: 1 }).catch(() => ({ data: {} }));
          c[tag] = data?.total ?? 0;
        })
      );
      setCounts(c);
    };
    fetchCounts();
  }, []);

  // Fetch new markets for the bottom section
  useEffect(() => {
    marketsAPI.getMarkets({ category: 'politics', sort: 'newest', limit: 10 })
      .then(r => setNewMarkets(r.data?.markets || []))
      .catch(() => {});
  }, []);

  // Fetch main market list
  useEffect(() => {
    setLoading(true);
    const params = { category: 'politics', sort, limit: 20, page };
    if (activeTag) params.tag = activeTag;
    if (search) params.search = search;
    marketsAPI.getMarkets(params)
      .then(r => {
        if (r.data?.success) {
          if (page === 1) setMarkets(r.data.markets);
          else setMarkets(p => [...p, ...r.data.markets]);
          setTotal(r.data.total);
          setPages(r.data.pages);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTag, sort, search, page]);

  const handleTagSelect = (tag) => {
    setActiveTag(tag);
    setPage(1);
    setMarkets([]);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-5">
          {/* Left sidebar */}
          <PoliticsSidebar active={activeTag} onSelect={handleTagSelect} counts={counts} />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">Politics</h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Politics Prediction Markets & Live Odds 2026</p>
              </div>
            </div>

            {/* Mobile sub-category pills */}
            <div className="lg:hidden overflow-x-auto mb-4 -mx-4 px-4">
              <div className="flex gap-1.5 min-w-max">
                {SUB_CATEGORIES.slice(0, 10).map(({ label, tag }) => (
                  <button
                    key={label}
                    onClick={() => handleTagSelect(tag)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTag === tag
                        ? 'bg-[var(--color-gold)] text-black'
                        : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search + sort bar */}
            <div className="flex items-center gap-2 mb-5">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search politics markets..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); setMarkets([]); }}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-gold)]"
                />
              </div>
              <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1 flex-shrink-0">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setSort(opt.value); setPage(1); setMarkets([]); }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      sort === opt.value
                        ? 'bg-[var(--color-gold)] text-black'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active tag breadcrumb */}
            {activeTag && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-[var(--color-text-muted)]">Showing:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-gold)]/15 text-[var(--color-gold)] text-xs font-semibold">
                  {SUB_CATEGORIES.find(s => s.tag === activeTag)?.label || activeTag}
                </span>
                <button onClick={() => handleTagSelect(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Clear</button>
                {total > 0 && <span className="text-xs text-[var(--color-text-muted)]">· {total} markets</span>}
              </div>
            )}

            {/* When no active tag: show featured groups then all-markets grid */}
            {!activeTag && !search && (
              <>
                {FEATURED_GROUPS.map(group => (
                  <FeaturedGroup key={group.tag} group={group} />
                ))}

                {/* New politics markets */}
                {newMarkets.length > 0 && (
                  <section className="mb-8">
                    <h2 className="text-base font-bold text-[var(--color-text)] mb-3">🆕 New Politics markets</h2>
                    <div className="bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
                      {newMarkets.map(m => <MarketRow key={m._id} market={m} />)}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Filtered / search view: card grid */}
            {(activeTag || search) && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {loading && page === 1
                    ? Array.from({ length: 9 }).map((_, i) => <MarketCardSkeleton key={i} />)
                    : markets.map(m => <MarketCard key={m._id} market={m} />)
                  }
                </div>
                {!loading && markets.length === 0 && (
                  <div className="text-center py-16 text-[var(--color-text-muted)]">
                    <p className="text-lg mb-2">No markets found</p>
                    <p className="text-sm">Try adjusting your filters</p>
                  </div>
                )}
                {page < pages && (
                  <div className="text-center mt-6">
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* All markets section (when no filter active) */}
            {!activeTag && !search && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-[var(--color-text)]">All Politics markets</h2>
                  <span className="text-xs text-[var(--color-text-muted)]">{total > 0 ? `${total} markets` : ''}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {loading && page === 1
                    ? Array.from({ length: 6 }).map((_, i) => <MarketCardSkeleton key={i} />)
                    : markets.map(m => <MarketCard key={m._id} market={m} />)
                  }
                </div>
                {!loading && markets.length === 0 && (
                  <div className="text-center py-16 text-[var(--color-text-muted)]">
                    <p className="text-lg mb-2">No markets found</p>
                  </div>
                )}
                {page < pages && (
                  <div className="text-center mt-6">
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PoliticsPage;
