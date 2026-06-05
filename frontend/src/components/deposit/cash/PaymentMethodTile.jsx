import { CreditCard, Apple, Smartphone, Building2, ChevronRight } from 'lucide-react';

/**
 * Single payment method row tile (Polymarket-style)
 * Shows icon, label, limit text, and chevron
 */
const PaymentMethodTile = ({ method, onClick, popular = false }) => {
  const { id, label, limit, upcoming } = method;

  // Icon mapping
  const getIcon = () => {
    switch (id) {
      case 'credit_debit_card':
        return <CreditCard className={`w-5 h-5 ${upcoming ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`} />;
      case 'apple_pay':
        return <Apple className={`w-5 h-5 ${upcoming ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`} />;
      case 'google_pay':
        return <Smartphone className={`w-5 h-5 ${upcoming ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`} />;
      case 'revolut_pay':
        return <Building2 className={`w-5 h-5 ${upcoming ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`} />;
      default:
        return <CreditCard className={`w-5 h-5 ${upcoming ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`} />;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={upcoming}
      className={`w-full flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-border)] transition-all group ${
        upcoming
          ? 'bg-[var(--color-surface)]/50 cursor-not-allowed opacity-70'
          : 'bg-[var(--color-surface)] hover:border-[#4f6ef7]/50 hover:bg-[var(--color-surface2)]/40'
      }`}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        upcoming ? 'bg-[var(--color-surface2)]/50' : 'bg-[var(--color-surface2)]'
      }`}>
        {getIcon()}
      </div>

      {/* Label + limit */}
      <div className="flex-1 text-left">
        <p className={`text-sm font-semibold ${upcoming ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}>
          {label}
          {popular && !upcoming && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#4f6ef7]/10 text-[#4f6ef7]">
              Popular
            </span>
          )}
          {upcoming && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-surface2)] text-[var(--color-text-muted)]">
              Coming soon
            </span>
          )}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {upcoming ? 'Available soon' : `$${limit.toLocaleString('en-US', { minimumFractionDigits: 2 })} limit · Instant`}
        </p>
      </div>

      {/* Chevron - hidden for upcoming */}
      {!upcoming && (
        <ChevronRight className="w-5 h-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors" />
      )}
    </button>
  );
};

export default PaymentMethodTile;
