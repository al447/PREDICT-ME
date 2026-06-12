const Skeleton = ({ className = '', rows = 1, height = 'h-4' }) => {
  if (rows > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded bg-[var(--color-surface2)] ${height} ${i === rows - 1 ? 'w-3/4' : 'w-full'} ${className}`}
          />
        ))}
      </div>
    );
  }
  return (
    <div className={`animate-pulse rounded bg-[var(--color-surface2)] ${height} ${className}`} />
  );
};

export const MarketCardSkeleton = () => (
  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" height="h-10" />
      <div className="flex-1">
        <Skeleton height="h-4" className="w-3/4 mb-2" />
        <Skeleton height="h-3" className="w-1/2" />
      </div>
    </div>
    <Skeleton height="h-8" />
    <div className="flex gap-2">
      <Skeleton height="h-8" className="flex-1" />
      <Skeleton height="h-8" className="flex-1" />
    </div>
  </div>
);

export default Skeleton;
