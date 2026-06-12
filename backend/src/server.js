require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
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
  'https://predictme-live.vercel.app',
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
      encoding: contentType.parse(req.headers['content-type'] || 'application/json').parameters.charset || 'utf8',
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
app.use('/api/bridge',   require('./routes/bridge'));
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
const marketSyncService = require('./services/marketSyncService');
const { resolveExpiredPriceMarkets } = require('./services/priceMarketResolver');
const balanceSyncService = require('./services/balanceSyncService');
const proxyDepositWatcher   = require('./services/proxyDepositWatcher');
const depositWatcherService = require('./services/depositWatcherService');
const { startBridgeCompletionPoller } = require('./services/sweepService');

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

// Price Market Resolver cron: auto-resolve expired crypto price markets via Chainlink.
// PRICE_RESOLVER_* vars are canonical; CHAINLINK_AUTO_RESOLVE_* kept as aliases.
const RESOLVER_ENABLED =
  process.env.PRICE_RESOLVER_ENABLED === 'true' ||
  process.env.CHAINLINK_AUTO_RESOLVE_ENABLED === 'true';
const RESOLVER_INTERVAL_MS = parseInt(
  process.env.PRICE_RESOLVER_INTERVAL_MS ||
  process.env.CHAINLINK_AUTO_RESOLVE_INTERVAL_MS ||
  '900000', 10
);

/**
 * Phase 1H: Operator on-chain readiness self-check
 * Logs operator address, balances, and approval status on startup
 */
async function runOperatorSelfCheck() {
  try {
    const { ethers } = require('ethers');
    const { ADDRESSES, ABIS, RPC_URL, getOperatorKey } = require('./config/contracts');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const operatorKey = getOperatorKey();
    const operator = new ethers.Wallet(operatorKey, provider);
    const operatorAddress = operator.address;

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          OPERATOR SELF-CHECK (Phase 1H)                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`Operator Address: ${operatorAddress}`);

    // Check MATIC balance
    const maticBalance = await provider.getBalance(operatorAddress);
    const maticFormatted = ethers.formatEther(maticBalance);
    const hasMatic = maticBalance >= ethers.parseEther('0.1');
    console.log(`MATIC Balance: ${maticFormatted} ${hasMatic ? '✅' : '⚠️ LOW'}`);

    // Check MockUSDC balance
    const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, ABIS.MOCK_USDC, provider);
    const usdcBalance = await usdc.balanceOf(operatorAddress);
    const usdcFormatted = ethers.formatUnits(usdcBalance, 6);
    const hasUsdc = usdcBalance >= ethers.parseUnits('1000', 6);
    console.log(`USDC Balance: ${usdcFormatted} ${hasUsdc ? '✅' : '⚠️ LOW (< 1000)'}`);

    // Check USDC approval for CTF
    const usdcAllowance = await usdc.allowance(operatorAddress, ADDRESSES.CTF);
    const hasUsdcApproval = usdcAllowance >= ethers.parseUnits('10000', 6);
    console.log(`USDC→CTF Approval: ${hasUsdcApproval ? '✅' : '❌ NOT SET'}`);

    // Check CTF approval for Exchange
    const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, provider);
    const ctfApproval = await ctf.isApprovedForAll(operatorAddress, ADDRESSES.CTF_EXCHANGE);
    console.log(`CTF→Exchange Approval: ${ctfApproval ? '✅' : '❌ NOT SET'}`);

    // Check if operator is registered on CTFExchange
    const exchange = new ethers.Contract(ADDRESSES.CTF_EXCHANGE, ABIS.CTF_EXCHANGE, provider);
    let isOperator = false;
    try {
      // Try to read operator status - this may not be a public getter
      isOperator = await exchange.operators(operatorAddress).catch(() => false);
    } catch {
      // If the getter doesn't exist, we'll find out when we try to match
      isOperator = null;
    }
    if (isOperator === true) {
      console.log('Exchange Operator Status: ✅ REGISTERED');
    } else if (isOperator === false) {
      console.log('Exchange Operator Status: ❌ NOT REGISTERED (run addOperator)');
    } else {
      console.log('Exchange Operator Status: ⚠️  UNVERIFIED (check manually)');
    }

    // Summary
    const allGood = hasMatic && hasUsdc && hasUsdcApproval && ctfApproval;
    console.log('──────────────────────────────────────────────────────────────');
    if (allGood) {
      console.log('✅ Operator ready for CLOB market-making');
    } else {
      console.log('⚠️  Operator NOT ready - run: node src/scripts/setOperatorApprovals.js');
    }
    console.log('══════════════════════════════════════════════════════════════\n');

    return allGood;
  } catch (err) {
    console.error('[OperatorSelfCheck] Failed:', err.message);
    return false;
  }
}

const startChainlinkResolutionCron = () => {
  if (!RESOLVER_ENABLED) {
    console.log('[PriceResolver] Disabled (PRICE_RESOLVER_ENABLED != true)');
    return;
  }
  resolveExpiredPriceMarkets().catch(err => console.error('[PriceResolver] Initial run failed:', err.message));
  setInterval(() => {
    resolveExpiredPriceMarkets().catch(err => console.error('[PriceResolver] Cron failed:', err.message));
  }, RESOLVER_INTERVAL_MS);
  console.log(`[PriceResolver] Cron scheduled every ${RESOLVER_INTERVAL_MS / 60000} min`);
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
  .then(async () => {
    startPriceSnapshotCron();
    startChainlinkResolutionCron();
    // Start automated deposit indexer (if INDEXER_ENABLED=true)
    depositIndexer.start();
    // Start Polymarket market sync (if MARKET_SYNC_ENABLED=true)
    marketSyncService.start();
    // Start on-chain proxy balance sync job (Phase 3 — ONCHAIN_ENABLED required)
    balanceSyncService.startSyncJob();
    // Start per-user proxy deposit watcher (Phase 3 — watches Amoy for USDC to proxy addresses)
    proxyDepositWatcher.start();
    // Start per-user HD-derived intake address watcher + bridge completion poller (M3 bridge)
    if (process.env.BRIDGE_WATCHER_ENABLED === 'true') {
      depositWatcherService.start();
      startBridgeCompletionPoller();
    }

    
    // ── Phase 1: Operator self-check + Maker Bot auto-start ────────────────
    if (process.env.ONCHAIN_ENABLED === 'true') {
      await runOperatorSelfCheck();

      if (process.env.MAKER_BOT_ENABLED === 'true') {
        const makerBotService = require('./services/makerBotService');
        console.log('[MakerBot] Auto-start initializing...');
        // Delay slightly to let other services stabilize
        setTimeout(() => {
          makerBotService.seedAndStartAll().catch((err) => {
            console.error('[MakerBot] Auto-start failed:', err.message);
          });
        }, 5000);
      }
    }
  })
  .catch((err) => {
    console.error('[Startup] Database connection failed:', err.message);
  });
