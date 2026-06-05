import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Pencil, Lock, Unlock, Gavel, Trash2, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminMarketsAPI } from '../../services/adminApi';
import DataTable from '../../components/admin/DataTable';
import MarketStatusBadge from '../../components/admin/MarketStatusBadge';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import ResolveMarketModal from '../../components/admin/ResolveMarketModal';

const CATEGORIES = ['crypto', 'sports', 'weather', 'politics', 'finance', 'breaking'];

const AdminMarketsList = () => {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', category: '', search: '', sort: 'newest' });
  const [confirm, setConfirm] = useState({ open: false, type: '', market: null, loading: false });
  const [resolveModal, setResolveModal] = useState({ open: false, market: null });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20, ...filters };
      if (!params.status) delete params.status;
      if (!params.category) delete params.category;
      if (!params.search) delete params.search;
      const { data } = await adminMarketsAPI.list(params);
      setMarkets(data.markets);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.pages);
    } catch (e) { toast.error('Failed to load markets'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, [filters]);

  const handleClose = async (market) => {
    setConfirm({ open: true, type: 'close', market, loading: false });
  };

  const handleDelete = async (market) => {
    setConfirm({ open: true, type: 'delete', market, loading: false });
  };

  const handleConfirmAction = async () => {
    const { type, market } = confirm;
    setConfirm((c) => ({ ...c, loading: true }));
    const tid = toast.loading(type === 'close' ? 'Closing market...' : 'Deleting market...');
    try {
      if (type === 'close') await adminMarketsAPI.close(market._id);
      else if (type === 'delete') await adminMarketsAPI.remove(market._id);
      toast.success(type === 'close' ? 'Market closed' : 'Market deleted', { id: tid });
      setConfirm({ open: false, type: '', market: null, loading: false });
      load(page);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed', { id: tid });
      setConfirm((c) => ({ ...c, loading: false }));
    }
  };

  const columns = [
    {
      key: 'image', label: '', render: (v) => {
        // Handle null/undefined/empty
        if (!v || v === 'null' || v === 'undefined') {
          return <span className="text-2xl">📊</span>;
        }
        // Check if it's a URL/path (starts with / or http)
        const isPath = v.startsWith('/') || v.startsWith('http');
        if (isPath) {
          return (
            <img 
              src={v.startsWith('http') ? v : `${import.meta.env.VITE_BACKEND_URL}${v}`} 
              alt="Market" 
              className="w-12 h-12 rounded-lg object-cover border border-[var(--color-border)]"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          );
        }
        // Render as emoji/text
        return <span className="text-2xl">{v}</span>;
      },
    },
    {
      key: 'title', label: 'Title', render: (v, row) => (
        <div className="max-w-xs">
          <Link to={`/admin/markets/${row._id}`} className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-gold)] transition-colors line-clamp-2">{v}</Link>
        </div>
      ),
    },
    { key: 'categorySlug', label: 'Category', render: (v) => <span className="text-xs capitalize text-[var(--color-text-muted)]">{v}</span> },
    { key: 'status', label: 'Status', render: (v) => <MarketStatusBadge status={v} /> },
    { key: 'volume', label: 'Volume', render: (v) => <span className="text-sm">${Number(v || 0).toLocaleString()}</span> },
    { key: 'tradeCount', label: 'Trades', render: (v) => <span className="text-sm">{v || 0}</span> },
    { key: 'endDate', label: 'End Date', render: (v) => v ? <span className="text-xs text-[var(--color-text-muted)]">{new Date(v).toLocaleDateString()}</span> : '—' },
    {
      key: '_id', label: 'Actions', render: (_, row) => (
        <div className="flex items-center gap-1">
          <Link to={`/admin/markets/${row._id}`} className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all" title="View">
            <Eye size={15} />
          </Link>
          {row.status !== 'resolved' && (
            <Link to={`/admin/markets/${row._id}/edit`} className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all" title="Edit">
              <Pencil size={15} />
            </Link>
          )}
          {row.status === 'active' && (
            <button onClick={() => handleClose(row)} className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-[var(--color-text-muted)] hover:text-yellow-400 transition-all" title="Close">
              <Lock size={15} />
            </button>
          )}
          {row.status === 'closed' && (
            <>
              <button onClick={() => { adminMarketsAPI.reopen(row._id).then(() => { toast.success('Market reopened'); load(page); }).catch((e) => toast.error(e.response?.data?.error || 'Failed')); }}
                className="p-1.5 rounded-lg hover:bg-[var(--color-green)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-green)] transition-all" title="Reopen">
                <Unlock size={15} />
              </button>
              <button onClick={() => setResolveModal({ open: true, market: row })}
                className="p-1.5 rounded-lg hover:bg-[var(--color-gold)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-all" title="Resolve">
                <Gavel size={15} />
              </button>
            </>
          )}
          {row.status === 'active' && (
            <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-[var(--color-red)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-red)] transition-all" title="Delete">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Markets</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">{total} markets total</p>
        </div>
        <Link to="/admin/markets/create"
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-gold)] text-black font-semibold rounded-xl hover:brightness-110 transition-all text-sm">
          <Plus size={16} /> Create Market
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input type="text" value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search markets..." className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]" />
        </div>
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
            className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] flex-shrink-0">
            <option value="">All Status</option>
            {['draft', 'active', 'closed', 'resolved'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}
            className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] flex-shrink-0">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
          <select value={filters.sort} onChange={(e) => setFilters(f => ({ ...f, sort: e.target.value }))}
            className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] flex-shrink-0">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="volume">Highest Volume</option>
            <option value="endDate">Ending Soon</option>
          </select>
        </div>
      </div>

      {markets.length === 0 && !loading ? (
        <div className="text-center py-20">
          <BarChart3 size={40} className="text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-[var(--color-text-muted)] mb-4">No markets yet</p>
          <Link to="/admin/markets/create" className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-gold)] text-black rounded-xl font-semibold text-sm hover:brightness-110">
            <Plus size={15} /> Create your first market
          </Link>
        </div>
      ) : (
        <DataTable columns={columns} data={markets} page={page} pages={pages} onPageChange={(p) => load(p)} loading={loading} />
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.type === 'close' ? 'Close Market?' : 'Delete Market?'}
        message={confirm.type === 'close'
          ? `Close "${confirm.market?.title}"? Users will no longer be able to trade. You can still resolve it later.`
          : `Permanently delete "${confirm.market?.title}"? This cannot be undone.`}
        confirmText={confirm.type === 'close' ? 'Close Market' : 'Delete Market'}
        confirmColor="red"
        loading={confirm.loading}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirm({ open: false, type: '', market: null, loading: false })}
      />

      <ResolveMarketModal
        open={resolveModal.open}
        market={resolveModal.market}
        onClose={() => setResolveModal({ open: false, market: null })}
        onResolved={() => { setResolveModal({ open: false, market: null }); load(page); }}
      />
    </div>
  );
};

export default AdminMarketsList;
