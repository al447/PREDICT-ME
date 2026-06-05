const express = require('express');
const router = express.Router();

const GAMMA_API = process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com';
const CLOB_API = process.env.CLOB_API_URL || 'https://clob.polymarket.com';

// Proxy: Get events by tag/category
router.get('/events', async (req, res, next) => {
  try {
    const { tag, limit = 10, active = true, closed = false } = req.query;
    const params = new URLSearchParams({ limit, active, closed });
    if (tag) params.append('tag', tag);
    params.append('order', 'volume24hr');
    params.append('ascending', 'false');

    const response = await fetch(`${GAMMA_API}/events?${params}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Proxy: Get single event by slug
router.get('/events/:slug', async (req, res, next) => {
  try {
    const response = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(req.params.slug)}`);
    const data = await response.json();
    res.json(data?.[0] || null);
  } catch (error) {
    next(error);
  }
});

// Proxy: Get price history for a market token
router.get('/prices-history', async (req, res, next) => {
  try {
    const { market, interval = 'all', fidelity = 30 } = req.query;
    if (!market) return res.status(400).json({ error: 'market token ID required' });
    if (!/^[a-f0-9x]+$/i.test(market)) return res.status(400).json({ error: 'Invalid market token ID format' });
    const safeInterval = ['all', '1d', '1w', '1m'].includes(interval) ? interval : 'all';
    const safeFidelity = Math.min(100, Math.max(1, parseInt(fidelity) || 30));

    const response = await fetch(
      `${CLOB_API}/prices-history?market=${encodeURIComponent(market)}&interval=${safeInterval}&fidelity=${safeFidelity}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Proxy: Batch prices history (multiple tokens at once)
router.post('/prices-history/batch', async (req, res, next) => {
  try {
    const { markets, interval = '1w', fidelity = 30 } = req.body;
    if (!markets || !Array.isArray(markets)) {
      return res.status(400).json({ error: 'markets array required' });
    }

    const results = await Promise.all(
      markets.filter(tokenId => /^[a-f0-9x]+$/i.test(tokenId)).map(async (tokenId) => {
        try {
          const safeInterval = ['all', '1d', '1w', '1m'].includes(interval) ? interval : '1w';
          const safeFidelity = Math.min(100, Math.max(1, parseInt(fidelity) || 30));
          const response = await fetch(
            `${CLOB_API}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${safeInterval}&fidelity=${safeFidelity}`
          );
          const data = await response.json();
          return { tokenId, history: data.history || [] };
        } catch {
          return { tokenId, history: [] };
        }
      })
    );

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Proxy: Search markets
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q) return res.status(400).json({ error: 'query required' });
    const response = await fetch(`${GAMMA_API}/search?query=${encodeURIComponent(q)}&limit=${limit}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Proxy: Get crypto price history
router.get('/crypto/price-history', async (req, res, next) => {
  try {
    const { symbol, variant = 'fiveminute' } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const params = new URLSearchParams({
      symbol,
      variant,
      eventStartTime: start.toISOString(),
      endDate: now.toISOString(),
    });
    const response = await fetch(`https://polymarket.com/api/crypto/price-history?${params}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
