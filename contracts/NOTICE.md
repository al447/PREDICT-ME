# NOTICE — Third-Party Code & Attribution

This document records the origin and license of every smart contract used in the
**PredictMe** on-chain stack (Polygon mainnet, chainId 137). It is provided for
audit, compliance, and attribution purposes.

PredictMe builds on the open-source Polymarket prediction-market contract suite,
which Polymarket publishes under the permissive **MIT License**, together with
Gnosis's Conditional Tokens Framework (LGPL-3.0) and UMA's Optimistic Oracle.

---

## 1. Upstream dependencies (NOT authored by PredictMe)

These are vendored under `contracts/lib/` and used **unmodified**. Their original
`LICENSE` files and SPDX headers are preserved intact.

| Library (path) | Author | License | Used via | Modified? |
|---|---|---|---|---|
| `lib/ctf-exchange` (`CTFExchange`) | Polymarket | MIT | Inherited by `CTFExchangeShim` | No |
| `lib/neg-risk-ctf-adapter` (`NegRiskAdapter`, `NegRiskCtfExchange`) | Polymarket | MIT | Inherited by `NegRiskAdapterShim`, `NegRiskExchangeShim` | No |
| `lib/uma-ctf-adapter` (`UmaCtfAdapter`) | Polymarket | MIT | Inherited by `UmaCtfAdapterShim` | No |
| `lib/conditional-tokens-contracts` (`ConditionalTokens`) | Gnosis | LGPL-3.0 | Deployed bytecode; called only via `IConditionalTokens` interface | No |
| `lib/openzeppelin-contracts` | OpenZeppelin | MIT | Imported | No |
| `lib/solmate`, `lib/solady` | Transmissions11 / Vectorized | MIT / AGPL (per file) | Transitive deps of upstream libs | No |
| UMA Optimistic Oracle V2 / Finder | UMA Protocol | (on-chain, external) | Called via `IOptimisticOracleV2`, `IFinder` | No |

### MIT obligation — satisfied
The MIT License requires only that the original copyright and permission notice be
retained in copies or substantial portions. PredictMe satisfies this:
- Each upstream source file retains its `// SPDX-License-Identifier: MIT` header.
- The upstream `LICENSE.md` / `LICENSE` files remain in place under `lib/`.

### LGPL-3.0 obligation (ConditionalTokens) — satisfied
- The Gnosis CTF library is **not modified**.
- PredictMe interacts with it **only through interfaces** (`IConditionalTokens`),
  deploying the canonical CTF bytecode separately. Under LGPL-3.0 this constitutes
  "use of an interface provided by the Library," which does **not** impose copyleft
  obligations on PredictMe's own contracts.

---

## 2. PredictMe original contracts (authored by PredictMe)

These contain PredictMe's own logic and carry `SPDX-License-Identifier: MIT`.

| Contract (path) | Description | Origin |
|---|---|---|
| `contracts/MarketFactory.sol` | Creates CTF conditions, initializes UMA questions, registers markets | Original |
| `contracts/CryptoMarketResolver.sol` | Chainlink Automation upkeep that auto-resolves expired crypto-price markets | Original |
| `contracts/WalletFactory.sol` | Deterministic Gnosis Safe proxy deployment per user (non-custodial wallets) | Original |
| `contracts/MockUSDC.sol` | **Test-only** mintable ERC-20. **Excluded from mainnet** — mainnet uses native Circle USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | Original (test) |

---

## 3. Shim contracts (thin wrappers)

These exist **only** so the Foundry build can extract creation bytecode from the
MIT-licensed upstream contracts. They add **no logic** — each merely forwards
constructor arguments to its parent.

| Shim (path) | Parent (upstream) | Logic added |
|---|---|---|
| `contracts/shims/CTFExchangeShim.sol` | `CTFExchange` (Polymarket, MIT) | None |
| `contracts/shims/NegRiskShims.sol` | `NegRiskAdapter` (Polymarket, MIT) | None |
| `contracts/shims/NegRiskExchangeShim.sol` | `NegRiskCtfExchange` (Polymarket, MIT) | None |
| `contracts/shims/UmaCtfAdapterShim.sol` | `UmaCtfAdapter` (Polymarket, MIT) | None |

---

## 4. Summary

- All Polymarket-derived code is **MIT-licensed** and used in full compliance
  (notices retained; commercial and closed-source use expressly permitted).
- Gnosis CTF (LGPL-3.0) is used **unmodified, via interface** — no copyleft
  obligation triggered.
- PredictMe's competitive/original logic lives in `MarketFactory`,
  `CryptoMarketResolver`, and `WalletFactory`.
- No upstream contract has been altered; modifications, if any were ever needed,
  would be documented here with a diff.

_Last updated: 2026-06-18_
