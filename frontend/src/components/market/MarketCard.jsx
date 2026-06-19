import { Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import useFavorites from '../../hooks/useFavorites';
import { formatVolume } from '../../utils/format';
import MarketStatusBadge from './MarketStatusBadge';

const CATEGORY_COLORS = {
  crypto:      '#f97316',
  sports:      '#22c55e',
  politics:    '#3b82f6',
  finance:     '#a855f7',
  weather:     '#06b6d4',
  esports:     '#8b5cf6',
  iran:        '#ef4444',
  geopolitics: '#64748b',
  tech:        '#0ea5e9',
  culture:     '#ec4899',
  economy:     '#10b981',
  elections:   '#f59e0b',
};

const RESOLUTION_LABELS = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
  yearly:  'Yearly',
};

const MarketIcon = ({ market }) => {
  const bg = CATEGORY_COLORS[market.categorySlug] || '#6b7280';
  const initial = market.title?.charAt(0)?.toUpperCase() || '?';
  const isUrl = market.image && (market.image.startsWith('http') || market.image.startsWith('/'));

  if (isUrl) {
    return (
      <div className="relative w-10 h-10 flex-shrink-0">
        <img
          src={market.image}
          alt={market.title}
          className="w-10 h-10 rounded-lg object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
          }}
        />
        <div
          className="w-10 h-10 rounded-lg items-center justify-center text-sm font-bold absolute inset-0 text-white hidden"
          style={{ backgroundColor: bg, display: 'none' }}
        >
          {initial}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </div>
  );
};

// A single outcome row: "72°F or higher  100%  [Yes] [No]"
const OutcomeRow = ({ outcome, onBuy, e }) => {
  const pct = outcome.probability ?? Math.round(outcome.price);

  const handleYes = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onBuy?.(outcome.name, 'Yes');
  };

  const handleNo = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onBuy?.(outcome.name, 'No');
  };

  return (
    <div className="flex items-center gap-2 py-[5px]">
      <span className="flex-1 text-[13px] text-[var(--color-text)] truncate leading-tight">
        {outcome.name}
      </span>
      <span className="text-[13px] font-semibold text-[var(--color-text)] w-10 text-right flex-shrink-0">
        {pct < 1 ? '<1%' : `${Math.round(pct)}%`}
      </span>
      <button
        onClick={handleYes}
        className="px-3 py-[3px] rounded-full text-[11px] font-bold bg-[var(--color-green)]/75 text-white border border-[var(--color-green)] hover:bg-[var(--color-green)] active:scale-95 transition-all flex-shrink-0"
      >
        Yes
      </button>
      <button
        onClick={handleNo}
        className="px-3 py-[3px] rounded-full text-[11px] font-bold bg-[var(--color-red)]/75 text-white border border-[var(--color-red)] hover:bg-[var(--color-red)] active:scale-95 transition-all flex-shrink-0"
      >
        No
      </button>
    </div>
  );
};

// SVG arc gauge showing the leading outcome probability — like Polymarket's crypto cards
const ArcGauge = ({ pct }) => {
  const r = 22;
  const circ = 2 * Math.PI * r;
  // Only draw the top 75% of the circle (270°) — matches Polymarket's partial arc
  const arcLen = circ * 0.75;
  const filled = arcLen * (Math.min(Math.max(pct, 0), 100) / 100);
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="flex-shrink-0 -rotate-[135deg]">
      {/* Track */}
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-border)" strokeWidth="4"
        strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" />
      {/* Fill */}
      <circle cx="28" cy="28" r={r} fill="none" stroke="#4ade80" strokeWidth="4"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
    </svg>
  );
};

// Binary market block: arc gauge on the right + two buy-button rows below
const BinaryOutcomeBlock = ({ outcomes, isActive }) => {
  const yes = outcomes?.[0];
  const no = outcomes?.[1];
  const yesPct = yes ? (yes.probability ?? Math.round(yes.price ?? 50)) : 50;
  const noPct = no ? (no.probability ?? Math.round(no.price ?? 50)) : 50;
  const leadName = yesPct >= noPct ? (yes?.name ?? 'Yes') : (no?.name ?? 'No');
  const leadPct = Math.max(yesPct, noPct);

  return (
    <div className="mt-auto">
      {/* Gauge — always right-aligned */}
      <div className="flex justify-end mb-2">
        <div className="relative flex items-center justify-center">
          <ArcGauge pct={yesPct} />
          <div className="absolute text-center leading-none">
            <div className="text-[13px] font-bold text-[var(--color-text)]">{leadPct < 1 ? '<1%' : `${Math.round(leadPct)}%`}</div>
            <div className="text-[10px] text-[var(--color-green)] font-medium mt-0.5">{leadName}</div>
          </div>
        </div>
      </div>
      {/* Buy buttons — disabled if market not active */}
      {isActive ? (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-btn-yes)] hover:bg-[var(--color-btn-yes-hover)] active:scale-[0.98] transition-all"
          >
            <span className="text-[12px] font-bold text-[var(--color-btn-yes-text)]">{yes?.name ?? 'Yes'}</span>
            <span className="text-[11px] text-[var(--color-btn-yes-text)]/80">{yes?.price ? `+$${yes.price}` : ''}</span>
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-btn-no)] hover:bg-[var(--color-btn-no-hover)] active:scale-[0.98] transition-all"
          >
            <span className="text-[12px] font-bold text-[var(--color-btn-no-text)]">{no?.name ?? 'No'}</span>
            <span className="text-[11px] text-[var(--color-btn-no-text)]/80">{no?.price ? `+$${no.price}` : ''}</span>
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            disabled
            className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg bg-[var(--color-surface2)] text-[var(--color-text-muted)] text-[12px] font-medium cursor-not-allowed"
          >
            Trading Closed
          </button>
        </div>
      )}
    </div>
  );
};

