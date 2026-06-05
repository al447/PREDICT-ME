import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const DataTable = ({ columns, data, page, pages, onPageChange, loading, emptyMessage = 'No data found' }) => {
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
              {columns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="text-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--color-gold)] mx-auto" />
              </td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center py-12 text-[var(--color-text-muted)]">
                {emptyMessage}
              </td></tr>
            ) : data.map((row, i) => (
              <tr key={row._id || i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface2)]/50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-[var(--color-text)] align-middle">
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm">
          <span className="text-[var(--color-text-muted)] text-xs sm:text-sm">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
              className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i;
              if (p < 1 || p > pages) return null;
              return (
                <button key={p} onClick={() => onPageChange(p)}
                  className={`w-8 h-8 rounded-lg border text-sm transition-all ${p === page ? 'bg-[var(--color-gold)] border-[var(--color-gold)] text-black font-bold' : 'border-[var(--color-border)] hover:bg-[var(--color-surface2)]'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => onPageChange(page + 1)} disabled={page >= pages}
              className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
