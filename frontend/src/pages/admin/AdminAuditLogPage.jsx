import { useState, useEffect, useCallback } from 'react';
import { ScrollText, ExternalLink, Filter } from 'lucide-react';
import { adminDashboardAPI } from '../../services/adminApi';
import DataTable from '../../components/admin/DataTable';

const ACTION_LABELS = {
  admin_login: 'Admin Login',
  market_create: 'Market Created',
  market_edit: 'Market Edited',
  market_close: 'Market Closed',
  market_reopen: 'Market Reopened',
  market_resolve: 'Market Resolved',
  market_delete: 'Market Deleted',
  user_ban: 'User Banned',
  user_unban: 'User Unbanned',
  balance_adjust: 'Balance Adjusted',
  role_change: 'Role Changed',
};

const ACTION_COLORS = {
  market_create: 'bg-[var(--color-green)]/10 text-[var(--color-green)] border-[var(--color-green)]/30',
  market_resolve: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
  market_close: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  market_delete: 'bg-[var(--color-red)]/10 text-[var(--color-red)] border-[var(--color-red)]/30',
  user_ban: 'bg-[var(--color-red)]/10 text-[var(--color-red)] border-[var(--color-red)]/30',
  balance_adjust: 'bg-[var(--color-gold)]/10 text-[var(--color-gold)] border-[var(--color-gold)]/30',
};

const ACTIONS = Object.keys(ACTION_LABELS);

const AdminAuditLogPage = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '' });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50, ...filters };
      if (!params.action) delete params.action;
      const { data } = await adminDashboardAPI.auditLog(params);
      setLogs(data.logs);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.pages);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, [filters]);

  const columns = [
    {
      key: 'admin', label: 'Admin', render: (v) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[var(--color-gold)]/10 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-gold)]">
            {(v?.username || v?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <span className="text-xs text-[var(--color-text)]">{v?.username || v?.email || 'Unknown'}</span>
        </div>
      ),
    },
    {
      key: 'action', label: 'Action', render: (v) => (
        <span className={`text-xs px-2 py-0.5 rounded-full border ${ACTION_COLORS[v] || 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]'}`}>
          {ACTION_LABELS[v] || v}
        </span>
      ),
    },
    {
      key: 'details', label: 'Details', render: (v) => (
        <div className="text-xs text-[var(--color-text-muted)] max-w-xs truncate">
          {v?.title || v?.email || (v?.delta !== undefined ? `Delta: ${v.delta > 0 ? '+' : ''}${v.delta} — ${v.reason}` : JSON.stringify(v).slice(0, 80))}
        </div>
      ),
    },
    {
      key: 'txHash', label: 'Tx Hash', render: (v) => v ? (
        <a href={`https://amoy.polygonscan.com/tx/${v}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs text-[var(--color-gold)] hover:underline">
          {v.slice(0, 8)}... <ExternalLink size={10} />
        </a>
      ) : '—',
    },
    { key: 'createdAt', label: 'Date', render: (v) => <span className="text-xs text-[var(--color-text-muted)]">{new Date(v).toLocaleString()}</span> },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Audit Log</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">{total} entries</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Filter size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />
        <select value={filters.action} onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
          className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] w-full sm:w-auto">
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
        </select>
      </div>

      {logs.length === 0 && !loading ? (
        <div className="text-center py-20">
          <ScrollText size={40} className="text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-[var(--color-text-muted)]">No audit log entries yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <DataTable columns={columns} data={logs} page={page} pages={pages} onPageChange={(p) => load(p)} loading={loading} />
        </div>
      )}
    </div>
  );
};

export default AdminAuditLogPage;
