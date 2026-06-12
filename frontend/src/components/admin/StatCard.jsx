const StatCard = ({ icon: Icon, label, value, delta, deltaLabel, color = 'gold', alert = false }) => {
  const colorMap = {
    gold: 'text-[var(--color-gold)] bg-[var(--color-gold)]/10',
    green: 'text-[var(--color-green)] bg-[var(--color-green)]/10',
    red: 'text-[var(--color-red)] bg-[var(--color-red)]/10',
    blue: 'text-blue-400 bg-blue-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
  };
  const iconColor = colorMap[color] || colorMap.gold;

  return (
    <div className={`bg-[var(--color-surface2)] border rounded-xl p-3 sm:p-4 flex items-start gap-3 sm:gap-4 ${alert ? 'border-[var(--color-red)]/40' : 'border-[var(--color-border)]'}`}>
      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        {Icon && <Icon size={18} className="sm:w-5 sm:h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mb-0.5">{label}</p>
        <p className="text-lg sm:text-xl font-bold text-[var(--color-text)] truncate">{value}</p>
        {delta !== undefined && (
          <p className={`text-xs mt-0.5 ${Number(delta) >= 0 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
            {Number(delta) >= 0 ? '+' : ''}{delta} {deltaLabel || ''}
          </p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
