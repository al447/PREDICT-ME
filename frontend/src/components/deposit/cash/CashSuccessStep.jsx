import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, ExternalLink, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { depositAPI } from '../../../services/api';
import { formatCurrency } from '../../../lib/moonpay';
import useAuthStore from '../../../store/authStore';

/**
 * Success step after MoonPay payment initiated
 * Polls for deposit completion and shows balance update
 */
const CashSuccessStep = ({ paymentData, onClose }) => {
  // For test mode (usdcReceived present), show completed immediately
  // For webhook mode, poll until credited
  const isTestMode = !!paymentData.usdcReceived;
  const [status, setStatus] = useState(isTestMode ? 'completed' : 'pending');
  const [deposit, setDeposit] = useState(null);
  const [polling, setPolling] = useState(!isTestMode);
  const { fetchMe, user } = useAuthStore();

  const { amount, methodId, externalTxId } = paymentData;

  // For test mode, refresh balance immediately on mount
  useEffect(() => {
    if (isTestMode) {
      fetchMe();
    }
  }, [isTestMode, fetchMe]);

  // Poll for deposit status (only in webhook/live mode)
  useEffect(() => {
    if (!polling) return;

    const checkStatus = async () => {
      try {
        const { data } = await depositAPI.getMine();
        if (data.success && data.deposits) {
          // Find matching deposit by providerTxId
          const match = data.deposits.find(
            (d) => d.providerTxId === externalTxId || d.provider === 'moonpay'
          );

          if (match) {
            setDeposit(match);

            if (match.status === 'credited') {
              setStatus('completed');
              setPolling(false);
              // Refresh user balance
              fetchMe();
            } else if (match.status === 'rejected') {
              setStatus('error');
              setPolling(false);
            }
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 4 seconds
    const interval = setInterval(checkStatus, 4000);

    return () => clearInterval(interval);
  }, [externalTxId, polling, fetchMe]);

  const handleDone = () => {
    onClose();
  };

  const handleNavigateToTrading = () => {
    onClose();
    // Navigation handled by parent or router
    window.location.href = '/';
  };

  return (
    <div className="text-center space-y-5 py-6">
      {/* Status Icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center"
      >
        {status === 'completed' ? (
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        ) : status === 'error' ? (
          <span className="text-3xl">❌</span>
        ) : (
          <Loader2 className="w-8 h-8 text-[#4f6ef7] animate-spin" />
        )}
      </motion.div>

      {/* Title */}
      <div>
        <h3 className="text-lg font-bold text-[var(--color-text)]">
          {status === 'completed'
            ? 'Funds added!'
            : status === 'error'
            ? 'Payment failed'
            : 'Deposit pending'}
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {status === 'completed'
            ? `Your balance has been updated with ${(paymentData.usdcReceived || amount).toFixed(2)} USDC`
            : status === 'error'
            ? 'There was an issue processing your payment'
            : 'Your payment is being processed. This usually takes 1-2 minutes.'}
        </p>
      </div>

      {/* Details Card */}
      <div className="px-4 py-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Amount Paid</span>
          <span className="text-[var(--color-text)] font-medium">{formatCurrency(amount)}</span>
        </div>
        {paymentData.fee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">Processing Fee</span>
            <span className="text-[var(--color-text)]">{paymentData.fee.toFixed(2)} USDC</span>
          </div>
        )}
        <div className="h-px bg-[var(--color-border)] my-2" />
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text)] font-medium">You Received</span>
          <span className="text-emerald-400 font-semibold">
            {(paymentData.usdcReceived || amount).toFixed(2)} USDC
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Method</span>
          <span className="text-[var(--color-text)]">
            {paymentData.methodLabel || methodId}
          </span>
        </div>
        {deposit?.txHash && (
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">Transaction</span>
            <a
              href={`https://polygonscan.com/tx/${deposit.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4f6ef7] hover:underline flex items-center gap-1"
            >
              View
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Current Balance */}
      {status === 'completed' && user?.balance !== undefined && (
        <div className="px-4 py-3 rounded-xl bg-[#4f6ef7]/10 border border-[#4f6ef7]/20">
          <p className="text-xs text-[var(--color-text-muted)]">New Balance</p>
          <p className="text-xl font-bold text-[#4f6ef7]">
            {formatCurrency(user.balance)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {status === 'completed' ? (
          <button
            onClick={handleNavigateToTrading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] transition-colors"
          >
            Start Trading
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : status === 'error' ? (
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-sm font-medium hover:bg-[var(--color-surface2)] transition-colors"
          >
            Try Again
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing...
          </div>
        )}

        <button
          onClick={handleDone}
          className="w-full py-3 rounded-xl text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text)] transition-colors"
        >
          {status === 'completed' ? 'Close' : 'I\'ll wait'}
        </button>
      </div>
    </div>
  );
};

export default CashSuccessStep;
