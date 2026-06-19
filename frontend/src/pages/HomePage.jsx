import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, TrendingUp, ArrowRight, Flame, Zap, Bookmark } from "lucide-react";
const HomeCarouselChart = lazy(() => import("../components/market/HomeCarouselChart"));
import Layout from "../components/layout/Layout";
import MarketCard from "../components/market/MarketCard";
import { MarketCardSkeleton } from "../components/common/Skeleton";
// import FiveMinCryptoSection from "../components/market/FiveMinCryptoSection";
import { useMarkets, useMarket } from "../hooks/useMarkets";
import { marketsAPI } from "../services/api";
import { formatVolume } from "../utils/format";

const CAT_COLOR = {
  crypto: "#f97316", sports: "#22c55e", politics: "#3b82f6", finance: "#a855f7",
  weather: "#06b6d4", esports: "#8b5cf6", iran: "#ef4444", geopolitics: "#64748b",
  tech: "#0ea5e9", culture: "#ec4899", economy: "#10b981", elections: "#f59e0b",
};

const OUTCOME_COLORS = ["#22c55e", "#ef4444", "#f97316", "#3b82f6", "#a855f7", "#06b6d4"];

/**
 * Convert a backend price-history response ({ chartData, outcomes, marketType })
 * into the { chartData, chartLines } shape expected by HomeCarouselChart.
 */
function fromApiResponse(resp, marketOutcomes) {
  if (!resp?.chartData?.length) return null;
  const outcomeNames = resp.outcomes || [];
  if (!outcomeNames.length) return null;

  // Assign a stable color to each outcome
  const chartLines = outcomeNames.map((name, i) => {
    const lower = name.toLowerCase();
    const color = lower === 'yes' ? '#22c55e'
      : lower === 'no'  ? '#ef4444'
      : OUTCOME_COLORS[i % OUTCOME_COLORS.length];
    return { key: name, label: name, color };
  });

  return { chartData: resp.chartData, chartLines };
}

function syntheticChart(market) {
  const outcomes = market.outcomes || [];
  const pts = 20;
  // For binary Yes/No markets
  const isBinaryYN = outcomes.length === 2 && outcomes.some(o => o.name === 'Yes');
  if (isBinaryYN) {
    const yes = outcomes.find(o => o.name === 'Yes');
    const prob = Math.min(99, Math.max(1, yes?.probability ?? Math.round((yes?.price ?? 0.5) * 100)));
    const data = Array.from({ length: pts }, (_, i) => {
      const noise = (Math.random() - 0.5) * 8;
      const v = Math.min(99, Math.max(1, prob + noise * ((i / pts) * 0.7 + 0.3)));
      const d = new Date(); d.setDate(d.getDate() - (pts - i));
      return { t: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), Yes: Math.round(v), No: Math.round(100 - v) };
    });
    return { chartData: data, chartLines: [{ key: 'Yes', label: 'Yes', color: '#22c55e' }, { key: 'No', label: 'No', color: '#ef4444' }] };
  }
  // Multi-outcome (grouped) markets — use real outcome names as keys
  const shown = outcomes.slice(0, 4);
  const data = Array.from({ length: pts }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (pts - i));
    const pt = { t: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) };
    shown.forEach((o) => {
      const base = Math.min(99, Math.max(1, o.probability ?? Math.round((o.price ?? (1 / shown.length)) * 100)));
      pt[o.name] = Math.min(99, Math.max(1, base + (Math.random() - 0.5) * 6));
    });
    return pt;
  });
  return {
    chartData: data,
    chartLines: shown.map((o, i) => ({ key: o.name, label: o.name, color: OUTCOME_COLORS[i % OUTCOME_COLORS.length] })),
  };
}

