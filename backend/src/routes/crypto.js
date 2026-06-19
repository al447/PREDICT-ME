/**
 * GET /api/crypto/live-prices?symbols=BTC,ETH,SOL,XRP,DOGE,BNB,HYPE
 *
 * Returns real-time USD prices for the requested symbols.
 * Source priority: Chainlink Data Feed → Binance REST (fallback).
 * HYPE is not on Chainlink — Binance only.
 */
const express = require('express');
const router = express.Router();
const { getChainlinkPrice } = require('../services/chainlinkFeed');
const { getSpotPrice } = require('../services/binanceService');

const SUPPORTED = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'HYPE', 'MATIC', 'POL', 'ADA', 'AVAX', 'LINK', 'ARB'];

router.get('/live-prices', async (req, res) => {
  try {
    const requested = req.query.symbols
      ? req.query.symbols.toUpperCase().split(',').filter(s => SUPPORTED.includes(s))
      : SUPPORTED;

    const results = await Promise.all(
      requested.map(async (symbol) => {
        // Try Chainlink first (authoritative, on-chain)
        let price = await getChainlinkPrice(symbol);
        let source = 'chainlink';

        // Fall back to Binance REST
        if (!price) {
          price = await getSpotPrice(symbol);
          source = 'binance';
        }

        return { symbol, price, source, ts: Date.now() };
      })
    );

    // 15s browser cache — fresh enough for a 5min market
    res.set('Cache-Control', 'public, max-age=15');
    res.json({ success: true, prices: results });
  } catch (err) {
    console.error('[CryptoLivePrices]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch prices' });
  }
});

module.exports = router;
