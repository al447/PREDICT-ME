# PolyBet365 Pre-CertiK Security & Code Audit

**Date:** 2026-05-29
**Scope:** `frontend/` + `backend/` (excluding `contracts/`)
**Auditor:** Internal pre-audit pass

---

## Severity Summary

| Severity | Count | Must-Fix Before CertiK |
|----------|-------|------------------------|
| 🔴 **CRITICAL** | 6 | Yes |
| 🟠 **HIGH** | 9 | Yes |
| 🟡 **MEDIUM** | 12 | Recommended |
| 🟢 **LOW** | 7 | Nice-to-have |

---

# 🔴 CRITICAL ISSUES (Block CertiK)

## C1. Double-credit vulnerability in legacy deposit endpoint
**File:** `backend/src/controllers/userController.js:132-269` (`deposit`)
**Risk:** Direct theft from platform — user can credit balance N times for a single on-chain tx.

The `/api/users/deposit` endpoint verifies the on-chain USDT transfer but **does not check for duplicate `txHash`**. An attacker can:
1. Send 100 USDT to the platform wallet
2. Call `/api/users/deposit` repeatedly with the same `txHash`
3. Each call passes verification (the tx is real)
4. Each call increments `user.balance += 100`

**Note:** The newer `/api/deposits/claim` endpoint has duplicate protection via `PendingDeposit.findOne({ txHash })` (depositController.js:37). The legacy endpoint is the issue.

**Fix:** Either deprecate `/api/users/deposit` entirely, or add the same duplicate check + create a `PendingDeposit` record before crediting.

---

## C2. Hard-coded secrets in `backend/.env` checked into workspace
**File:** `backend/.env`

Although `.env` is gitignored, the workspace contains real production-grade secrets. If the `.env` is ever leaked (e.g. tarball, screenshare, support ticket), full compromise:

| Secret | Risk |
|--------|------|
| `MONGODB_URI` with cleartext credentials | Full DB takeover |
| `DEPLOYER_PRIVATE_KEY=13677e8f...` (cleartext EVM private key) | Drains platform wallet on Polygon Amoy |
| `DEPOSIT_MASTER_MNEMONIC=abandon abandon ...` | **PUBLIC TEST MNEMONIC** — anyone can derive every per-user deposit address and front-run user deposits |
| `JWT_SECRET=polybet365_jwt_secret_key_2026_very_secure` | Predictable string — JWTs forgeable |
| `ADMIN_JWT_SECRET=polybet365_admin_jwt_secret_2026` | Predictable — admin JWTs forgeable |
| `ADMIN_PASSWORD=ChangeMe123!` | Weak default, in plaintext env |
| `RESEND_API_KEY`, `MOONPAY_*` keys | Service abuse |

**Fix (before CertiK):**
1. **Rotate every secret** in `backend/.env`. CertiK will see this in scope and flag it.
2. Replace `JWT_SECRET` with `openssl rand -base64 64` output.
3. Replace `ADMIN_JWT_SECRET` similarly.
4. Generate a fresh BIP39 mnemonic via `node src/scripts/genMnemonic.js` — the current one is the well-known `abandon×11 art` test mnemonic.
5. Remove `DEPLOYER_PRIVATE_KEY` from `.env` — load from a secret manager (Render secrets, AWS Secrets Manager, Doppler).
6. Bump MongoDB DB user password.
7. Rotate `RESEND_API_KEY` and `MOONPAY_*` keys.

---

## C3. Public file upload endpoint (no auth)
**File:** `backend/src/routes/upload.js:49`

```js
router.post('/image', upload.single('image'), async (req, res, next) => {
```

No `protect` or `adminAuth` middleware. Any internet user can:
- Upload up to 5MB files repeatedly → fill disk → DoS
- Upload polyglot images (e.g., GIF + JS) and spread links → used in phishing
- `DELETE /api/upload/image/:filename` is also unauthenticated → anyone can delete any uploaded image

**Fix:**
```js
router.post('/image', adminAuth, upload.single('image'), ...);
router.delete('/image/:filename', adminAuth, ...);
```
Also validate magic bytes (not just `mimetype` which is client-controlled).

---

## C4. No rate limiting anywhere
**Files:** `backend/src/server.js`, all routes

