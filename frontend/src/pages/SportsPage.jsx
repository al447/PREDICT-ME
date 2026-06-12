import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronDown, ChevronUp, Radio, Bookmark, TrendingUp } from 'lucide-react';
import Layout from '../components/layout/Layout';
import MarketCard from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/common/Skeleton';
import { marketsAPI } from '../services/api';
import { formatVolume } from '../utils/format';

// ── Sport definitions ─────────────────────────────────────────────────────────
const SPORTS = [
  { label: 'NBA',        tag: 'nba',       icon: '🏀' },
  { label: 'MLB',        tag: 'mlb',       icon: '⚾' },
  { label: 'NHL',        tag: 'nhl',       icon: '🏒' },
  { label: 'NFL',        tag: 'nfl',       icon: '🏈' },
  { label: 'UFC',        tag: 'ufc',       icon: '🥊' },
  { label: 'Soccer',     tag: 'soccer',    icon: '⚽' },
  { label: 'Tennis',     tag: 'tennis',    icon: '🎾' },
  { label: 'Cricket',    tag: 'cricket',   icon: '🏏' },
  { label: 'Basketball', tag: 'basketball',icon: '🏀' },
  { label: 'Baseball',   tag: 'baseball',  icon: '⚾' },
  { label: 'Hockey',     tag: 'hockey',    icon: '🏒' },
  { label: 'Rugby',      tag: 'rugby',     icon: '🏉' },
  { label: 'Golf',       tag: 'golf',      icon: '⛳' },
  { label: 'F1',         tag: 'formula-1', icon: '🏎️' },
  { label: 'Boxing',     tag: 'boxing',    icon: '🥊' },
  { label: 'Esports',    tag: 'esports',   icon: '🎮' },
  { label: 'Pickleball', tag: 'pickleball',icon: '🏓' },
];

const FUTURES_SPORTS = [
  { label: 'NBA',    tag: 'nba',       icon: '🏀' },
  { label: 'MLB',    tag: 'mlb',       icon: '⚾' },
  { label: 'NHL',    tag: 'nhl',       icon: '🏒' },
  { label: 'NFL',    tag: 'nfl',       icon: '🏈' },
  { label: 'Soccer', tag: 'soccer',    icon: '⚽' },
  { label: 'Tennis', tag: 'tennis',    icon: '🎾' },
  { label: 'Golf',   tag: 'golf',      icon: '⛳' },
  { label: 'F1',     tag: 'formula-1', icon: '🏎️' },
  { label: 'Boxing', tag: 'boxing',    icon: '🥊' },
];

const SORT_OPTIONS = [
  { label: 'Volume', value: 'volume' },
  { label: 'New', value: 'newest' },
  { label: 'Ending soon', value: 'endDate' },
];

// ── Live game row — Polymarket /sports/live style ─────────────────────────────
// Parses market title to extract team names + shows moneyline/spread/total columns
const parseGameMarket = (market) => {
  // Try to detect "Team A vs Team B" pattern
  const vsMatch = market.title?.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*[\(\-].*)?$/i);
  if (vsMatch) {
    return { teamA: vsMatch[1].trim(), teamB: vsMatch[2].trim(), isGame: true };
  }
  return { isGame: false };
};

