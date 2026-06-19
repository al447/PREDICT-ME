# PredictMe / PolyBet365 — Smart Contract Audit Preparation

**Prepared for:** CertiK audit submission
**Scope:** First-party contracts in `contracts/contracts/`
**Stack:** Polymarket CTF (Conditional Tokens, CTFExchange, UmaCtfAdapter, NegRiskAdapter), Gnosis Safe, Chainlink Automation/Data Feeds
**Compiler:** Solidity `^0.8.24` (resolver `^0.8.20`), OpenZeppelin v5
**Status:** All findings below were remediated. `forge build` clean; 20/20 fork tests pass.

---

## 1. Audit scope

| Contract | Audit? | Role |
|---|---|---|
| `MarketFactory.sol` | ✅ In scope | Orchestrates binary market creation on the CTF stack |
| `CryptoMarketResolver.sol` | ✅ In scope | Chainlink Automation on-chain price-market resolver |
| `WalletFactory.sol` | ✅ In scope | Deterministic 1-of-1 Gnosis Safe proxy per user |
| `MockUSDC.sol` | ⚠️ **Testnet only — exclude from mainnet scope** | Faucet test collateral on Amoy |
| `shims/*.sol` | ❌ Out of scope | Thin wrappers around already-audited Polymarket contracts (CTFExchange, NegRiskAdapter/Exchange, UmaCtfAdapter) for bytecode extraction only |
| `lib/ConditionalTokensBytecode.sol` | ❌ Out of scope | Embedded Gnosis CTF creation bytecode (solc 0.5.1) |

---

## 2. Resolution architecture (confirmed design)

Two oracle paths, mirroring `docs/PRICE_ORACLE_ARCHITECTURE.md`:

- **Subjective markets** → UMA Optimistic Oracle via `UmaCtfAdapter`. `MarketFactory.createMarket()` initializes the UMA question (which prepares the CTF condition with the adapter as oracle).
- **Crypto price markets** → `CryptoMarketResolver` (Chainlink Automation). The condition is prepared with the **resolver** as oracle; on expiry the resolver reads a Chainlink feed and calls `ConditionalTokens.reportPayouts(questionId, [YES, NO])` — the canonical Gnosis CTF settlement path (identical to the off-chain `onchainService.reportPayoutsOnChain`).

Payout slot convention (binary): **index 0 = YES, index 1 = NO** (matches `MarketFactory` token0=YES/token1=NO derivation).

---

## 3. Findings & remediations

### CRITICAL

**C-1 — `CryptoMarketResolver` called a non-existent function (contract non-functional).**
The resolver invoked `marketFactory.resolveMarket(uint256 marketId, bool outcome)`, which does not exist in `MarketFactory` (markets are keyed by `bytes32 conditionId`). Every `performUpkeep` would revert; no market could ever resolve.
**Fix:** Rewrote the resolver to settle directly on the CTF via `reportPayouts(bytes32 questionId, uint256[] payouts)`, keyed by `questionId`. Removed the broken `IMarketFactory` dependency.

### HIGH

**H-1 — Resolver supported only a single comparison direction.**
Outcome was hard-coded to `answer >= targetPrice`, so "below-target" price markets could not be expressed (the off-chain resolver supports `gte`/`lte`).
**Fix:** Added a `Comparator { GTE, LTE }` field per market; outcome derives from it.

**H-2 — Unbounded, ever-growing resolver loop (gas/DoS).**
`checkUpkeep` iterated all markets ever registered; resolved markets were never pruned, so the loop grew without bound.
**Fix:** Maintain an active-set array with O(1) swap-and-pop removal on resolution; `checkUpkeep` iterates only unresolved markets and wraps each feed read in `try/catch` so one bad feed cannot brick the check.

### MEDIUM

**M-1 — Single-step ownership transfer on the resolver (hand-rolled `owner`).**
**Fix:** Replaced bespoke `owner`/`transferOwnership` with OpenZeppelin **`Ownable2Step`** (pending-owner accept pattern), consistent with the other contracts.

