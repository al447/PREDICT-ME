import { useState, useEffect } from 'react';
import { ExternalLink, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { depositAPI } from '../../services/api';
import { getChainById } from '../../lib/depositChains';

const STATUS_CONFIG = {
  pending:  { icon: Clock,         color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Pending'  },
  credited: { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Credited' },
  rejected: { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-400/10',    label: 'Rejected' },
};

const PendingDepositsCard = () => {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await depositAPI.getMine();
      if (data.success) setDeposits(data.deposits);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!loading && deposits.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Deposit History</h3>
        <button onClick={load} className="p-1 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] transition-colors" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2">
        {deposits.slice(0, 10).map((d) => {
          const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
          const Icon = cfg.icon;
          const chain = getChainById(d.chain);
          const explorerUrl = d.txHash && chain?.explorer ? `${chain.explorer}${d.txHash}` : null;

          return (
            <div key={d._id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{d.token}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">on {chain?.name || d.chain}</span>
                  {explorerUrl && (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[var(--color-text-muted)] hover:text-[#4f6ef7] transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {new Date(d.createdAt).toLocaleDateString()}
                  {d.claimedAmountUsd ? ` · ~$${d.claimedAmountUsd.toFixed(2)}` : ''}
                  {d.creditedAmountUsd ? ` · Credited $${d.creditedAmountUsd.toFixed(2)}` : ''}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PendingDepositsCard;