const LiveGameRow = ({ market }) => {
  const { teamA, teamB, isGame } = parseGameMarket(market);
  const yes = market.outcomes?.find(o => o.name === 'Yes') || market.outcomes?.[0];
  const no = market.outcomes?.find(o => o.name === 'No') || market.outcomes?.[1];
  const yesPct = Math.min(99, Math.max(1, yes?.probability ?? Math.round((yes?.price ?? 0.5) * 100)));
  const noPct = no ? Math.min(99, Math.max(1, no?.probability ?? Math.round((no?.price ?? 0.5) * 100))) : 100 - yesPct;

  if (!isGame) {
    // fallback: generic market row
    return (
      <Link
        to={`/market/${market.slug}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface2)] transition-colors group"
      >
        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--color-surface2)]">
          {market.image
            ? <img src={market.image} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
            : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">{market.title?.charAt(0)}</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1 group-hover:text-[var(--color-gold)] transition-colors">{market.title}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{formatVolume(market.volume || 0)} Vol.</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button className="px-3 py-1.5 rounded-lg bg-[var(--color-btn-yes)] text-[var(--color-btn-yes-text)] text-xs font-bold hover:brightness-110 min-w-[48px]">
            Yes {yesPct}¢
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-[var(--color-btn-no)] text-[var(--color-btn-no-text)] text-xs font-bold hover:brightness-110 min-w-[48px]">
            No {noPct}¢
          </button>
        </div>
      </Link>
    );
  }

  // Game row with Moneyline column
  return (
    <Link
      to={`/market/${market.slug}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--color-surface2)] transition-colors group"
    >
      {/* Status */}
      <div className="w-10 text-center flex-shrink-0">
        {market.status === 'active' && (
          <div className="flex flex-col items-center">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mb-0.5" />
            <span className="text-[10px] text-red-400 font-bold">LIVE</span>
          </div>
        )}
      </div>

      {/* Teams */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-[var(--color-text)] truncate group-hover:text-[var(--color-gold)] transition-colors">{teamA}</span>
          <span className="text-sm text-[var(--color-text-muted)] truncate">{teamB}</span>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{formatVolume(market.volume || 0)} Vol.</p>
      </div>

      {/* Moneyline column */}
      <div className="flex-shrink-0 hidden sm:flex flex-col gap-0.5 min-w-[80px] text-right">
        <span className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Moneyline</span>
        <button className="px-2.5 py-1 rounded-lg bg-[var(--color-btn-yes)] text-[var(--color-btn-yes-text)] text-xs font-bold hover:brightness-110 w-full">
          {yesPct}¢
        </button>
        <button className="px-2.5 py-1 rounded-lg bg-[var(--color-btn-no)] text-[var(--color-btn-no-text)] text-xs font-bold hover:brightness-110 w-full">
          {noPct}¢
        </button>
      </div>

      {/* Mobile: just outcome buttons */}
      <div className="sm:hidden flex gap-1.5 flex-shrink-0">
        <button className="px-3 py-1.5 rounded-lg bg-[var(--color-btn-yes)] text-[var(--color-btn-yes-text)] text-xs font-bold min-w-[44px]">
          {yesPct}¢
        </button>
        <button className="px-3 py-1.5 rounded-lg bg-[var(--color-btn-no)] text-[var(--color-btn-no-text)] text-xs font-bold min-w-[44px]">
          {noPct}¢
        </button>
      </div>

      <Bookmark className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </Link>
  );
};

// ── Sport section with expandable game rows ───────────────────────────────────
const SportSection = ({ sport }) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    marketsAPI.getMarkets({ category: 'sports', tag: sport.tag, sort: 'volume', limit: 15 })
      .then(r => setMarkets(r.data?.markets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sport.tag]);

  if (!loading && markets.length === 0) return null;

  const shown = expanded ? markets : markets.slice(0, 5);

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
          <span>{sport.icon}</span> {sport.label}
          {!loading && <span className="text-[11px] text-[var(--color-text-muted)] font-normal">{markets.length}</span>}
        </h2>
        <Link to={`/sports?tag=${sport.tag}`} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors">
          All {sport.label}
        </Link>
      </div>

      {/* Column headers — only for game-style view */}
      <div className="hidden sm:flex items-center gap-4 px-4 pb-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
        <div className="w-10 flex-shrink-0" />
        <div className="flex-1">Matchup</div>
        <div className="min-w-[80px] text-right">Moneyline</div>
        <div className="w-4" />
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-10 h-8 rounded bg-[var(--color-surface2)]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-[var(--color-surface2)] rounded w-2/3" />
                  <div className="h-3 bg-[var(--color-surface2)] rounded w-1/2" />
                </div>
                <div className="flex gap-1.5">
                  <div className="w-14 h-7 bg-[var(--color-surface2)] rounded-lg" />
                  <div className="w-14 h-7 bg-[var(--color-surface2)] rounded-lg" />
                </div>
              </div>
            ))
          : shown.map(m => <LiveGameRow key={m._id} market={m} />)
        }
      </div>

      {!loading && markets.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors ml-4"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
            : <><ChevronDown className="w-3.5 h-3.5" /> View more ({markets.length - 5} more)</>
          }
        </button>
      )}
    </section>
  );
};

