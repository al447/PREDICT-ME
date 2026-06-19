/**
 * Admin On-Chain Migration Page
 * 
 * Bulk migrate existing markets to on-chain (Polymarket-style CLOB trading).
 * 
 * Features:
 * - View on-chain vs pending market counts
 * - Dry run to preview migration
 * - Bulk migrate pending markets
 * - Individual market publish
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Database, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Eye, 
  RefreshCw,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

// Create onchain API instance (baseURL is /api/onchain, not /api/admin)
const onchainApi = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL ? import.meta.env.VITE_BACKEND_URL + '/api/onchain' : '/api/onchain',
  timeout: 30000,
});

// Add auth interceptor
onchainApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('pb365_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function AdminOnChainMigration() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [limit, setLimit] = useState(10);

  // Fetch current status
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const { data } = await onchainApi.get('/markets/status');
      if (data.success) {
        setStatus(data);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Dry run
  const handleDryRun = async () => {
    setLoading(true);
    setDryRunResult(null);
    setMigrationResult(null);
    try {
      const { data } = await onchainApi.post('/markets/migrate', { 
        limit, 
        dryRun: true 
      });
      if (data.success) {
        setDryRunResult(data);
        toast.success(`Dry run: ${data.wouldMigrate} markets would be migrated`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  // Actual migration
  const handleMigrate = async () => {
    if (!dryRunResult) {
      toast.error('Please run a dry run first');
      return;
    }
    
    if (!confirm(`Migrate ${dryRunResult.wouldMigrate} markets to on-chain? This will deploy contracts and cost MATIC gas fees.`)) {
      return;
    }

    setMigrating(true);
    setMigrationResult(null);
    try {
      const { data } = await onchainApi.post('/markets/migrate', { 
        limit, 
        dryRun: false 
      });
      if (data.success) {
        setMigrationResult(data);
        toast.success(`Migrated ${data.migrated} markets, ${data.failed} failed`);
        fetchStatus(); // Refresh status
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Migration failed');
    } finally {
      setMigrating(false);
    }
  };

  // Publish single market
  const handlePublishOne = async (marketId) => {
    try {
      const { data } = await onchainApi.post(`/market/${marketId}/publish`);
      if (data.success) {
        toast.success('Market published on-chain');
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Publish failed');
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString();

  return (
    <div className="max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/markets" className="p-2 rounded-xl hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] transition-all">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">On-Chain Migration</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Migrate markets to Polymarket-style CLOB trading
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {status?.summary && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database size={16} className="text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">Total Markets</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)]">{status.summary.total}</p>
          </div>
          
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} className="text-green-500" />
              <span className="text-xs text-green-600">On-Chain (CLOB)</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{status.summary.onChain}</p>
            <p className="text-xs text-green-600/70">{status.summary.onChainPercentage}% of total</p>
          </div>
          
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <span className="text-xs text-amber-600">Pending (Off-Chain)</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{status.summary.pending}</p>
            <p className="text-xs text-amber-600/70">Need migration</p>
          </div>
        </div>
      )}

      {/* Migration Controls */}
      {status?.summary?.pending > 0 && (
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
            Bulk Migration
          </h2>
          
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">
                Markets to migrate (max 50)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={limit}
                onChange={(e) => setLimit(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-24 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleDryRun}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] hover:bg-[var(--color-surface3)] transition-all disabled:opacity-50"
              >
                <Eye size={16} />
                {loading ? 'Running...' : 'Dry Run'}
              </button>
              
              <button
                onClick={handleMigrate}
                disabled={migrating || !dryRunResult}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-gold)] text-black font-medium rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} />
                {migrating ? 'Migrating...' : 'Migrate Now'}
              </button>
            </div>
          </div>

          {/* Dry Run Results */}
          {dryRunResult && !migrationResult && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-blue-600 mb-2">
                Dry Run Preview
              </h3>
              <p className="text-sm text-blue-600/80 mb-2">
                Would migrate <strong>{dryRunResult.wouldMigrate}</strong> markets:
              </p>
              <ul className="text-xs text-blue-600/70 space-y-1 max-h-40 overflow-y-auto">
                {dryRunResult.markets?.map((m) => (
                  <li key={m._id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    {m.title}
                    {m.negRisk && <span className="text-[10px] bg-blue-500/20 px-1.5 rounded">NegRisk</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Migration Results */}
          {migrationResult && (
            <div className={`${migrationResult.failed === 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'} border rounded-lg p-4`}>
              <h3 className={`text-sm font-medium mb-2 ${migrationResult.failed === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                Migration Complete
              </h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">Total</p>
                  <p className="text-lg font-semibold text-[var(--color-text)]">{migrationResult.total}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600">Success</p>
                  <p className="text-lg font-semibold text-green-600">{migrationResult.migrated}</p>
                </div>
                <div>
                  <p className="text-xs text-red-600">Failed</p>
                  <p className="text-lg font-semibold text-red-600">{migrationResult.failed}</p>
                </div>
              </div>
              
              {migrationResult.results?.some(r => r.success) && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  <p className="text-xs text-[var(--color-text-muted)]">Successful migrations:</p>
                  {migrationResult.results.filter(r => r.success).map((r) => (
                    <div key={r._id} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 size={12} className="text-green-500" />
                      <span className="text-[var(--color-text)]">{r.title}</span>
                      <a 
                        href={`https://amoy.polygonscan.com/tx/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-gold)] hover:underline flex items-center gap-0.5"
                      >
                        {r.txHash?.slice(0, 10)}... <ExternalLink size={10} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
              
              {migrationResult.results?.some(r => !r.success) && (
                <div className="space-y-2 max-h-40 overflow-y-auto mt-4">
                  <p className="text-xs text-red-600">Failed migrations:</p>
                  {migrationResult.results.filter(r => !r.success).map((r) => (
                    <div key={r._id} className="flex items-start gap-2 text-xs">
                      <XCircle size={12} className="text-red-500 mt-0.5" />
                      <div>
                        <span className="text-[var(--color-text)]">{r.title}</span>
                        <p className="text-red-600/70">{r.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending Markets List */}
      {status?.pendingMarkets?.length > 0 && (
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Pending Markets ({status.pendingMarkets.length})
            </h2>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-[var(--color-surface3)] text-[var(--color-text-muted)] transition-all disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {status.pendingMarkets.map((m) => (
              <div 
                key={m._id}
                className="flex items-center justify-between p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)] truncate">{m.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Status: {m.status} • Created: {formatDate(m.createdAt)}
                  </p>
                  {m.missing?.length > 0 && (
                    <p className="text-xs text-amber-600/70 mt-1">
                      Missing: {m.missing.join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handlePublishOne(m._id)}
                  disabled={migrating}
                  className="ml-4 px-3 py-1.5 bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 rounded-lg text-xs text-[var(--color-gold)] hover:bg-[var(--color-gold)]/20 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  Publish
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-Chain Markets List */}
      {status?.onChainMarkets?.length > 0 && (
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-6 mt-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
            On-Chain Markets ({status.onChainMarkets.length})
          </h2>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {status.onChainMarkets.slice(0, 10).map((m) => (
              <div 
                key={m._id}
                className="flex items-center gap-3 p-3 bg-green-500/5 border border-green-500/20 rounded-lg"
              >
                <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)] truncate">{m.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono">
                    {m.conditionId?.slice(0, 20)}...
                  </p>
                </div>
                {m.negRisk && (
                  <span className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded shrink-0">
                    NegRisk
                  </span>
                )}
              </div>
            ))}
            {status.onChainMarkets.length > 10 && (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-2">
                +{status.onChainMarkets.length - 10} more on-chain markets
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
