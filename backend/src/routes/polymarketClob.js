const express = require('express');
const router = express.Router();
const Market = require('../models/Market');

const CLOB_BASE = process.env.CLOB_API_URL || 'https://clob.polymarket.com';

/**
 * GET /api/polymarket-clob/orderbook/:marketSlug
 * Returns live orderbook from Polymarket CLOB if market has polymarketTokenId.
 * Falls back to empty orderbook if not mapped.
 */
router.get('/orderbook/:marketSlug', async (req, res, next) => {
  try {
    const { marketSlug } = req.params;
    const market = await Market.findOne({ slug: marketSlug }).lean();

    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }

    // If no Polymarket mapping, return empty to trigger visual fallback
    if (!market.polymarketTokenId) {
      return res.json({
        success: true,
        source: 'none',
        marketSlug,
        asks: [],
        bids: [],
        lastPrice: market.outcomes?.[0]?.price || 50,
      });
    }

    // Fetch from Polymarket CLOB
    const response = await fetch(`${CLOB_BASE}/book/${market.polymarketTokenId}`);
    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform to our format (prices are 0-1 in Polymarket, convert to cents 0-100)
    const asks = (data.asks || [])
      .filter(a => parseFloat(a.price) > 0)
      .map(a => ({
        price: Math.round(parseFloat(a.price) * 100 * 10) / 10, // Convert to cents with 1 decimal
        size: parseFloat(a.size),
      }))
      .sort((a, b) => a.price - b.price) // Best ask (lowest) first
      .slice(0, 6);

    const bids = (data.bids || [])
      .filter(b => parseFloat(b.price) > 0)
      .map(b => ({
        price: Math.round(parseFloat(b.price) * 100 * 10) / 10,
        size: parseFloat(b.size),
      }))
      .sort((a, b) => b.price - a.price) // Best bid (highest) first
      .slice(0, 6);

    // Calculate cumulative totals
    let cumAsk = 0;
    const asksWithCum = asks.map(o => {
      cumAsk += o.size;
      return { ...o, cum: cumAsk, total: cumAsk * (o.price / 100) };
    });

    let cumBid = 0;
    const bidsWithCum = bids.map(o => {
      cumBid += o.size;
      return { ...o, cum: cumBid, total: cumBid * (o.price / 100) };
    });

    const maxCum = Math.max(cumAsk, cumBid);
    const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
    const lastPrice = data.last_trade_price
      ? Math.round(parseFloat(data.last_trade_price) * 100)
      : (market.outcomes?.[0]?.price || 50);

    res.json({
      success: true,
      source: 'polymarket-clob',
      marketSlug,
      tokenId: market.polymarketTokenId,
      asks: asksWithCum,
      bids: bidsWithCum,
      spread,
      maxCum,
      lastPrice,
      timestamp: data.timestamp,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/polymarket-clob/markets
 * List markets that have Polymarket token IDs mapped
 */
router.get('/mapped-markets', async (req, res, next) => {
  try {
    const markets = await Market.find(
      { polymarketTokenId: { $exists: true, $ne: null } },
      { title: 1, slug: 1, polymarketTokenId: 1, conditionId: 1, categorySlug: 1 }
    ).lean();

    res.json({
      success: true,
      count: markets.length,
      markets,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
