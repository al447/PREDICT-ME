import { useState } from 'react';

const PRESETS = ['📊', '📈', '📉', '🏆', '⚽', '🏀', '🎾', '🪙', '💰', '🌍', '🌡️', '🌧️', '🗳️', '🏛️', '📰', '⚡', '🚀', '🎯', '💎', '🎲', '🎮', '🎬', '🎵', '🎨', '🐶', '🐱', '🦅', '🌙', '☀️', '⭐', '🔥', '💧'];

const EmojiPicker = ({ value, onChange }) => {
  const [useUrl, setUseUrl] = useState(value && !PRESETS.includes(value));

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl flex items-center justify-center text-2xl">
          {value || '📊'}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setUseUrl(false)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${!useUrl ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'}`}>
            Emoji
          </button>
          <button type="button" onClick={() => setUseUrl(true)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${useUrl ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'}`}>
            URL
          </button>
        </div>
      </div>

      {useUrl ? (
        <input type="text" value={useUrl ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder="https://example.com/image.png"
          className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]" />
      ) : (
        <div className="grid grid-cols-8 gap-1.5 p-3 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl max-h-32 overflow-y-auto">
          {PRESETS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => onChange(emoji)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-[var(--color-border)] transition-all ${value === emoji ? 'bg-[var(--color-gold)]/20 ring-1 ring-[var(--color-gold)]' : ''}`}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmojiPicker;
