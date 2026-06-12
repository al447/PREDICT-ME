import { useParams, Link } from 'react-router-dom';
import { useState, lazy, Suspense, useMemo } from 'react';
import { ChevronRight, Heart, TrendingUp, Clock, Users, MessageSquare, Activity, BookOpen, Trophy } from 'lucide-react';
import Layout from '../components/layout/Layout';
import RewardsBadge from '../components/market/RewardsBadge';
import ShareEmbed from '../components/common/ShareEmbed';
import OrderBook from '../components/common/OrderBook';
import Skeleton from '../components/common/Skeleton';
import Button from '../components/common/Button';
import useTradeStore from '../store/tradeStore';
import useAuthStore from '../store/authStore';
import useDepositModalStore from '../store/depositModalStore';
import { useMarket, useMarketComments, useMarketHolders, useMarketActivity } from '../hooks/useMarkets';
import { useClobActivity, useClobHolders } from '../hooks/useClob';
import useFavorites from '../hooks/useFavorites';
import { formatVolume, formatDate, formatBalance } from '../utils/format';

// Use own CLOB data when ONCHAIN_ENABLED
const USE_OWN_DATA = import.meta.env.VITE_ONCHAIN_ENABLED === 'true';

const MarketChart = lazy(() => import('../components/market/MarketChart'));

// ── Palette ──────────────────────────────────────────────────────────────────
const PM_GREEN = '#00c853';
const PM_RED   = '#ff3d57';
const PM_BLUE  = '#2563eb';

