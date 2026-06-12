import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingUp, TrendingDown, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import Layout from '../components/layout/Layout';
import api from '../services/api';

const CATEGORY_COLORS = {
  crypto: '#f97316', sports: '#22c55e', politics: '#3b82f6', finance: '#a855f7',
  weather: '#06b6d4', esports: '#8b5cf6', iran: '#ef4444', geopolitics: '#64748b',
  tech: '#0ea5e9', culture: '#ec4899', economy: '#10b981', elections: '#f59e0b',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ user, size = 8 }) {
  const initials = user?.username?.charAt(0)?.toUpperCase() || user?.address?.charAt(0) || '?';
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: '#3b82f6' }}
    >
      {initials}
    </div>
  );
}

function MarketIcon({ trade }) {
  const cc = CATEGORY_COLORS[trade.market?.categorySlug] || '#6b7280';
  if (trade.market?.image) {
    return (
      <img
        src={trade.market.image}
        alt=""
        className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ backgroundColor: cc }}
    >
      {trade.market?.title?.charAt(0) || '?'}
    </div>
  );
}

const FILTERS = ['All', 'Buy', 'Sell'];
const OUTCOME_FILTERS = ['All outcomes', 'Yes', 'No'];

export default function ActivityPage() {
  const [filter, setFilter] = useState('All');
  const [outcomeFilter, setOutcomeFilter] = useState('All outcomes');
  const [page, setPage] = useState(1);
  const limit = 25;

  const params = {
    limit,
    page,
    ...(outcomeFilter !== 'All outcomes' ? { outcome: outcomeFilter } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['activity', params],
    queryFn: () => api.get('/trades/activity', { params }).then(r => r.data),
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const trades = (data?.trades || []).filter(t =>
    filter === 'All' ? true : t.type === filter.toLowerCase()
  );
  const totalPages = data?.pages || 1;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-[var(--color-gold)]" />
            <h1 className="text-xl font-bold text-[var(--color-text)]">Activity</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">Live global trading activity across all markets</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex rounded-xl border border-[var(--color-card-border)] overflow-hidden bg-[var(--color-card)]">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1); }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-[var(--color-card-border)] overflow-hidden bg-[var(--color-card)]">
            {OUTCOME_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setOutcomeFilter(f); setPage(1); }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  outcomeFilter === f
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {data?.total != null && (
            <span className="text-xs text-[var(--color-text-muted)] ml-auto">
              {data.total.toLocaleString()} total trades
            </span>
          )}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card)] overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b border-[var(--color-card-border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <span>Market</span>
            <span>User</span>
            <span className="text-right">Outcome</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Time</span>
          </div>

          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-3.5 border-b border-[var(--color-card-border)] animate-pulse last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-surface2)]" />
                  <div className="h-3.5 bg-[var(--color-surface2)] rounded w-40" />
                </div>
                <div className="h-3 bg-[var(--color-surface2)] rounded w-20 self-center" />
                <div className="h-6 bg-[var(--color-surface2)] rounded w-14 self-center ml-auto" />
                <div className="h-3.5 bg-[var(--color-surface2)] rounded w-16 self-center ml-auto" />
                <div className="h-3 bg-[var(--color-surface2)] rounded w-12 self-center ml-auto" />
              </div>
            ))
          ) : trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-muted)]">
              <Activity className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No activity yet</p>
            </div>
          ) : (
            trades.map((trade, i) => {
              const isYes = trade.outcome?.toLowerCase() === 'yes';
              const isBuy = trade.type === 'buy';
              const displayName = trade.user?.username || trade.user?.address || 'Anonymous';
              const catColor = CATEGORY_COLORS[trade.market?.categorySlug] || '#6b7280';

              return (
                <div
                  key={trade._id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3.5 border-b border-[var(--color-card-border)] last:border-0 hover:bg-[var(--color-surface2)]/40 transition-colors group"
                >
                  {/* Market */}
                  <div className="flex items-center gap-3 min-w-0">
                    <MarketIcon trade={trade} />
                    <div className="min-w-0">
                      {trade.market ? (
                        <Link
                          to={`/market/${trade.market.slug}`}
                          className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-gold)] transition-colors line-clamp-1 group-hover:text-[var(--color-gold)]"
                        >
                          {trade.market.title}
                        </Link>
                      ) : (
                        <span className="text-sm text-[var(--color-text-muted)]">Deleted market</span>
                      )}
                      {trade.market?.categorySlug && (
                        <span className="text-[11px] capitalize" style={{ color: catColor }}>
                          {trade.market.categorySlug}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={trade.user} size={6} />
                    <span className="text-xs text-[var(--color-text-muted)] truncate">{displayName}</span>
                  </div>

                  {/* Outcome */}
                  <div className="flex justify-end">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                          isYes
                            ? 'bg-[var(--color-btn-yes)] text-[var(--color-btn-yes-text)]'
                            : 'bg-[var(--color-btn-no)] text-[var(--color-btn-no-text)]'
                        }`}
                      >
                        {isBuy ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {trade.outcome}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[var(--color-text)]">
                      ${trade.amount?.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {trade.shares?.toFixed(1)} shares @ {trade.price}¢
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-right">
                    <span className="text-xs text-[var(--color-text-muted)]">{timeAgo(trade.createdAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
