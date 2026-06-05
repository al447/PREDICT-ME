import { useState, useMemo } from 'react';
import { ChevronLeft, AlertCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  MOONPAY_METHODS,
  QUICK_AMOUNTS,
  MIN_DEPOSIT_USD,
  MAX_DEPOSIT_USD,
  estimateUsdc,
  formatCurrency,
  isSandbox,
  getTestCard,
} from '../../../lib/moonpay';
import { depositAPI } from '../../../services/api';
import toast from 'react-hot-toast';

/**
 * Amount entry step for cash deposit
 * Shows quick chips, amount input, fee breakdown, and continue CTA
 */
const CashAmountStep = ({ methodId, onBack, onContinue }) => {
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(false);

  const method = MOONPAY_METHODS.find((m) => m.id === methodId);

  const estimate = useMemo(() => estimateUsdc(amount, methodId), [amount, methodId]);

  const handleAmountChange = (e) => {
    const val = parseFloat(e.target.value) || 0;
    setAmount(Math.min(Math.max(val, 0), MAX_DEPOSIT_USD));
  };

  const handleChipClick = (chip) => {
    setAmount(chip);
  };

  const handleContinue = async () => {
    if (amount < MIN_DEPOSIT_USD) {
      toast.error(`Minimum deposit is $${MIN_DEPOSIT_USD}`);
      return;
    }

    setLoading(true);
    try {
      const { data } = await depositAPI.moonpaySign({
        amountUsd: amount,
        paymentMethod: methodId,
      });

      if (data.success) {
        onContinue({
          url: data.url,
          signed: data.signed,
          externalTxId: data.externalTxId,
          amount,
          methodId,
        });
      } else {
        toast.error(data.error || 'Failed to prepare payment');
      }
    } catch (err) {
      console.error('MoonPay sign error:', err);
      toast.error(err.response?.data?.error || 'Failed to prepare payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with method pill */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">Pay with</p>
          <p className="text-sm font-semibold text-[var(--color-text)]">{method?.label}</p>
        </div>
      </div>

      {/* Amount Display */}
      <div className="text-center py-4">
        <motion.div
          key={amount}
          initial={{ scale: 1.05, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-bold text-[var(--color-text)]"
        >
          {formatCurrency(amount)}
        </motion.div>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          ≈ {estimate.usdcAmount.toFixed(2)} USDC
        </p>
      </div>

      {/* Quick Chips */}
      <div className="flex flex-wrap gap-2 justify-center">
        {QUICK_AMOUNTS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleChipClick(chip)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              amount === chip
                ? 'bg-[#4f6ef7] text-white'
                : 'bg-[var(--color-surface2)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
            }`}
          >
            ${chip}
          </button>
        ))}
      </div>

      {/* Custom Amount Input */}
      <div className="px-1">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] focus-within:border-[#4f6ef7] transition-colors">
          <span className="text-[var(--color-text-muted)]">$</span>
          <input
            type="number"
            value={amount || ''}
            onChange={handleAmountChange}
            placeholder="Enter amount"
            min={MIN_DEPOSIT_USD}
            max={MAX_DEPOSIT_USD}
            className="flex-1 bg-transparent text-[var(--color-text)] text-lg font-semibold outline-none placeholder:text-[var(--color-text-muted)]"
          />
          <span className="text-xs text-[var(--color-text-muted)]">USD</span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1.5 px-1">
          Min ${MIN_DEPOSIT_USD} · Max ${MAX_DEPOSIT_USD.toLocaleString()}
        </p>
      </div>

      {/* Fee Breakdown */}
      <div className="px-4 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Amount</span>
          <span className="text-[var(--color-text)]">{formatCurrency(amount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)] flex items-center gap-1">
            Processing fee
            <Info className="w-3 h-3" />
          </span>
          <span className="text-[var(--color-text)]">{estimate.feePercent}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)] flex items-center gap-1">
            Network fee
            <Info className="w-3 h-3" />
          </span>
          <span className="text-[var(--color-text)]">&lt; $0.01</span>
        </div>
        <div className="h-px bg-[var(--color-border)] my-2" />
        <div className="flex justify-between text-sm font-medium">
          <span className="text-[var(--color-text)]">You receive</span>
          <span className="text-emerald-400">{estimate.usdcAmount.toFixed(2)} USDC</span>
        </div>
      </div>

      {/* Fee Disclaimer */}
      <div className="flex items-start gap-2 px-1">
        <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Card on-ramps have higher fees than transferring crypto directly.
          These fees are charged by MoonPay, not PolyBet365.
          {isSandbox() && (
            <span className="block mt-1 text-[#4f6ef7]">
              Test card: {getTestCard().number}
            </span>
          )}
        </p>
      </div>

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={loading || amount < MIN_DEPOSIT_USD}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Preparing...
          </>
        ) : (
          <>Continue with {method?.label}</>
        )}
      </button>
    </div>
  );
};

export default CashAmountStep;