// ── Candidate row in grouped event ───────────────────────────────────────────
const CandidateRow = ({ candidate, rank, onBuy, onSell, isSelected, onSelect }) => {
  const pct = candidate.probability ?? 0;
  const isUrl = candidate.image && (candidate.image.startsWith('http') || candidate.image.startsWith('/'));

  return (
    <div
      onClick={() => onSelect(candidate.name)}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface2)] ${isSelected ? 'bg-[var(--color-surface2)]' : ''}`}
    >
      <span className="w-5 text-xs text-[var(--color-text-muted)] flex-shrink-0">{rank}</span>

      {isUrl ? (
        <img src={candidate.image} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          onError={e => { e.target.style.display='none'; }} />
      ) : (
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
          style={{ background: `hsl(${(rank * 47) % 360},50%,40%)` }}>
          {candidate.name.charAt(0).toUpperCase()}
        </div>
      )}

      <span className="flex-1 text-sm font-medium text-[var(--color-text)] truncate">{candidate.name}</span>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right w-16">
          <div className="text-sm font-bold text-[var(--color-text)]">{pct}%</div>
          <div className="h-1 w-full rounded-full bg-[var(--color-border)] mt-1">
            <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: PM_GREEN }} />
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onBuy(candidate.name); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'rgba(0,200,83,0.15)', color: PM_GREEN, border: `1px solid rgba(0,200,83,0.4)` }}
        >
          Yes {pct}¢
        </button>
        <button
          onClick={e => { e.stopPropagation(); onSell(candidate.name); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'rgba(255,61,87,0.15)', color: PM_RED, border: `1px solid rgba(255,61,87,0.4)` }}
        >
          No {100 - pct}¢
        </button>
      </div>
    </div>
  );
};

// ── Per-candidate / binary Trading Panel ─────────────────────────────────────
const QUICK_AMOUNTS = [1, 5, 10, 20, 50, 100];

const TradingPanel = ({ market, selectedCandidate, onCandidateChange }) => {
  const isGrouped = market?.marketType === 'grouped';
  const [selectedOutcome, setSelectedOutcome] = useState('Yes');
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { placeTrade, isPlacing, lastMarketUpdate } = useTradeStore();
  const { user, openAuthModal } = useAuthStore();

  const liveMarket = useMemo(() => {
    if (lastMarketUpdate?._id === market?._id) return { ...market, ...lastMarketUpdate };
    return market;
  }, [market, lastMarketUpdate]);

  const candidateObj = isGrouped
    ? (liveMarket?.candidates || []).find(c => c.name === selectedCandidate)
    : null;

  const price = isGrouped
    ? (selectedOutcome === 'Yes' ? (candidateObj?.probability ?? 50) : (100 - (candidateObj?.probability ?? 50)))
    : (liveMarket?.outcomes?.find(o => o.name === selectedOutcome)?.price ?? 50);

  const parsedAmount = parseFloat(amount) || 0;
  const shares = price > 0 ? parsedAmount / (price / 100) : 0;

  const cantTrade = !market || market.status !== 'active'
    || (market.endDate && new Date(market.endDate) < new Date())
    || (market.closeDate && new Date(market.closeDate) < new Date());

  const insufficientBalance = user && parsedAmount > (user.balance || 0);
  const needsCandidate = isGrouped && !selectedCandidate;

  const handleTrade = async () => {
    if (!user) { openAuthModal(); return; }
    if (cantTrade || parsedAmount < 1 || insufficientBalance) return;
    if (needsCandidate) return;
    if (parsedAmount >= 50 && !confirmOpen) { setConfirmOpen(true); return; }
    setConfirmOpen(false);
    const result = await placeTrade(market._id, selectedOutcome, parsedAmount, isGrouped ? selectedCandidate : null, market);
    if (result) setAmount('');
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sticky top-32">
      <h3 className="font-semibold text-[var(--color-text)] mb-3 text-sm">Place Trade</h3>

      {isGrouped && selectedCandidate && (
        <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-muted)]">Candidate</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{selectedCandidate}</span>
        </div>
      )}

      {isGrouped && !selectedCandidate && (
        <div className="mb-3 text-xs text-center text-[var(--color-text-muted)] px-2 py-3 border border-dashed border-[var(--color-border)] rounded-lg">
          Select a candidate from the list to trade
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {['Yes', 'No'].map(o => {
          const p = isGrouped
            ? (o === 'Yes' ? (candidateObj?.probability ?? 50) : (100 - (candidateObj?.probability ?? 50)))
            : (liveMarket?.outcomes?.find(out => out.name === o)?.price ?? 50);
          const isYes = o === 'Yes';
          const isActive = selectedOutcome === o;
          return (
            <button key={o} onClick={() => setSelectedOutcome(o)} disabled={cantTrade}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all border disabled:opacity-50 disabled:cursor-not-allowed"
              style={isActive ? {
                background: isYes ? 'rgba(0,200,83,0.2)' : 'rgba(255,61,87,0.2)',
                borderColor: isYes ? PM_GREEN : PM_RED,
                color: isYes ? PM_GREEN : PM_RED,
              } : {
                background: 'var(--color-surface2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              <div>Buy {o}</div>
              <div className="text-lg font-bold mt-0.5">{p}¢</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-[var(--color-text-muted)]">Amount ($)</label>
          {user && (
            <div className="flex gap-1">
              {[['25%', 0.25], ['50%', 0.5], ['Max', 1]].map(([label, pct]) => (
                <button key={label} onClick={() => { const v = Math.floor((user.balance||0)*pct); if(v>=1) setAmount(String(v)); }}
                  className="px-2 py-0.5 text-[10px] rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]/50 transition-colors">
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => setAmount(a => String(Math.max(1, (parseFloat(a)||0)-1)))}
            className="w-10 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold transition-colors flex items-center justify-center">−</button>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" min="1" max="100000"
            className="flex-1 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm focus:outline-none text-center font-semibold"
            style={{ '--tw-ring-color': PM_BLUE }} />
          <button onClick={() => setAmount(a => String((parseFloat(a)||0)+1))}
            className="w-10 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold transition-colors flex items-center justify-center">+</button>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {QUICK_AMOUNTS.map(a => (
            <button key={a} onClick={() => setAmount(String(a))}
              className={`py-1.5 text-xs rounded-lg border transition-colors font-medium ${amount === String(a) ? 'border-[var(--color-gold)] text-[var(--color-gold)] bg-[var(--color-gold)]/10' : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]/50'}`}>
              ${a}
            </button>
          ))}
        </div>
      </div>

      {parsedAmount > 0 && (
        <div className="bg-[var(--color-surface2)] rounded-xl p-3 mb-4 space-y-2 text-sm border border-[var(--color-border)]">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Avg price</span>
            <span className="text-[var(--color-text)] font-semibold">{price}¢</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Shares</span>
            <span className="text-[var(--color-text)] font-semibold">{shares.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-2">
            <span className="text-[var(--color-text-muted)]">Potential profit</span>
            <span className="font-bold" style={{ color: PM_GREEN }}>
              +${(shares - parsedAmount).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3 mb-3 text-xs">
          <p className="text-yellow-300 font-semibold mb-2">Confirm large trade?</p>
          <p className="text-[var(--color-text-muted)] mb-2">Buy {shares.toFixed(2)} {selectedCandidate ? `${selectedCandidate} ` : ''}{selectedOutcome} shares for ${parsedAmount.toFixed(2)}</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} className="flex-1 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">Cancel</button>
            <button onClick={handleTrade} className="flex-1 py-1.5 rounded-lg bg-[var(--color-gold)] text-black text-xs font-semibold">Confirm</button>
          </div>
        </div>
      )}

      {!confirmOpen && (
        <button
          onClick={handleTrade}
          disabled={cantTrade || parsedAmount < 1 || insufficientBalance || isPlacing || (isGrouped && !selectedCandidate)}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: selectedOutcome === 'Yes' ? 'rgba(0,200,83,0.2)' : 'rgba(255,61,87,0.2)',
            border: `1px solid ${selectedOutcome === 'Yes' ? PM_GREEN : PM_RED}`,
            color: selectedOutcome === 'Yes' ? PM_GREEN : PM_RED,
          }}
        >
          {!user ? 'Log in to trade'
            : isPlacing ? 'Placing…'
            : cantTrade ? 'Market closed'
            : parsedAmount < 1 ? 'Enter amount'
            : insufficientBalance ? 'Insufficient balance'
            : needsCandidate ? 'Select a candidate'
            : `Buy ${selectedCandidate ? `${selectedCandidate} ` : ''}${selectedOutcome} — $${parsedAmount.toFixed(2)}`}
        </button>
      )}

      {user && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-muted)] bg-[var(--color-surface2)] rounded-lg px-3 py-2">
          <span>Balance</span>
          <Link to="/portfolio" className="font-semibold hover:underline" style={{ color: PM_BLUE }}>
            {formatBalance(user.balance)}
          </Link>
        </div>
      )}

      {insufficientBalance && parsedAmount > 0 && (
        <button onClick={() => useDepositModalStore.getState().openDepositModal()}
          className="mt-2 block w-full text-center text-xs hover:underline" style={{ color: PM_BLUE }}>
          Deposit funds →
        </button>
      )}
    </div>
  );
};

