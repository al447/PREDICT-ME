import { useState, useEffect } from 'react';
import { 
  Users, DollarSign, Settings, Search, Filter, 
  ChevronLeft, ChevronRight, Check, X, Ban, 
  RotateCcw, Award, TrendingUp, Loader2, RefreshCw,
  UserCheck, UserX, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminReferralAPI } from '../../services/adminApi';

const AdminReferralDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    if (activeTab === 'referrals') fetchReferrals();
    if (activeTab === 'commissions') fetchCommissions();
  }, [activeTab, page, searchTerm]);

  const fetchOverview = async () => {
    try {
      const [statsRes, configRes] = await Promise.all([
        adminReferralAPI.getStats(),
        adminReferralAPI.getConfig()
      ]);
      setStats(statsRes.data?.stats || statsRes.data);
      setConfig(configRes.data?.config || configRes.data);
    } catch (err) {
      toast.error('Failed to load referral stats');
    } finally {
      setLoading(false);
    }
  };

  const fetchReferrals = async () => {
    setLoading(true);
    try {
      const res = await adminReferralAPI.listReferrals({ 
        page, 
        limit: 20,
        search: searchTerm 
      });
      setReferrals(res.data.referrals || []);
      setTotalPages(res.data.pages || 1);
    } catch (err) {
      toast.error('Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  const fetchCommissions = async () => {
    setLoading(true);
    try {
      const res = await adminReferralAPI.listCommissions({ 
        page, 
        limit: 20,
        search: searchTerm 
      });
      setCommissions(res.data.commissions || []);
      setTotalPages(res.data.pages || 1);
    } catch (err) {
      toast.error('Failed to load commissions');
    } finally {
      setLoading(false);
    }
  };

  const handleForceQualify = async (refId) => {
    try {
      await adminReferralAPI.forceQualify(refId);
      toast.success('Referral qualified successfully');
      fetchReferrals();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to qualify referral');
    }
  };

  const handleRevoke = async (refId) => {
    if (!confirm('Are you sure? This will claw back pending bonuses.')) return;
    try {
      await adminReferralAPI.revoke(refId);
      toast.success('Referral revoked');
      fetchReferrals();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to revoke referral');
    }
  };

  const handleBanToggle = async (userId, currentBanStatus) => {
    try {
      await adminReferralAPI.ban(userId, !currentBanStatus);
      toast.success(currentBanStatus ? 'User unbanned' : 'User banned from referrals');
      fetchReferrals();
    } catch (err) {
      toast.error('Failed to update ban status');
    }
  };

  const handleUpdateConfig = async (updatedConfig) => {
    try {
      await adminReferralAPI.updateConfig(updatedConfig);
      toast.success('Configuration updated');
      setConfig(updatedConfig);
      setShowConfigModal(false);
    } catch (err) {
      toast.error('Failed to update config');
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-gold)]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">Referral Program</h1>
        <button
          onClick={() => setShowConfigModal(true)}
          className="px-4 py-2 bg-[var(--color-gold)] text-black rounded-lg font-medium hover:bg-[var(--color-gold)]/90 transition-colors flex items-center justify-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Configure
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard 
          icon={Users} 
          label="Total Referrals" 
          value={stats?.totalReferrals || 0}
          color="blue"
        />
        <StatCard 
          icon={UserCheck} 
          label="Qualified Referrals" 
          value={stats?.qualifiedReferrals || 0}
          color="emerald"
        />
        <StatCard 
          icon={DollarSign} 
          label="Total Commissions" 
          value={`$${(stats?.totalCommissionAmount || 0).toFixed(2)}`}
          color="gold"
        />
        <StatCard 
          icon={Award} 
          label="Milestone Bonuses Paid" 
          value={`$${(stats?.totalMilestoneBonuses || 0).toFixed(2)}`}
          color="purple"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto w-full sm:w-fit mb-6">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'referrals', label: 'Referrals', icon: Users },
          { id: 'commissions', label: 'Commissions', icon: DollarSign },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
            className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.id 
                ? 'bg-[var(--color-gold)] text-black' 
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {(activeTab === 'referrals' || activeTab === 'commissions') && (
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search by username or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <button
            onClick={() => { setPage(1); activeTab === 'referrals' ? fetchReferrals() : fetchCommissions(); }}
            className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-surface2)] transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="sm:hidden">Refresh</span>
          </button>
        </div>
      )}

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Program Status */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sm:p-6">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">Program Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Status</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  config?.enabled 
                    ? 'bg-emerald-500/10 text-emerald-500' 
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {config?.enabled ? 'Active' : 'Paused'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Commission Rate</span>
                <span className="text-[var(--color-text)] font-medium">
                  {(config?.commissionRate || 0) * 100}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Signup Bonus (Referrer)</span>
                <span className="text-[var(--color-text)] font-medium">
                  ${config?.signupBonusReferrer || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Signup Bonus (Referee)</span>
                <span className="text-[var(--color-text)] font-medium">
                  ${config?.signupBonusReferee || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Qualifying Volume</span>
                <span className="text-[var(--color-text)] font-medium">
                  ${config?.qualifyingVolume || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Top Referrers */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sm:p-6">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">Top Referrers</h3>
            {(stats?.topReferrers || []).length === 0 ? (
              <p className="text-[var(--color-text-muted)] text-center py-4">No data yet</p>
            ) : (
              <div className="space-y-3">
                {stats.topReferrers.map((referrer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-[var(--color-surface2)] rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center text-xs font-medium text-[var(--color-gold)]">
                        {idx + 1}
                      </span>
                      <span className="text-[var(--color-text)]">{referrer.username}</span>
                    </div>
                    <span className="text-[var(--color-text-muted)]">
                      {referrer.count} referrals
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sm:p-6">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">Recent Commissions</h3>
            {(stats?.recentCommissions || []).length === 0 ? (
              <p className="text-[var(--color-text-muted)] text-center py-4">No recent activity</p>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="pb-3 font-medium whitespace-nowrap">Referrer</th>
                      <th className="pb-3 font-medium whitespace-nowrap">Referee</th>
                      <th className="pb-3 font-medium whitespace-nowrap">Trade</th>
                      <th className="pb-3 font-medium whitespace-nowrap">Commission</th>
                      <th className="pb-3 font-medium whitespace-nowrap">Time</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {stats.recentCommissions.map((comm, idx) => (
                      <tr key={idx} className="border-b border-[var(--color-border)]/50">
                        <td className="py-3 text-[var(--color-text)] whitespace-nowrap">{comm.referrer?.username}</td>
                        <td className="py-3 text-[var(--color-text)] whitespace-nowrap">{comm.referee?.username}</td>
                        <td className="py-3 text-[var(--color-text-muted)] whitespace-nowrap">${comm.trade?.amount}</td>
                        <td className="py-3 text-emerald-500 whitespace-nowrap">+${comm.amount?.toFixed(2)}</td>
                        <td className="py-3 text-[var(--color-text-muted)] whitespace-nowrap">
                          {new Date(comm.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Referrer</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Referee</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Status</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Commission</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Date</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {referrals.map(ref => (
                  <tr key={ref._id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface2)]/50">
                    <td className="p-3 sm:p-4 text-[var(--color-text)] whitespace-nowrap">{ref.referrer?.username}</td>
                    <td className="p-3 sm:p-4 text-[var(--color-text)] whitespace-nowrap">{ref.referee?.username}</td>
                    <td className="p-3 sm:p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        ref.status === 'qualified' 
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : ref.status === 'pending'
                          ? 'bg-yellow-500/10 text-yellow-500'
                          : 'bg-red-500/10 text-red-500'
                      }`}>
                        {ref.status}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 text-[var(--color-text)] whitespace-nowrap">
                      ${ref.totalCommissionGenerated?.toFixed(2) || '0.00'}
                    </td>
                    <td className="p-3 sm:p-4 text-[var(--color-text-muted)] whitespace-nowrap">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 sm:p-4">
                      <div className="flex gap-2">
                        {ref.status === 'pending' && (
                          <button
                            onClick={() => handleForceQualify(ref._id)}
                            className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Force Qualify"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {ref.status !== 'rejected' && (
                          <button
                            onClick={() => handleRevoke(ref._id)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Revoke"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleBanToggle(ref.referrer?._id, ref.referrer?.referralBanned)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            ref.referrer?.referralBanned 
                              ? 'text-emerald-500 hover:bg-emerald-500/10' 
                              : 'text-red-500 hover:bg-red-500/10'
                          }`}
                          title={ref.referrer?.referralBanned ? 'Unban' : 'Ban'}
                        >
                          {ref.referrer?.referralBanned ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 border-t border-[var(--color-border)]">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface2)] rounded-lg transition-colors w-full sm:w-auto justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-sm text-[var(--color-text-muted)] order-first sm:order-none">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface2)] rounded-lg transition-colors w-full sm:w-auto justify-center"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'commissions' && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Referrer</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Referee</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Trade Amount</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Commission</th>
                  <th className="p-3 sm:p-4 font-medium whitespace-nowrap">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {commissions.map(comm => (
                  <tr key={comm._id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface2)]/50">
                    <td className="p-3 sm:p-4 text-[var(--color-text)] whitespace-nowrap">{comm.referrer?.username}</td>
                    <td className="p-3 sm:p-4 text-[var(--color-text)] whitespace-nowrap">{comm.referee?.username}</td>
                    <td className="p-3 sm:p-4 text-[var(--color-text)] whitespace-nowrap">${comm.trade?.amount || '0.00'}</td>
                    <td className="p-3 sm:p-4 text-emerald-500 font-medium whitespace-nowrap">+${comm.amount?.toFixed(2)}</td>
                    <td className="p-3 sm:p-4 text-[var(--color-text-muted)] whitespace-nowrap">
                      {new Date(comm.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 border-t border-[var(--color-border)]">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface2)] rounded-lg transition-colors w-full sm:w-auto justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-sm text-[var(--color-text-muted)] order-first sm:order-none">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface2)] rounded-lg transition-colors w-full sm:w-auto justify-center"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && config && (
        <ConfigModal 
          config={config}
          onClose={() => setShowConfigModal(false)}
          onSave={handleUpdateConfig}
        />
      )}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    gold: 'bg-[var(--color-gold)]/10 text-[var(--color-gold)]',
    purple: 'bg-purple-500/10 text-purple-500',
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 sm:p-5">
      <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${colors[color]} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="text-xs sm:text-sm text-[var(--color-text-muted)]">{label}</span>
      </div>
      <p className="text-lg sm:text-2xl font-bold text-[var(--color-text)] truncate">{value}</p>
    </div>
  );
};

const ConfigModal = ({ config, onClose, onSave }) => {
  const [formData, setFormData] = useState(config);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-6">Referral Configuration</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[var(--color-text)]">Program Enabled</label>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                Commission Rate (0-1)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.commissionRate}
                onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) })}
                className="w-full p-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                  Signup Bonus (Referrer)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.signupBonusReferrer}
                  onChange={(e) => setFormData({ ...formData, signupBonusReferrer: parseFloat(e.target.value) })}
                  className="w-full p-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                  Signup Bonus (Referee)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.signupBonusReferee}
                  onChange={(e) => setFormData({ ...formData, signupBonusReferee: parseFloat(e.target.value) })}
                  className="w-full p-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                Qualifying Volume ($)
              </label>
              <input
                type="number"
                min="0"
                value={formData.qualifyingVolume}
                onChange={(e) => setFormData({ ...formData, qualifyingVolume: parseFloat(e.target.value) })}
                className="w-full p-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                Daily Referral Limit
              </label>
              <input
                type="number"
                min="1"
                value={formData.maxReferralsPerDay}
                onChange={(e) => setFormData({ ...formData, maxReferralsPerDay: parseInt(e.target.value) })}
                className="w-full p-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-surface2)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-[var(--color-gold)] text-black font-medium rounded-lg hover:bg-[var(--color-gold)]/90 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminReferralDashboard;
