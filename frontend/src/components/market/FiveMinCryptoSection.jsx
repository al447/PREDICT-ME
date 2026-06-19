/**
 * FiveMinCryptoSection
 *
 * Displays the "5 Min Crypto" grid matching the screenshot:
 * - BTC, ETH, SOL, XRP, DOGE, HYPE, BNB cards
 * - Each shows arc gauge + Up/Down buttons + live price
 * - Real-time prices from Chainlink (via backend) + Binance WebSocket stream
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, Bookmark, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cryptoAPI } from '../../services/api';
import useCryptoPriceStream from '../../hooks/useCryptoPriceStream';
import { useMarkets } from '../../hooks/useMarkets';

const FIVE_MIN_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'HYPE', 'BNB'];

const COIN_META = {
  BTC:  { name: 'Bitcoin',     color: '#f7931a', icon: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  ETH:  { name: 'Ethereum',    color: '#627eea', icon: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  SOL:  { name: 'Solana',      color: '#9945ff', icon: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  XRP:  { name: 'XRP',         color: '#00aae4', icon: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
  DOGE: { name: 'Dogecoin',    color: '#c2a633', icon: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
  BNB:  { name: 'BNB',         color: '#f3ba2f', icon: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
  HYPE: { name: 'Hyperliquid', color: '#00e5c3', icon: 'https://assets.coingecko.com/coins/images/36557/small/hyperliquid.png' },
};

const fmtPrice = (v) => {
  if (v == null) return '—';
  if (v >= 10000) return `$${(v / 1000).toFixed(1)}K`;
  if (v >= 1000) return `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
};

// Countdown to next 5-min boundary
function useCountdown() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const next = Math.ceil(now / 300_000) * 300_000;
      setSecs(Math.max(0, Math.round((next - now) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// SVG arc gauge — matches MarketCard style
const ArcGauge = ({ pct, color = '#4ade80' }) => {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const filled = arcLen * (Math.min(Math.max(pct, 0), 100) / 100);
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="flex-shrink-0 -rotate-[135deg]">
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-border)" strokeWidth="3.5"
        strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
    </svg>
  );
};

// Individual 5-min crypto card
const FiveMinCard = ({ market, livePrice, change24h }) => {
  const symbol = market.priceSymbol || 'BTC';
  const meta = COIN_META[symbol] || COIN_META.BTC;
  const upPct = market.outcomes?.[0]?.probability ?? 50;
  const hasLive = livePrice != null;
  const isUp = (change24h ?? 0) >= 0;

  // Format change
  const changePct = change24h != null ? Math.abs(change24h).toFixed(2) : null;

  return (
    <Link
      to={`/market/${market.slug}`}
      className="bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl p-4 flex flex-col gap-3 hover:border-[var(--color-card-border-hover)] transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="relative w-9 h-9 flex-shrink-0">
          <img
            src={meta.icon}
            alt={symbol}
            className="w-9 h-9 rounded-lg object-cover"
            onError={e => {
              e.target.style.display = 'none';
            }}
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ background: meta.color }}>
            <span className="text-[7px] font-black text-white">{symbol[0]}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-[var(--color-text)] group-hover:text-[var(--color-gold)] transition-colors leading-tight">
            {market.title}
          </h3>
          {/* Live price row */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-bold text-red-500">LIVE</span>
            {hasLive && (
              <>
                <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                <span className="text-[10px] font-semibold text-[var(--color-text)]">
                  {fmtPrice(livePrice)}
                </span>
                {changePct && (
                  <span className={`text-[10px] font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? '+' : '-'}{changePct}%
                  </span>
                )}
              </>
            )}
            {!hasLive && (
              <span className="text-[10px] text-[var(--color-text-muted)]">· {meta.name}</span>
            )}
          </div>
        </div>

        {/* Arc gauge */}
        <div className="relative flex items-center justify-center flex-shrink-0">
          <ArcGauge pct={upPct} color="#4ade80" />
          <div className="absolute text-center leading-none">
            <div className="text-[11px] font-bold text-[var(--color-text)]">{upPct}%</div>
            <div className="text-[9px] text-[var(--color-green)] font-medium mt-0.5">Up</div>
          </div>
        </div>
      </div>

      {/* Up / Down buttons */}
      <div className="flex gap-2">
        <button
          onClick={e => e.preventDefault()}
          className="flex-1 py-2 rounded-lg text-[12px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: 'rgba(34,197,94,0.20)', border: '1px solid rgba(34,197,94,0.5)', color: '#4ade80' }}
        >
          Up
        </button>
        <button
          onClick={e => e.preventDefault()}
          className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: 'rgba(239,68,68,0.20)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171' }}
        >
          Down
        </button>
      </div>
    </Link>
  );
};

// Skeleton card while loading
const CardSkeleton = () => (
  <div className="bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl p-4 animate-pulse">
    <div className="flex items-start gap-2.5 mb-3">
      <div className="w-9 h-9 rounded-lg bg-[var(--color-surface2)]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 bg-[var(--color-surface2)] rounded w-3/4" />
        <div className="h-2.5 bg-[var(--color-surface2)] rounded w-1/2" />
      </div>
      <div className="w-12 h-12 rounded-full bg-[var(--color-surface2)]" />
    </div>
    <div className="flex gap-2">
      <div className="flex-1 h-8 bg-[var(--color-surface2)] rounded-lg" />
      <div className="flex-1 h-8 bg-[var(--color-surface2)] rounded-lg" />
    </div>
  </div>
);

const FiveMinCryptoSection = () => {
  const countdown = useCountdown();

  // Fetch the 5min markets from backend
  const { data, isLoading } = useMarkets({
    category: 'crypto',
    tag: '5-minute-crypto',
    limit: 10,
    status: 'active',
  });

  // Initial prices from Chainlink/Binance REST (on mount + every 30s)
  const { data: priceData, isLoading: priceLoading } = useQuery({
    queryKey: ['crypto-live-prices', FIVE_MIN_SYMBOLS.join(',')],
    queryFn: async () => {
      const res = await cryptoAPI.getLivePrices(FIVE_MIN_SYMBOLS);
      const map = {};
      for (const p of res.data?.prices ?? []) {
        if (p.price) map[p.symbol] = p.price;
      }
      return map;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
  });

  // Live WebSocket stream (Binance) — updates every second
  const wsSymbols = useMemo(() => FIVE_MIN_SYMBOLS, []);
  const wsPrices = useCryptoPriceStream(wsSymbols);

  // Merged prices: WS takes priority over REST
  const prices = useMemo(() => {
    const merged = { ...(priceData || {}) };
    for (const [sym, data] of Object.entries(wsPrices)) {
      if (data?.price) merged[sym] = data.price;
    }
    return merged;
  }, [priceData, wsPrices]);

  const markets = data?.markets ?? [];

  // Match market to symbol
  const marketBySymbol = useMemo(() => {
    const map = {};
    for (const m of markets) {
      if (m.priceSymbol) map[m.priceSymbol] = m;
    }
    return map;
  }, [markets]);

  // Ordered display: follow FIVE_MIN_SYMBOLS order
  const orderedMarkets = useMemo(() =>
    FIVE_MIN_SYMBOLS.map(s => marketBySymbol[s]).filter(Boolean),
    [marketBySymbol]
  );

  if (!isLoading && orderedMarkets.length === 0) return null;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          5 Min Crypto
          <span className="ml-1 text-[11px] font-mono bg-[var(--color-surface2)] text-[var(--color-text-muted)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
            {countdown}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            <Search className="w-4 h-4" />
          </button>
          <button className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => <CardSkeleton key={i} />)
          : orderedMarkets.map(m => (
              <FiveMinCard
                key={m._id}
                market={m}
                livePrice={prices[m.priceSymbol]}
                change24h={wsPrices[m.priceSymbol]?.change24h ?? null}
              />
            ))
        }
      </div>
    </section>
  );
};

export default FiveMinCryptoSection;
