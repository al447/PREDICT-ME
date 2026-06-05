import { Shield, Lock } from 'lucide-react';

const CoinbaseIntro = ({ onContinue, onBack }) => {
  return (
    <div className="space-y-4">
      {/* Coinbase logo */}
      <div className="flex justify-center py-4">
        <div className="w-16 h-16 rounded-2xl bg-[#0052FF] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
      </div>

      {/* Main text */}
      <div className="text-center">
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          PolyBet365 will use a 3rd party to connect your Coinbase account.
        </p>
      </div>

      {/* Bullet points */}
      <div className="space-y-3 py-2">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              Your credentials are never stored
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              All data is encrypted between Fun.xyz and Coinbase.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              2FA always required
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Transfers cannot be made without your approval first.
            </p>
          </div>
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className="w-full py-3 rounded-xl bg-[#0052FF] text-white font-semibold hover:bg-[#0044cc] transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default CoinbaseIntro;
