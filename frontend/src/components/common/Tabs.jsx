import { motion } from 'framer-motion';

const Tabs = ({ tabs, activeTab, onTabChange, className = '' }) => {
  return (
    <div className={`flex gap-1 bg-[var(--color-surface2)] rounded-xl p-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.value || tab}
          onClick={() => onTabChange(tab.value || tab)}
          className={`relative flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap
            ${(tab.value || tab) === activeTab
              ? 'text-[var(--color-text)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
        >
          {(tab.value || tab) === activeTab && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]"
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            />
          )}
          <span className="relative z-10">{tab.label || tab}</span>
        </button>
      ))}
    </div>
  );
};

export default Tabs;
