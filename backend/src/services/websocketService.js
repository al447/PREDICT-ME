/**
 * WebSocket Service for CLOB Real-Time Updates + Crypto Price Streaming
 * Streams order book changes and live Binance prices to connected clients.
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const Order = require('../models/Order');
const clobService = require('./clobService');
const { streamSpotPrices } = require('./binanceService');

// Connected clients map: conditionId+tokenId -> Set of WebSockets
const subscribers = new Map();

// All connected clients
const clients = new Set();

// ── Crypto price fan-out ──────────────────────────────────────────────────────
// symbol -> Set of WebSocket clients subscribed to that symbol's price stream
const priceSubscribers = new Map();
// symbol -> Binance stream handle
const priceStreams = new Map();

function subscribeToPriceStream(ws, symbol) {
  const upper = symbol.toUpperCase();
  if (!priceSubscribers.has(upper)) priceSubscribers.set(upper, new Set());
  priceSubscribers.get(upper).add(ws);

  // Start upstream Binance stream if not already running
  if (!priceStreams.has(upper)) {
    const stream = streamSpotPrices([upper], ({ symbol: sym, price, change24h }) => {
      const msg = JSON.stringify({ type: 'crypto_price_update', symbol: sym, price, change24h, ts: Date.now() });
      const subs = priceSubscribers.get(sym.toUpperCase());
      if (!subs) return;
      for (const client of subs) {
        if (client.readyState === client.OPEN) client.send(msg);
      }
    });
    priceStreams.set(upper, stream);
    console.log(`[WS] Started Binance price stream for ${upper}`);
  }

  ws._priceSymbols = ws._priceSymbols || new Set();
  ws._priceSymbols.add(upper);
}

function unsubscribeFromPriceStream(ws, symbol) {
  const upper = symbol.toUpperCase();
  const subs = priceSubscribers.get(upper);
  if (subs) {
    subs.delete(ws);
    // Close upstream stream when no subscribers remain
    if (subs.size === 0) {
      priceSubscribers.delete(upper);
      const stream = priceStreams.get(upper);
      if (stream) { stream.close(); priceStreams.delete(upper); }
      console.log(`[WS] Closed Binance price stream for ${upper} (no subscribers)`);
    }
  }
  ws._priceSymbols?.delete(upper);
}

function unsubscribeFromAllPriceStreams(ws) {
  if (!ws._priceSymbols) return;
  for (const sym of ws._priceSymbols) unsubscribeFromPriceStream(ws, sym);
  ws._priceSymbols.clear();
}

/**
 * Initialize WebSocket server
 */
function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws, req) => {
    console.log('[WS] New client connected');
    clients.add(ws);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await handleMessage(ws, message);
      } catch (err) {
        console.error('[WS] Message error:', err);
        ws.send(JSON.stringify({ error: err.message }));
      }
    });
    
    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      clients.delete(ws);
      unsubscribeFromAll(ws);
      unsubscribeFromAllPriceStreams(ws);
    });
    
    ws.on('error', (err) => {
      console.error('[WS] Error:', err);
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to PredictMe CLOB WebSocket',
    }));
  });
  
  console.log('[WS] WebSocket server initialized');
  return wss;
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(ws, message) {
  const { type, payload } = message;
  
  switch (type) {
    case 'subscribe':
      // Subscribe to order book updates for a market
      const { conditionId, tokenId } = payload;
      subscribe(ws, conditionId, tokenId);
      
      // Send initial order book
      const orderBook = await clobService.getOrderBook(conditionId, tokenId);
      ws.send(JSON.stringify({
        type: 'orderbook',
        conditionId,
        tokenId,
        data: orderBook,
      }));
      break;
      
    case 'unsubscribe':
      // Unsubscribe from a market
      unsubscribe(ws, payload.conditionId, payload.tokenId);
      break;
      
    case 'subscribe_crypto_prices': {
      const symbols = Array.isArray(payload?.symbols) ? payload.symbols : (payload?.symbol ? [payload.symbol] : []);
      for (const sym of symbols) subscribeToPriceStream(ws, sym);
      ws.send(JSON.stringify({ type: 'subscribed_crypto_prices', symbols }));
      break;
    }

    case 'unsubscribe_crypto_prices': {
      const symbols = Array.isArray(payload?.symbols) ? payload.symbols : (payload?.symbol ? [payload.symbol] : []);
      for (const sym of symbols) unsubscribeFromPriceStream(ws, sym);
      break;
    }

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
      
    default:
      ws.send(JSON.stringify({ error: `Unknown message type: ${type}` }));
  }
}

/**
 * Subscribe client to a market
 */
function subscribe(ws, conditionId, tokenId) {
  const key = `${conditionId}:${tokenId}`;
  
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  
  subscribers.get(key).add(ws);
  ws._subscriptions = ws._subscriptions || new Set();
  ws._subscriptions.add(key);
  
  console.log(`[WS] Client subscribed to ${key}`);
}

/**
 * Unsubscribe client from a market
 */
function unsubscribe(ws, conditionId, tokenId) {
  const key = `${conditionId}:${tokenId}`;
  
  if (subscribers.has(key)) {
    subscribers.get(key).delete(ws);
    if (subscribers.get(key).size === 0) {
      subscribers.delete(key);
    }
  }
  
  if (ws._subscriptions) {
    ws._subscriptions.delete(key);
  }
  
  console.log(`[WS] Client unsubscribed from ${key}`);
}

/**
 * Unsubscribe client from all markets
 */
function unsubscribeFromAll(ws) {
  if (!ws._subscriptions) return;
  
  for (const key of ws._subscriptions) {
    if (subscribers.has(key)) {
      subscribers.get(key).delete(ws);
      if (subscribers.get(key).size === 0) {
        subscribers.delete(key);
      }
    }
  }
  
  ws._subscriptions.clear();
}

/**
 * Broadcast order book update to subscribers
 */
async function broadcastOrderBookUpdate(conditionId, tokenId) {
  const key = `${conditionId}:${tokenId}`;
  
  if (!subscribers.has(key) || subscribers.get(key).size === 0) {
    return;
  }
  
  try {
    const orderBook = await clobService.getOrderBook(conditionId, tokenId);
    const message = JSON.stringify({
      type: 'orderbook_update',
      conditionId,
      tokenId,
      data: orderBook,
      timestamp: Date.now(),
    });
    
    for (const ws of subscribers.get(key)) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  } catch (err) {
    console.error('[WS] Broadcast error:', err);
  }
}

/**
 * Broadcast trade execution
 */
function broadcastTrade(trade) {
  const key = `${trade.conditionId}:${trade.tokenId}`;
  
  if (!subscribers.has(key)) return;
  
  const message = JSON.stringify({
    type: 'trade',
    data: trade,
    timestamp: Date.now(),
  });
  
  for (const ws of subscribers.get(key)) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Broadcast to all connected clients
 */
function broadcastToAll(message) {
  const data = JSON.stringify(message);
  
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Get WebSocket stats
 */
function getStats() {
  return {
    totalClients: clients.size,
    activeSubscriptions: Array.from(subscribers.entries()).map(([key, set]) => ({
      market: key,
      subscribers: set.size,
    })),
  };
}

module.exports = {
  initWebSocketServer,
  broadcastOrderBookUpdate,
  broadcastTrade,
  broadcastToAll,
  getStats,
};
