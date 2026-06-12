import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';

const ConfirmDialog = ({ open, title, message, confirmText = 'Confirm', confirmColor = 'red', onConfirm, onCancel, requireType, loading = false }) => {
  const [typed, setTyped] = useState('');

  const isConfirmEnabled = !requireType || typed === requireType;

  const handleClose = () => { setTyped(''); onCancel(); };
  const handleConfirm = () => { if (isConfirmEnabled) { setTyped(''); onConfirm(); } };

  const btnColor = confirmColor === 'gold'
    ? 'bg-[var(--color-gold)] text-black hover:brightness-110'
    : 'bg-[var(--color-red)] text-white hover:opacity-90';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl">
            <button onClick={handleClose} className="absolute top-4 right-4 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <X size={18} />
            </button>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-red)]/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-[var(--color-red)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--color-text)] text-lg">{title}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">{message}</p>
              </div>
            </div>

            {requireType && (
              <div className="mb-4">
                <p className="text-sm text-[var(--color-text-muted)] mb-2">Type <span className="font-mono font-bold text-[var(--color-text)]">{requireType}</span> to confirm:</p>
                <input
                  type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
                  className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]"
                  placeholder={requireType}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleClose} className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={!isConfirmEnabled || loading}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${btnColor}`}>
                {loading ? 'Processing...' : confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
