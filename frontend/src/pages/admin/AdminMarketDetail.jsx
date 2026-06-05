import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Lock, Unlock, Gavel, Trash2, CheckCircle, XCircle, RotateCcw, DollarSign, Users, BarChart3 } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminMarketsAPI } from '../../services/adminApi';
import MarketStatusBadge from '../../components/admin/MarketStatusBadge';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import ResolveMarketModal from '../../components/admin/ResolveMarketModal';
import StatCard from '../../components/admin/StatCard';

const fmt = (n) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Number(n || 0).toFixed(2)}`;
};

const AdminMarketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [market, setMarket] = useState(null);
  const [stats, setStats] = useState(null);
  const [topTraders, setTopTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState({ open: false, type: '', loading: false });
  const [resolveModal, setResolveModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminMarketsAPI.getOne(id);
      setMarket(data.market);
      setStats(data.stats);
      setTopTraders(data.topTraders);
    } catch { toast.error('Market not found'); navigate('/admin/markets'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleAction = async () => {
    const { type } = confirm;
    setConfirm(c => ({ ...c, loading: true }));
    const tid = toast.loading(`${type === 'close' ? 'Closing' : type === 'reopen' ? 'Reopening' : 'Deleting'} market...`);
    try {
      if (type === 'close') await adminMarketsAPI.close(id);
      else if (type === 'reopen') await adminMarketsAPI.reopen(id);
      else if (type === 'delete') { await adminMarketsAPI.remove(id); toast.success('Market deleted', { id: tid }); navigate('/admin/markets'); return; }
      toast.success('Done!', { id: tid });
      setConfirm({ open: false, type: '', loading: false });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed', { id: tid });
      setConfirm(c => ({ ...c, loading: false }));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-[var(--color-gold)]" /></div>;
  }
  if (!market) return null;

  const isResolved = market.status === 'resolved';
  const yesProb = market.outcomes?.find(o => /^yes$/i.test(o.name))?.probability || 50;
  const noProb = 100 - yesProb;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/admin/markets" className="p-2 rounded-xl hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] transition-all mt-1"><ArrowLeft size={18} /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="text-3xl">{market.image}</span>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{market.title}</h1>
            <MarketStatusBadge status={market.status} />
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] flex-wrap">
            <span className="capitalize">{market.categorySlug}</span>
            <span>Created {market.createdBy?.email || 'admin'}</span>
            {market.endDate && <span>Ends {new Date(market.endDate).toLocaleDateString()}</span>}
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isResolved && (
            <Link to={`/admin/markets/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all">
              <Pencil size={14} /> Edit
            </Link>
          )}
          {market.status === 'active' && (
            <button onClick={() => setConfirm({ open: true, type: 'close', loading: false })}
              className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400/10 border border-yellow-400/30 rounded-xl text-sm text-yellow-400 hover:bg-yellow-400/20 transition-all">
              <Lock size={14} /> Close
            </button>
          )}
          {market.status === 'closed' && (
            <>
              <button onClick={() => setConfirm({ open: true, type: 'reopen', loading: false })}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-green)]/10 border border-[var(--color-green)]/30 rounded-xl text-sm text-[var(--color-green)] hover:bg-[var(--color-green)]/20 transition-all">
                <Unlock size={14} /> Reopen
              </button>
              <button onClick={() => setResolveModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 rounded-xl text-sm text-[var(--color-gold)] hover:bg-[var(--color-gold)]/20 transition-all">
                <Gavel size={14} /> Resolve
              </button>
            </>
          )}
          {market.status === 'active' && (
            <button onClick={() => setConfirm({ open: true, type: 'delete', loading: false })}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 rounded-xl text-sm text-[var(--color-red)] hover:bg-[var(--color-red)]/20 transition-all">
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Resolved banner */}
      {isResolved && (
        <div className={`rounded-xl border p-3 flex items-center gap-3 ${
          market.resolvedOutcome === 'yes' ? 'bg-[var(--color-green)]/10 border-[var(--color-green)]/30' :
          market.resolvedOutcome === 'no' ? 'bg-[var(--color-red)]/10 border-[var(--color-red)]/30' :
          'bg-yellow-400/10 border-yellow-400/30'
        }`}>
          {market.resolvedOutcome === 'yes' ? <CheckCircle size={18} className="text-[var(--color-green)]" /> :
           market.resolvedOutcome === 'no' ? <XCircle size={18} className="text-[var(--color-red)]" /> :
           <RotateCcw size={18} className="text-yellow-400" />}
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Resolved: <span className="uppercase">{market.resolvedOutcome}</span>
            </p>
            {market.resolvedAt && <p className="text-xs text-[var(--color-text-muted)]">
              {new Date(market.resolvedAt).toLocaleString()} by {market.resolvedBy?.email || 'admin'}
            </p>}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Total Volume" value={fmt(stats?.totalVolume)} color="gold" />
        <StatCard icon={Users} label="Unique Traders" value={stats?.uniqueTraders || 0} color="blue" />
        <StatCard icon={BarChart3} label="Total Trades" value={stats?.tradeCount || 0} color="green" />
        <StatCard icon={BarChart3} label="Yes / No Shares" value={`${stats?.yesShares || 0} / ${stats?.noShares || 0}`} color="purple" />
      </div>

      {/* Yes/No probability bar */}
      <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Current Probability</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-green)] font-semibold w-10">Yes {yesProb}%</span>
          <div className="flex-1 bg-[var(--color-border)] rounded-full h-4 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--color-green)] to-[var(--color-red)] rounded-full transition-all"
              style={{ background: `linear-gradient(to right, var(--color-green) ${yesProb}%, var(--color-red) ${yesProb}%)` }} />
          </div>
          <span className="text-sm text-[var(--color-red)] font-semibold w-10">No {noProb}%</span>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Market details */}
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Market Details</h2>
          {market.description && <p className="text-sm text-[var(--color-text-muted)]">{market.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['End Date', market.endDate ? new Date(market.endDate).toLocaleString() : '—'],
              ['Close Date', market.closeDate ? new Date(market.closeDate).toLocaleString() : '—'],
              ['Category', market.categorySlug],
              ['Slug', market.slug],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{label}</p>
                <p className="text-[var(--color-text)] truncate">{val}</p>
              </div>
            ))}
          </div>
          {market.sourceOfTruth && (
            <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Source of Truth</p>
              <p className="text-sm text-[var(--color-text)]">{market.sourceOfTruth}</p>
            </div>
          )}
          {market.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {market.tags.map(t => (
                <span key={t} className="px-2 py-0.5 bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 rounded-full text-xs text-[var(--color-gold)]">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Top traders */}
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Top Traders</h2>
          {topTraders.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No trades yet</p>
          ) : (
            <div className="space-y-2">
              {topTraders.map((t, i) => (
                <Link key={i} to={`/admin/users/${t.user._id}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-surface)] transition-all">
                  <span className="text-xs text-[var(--color-text-muted)] w-4">{i + 1}</span>
                  <div className="w-7 h-7 bg-[var(--color-gold)]/10 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-gold)]">
                    {(t.user.username || t.user.email || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text)] truncate">{t.user.username || t.user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[var(--color-gold)]">{fmt(t.volume)}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{t.shares} shares</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rules */}
      {market.rules && (
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Resolution Rules</h2>
          <pre className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap font-sans">{market.rules}</pre>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.type === 'close' ? 'Close Market?' : confirm.type === 'reopen' ? 'Reopen Market?' : 'Delete Market?'}
        message={
          confirm.type === 'close' ? 'Closing will stop all trading. Market can be resolved afterward.'
          : confirm.type === 'reopen' ? 'Reopen this market to allow trading again?'
          : 'Permanently delete this market? This cannot be undone.'
        }
        confirmText={confirm.type === 'close' ? 'Close' : confirm.type === 'reopen' ? 'Reopen' : 'Delete'}
        confirmColor="red"
        loading={confirm.loading}
        onConfirm={handleAction}
        onCancel={() => setConfirm({ open: false, type: '', loading: false })}
      />

      <ResolveMarketModal
        open={resolveModal}
        market={market}
        onClose={() => setResolveModal(false)}
        onResolved={(updatedMarket) => { setMarket(updatedMarket); setResolveModal(false); load(); }}
      />
    </div>
  );
};

export default AdminMarketDetail;
