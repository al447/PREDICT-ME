const NodeCache = require('node-cache');

// Default: 60s TTL, check expired keys every 2 minutes
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120, useClones: false });

/**
 * GET-only response cache middleware.
 * Skips caching if request is authenticated (presence of Authorization header)
 * to avoid serving private data to other users.
 */
const cacheMiddleware = (ttlSeconds = 60) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.headers.authorization) return next(); // skip personalized requests

  const key = req.originalUrl;
  const hit = cache.get(key);
  if (hit) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(hit);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, body, ttlSeconds);
    }
    res.setHeader('X-Cache', 'MISS');
    return originalJson(body);
  };
  next();
};

const invalidateCache = (substring) => {
  cache.keys()
    .filter(k => k.includes(substring))
    .forEach(k => cache.del(k));
};

const flushCache = () => cache.flushAll();

module.exports = { cacheMiddleware, invalidateCache, flushCache };
