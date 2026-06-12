import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User, BarChart2, Heart, TrendingUp, TrendingDown, Clock, ArrowUpDown, Calendar, Wallet } from 'lucide-react';
import Layout from '../components/layout/Layout';
import MarketList from '../components/market/MarketList';
import Tabs from '../components/common/Tabs';
import Skeleton from '../components/common/Skeleton';
import Button from '../components/common/Button';
import useAuthStore from '../store/authStore';
import useTradeStore from '../store/tradeStore';
import useFavoritesStore from '../store/favoritesStore';
import { usersAPI } from '../services/api';
import { formatBalance, formatDate, truncateAddress } from '../utils/format';

const ProfilePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const { user } = useAuthStore();
  const { trades, fetchTrades, isLoading: tradesLoading } = useTradeStore();
  const { favorites, fetchFavorites } = useFavoritesStore();
  const [profileStats, setProfileStats] = useState(null);
  const [positions, setPositions] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const dataLoadedRef = useRef(false);
  const storeDataLoadedRef = useRef(false);

  const tabs = [
    { label: 'Overview', value: 'overview' },
    { label: 'Positions', value: 'positions' },
    { label: 'Trade History', value: 'trades' },
    { label: 'Favorites', value: 'favorites' },
  ];

  // Get stable user identifier
  const userId = user?._id || user?.id;

  // Load profile stats and positions once when user is available
  useEffect(() => {
    if (!userId || dataLoadedRef.current) return;
    
    const loadData = async () => {
      setStatsLoading(true);
      setStatsError(false);
      dataLoadedRef.current = true; // Mark as loaded to prevent re-calls
      
      try {
        const [profileRes, posRes] = await Promise.all([
          usersAPI.getProfile().catch(() => ({ data: { success: false } })),
          usersAPI.getPositions().catch(() => ({ data: { success: false } }))
        ]);
        if (profileRes.data.success) {
          setProfileStats(profileRes.data.stats);
        } else {
          setStatsError(true);
        }
        if (posRes.data.success) {
          setPositions(posRes.data.positions);
        }
      } catch (err) {
        setStatsError(true);
      }
      setStatsLoading(false);
    };
    
    loadData();
  }, [userId]); // Only depends on stable userId, not on fetchTrades/fetchFavorites

  // Separate effect for trades and favorites - these are from stores
  useEffect(() => {
    if (!userId || storeDataLoadedRef.current) return;
    storeDataLoadedRef.current = true;
    fetchTrades({ limit: 20 });
    fetchFavorites();
  }, [userId]);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <User className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
          <h1 className="text-2xl font-bold mb-2">Sign in to view your profile</h1>
          <p className="text-[var(--color-text-muted)] mb-6">Track your trades, favorites, and portfolio.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-16 h-16 rounded-full object-cover border-2 border-[var(--color-gold)]" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--color-gold)] to-yellow-600 flex items-center justify-center text-black text-2xl font-bold">
                {(user.username || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">
                {user.username || user.email?.split('@')[0] || truncateAddress(user.walletAddress)}
              </h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                {user.authProvider === 'wallet' ? truncateAddress(user.walletAddress) : user.email}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-gold)]/15 text-[var(--color-gold)] border border-[var(--color-gold)]/30 capitalize flex items-center gap-1">
                  <Wallet className="w-3 h-3" />{user.authProvider} account
                </span>
                {user.createdAt && (
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold text-[var(--color-gold)]">{formatBalance(user.balance)}</p>
              <p className="text-xs text-[var(--color-text-muted)]">Available Balance</p>
            </div>
          </div>
        </div>

        {/* Stats Section - show skeleton while loading, stats when loaded, or error state */}
        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {['Portfolio Value', 'Total Invested', 'Unrealized P&L', 'Open Positions'].map((label) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-center">
                <Skeleton height="h-6" className="mb-2" />
                <Skeleton height="h-3" width="w-20" className="mx-auto" />
              </div>
            ))}
          </div>
        ) : statsError ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Unable to load stats. Please try again later.</p>
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()} className="mt-2">
              Retry
            </Button>
          </div>
        ) : profileStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Portfolio Value', value: formatBalance(profileStats.portfolioValue), color: 'text-[var(--color-gold)]' },
              { label: 'Total Invested', value: formatBalance(profileStats.totalInvested), color: 'text-blue-400' },
              { label: 'Unrealized P&L', value: formatBalance(profileStats.totalPnL), color: profileStats.totalPnL >= 0 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]' },
              { label: 'Open Positions', value: profileStats.openPositions, color: 'text-[var(--color-text)]' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-center">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{label}</p>
              </div>
            ))}
          </div>
        ) : null}

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(v) => setSearchParams({ tab: v })}
          className="mb-6"
        />

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-[var(--color-text)]">Recent Activity</h2>
            {tradesLoading ? (
              <Skeleton height="h-16" rows={4} />
            ) : trades.slice(0, 5).length > 0 ? (
              <div className="space-y-2">
                {trades.slice(0, 5).map((trade) => (
                  <TradeRow key={trade._id} trade={trade} />
                ))}
              </div>
            ) : (
              <EmptyState message="No trades yet. Start trading to see your activity here." />
            )}
            {trades.length > 5 && (
              <Button variant="secondary" size="sm" onClick={() => setSearchParams({ tab: 'trades' })}>
                View all trades
              </Button>
            )}
          </div>
        )}

        {activeTab === 'positions' && (
          <div className="space-y-3">
            {positions.length > 0 ? (
              positions.map((pos, i) => (
                <div key={i} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link to={`/market/${pos.market?.slug}`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-gold)] text-sm line-clamp-1">
                        {pos.market?.title}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-muted)]">
                        <span className={`font-medium ${pos.outcome === 'Yes' ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
                          {pos.outcome}
                        </span>
                        <span>{pos.totalShares.toFixed(2)} shares</span>
                        <span>Avg {pos.avgPrice.toFixed(1)}¢</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--color-text)]">{formatBalance(pos.currentValue)}</p>
                      <p className={`text-xs font-medium ${pos.unrealizedPnL >= 0 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
                        {pos.unrealizedPnL >= 0 ? '+' : ''}{formatBalance(pos.unrealizedPnL)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState message="No open positions. Place a trade to get started!" />
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <TradeHistoryTable trades={trades} isLoading={tradesLoading} />
        )}

        {activeTab === 'favorites' && (
          favorites.length > 0
            ? <MarketList markets={favorites} columns={2} />
            : <EmptyState message="No favorites yet. Click the heart icon on any market to save it here." />
        )}
      </div>
    </Layout>
  );
};

const TradeHistoryTable = ({ trades, isLoading }) => {
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sorted = [...(trades || [])].sort((a, b) => {
    let av, bv;
    if (sortCol === 'date') { av = new Date(a.createdAt); bv = new Date(b.createdAt); }
    else if (sortCol === 'amount') { av = a.amount; bv = b.amount; }
    else if (sortCol === 'price') { av = a.price; bv = b.price; }
    else if (sortCol === 'shares') { av = a.shares; bv = b.shares; }
    else return 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const ThBtn = ({ col, children }) => (
    <button onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-[var(--color-gold)] transition-colors">
      {children}
      <ArrowUpDown className={`w-3 h-3 ${sortCol === col ? 'text-[var(--color-gold)]' : 'opacity-40'}`} />
    </button>
  );

  if (isLoading) return <Skeleton height="h-64" />;
  if (!trades?.length) return <EmptyState message="No trade history yet." />;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)] bg-[var(--color-surface2)]">
              <th className="text-left px-4 py-3 font-medium"><ThBtn col="date">Date</ThBtn></th>
              <th className="text-left px-4 py-3 font-medium">Market</th>
              <th className="text-left px-4 py-3 font-medium">Outcome</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium"><ThBtn col="amount">Amount</ThBtn></th>
              <th className="text-right px-4 py-3 font-medium"><ThBtn col="price">Price</ThBtn></th>
              <th className="text-right px-4 py-3 font-medium"><ThBtn col="shares">Shares</ThBtn></th>
              <th className="text-right px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sorted.map((trade) => (
              <tr key={trade._id} className="hover:bg-[var(--color-surface2)] transition-colors">
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">{formatDate(trade.createdAt)}</td>
                <td className="px-4 py-3 max-w-[180px]">
                  <Link to={`/market/${trade.market?.slug}`} className="text-[var(--color-text)] hover:text-[var(--color-gold)] line-clamp-1 text-xs font-medium">
                    {trade.market?.title || '—'}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trade.outcome === 'Yes' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {trade.outcome}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] capitalize">{trade.type || 'buy'}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text)]">{formatBalance(trade.amount)}</td>
                <td className="px-4 py-3 text-right text-xs text-[var(--color-text-muted)]">{trade.price}¢</td>
                <td className="px-4 py-3 text-right text-xs text-[var(--color-text-muted)]">{trade.shares?.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    trade.status === 'won' ? 'bg-green-500/15 text-green-400' :
                    trade.status === 'lost' ? 'bg-red-500/15 text-red-400' :
                    trade.status === 'closed' ? 'bg-gray-500/15 text-gray-400' :
                    'bg-blue-500/15 text-blue-400'
                  }`}>{trade.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TradeRow = ({ trade }) => (
  <div className="flex items-center justify-between p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-gold)]/30 transition-colors">
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${trade.outcome === 'Yes' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
        {trade.outcome[0]}
      </div>
      <div>
        <Link to={`/market/${trade.market?.slug}`} className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-gold)] line-clamp-1 max-w-[200px]">
          {trade.market?.title || 'Market'}
        </Link>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mt-0.5">
          <Clock className="w-3 h-3" />
          <span>{formatDate(trade.createdAt)}</span>
          <span className="capitalize">{trade.status}</span>
        </div>
      </div>
    </div>
    <div className="text-right">
      <p className="text-sm font-bold text-[var(--color-text)]">-{formatBalance(trade.amount)}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{trade.shares?.toFixed(2)} shares @ {trade.price}¢</p>
    </div>
  </div>
);

const EmptyState = ({ message }) => (
  <div className="text-center py-12 text-[var(--color-text-muted)]">
    <p className="text-sm">{message}</p>
    <Link to="/" className="text-[var(--color-gold)] text-sm mt-2 inline-block">Browse markets →</Link>
  </div>
);

export default ProfilePage;
