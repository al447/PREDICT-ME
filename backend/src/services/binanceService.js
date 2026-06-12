/**
 * Binance Service — display data only (NEVER used for settlement).
 *
 * Provides:
 *  - getSpotPrice(symbol)           : latest price from REST (deposit valuation UI)
 *  - getKlines(symbol, interval, limit) : OHLCV candles for chart history
 *  - streamSpotPrices(symbols, onUpdate) : WebSocket mini-ticker stream for live UI prices
 *
 * All data from this module is for DISPLAY purposes only.
 * Settlement prices are sourced exclusively from Chainlink Data Streams / Data Feeds.
 *
 * Endpoints used (no auth required):
 *   REST : https://data-api.binance.vision/api/v3/...
 *   WS   : wss://data-stream.binance.vision/ws/...
 */

const https = require('https');
const { EventEmitter } = require('events');

const BINANCE_REST_BASE = process.env.BINANCE_REST_BASE || 'https://data-api.binance.vision/api/v3';
const BINANCE_WS_BASE = process.env.BINANCE_WS_BASE || 'wss://data-stream.binance.vision/ws';

const CACHE_TTL_MS = 10_000; // 10s for spot prices
const _spotCache = {};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'PredictMe/1.0 (binance-display)' },
    }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        if (res.statusCode !== 200)
          return reject(new Error(`Binance HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Binance: bad JSON')); }
      });
    }).on('error', reject);
  });

/** Normalize a symbol to Binance pair, e.g. BTC → BTCUSDT */
const toBinancePair = (symbol) => {
  const upper = symbol?.toUpperCase();
  if (!upper) return null;
  if (upper.endsWith('USDT') || upper.endsWith('USDC') || upper.endsWith('BTC')) return upper;
  return `${upper}USDT`;
};

// ── REST API ─────────────────────────────────────────────────────────────────

/**
 * Get the latest spot price for a symbol (display / deposit valuation only).
 * Returns null if unavailable.
 */
const getSpotPrice = async (symbol) => {
  const pair = toBinancePair(symbol);
  if (!pair) return null;

  const now = Date.now();
  if (_spotCache[pair] && now - _spotCache[pair].ts < CACHE_TTL_MS) {
    return _spotCache[pair].price;
  }

  try {
    const data = await fetchJson(`${BINANCE_REST_BASE}/ticker/price?symbol=${pair}`);
    const price = parseFloat(data?.price);
    if (!price || price <= 0) return null;
    _spotCache[pair] = { price, ts: now };
    return price;
  } catch (err) {
    console.warn(`[Binance] getSpotPrice(${pair}) failed:`, err.message);
    return null;
  }
};

/**
 * Get OHLCV klines for a symbol.
 * interval: '1m' | '5m' | '1h' | '4h' | '1d' | '1w'
 * limit   : number of candles (max 1000)
 * Returns array of { t, open, high, low, close, volume } or null on failure.
 */
const getKlines = async (symbol, interval = '1d', limit = 90) => {
  const pair = toBinancePair(symbol);
  if (!pair) return null;

  const safeLimit = Math.min(Math.max(1, limit), 1000);
  const url = `${BINANCE_REST_BASE}/klines?symbol=${pair}&interval=${interval}&limit=${safeLimit}`;

  try {
    const raw = await fetchJson(url);
    if (!Array.isArray(raw)) return null;
    return raw.map((k) => ({
      t: k[0],            // open time ms
      open:  parseFloat(k[1]),
      high:  parseFloat(k[2]),
      low:   parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.warn(`[Binance] getKlines(${pair}, ${interval}) failed:`, err.message);
    return null;
  }
};

/**
 * Map a UI time-range label to a Binance kline interval + limit.
 * Matches the plan spec exactly: 1H→1m, 6H→5m, 1D→15m, 1W→1h, 1M→4h, ALL→1d.
 */
const RANGE_TO_INTERVAL = {
  '1H':  { interval: '1m',  limit: 60  },
  '6H':  { interval: '5m',  limit: 72  },
  '1D':  { interval: '15m', limit: 96  },
  '1W':  { interval: '1h',  limit: 168 },
  '1M':  { interval: '4h',  limit: 180 },
  'ALL': { interval: '1d',  limit: 365 },
};

/**
 * Get aggregate price history suitable for a chart.
 * `range` can be a UI range key ('1H','6H','1D','1W','1M','ALL') or a days number.
 * Returns [{ t, date, fullDate, price }] formatted for MarketChart, or null.
 */
const getChartHistory = async (symbol, rangeOrDays = 30) => {
  let interval, limit;

  if (typeof rangeOrDays === 'string' && RANGE_TO_INTERVAL[rangeOrDays]) {
    ({ interval, limit } = RANGE_TO_INTERVAL[rangeOrDays]);
  } else {
    // Fallback: numeric days → reasonable interval
    const days = parseInt(rangeOrDays, 10) || 30;
    if (days <= 1)       { interval = '15m'; limit = 96;  }
    else if (days <= 7)  { interval = '1h';  limit = 168; }
    else if (days <= 30) { interval = '4h';  limit = 180; }
    else if (days <= 90) { interval = '1d';  limit = 90;  }
    else                 { interval = '1d';  limit = Math.min(days, 365); }
  }

  const klines = await getKlines(symbol, interval, limit);
  if (!klines?.length) return null;

  return klines.map((k) => ({
    t: k.t,
    date: new Date(k.t).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    fullDate: new Date(k.t).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    price: Math.round(k.close * 100) / 100,
  }));
};

/**
 * Get the closing price of the kline containing a specific timestamp.
 * Used for settlement reference — NOTE: for display purposes only.
 * `timestampMs` is a Unix millisecond timestamp.
 * Returns the close price (number) or null.
 */
const getKlineAt = async (symbol, timestampMs) => {
  const pair = toBinancePair(symbol);
  if (!pair || !timestampMs) return null;
  // Fetch a 1-hour kline starting 1h before the target time
  const startTime = timestampMs - 3600_000;
  const url = `${BINANCE_REST_BASE}/klines?symbol=${pair}&interval=1h&startTime=${startTime}&endTime=${timestampMs + 3600_000}&limit=2`;
  try {
    const raw = await fetchJson(url);
    if (!Array.isArray(raw) || !raw.length) return null;
    // Find the kline whose open time <= timestampMs < close time
    const kline = raw.find((k) => k[0] <= timestampMs && timestampMs < k[6]) || raw[raw.length - 1];
    return parseFloat(kline[4]); // close price
  } catch (err) {
    console.warn(`[Binance] getKlineAt(${pair}, ${timestampMs}) failed:`, err.message);
    return null;
  }
};

// ── WebSocket stream ──────────────────────────────────────────────────────────

/**
 * Stream live mini-ticker prices for an array of symbols.
 * Calls onUpdate({ symbol, price, change24h }) for each update.
 * Returns an EventEmitter with a .close() method to stop the stream.
 *
 * Uses the public Binance stream endpoint — no API key required.
 */
const streamSpotPrices = (symbols, onUpdate) => {
  const emitter = new EventEmitter();
  let ws = null;
  let reconnectTimer = null;
  let closed = false;

  const pairs = symbols
    .map(toBinancePair)
    .filter(Boolean)
    .map((p) => `${p.toLowerCase()}@miniTicker`);

  if (!pairs.length) return emitter;

  const streams = pairs.join('/');
  const url = `${BINANCE_WS_BASE}/${streams}`;

  const connect = () => {
    if (closed) return;
    let WS;
    try { WS = require('ws'); } catch { return; } // ws package not available

    ws = new WS(url);

    ws.on('open', () => {
      console.log(`[Binance WS] Connected to ${pairs.length} stream(s)`);
      emitter.emit('open');
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        // Single stream wraps in { data: {...} }, combined wraps differently
        const ticker = msg.data || msg;
        if (!ticker?.s) return;
        const price = parseFloat(ticker.c);
        const open24h = parseFloat(ticker.o);
        const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
        const symbol = ticker.s.replace(/USDT$|USDC$/, '');
        onUpdate({ symbol, price, change24h });
      } catch { /* ignore malformed frames */ }
    });

    ws.on('close', () => {
      if (closed) return;
      console.warn('[Binance WS] Disconnected, reconnecting in 5s…');
      reconnectTimer = setTimeout(connect, 5_000);
    });

    ws.on('error', (err) => {
      console.warn('[Binance WS] Error:', err.message);
      // close event will trigger reconnect
    });
  };

  emitter.close = () => {
    closed = true;
    clearTimeout(reconnectTimer);
    ws?.terminate?.();
    ws?.close?.();
  };

  connect();
  return emitter;
};

module.exports = { getSpotPrice, getKlines, getChartHistory, getKlineAt, streamSpotPrices, toBinancePair, RANGE_TO_INTERVAL };