// ── Social tabs content ───────────────────────────────────────────────────────
const PositionsTab = ({ marketSlug }) => {
  const positions = useTradeStore(s => s.positions);
  const marketPositions = positions.filter(p => p.market?.slug === marketSlug);
  if (!marketPositions.length) return <EmptyState icon={<Trophy className="w-8 h-8" />} text="No positions in this market yet" />;
  return (
    <div className="space-y-2">
      {marketPositions.map((p, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface2)] rounded-lg text-sm">
          <div>
            <span className="font-semibold text-[var(--color-text)]">
              {p.candidate ? `${p.candidate} ` : ''}{p.outcome}
            </span>
            <span className="text-xs text-[var(--color-text-muted)] ml-2">{p.totalShares?.toFixed(2)} shares</span>
          </div>
          <div className="text-right">
            <div className="font-semibold text-[var(--color-text)]">${p.totalAmount?.toFixed(2)}</div>
            <div className="text-xs" style={{ color: p.pnl >= 0 ? PM_GREEN : PM_RED }}>
              {p.pnl >= 0 ? '+' : ''}${p.pnl?.toFixed(2)} P&amp;L
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const CommentsTab = ({ eventSlug }) => {
  const { data, isLoading } = useMarketComments(eventSlug);
  const comments = data?.comments || [];
  if (isLoading) return <TabSkeleton />;
  if (!comments.length) return <EmptyState icon={<MessageSquare className="w-8 h-8" />} text="No comments yet" />;
  return (
    <div className="space-y-3">
      {comments.map((c, i) => (
        <div key={i} className="px-4 py-3 bg-[var(--color-surface2)] rounded-lg text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-[var(--color-text)] text-xs">
              {c.userUsername || c.username || (c.userAddress ? c.userAddress.slice(0,8)+'…' : 'Anon')}
            </span>
            <span className="text-[var(--color-text-muted)] text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}</span>
          </div>
          <p className="text-[var(--color-text-muted)]">{c.body || c.text || c.content}</p>
        </div>
      ))}
    </div>
  );
};

const HoldersTab = ({ conditionId }) => {
  // Use own CLOB data when ONCHAIN_ENABLED, otherwise fall back to Polymarket
  const ownHolders = useClobHolders(conditionId, 10);
  const polyHolders = useMarketHolders(conditionId);

  const { data, isLoading } = USE_OWN_DATA ? ownHolders : polyHolders;
  const holders = data?.holders || [];
  const source = data?.source || (USE_OWN_DATA ? 'predictme' : 'polymarket');

  if (isLoading) return <TabSkeleton />;
  if (!holders.length) return <EmptyState icon={<Users className="w-8 h-8" />} text="No holder data available" />;

  return (
    <div className="space-y-2">
      {source === 'predictme' && (
        <div className="text-xs text-[var(--color-text-muted)] px-1">
          Real PredictMe users only (bot excluded)
        </div>
      )}
      {holders.map((h, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface2)] rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <span className="w-5 text-xs text-[var(--color-text-muted)]">#{i+1}</span>
            <span className="text-[var(--color-text)] font-mono text-xs">
              {h.name || h.username || (h.address ? h.address.slice(0,10)+'…' : 'Unknown')}
            </span>
          </div>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {h.value ? `$${Number(h.value).toFixed(2)}` : h.shares ? `${Number(h.shares).toFixed(2)} shares` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
};

const ActivityTab = ({ conditionId }) => {
  // Use own CLOB data when ONCHAIN_ENABLED, otherwise fall back to Polymarket
  const ownActivity = useClobActivity(conditionId, 20);
  const polyActivity = useMarketActivity(conditionId);

  const { data, isLoading } = USE_OWN_DATA ? ownActivity : polyActivity;
  const activities = data?.activities || [];
  const source = data?.source || (USE_OWN_DATA ? 'predictme' : 'polymarket');

  if (isLoading) return <TabSkeleton />;
  if (!activities.length) return <EmptyState icon={<Activity className="w-8 h-8" />} text="No activity yet" />;

  return (
    <div className="space-y-2">
      {source === 'predictme' && (
        <div className="text-xs text-[var(--color-text-muted)] px-1">
          Real PredictMe user activity (bot excluded)
        </div>
      )}
      {activities.map((a, i) => {
        const isYes = a.outcome === 'Yes' || a.side === 'BUY' || a.type === 'buy';
        return (
          <div key={i} className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface2)] rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: isYes ? 'rgba(0,200,83,0.15)' : 'rgba(255,61,87,0.15)', color: isYes ? PM_GREEN : PM_RED }}>
                {a.outcome || (a.type?.toUpperCase?.()) || a.side || 'BUY'}
              </span>
              <span className="text-[var(--color-text-muted)] text-xs font-mono">
                {a.name || a.username || a.user?.username || (a.userAddress ? a.userAddress.slice(0,8)+'…' : 'Trader')}
              </span>
            </div>
            <div className="text-right">
              <span className="font-semibold text-[var(--color-text)]">
                {a.amount ? `$${Number(a.amount).toFixed(2)}` : a.size ? `${Number(a.size).toFixed(2)}` : '—'}
              </span>
              <div className="text-xs text-[var(--color-text-muted)]">{a.timestamp ? new Date(a.timestamp).toLocaleDateString() : (a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '')}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RulesTab = ({ market }) => {
  const text = market?.faq || market?.rules || market?.description;
  if (!text) return <EmptyState icon={<BookOpen className="w-8 h-8" />} text="No rules available" />;
  return (
    <div className="px-2">
      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-line">{text}</p>
      {market?.sourceOfTruth && (
        <div className="mt-4 p-3 bg-[var(--color-surface2)] rounded-lg border border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-text)] mb-1">Resolution source</p>
          <p className="text-xs text-[var(--color-text-muted)]">{market.sourceOfTruth}</p>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ icon, text }) => (
  <div className="flex flex-col items-center gap-2 py-8 text-[var(--color-text-muted)]">
    {icon}
    <p className="text-sm">{text}</p>
  </div>
);

const TabSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="h-12 bg-[var(--color-surface2)] rounded-lg" />
    ))}
  </div>
);

// ── Market icon ───────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  crypto: '#f97316', sports: '#22c55e', politics: '#3b82f6', finance: '#a855f7',
  weather: '#06b6d4', esports: '#8b5cf6', iran: '#ef4444', geopolitics: '#64748b',
  tech: '#0ea5e9', culture: '#ec4899', economy: '#10b981', elections: '#f59e0b',
};

const MarketIcon = ({ market, size = 14 }) => {
  const bg = CATEGORY_COLORS[market.categorySlug] || '#6b7280';
  const isUrl = market.image && (market.image.startsWith('http') || market.image.startsWith('/'));
  const sz = `w-${size} h-${size}`;
  if (isUrl) {
    return (
      <div className={`relative ${sz} flex-shrink-0`}>
        <img src={market.image} alt="" className={`${sz} rounded-xl object-cover`}
          onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
        <div className={`${sz} rounded-xl items-center justify-center text-xl font-bold absolute inset-0 text-white`}
          style={{ backgroundColor: bg, display: 'none' }}>
          {market.title?.charAt(0)?.toUpperCase()}
        </div>
      </div>
    );
  }
  return (
    <div className={`${sz} rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 text-white`} style={{ backgroundColor: bg }}>
      {market.title?.charAt(0)?.toUpperCase()}
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'positions', label: 'Positions', icon: Trophy },
  { id: 'comments', label: 'Comments', icon: MessageSquare },
  { id: 'holders', label: 'Top Holders', icon: Users },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'rules', label: 'Rules & FAQ', icon: BookOpen },
];

const MarketDetailPage = () => {
  const { slug } = useParams();
  const { data, isLoading } = useMarket(slug);
  const market = data?.market;
  const { toggleFavorite, isFavorited } = useFavorites();
  const { fetchPositions } = useTradeStore();
  const [activeTab, setActiveTab] = useState('positions');
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const isGrouped = market?.marketType === 'grouped';
  const sortedCandidates = useMemo(() =>
    [...(market?.candidates || [])].sort((a, b) => b.probability - a.probability),
  [market?.candidates]);

  const handleCandidateBuy = (name) => { setSelectedCandidate(name); };
  const handleCandidateSell = (name) => { setSelectedCandidate(name); };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Skeleton height="h-8" className="w-2/3 mb-4" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton height="h-64" />
              <Skeleton height="h-48" />
            </div>
            <Skeleton height="h-80" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!market) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Market not found</h1>
          <Link to="/" className="text-[var(--color-gold)]">Go home</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 overflow-x-hidden">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-4">
          <Link to="/" className="hover:text-[var(--color-gold)]">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to={`/${market.categorySlug}`} className="hover:text-[var(--color-gold)] capitalize">{market.categorySlug}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[var(--color-text)] truncate max-w-xs">{market.title}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <MarketIcon market={market} size={14} />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] mb-2 leading-tight">{market.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-muted)]">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>{formatVolume(market.volume)} Vol.</span>
                </div>
                {market.liquidity > 0 && (
                  <div className="flex items-center gap-1">
                    <span>${formatVolume(market.liquidity)} Liq.</span>
                  </div>
                )}
                {market.endDate && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>Ends {formatDate(market.endDate)}</span>
                  </div>
                )}
                {isGrouped && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(37,99,235,0.15)', color: PM_BLUE, border: `1px solid rgba(37,99,235,0.3)` }}>
                    {sortedCandidates.length} candidates
                  </span>
                )}
                {market.rewards > 0 && <RewardsBadge percent={market.rewards} />}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ShareEmbed market={market} />
            <button
              onClick={() => toggleFavorite(market._id)}
              className={`p-2 rounded-lg border transition-colors ${isFavorited(market._id) ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-500/50'}`}
            >
              <Heart className={`w-4 h-4 ${isFavorited(market._id) ? 'fill-red-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Main layout: left=chart+candidates+tabs, right=trading panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5 min-w-0">
            {/* Chart */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <Suspense fallback={<div className="h-[280px] animate-pulse bg-[var(--color-surface2)]" />}>
                <MarketChart market={market} />
              </Suspense>
            </div>

            {/* Candidate List (grouped only) */}
            {isGrouped && sortedCandidates.length > 0 && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Candidates</h3>
                  <span className="text-xs text-[var(--color-text-muted)]">{sortedCandidates.length} outcomes</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {sortedCandidates.map((c, i) => (
                    <CandidateRow
                      key={c.name}
                      candidate={c}
                      rank={i + 1}
                      isSelected={selectedCandidate === c.name}
                      onSelect={setSelectedCandidate}
                      onBuy={handleCandidateBuy}
                      onSell={handleCandidateSell}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Binary market — show OrderBook */}
            {!isGrouped && <OrderBook market={market} />}

            {/* Tabs */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="flex border-b border-[var(--color-border)] overflow-x-auto scrollbar-hide">
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); if(tab.id==='positions') fetchPositions(); }}
                      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${isActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="p-4">
                {activeTab === 'positions' && <PositionsTab marketSlug={slug} />}
                {activeTab === 'comments' && <CommentsTab eventSlug={market.polymarketEventSlug || slug.replace('pm-', '')} />}
                {activeTab === 'holders' && <HoldersTab conditionId={market.conditionId} />}
                {activeTab === 'activity' && <ActivityTab conditionId={market.conditionId} />}
                {activeTab === 'rules' && <RulesTab market={market} />}
              </div>
            </div>
          </div>

          {/* Trading panel — desktop only, sticky */}
          <div className="lg:col-span-1 hidden lg:block">
            <TradingPanel
              market={market}
              selectedCandidate={selectedCandidate}
              onCandidateChange={setSelectedCandidate}
            />
          </div>
        </div>

        {/* Mobile trading button (sticky bottom) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-4 pb-safe bg-[var(--color-bg)] border-t border-[var(--color-border)]">
          <Button variant="primary" size="md" fullWidth onClick={() => document.getElementById('mobile-trade-modal')?.showModal?.()}>
            Trade {selectedCandidate ? `— ${selectedCandidate}` : ''}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default MarketDetailPage;
