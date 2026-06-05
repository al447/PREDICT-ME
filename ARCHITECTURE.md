# PolyBet365 Architecture (Post-Cleanup)

## Overview
Hybrid prediction market platform using **DB-only market operations** with **multi-chain deposits/withdrawals**.

---

## What Was Removed (Dead Code)

| Component | Reason |
|-----------|--------|
| `PolyBet365Escrow` smart contract | Markets are DB-only now (no per-market gas cost) |
| `escrowService.js` | No on-chain market operations needed |
| `contractService.js` | No contract reads needed |
| `settlementController.js` | Settlement is DB-based |
| `/api/contract/*` routes | Unused API |
| `/api/settlement/*` routes | Unused API |
| `depositIndexer.js` stub | Multi-chain + MoonPay handles deposits |
| Hardhat `contracts/` folder | No custom contracts needed |

---

## Current Architecture

### OFF-CHAIN (MongoDB) — Free, Fast
- ✅ 300+ prediction markets
- ✅ Order matching & trading
- ✅ Price history snapshots (real, transparent)
- ✅ User balance tracking (display)
- ✅ Market resolution & payouts (DB credits)

### ON-CHAIN (External) — Only for Money Movement
- ✅ Multi-chain crypto deposits (EVM + Solana)
- ✅ MoonPay card deposits
- ✅ Withdrawals to user wallets

---

## Cost Structure

| Operation | Before | After |
|-----------|--------|-------|
| Create market | $5-20 gas | **$0** |
| Close market | $2-5 gas | **$0** |
| Resolve market | $2-5 gas | **$0** |
| Trade | $2-10 gas | **$0** |
| Deposit (crypto) | ~$0.05 | ~$0.05 |
| Withdrawal | ~$0.05 | ~$0.05 |

**300 markets = $0 gas cost** (was $1,500-$6,000)

---

## Key Files

### Active Backend Services
- `priceSnapshotService.js` — Real price history for charts
- `settlementService.js` — DB-only trade settlement
- `txVerifier.js` — Multi-chain deposit verification
- `moonpay.js` — Card payment processing

### Removed (Run cleanup-escrow.bat to delete)
- `escrowService.js`
- `contractService.js`
- `settlementController.js`
- `routes/contract.js`
- `routes/settlement.js`
- `contracts/PolyBet365Escrow.json`
- `contracts/MockUSDT.json`
- Entire `contracts/` Hardhat folder

---

## Environment Variables Needed

```env
# Database
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=...

# Platform Wallet (for receiving deposits)
PLATFORM_WALLET=0x...  # EVM address
SOLANA_DEPOSIT_ADDRESS=...  # Solana address

# MoonPay
MOONPAY_API_KEY=...
MOONPAY_WEBHOOK_SECRET=...

# Optional: Alchemy/Infura for tx verification
ALCHEMY_API_KEY=...
```

**No contract addresses needed** — markets are DB-only.

---

## How It Works

1. **User deposits** → Send crypto to platform wallet → Submit txHash → Backend verifies → Credits DB balance
2. **User trades** → DB updates positions (no gas)
3. **Market resolves** → Admin sets outcome → `settlementService.settleMarketTrades()` credits winners
4. **User withdraws** → Backend sends from platform wallet → User receives

---

## Verification

Run verification script:
```bash
cd backend
node src/scripts/verifySnapshots.js
```

Expected output:
```
=== Real-time Live Data Coverage ===
Total active markets:         299
Markets with real snapshots:  299
Coverage:                     100.0%
```
