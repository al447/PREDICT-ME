# Price Oracle Architecture

**Audience:** Certik audit team, engineering team, compliance.
**Last updated:** 2026-06-08

---

## Data-source matrix

| Use case | Primary source | Fallback | Notes |
|---|---|---|---|
| **Price market settlement** | Chainlink Data Streams (signed report) | Chainlink Data Feeds (on-chain AggregatorV3) | **Never Binance.** Report stored on Market doc. |
| **Deposit valuation (display)** | Chainlink Data Feeds (on-chain) | Binance spot REST | Display only. Stablecoin hardcoded $1. |
| **Chart history (display)** | Binance klines REST | — | Range-mapped interval: 1H→1m, 6H→5m, 1D→15m, 1W→1h, 1M→4h, ALL→1d. |
| **Live price ticker (display)** | Binance mini-ticker WebSocket | — | Fan-out via backend WS; display only. |
| **Subjective market resolution** | UMA Optimistic Oracle | Admin override | Propose→dispute→vote, USDC.e bond, 2h liveness. |
| **Admin market resolution** | Markets Team (admin) | — | Manual; on-chain markets use UMA adapter. |

---

## Three-oracle model (Polymarket parity)

```
Markets Team (admin)
  └── resolves: manually managed markets, US-jurisdiction, clarification layer

Chainlink
  ├── Data Streams  — sole settlement source for price markets (off-chain signed reports)
  └── Data Feeds    — on-chain fallback for settlement; primary for deposit valuation

UMA Optimistic Oracle
  └── resolves: subjective markets (elections, sports, events)
               propose → dispute → vote | USDC.e bond | 2h liveness window
```

---

## Settlement flow (price markets)

```
[Cron: priceMarketResolver.js every 15 min]
  │
  ├─ Query: { status:'active', endDate:{ $lte: now }, resolutionSource:'chainlink' }
  │
  ├─ For each market:
  │    1. getChainlinkSettlementPrice(symbol)
  │         ├─ Try: Chainlink Data Streams REST  (HMAC-SHA256, signed FeedReport)
  │         └─ Fallback: Chainlink Data Feed      (AggregatorV3.latestRoundData)
  │
  │    2. Compare price vs priceTarget using priceComparator (gte | lte)
  │
  │    3. findOneAndUpdate race-safe:
  │         status='resolved', resolvedOutcome, chainlinkStreamReport (audit)
  │
  │    4. settlementService.settleMarketTrades(market, outcome)
  │         └─ pays winners, refunds cancelled, idempotent
  │
  └─ Markets with resolutionSource='uma'|'admin' → SKIPPED (not touched here)
```

**On-chain upgrade path (Phase 5b):**  
`contracts/contracts/CryptoMarketResolver.sol` implements `checkUpkeep`/`performUpkeep` for Chainlink Automation. Register at `automation.chain.link` after mainnet launch.

---

## Chainlink Data Streams integration

- **Endpoint:** `GET {CHAINLINK_STREAMS_BASE}/reports/latest?feedID={feedId}`
- **Auth:** HMAC-SHA256 (`Authorization`, `X-Authorization-Timestamp`, `X-Authorization-Signature-SHA256`)
- **Feed IDs:** Stored in `chainlinkDataStreams.js → STREAM_IDS`
- **Report decode:** `benchmarkPrice` is int192 big-endian hex, divided by 1e18
- **Staleness guard:** `CHAINLINK_MAX_STALE_SEC` (default 3600s)
- **Audit trail:** Full signed `FeedReport` stored in `Market.chainlinkStreamReport`
- **Fallback:** If `CHAINLINK_STREAMS_API_KEY` is blank or API errors → falls back to on-chain Data Feed

---

## Binance integration

- **REST:** `https://data-api.binance.vision/api/v3` (public, no key, no geo-block)
- **WS:** `wss://data-stream.binance.vision/ws` (public mini-ticker streams)
- **Used for:** deposit valuation fallback, chart history, live price ticker
- **Never used for:** settlement, resolution outcome, trade matching
- **USDT≈USD:** Acceptable approximation for display; Chainlink x/USD is the settlement truth

---

## Staleness guards

| Source | Guard | Behaviour on failure |
|---|---|---|
| Chainlink Data Streams | `CHAINLINK_MAX_STALE_SEC` | Falls back to on-chain Feed |
| Chainlink Data Feeds | `CHAINLINK_MAX_STALE_SEC` | Returns `null`; settlement skipped for this cycle |
| Binance spot | 10s in-process cache | Returns `null`; display shows `—` |

---

## Market classification

Markets are classified at create/sync time by `utils/classifyPriceMarket.js`:

| `resolutionSource` | Condition |
|---|---|
| `chainlink` | Detectable crypto symbol + price target + Chainlink feed/stream available |
| `uma` | Subjective (no price target, or no feed available) |
| `admin` | Explicitly set by admin; override layer |

Run `node src/scripts/classifyExistingMarkets.js` once to backfill existing markets.

---

## Security notes (Certik)

1. **No private keys in price paths.** Chainlink Data Streams uses HMAC-SHA256 with `CHAINLINK_STREAMS_API_SECRET` — rotate in Chainlink dashboard before mainnet.
2. **Sanity clamp** on deposit valuation prices: `max(0.0001, min(price, 10_000_000))`.
3. **Race-safe resolution:** `findOneAndUpdate({ status:'active' })` ensures only one process resolves a market.
4. **Binance never influences settlement.** Enforced architecturally — `getSettlementPrice()` does not import `binanceService`.
5. **Signed report on-chain traceability:** `chainlinkStreamReport.fullReport` contains the raw ABI-encoded signed report for independent verification.
