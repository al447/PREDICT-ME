import { Link, useLocation } from 'react-router-dom';

const categories = [
  { name: 'Trending', slug: '/', highlight: false, isHome: true },
  { name: 'New', slug: 'breaking', highlight: true },
  { name: 'Crypto', slug: 'crypto' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Weather', slug: 'weather' },
  { name: 'Politics', slug: 'politics' },
  { name: 'Finance', slug: 'finance' },
];

const CategoryNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="border-b border-[var(--color-border)] sticky top-16 z-30" style={{ backgroundColor: 'var(--color-bg)', backdropFilter: 'none' }}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-1.5">
          {categories.map(({ name, slug, highlight, isHome }) => {
            const active = isHome ? pathname === '/' : pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
            return (
              <Link
                key={slug}
                to={isHome ? '/' : `/${slug}`}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0
                  ${active
                    ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold)] border border-[var(--color-gold)]/30'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)]'
                  }
                `}
              >
                {name}
                {highlight && !active && pathname === '/' && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default CategoryNav;
