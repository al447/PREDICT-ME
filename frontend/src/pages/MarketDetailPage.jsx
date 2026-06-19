import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ChevronRight, Heart, TrendingUp, Clock, Users, MessageSquare, Activity, BookOpen, Trophy, Zap, AlertCircle, CheckCircle, Lock, Hourglass } from 'lucide-react';
import Layout from '../components/layout/Layout';
import MarketStatusBadge from '../components/market/MarketStatusBadge';
import RewardsBadge from '../components/market/RewardsBadge';
import ShareEmbed from '../components/common/ShareEmbed';
import OrderBook from '../components/common/OrderBook';
import Skeleton from '../components/common/Skeleton';
import Button from '../components/common/Button';
import useTradeStore from '../store/tradeStore';
import useAuthStore from '../store/authStore';
import useDepositModalStore from '../store/depositModalStore';
import { useMarket, useMarketHolders, useMarketActivity } from '../hooks/useMarkets';
import { commentsAPI } from '../services/api';
import { useClobActivity, useClobHolders } from '../hooks/useClob';
import useFavorites from '../hooks/useFavorites';
import useCryptoPriceStream from '../hooks/useCryptoPriceStream';
import { formatVolume, formatDate, formatBalance } from '../utils/format';

// Use own CLOB data when ONCHAIN_ENABLED
const USE_OWN_DATA = import.meta.env.VITE_ONCHAIN_ENABLED === 'true';

const MarketChart = lazy(() => import('../components/market/MarketChart'));

// ── Palette ──────────────────────────────────────────────────────────────────
const PM_GREEN = '#00c853';
const PM_RED   = '#ff3d57';
const PM_BLUE  = '#2563eb';

