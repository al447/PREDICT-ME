import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AlertCircle, Info, Loader2, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { MoonPayBuyWidget } from '@moonpay/moonpay-react';
import {
  MOONPAY_METHODS,
  QUICK_AMOUNTS,
  MIN_DEPOSIT_USD,
  MAX_DEPOSIT_USD,
  estimateUsdc,
  formatCurrency,
  isSandbox,
} from '../../../lib/moonpay';
import { depositAPI } from '../../../services/api';
import toast from 'react-hot-toast';

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 30;

/**
 * Combined amount + payment step for cash deposit.
 * Shows amount selector, fee breakdown, then opens MoonPay widget directly.
 */
const CashAmountStep = ({ methodId, onBack, onSuccess, walletAddress }) => {
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(false);
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [polling, setPolling] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const pollRef = useRef(null);
  const pollCount = useRef(0);

  const method = MOONPAY_METHODS.find((m) => m.id === methodId);
  const estimate = useMemo(() => estimateUsdc(amount, methodId), [amount, methodId]);

  const widgetCurrency = isSandbox() ? 'usdc' : (paymentData?.currencyCode || 'usdc_polygon');

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((data) => {
    if (polling) return;
    setPolling(true);
    setStatusMsg('Waiting for payment confirmation…');
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      try {
        const { data: res } = await depositAPI.moonpayGetSession(data.externalTxId);
        if (res.credited) {
          stopPolling();
          setPolling(false);
          setStatusMsg('');
          onSuccess({ txId: data.externalTxId, amount: res.creditedAmountUsd || data.amount, methodId });
          return;
        }
        if (res.providerStatus === 'failed' || res.providerStatus === 'rejected') {
          stopPolling();
          setPolling(false);
          setStatusMsg('');
          toast.error('Payment was declined. Please try again.');
          return;
        }
      } catch { /* silent */ }
      if (pollCount.current >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setPolling(false);
        setStatusMsg('Payment is taking longer than expected. Your balance will update automatically once confirmed.');
      }
    }, POLL_INTERVAL_MS);
  }, [polling, stopPolling, onSuccess, methodId]);

  const handleUrlSignature = useCallback(async (url) => {
    try {
      const { data } = await depositAPI.moonpaySignUrl(url);
      return data.signature;
    } catch { return ''; }
  }, []);

  const handleContinue = async () => {
    if (amount < MIN_DEPOSIT_USD) {
      toast.error(`Minimum deposit is $${MIN_DEPOSIT_USD}`);
      return;
    }
    setLoading(true);
    try {
      const { data } = await depositAPI.moonpaySession({ amountUsd: amount, paymentMethod: methodId });
      if (data.success) {
        setPaymentData({ ...data, amount, methodId });
        setWidgetVisible(true);
      } else {
        toast.error(data.error || 'Failed to prepare payment');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to prepare payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">Pay with</p>
          <p className="text-sm font-semibold text-[var(--color-text)]">{method?.label}</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wide">PCI Compliant</span>
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
            onClick={() => setAmount(chip)}
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
            onChange={(e) => setAmount(Math.min(Math.max(parseFloat(e.target.value) || 0, 0), MAX_DEPOSIT_USD))}
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
          <span className="text-[var(--color-text-muted)] flex items-center gap-1">Processing fee <Info className="w-3 h-3" /></span>
          <span className="text-[var(--color-text)]">{estimate.feePercent}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)] flex items-center gap-1">Network fee <Info className="w-3 h-3" /></span>
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
          These fees are charged by MoonPay, not PredictMe.
          {isSandbox() && (
            <span className="block mt-1 text-[#4f6ef7]">
              Sandbox mode — use MoonPay test cards in the widget.
            </span>
          )}
        </p>
      </div>

      {/* Polling status */}
      {polling && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
          <Loader2 className="w-4 h-4 text-[#4f6ef7] animate-spin flex-shrink-0" />
          <p className="text-xs text-[var(--color-text-muted)]">{statusMsg}</p>
        </div>
      )}
      {!polling && statusMsg && (
        <p className="text-xs text-yellow-400 text-center px-2">{statusMsg}</p>
      )}

      {/* Continue Button */}
      {!polling && (
        <button
          onClick={handleContinue}
          disabled={loading || amount < MIN_DEPOSIT_USD}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>
          ) : (
            `Continue with ${method?.label}`
          )}
        </button>
      )}

      <p className="text-[10px] text-[var(--color-text-muted)] text-center leading-relaxed">
        Payment processed securely by{' '}
        <a href="https://www.moonpay.com" target="_blank" rel="noopener noreferrer" className="text-[#4f6ef7] hover:underline">MoonPay</a>.
        Card details never touch our servers.
      </p>

      {/* MoonPay Widget — opens as overlay directly from this screen */}
      {widgetVisible && paymentData && (
        <MoonPayBuyWidget
          variant="overlay"
          baseCurrencyCode={paymentData.baseCurrencyCode || 'usd'}
          baseCurrencyAmount={String(paymentData.baseCurrencyAmount || amount)}
          currencyCode={widgetCurrency}
          walletAddress={walletAddress}
          paymentMethod={methodId}
          externalTransactionId={paymentData.externalTxId}
          showWalletAddressForm={false}
          visible
          onUrlSignatureRequested={handleUrlSignature}
          onInitiateDeposit={() => setLoading(false)}
          onTransactionCompleted={() => startPolling(paymentData)}
          onClose={() => {
            setWidgetVisible(false);
            if (!polling) startPolling(paymentData);
          }}
        />
      )}
    </div>
  );
};

export default CashAmountStep;
