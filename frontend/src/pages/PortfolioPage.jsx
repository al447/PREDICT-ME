import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, DollarSign, Clock, Filter } from 'lucide-react';
import useDepositModalStore from '../store/depositModalStore';
import PendingDepositsCard from '../components/deposit/PendingDepositsCard';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Layout from '../components/layout/Layout';
import useAuthStore from '../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { usersAPI, tradesAPI } from '../services/api';
import { formatBalance, generateHistoricalData } from '../utils/format';

const TABS = ['Positions', 'Open orders', 'History'];
const PNL_RANGES = ['1D', '1W', '1M', '1Y', 'ALL'];

const PortfolioPage = () => {
  const { user, openAuthModal } = useAuthStore();
  const [activeTab, setActiveTab] = useState('Positions');
  const [pnlRange, setPnlRange] = useState('1D');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('value');

  const { data: profileData } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => usersAPI.getProfile().then(r => r.data),
    enabled: !!user,
  });

  const { data: positionsData } = useQuery({
    queryKey: ['user-positions'],
    queryFn: () => tradesAPI.getPositions().then(r => r.data),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: txData } = useQuery({
    queryKey: ['user-transactions'],
    queryFn: () => usersAPI.getTransactions().then(r => r.data),
    enabled: !!user && activeTab === 'History',
  });

  const stats = profileData?.stats || {};
  const positions = positionsData?.positions || [];
  const transactions = txData?.transactions || [];
  const balance = user?.balance || 0;
  const portfolioValue = stats.portfolioValue || 0;
  const totalPnL = stats.totalPnL || 0;
  const isPositive = totalPnL >= 0;

  // Generate PnL chart data
  const pnlPoints = { '1D': 24, '1W': 7, '1M': 30, '1Y': 12, 'ALL': 90 };
  const pnlChartData = useMemo(() => generateHistoricalData(Math.max(0, totalPnL), pnlPoints[pnlRange] || 30), [totalPnL, pnlRange]);

  const filtered = useMemo(() => {
    let data = [...positions];
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(p => p.market?.title?.toLowerCase().includes(q) || p.outcome?.toLowerCase().includes(q));
    }
    if (sortBy === 'value') data.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    if (sortBy === 'pnl') data.sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
    return data;
  }, [positions, search, sortBy]);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-muted)]" />
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Sign in to view your portfolio</h2>
          <p className="text-[var(--color-text-muted)] mb-6">Connect your wallet to see positions, P&L, and trade history.</p>
          <button onClick={openAuthModal} className="px-6 py-3 rounded-xl bg-[#4f6ef7] text-white font-semibold hover:bg-[#4060e0] transition-all">
            Sign In
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ── Portfolio Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-sm font-medium text-[var(--color-text-muted)]">Portfolio</h1>
            </div>
            <p className="text-4xl font-bold text-[var(--color-text)]">{formatBalance(portfolioValue + balance)}</p>
            <p className={`text-sm font-medium mt-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{formatBalance(totalPnL)} ({totalPnL !== 0 ? ((totalPnL / Math.max(1, balance)) * 100).toFixed(1) : '0'}%)
              <span className="text-[var(--color-text-muted)] ml-1.5">past day</span>
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-[var(--color-text-muted)]">Available to trade</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{formatBalance(balance)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => useDepositModalStore.getState().openDepositModal()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              Deposit
            </button>
            {/* <Link
              to="/withdraw"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-surface2)] text-[var(--color-text)] text-sm font-medium border border-[var(--color-border)] hover:bg-[var(--color-border)]/50 transition-colors"
            >
              <ArrowDownRight className="w-4 h-4" />
              Withdraw
            </Link> */}
          </div>
        </div>

        {/* ── P&L Chart ── */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--color-text)]">Profit/Loss</h2>
            <div className="flex gap-0.5 bg-[var(--color-surface2)] rounded-lg p-0.5 border border-[var(--color-border)]">
              {PNL_RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => setPnlRange(r)}
                  className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-all ${
                    pnlRange === r
                      ? 'bg-[var(--color-text)] text-[var(--color-bg)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={pnlChartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`$${v}`, 'P&L']}
              />
              <Line type="monotone" dataKey="price" stroke={isPositive ? '#22c55e' : '#ef4444'} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-[var(--color-text-muted)] mt-2">Past {pnlRange === 'ALL' ? 'All Time' : pnlRange}</p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 mb-4 border-b border-[var(--color-border)]">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[var(--color-text)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Search + Sort ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-gold)] outline-none transition-colors"
            />
          </div>
          <button
            onClick={() => setSortBy(sortBy === 'value' ? 'pnl' : 'value')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-border)]/50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            {sortBy === 'value' ? 'Current value' : 'P&L'}
          </button>
        </div>

        {/* ── Positions Tab ── */}
        {activeTab === 'Positions' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 px-4 py-3 bg-[var(--color-surface2)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border)]">
              <div>Market</div>
              <div className="text-right">Avg</div>
              <div className="text-right">Now</div>
              <div className="text-right">Traded</div>
              <div className="text-right">To Win</div>
              <div className="text-right">Value</div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <DollarSign className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)] opacity-20" />
                <p className="text-sm text-[var(--color-text-muted)]">No positions found.</p>
                <Link to="/" className="inline-block mt-3 text-sm text-[#4f6ef7] hover:underline">Explore markets</Link>
              </div>
            ) : (
              filtered.map((pos, idx) => (
                <Link
                  key={`${pos.market?._id}-${pos.outcome}`}
                  to={`/market/${pos.market?.slug}`}
                  className={`grid grid-cols-1 md:grid-cols-[1fr_80px_80px_80px_80px_80px] gap-2 px-4 py-3.5 hover:bg-[var(--color-surface2)] transition-colors items-center ${
                    idx < filtered.length - 1 ? 'border-b border-[var(--color-border)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pos.outcome?.toLowerCase() === 'yes' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{pos.market?.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{pos.outcome} · {pos.totalShares} shares</p>
                    </div>
                  </div>
                  <div className="hidden md:block text-right text-sm text-[var(--color-text)]">
                    {pos.avgPrice?.toFixed(1)}¢
                  </div>
                  <div className="hidden md:block text-right text-sm text-[var(--color-text)]">
                    {pos.currentPrice?.toFixed(1)}¢
                  </div>
                  <div className="hidden md:block text-right text-sm text-[var(--color-text)]">
                    {formatBalance(pos.totalAmount || 0)}
                  </div>
                  <div className="hidden md:block text-right text-sm text-[var(--color-text)]">
                    {formatBalance(pos.totalShares || 0)}
                  </div>
                  <div className="hidden md:block text-right">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{formatBalance(pos.currentValue || 0)}</p>
                    <p className={`text-xs ${(pos.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(pos.pnl || 0) >= 0 ? '+' : ''}{formatBalance(pos.pnl || 0)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* ── Open Orders Tab ── */}
        {activeTab === 'Open orders' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl py-16 text-center">
            <Clock className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)] opacity-20" />
            <p className="text-sm text-[var(--color-text-muted)]">No open orders.</p>
            <Link to="/" className="inline-block mt-3 text-sm text-[#4f6ef7] hover:underline">Place a trade</Link>
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'History' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            {transactions.length === 0 ? (
              <div className="py-16 text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)] opacity-20" />
                <p className="text-sm text-[var(--color-text-muted)]">No trade history yet.</p>
              </div>
            ) : (
              transactions.map((tx, idx) => (
                <div
                  key={tx._id}
                  className={`flex items-center gap-4 px-4 py-3.5 ${
                    idx < transactions.length - 1 ? 'border-b border-[var(--color-border)]' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    tx.type === 'buy'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {tx.type === 'buy' ? 'B' : 'S'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{tx.market?.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {tx.type === 'buy' ? 'Bought' : 'Sold'} {tx.shares} {tx.outcome} at {tx.price}¢
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${tx.type === 'buy' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {tx.type === 'buy' ? '-' : '+'}${tx.amount?.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {new Date(tx.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="max-w-5xl mx-auto px-4 pb-8">
        <PendingDepositsCard />
      </div>
    </Layout>
  );
};

export default PortfolioPage;
