import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, Shield, Loader2 } from 'lucide-react';
import { MoonPayBuyWidget } from '@moonpay/moonpay-react';
import { depositAPI } from '../../../services/api';
import { isSandbox } from '../../../lib/moonpay';
import toast from 'react-hot-toast';

/**
 * MoonPay embedded widget payment step.
 * Card / Apple Pay / Google Pay fields are fully hosted by MoonPay — zero PCI scope for us.
 * Crediting is handled exclusively via the verified MoonPay webhook (source of truth).
 * Client-side onTransactionCompleted is UX-only (reflects credit in UI immediately after webhook).
 */
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 30; // 2 min

const CashPayStep = ({ paymentData, onBack, onSuccess }) => {
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const pollRef = useRef(null);
  const pollCount = useRef(0);

  const { externalTxId, amount, methodLabel, paymentMethod } = paymentData;

  // MoonPay sandbox only supports base-chain currencies (usdc/eth); usdc_polygon
  // returns "Currency not supported in test mode". Force usdc in sandbox so the
  // widget loads; live uses the real Polygon USDC from the backend session.
  const widgetCurrency = isSandbox() ? 'usdc' : (paymentData.currencyCode || 'usdc_polygon');

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(() => {
    if (polling) return;
    setPolling(true);
    setStatusMsg('Waiting for payment confirmation…');
    pollCount.current = 0;

    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      try {
        const { data } = await depositAPI.moonpayGetSession(externalTxId);
        if (data.credited) {
          stopPolling();
          setPolling(false);
          setStatusMsg('');
          onSuccess({
            txId: externalTxId,
            amount: data.creditedAmountUsd || amount,
            methodId: paymentMethod,
          });
          return;
        }
        if (data.providerStatus === 'failed' || data.providerStatus === 'rejected') {
          stopPolling();
          setPolling(false);
          setStatusMsg('');
          toast.error('Payment was declined. Please try again.');
          return;
        }
      } catch {
        // silent — keep polling
      }
      if (pollCount.current >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setPolling(false);
        setStatusMsg('Payment is taking longer than expected. Your balance will update automatically once confirmed.');
      }
    }, POLL_INTERVAL_MS);
  }, [externalTxId, amount, paymentMethod, polling, stopPolling, onSuccess]);

  const handleUrlSignature = useCallback(async (url) => {
    try {
      const { data } = await depositAPI.moonpaySignUrl(url);
      return data.signature;
    } catch (err) {
      console.error('[MoonPay] URL sign error:', err);
      return '';
    }
  }, []);

  const handleOpen = () => {
    setLoading(true);
    setWidgetVisible(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          disabled={polling}
          className="p-2 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">Secure Checkout</p>
          <p className="text-sm font-semibold text-[var(--color-text)]">{methodLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wide">PCI Compliant</span>
        </div>
      </div>

      {/* Amount summary */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
        <span className="text-sm text-[var(--color-text-muted)]">Amount</span>
        <span className="text-sm font-semibold text-[var(--color-text)]">${Number(amount).toFixed(2)} USD</span>
      </div>

      {/* Sandbox notice */}
      {isSandbox() && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
          <p className="text-xs text-blue-400">
            Sandbox — use MoonPay test cards inside the payment widget.
          </p>
        </div>
      )}

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

      {/* Open Widget Button */}
      {!polling && !widgetVisible && (
        <button
          onClick={handleOpen}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            `Pay $${Number(amount).toFixed(2)} with MoonPay`
          )}
        </button>
      )}

      {/* Embedded MoonPay Widget */}
      {widgetVisible && (
        <MoonPayBuyWidget
          variant="overlay"
          baseCurrencyCode={paymentData.baseCurrencyCode || 'usd'}
          baseCurrencyAmount={String(paymentData.baseCurrencyAmount || amount)}
          currencyCode={widgetCurrency}
          walletAddress={paymentData.walletAddress}
          paymentMethod={paymentMethod}
          externalTransactionId={externalTxId}
          showWalletAddressForm={false}
          visible
          onUrlSignatureRequested={handleUrlSignature}
          onInitiateDeposit={() => {
            setLoading(false);
          }}
          onTransactionCompleted={() => {
            startPolling();
          }}
          onClose={() => {
            setWidgetVisible(false);
            setLoading(false);
            if (!polling) {
              startPolling();
            }
          }}
        />
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--color-text-muted)] text-center leading-relaxed">
        Payment processed securely by{' '}
        <a href="https://www.moonpay.com" target="_blank" rel="noopener noreferrer" className="text-[#4f6ef7] hover:underline">MoonPay</a>.
        Card details never touch our servers.
      </p>
    </div>
  );
};

export default CashPayStep;