Auth endpoints, deposit, withdraw, trade, admin login are all unrate-limited:
- `POST /api/auth/email/send-code` — has 60s cooldown per-email but no per-IP cap → email-bomb a victim from many IPs trivially
- `POST /api/admin/auth/login` — bcrypt brute-force attempts unlimited
- `POST /api/auth/wallet` — signature spam
- `POST /api/users/withdraw` — concurrent withdrawal amplification

**Fix:** Install `express-rate-limit` and apply tiered limits:
```js
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });
const tradeLimiter = rateLimit({ windowMs: 60*1000, max: 30 });
app.use('/api/auth', authLimiter);
app.use('/api/admin/auth', authLimiter);
app.use('/api/trades', tradeLimiter);
```

---

## C5. Race condition in trade `Market.save()`
**File:** `backend/src/controllers/tradeController.js:78-89`

```js
market.volume = (market.volume || 0) + parsedAmount;
market.tradeCount = (market.tradeCount || 0) + tradeCountInc;
// recompute prices, mutate market.outcomes...
await market.save();
```

If two trades execute concurrently on the same market:
1. Both load `market` with same volume `V`.
2. Trade A: `volume = V + 100`. Trade B: `volume = V + 50`.
3. Whichever saves last wins. **Volume is silently lost.**

Same issue for `outcomes[].price` — concurrent prices race; user could buy at stale price.

**Fix:** Use atomic `$inc` on Market for volume/tradeCount, and recompute prices in a transaction or with optimistic concurrency:
```js
await Market.findByIdAndUpdate(marketId, {
  $inc: { volume: parsedAmount, tradeCount: 1 }
});
// then recompute prices in a separate atomic update
```

---

## C6. Fake leaderboard data shown to users
**File:** `backend/src/controllers/tradeController.js:253,257`

```js
profit: { $multiply: ['$totalVolume', 0.1] }, // Estimated profit based on volume
winRate: { $literal: Math.floor(50 + Math.random() * 30) }, // Placeholder
```

The public leaderboard shows **fake profit (always 10% of volume)** and **fake winRate (random 50–80%)**. CertiK will flag this as **misleading user-facing financial data** — potentially a regulatory issue (false advertising / market manipulation under MiCA, SEC).

**Fix:** Compute real P&L from `Trade.status` (`won`/`lost`) and `Trade.payout` fields, or remove the columns until real data exists.

---

# 🟠 HIGH ISSUES

## H1. ReDoS / NoSQL regex injection in admin search
**Files:**
- `backend/src/controllers/adminUserController.js:14`
- `backend/src/controllers/adminMarketController.js:21`

```js
const regex = { $regex: req.query.search, $options: 'i' };
filter.$or = [{ email: regex }, { username: regex }, { walletAddress: regex }];
```

User-controlled input is used as a raw regex. Attacker (admin or anyone if admin token leaks) can pass `^(a+)+$` for catastrophic backtracking → DoS the DB.

**Fix:** Escape regex special chars:
```js
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = { $regex: escape(req.query.search), $options: 'i' };
```

## H2. Stored XSS in admin markdown preview
**File:** `frontend/src/components/admin/MarkdownPreview.jsx:36`

The custom `renderMd` does string-replace then injects via `dangerouslySetInnerHTML`. No sanitization → admin-only XSS via:
- `<script>alert(1)</script>`
- `[click](javascript:fetch('/api/admin/users/'+ID+'/balance', {method:'PATCH', headers: {Authorization:'Bearer '+localStorage.pb365_token}, body: JSON.stringify({amount: 999999, reason: 'XSS'})}))`

If two admins use the same form, one can drain via the other.

**Fix:** Replace with `react-markdown` + `rehype-sanitize`, or use `DOMPurify.sanitize(html)` before rendering.

## H3. `walletAuth` cross-account token bug
**File:** `backend/src/controllers/authController.js:118`

```js
loggedInUser = await User.findById(decoded.id);
```
But tokens are signed with `{ userId }` (helpers.js:4), not `{ id }`. So `decoded.id === undefined` → `findById(undefined)` returns `null` → existing Google user signing wallet **always treated as new wallet user**, leading to wrong account-linking flow.

**Fix:** Use `decoded.userId`.

## H4. No JWT issuer/audience claims, long expiry
**File:** `backend/src/utils/helpers.js:4`

