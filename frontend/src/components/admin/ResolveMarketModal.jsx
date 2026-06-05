import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, XCircle, RotateCcw, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminMarketsAPI } from '../../services/adminApi';

const OUTCOMES = [
  { value: 'yes', label: 'Yes', icon: CheckCircle, color: 'text-[var(--color-green)] border-[var(--color-green)]/40 bg-[var(--color-green)]/10', desc: 'Yes outcome wins. Winners receive payout.' },
  { value: 'no', label: 'No', icon: XCircle, color: 'text-[var(--color-red)] border-[var(--color-red)]/40 bg-[var(--color-red)]/10', desc: 'No outcome wins. Winners receive payout.' },
  { value: 'cancelled', label: 'Cancelled', icon: RotateCcw, color: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10', desc: 'Market cancelled. All traders refunded.' },
];

const ResolveMarketModal = ({ open, market, onClose, onResolved }) => {
  const [outcome, setOutcome] = useState('');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const canSubmit = outcome && typed === 'RESOLVE' && !loading;

  const handleClose = () => { setOutcome(''); setTyped(''); setTxHash(null); setResolved(false); onClose(); };

  const handleResolve = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const tid = toast.loading('Resolving market and settling trades...');
    try {
      const { data } = await adminMarketsAPI.resolve(market._id, outcome);
      setTxHash(data.txHash || null);
      setResolved(true);
      toast.success(`Market resolved as ${outcome.toUpperCase()}! ${data.settledTrades} trades settled.`, { id: tid });
      onResolved(data.market);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Resolution failed', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl">
            <button onClick={handleClose} className="absolute top-4 right-4 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>

            <h2 className="text-xl font-bold text-[var(--color-text)] mb-1">Resolve Market</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4 truncate">{market?.title}</p>

            {resolved ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-[var(--color-green)]/15 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={28} className="text-[var(--color-green)]" />
                </div>
                <p className="font-semibold text-[var(--color-text)] mb-1">Market Resolved!</p>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">All trades have been settled and balances credited.</p>
                {txHash && (
                  <a href={`https://amoy.polygonscan.com/tx/${txHash}`} target="_blank" rel="noreferrer"
                    className="text-xs text-[var(--color-gold)] flex items-center gap-1 justify-center hover:underline">
                    View on Polygonscan <ExternalLink size={12} />
                  </a>
                )}
                <button onClick={handleClose} className="mt-4 px-6 py-2 bg-[var(--color-gold)] text-black rounded-xl font-semibold text-sm hover:brightness-110">
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3 flex items-start gap-2 mb-4">
                  <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300">This action settles all trades and is irreversible. On-chain transactions cannot be undone.</p>
                </div>

                <p className="text-sm font-medium text-[var(--color-text)] mb-3">Select outcome:</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {OUTCOMES.map(({ value, label, icon: Icon, color, desc }) => (
                    <button key={value} onClick={() => setOutcome(value)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${outcome === value ? color : 'border-[var(--color-border)] hover:border-[var(--color-border)]/80'}`}>
                      <Icon size={20} className="mx-auto mb-1" />
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-tight">{desc}</p>
                    </button>
                  ))}
                </div>

                <div className="mb-4">
                  <p className="text-sm text-[var(--color-text-muted)] mb-1.5">Type <span className="font-mono font-bold text-[var(--color-text)]">RESOLVE</span> to confirm:</p>
                  <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
                    className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]"
                    placeholder="RESOLVE" />
                </div>

                <div className="flex gap-3">
                  <button onClick={handleClose} className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all text-sm font-medium">
                    Cancel
                  </button>
                  <button onClick={handleResolve} disabled={!canSubmit}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--color-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    {loading ? 'Resolving...' : 'Resolve Market'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ResolveMarketModal;
