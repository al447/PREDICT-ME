import { motion } from 'framer-motion';
import MarketCard from './MarketCard';
import { MarketCardSkeleton } from '../common/Skeleton';

const MarketList = ({ markets = [], isLoading = false, columns = 3, emptyMessage = 'No markets found.' }) => {
  const colClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  if (isLoading) {
    return (
      <div className={`grid ${colClass} gap-4`}>
        {Array.from({ length: columns * 2 }).map((_, i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!markets.length) {
    return (
      <div className="text-center py-12 text-[var(--color-text-muted)]">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`grid ${colClass} gap-4`}>
      {markets.map((market, i) => (
        <motion.div
          key={market._id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <MarketCard market={market} />
        </motion.div>
      ))}
    </div>
  );
};

export default MarketList;
