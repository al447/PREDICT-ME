import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, TrendingUp, Zap, ArrowRight, Bookmark } from 'lucide-react';
const HomeCarouselChart = lazy(() => import('../components/market/HomeCarouselChart'));
import Layout from '../components/layout/Layout';
import MarketCard from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/common/Skeleton';
import { useMarkets } from '../hooks/useMarkets';
import { marketsAPI } from '../services/api';

const _UNUSED = [
  {
    id: 1,
    image: '/carousel/starmer.jpg',
    title: 'Starmer out by...?',
    category: 'Politics',
    categoryTag: 'Starmer',
    slug: 'starmer-out-in-2025',
    polymarketKey: 'starmer-out',
    volume: '$23M Vol',
    endsLabel: 'Ends Dec 31, 2025',
    probBars: [
      { label: 'May 15', value: 7 },
      { label: 'May 31', value: 31 },
      { label: 'June 30', value: 49 },
      { label: 'December 31', value: 78 },
    ],
    chartLines: [
      { key: 'dec31', label: 'December 31', color: '#FF7F0E' },
      { key: 'jun30', label: 'June 30', color: '#FDC503' },
      { key: 'may31', label: 'May 31', color: '#4378FF' },
      { key: 'may15', label: 'May 15', color: '#87BFFF' },
    ],
    chartData: [
      { t: 'Apr 19', dec31: 38, jun30: 15, may31: 8, may15: 3 },
      { t: 'Apr 21', dec31: 40, jun30: 16, may31: 9, may15: 3 },
      { t: 'Apr 23', dec31: 42, jun30: 18, may31: 10, may15: 4 },
      { t: 'Apr 25', dec31: 44, jun30: 20, may31: 11, may15: 4 },
      { t: 'Apr 27', dec31: 48, jun30: 22, may31: 12, may15: 4 },
      { t: 'Apr 29', dec31: 50, jun30: 24, may31: 14, may15: 5 },
      { t: 'May 1', dec31: 55, jun30: 28, may31: 16, may15: 5 },
      { t: 'May 3', dec31: 60, jun30: 32, may31: 18, may15: 5 },
      { t: 'May 4', dec31: 62, jun30: 35, may31: 19, may15: 5 },
      { t: 'May 5', dec31: 65, jun30: 37, may31: 20, may15: 5 },
      { t: 'May 6', dec31: 68, jun30: 38, may31: 21, may15: 5 },
      { t: 'May 7', dec31: 72, jun30: 40, may31: 22, may15: 5 },
      { t: 'May 8', dec31: 74, jun30: 42, may31: 23, may15: 5 },
      { t: 'May 9', dec31: 76, jun30: 44, may31: 24, may15: 5 },
      { t: 'May 10', dec31: 78, jun30: 46, may31: 25, may15: 5 },
      { t: 'May 11', dec31: 79, jun30: 47, may31: 26, may15: 5 },
      { t: 'May 12', dec31: 80, jun30: 48, may31: 26, may15: 5 },
      { t: 'May 13', dec31: 81, jun30: 48, may31: 26, may15: 5 },
    ],
    news: [
      { source: 'The New York Times', age: '16h ago', title: 'Why Keir Starmer Remains in Deep Peril After Staving Off Calls for Resignation' },
      { source: 'BBC', age: '9h ago', title: "'Starmer and Streeting set for showdown' and 'Crisis? What crisis?'" },
      { source: 'Reuters', age: '1d ago', title: "UK's Starmer defies calls to quit, says he's getting on with governing" },
    ],
  },
  {
    id: 2,
    image: '/carousel/iran.jpg',
    title: 'US x Iran permanent peace deal by...?',
    category: 'Geopolitics',
    categoryTag: 'Iran',
    slug: 'us-x-iran-permanent-peace-deal',
    polymarketKey: 'iran-deal',
    volume: '$18M Vol',
    endsLabel: 'Ends Dec 31, 2025',
    probBars: [
      { label: 'May 15', value: 1 },
      { label: 'May 31', value: 13 },
      { label: 'June 30', value: 34 },
      { label: 'December 31', value: 62 },
    ],
    chartLines: [
      { key: 'dec31', label: 'December 31', color: '#FF7F0E' },
      { key: 'jun30', label: 'June 30', color: '#FDC503' },
      { key: 'may31', label: 'May 31', color: '#4378FF' },
      { key: 'may15', label: 'May 15', color: '#87BFFF' },
    ],
    chartData: [
      { t: 'Apr 19', dec31: 22, jun30: 8, may31: 3, may15: 1 },
      { t: 'Apr 21', dec31: 24, jun30: 9, may31: 3, may15: 1 },
      { t: 'Apr 23', dec31: 26, jun30: 10, may31: 4, may15: 1 },
      { t: 'Apr 25', dec31: 28, jun30: 12, may31: 5, may15: 1 },
      { t: 'Apr 27', dec31: 30, jun30: 14, may31: 6, may15: 1 },
      { t: 'Apr 29', dec31: 33, jun30: 16, may31: 7, may15: 1 },
      { t: 'May 1', dec31: 36, jun30: 18, may31: 8, may15: 1 },
      { t: 'May 3', dec31: 40, jun30: 22, may31: 10, may15: 1 },
      { t: 'May 4', dec31: 42, jun30: 24, may31: 11, may15: 1 },
      { t: 'May 5', dec31: 45, jun30: 26, may31: 12, may15: 1 },
      { t: 'May 6', dec31: 48, jun30: 28, may31: 12, may15: 1 },
      { t: 'May 7', dec31: 50, jun30: 30, may31: 13, may15: 1 },
      { t: 'May 8', dec31: 53, jun30: 31, may31: 13, may15: 1 },
      { t: 'May 9', dec31: 56, jun30: 32, may31: 13, may15: 1 },
      { t: 'May 10', dec31: 58, jun30: 33, may31: 13, may15: 1 },
      { t: 'May 11', dec31: 60, jun30: 34, may31: 13, may15: 1 },
      { t: 'May 12', dec31: 61, jun30: 34, may31: 13, may15: 1 },
      { t: 'May 13', dec31: 62, jun30: 34, may31: 13, may15: 1 },
    ],
    news: [
      { source: 'BBC', age: '6d ago', title: "Iran considering US proposal as Trump says war will be 'over quickly'" },
      { source: 'The New York Times', age: '13h ago', title: 'Iran War Updates: Trump Says Iran Must Make Deal or Face Renewed Attacks' },
      { source: 'Reuters', age: '1d ago', title: "Stocks edge up ahead of US-China meeting; oil rallies on US-Iran stalemate" },
    ],
  },
  {
    id: 3,
    image: '/carousel/alaves.png',
    image2: '/carousel/barcelona.png',
    title: 'Alavés vs. Barcelona',
    category: 'Sports',
    categoryTag: 'La Liga',
    slug: 'sports',
    polymarketKey: 'man-city-vs-palace',
    volume: '$5.2M Vol',
    endsLabel: 'Today',
    outcomes: [
      { label: 'Alavés', value: 8 },
      { label: 'Draw', value: 22 },
      { label: 'Barcelona', value: 70 },
    ],
    chartLines: [
      { key: 'barca', label: 'Barcelona', color: '#4378FF' },
      { key: 'alaves', label: 'Alavés', color: '#FF7F0E' },
      { key: 'draw', label: 'Draw', color: '#FDC503' },
    ],
    chartData: [
      { t: '12:00 AM', barca: 48, alaves: 28, draw: 24 },
      { t: '4:00 AM', barca: 47, alaves: 29, draw: 24 },
      { t: '8:00 AM', barca: 46, alaves: 30, draw: 24 },
      { t: '10:00 AM', barca: 46, alaves: 30, draw: 24 },
      { t: '12:00 PM', barca: 45, alaves: 31, draw: 24 },
      { t: '1:00 PM', barca: 45, alaves: 30, draw: 25 },
      { t: '2:00 PM', barca: 46, alaves: 30, draw: 24 },
      { t: '3:00 PM', barca: 47, alaves: 29, draw: 24 },
      { t: '4:00 PM', barca: 47, alaves: 30, draw: 23 },
      { t: '5:00 PM', barca: 48, alaves: 29, draw: 23 },
      { t: '6:00 PM', barca: 47, alaves: 30, draw: 23 },
      { t: '7:00 PM', barca: 47, alaves: 30, draw: 25 },
    ],
    news: [
      { source: 'ESPN', age: '2h ago', title: 'Barcelona travel to Alavés in crucial La Liga matchup' },
      { source: 'Goal', age: '4h ago', title: 'Preview: Can Alavés pull off an upset against Barcelona?' },
    ],
  },
  {
    id: 4,
    image: '/carousel/bitcoin.png',
    title: 'Bitcoin Up or Down',
    category: 'Crypto',
    categoryTag: 'Bitcoin',
    slug: 'crypto',
    polymarketKey: 'btc-5min',
    volume: '$72K Vol',
    endsLabel: '5 min market',
    outcomes: [
      { label: 'Up', value: 52 },
      { label: 'Down', value: 48 },
    ],
    chartLines: [
      { key: 'up', label: 'Up', color: '#22c55e' },
      { key: 'down', label: 'Down', color: '#ef4444' },
    ],
    chartData: [
      { t: '12:00', up: 50, down: 50 }, { t: '12:01', up: 52, down: 48 },
      { t: '12:02', up: 54, down: 46 }, { t: '12:03', up: 51, down: 49 },
      { t: '12:04', up: 49, down: 51 }, { t: '12:05', up: 53, down: 47 },
      { t: '12:06', up: 55, down: 45 }, { t: '12:07', up: 52, down: 48 },
      { t: '12:08', up: 50, down: 50 }, { t: '12:09', up: 48, down: 52 },
      { t: '12:10', up: 52, down: 48 },
    ],
    news: [
      { source: 'CoinDesk', age: '1h ago', title: 'Bitcoin holds steady above $100K as market sentiment improves' },
      { source: 'Bloomberg', age: '3h ago', title: 'BTC ETF inflows hit record as institutional demand surges' },
    ],
  },
  {
    id: 5,
    image: '/carousel/hantavirus.jpg',
    title: 'Hantavirus pandemic in 2026?',
    category: 'Health',
    categoryTag: 'Pandemic',
    slug: 'breaking',
    polymarketKey: 'hantavirus',
    volume: '$9.1M Vol',
    endsLabel: 'Ends Dec 31, 2026',
    outcomes: [
      { label: 'Yes', value: 4 },
      { label: 'No', value: 96 },
    ],
    chartLines: [
      { key: 'yes', label: 'Yes', color: '#22c55e' },
    ],
    chartData: [
      { t: 'Apr 19', yes: 2 }, { t: 'Apr 21', yes: 2 }, { t: 'Apr 23', yes: 2 },
      { t: 'Apr 25', yes: 3 }, { t: 'Apr 27', yes: 3 }, { t: 'Apr 29', yes: 3 },
      { t: 'May 1', yes: 3 }, { t: 'May 3', yes: 4 }, { t: 'May 4', yes: 5 },
      { t: 'May 5', yes: 5 }, { t: 'May 6', yes: 6 }, { t: 'May 7', yes: 5 },
      { t: 'May 8', yes: 5 }, { t: 'May 9', yes: 4 }, { t: 'May 10', yes: 4 },
      { t: 'May 11', yes: 4 }, { t: 'May 12', yes: 4 }, { t: 'May 13', yes: 4 },
    ],
    news: [
      { source: 'The New York Times', age: '2d ago', title: 'Health Officials Monitor Hantavirus Clusters in Southwest' },
      { source: 'WSJ', age: '1d ago', title: 'CDC Tracking Hantavirus Cases as Concern Grows' },
    ],
  },
  {
    id: 6,
    image: '/carousel/eurovision.png',
    title: 'Eurovision Winner 2026',
    category: 'Culture',
    categoryTag: 'Eurovision',
    slug: 'breaking',
    polymarketKey: 'eurovision',
    volume: '$616M Vol',
    endsLabel: 'Ends May 17, 2026',
    subImages: [
      { img: '/carousel/finland.png', label: 'Finland', value: 31 },
      { img: '/carousel/greece.png', label: 'Greece', value: 18 },
      { img: '/carousel/denmark.png', label: 'Denmark', value: 14 },
      { img: '/carousel/france.png', label: 'France', value: 9 },
    ],
    chartLines: [
      { key: 'finland', label: 'Finland', color: '#4378FF' },
      { key: 'greece', label: 'Greece', color: '#FF7F0E' },
      { key: 'denmark', label: 'Denmark', color: '#FDC503' },
      { key: 'france', label: 'France', color: '#87BFFF' },
    ],
    chartData: [
      { t: 'Apr 19', finland: 12, greece: 10, denmark: 8, france: 7 },
      { t: 'Apr 22', finland: 14, greece: 11, denmark: 9, france: 7 },
      { t: 'Apr 25', finland: 16, greece: 12, denmark: 10, france: 8 },
      { t: 'Apr 28', finland: 18, greece: 13, denmark: 11, france: 8 },
      { t: 'May 1', finland: 20, greece: 14, denmark: 12, france: 9 },
      { t: 'May 3', finland: 22, greece: 15, denmark: 12, france: 9 },
      { t: 'May 5', finland: 24, greece: 16, denmark: 13, france: 9 },
      { t: 'May 6', finland: 25, greece: 16, denmark: 13, france: 9 },
      { t: 'May 7', finland: 26, greece: 17, denmark: 14, france: 9 },
      { t: 'May 8', finland: 27, greece: 17, denmark: 14, france: 9 },
      { t: 'May 9', finland: 28, greece: 17, denmark: 14, france: 9 },
      { t: 'May 10', finland: 29, greece: 18, denmark: 14, france: 9 },
      { t: 'May 11', finland: 30, greece: 18, denmark: 14, france: 9 },
      { t: 'May 12', finland: 30, greece: 18, denmark: 14, france: 9 },
      { t: 'May 13', finland: 31, greece: 18, denmark: 14, france: 9 },
    ],
    news: [
      { source: 'BBC', age: '1d ago', title: 'Eurovision 2026: Finland leads betting after stunning semi-final performance' },
      { source: 'The Guardian', age: '6h ago', title: "Greece's entry gains ground ahead of grand final" },
    ],
  },
];

