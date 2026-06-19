const STYLES = {
  draft: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  pending: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  resolved: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  expired: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const LABELS = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  pending: 'Pending',
  resolved: 'Resolved',
  expired: 'Expired',
};

const MarketStatusBadge = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STYLES[status] || STYLES.draft}`}>
    {LABELS[status] || status}
  </span>
);

export default MarketStatusBadge;
