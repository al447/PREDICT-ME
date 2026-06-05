const https = require('https');

const COINGECKO_BASE = process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3';
const CACHE_TTL_MS = 60_000; // 60 second cache

const _cache = {};

// Map token symbol → CoinGecko coin id (stablecoins hardcoded at $1)
const STABLE_SYMBOLS = new Set(['USDC', 'USDCe', 'USDT', 'DAI', 'BUSD', 'USDCE']);
const SYMBOL_TO_ID = {
  ETH:   'ethereum',
  BNB:   'binancecoin',
  MATIC: 'polygon-ecosystem-token', // Polygon migrated MATIC → POL on CoinGecko
  POL:   'polygon-ecosystem-token',
  SOL:   'solana',
  ARB:   'arbitrum',
  cbBTC: 'coinbase-wrapped-btc',
  BTC:   'bitcoin',
};

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PolyBet365/1.0 (deposit-indexer)',
      },
    }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Bad JSON')); }
      });
    }).on('error', reject);
  });

/**
 * Get USD price for a token symbol.
 * Returns null if unknown.
 */
const getUsdPrice = async (symbol) => {
  const upper = symbol?.toUpperCase();
  if (!upper) return null;

  // Stablecoins always $1
  if (STABLE_SYMBOLS.has(upper)) return 1.0;

  const coingeckoId = SYMBOL_TO_ID[symbol] || SYMBOL_TO_ID[upper];
  if (!coingeckoId) return null;

  const now = Date.now();
  if (_cache[coingeckoId] && now - _cache[coingeckoId].ts < CACHE_TTL_MS) {
    return _cache[coingeckoId].price;
  }

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
    const data = await fetchJson(url);
    const price = data?.[coingeckoId]?.usd;
    if (!price || price <= 0) return null;

    // Sanity clamp to avoid oracle manipulation
    const clamped = Math.min(Math.max(price, 0.0001), 10_000_000);
    _cache[coingeckoId] = { price: clamped, ts: now };
    return clamped;
  } catch (err) {
    console.warn('[PriceFeed] CoinGecko fetch failed for', symbol, err.message);
    return null;
  }
};

/**
 * Calculate the USD value of a given raw token amount.
 */
const toUsd = async (symbol, amount) => {
  const price = await getUsdPrice(symbol);
  if (price == null) return null;
  return price * amount;
};

module.exports = { getUsdPrice, toUsd };
