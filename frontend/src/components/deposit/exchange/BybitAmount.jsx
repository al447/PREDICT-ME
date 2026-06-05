import { useState } from 'react';
import { BYBIT_QUICK_AMOUNTS, BYBIT_MIN_DEPOSIT, BYBIT_MAX_DEPOSIT } from '../../../lib/exchanges';

const BybitAmount = ({ onContinue, onBack }) => {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setAmount(value);
    setError('');
  };

  const handleQuickAmount = (value) => {
    setAmount(value.toString());
    setError('');
  };

  const handleContinue = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < BYBIT_MIN_DEPOSIT) {
      setError(`Minimum deposit is $${BYBIT_MIN_DEPOSIT}`);
      return;
    }
    if (numAmount > BYBIT_MAX_DEPOSIT) {
      setError(`Maximum deposit is $${BYBIT_MAX_DEPOSIT.toLocaleString()}`);
      return;
    }
    onContinue(numAmount);
  };

  const displayAmount = amount || '0';

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Title */}
      <div className="text-center">
        <h3 className="text-base font-semibold text-[var(--color-text)]">
          Enter amount to deposit
        </h3>
      </div>

      {/* Amount display */}
      <div className="flex flex-col items-center py-4">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-[var(--color-text)]">$</span>
          <input
            type="text"
            value={displayAmount}
            onChange={handleAmountChange}
            className="text-4xl font-bold text-[var(--color-text)] bg-transparent border-none outline-none w-32 text-center"
            placeholder="0"
          />
        </div>
        <div className="mt-2 px-3 py-1 rounded-full bg-[var(--color-surface2)] border border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-muted)]">0 USDC</span>
        </div>
      </div>

      {/* Quick amounts */}
      <div className="flex justify-center gap-2 flex-wrap">
        {BYBIT_QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            onClick={() => handleQuickAmount(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              amount === value.toString()
                ? 'bg-[var(--color-gold)] text-black'
                : 'bg-[var(--color-surface2)] text-[var(--color-text)] hover:bg-[var(--color-surface2)]/80'
            }`}
          >
            ${value}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}

      {/* Buttons */}
      <div className="space-y-2 pt-4">
        <button
          onClick={handleContinue}
          disabled={!amount || parseFloat(amount) < BYBIT_MIN_DEPOSIT}
          className="w-full py-3 rounded-xl bg-[#6000EA] text-white font-semibold hover:bg-[#5000c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default BybitAmount;
