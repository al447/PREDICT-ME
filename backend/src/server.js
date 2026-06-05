require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const path = require('path');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
require('./config/passport');

const errorHandler = require('./middleware/errorHandler');
const compression = require('compression');

// Global API rate limiter: 200 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// Strict limiter for auth endpoints: 20 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

// Trade limiter: 60 trades per minute per IP
const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many trade requests, please slow down.' },
});

const app = express();
app.set('trust proxy', 1);

// Enable gzip compression for all responses
app.use(compression());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com', process.env.CLOB_API_URL || 'https://clob.polymarket.com', 'https://polymarket.com'],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const ALLOWED_ORIGINS = [
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
  ]),
  // Production Vercel deployment
  'https://polybet365-live.vercel.app',
  // Support both env var names (FRONTEND_URL or CLIENT_URL)
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/$/, '')] : []),
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL.replace(/\/$/, '')] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const clean = origin.replace(/\/$/, '');
      if (ALLOWED_ORIGINS.includes(clean)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(cookieParser());
app.use(passport.initialize());

// MoonPay webhook requires raw body for signature verification
// Mount BEFORE express.json()
const getRawBody = require('raw-body');
const contentType = require('content-type');

app.use('/api/deposits/moonpay/webhook', async (req, res, next) => {
  try {
    req.rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: contentType.parse(req).parameters.charset || 'utf8',
    });
    next();
  } catch (err) {
    next(err);
  }
}, require('./routes/depositsWebhook'));

// Fun.xyz (Funkit) webhook requires raw body for signature verification
app.use('/api/deposits/exchange/webhook', async (req, res, next) => {
  try {
    req.rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: contentType.parse(req).parameters.charset || 'utf8',
    });
    next();
  } catch (err) {
    next(err);
  }
}, require('./routes/depositsWebhook'));

app.use(express.json());

app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/markets', require('./routes/markets'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/trades', tradeLimiter, require('./routes/trades'));
app.use('/api/users', require('./routes/users'));
app.use('/api/polymarket', require('./routes/polymarket'));
app.use('/api/polymarket-clob', require('./routes/polymarketClob'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/admin/referral', require('./routes/adminReferral'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/deposits', require('./routes/deposits'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/onchain', require('./routes/onchain'));
app.use('/api/relayer', require('./routes/relayer'));
app.use('/api/clob', require('./routes/clob'));
app.use('/api/payments', require('./routes/payments'));

// Serve uploaded files statically — relax CORP for cross-origin image embedding
app.use('/uploads', helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }), express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const { snapshotAllActiveMarkets } = require('./services/priceSnapshotService');
const depositIndexer = require('./services/depositIndexer');

// Hourly cron job: snapshot all active market prices for transparent chart history
const HOURLY_MS = 60 * 60 * 1000;
const startPriceSnapshotCron = () => {
  // Run immediately on startup, then every hour
  snapshotAllActiveMarkets().catch(err => console.error('[Cron] Initial snapshot failed:', err.message));
  setInterval(() => {
    snapshotAllActiveMarkets().catch(err => console.error('[Cron] Hourly snapshot failed:', err.message));
  }, HOURLY_MS);
  console.log('[Cron] Price snapshot job scheduled every hour');
};

// Start the HTTP server immediately so the platform health check and /api/health
// respond without waiting for the database. This minimizes cold-start wake time
// on hosts that spin down idle instances (e.g. Render free tier). Mongoose buffers
// queries until the connection is ready, so early requests still resolve.
const httpServer = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});

// Initialize WebSocket server for CLOB real-time updates
const websocketService = require('./services/websocketService');
websocketService.initWebSocketServer(httpServer);

connectDB()
  .then(() => {
    startPriceSnapshotCron();
    // Start automated deposit indexer (if INDEXER_ENABLED=true)
    depositIndexer.start();
  })
  .catch((err) => {
    console.error('[Startup] Database connection failed:', err.message);
  });
