import { Zap } from 'lucide-react';

const RewardsBadge = ({ percent, size = 'sm', className = '' }) => {
  if (!percent || percent <= 0) return null;

  const sizes = {
    xs: 'text-xs px-1.5 py-0.5 gap-0.5',
    sm: 'text-xs px-2 py-1 gap-1',
    md: 'text-sm px-3 py-1.5 gap-1.5',
  };

  return (
    <button
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-medium hover:bg-yellow-500/25 transition-colors ${sizes[size] || sizes.sm} ${className}`}
    >
      <Zap className="w-3 h-3 fill-yellow-400" />
      Earn {percent}% holding rewards
    </button>
  );
};

export default RewardsBadge;