7-day JWTs with no `iss`, `aud`, `jti` claims. If a token leaks, it's valid for a week and cannot be revoked (no JTI denylist).

**Fix:** Shorter expiry (1–2 hr access token), refresh-token flow, or at minimum a JTI-based revocation list (Redis set `revoked:JTI`).

## H5. CORS allows `http://polybet365.com` (insecure)
**File:** `backend/src/server.js:28`
Allowing both `http://` and `https://` origins for the prod domain enables MITM downgrade attacks.

**Fix:** Drop `http://polybet365.com` from `ALLOWED_ORIGINS`.

## H6. `helmet({ crossOriginResourcePolicy: false })` weakens defaults
**File:** `backend/src/server.js:20`

CORP disabled platform-wide because of `/uploads/` static. Should re-enable globally and disable only on the static mount:
```js
app.use(helmet());
app.use('/uploads', helmet({ crossOriginResourcePolicy: false }), express.static(...));
```
Also no CSP — set a strict `Content-Security-Policy`.

## H7. No CSP / X-Powered-By leak
- `helmet` is on but CSP is disabled by default unless configured.
- `X-Powered-By: Express` exposed (helmet removes it ✅, but verify in prod).

## H8. Sensitive data in error responses
**File:** `backend/src/middleware/errorHandler.js:3`

```js
let message = err.message || 'Server Error';
res.status(statusCode).json({ success: false, error: message });
```

Raw error messages are leaked: stack-trace fragments, MongoDB errors with collection/field names, internal RPC errors with private endpoints. CertiK flags this.

**Fix:** In production, return generic message and log full error server-side:
```js
console.error('[Error]', err);
const safeMsg = process.env.NODE_ENV === 'production'
  ? 'Internal server error'
  : err.message;
```

## H9. Vulnerable dependencies
- **Frontend:** 2 high (`@coinbase/wallet-sdk`), 8 moderate
- **Backend:** 7 moderate (qs, ws, ethers, uuid)

```bash
cd backend && npm audit fix
cd frontend && npm audit fix --force  # may break Web3Modal — test
```

---

# 🟡 MEDIUM ISSUES

## M1. Email-only auth has no anti-enumeration
`POST /api/auth/email/send-code` returns 429 with seconds remaining only if email exists in OTP collection — but user can probe by sending OTP and seeing 200/429 responses.

**Fix:** Always return `{ success: true }` regardless and use random delay.

## M2. In-memory replay protection won't scale
**File:** `backend/src/utils/walletAuth.js:8`
`usedSignatures` Map dies on server restart and won't sync across instances. Currently single-instance Render so OK, but flag for scale-out.

**Fix:** Use Redis with TTL.

## M3. No `unique` index on `Trade.txHash`-like field
Trades don't have a client-supplied idempotency key. A network retry can create duplicate trades and double-debit balance.

**Fix:** Accept `idempotencyKey` from client; unique index it.

## M4. `req.ip` used without `app.set('trust proxy', ...)`
On Render behind proxies, `req.ip` may be the proxy IP. Audit logs have wrong attribution.

**Fix:** `app.set('trust proxy', 1);` before middlewares.

## M5. `morgan('combined')` logs full URLs incl. tokens
If anyone passes JWTs in query strings (some SDKs do), they'll land in logs.

**Fix:** Custom morgan format that strips Authorization header and known token query params.

## M6. Multer `fileFilter` trusts client `mimetype`
**File:** `backend/src/routes/upload.js:28`
Validate magic bytes via `file-type` package after upload.

## M7. Static `/uploads/` served with no `Content-Disposition`
SVG/HTML masquerading as image gets executed by browser. Currently allow-list excludes SVG ✅, but add `Content-Disposition: attachment` for safety.

## M8. Missing `helmet` CSRF protection on cookie-auth flows
Backend uses Bearer JWT in headers (CSRF-safe), but `/api/auth/logout` clears cookie via `res.clearCookie('token')` — implies cookie-based auth somewhere. Audit and either commit to JWT-in-header or add CSRF tokens.

## M9. Withdraw verifies sender after balance debit, not user balance match
**File:** `backend/src/controllers/userController.js:309`
Logic is correct (debit-first, refund-on-fail), but does not check whether platform wallet has the gas needed BEFORE on-chain call → balance is debited then refunded → user sees brief incorrect balance. Acceptable but flag.

