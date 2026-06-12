/**
 * useCryptoPriceStream — live Binance mini-ticker prices via backend WebSocket proxy.
 *
 * Connects to the backend WebSocket and subscribes to Binance mini-ticker updates
 * for the given symbols. Falls back to silent no-op if WebSocket is unavailable.
 *
 * Usage:
 *   const prices = useCryptoPriceStream(['BTC', 'ETH', 'SOL']);
 *   // prices = { BTC: { price: 67234.12, change24h: 2.4 }, ... }
 *
 * NOTE: These prices are for DISPLAY only. Settlement uses Chainlink Data Streams.
 */

import { useState, useEffect, useRef } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5000`;

const useCryptoPriceStream = (symbols = []) => {
  const [prices, setPrices] = useState({});
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!symbols.length) return;

    const connect = () => {
      if (!mountedRef.current) return;
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'subscribe_crypto_prices', symbols }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type !== 'crypto_price_update') return;
            const { symbol, price, change24h } = msg;
            if (!symbol || price == null) return;
            setPrices((prev) => ({ ...prev, [symbol]: { price, change24h } }));
          } catch { /* ignore malformed */ }
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          reconnectTimer.current = setTimeout(connect, 5_000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimer.current = setTimeout(connect, 5_000);
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  return prices;
};

export default useCryptoPriceStream;
