import { Link } from 'react-router-dom';
import { Twitter, Github, MessageCircle } from 'lucide-react';
import Logo from '../../assets/Logo';

const Footer = () => {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Logo size={36} showText={false} />
              <span className="font-black text-sm tracking-wide" style={{ background: 'linear-gradient(135deg, #FFD700, #D4AF37)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                PolyBet365
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              The World's Premier Prediction Market.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[var(--color-text)] mb-3">Markets</h4>
            <ul className="space-y-2">
              {['Crypto', 'Sports', 'Politics', 'Finance', 'Weather', 'News'].map((cat) => (
                <li key={cat}>
                  <Link to={`/${cat.toLowerCase()}`} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors">
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[var(--color-text)] mb-3">Platform</h4>
            <ul className="space-y-2">
              {[
                { label: 'How it works', to: '/' },
                { label: 'Rewards', to: '/' },
                { label: 'Leaderboard', to: '/' },
                { label: 'API', to: '/' },
              ].map(({ label, to }) => (
                <li key={label}>
                  <Link to={to} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-[var(--color-text)] mb-3">Company</h4>
            <ul className="space-y-2">
              {['About', 'Blog', 'Careers', 'Terms', 'Privacy', 'Support'].map((item) => (
                <li key={item}>
                  <Link to="/" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center sm:text-left">
            © 2026 PolyBet365. All rights reserved. For entertainment purposes only.
          </p>
          <div className="flex items-center gap-3">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:bg-[var(--color-surface2)] transition-colors">
              <Twitter className="w-4 h-4" />
            </a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:bg-[var(--color-surface2)] transition-colors">
              <Github className="w-4 h-4" />
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:bg-[var(--color-surface2)] transition-colors">
              <MessageCircle className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