// ── Candidate row in grouped event ───────────────────────────────────────────
const CandidateRow = ({ candidate, rank, onBuy, onNo, isSelected, onSelect }) => {
  const pct = candidate.probability ?? 0;
  const isUrl = candidate.image && (candidate.image.startsWith('http') || candidate.image.startsWith('/'));
  const isResolved = candidate.resolved;

  return (
    <div
      onClick={() => !isResolved && onSelect(candidate.name)}
      className={`flex items-center gap-3 px-4 py-3 transition-colors border-b border-[var(--color-border)] last:border-0 ${isResolved ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--color-surface2)]'} ${isSelected ? 'bg-[var(--color-surface2)]' : ''}`}
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
        {isResolved ? (
          <span className="text-sm font-bold text-[var(--color-text-muted)] flex items-center gap-1">
            No <span className="text-red-500">&#10060;</span>
          </span>
        ) : (
          <>
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
              onClick={e => { e.stopPropagation(); onNo(candidate.name); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: 'rgba(255,61,87,0.15)', color: PM_RED, border: `1px solid rgba(255,61,87,0.4)` }}
            >
              No {100 - pct}¢
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Per-candidate / binary Trading Panel ─────────────────────────────────────
const QUICK_AMOUNTS = [1, 5, 10, 20, 50, 100];

const TradingPanel = ({ market, selectedCandidate, onCandidateChange, defaultOutcome = 'Yes' }) => {
  const isGrouped = market?.marketType === 'grouped';
  const firstOutcome = isGrouped ? 'Yes' : (market?.outcomes?.[0]?.name || 'Yes');
  const [side, setSide] = useState('buy');
  const [selectedOutcome, setSelectedOutcome] = useState(firstOutcome);
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { placeTrade, isPlacing, lastMarketUpdate } = useTradeStore();
  const { user, openAuthModal } = useAuthStore();

  useEffect(() => {
    if (isGrouped) setSelectedOutcome(defaultOutcome);
  }, [defaultOutcome, isGrouped]);

  useEffect(() => {
    if (!isGrouped && market?.outcomes?.[0]) {
      setSelectedOutcome(market.outcomes[0].name);
    }
  }, [market?._id]);

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
    if (cantTrade || parsedAmount < 1 || (side === 'buy' && insufficientBalance)) return;
    if (needsCandidate) return;
    if (parsedAmount >= 50 && !confirmOpen) { setConfirmOpen(true); return; }
    setConfirmOpen(false);
    const result = await placeTrade(market._id, selectedOutcome, parsedAmount, isGrouped ? selectedCandidate : null, market, side);
    if (result) setAmount('');
  };

  const isPositiveOutcome = isGrouped ? selectedOutcome === 'Yes' : selectedOutcome === firstOutcome;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sticky top-32">
      {/* Buy / Sell toggle */}
      <div className="flex mb-3 border-b border-[var(--color-border)]">
        {['buy', 'sell'].map(s => (
          <button key={s} onClick={() => setSide(s)}
            className={`flex-1 pb-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${side === s ? (s === 'buy' ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[#ff3d57] text-[#ff3d57]') : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

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
        {(isGrouped ? ['Yes', 'No'] : (liveMarket?.outcomes || []).map(out => out.name)).map((o, idx) => {
          const p = isGrouped
            ? (o === 'Yes' ? (candidateObj?.probability ?? 50) : (100 - (candidateObj?.probability ?? 50)))
            : (liveMarket?.outcomes?.find(out => out.name === o)?.price ?? 50);
          const isFirst = idx === 0;
          const isActive = selectedOutcome === o;
          return (
            <button key={o} onClick={() => setSelectedOutcome(o)} disabled={cantTrade}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all border disabled:opacity-50 disabled:cursor-not-allowed"
              style={isActive ? {
                background: isFirst ? 'rgba(0,200,83,0.2)' : 'rgba(255,61,87,0.2)',
                borderColor: isFirst ? PM_GREEN : PM_RED,
                color: isFirst ? PM_GREEN : PM_RED,
              } : {
                background: 'var(--color-surface2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              <div>{side === 'buy' ? 'Buy' : 'Sell'} {o}</div>
              <div className="text-lg font-bold mt-0.5">{p}¢</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-[var(--color-text-muted)]">{side === 'buy' ? 'Amount ($)' : 'Shares'}</label>
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
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
          {side === 'buy' && (
            <div className="flex justify-between border-t border-[var(--color-border)] pt-2">
              <span className="text-[var(--color-text-muted)]">Potential profit</span>
              <span className="font-bold" style={{ color: PM_GREEN }}>
                +${(shares - parsedAmount).toFixed(2)}
              </span>
            </div>
          )}
          {side === 'sell' && (
            <div className="flex justify-between border-t border-[var(--color-border)] pt-2">
              <span className="text-[var(--color-text-muted)]">You receive</span>
              <span className="font-bold" style={{ color: PM_GREEN }}>
                ${(parsedAmount * (price / 100)).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3 mb-3 text-xs">
          <p className="text-yellow-300 font-semibold mb-2">Confirm large trade?</p>
          <p className="text-[var(--color-text-muted)] mb-2">{side === 'buy' ? 'Buy' : 'Sell'} {shares.toFixed(2)} {selectedCandidate ? `${selectedCandidate} ` : ''}{selectedOutcome} shares for ${parsedAmount.toFixed(2)}</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} className="flex-1 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">Cancel</button>
            <button onClick={handleTrade} className="flex-1 py-1.5 rounded-lg bg-[var(--color-gold)] text-black text-xs font-semibold">Confirm</button>
          </div>
        </div>
      )}

      {!confirmOpen && (
        <button
          onClick={handleTrade}
          disabled={cantTrade || parsedAmount < 1 || (side === 'buy' && insufficientBalance) || isPlacing || (isGrouped && !selectedCandidate)}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isPositiveOutcome ? 'rgba(0,200,83,0.2)' : 'rgba(255,61,87,0.2)',
            border: `1px solid ${isPositiveOutcome ? PM_GREEN : PM_RED}`,
            color: isPositiveOutcome ? PM_GREEN : PM_RED,
          }}
        >
          {!user ? 'Log in to trade'
            : isPlacing ? 'Placing…'
            : cantTrade ? 'Market closed'
            : parsedAmount < 1 ? 'Enter amount'
            : (side === 'buy' && insufficientBalance) ? 'Insufficient balance'
            : needsCandidate ? 'Select a candidate'
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${selectedCandidate ? `${selectedCandidate} ` : ''}${selectedOutcome} — $${parsedAmount.toFixed(2)}`}
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

      {side === 'buy' && insufficientBalance && parsedAmount > 0 && (
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
  const { positions, fetchPositions, isLoadingPositions } = useTradeStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) fetchPositions();
  }, [user]);

  const marketPositions = positions.filter(p => p.market?.slug === marketSlug);

  if (!user) return <EmptyState icon={<Trophy className="w-8 h-8" />} text="Log in to see your positions" />;
  if (isLoadingPositions) return <TabSkeleton />;
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

const CommentsTab = ({ marketId }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const { user } = useAuthStore();
  const { openAuthModal } = useAuthStore();
  const LIMIT = 20;

  const fetchComments = async (pageNum = 1, append = false) => {
    try {
      setError(null);
      const { data } = await commentsAPI.get(marketId, LIMIT, (pageNum - 1) * LIMIT);
      if (data.success) {
        const newComments = data.comments || [];
        setComments(prev => append ? [...prev, ...newComments] : newComments);
        setHasMore(newComments.length === LIMIT);
        setPage(pageNum);
      }
    } catch (err) {
      setError('Failed to load comments');
    }
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => { if (marketId) fetchComments(); }, [marketId]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    fetchComments(page + 1, true);
  };

  const handlePost = async () => {
    if (!body.trim() || posting) return;
    if (!user) { openAuthModal(); return; }
    setPosting(true);
    try {
      const { data } = await commentsAPI.post(marketId, body.trim());
      if (data.success) {
        setComments(prev => [data.comment, ...prev]);
        setBody('');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to post comment';
      toast.error(msg);
    }
    setPosting(false);
  };

  const handleLike = async (commentId) => {
    if (!user) { openAuthModal(); return; }
    try {
      const { data } = await commentsAPI.like(commentId);
      if (data.success) {
        setComments(prev => prev.map(c =>
          c._id === commentId ? { ...c, likes: c.likes + (data.liked ? 1 : -1), likedByMe: data.liked } : c
        ));
      }
    } catch {}
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      const { data } = await commentsAPI.delete(commentId);
      if (data.success) {
        setComments(prev => prev.filter(c => c._id !== commentId));
      }
    } catch (err) {
      toast.error('Failed to delete comment');
    }
  };

  if (loading) return <TabSkeleton />;
  if (error) return <EmptyState icon={<AlertCircle className="w-8 h-8" />} text={error} />;

  return (
    <div className="space-y-4">
      {/* Comment input */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={user ? "Add a comment..." : "Log in to comment..."}
            maxLength={2000}
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && body.trim()) { e.preventDefault(); handlePost(); } }}
            className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] resize-none"
            onClick={() => { if (!user) openAuthModal(); }}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-[var(--color-text-muted)]">{body.length}/2000</span>
            <button
              onClick={handlePost}
              disabled={!body.trim() || posting || !user}
              className="px-4 py-1.5 rounded-lg bg-[var(--color-gold)] text-black text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      {/* Comments list */}
      {!comments.length && <EmptyState icon={<MessageSquare className="w-8 h-8" />} text="No comments yet — be the first!" />}
      {comments.map((c) => (
        <div key={c._id} className="px-4 py-3 bg-[var(--color-surface2)] rounded-lg text-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              {c.user?.avatar && (
                <img src={c.user.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
              )}
              <span className="font-semibold text-[var(--color-text)] text-xs">{c.user?.username || 'Anonymous'}</span>
              <span className="text-[var(--color-text-muted)] text-[10px]">
                {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleLike(c._id)} className={`text-xs flex items-center gap-1 transition-colors ${c.likedByMe ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-gold)]'}`}>
                ♥ {c.likes || 0}
              </button>
              {user && (user._id === c.user?._id || user.role === 'admin') && (
                <button onClick={() => handleDelete(c._id)} className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors">
                  ✕
                </button>
              )}
            </div>
          </div>
          <p className="text-[var(--color-text)] text-sm leading-relaxed">{c.body}</p>
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          {loadingMore ? 'Loading…' : 'Load more comments'}
        </button>
      )}
    </div>
  );
};

const HoldersTab = ({ conditionId, marketId }) => {
  const ownHolders = useClobHolders(conditionId, 10);
  const polyHolders = useMarketHolders(conditionId);

  // If ONCHAIN and conditionId exists, use own CLOB data; otherwise fallback
  const { data, isLoading } = (USE_OWN_DATA && conditionId) ? ownHolders : polyHolders;
  const holders = data?.holders || [];
  const source = data?.source || (USE_OWN_DATA ? 'predictme' : 'polymarket');

  // Fallback: if no CLOB holders and no Polymarket holders, show message about trading
  if (isLoading) return <TabSkeleton />;
  if (!holders.length) return (
    <EmptyState icon={<Users className="w-8 h-8" />} text="No holders yet — be the first to trade!" />
  );

  return (
    <div className="space-y-2">
      {source === 'predictme' && (
        <div className="text-xs text-[var(--color-text-muted)] px-1 mb-2">
          Real PredictMe users only (bot excluded)
        </div>
      )}
      {holders.map((h, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface2)] rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <span className="w-5 text-xs text-[var(--color-text-muted)]">#{i+1}</span>
            <span className="text-[var(--color-text)] font-mono text-xs">
              {h.name || h.username || h.user?.username || (h.address ? h.address.slice(0,10)+'…' : 'Trader')}
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

const ActivityTab = ({ conditionId, marketSlug }) => {
  const ownActivity = useClobActivity(conditionId, 20);
  const polyActivity = useMarketActivity(conditionId);

  const { data, isLoading } = (USE_OWN_DATA && conditionId) ? ownActivity : polyActivity;
  const activities = data?.activities || [];
  const source = data?.source || (USE_OWN_DATA ? 'predictme' : 'polymarket');

  if (isLoading) return <TabSkeleton />;
  if (!activities.length) return <EmptyState icon={<Activity className="w-8 h-8" />} text="No activity yet — place the first trade!" />;

  return (
    <div className="space-y-2">
      {source === 'predictme' && (
        <div className="text-xs text-[var(--color-text-muted)] px-1 mb-2">
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

// ── Market Status Banner ─────────────────────────────────────────────────────
const MarketStatusBanner = ({ market }) => {
  const { status, resolvedOutcome, resolvedAt, closedAt, endDate, resolutionSource, onChain, conditionId } = market;

  if (status === 'active') return null;

  if (status === 'resolved') {
    const isYes = resolvedOutcome?.toLowerCase() === 'yes';
    const isNo = resolvedOutcome?.toLowerCase() === 'no';
    const bgColor = isYes ? 'rgba(34, 197, 94, 0.1)' : isNo ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)';
    const textColor = isYes ? '#22c55e' : isNo ? '#ef4444' : '#6b7280';
    const Icon = isYes ? CheckCircle : isNo ? AlertCircle : CheckCircle;

    return (
      <div className="mb-4 p-4 rounded-xl border" style={{ backgroundColor: bgColor, borderColor: `${textColor}30` }}>
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: textColor }} />
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: textColor }}>
              Resolved {resolvedOutcome ? `— ${resolvedOutcome.toUpperCase()}` : ''}
            </p>
            <p className="text-xs mt-0.5" style={{ color: textColor, opacity: 0.8 }}>
              This market was resolved on {resolvedAt ? new Date(resolvedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}.
              {resolvedOutcome && ' Winnings have been distributed to winning shareholders.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className="mb-4 p-4 rounded-xl border bg-yellow-500/10 border-yellow-500/30">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-400" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-yellow-400">Trading Closed — Awaiting Resolution</p>
            <p className="text-xs text-yellow-400/80 mt-0.5">
              This market has closed and is awaiting final resolution.
              {resolutionSource && ` Resolution source: ${resolutionSource}.`}
              {onChain && conditionId && ' This is an on-chain market resolved via UMA or Chainlink oracle.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'expired' || (endDate && new Date(endDate) < new Date())) {
    return (
      <div className="mb-4 p-4 rounded-xl border bg-gray-500/10 border-gray-500/30">
        <div className="flex items-start gap-3">
          <Hourglass className="w-5 h-5 flex-shrink-0 mt-0.5 text-gray-400" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-gray-400">Market Expired</p>
            <p className="text-xs text-gray-400/80 mt-0.5">
              This market has passed its end date and is pending automatic closure.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// ── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'comments', label: 'Comments', icon: MessageSquare },
  { id: 'positions', label: 'Positions', icon: Trophy },
  { id: 'holders', label: 'Top Holders', icon: Users },
  { id: 'activity', label: 'Activity', icon: Activity },
];

// ── Live price ticker for 5min crypto markets ──────────────────────────────
const LivePriceTicker = ({ market }) => {
  const isFiveMin = market?.frequency === '5min';
  const symbol = market?.priceSymbol;
  const wsSymbols = useMemo(() => (isFiveMin && symbol ? [symbol] : []), [isFiveMin, symbol]);
  const wsPrices = useCryptoPriceStream(wsSymbols);
  const priceData = symbol ? wsPrices[symbol] : null;

  // Countdown to next 5-min boundary
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!isFiveMin) return;
    const tick = () => {
      const now = Date.now();
      const next = Math.ceil(now / 300_000) * 300_000;
      setSecs(Math.max(0, Math.round((next - now) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isFiveMin]);

  if (!isFiveMin || !symbol) return null;

  const price = priceData?.price;
  const change24h = priceData?.change24h;
  const isUp = (change24h ?? 0) >= 0;
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  const fmtP = (v) => {
    if (v == null) return '—';
    if (v >= 10000) return `$${(v/1000).toFixed(1)}K`;
    if (v >= 1000) return `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    return `$${v.toFixed(4)}`;
  };

  return (
    <div className="mb-4 p-3 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[11px] font-bold text-red-500">LIVE</span>
        <span className="text-sm font-bold text-[var(--color-text)]">{symbol}/USD</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold" style={{ color: '#a855f7' }}>{fmtP(price)}</span>
        {change24h != null && (
          <span className={`text-xs font-semibold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{change24h.toFixed(2)}% 24h
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
        <Zap className="w-3 h-3 text-yellow-400" />
        <span>Resolves in</span>
        <span className="font-mono font-bold text-[var(--color-text)]">{m}:{s}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">Chainlink</span>
      </div>
    </div>
  );
};

// ── Mobile Trading Panel (slide-up) ──────────────────────────────────────────
const MobileTradingPanel = ({ market, selectedCandidate, onCandidateChange, defaultOutcome }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="lg:hidden">
      {/* Backdrop */}
      {expanded && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setExpanded(false)} />
      )}

      {/* Slide-up panel */}
      {expanded && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-bg)] rounded-t-2xl border-t border-[var(--color-border)] max-h-[85vh] overflow-y-auto pb-safe">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-[var(--color-border)] rounded-full" />
          </div>
          <div className="px-4 pb-6">
            <TradingPanel
              market={market}
              selectedCandidate={selectedCandidate}
              onCandidateChange={onCandidateChange}
              defaultOutcome={defaultOutcome}
            />
          </div>
        </div>
      )}

      {/* Fixed bottom button */}
      {!expanded && (
        <div className="fixed bottom-16 left-0 right-0 z-50 p-4 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
          <Button variant="primary" size="md" fullWidth onClick={() => setExpanded(true)}>
            Trade {selectedCandidate ? `— ${selectedCandidate}` : ''}
          </Button>
        </div>
      )}
    </div>
  );
};

const MarketDetailPage = () => {
  const { slug } = useParams();
  const { data, isLoading } = useMarket(slug);
  const market = data?.market;
  const { toggleFavorite, isFavorited } = useFavorites();
  const { fetchPositions } = useTradeStore();
  const [activeTab, setActiveTab] = useState('comments');
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const isGrouped = market?.marketType === 'grouped';
  const sortedCandidates = useMemo(() =>
    [...(market?.candidates || [])].sort((a, b) => b.probability - a.probability),
  [market?.candidates]);

  const [defaultOutcome, setDefaultOutcome] = useState('Yes');
  const handleCandidateBuy = (name) => { setSelectedCandidate(name); setDefaultOutcome('Yes'); };
  const handleCandidateNo = (name) => { setSelectedCandidate(name); setDefaultOutcome('No'); };

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

        {/* Live price ticker for 5min markets */}
        <LivePriceTicker market={market} />

        {/* Market Status Banner (closed/pending/resolved) */}
        <MarketStatusBanner market={market} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-start gap-3 min-w-0">
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
                <MarketStatusBadge market={market} size="md" />
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
                      onNo={handleCandidateNo}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Binary market — show OrderBook */}
            {!isGrouped && <OrderBook market={market} />}

            {/* Rules & FAQ Section */}
            {(market.faq || market.rules || market.description || market.sourceOfTruth) && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <h3 className="font-semibold text-sm text-[var(--color-text)]">Rules & FAQ</h3>
                </div>
                <div className="p-4">
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-line">
                    {market.faq || market.rules || market.description}
                  </p>
                  {market.sourceOfTruth && (
                    <div className="mt-4 p-3 bg-[var(--color-surface2)] rounded-lg border border-[var(--color-border)]">
                      <p className="text-xs font-semibold text-[var(--color-text)] mb-1">Resolution source</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{market.sourceOfTruth}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                {activeTab === 'comments' && <CommentsTab marketId={market._id} />}
                {activeTab === 'positions' && <PositionsTab marketSlug={slug} />}
                {activeTab === 'holders' && <HoldersTab conditionId={market.conditionId} marketId={market._id} />}
                {activeTab === 'activity' && <ActivityTab conditionId={market.conditionId} marketSlug={slug} />}
              </div>
            </div>
          </div>

          {/* Trading panel — desktop only, sticky */}
          <div className="lg:col-span-1 hidden lg:block">
            <TradingPanel
              market={market}
              selectedCandidate={selectedCandidate}
              onCandidateChange={setSelectedCandidate}
              defaultOutcome={defaultOutcome}
            />
          </div>
        </div>

        {/* Mobile trading panel (expandable) */}
        <MobileTradingPanel
          market={market}
          selectedCandidate={selectedCandidate}
          onCandidateChange={setSelectedCandidate}
          defaultOutcome={defaultOutcome}
        />
      </div>
    </Layout>
  );
};

export default MarketDetailPage;
