import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

const MarkdownPreview = ({ value, onChange, placeholder = 'Write markdown...', rows = 6 }) => {
  const [tab, setTab] = useState('write');

  return (
    <div>
      <div className="flex gap-2 mb-2">
        {['write', 'preview'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${tab === t ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'}`}>
            {t}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">{value?.length || 0}/5000</span>
      </div>
      {tab === 'write' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
          className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] resize-none" />
      ) : (
        <div className="min-h-[120px] bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-muted)] prose prose-invert prose-sm max-w-none">
          {value ? (
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{value}</ReactMarkdown>
          ) : (
            <span className="italic">Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
};

export default MarkdownPreview;