const HeroCarousel = ({ markets }) => {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const [chartInfo, setChartInfo] = useState({});
  const total = Math.min(5, markets.length);
  const slide = markets[idx] || null;

  useEffect(() => {
    if (total < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % total), 7000);
    return () => clearInterval(t);
  }, [total]);

  useEffect(() => {
    if (!slide) return;
    if (chartInfo[slide.slug]) return;
    marketsAPI.getPriceHistory(slide.slug, 30)
      .then(r => {
        const built = fromApiResponse(r.data, slide.outcomes);
        setChartInfo(prev => ({ ...prev, [slide.slug]: built || syntheticChart(slide) }));
      })
      .catch(() => setChartInfo(prev => ({ ...prev, [slide.slug]: syntheticChart(slide) })));
  }, [slide?.slug]);

  if (!slide) return null;
  const catColor = CAT_COLOR[slide.categorySlug] || "#6b7280";
  const outcomes = slide.outcomes || [];
  const isBinary = outcomes.length === 2 && outcomes.some(o => o.name === "Yes");
  const chart = chartInfo[slide.slug];
  const COLORS = ["#f97316", "#3b82f6", "#a855f7"];

  return (
    <div className="rounded-2xl overflow-hidden border border-[var(--color-card-border)] flex flex-col bg-[var(--color-card)]">
      <div className="flex items-start gap-4 px-5 pt-5">
        <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden" style={{ backgroundColor: catColor + "22" }}>
          {slide.image
            ? <img src={slide.image} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = "none"; }} />
            : <div className="w-full h-full flex items-center justify-center text-2xl font-bold" style={{ color: catColor }}>{slide.title.charAt(0)}</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: catColor }}>{slide.categorySlug}</span>
            {slide.subCategory && <><span className="text-[var(--color-border)] text-xs">·</span><span className="text-[11px] text-[var(--color-text-muted)]">{slide.subCategory}</span></>}
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />LIVE
            </span>
          </div>
          <h2 className="text-base font-bold text-[var(--color-text)] leading-snug line-clamp-2">{slide.title}</h2>
        </div>
        <button className="flex-shrink-0 p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface2)] transition-colors">
          <Bookmark className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 px-5 pt-3">
        {isBinary
          ? outcomes.map((o) => {
              const pct = Math.min(99, Math.max(1, o.probability ?? Math.round((o.price ?? 0.5) * 100)));
              const isYes = o.name === "Yes";
              return (
                <button key={o.name} onClick={() => navigate(`/market/${slide.slug}`)}
                  className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97] ${isYes ? "bg-[var(--color-btn-yes)] hover:bg-[var(--color-btn-yes-hover)] text-[var(--color-btn-yes-text)]" : "bg-[var(--color-btn-no)] hover:bg-[var(--color-btn-no-hover)] text-[var(--color-btn-no-text)]"}`}>
                  <span>{o.name}</span><span className="text-[13px]">+${pct}</span>
                </button>
              );
            })
          : outcomes.slice(0, 3).map((o, i) => {
              const pct = Math.min(99, Math.max(1, o.probability ?? Math.round((o.price ?? 0) * 100)));
              return (
                <button key={o.name} onClick={() => navigate(`/market/${slide.slug}`)}
                  className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold text-sm bg-[var(--color-surface2)] hover:brightness-110 transition-all active:scale-[0.97]">
                  <span className="text-[var(--color-text)] text-xs truncate mr-1">{o.name}</span>
                  <span style={{ color: COLORS[i] }}>{pct}%</span>
                </button>
              );
            })
        }
      </div>

      <div className="flex-1 mt-2 min-h-[200px]">
        <Suspense fallback={<div className="h-52 mx-5 rounded-xl bg-[#1e2030] animate-pulse" />}>
          {chart
            ? <HomeCarouselChart data={chart.chartData} lines={chart.chartLines} />
            : <div className="h-52 mx-5 rounded-xl bg-[#1e2030] animate-pulse" />
          }
        </Suspense>
      </div>

      <div className="flex items-center justify-between px-5 py-2.5 border-t border-[var(--color-card-border)]">
        <span className="text-xs text-[var(--color-text-muted)] font-semibold">{formatVolume(slide.volume)} Vol.</span>
        <Link to={`/market/${slide.slug}`} className="text-xs text-[var(--color-gold)] font-semibold hover:underline">Trade →</Link>
      </div>

      {total > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-card-border)]">
          {/* Dots — left */}
          <div className="flex gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-5 bg-[var(--color-gold)]" : "w-1.5 bg-[var(--color-text-muted)]/30"}`} />
            ))}
          </div>
          {/* Prev + Next buttons — right */}
          <div className="flex gap-2">
            {(() => {
              const prevIdx = (idx - 1 + total) % total;
              const prevMarket = markets[prevIdx];
              return (
                <button onClick={() => setIdx(prevIdx)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface2)] hover:border-[var(--color-text-muted)] transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                  <span className="text-[12px] font-medium text-[var(--color-text)] max-w-[120px] truncate">{prevMarket?.title?.split(' ').slice(0, 3).join(' ')}</span>
                </button>
              );
            })()}
            {(() => {
              const nextIdx = (idx + 1) % total;
              const nextMarket = markets[nextIdx];
              return (
                <button onClick={() => setIdx(nextIdx)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface2)] hover:border-[var(--color-text-muted)] transition-colors">
                  <span className="text-[12px] font-medium text-[var(--color-text)] max-w-[120px] truncate">{nextMarket?.title?.split(' ').slice(0, 3).join(' ')}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ markets }) => {
  const breaking = markets.slice(0, 3).map((m, i) => {
    const yes = m.outcomes?.find(o => o.name === "Yes") || m.outcomes?.[0];
    const pct = Math.min(99, Math.max(1, yes?.probability ?? Math.round((yes?.price ?? 0.5) * 100)));
    return { rank: i + 1, title: m.title, slug: m.slug, pct, up: pct >= 50 };
  });
  const hotTopics = markets.slice(3, 8).map((m, i) => ({
    rank: i + 1,
    name: m.subCategory || m.categorySlug,
    vol: formatVolume(m.volume24hr || m.volume || 0),
    slug: m.slug,
    category: m.categorySlug,
  }));

  return (
    <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 rounded-2xl border border-[var(--color-card-border)] overflow-hidden flex flex-col bg-[var(--color-card)]">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-[var(--color-text)]">Breaking news</span>
          <Link to="/breaking" className="text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors"><ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
        <div className="space-y-3">
          {breaking.length === 0
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex gap-2 animate-pulse"><div className="w-3 h-3 bg-[var(--color-surface2)] rounded flex-shrink-0 mt-1" /><div className="flex-1 h-8 bg-[var(--color-surface2)] rounded" /></div>)
            : breaking.map(n => (
                <Link key={n.rank} to={`/market/${n.slug}`} className="flex items-start gap-2 group hover:opacity-80 transition-opacity">
                  <span className="text-xs text-[var(--color-text-muted)] w-4 flex-shrink-0 mt-0.5">{n.rank}</span>
                  <p className="flex-1 text-[12px] text-[var(--color-text)] leading-snug line-clamp-2 group-hover:text-[var(--color-gold)] transition-colors">{n.title}</p>
                  <div className="flex-shrink-0 text-right min-w-[36px]">
                    <div className="text-[12px] font-bold text-[var(--color-text)]">{n.pct}%</div>
                    <div className={`text-[10px] font-semibold ${n.up ? "text-[var(--color-green)]" : "text-[var(--color-red)]"}`}>{n.up ? "↑" : "↓"}{n.pct}%</div>
                  </div>
                </Link>
              ))
          }
        </div>
      </div>

      <div className="border-t border-[var(--color-border)]" />

      <div className="px-4 py-3 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-[var(--color-text)]">Hot topics</span>
          <Link to="/breaking" className="text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors"><ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
        <div className="space-y-2.5">
          {hotTopics.length === 0
            ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-2 animate-pulse"><div className="w-3 h-3 bg-[var(--color-surface2)] rounded flex-shrink-0" /><div className="flex-1 h-3 bg-[var(--color-surface2)] rounded" /><div className="w-14 h-3 bg-[var(--color-surface2)] rounded" /></div>)
            : hotTopics.map((t, i) => (
                <Link key={t.slug} to={`/${t.category}`} className="flex items-center gap-2 group hover:opacity-80 transition-opacity">
                  <span className="text-xs text-[var(--color-text-muted)] w-4 flex-shrink-0">{i + 1}</span>
                  <span className="flex-1 text-[12px] font-medium text-[var(--color-text)] capitalize truncate group-hover:text-[var(--color-gold)] transition-colors">{t.name}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0">{t.vol} today</span>
                  <Flame className="w-3 h-3 text-orange-400 flex-shrink-0" />
                </Link>
              ))
          }
        </div>

        <Link to="/breaking" className="mt-auto pt-4 flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-[var(--color-border)] text-[12px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors">
          Explore all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};

const HomePage = () => {
  // Carousel: top 8 by volume24hr so it shows the *current* hottest markets, not stale ones
  const { data: featData, isLoading: featLoading } = useMarkets({ sort: "volume24hr", limit: 30, status: "active" });
  const { data: trendData, isLoading: trendLoading } = useMarkets({ sort: "volume", limit: 16, status: "active" });
  // Fetch pinned carousel markets by slug so they always appear regardless of volume rank
  const { data: baseMarketData } = useMarket('pm-will-base-launch-a-token-in-2025-341');
  const allFeatured = featData?.markets || [];
  const featured = useMemo(() => {
    const filtered = allFeatured.filter(m => /world cup winner/i.test(m.title) || /base.*launch.*token/i.test(m.title));
    // If Base market wasn't in allFeatured (low volume), add it from the direct fetch
    const baseMarket = baseMarketData?.market;
    if (baseMarket && baseMarket.status === 'active' && !filtered.some(m => m.slug === baseMarket.slug)) {
      filtered.push(baseMarket);
    }
    return filtered;
  }, [allFeatured, baseMarketData]);
  const trending = trendData?.markets || [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* <FiveMinCryptoSection /> */}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--color-gold)]" /> Featured markets
            </h2>
            <Link to="/breaking" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0">
              {featLoading
                ? <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse" style={{ minHeight: 480 }} />
                : <HeroCarousel markets={featured} />
              }
            </div>
            {featLoading
              ? <div className="w-full lg:w-72 xl:w-80 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse" style={{ minHeight: 480 }} />
              : <Sidebar markets={allFeatured} />
            }
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--color-gold)]" /> Trending Markets
            </h2>
            <Link to="/breaking" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {trendLoading
              ? Array.from({ length: 8 }).map((_, i) => <MarketCardSkeleton key={i} />)
              : trending.map(m => <MarketCard key={m._id} market={m} />)
            }
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default HomePage;
