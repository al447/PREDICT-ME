import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const TokenCircle = ({ label, color, size = 18 }) => (
  <div
    style={{ background: color, width: size, height: size, minWidth: size }}
    className="rounded-full flex items-center justify-center text-white font-bold"
    title={label}
  >
    <span style={{ fontSize: size * 0.45, lineHeight: 1 }}>{label[0]}</span>
  </div>
);

/**
 * Generic single-select dropdown.
 * items: [{ id, label, color? }]
 * value: selected id
 * onChange: (id) => void
 * label: shown above (optional)
 * rightLabel: shown above right (optional)
 */
const Dropdown = ({ items, value, onChange, label, rightLabel, className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = items.find((i) => i.id === value) || items[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`relative ${className}`} ref={ref}>
      {(label || rightLabel) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>}
          {rightLabel && <span className="text-xs text-[var(--color-text-muted)]">{rightLabel}</span>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] hover:border-[#4f6ef7]/50 transition-colors text-sm text-[var(--color-text)]"
      >
        {selected?.color && <TokenCircle label={selected.label} color={selected.color} />}
        <span className="flex-1 text-left font-medium">{selected?.label || '—'}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onChange(item.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--color-surface2)] transition-colors text-sm text-left"
            >
              {item.color && <TokenCircle label={item.label} color={item.color} />}
              <span className={`flex-1 ${item.id === value ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>
                {item.label}
              </span>
              {item.id === value && <Check className="w-3.5 h-3.5 text-[#4f6ef7]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