const fmtVol = (v) => {
  if (!v && v !== 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v}`;
};

const useBreakingAndHotTopics = () => {
  // Reuse the cached "volume" query (same key as the trending grid + carousel)
  // so this derives from existing data instead of making extra network calls.
  const { data } = useMarkets({ sort: 'volume', limit: 12 });
  const markets = data?.markets || [];

  return useMemo(() => {
    if (!markets.length) return { breaking: [], hotTopics: [] };

    // Breaking news: prefer featured markets, fall back to top volume
    const featured = markets.filter((m) => m.featured);
    const breakingList = (featured.length >= 3 ? featured : markets).slice(0, 3);
    const breaking = breakingList.map((m, i) => {
      const yesOutcome = m.outcomes?.find((o) => o.name === 'Yes') || m.outcomes?.[0];
      const pct = yesOutcome?.probability ?? yesOutcome?.price ?? 50;
      return { rank: i + 1, title: m.title, pct: `${Math.round(pct)}%`, slug: m.slug, category: m.categorySlug };
    });

    // Hot topics: top 5 by volume, deduplicated from breaking
    const breakingSlugs = new Set(breakingList.map((m) => m.slug));
    const hotTopics = markets
      .filter((m) => !breakingSlugs.has(m.slug))
      .slice(0, 5)
      .map((m) => ({
        name: m.title.length > 30 ? m.title.slice(0, 30) + '\u2026' : m.title,
        vol: `${fmtVol(m.volume)} today`,
        slug: m.slug,
        category: m.categorySlug,
      }));

    return { breaking, hotTopics };
  }, [markets]);
};

const fmtUsd = (v) => {
  if (v == null) return '—';
  if (v >= 1000) return `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
};

