import { ChevronRight } from 'lucide-react';
import { EXCHANGES } from '../../../lib/exchanges';

// Exchange icons as simple SVG components
const ExchangeIcon = ({ id }) => {
  const icons = {
    coinbase: (
      <div className="w-8 h-8 rounded-lg bg-[#0052FF] flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-9h2v6h-2v-6z"/>
        </svg>
      </div>
    ),
    bybit: (
      <div className="w-8 h-8 rounded-lg bg-[#F7A600] flex items-center justify-center">
        <span className="text-black font-bold text-xs">BB</span>
      </div>
    ),
    binance: (
      <div className="w-8 h-8 rounded-lg bg-[#F3BA2F] flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-black" fill="currentColor">
          <path d="M12 2L6 8h4v8H6l6 6 6-6h-4V8h4l-6-6z"/>
        </svg>
      </div>
    ),
    kraken: (
      <div className="w-8 h-8 rounded-lg bg-[#5B47FB] flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
        </svg>
      </div>
    ),
    gemini: (
      <div className="w-8 h-8 rounded-lg bg-[#00DCFA] flex items-center justify-center">
        <span className="text-black font-bold text-xs">G</span>
      </div>
    ),
    gate: (
      <div className="w-8 h-8 rounded-lg bg-[#2354E6] flex items-center justify-center">
        <span className="text-white font-bold text-xs">GT</span>
      </div>
    ),
  };
  return icons[id] || <div className="w-8 h-8 rounded-lg bg-gray-500" />;
};

const ExchangeList = ({ onSelect, balanceDisplay = '$0.00' }) => {
  const handleSelect = (exchange) => {
    if (!exchange.active) return;
    onSelect(exchange.id);
  };

  return (
    <div className="space-y-3">
      {/* Exchange list */}
      <div className="space-y-2">
        {EXCHANGES.map((exchange) => (
          <button
            key={exchange.id}
            onClick={() => handleSelect(exchange)}
            disabled={!exchange.active}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
              exchange.active
                ? 'border-[var(--color-border)] hover:border-[var(--color-gold)]/50 hover:bg-[var(--color-surface2)] cursor-pointer'
                : 'border-[var(--color-border)]/50 opacity-60 cursor-not-allowed'
            }`}
          >
            <ExchangeIcon id={exchange.id} />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-[var(--color-text)]">
                {exchange.name}
              </p>
              {exchange.active && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {exchange.description}
                </p>
              )}
            </div>
            {exchange.comingSoon ? (
              <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-[var(--color-surface2)] text-[var(--color-text-muted)]">
                Coming Soon
              </span>
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExchangeList;
