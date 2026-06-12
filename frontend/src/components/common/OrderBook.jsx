import { useMemo, useState } from 'react';
import { useRealtimeOrderBook } from '../../hooks/useClob';

// Convert dollars (0.01-0.99) to cents (0-100)
const toCents = (dollars) => Math.round(dollars * 100);

// Compute cumulative sizes and totals for display
const computeLevels = (orders, isAsk) => {
  let cum = 0;
  return orders.map((o) => {
    cum += o.size;
    return {
      price: toCents(o.price), // Convert $0.50 → 50¢
      size: o.size,
      cum,
      total: cum * (toCents(o.price) / 100),
    };
  });
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

  // Get conditionId and tokenId from market
  const conditionId = market?.conditionId;
  // YES token is token0, NO token is token1 for binary markets
  const yesTokenId = market?.token0;
  const noTokenId = market?.token1;

  // Use the appropriate token based on selected side
  const tokenId = side === 'yes' ? yesTokenId : noTokenId;

  // Use real-time CLOB data (WebSocket with REST fallback)
  const { orderBook, connected, usingFallback } = useRealtimeOrderBook(conditionId, tokenId);

  // YES/NO prices in cents from market data
  const yesPrice = market?.outcomes?.[0]?.price ?? market?.outcomes?.[0]?.probability ?? 50;
  const noPrice = 100 - yesPrice;
  const mid = side === 'yes' ? yesPrice : noPrice;

  // Transform CLOB data for display (convert $ to cents, compute cumulatives)
  const { asks, bids, spread, maxCum, hasOrders } = useMemo(() => {
    if (!orderBook) {
      return { asks: [], bids: [], spread: 0, maxCum: 0, hasOrders: false };
    }

    // Backend returns bids/asks with price in dollars (0.01-0.99), size in shares
    const rawBids = orderBook.bids || [];
    const rawAsks = orderBook.asks || [];

    const bids = computeLevels(rawBids, false);
    const asks = computeLevels(rawAsks, true);

    const bestAsk = asks[0]?.price;
    const bestBid = bids[0]?.price;
    const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
    const maxCum = Math.max(
      bids[bids.length - 1]?.cum || 0,
      asks[asks.length - 1]?.cum || 0
    );

    return {
      asks,
      bids,
      spread,
      maxCum,
      hasOrders: bids.length > 0 || asks.length > 0,
    };
  }, [orderBook]);

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
          {connected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">LIVE</span>
          )}
          {usingFallback && !connected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">POLLING</span>
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

      {/* Empty state for illiquid markets */}
      {!hasOrders ? (
        <div className="py-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No orders yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Be the first to place a limit order</p>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default OrderBook;