## M10. Polymarket proxy no input validation
**File:** `backend/src/routes/polymarket.js:42,63`
`market` and `tokenId` from user are concatenated into URL. URL chars not encoded → could break URL or DoS Polymarket via malformed requests bouncing back as errors.

**Fix:** `encodeURIComponent` and validate format (`/^[a-f0-9x]+$/i`).

## M11. Admin user search returns sensitive fields by default
**File:** `backend/src/controllers/adminUserController.js:24`
`User.find().select('-__v')` — still returns `password` if admin token is on a non-admin user (defense in depth).

**Fix:** Explicit allow-list: `.select('email username role balance walletAddress isActive createdAt')`.

## M12. `console.log` of sensitive data in deposit indexer
**File:** `backend/src/services/depositIndexer.js`, scripts/*
User IDs, tx hashes, sender addresses logged. PII / on-chain linkage risk. Reduce in production.

---

# 🟢 LOW ISSUES

## L1. `frontend/src/components/admin/ImageUpload.jsx:96` — `innerHTML = '📊'`
Hard-coded emoji, harmless but lint warning.

## L2. Tokens in `localStorage`
Standard SPA pattern. XSS = total compromise. Mitigate via strict CSP (see H7).

## L3. Hard-coded admin email `admin@polybet365.com` in `.env`
Move to seed script only.

## L4. `Math.random()` used for non-security values (winRate placeholder) — replace with real data (see C6).

## L5. `if (loggedInUser)` link path stores wallet without re-verifying ownership of email account — minor.

## L6. Markets `populate('createdBy')` exposes admin emails to admin UI — fine for admins but ensure same path isn't reachable by users.

## L7. Render-side auto-deploy from `main` branch (`render.yaml`) — ensure branch is protected.

---

# 📋 Prioritized Action List (Pre-CertiK)

### Phase 1 — Block-fixes (do TODAY)
1. **Rotate ALL secrets** in `backend/.env` (C2)
2. **Generate fresh BIP39 mnemonic** for deposit derivation (C2)
3. **Remove `/api/users/deposit` legacy endpoint** OR add duplicate-tx check (C1)
4. **Auth-protect `/api/upload/image` POST + DELETE** (C3)
5. **Fix fake leaderboard** — show real data or remove columns (C6)
6. **Replace `decoded.id` → `decoded.userId`** in walletAuth (H3)
7. **Fix race condition** in trade Market update — use `$inc` (C5)

### Phase 2 — Hardening (this week)
8. Install + configure `express-rate-limit` (C4)
9. Escape regex inputs in admin search (H1)
10. Sanitize markdown preview HTML (H2)
11. Strip `http://` from CORS allow-list (H5)
12. Configure CSP via helmet (H6/H7)
13. Generic error messages in production (H8)
14. `npm audit fix` both repos (H9)
15. Set `app.set('trust proxy', 1)` (M4)

### Phase 3 — Quality (before launch)
16. Add idempotency keys for trades & deposits (M3)
17. Replace in-memory replay store with Redis (M2)
18. Add CSP nonce-based script policy (H7)
19. Migrate JWTs to short-lived access + refresh tokens (H4)
20. Add `react-markdown` + `rehype-sanitize` (H2 proper fix)

---

# 🔧 Suggested Code Fixes (Ready-to-Apply)

I can apply these as discrete commits if you confirm:

| Fix | Files Changed | Lines |
|-----|---------------|-------|
| Add rate limiting | `server.js`, new `middleware/rateLimit.js` | ~20 |
| Escape regex | `adminUserController.js`, `adminMarketController.js` | ~6 |
| Auth-protect upload | `routes/upload.js` | ~2 |
| Fix `decoded.userId` bug | `authController.js` | ~1 |
| Fix CORS | `server.js` | ~1 |
| Generic errors | `errorHandler.js` | ~5 |
| Trade race (`$inc`) | `tradeController.js` | ~15 |
| Disable legacy deposit | `routes/users.js` | ~1 |
| Sanitize markdown | `MarkdownPreview.jsx` + `package.json` | ~10 |
| Trust proxy | `server.js` | ~1 |

Total: ~65 lines across 8 files. ~30 minutes of work + testing.

**Should I proceed with Phase 1 fixes immediately?**