const OUTCOME_COLORS = ['#FDC503', '#4378FF', '#22c55e', '#ef4444', '#FF7F0E', '#87BFFF'];

const buildSlideFromMarket = (market) => {
  const outcomes = market.outcomes || [];
  const chartLines = outcomes.map((o, i) => ({
    key: o.name,
    label: o.name,
    color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
  }));
  const chartData = [
    { t: 'Now', ...Object.fromEntries(outcomes.map((o) => [o.name, Math.round(o.probability ?? o.price ?? 50)])) },
  ];
  const outcomeButtons = outcomes.slice(0, 2).map((o, i) => ({
    label: o.name,
    value: Math.round(o.probability ?? o.price ?? 50),
    color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
  }));
  return {
    id: market._id,
    title: market.title,
    image: market.image || null,
    category: market.categorySlug || '',
    endsLabel: market.expiresAt ? `Ends ${new Date(market.expiresAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Active',
    volume: fmtVol(market.volume || 0) + ' Vol',
    slug: `market/${market.slug}`,
    marketSlug: market.slug,
    outcomes: outcomeButtons,
    chartLines,
    chartData,
  };
};

// Pinned carousel slugs — these always appear first
const PINNED_SLUGS = [
  'crypto-4-will-eth-hit-5-000-by-august-2026-',
  'sports-22-masters-2026-winner-rory-mcilroy-',
  'sports-17-champions-league-final-2026-real-madrid-',
];

const FeaturedCarousel = () => {
  const [idx, setIdx] = useState(0);
  const [priceHistories, setPriceHistories] = useState({});
  const [cryptoCharts, setCryptoCharts] = useState({}); // { slug: { chartData, symbol, target, currentPrice } }
  const [insufficientDataFlags, setInsufficientDataFlags] = useState({});
  const { breaking, hotTopics } = useBreakingAndHotTopics();
  // Use the same params as HomePage's "Trending" query so React Query dedupes
  // both into a single network request instead of two.
  const { data: featuredData, isLoading } = useMarkets({ sort: 'volume', limit: 12 });

  // Show ONLY the 3 pinned markets
  const allMarkets = featuredData?.markets || [];
  const pinned = PINNED_SLUGS.map(s => allMarkets.find(m => m.slug === s)).filter(Boolean);
  const slides = pinned.map(buildSlideFromMarket);
  const total = slides.length;

  // Fetch price history (and crypto price for crypto markets) for all slides
  useEffect(() => {
    if (!slides.length) return;
    slides.forEach(slide => {
      const market = pinned.find(m => m.slug === slide.marketSlug);
      const isCrypto = market?.categorySlug === 'crypto';

      // For crypto markets, fetch real crypto price chart
      if (isCrypto && !cryptoCharts[slide.marketSlug]) {
        marketsAPI.getCryptoPriceHistory(slide.marketSlug, 30)
          .then(res => {
            if (res.data?.isCrypto && res.data?.chartData?.length > 1) {
              // Transform to carousel chart format
              const transformed = res.data.chartData.map(pt => ({
                t: pt.date,
                price: pt.price,
              }));
              setCryptoCharts(prev => ({
                ...prev,
                [slide.marketSlug]: {
                  chartData: transformed,
                  symbol: res.data.symbol,
                  target: res.data.target,
                  currentPrice: res.data.currentPrice,
                },
              }));
            }
          })
          .catch(() => {});
      }

      // Also fetch probability history (as fallback)
      if (!priceHistories[slide.marketSlug]) {
        marketsAPI.getPriceHistory(slide.marketSlug, 30)
          .then(res => {
            if (res.data?.chartData?.length > 1) {
              setPriceHistories(prev => ({ ...prev, [slide.marketSlug]: res.data.chartData }));
            }
            if (res.data?.insufficientData) {
              setInsufficientDataFlags(prev => ({ ...prev, [slide.marketSlug]: true }));
            }
          })
          .catch(() => {});
      }
    });
  }, [slides.length]);

  useEffect(() => {
    if (total === 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % total), 6000);
    return () => clearInterval(t);
  }, [total]);

  const rawSlide = slides[Math.min(idx, Math.max(0, total - 1))];
  const cryptoChart = rawSlide && cryptoCharts[rawSlide.marketSlug];

  // Build effective slide: prefer crypto chart for crypto markets
  let slide = rawSlide;
  if (rawSlide) {
    if (cryptoChart) {
      slide = {
        ...rawSlide,
        chartData: cryptoChart.chartData,
        chartLines: [{ key: 'price', label: `${cryptoChart.symbol} Price`, color: '#a855f7' }],
        isCrypto: true,
        cryptoTarget: cryptoChart.target,
        cryptoSymbol: cryptoChart.symbol,
        cryptoCurrentPrice: cryptoChart.currentPrice,
      };
    } else if (priceHistories[rawSlide.marketSlug]) {
      slide = { ...rawSlide, chartData: priceHistories[rawSlide.marketSlug] };
    }
  }
  const showInsufficientData = rawSlide && !cryptoChart && insufficientDataFlags[rawSlide.marketSlug];

  if (isLoading) {
    return (
      <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] mb-6 animate-pulse bg-[var(--color-surface)]" style={{ minHeight: 380 }}>
        <div className="h-full flex items-center justify-center text-[var(--color-text-muted)] text-sm">Loading markets...</div>
      </div>
    );
  }

  if (!slide) {
    return (
      <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] mb-6 bg-[var(--color-surface)]" style={{ minHeight: 200 }}>
        <div className="h-full flex items-center justify-center text-[var(--color-text-muted)] text-sm p-8">No active markets yet. Create markets in the admin panel to show them here.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-[var(--color-border)] mb-6 flex flex-col lg:flex-row" style={{ backgroundColor: 'var(--color-surface)' }}>

      {/* ── LEFT PANEL (main market) ── */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: 380 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col h-full"
          >
            {/* Market header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="relative flex-shrink-0">
                {slide.image ? (
                  <img
                    src={slide.image}
                    alt={slide.title}
                    className="w-12 h-12 rounded-xl object-cover bg-[var(--color-surface2)]"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-gold)]/10 flex items-center justify-center text-xl">📊</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-[var(--color-text)] leading-tight truncate">{slide.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 capitalize">{slide.category} · {slide.endsLabel}</p>
              </div>
              <button className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] transition-colors flex-shrink-0">
                <Bookmark className="w-4 h-4" />
              </button>
            </div>

            {/* Bet buttons */}
            <div className="flex gap-2 px-5 pb-3">
              {slide.outcomes.map((o, i) => (
                <Link
                  key={o.label}
                  to={`/${slide.slug}`}
                  className={`flex-1 text-center py-2 rounded-xl font-bold text-sm border transition-colors ${
                    i === 0
                      ? 'bg-[var(--color-gold)]/15 border-[var(--color-gold)]/40 text-[var(--color-gold)] hover:bg-[var(--color-gold)]/25'
                      : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  {o.label} <span style={{ color: i === 0 ? undefined : o.color }}>{o.value}%</span>
                </Link>
              ))}
            </div>

            {/* Full-width chart */}
            <div className="flex-1 relative">
              <Suspense fallback={<div className="h-[200px] bg-[var(--color-surface2)] rounded-lg animate-pulse" />}>
                <HomeCarouselChart data={slide.chartData} lines={slide.chartLines} isCrypto={slide.isCrypto} target={slide.cryptoTarget} />
              </Suspense>
              {showInsufficientData && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-[var(--color-surface2)]/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                  Price chart will populate as trading activity occurs
                </div>
              )}
            </div>

            {/* Footer: volume + slide dots + nav */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)]">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">{slide.volume}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setIdx((i) => (i - 1 + total) % total)} className="p-1 rounded-full bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex gap-1.5">
                  {slides.map((_, i) => (
                    <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-5 bg-[var(--color-gold)]' : 'w-1.5 bg-[var(--color-text-muted)]/40'}`} />
                  ))}
                </div>
                <button onClick={() => setIdx((i) => (i + 1) % total)} className="p-1 rounded-full bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <Link to={`/${slide.slug}`} className="text-xs text-[var(--color-gold)] font-semibold hover:underline">Trade →</Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── RIGHT PANEL (Breaking news + Hot topics) ── */}
      <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--color-border)] flex flex-col">
        {/* Breaking news */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[var(--color-text)]">Breaking news</span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </div>
          <div className="space-y-3">
            {breaking.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <span className="w-4 h-3 bg-[var(--color-surface2)] rounded" />
                    <div className="flex-1 h-3 bg-[var(--color-surface2)] rounded" />
                    <div className="w-8 h-3 bg-[var(--color-surface2)] rounded" />
                  </div>
                ))
              : breaking.map((n) => (
                  <Link key={n.rank} to={n.slug ? `/market/${n.slug}` : '/breaking'} className="flex items-start gap-3 hover:opacity-80 transition-opacity">
                    <span className="text-xs text-[var(--color-text-muted)] w-4 flex-shrink-0 mt-0.5">{n.rank}</span>
                    <p className="flex-1 text-xs text-[var(--color-text)] leading-snug line-clamp-2">{n.title}</p>
                    <span className="text-xs font-bold text-[var(--color-gold)] flex-shrink-0">{n.pct}</span>
                  </Link>
                ))
            }
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] mx-4 my-2" />

        {/* Hot topics */}
        <div className="px-4 pb-2 flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[var(--color-text)]">Hot topics</span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </div>
          <div className="space-y-2.5">
            {hotTopics.length === 0
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <span className="w-4 h-3 bg-[var(--color-surface2)] rounded" />
                    <div className="flex-1 h-3 bg-[var(--color-surface2)] rounded" />
                    <div className="w-16 h-3 bg-[var(--color-surface2)] rounded" />
                  </div>
                ))
              : hotTopics.map((t, i) => (
                  <Link key={t.slug || t.name} to={t.slug ? `/market/${t.slug}` : `/${t.category || 'breaking'}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <span className="text-xs text-[var(--color-text-muted)] w-4 flex-shrink-0">{i + 1}</span>
                    <span className="flex-1 text-xs font-medium text-[var(--color-text)] truncate">{t.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{t.vol}</span>
                    <span className="text-red-400 text-xs flex-shrink-0">🔥</span>
                  </Link>
                ))
            }
          </div>
        </div>

        {/* Explore all */}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)]">
          <Link to="/breaking">
            <button className="w-full py-2 rounded-xl bg-[var(--color-surface2)] text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors">
              Explore all
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

const HomePage = () => {
  const { data: trendingData, isLoading: trendingLoading } = useMarkets({ sort: 'volume', limit: 12 });
  const { data: newData } = useMarkets({ sort: 'newest', limit: 6 });
  const trending = trendingData?.markets || [];
  const newMarkets = newData?.markets || [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
              <Zap className="w-5 h-5 text-[var(--color-gold)]" /> Featured Markets
            </h2>
          </div>
          <FeaturedCarousel />
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[var(--color-gold)]" /> Trending Markets
            </h2>
            <Link to="/crypto" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {trendingLoading
              ? Array.from({ length: 8 }).map((_, i) => <MarketCardSkeleton key={i} />)
              : trending.map((market) => <MarketCard key={market._id} market={market} />)
            }
          </div>
        </section>

        {newMarkets.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                🆕 New Markets
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {newMarkets.map((market) => <MarketCard key={market._id} market={market} />)}
            </div>
          </section>
        )}

      </div>

    </Layout>
  );
};

export default HomePage;
