import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, Activity, Trophy, LayoutDashboard, Gift } from 'lucide-react';

const categories = [
  { name: 'Trending',    slug: '/',           isHome: true  },
  { name: 'Breaking',    slug: 'breaking',    isNew: true   },
  { name: 'New',         slug: 'new'                        },
  { name: 'Politics',    slug: 'politics'                   },
  { name: 'Sports',      slug: 'sports'                     },
  { name: 'Crypto',      slug: 'crypto'                     },
  { name: 'Esports',     slug: 'esports'                    },
  { name: 'Iran',        slug: 'iran'                       },
  { name: 'Finance',     slug: 'finance'                    },
  { name: 'Geopolitics', slug: 'geopolitics'                },
  { name: 'Tech',        slug: 'tech'                       },
  { name: 'Culture',     slug: 'culture'                    },
  { name: 'Economy',     slug: 'economy'                    },
  { name: 'Weather',     slug: 'weather'                    },
  { name: 'Elections',   slug: 'elections'                  },
];

const moreItems = [
  { name: 'Activity',    slug: '/activity',    Icon: Activity          },
  { name: 'Leaderboard', slug: '/leaderboard', Icon: Trophy            },
  { name: 'Dashboards',  slug: '/',            Icon: LayoutDashboard   },
  { name: 'Rewards',     slug: '/rewards',     Icon: Gift              },
];

const CategoryNav = () => {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <nav className="border-b border-[var(--color-border)] sticky top-16 z-30" style={{ backgroundColor: 'var(--color-bg)', backdropFilter: 'none' }}>
      <div className="max-w-7xl mx-auto px-4 flex items-center">
        {/* Scrollable category list */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-1.5 flex-1 min-w-0">
          {categories.map(({ name, slug, isHome, isNew }) => {
            const active = isHome ? pathname === '/' : pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
            return (
              <Link
                key={slug}
                to={isHome ? '/' : `/${slug}`}
                className={`
                  flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0
                  ${active
                    ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold)] border border-[var(--color-gold)]/30'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)]'
                  }
                `}
              >
                {name}
                {isNew && !active && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              </Link>
            );
          })}
        </div>

        {/* More — always pinned at right edge, never scrolls away */}
        <div
          className="relative flex-shrink-0 pl-2 py-1.5"
          style={{ backgroundImage: 'linear-gradient(to right, transparent, var(--color-bg) 30%)' }}
          ref={moreRef}
        >
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all
              ${moreOpen
                ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold)] border border-[var(--color-gold)]/30'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)]'
              }`}
          >
            More
            {moreOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl py-1 z-50">
              {moreItems.map(({ name, slug, Icon }) => (
                <Link
                  key={name}
                  to={slug}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default CategoryNav;