const MarketCard = ({ market, className = '' }) => {
  const { toggleFavorite, isFavorited } = useFavorites();
  if (!market) return null;

  const outcomes = market.outcomes ?? [];
  // Binary: exactly Yes + No
  const isBinary = outcomes.length === 2 &&
    outcomes[0]?.name === 'Yes' &&
    outcomes[1]?.name === 'No';

  const isActive = market.status === 'active';
  const isResolved = market.status === 'resolved';

  const favorited = isFavorited(market._id);

  const handleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(market._id);
  };

  const handleBuy = (outcomeName, side) => {
    // Opens market page — trading happens in TradingPanel
  };

  // Resolution label from endDate frequency or resolveBy field
  const resLabel = market.resolutionLabel ||
    RESOLUTION_LABELS[market.frequency] ||
    (market.endDate
      ? new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null);

  return (
    <div
      className={`bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl overflow-hidden hover:border-[var(--color-card-border-hover)] transition-colors group flex flex-col h-full ${className}`}
    >
      <Link to={`/market/${market.slug}`} className="flex flex-col flex-1 p-4 pb-3">
        {/* Header: icon + title + LIVE badge */}
        <div className="flex items-start gap-3 mb-3">
          <MarketIcon market={market} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {/* Status badge — always shown */}
              <MarketStatusBadge market={market} size="sm" />

              {market.subCategory && (
                <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                  · {market.subCategory}
                </span>
              )}
            </div>
            <h3 className="text-[14px] font-medium text-[var(--color-text)] leading-snug line-clamp-2 group-hover:text-[var(--color-gold)] transition-colors">
              {market.title}
            </h3>
            {/* Show resolution info for resolved markets */}
            {market.status === 'resolved' && market.resolution && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Resolved {market.resolvedAt && new Date(market.resolvedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </p>
            )}
            {/* Show closed info for closed/pending markets */}
            {market.status === 'closed' && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Trading closed · Awaiting resolution
              </p>
            )}
          </div>
        </div>

        {/* Outcomes */}
        {isBinary ? (
          // Binary market — Polymarket style: arc gauge top-right + two buy buttons
          <BinaryOutcomeBlock outcomes={outcomes} isActive={isActive} />
        ) : (
          // Multi-outcome: one row per outcome (max 2 shown, rest truncated)
          <div className={`space-y-0 mb-1 mt-auto divide-y divide-[var(--color-border)] ${!isActive ? 'opacity-60' : ''}`}>
            {isActive ? (
              outcomes.slice(0, 2).map((outcome) => (
                <OutcomeRow key={outcome.name} outcome={outcome} onBuy={handleBuy} />
              ))
            ) : (
              <div className="py-3 text-center">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {isResolved ? 'Market resolved · View details' : 'Trading closed · Awaiting resolution'}
                </span>
              </div>
            )}
            {outcomes.length > 2 && isActive && (
              <div className="pt-2 text-xs text-[var(--color-text-muted)]">
                +{outcomes.length - 2} more outcomes
              </div>
            )}
          </div>
        )}
      </Link>

      {/* Footer */}
      <div className="px-4 pb-3 flex items-center gap-2 mt-1">
        {market.isNewMarket && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-yellow-400">
            <span className="text-yellow-400">✦</span> NEW
          </span>
        )}
        {market.rewards > 0 && (
          <span className="text-[11px] text-yellow-400 font-medium">
            Earn {market.rewards}% holding rewards
          </span>
        )}
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {formatVolume(market.volume)} Vol.
        </span>
        {resLabel && (
          <>
            <span className="text-[var(--color-text-muted)] text-[11px]">·</span>
            <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-0.5">
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.5-4.5a.5.5 0 011 0v4.25l2.5 1.5a.5.5 0 01-.5.866l-2.75-1.65A.5.5 0 017.5 8V3.5z"/></svg>
              {resLabel}
            </span>
          </>
        )}
        <button
          onClick={handleFav}
          className="ml-auto text-[var(--color-text-muted)] hover:text-white transition-colors"
        >
          <Bookmark className={`w-3.5 h-3.5 ${favorited ? 'fill-white text-white' : ''}`} />
        </button>
      </div>
    </div>
  );
};

export default MarketCard;
