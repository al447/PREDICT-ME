import { useState } from 'react';
import { Share2, Link2, Code2, Twitter, Check } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import toast from 'react-hot-toast';

const ShareEmbed = ({ market, trigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const url = `${window.location.origin}/market/${market?.slug}`;
  const embedCode = `<iframe src="${window.location.origin}/embed/${market?.slug}" width="400" height="200" frameborder="0"></iframe>`;
  const tweetText = `I just bet on "${market?.title}" on PolyBet365! Join me: ${url}`;

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success('Copied!');
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)}>
        {trigger || (
          <button className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Share & Embed" size="md">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">Market URL</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                className="flex-1 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)]"
              />
              <Button variant="secondary" size="sm" onClick={() => copy(url, 'url')}>
                {copied === 'url' ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">Embed Code</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={embedCode}
                className="flex-1 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] font-mono"
              />
              <Button variant="secondary" size="sm" onClick={() => copy(embedCode, 'embed')}>
                {copied === 'embed' ? <Check className="w-4 h-4 text-green-400" /> : <Code2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank')}
            >
              <Twitter className="w-4 h-4" /> Share on Twitter
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ShareEmbed;
