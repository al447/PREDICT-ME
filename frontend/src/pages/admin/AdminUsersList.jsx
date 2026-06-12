import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, ShieldCheck, ShieldOff, UserCog } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminUsersAPI } from '../../services/adminApi';
import DataTable from '../../components/admin/DataTable';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

const AdminUsersList = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', role: '', isActive: '', sort: 'createdAt' });
  const [confirm, setConfirm] = useState({ open: false, type: '', user: null, loading: false });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20, ...filters };
      if (!params.search) delete params.search;
      if (!params.role) delete params.role;
      if (params.isActive === '') delete params.isActive;
      const { data } = await adminUsersAPI.list(params);
      setUsers(data.users);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.pages);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, [filters]);

  const handleConfirm = async () => {
    const { type, user } = confirm;
    setConfirm(c => ({ ...c, loading: true }));
    const tid = toast.loading(type === 'ban' ? 'Banning user...' : 'Unbanning user...');
    try {
      if (type === 'ban') await adminUsersAPI.ban(user._id);
      else await adminUsersAPI.unban(user._id);
      toast.success(type === 'ban' ? 'User banned' : 'User unbanned', { id: tid });
      setConfirm({ open: false, type: '', user: null, loading: false });
      load(page);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed', { id: tid });
      setConfirm(c => ({ ...c, loading: false }));
    }
  };

  const columns = [
    {
      key: 'username', label: 'User', render: (v, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-gold)]/10 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-gold)] flex-shrink-0">
            {(v || row.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <Link to={`/admin/users/${row._id}`} className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-gold)] transition-colors truncate block">
              {v || '(no username)'}
            </Link>
            <p className="text-xs text-[var(--color-text-muted)] truncate">{row.email || row.walletAddress || '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', label: 'Role', render: (v) => <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${v === 'admin' ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)] border-[var(--color-gold)]/30' : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]'}`}>{v}</span> },
    { key: 'isActive', label: 'Status', render: (v) => <span className={`text-xs px-2 py-0.5 rounded-full border ${v !== false ? 'bg-[var(--color-green)]/10 text-[var(--color-green)] border-[var(--color-green)]/30' : 'bg-[var(--color-red)]/10 text-[var(--color-red)] border-[var(--color-red)]/30'}`}>{v !== false ? 'Active' : 'Banned'}</span> },
    { key: 'balance', label: 'Balance', render: (v) => <span className="text-sm text-[var(--color-gold)]">${Number(v || 0).toLocaleString()}</span> },
    { key: 'tradeCount', label: 'Trades', render: (v) => <span className="text-sm">{v || 0}</span> },
    { key: 'authProvider', label: 'Auth', render: (v) => <span className="text-xs text-[var(--color-text-muted)] capitalize">{v}</span> },
    { key: 'createdAt', label: 'Joined', render: (v) => <span className="text-xs text-[var(--color-text-muted)]">{new Date(v).toLocaleDateString()}</span> },
    {
      key: '_id', label: 'Actions', render: (_, row) => (
        <div className="flex items-center gap-1">
          <Link to={`/admin/users/${row._id}`} className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all" title="View">
            <UserCog size={15} />
          </Link>
          {row.isActive !== false ? (
            <button onClick={() => setConfirm({ open: true, type: 'ban', user: row, loading: false })}
              className="p-1.5 rounded-lg hover:bg-[var(--color-red)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-red)] transition-all" title="Ban">
              <ShieldOff size={15} />
            </button>
          ) : (
            <button onClick={() => setConfirm({ open: true, type: 'unban', user: row, loading: false })}
              className="p-1.5 rounded-lg hover:bg-[var(--color-green)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-green)] transition-all" title="Unban">
              <ShieldCheck size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Users</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">{total} users total</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input type="text" value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search email, username, wallet..." className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]" />
        </div>
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          <select value={filters.role} onChange={(e) => setFilters(f => ({ ...f, role: e.target.value }))}
            className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] flex-shrink-0">
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <select value={filters.isActive} onChange={(e) => setFilters(f => ({ ...f, isActive: e.target.value }))}
            className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] flex-shrink-0">
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Banned</option>
          </select>
          <select value={filters.sort} onChange={(e) => setFilters(f => ({ ...f, sort: e.target.value }))}
            className="px-3 py-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] flex-shrink-0">
            <option value="createdAt">Newest</option>
            <option value="balance">Highest Balance</option>
          </select>
        </div>
      </div>

      {users.length === 0 && !loading ? (
        <div className="text-center py-20">
          <Users size={40} className="text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-[var(--color-text-muted)]">No users found</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <DataTable columns={columns} data={users} page={page} pages={pages} onPageChange={(p) => load(p)} loading={loading} />
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.type === 'ban' ? 'Ban User?' : 'Unban User?'}
        message={confirm.type === 'ban'
          ? `Ban "${confirm.user?.email || confirm.user?.username}"? They will not be able to login or trade.`
          : `Restore access for "${confirm.user?.email || confirm.user?.username}"?`}
        confirmText={confirm.type === 'ban' ? 'Ban User' : 'Unban User'}
        confirmColor="red"
        loading={confirm.loading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm({ open: false, type: '', user: null, loading: false })}
      />
    </div>
  );
};

export default AdminUsersList;
