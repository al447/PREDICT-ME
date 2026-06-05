import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, LineChart, DollarSign, Activity, Coins, AlertCircle, TrendingUp, Clock } from 'lucide-react';
import { LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { adminDashboardAPI } from '../../services/adminApi';
import StatCard from '../../components/admin/StatCard';

const fmt = (n) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Number(n || 0).toFixed(2)}`;
};

const timeAgo = (date) => {
  const diff = Date.now() - new Date(date);
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

const actionLabel = (type) => {
  const map = {
    trade: 'Placed a trade',
    market_create: 'Created market',
    market_close: 'Closed market',
    market_reopen: 'Reopened market',
    market_resolve: 'Resolved market',
    market_delete: 'Deleted market',
    user_ban: 'Banned user',
    user_unban: 'Unbanned user',
    balance_adjust: 'Adjusted balance',
    role_change: 'Changed role',
    admin_login: 'Admin login',
  };
  return map[type] || type;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-[var(--color-gold)] font-semibold">{fmt(payload[0]?.value)}</p>
      <p className="text-[var(--color-text-muted)]">{payload[1]?.value} trades</p>
    </div>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [activity, setActivity] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [s, c, a, t] = await Promise.all([
        adminDashboardAPI.stats(),
        adminDashboardAPI.volumeChart(30),
        adminDashboardAPI.recentActivity(20),
        adminDashboardAPI.trending(10),
      ]);
      setStats(s.data.stats);
      setChart(c.data.data);
      setActivity(a.data.activity);
      setTrending(t.data.markets);
    } catch (e) {
      console.error('[Dashboard] load error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const pending = stats?.markets?.pendingResolution || 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Users" value={stats?.users?.total?.toLocaleString() || '0'} delta={stats?.users?.newToday} deltaLabel="today" color="gold" />
        <StatCard icon={LineChart} label="Active Markets" value={stats?.markets?.active?.toLocaleString() || '0'} delta={null} color="green" />
        <StatCard icon={DollarSign} label="Total Volume" value={fmt(stats?.trades?.totalVolume)} delta={null} color="blue" />
        <StatCard icon={Activity} label="Trades (24h)" value={stats?.trades?.last24h?.toLocaleString() || '0'} delta={null} color="purple" />
        <StatCard icon={Coins} label="Platform Fees" value={fmt(stats?.platformFees)} delta={null} color="gold" />
        <StatCard icon={AlertCircle} label="Pending Resolution" value={pending} delta={null} color={pending > 0 ? 'red' : 'green'} alert={pending > 0} />
      </div>

      {/* Action banner */}
      {pending > 0 && (
        <div className="bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-[var(--color-red)] flex-shrink-0" />
            <span className="text-sm text-[var(--color-red)] font-medium">{pending} market{pending > 1 ? 's' : ''} need{pending === 1 ? 's' : ''} resolution</span>
          </div>
          <Link to="/admin/markets?status=closed" className="text-xs text-[var(--color-red)] font-semibold border border-[var(--color-red)]/40 px-3 py-1.5 rounded-lg hover:bg-[var(--color-red)]/10 transition-all text-center sm:text-left">
            View Markets →
          </Link>
        </div>
      )}

      {/* Volume Chart */}
      <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Volume (30 days)</h2>
        {chart.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-[var(--color-text-muted)] text-sm">No trading data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ReLineChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickFormatter={(v) => fmt(v)} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="volume" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="trades" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
            </ReLineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two-col row */}
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Activity */}
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2"><Clock size={16} /> Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No activity yet</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-hide">
              {activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-[var(--color-gold)]">
                    {(item.actor?.username || item.actor?.email || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text)]">
                      <span className="font-medium">{item.actor?.username || item.actor?.email || 'User'}</span>
                      {' '}<span className="text-[var(--color-text-muted)]">{actionLabel(item.type)}</span>
                      {item.target?.title && <span className="font-medium"> "{item.target.title}"</span>}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">{timeAgo(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trending Markets */}
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2"><TrendingUp size={16} /> Trending Markets (24h)</h2>
          {trending.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No trending markets yet</p>
          ) : (
            <div className="space-y-2">
              {trending.map((m, i) => (
                <Link key={m._id} to={`/admin/markets/${m._id}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-surface)] transition-all group">
                  <span className="text-xs text-[var(--color-text-muted)] w-5 text-right">{i + 1}</span>
                  <span className="text-lg w-7 text-center">{m.image}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text)] truncate group-hover:text-[var(--color-gold)] transition-colors">{m.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{fmt(m.volume24h)} vol · {m.tradeCount24h} trades</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
