/**
 * MarketStatusBadge — Polymarket-style status indicator
 *
 * Shows the current state of a market:
 * - Active (green, pulse) — trading open
 * - Closed (yellow) — trading stopped, awaiting resolution
 * - Pending (orange) — closed but not yet resolved
 * - Resolved Yes/No (green/red) — outcome determined
 * - Expired (gray) — past end date, auto-closed
 */

const STATUS_CONFIG = {
  active: {
    label: 'Live',
    color: '#ef4444', // red-500
    bgColor: 'rgba(239, 68, 68, 0.1)',
    pulse: true,
    icon: null,
  },
  closed: {
    label: 'Closed',
    color: '#eab308', // yellow-500
    bgColor: 'rgba(234, 179, 8, 0.1)',
    pulse: false,
    icon: null,
  },
  pending: {
    label: 'Pending',
    color: '#f97316', // orange-500
    bgColor: 'rgba(249, 115, 22, 0.1)',
    pulse: false,
    icon: null,
  },
  resolved: {
    label: 'Resolved',
    color: '#22c55e', // green-500
    bgColor: 'rgba(34, 197, 94, 0.1)',
    pulse: false,
    icon: null,
  },
  expired: {
    label: 'Expired',
    color: '#6b7280', // gray-500
    bgColor: 'rgba(107, 114, 128, 0.1)',
    pulse: false,
    icon: null,
  },
  draft: {
    label: 'Draft',
    color: '#a855f7', // purple-500
    bgColor: 'rgba(168, 85, 247, 0.1)',
    pulse: false,
    icon: null,
  },
};

const OUTCOME_CONFIG = {
  yes: {
    label: 'Resolved YES',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.15)',
  },
  no: {
    label: 'Resolved NO',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.15)',
  },
};

/**
 * Get the effective status for display purposes
 */
const getDisplayStatus = (market) => {
  if (!market) return 'active';

  const { status, resolvedOutcome, endDate } = market;

  // Resolved markets show the outcome
  if (status === 'resolved') {
    return { type: 'resolved', outcome: resolvedOutcome };
  }

  // Check if expired (endDate passed but status hasn't updated yet)
  if (endDate && new Date(endDate) < new Date() && status === 'active') {
    return { type: 'expired' };
  }

  // Closed but not resolved = pending
  if (status === 'closed') {
    return { type: 'pending' };
  }

  return { type: status || 'active' };
};

const MarketStatusBadge = ({ market, size = 'md', className = '' }) => {
  const displayStatus = getDisplayStatus(market);
  const isResolved = displayStatus.type === 'resolved';

  // Get config based on status type and outcome
  let config;
  if (isResolved && displayStatus.outcome) {
    config = OUTCOME_CONFIG[displayStatus.outcome] || OUTCOME_CONFIG.yes;
  } else {
    config = STATUS_CONFIG[displayStatus.type] || STATUS_CONFIG.active;
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-[11px]',
    lg: 'px-3 py-1.5 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClasses[size]} ${className}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
      }}
    >
      {config.pulse && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: config.color }}
        />
      )}
      {config.label}
    </span>
  );
};

/**
 * Simpler variant for market cards — just the colored dot + text
 */
export const MarketStatusDot = ({ market, className = '' }) => {
  const displayStatus = getDisplayStatus(market);
  const isResolved = displayStatus.type === 'resolved';

  let color;
  let label;

  if (isResolved && displayStatus.outcome) {
    color = OUTCOME_CONFIG[displayStatus.outcome]?.color || '#22c55e';
    label = displayStatus.outcome === 'yes' ? 'YES' : displayStatus.outcome === 'no' ? 'NO' : 'CANCELLED';
  } else {
    color = STATUS_CONFIG[displayStatus.type]?.color || '#22c55e';
    label = STATUS_CONFIG[displayStatus.type]?.label || 'Live';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${className}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${displayStatus.type === 'active' ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: color }}
      />
      <span style={{ color }}>{label}</span>
    </span>
  );
};

export default MarketStatusBadge;
