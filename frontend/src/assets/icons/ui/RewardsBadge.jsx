const RewardsBadge = ({ percent = 4, size = 16, className = '' }) => (
  <div className={`inline-flex items-center gap-1 ${className}`}>
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <defs>
        <linearGradient id="rewardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFA500" />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill="url(#rewardGrad)" opacity="0.2" />
      <path
        d="M10 2L12.09 7.26L17.5 7.5L13.5 11L15 16L10 13.5L5 16L6.5 11L2.5 7.5L7.91 7.26L10 2Z"
        fill="url(#rewardGrad)"
      />
    </svg>
    <span className="text-xs font-semibold text-[var(--color-gold)]">Earn {percent}%</span>
  </div>
);

export default RewardsBadge;