// ── Left sport sidebar ────────────────────────────────────────────────────────
const SportsSidebar = ({ mode, activeSport, onSelect, counts }) => {
  const list = mode === 'live' ? SPORTS : FUTURES_SPORTS;
  return (
    <aside className="w-44 flex-shrink-0 hidden lg:block">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden sticky top-20">
        <div className="py-1 max-h-[75vh] overflow-y-auto">
          <button
            onClick={() => onSelect(null)}
            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors border-b border-[var(--color-border)] ${
              activeSport === null
                ? 'bg-[var(--color-surface2)] text-[var(--color-text)] font-semibold'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
            }`}
          >
            <span>All Sports</span>
            {counts.all != null && <span className="text-[11px] text-[var(--color-text-muted)]">{counts.all}</span>}
          </button>
          {list.map(({ label, tag, icon }) => (
            <button
              key={tag}
              onClick={() => onSelect(tag)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors border-b border-[var(--color-border)] last:border-0 ${
                activeSport === tag
                  ? 'bg-[var(--color-surface2)] text-[var(--color-text)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] hover:text-[var(--color-text)]'
              }`}
            >
              <span>{icon}</span>
              <span className="flex-1 text-left">{label}</span>
              {counts[tag] != null && <span className="text-[11px] text-[var(--color-text-muted)]">{counts[tag]}</span>}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const SportsPage = () => {
  const [mode, setMode] = useState('live'); // 'live' | 'futures'
  const [activeSport, setActiveSport] = useState(null);
  const [sort, setSort] = useState('volume');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [markets, setMarkets] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [newMarkets, setNewMarkets] = useState([]);

  // Fetch counts for sidebar
  useEffect(() => {
    const fetchCounts = async () => {
      const c = {};
      const { data: all } = await marketsAPI.getMarkets({ category: 'sports', limit: 1 }).catch(() => ({ data: {} }));
      c.all = all?.total ?? 0;
      await Promise.all(
        SPORTS.map(async ({ tag }) => {
          const { data } = await marketsAPI.getMarkets({ category: 'sports', tag, limit: 1 }).catch(() => ({ data: {} }));
          c[tag] = data?.total ?? 0;
        })
      );
      setCounts(c);
    };
    fetchCounts();
  }, []);

  // Fetch new markets
  useEffect(() => {
    marketsAPI.getMarkets({ category: 'sports', sort: 'newest', limit: 10 })
      .then(r => setNewMarkets(r.data?.markets || []))
      .catch(() => {});
  }, []);

  // Fetch main list
  useEffect(() => {
    setLoading(true);
    const params = { category: 'sports', sort, limit: 20, page };
    if (activeSport) params.tag = activeSport;
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
  }, [activeSport, sort, search, page]);

  const handleSportSelect = (tag) => {
    setActiveSport(tag);
    setPage(1);
    setMarkets([]);
  };

  // Active sport list for "Live" section-by-section view
  const liveSportsList = activeSport
    ? SPORTS.filter(s => s.tag === activeSport)
    : SPORTS.filter(s => counts[s.tag] > 0);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-5">
          {/* Left sidebar */}
          <SportsSidebar mode={mode} activeSport={activeSport} onSelect={handleSportSelect} counts={counts} />

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header + Live/Futures toggle */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">Sports</h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Sports Odds & Prediction Markets 2026</p>
              </div>
              {/* Live / Futures tabs */}
              <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1">
                <button
                  onClick={() => { setMode('live'); setActiveSport(null); setPage(1); setMarkets([]); }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'live' ? 'bg-[var(--color-gold)] text-black' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  Live
                </button>
                <button
                  onClick={() => { setMode('futures'); setActiveSport(null); setPage(1); setMarkets([]); }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'futures' ? 'bg-[var(--color-gold)] text-black' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Futures
                </button>
              </div>
            </div>

            {/* Mobile sport pills */}
            <div className="lg:hidden overflow-x-auto mb-4 -mx-4 px-4">
              <div className="flex gap-1.5 min-w-max">
                <button
                  onClick={() => handleSportSelect(null)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    activeSport === null ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  All
                </button>
                {(mode === 'live' ? SPORTS : FUTURES_SPORTS).map(({ label, tag, icon }) => (
                  <button
                    key={tag}
                    onClick={() => handleSportSelect(tag)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                      activeSport === tag ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <span>{icon}</span> {label}
                    {counts[tag] > 0 && <span className="opacity-60">{counts[tag]}</span>}
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
                  placeholder="Search sports markets..."
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
                      sort === opt.value ? 'bg-[var(--color-gold)] text-black' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active filter breadcrumb */}
            {activeSport && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-[var(--color-text-muted)]">Showing:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-gold)]/15 text-[var(--color-gold)] text-xs font-semibold">
                  {SPORTS.find(s => s.tag === activeSport)?.label || activeSport}
                </span>
                <button onClick={() => handleSportSelect(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Clear</button>
                {total > 0 && <span className="text-xs text-[var(--color-text-muted)]">· {total} markets</span>}
              </div>
            )}

            {/* Live mode: section-per-sport game rows */}
            {mode === 'live' && !search && (
              <>
                {liveSportsList.map(sport => (
                  <SportSection key={sport.tag} sport={sport} />
                ))}

                {/* New sports markets */}
                {!activeSport && newMarkets.length > 0 && (
                  <section className="mt-6">
                    <h2 className="text-base font-bold text-[var(--color-text)] mb-3">🆕 New Sports markets</h2>
                    <div className="bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
                      {newMarkets.map(m => <LiveGameRow key={m._id} market={m} />)}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Futures mode OR search: card grid */}
            {(mode === 'futures' || search) && (
              <>
                {mode === 'futures' && !search && (
                  <div className="mb-4">
                    <h2 className="text-base font-bold text-[var(--color-text)] mb-1">Futures & Season Markets</h2>
                    <p className="text-xs text-[var(--color-text-muted)]">Season champions, awards, and long-term sports predictions</p>
                  </div>
                )}
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
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SportsPage;
