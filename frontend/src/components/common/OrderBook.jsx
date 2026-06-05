import { useMemo, useState } from 'react';
import { useOrderbook } from '../../hooks/useOrderbook';

// Deterministic seeded PRNG so the orderbook is stable per market.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Hash a string to a 32-bit int for seeding.
const hashString = (s = '') => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// Build a Polymarket-style level list for one side (visual fallback).
// Asks (sell): prices ABOVE the mid, sizes typically smaller near best.
// Bids (buy): prices BELOW the mid.
const buildLevels = (mid, side, seed, levels = 8) => {
  const rand = mulberry32(seed + (side === 'ask' ? 13 : 31));
  const out = [];
  const step = 0.5; // 0.5¢ between levels (Polymarket tick)
  for (let i = 1; i <= levels; i++) {
    const price = side === 'ask'
      ? Math.min(99, mid + i * step)
      : Math.max(1, mid - i * step);
    // Size: larger deeper in the book, with some randomness.
    const baseSize = 80 + i * 40;
    const jitter = 0.5 + rand();
    const size = Math.round(baseSize * jitter);
    out.push({ price, size });
  }
  return out;
};

const SideTab = ({ active, onClick, label, color }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
      active
        ? `text-[var(--color-text)] border-[var(--color-${color})]`
        : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
    }`}
  >
    {label}
  </button>
);

const OrderBook = ({ market }) => {
  const [side, setSide] = useState('yes');
  const slug = market?.slug;
  const { data: liveBook, isLoading: bookLoading } = useOrderbook(slug);

  // YES price (in cents). Falls back to 50¢ if missing.
  const yesPrice = market?.outcomes?.[0]?.price ?? market?.outcomes?.[0]?.probability ?? 50;
  const noPrice = 100 - yesPrice;
  const mid = side === 'yes' ? yesPrice : noPrice;

  // Use real CLOB data when available, otherwise generate visual fallback
  const { asks, bids, spread, maxCum, source } = useMemo(() => {
    // If we have live data from Polymarket CLOB, use it
    if (liveBook?.success && liveBook.source === 'polymarket-clob' && liveBook.asks?.length > 0) {
      return {
        asks: liveBook.asks,
        bids: liveBook.bids,
        spread: liveBook.spread,
        maxCum: liveBook.maxCum,
        source: 'live',
      };
    }

    // Visual fallback: deterministic generated orderbook
    if (!market) return { asks: [], bids: [], spread: 0, maxCum: 0, source: 'none' };
    const seed = hashString((market._id || market.slug || 'm') + ':' + side);

    const rawAsks = buildLevels(mid, 'ask', seed).sort((a, b) => a.price - b.price);
    const rawBids = buildLevels(mid, 'bid', seed).sort((a, b) => b.price - a.price);

    // Cumulative size from the best price outward (Polymarket convention).
    let cumAsk = 0;
    const asks = rawAsks.map((o) => {
      cumAsk += o.size;
      return { ...o, cum: cumAsk, total: cumAsk * (o.price / 100) };
    });
    let cumBid = 0;
    const bids = rawBids.map((o) => {
      cumBid += o.size;
      return { ...o, cum: cumBid, total: cumBid * (o.price / 100) };
    });

    const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
    const maxCum = Math.max(cumAsk, cumBid);
    return { asks, bids, spread, maxCum, source: 'visual' };
  }, [market, side, mid, liveBook]);

  if (!market?.outcomes) return null;

  const Row = ({ order, side: rowSide }) => {
    const barPct = maxCum > 0 ? (order.cum / maxCum) * 100 : 0;
    const isAsk = rowSide === 'ask';
    return (
      <div className="relative grid grid-cols-3 items-center py-1 px-3 text-xs font-mono hover:bg-[var(--color-surface2)]/60">
        {/* depth bar — extends from RIGHT (toward spread) for Polymarket style */}
        <div
          className={`absolute inset-y-0 right-0 ${isAsk ? 'bg-red-500/10' : 'bg-green-500/10'}`}
          style={{ width: `${barPct}%` }}
        />
        <span className={`relative z-10 font-semibold ${isAsk ? 'text-red-400' : 'text-green-400'}`}>
          {order.price.toFixed(1)}¢
        </span>
        <span className="relative z-10 text-right text-[var(--color-text)]">{order.size.toLocaleString()}</span>
        <span className="relative z-10 text-right text-[var(--color-text-muted)]">${order.total.toFixed(2)}</span>
      </div>
    );
  };

  // For asks display: best ask (lowest price) at BOTTOM next to spread.
  const asksDisplay = [...asks].slice(0, 6).reverse();
  const bidsDisplay = bids.slice(0, 6);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-[var(--color-text)]">Order Book</h3>
          {source === 'live' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">LIVE</span>
          )}
          {source === 'visual' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface2)] text-[var(--color-text-muted)]">SIMULATED</span>
          )}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Last: <span className="text-[var(--color-text)] font-semibold">{mid.toFixed(1)}¢</span>
        </div>
      </div>

      {/* YES / NO tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        <SideTab active={side === 'yes'} onClick={() => setSide('yes')} label={`Yes ${yesPrice.toFixed(0)}¢`} color="green" />
        <SideTab active={side === 'no'} onClick={() => setSide('no')} label={`No ${noPrice.toFixed(0)}¢`} color="red" />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (sell orders) */}
      <div className="py-1">
        {asksDisplay.map((o, i) => <Row key={`a-${i}`} order={o} side="ask" />)}
      </div>

      {/* Spread row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface2)]/50 border-y border-[var(--color-border)] text-xs">
        <span className="text-[var(--color-text-muted)]">Spread</span>
        <span className="font-semibold text-[var(--color-gold)] font-mono">{spread.toFixed(1)}¢</span>
      </div>

      {/* Bids (buy orders) */}
      <div className="py-1">
        {bidsDisplay.map((o, i) => <Row key={`b-${i}`} order={o} side="bid" />)}
      </div>
    </div>
  );
};

export default OrderBook;
