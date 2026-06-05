import { CheckCircle } from 'lucide-react';

const ExchangeSuccess = ({ amount, balance, onClose }) => {
  return (
    <div className="space-y-6 py-4">
      {/* Success icon */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-[var(--color-text)]">
          Deposit Complete
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Your deposit has been processed successfully
        </p>
      </div>

      {/* Amount */}
      <div className="text-center py-4">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
          Amount deposited
        </p>
        <p className="text-3xl font-bold text-[var(--color-text)]">
          ${amount?.toFixed(2) || '0.00'}
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">USDC</p>
      </div>

      {/* New balance */}
      <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--color-text-muted)]">New balance</span>
          <span className="text-lg font-semibold text-[var(--color-text)]">
            ${balance || '0.00'}
          </span>
        </div>
      </div>

      {/* Done button */}
      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl bg-[var(--color-gold)] text-black font-semibold hover:bg-[var(--color-gold)]/90 transition-colors"
      >
        Done
      </button>
    </div>
  );
};

export default ExchangeSuccess;
