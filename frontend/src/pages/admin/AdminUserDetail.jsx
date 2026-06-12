import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldOff, ShieldCheck, DollarSign, TrendingUp, Activity, Wallet, ExternalLink, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminUsersAPI } from '../../services/adminApi';
import StatCard from '../../components/admin/StatCard';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminUserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentTrades, setRecentTrades] = useState([]);
  const [activePositions, setActivePositions] = useState([]);
  const [safeUsdcBalance, setSafeUsdcBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState({ open: false, type: '', loading: false });
  const [balanceModal, setBalanceModal] = useState(false);
  const [balanceForm, setBalanceForm] = useState({ amount: '', reason: '' });
  const [balanceSaving, setBalanceSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminUsersAPI.getOne(id);
      setUser(data.user);
      setStats(data.stats);
      setRecentTrades(data.recentTrades);
      setActivePositions(data.activePositions);
      if (data.safeUsdcBalance !== null && data.safeUsdcBalance !== undefined) {
        setSafeUsdcBalance(data.safeUsdcBalance);
      }
    } catch { toast.error('User not found'); navigate('/admin/users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleConfirm = async () => {
    const { type } = confirm;
    setConfirm(c => ({ ...c, loading: true }));
    const tid = toast.loading(type === 'ban' ? 'Banning...' : 'Unbanning...');
    try {
      if (type === 'ban') await adminUsersAPI.ban(id);
      else await adminUsersAPI.unban(id);
      toast.success('Done', { id: tid });
      setConfirm({ open: false, type: '', loading: false });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed', { id: tid });
      setConfirm(c => ({ ...c, loading: false }));
    }
  };

  const handleAdjustBalance = async (e) => {
    e.preventDefault();
    setBalanceSaving(true);
    try {
      await adminUsersAPI.adjustBalance(id, Number(balanceForm.amount), balanceForm.reason);
      toast.success('Balance adjusted');
      setBalanceModal(false);
      setBalanceForm({ amount: '', reason: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally { setBalanceSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-[var(--color-gold)]" /></div>;
  if (!user) return null;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="p-2 rounded-xl hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] transition-all"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 bg-[var(--color-gold)]/10 rounded-full flex items-center justify-center text-sm font-bold text-[var(--color-gold)]">
              {(user.username || user.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">{user.username || '(no username)'}</h1>
              <p className="text-sm text-[var(--color-text-muted)]">{user.email || user.walletAddress}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ml-auto ${user.isActive !== false ? 'bg-[var(--color-green)]/10 text-[var(--color-green)] border-[var(--color-green)]/30' : 'bg-[var(--color-red)]/10 text-[var(--color-red)] border-[var(--color-red)]/30'}`}>
              {user.isActive !== false ? 'Active' : 'Banned'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.smartWallet?.deployed ? (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-muted)] cursor-not-allowed" title="Non-custodial user — balance is on-chain in their Safe">
              <AlertCircle size={14} /> Balance on-chain
            </div>
          ) : (
            <button onClick={() => setBalanceModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 rounded-xl text-sm text-[var(--color-gold)] hover:bg-[var(--color-gold)]/20 transition-all">
              <DollarSign size={14} /> Adjust Balance
            </button>
          )}
          {user.isActive !== false ? (
            <button onClick={() => setConfirm({ open: true, type: 'ban', loading: false })}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 rounded-xl text-sm text-[var(--color-red)] hover:bg-[var(--color-red)]/20 transition-all">
              <ShieldOff size={14} /> Ban
            </button>
          ) : (
            <button onClick={() => setConfirm({ open: true, type: 'unban', loading: false })}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-green)]/10 border border-[var(--color-green)]/30 rounded-xl text-sm text-[var(--color-green)] hover:bg-[var(--color-green)]/20 transition-all">
              <ShieldCheck size={14} /> Unban
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {user.smartWallet?.proxy ? (
          <StatCard
            icon={Wallet}
            label={user.smartWallet.deployed ? 'Safe Balance (on-chain)' : 'Safe Balance (not deployed)'}
            value={safeUsdcBalance !== null ? fmt(safeUsdcBalance) : '—'}
            color="gold"
          />
        ) : (
          <StatCard icon={DollarSign} label="Balance (custodial)" value={fmt(user.balance)} color="gold" />
        )}
        <StatCard icon={TrendingUp} label="Total Volume" value={fmt(stats?.totalVolume)} color="blue" />
        <StatCard icon={Activity} label="Total Trades" value={stats?.tradeCount || 0} color="green" />
        <StatCard icon={Activity} label="Win Rate" value={`${stats?.winRate || 0}%`} color={stats?.winRate >= 50 ? 'green' : 'red'} />
      </div>

      {/* User info + Active positions */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">User Info</h2>
          {[
            ['Role', user.role],
            ['Auth Provider', user.authProvider],
            ['Email', user.email || '—'],
            ['Wallet (EOA)', user.walletAddress || '—'],
            ['Joined', new Date(user.createdAt).toLocaleDateString()],
            ['Last Login', user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
              <span className="text-xs text-[var(--color-text)] font-medium truncate max-w-[200px] text-right">{val}</span>
            </div>
          ))}
          {user.smartWallet?.proxy && (
            <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
              <div className="flex items-center gap-1.5">
                <Wallet size={12} className="text-[var(--color-gold)]" />
                <span className="text-xs font-semibold text-[var(--color-text)]">Non-Custodial Safe Wallet</span>
                <span className={`ml-auto px-1.5 py-0.5 rounded-full text-xs font-medium ${
                  user.smartWallet.deployed
                    ? 'bg-[var(--color-green)]/10 text-[var(--color-green)] border border-[var(--color-green)]/30'
                    : 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/30'
                }`}>
                  {user.smartWallet.deployed ? 'Deployed' : 'Not deployed'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--color-text-muted)]">Safe Address</span>
                <a
                  href={`https://amoy.polygonscan.com/address/${user.smartWallet.proxy}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--color-gold)] hover:underline flex items-center gap-1 truncate max-w-[180px]"
                >
                  {user.smartWallet.proxy.slice(0, 10)}...{user.smartWallet.proxy.slice(-6)}
                  <ExternalLink size={10} />
                </a>
              </div>
              {safeUsdcBalance !== null && (
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--color-text-muted)]">USDC Balance (live)</span>
                  <span className="text-xs text-[var(--color-gold)] font-semibold">{fmt(safeUsdcBalance)}</span>
                </div>
              )}
              {user.smartWallet.deployed && (
                <p className="text-xs text-[var(--color-text-muted)] pt-1">
                  Funds are held in this Safe on-chain. Admin cannot adjust this balance directly.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Active Positions ({activePositions.length})</h2>
          {activePositions.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No open positions</p> : (
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
              {activePositions.map((t) => (
                <div key={t._id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-surface)] transition-all">
                  <div className="flex-1 min-w-0">
                    <Link to={`/admin/markets/${t.market?._id}`} className="text-xs font-medium text-[var(--color-text)] hover:text-[var(--color-gold)] truncate block">{t.market?.title || '—'}</Link>
                    <p className="text-xs text-[var(--color-text-muted)]">{t.outcome} · {t.shares} shares</p>
                  </div>
                  <span className="text-xs font-semibold text-[var(--color-gold)]">${t.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent trades */}
      <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Recent Trades</h2>
        {recentTrades.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No trades yet</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['Market', 'Outcome', 'Amount', 'Shares', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[var(--color-text-muted)] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t) => (
                  <tr key={t._id} className="border-b border-[var(--color-border)]/50">
                    <td className="py-2 px-3">
                      <Link to={`/admin/markets/${t.market?._id}`} className="text-[var(--color-gold)] hover:underline truncate max-w-xs block">{t.market?.title || '—'}</Link>
                    </td>
                    <td className="py-2 px-3 capitalize">{t.outcome}</td>
                    <td className="py-2 px-3">${t.amount}</td>
                    <td className="py-2 px-3">{t.shares}</td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        t.status === 'won' ? 'bg-[var(--color-green)]/10 text-[var(--color-green)]' :
                        t.status === 'lost' ? 'bg-[var(--color-red)]/10 text-[var(--color-red)]' :
                        t.status === 'refunded' ? 'bg-yellow-400/10 text-yellow-400' :
                        'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                      }`}>{t.status}</span>
                    </td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.type === 'ban' ? 'Ban User?' : 'Unban User?'}
        message={confirm.type === 'ban' ? `Ban ${user.email || user.username}? They cannot login or trade.` : `Restore access for ${user.email || user.username}?`}
        confirmText={confirm.type === 'ban' ? 'Ban' : 'Unban'}
        confirmColor="red"
        loading={confirm.loading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm({ open: false, type: '', loading: false })}
      />

      {/* Balance modal — only shown for custodial users */}
      {balanceModal && !user.smartWallet?.deployed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setBalanceModal(false)} />
          <div className="relative w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-1">Adjust Balance</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">Current: <span className="text-[var(--color-gold)] font-semibold">{fmt(user.balance)}</span></p>
            <form onSubmit={handleAdjustBalance} className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Amount (positive or negative)</label>
                <input type="number" value={balanceForm.amount} onChange={(e) => setBalanceForm(f => ({ ...f, amount: e.target.value }))} required
                  className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]"
                  placeholder="e.g. 1000 or -500" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Reason (min 10 chars)</label>
                <textarea value={balanceForm.reason} onChange={(e) => setBalanceForm(f => ({ ...f, reason: e.target.value }))} required minLength={10} rows={2}
                  className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] resize-none"
                  placeholder="e.g. Promotional bonus for Q1 campaign" />
              </div>
              {balanceForm.amount && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  New balance: <span className="text-[var(--color-gold)] font-semibold">{fmt(user.balance + Number(balanceForm.amount))}</span>
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setBalanceModal(false)} className="flex-1 py-2 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">Cancel</button>
                <button type="submit" disabled={balanceSaving} className="flex-1 py-2 rounded-xl bg-[var(--color-gold)] text-black text-sm font-semibold disabled:opacity-50">
                  {balanceSaving ? 'Saving...' : 'Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserDetail;
