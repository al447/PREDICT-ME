import { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Loader2, TrendingUp } from 'lucide-react';
import { adminDepositAPI } from '../../services/adminApi';
import { getChainById, getTokenById } from '../../lib/depositChains';
import toast from 'react-hot-toast';

const STATUS_TABS = [
  { id: 'pending',  label: 'Pending',  color: 'text-yellow-400'  },
  { id: 'credited', label: 'Credited', color: 'text-emerald-400' },
  { id: 'rejected', label: 'Rejected', color: 'text-red-400'     },
  { id: 'all',      label: 'All',      color: 'text-[var(--color-text)]' },
];

const StatsCard = ({ label, value, color }) => (
  <div className="p-3 sm:p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
    <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
    <p className={`text-lg sm:text-2xl font-bold truncate ${color || 'text-[var(--color-text)]'}`}>{value}</p>
  </div>
);

/* ─── Side panel for review actions ─── */
const ReviewPanel = ({ deposit, onClose, onCredited, onRejected }) => {
  const [amountUsd, setAmountUsd] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loadingCredit, setLoadingCredit] = useState(false);
  const [loadingReject, setLoadingReject] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const chain = getChainById(deposit.chain);
  const explorerUrl = deposit.txHash && chain?.explorer ? `${chain.explorer}${deposit.txHash}` : null;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminDepositAPI.priceSuggestion(deposit._id);
        if (data.success) {
          setSuggestion(data);
          if (data.suggestedUsd) setAmountUsd(data.suggestedUsd.toFixed(2));
        }
      } catch {}
    })();
  }, [deposit._id]);

  const handleCredit = async () => {
    if (!amountUsd || parseFloat(amountUsd) <= 0) {
      toast.error('Enter a valid USD amount');
      return;
    }
    setLoadingCredit(true);
    try {
      await adminDepositAPI.credit(deposit._id, parseFloat(amountUsd));
      toast.success(`Credited $${amountUsd} to user`);
      onCredited();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credit failed');
    } finally { setLoadingCredit(false); }
  };

  const handleReject = async () => {
    setLoadingReject(true);
    try {
      await adminDepositAPI.reject(deposit._id, rejectReason);
      toast.success('Deposit rejected');
      onRejected();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reject failed');
    } finally { setLoadingReject(false); }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="font-semibold text-[var(--color-text)]">Review Deposit</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)]">
          <XCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* User info */}
        <div>
          <p className="text-xs text-[var(--color-text-muted)] mb-1">User</p>
          <p className="text-sm font-medium text-[var(--color-text)]">
            {deposit.user?.username || deposit.user?.email || 'Unknown'}
          </p>
          {deposit.user?.walletAddress && (
            <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5 break-all">{deposit.user.walletAddress}</p>
          )}
        </div>

        {/* Deposit info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Token</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">{deposit.token}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Chain</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">{chain?.name || deposit.chain}</p>
          </div>
          {deposit.claimedAmountUsd && (
            <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-1">Claimed Amount</p>
              <p className="text-sm font-semibold text-[var(--color-text)]">{deposit.claimedAmountUsd} {deposit.token}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Submitted</p>
            <p className="text-sm text-[var(--color-text)]">{new Date(deposit.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {/* Tx hash + explorer link */}
        {deposit.txHash && (
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Transaction Hash</p>
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-[var(--color-text)] break-all flex-1">{deposit.txHash}</p>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-[#4f6ef7]/10 text-[#4f6ef7] text-xs font-medium hover:bg-[#4f6ef7]/20 transition-colors">
                  View <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Price suggestion */}
        {suggestion?.tokenPrice && (
          <div className="p-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">CoinGecko Price</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              1 {deposit.token} = ${suggestion.tokenPrice.toFixed(4)}
            </p>
            {suggestion.suggestedUsd && (
              <p className="text-xs text-emerald-400 mt-0.5">
                Suggested: ${suggestion.suggestedUsd.toFixed(2)} USD
              </p>
            )}
          </div>
        )}

        {/* Credit form */}
        {deposit.status !== 'credited' && deposit.status !== 'rejected' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Amount to Credit (USD)</label>
              <input
                type="number"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:border-[#4f6ef7] outline-none"
              />
            </div>

            <button
              onClick={handleCredit}
              disabled={loadingCredit}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] disabled:opacity-50 transition-colors"
            >
              {loadingCredit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Credit User Balance
            </button>

            <button
              onClick={() => setShowReject((s) => !s)}
              className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] transition-colors"
            >
              {showReject ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Reject deposit
            </button>

            {showReject && (
              <div className="space-y-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:border-red-400 outline-none"
                />
                <button
                  onClick={handleReject}
                  disabled={loadingReject}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  {loadingReject ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Confirm Reject
                </button>
              </div>
            )}
          </div>
        )}

        {/* Already processed */}
        {deposit.status === 'credited' && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 text-center">
            ✅ Credited ${deposit.creditedAmountUsd?.toFixed(2)} · {new Date(deposit.reviewedAt).toLocaleString()}
          </div>
        )}
        {deposit.status === 'rejected' && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
            ❌ Rejected · {deposit.notes || 'No reason given'}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Main AdminDepositsPage ─── */
const AdminDepositsPage = () => {
  const [tab, setTab] = useState('pending');
  const [deposits, setDeposits] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedDeposit, setSelectedDeposit] = useState(null);

  const load = async (statusTab = tab, pageNum = page) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        adminDepositAPI.list({ status: statusTab, page: pageNum, limit: 20 }),
        adminDepositAPI.stats(),
      ]);
      setDeposits(listRes.data.deposits || []);
      setTotalPages(listRes.data.pages || 1);
      setStats(statsRes.data.stats || null);
    } catch (err) {
      toast.error('Failed to load deposits');
    }
    setLoading(false);
  };

  useEffect(() => { load(tab, 1); setPage(1); }, [tab]);

  const handleTabChange = (t) => { setTab(t); };

  const handleRowClick = (deposit) => setSelectedDeposit(deposit);
  const handlePanelClose = () => setSelectedDeposit(null);
  const handleCredited = () => { setSelectedDeposit(null); load(tab, page); };
  const handleRejected = () => { setSelectedDeposit(null); load(tab, page); };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Deposits</h1>
        <button onClick={() => load(tab, page)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatsCard label="Pending Review" value={stats.pending} color="text-yellow-400" />
          <StatsCard label="Credited (24h)" value={stats.credited24h} color="text-emerald-400" />
          <StatsCard label="Total Credited" value={`$${(stats.totalCredited || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`} color="text-[#4f6ef7]" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[var(--color-surface2)] p-1 rounded-xl border border-[var(--color-border)] overflow-x-auto w-full sm:w-fit">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              tab === t.id
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : deposits.length === 0 ? (
          <div className="py-16 text-center text-[var(--color-text-muted)]">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No {tab === 'all' ? '' : tab} deposits</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
                {['User', 'Chain', 'Token', 'Tx Hash', 'Amount', 'Submitted', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => {
                const chain = getChainById(d.chain);
                const explorerUrl = d.txHash && chain?.explorer ? `${chain.explorer}${d.txHash}` : null;
                const STATUS_STYLES = {
                  pending:  'bg-yellow-400/10 text-yellow-400',
                  credited: 'bg-emerald-400/10 text-emerald-400',
                  rejected: 'bg-red-400/10 text-red-400',
                };
                return (
                  <tr key={d._id}
                    onClick={() => handleRowClick(d)}
                    className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface2)] cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-text)] truncate max-w-[120px]">{d.user?.username || d.user?.email || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{chain?.name || d.chain}</td>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{d.token}</td>
                    <td className="px-4 py-3">
                      {d.txHash ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-[var(--color-text-muted)] truncate max-w-[100px]">{d.txHash.slice(0, 10)}…</span>
                          {explorerUrl && (
                            <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#4f6ef7] hover:opacity-70">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : <span className="text-[var(--color-text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {d.creditedAmountUsd ? `$${d.creditedAmountUsd.toFixed(2)}` : d.claimedAmountUsd ? `~$${d.claimedAmountUsd.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[d.status] || ''}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.status === 'pending' && (
                        <span className="text-xs text-[#4f6ef7] font-medium">Review →</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(tab, p); }}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] disabled:opacity-40 hover:bg-[var(--color-surface2)] transition-colors">
            ← Prev
          </button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
          <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(tab, p); }}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] disabled:opacity-40 hover:bg-[var(--color-surface2)] transition-colors">
            Next →
          </button>
        </div>
      )}

      {/* Review side panel */}
      {selectedDeposit && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={handlePanelClose} />
          <ReviewPanel
            deposit={selectedDeposit}
            onClose={handlePanelClose}
            onCredited={handleCredited}
            onRejected={handleRejected}
          />
        </>
      )}
    </div>
  );
};

export default AdminDepositsPage;
