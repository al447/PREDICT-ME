import { QRCodeSVG } from 'qrcode.react';
import { Info, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const BybitCheckout = ({ amount, checkoutUrl, onContinueInBrowser, onBack }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Parse fee from URL or use default
  const fee = amount * 0.007; // 0.7% fee (typical)
  const total = amount + fee;

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
          Deposit ${amount.toFixed(2)}
        </h3>
      </div>

      {/* From/To */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#F7A600] flex items-center justify-center">
            <span className="text-black font-bold text-xs">BB</span>
          </div>
          <span className="text-sm text-[var(--color-text)]">Bybit</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text)]">PolyBet365</span>
          <div className="w-6 h-6 rounded bg-[var(--color-gold)] flex items-center justify-center">
            <span className="text-black text-xs font-bold">P</span>
          </div>
          <Info className="w-4 h-4 text-[var(--color-text-muted)]" />
        </div>
      </div>

      {/* Amount row */}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text-muted)]">Amount</span>
        <span className="text-sm font-semibold text-[var(--color-text)]">${total.toFixed(2)}</span>
      </div>

      {/* Breakdown toggle */}
      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        Click to see breakdown
        <Info className="w-3 h-3" />
        <ChevronDown className={`w-3 h-3 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
      </button>

      {showBreakdown && (
        <div className="p-3 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">Deposit amount</span>
            <span className="text-[var(--color-text)]">${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">Network fee</span>
            <span className="text-[var(--color-text)]">${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-[var(--color-border)]">
            <span className="text-[var(--color-text)]">Total</span>
            <span className="text-[var(--color-text)]">${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* QR Code */}
      <div className="flex flex-col items-center py-4">
        <div className="p-4 bg-white rounded-xl">
          <QRCodeSVG
            value={checkoutUrl || 'https://bybit.com'}
            size={200}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-3">
          Scan the QR code with your phone
        </p>
      </div>

      {/* Or divider */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--color-border)]" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)]">or</span>
        </div>
      </div>

      {/* Continue in browser */}
      <button
        onClick={onContinueInBrowser}
        className="w-full py-3 rounded-xl bg-[#6000EA] text-white font-semibold hover:bg-[#5000c8] transition-colors"
      >
        Continue in browser
      </button>
    </div>
  );
};

export default BybitCheckout;