**M-2 — Missing reentrancy protection on the resolver.**
**Fix:** Added `ReentrancyGuard`; `performUpkeep` is `nonReentrant` and follows checks-effects-interactions (`resolved=true` + active-set removal **before** the external `reportPayouts`).

**M-3 — `MarketFactory` reward path was non-functional.**
`UmaCtfAdapter.initialize()` pulls `reward` of `rewardToken` from the caller (the factory), but the factory never received/approved tokens, so any `reward > 0` market creation would revert.
**Fix:** When `reward > 0`, pull `reward` from the caller via `SafeERC20.safeTransferFrom` and `forceApprove` the adapter for exactly that amount, then reset the allowance to 0 afterward.

**M-4 — `MarketFactory` could silently overwrite an existing market.**
Duplicate `ancillaryData` yields the same `questionId`/`conditionId`, overwriting prior `MarketInfo`.
**Fix:** `require(markets[conditionId].createdAt == 0, "market exists")`.

### LOW / INFORMATIONAL

**L-1 — Input validation.**
- `MarketFactory.createMarket`: added `ancillaryData.length != 0` and `rewardToken != address(0)`.
- `CryptoMarketResolver.registerMarket`: added `questionId != 0`, `feed != address(0)`, `endTime > block.timestamp`, and duplicate guard.
- `WalletFactory`: `owner != address(0)` in `getOrCreateProxy`; `owner`/`proxy` non-zero in `registerProxy`; `require(proxy != address(0))` after CREATE2.

**L-2 — Chainlink feed freshness hardening.**
`performUpkeep`/`checkUpkeep` now validate `answer > 0`, `updatedAt != 0`, `answeredInRound >= roundId`, and `block.timestamp - updatedAt <= maxStaleSec`. `maxStaleSec` is bounded to `[60s, 7 days]`.

**L-3 — CEI ordering in `MarketFactory`.**
State (`markets`, `allConditionIds`) is now written **before** the external `exchange.registerToken` calls.

**L-4 — `WalletFactory` reentrancy.**
`getOrCreateProxy` is now `nonReentrant`.

**L-5 — `MockUSDC` mainnet misuse.**
Added a prominent `TESTNET ONLY — DO NOT DEPLOY TO MAINNET` NatSpec warning. Must be excluded from the mainnet deployment set; production uses real USDC.

---

## 4. Acknowledged design notes (not vulnerabilities)

1. **Permissionless `performUpkeep`.** By default anyone may trigger resolution; this is safe because the outcome is a pure function of on-chain Chainlink data + `block.timestamp`. An optional `forwarder` can be set (`setForwarder`) to restrict calls to the Chainlink Automation forwarder.
2. **Centralization.** `MarketFactory.createMarket`, resolver registration, and `WalletFactory.registerProxy` are owner-gated by design (admin-operated platform). Owners use `Ownable`/`Ownable2Step`.
3. **`block.timestamp` lint warnings.** Intentional and safe — resolution timing tolerates validator drift (staleness window ≥ 60s ≫ ~12s drift).
4. **Deployment requirement (resolver).** Price-market conditions MUST be prepared with the resolver as oracle (`prepareCondition(resolver, questionId, 2)`), otherwise `reportPayouts` reverts. Documented in `CryptoMarketResolver` NatSpec and `DeployCryptoMarketResolver.s.sol`.

---

## 5. Verification

```bash
cd contracts
forge build                 # clean (only block-timestamp informational lints)
forge test --fork-url https://polygon-amoy-bor-rpc.publicnode.com \
  --match-path test/M1Integration.t.sol      # 20 passed; 0 failed
```

> Note: `test/M1FullIntegration.t.sol` has a pre-existing local `setUp()` revert (it deploys UMA/exchange infra with placeholder addresses off-fork). This is unrelated to the audited changes — verified by reproducing the same failure on the unmodified baseline. The fork-based `M1Integration.t.sol` is the authoritative suite.

---

## 6. Addresses to submit

Submit the **mainnet** deployment addresses (Polygon) for the first-party in-scope contracts once deployed:

- `MarketFactory`
- `CryptoMarketResolver`
- `WalletFactory`

Do **not** submit `MockUSDC` (testnet only) or the shim/library files (third-party audited code).
