import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Heart, TrendingUp, Clock, ExternalLink } from 'lucide-react';
import { lazy, Suspense } from 'react';
import Layout from '../components/layout/Layout';
import RewardsBadge from '../components/market/RewardsBadge';
import ShareEmbed from '../components/common/ShareEmbed';
import OrderBook from '../components/common/OrderBook';
import MarketList from '../components/market/MarketList';
import TradingPanel from '../components/market/TradingPanel';
import Skeleton from '../components/common/Skeleton';

const MarketChart = lazy(() => import('../components/market/MarketChart'));
import { useMarket, useMarkets } from '../hooks/useMarkets';
import useFavorites from '../hooks/useFavorites';
import { formatVolume, formatDate } from '../utils/format';

const MarketDetailPage = () => {
  const { slug } = useParams();
  const { data, isLoading } = useMarket(slug);
  const market = data?.market;
  const { toggleFavorite, isFavorited } = useFavorites();
  const { data: relatedData } = useMarkets({ category: market?.categorySlug, limit: 5 });
  const related = relatedData?.markets?.filter((m) => m.slug !== slug) || [];

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Skeleton height="h-8" className="w-2/3 mb-4" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton height="h-64" />
              <Skeleton height="h-48" />
            </div>
            <Skeleton height="h-80" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!market) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Market not found</h1>
          <Link to="/" className="text-[var(--color-gold)]">Go home</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 overflow-x-hidden">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-4">
          <Link to="/" className="hover:text-[var(--color-gold)]">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to={`/${market.categorySlug}`} className="hover:text-[var(--color-gold)] capitalize">{market.categorySlug}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[var(--color-text)] truncate max-w-xs">{market.title}</span>
        </div>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0 w-14 h-14 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
              {market.image || '📊'}
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] mb-2 leading-tight">{market.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-muted)]">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>{formatVolume(market.volume)} Vol.</span>
                </div>
                {market.endDate && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>Ends {formatDate(market.endDate)}</span>
                  </div>
                )}
                {market.rewards > 0 && <RewardsBadge percent={market.rewards} />}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ShareEmbed market={market} />
            <button
              onClick={() => toggleFavorite(market._id)}
              className={`p-2 rounded-lg border transition-colors ${isFavorited(market._id) ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-500/50'}`}
            >
              <Heart className={`w-4 h-4 ${isFavorited(market._id) ? 'fill-red-400' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <Suspense fallback={<div className="h-[300px] animate-pulse bg-[var(--color-surface2)] rounded-lg" />}>
              <MarketChart market={market} />
            </Suspense>

            <OrderBook market={market} />

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <h3 className="font-semibold text-[var(--color-text)] mb-3">About this market</h3>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{market.description}</p>
              {market.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {market.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-1 rounded-full bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {market.newsLinks?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Related News</h4>
                  <div className="space-y-2">
                    {market.newsLinks.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors group">
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="flex-1 truncate">{link.source}: {link.title}</span>
                        <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{link.timestamp}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {related.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">Related Markets</h2>
                <MarketList markets={related.slice(0, 4)} columns={2} />
                <div className="mt-4 text-center">
                  <Link to={`/${market.categorySlug}`} className="text-sm text-[var(--color-gold)] hover:underline">
                    View more {market.categorySlug} markets →
                  </Link>
                </div>
              </section>
            )}
          </div>

          {/* Trading panel - hidden on mobile (shown in bottom sheet instead), visible on desktop */}
          <div className="lg:col-span-1 order-last lg:order-none">
            <div className="hidden lg:block">
              <TradingPanel market={market} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MarketDetailPage;
