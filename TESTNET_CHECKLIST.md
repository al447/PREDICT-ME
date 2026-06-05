# PolyBet365 — Testnet Validation Checklist (Polygon Amoy)

## Prerequisites — Fund the operator wallets

You need three funded Amoy wallets. Get free test MATIC from:
https://faucet.polygon.technology (select "Amoy")

| Role | Env var | Purpose |
|------|---------|---------|
| Deployer | `DEPLOYER_PRIVATE_KEY` | Deploy contracts / create markets |
| Relayer | `RELAYER_PRIVATE_KEY` | Pay gas for Safe deployment |
| Operator | `OPERATOR_PRIVATE_KEY` | Pay gas for CLOB settlement |

Each needs ~1 MATIC to run a full test. Get test MATIC from the faucet above.

---

## Step 1 — Verify env is pointing to Amoy testnet

```
NETWORK=amoy
ONCHAIN_ENABLED=true
NONCUSTODIAL_ENABLED=true
POLYGON_AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
CHAIN_ID=80002
```

Confirm contracts are deployed at the addresses in `.env`:
- Open https://amoy.polygonscan.com
- Paste each address — it should show contract code (not EOA)

---

## Step 2 — Smart Wallet provisioning

1. Register/login as a test user
2. Open browser console → network tab
3. Call `GET /api/onchain/my-wallet`
4. ✅ Expect: `{ proxy: "0x...", deployed: false, balance: 0 }`
5. Call `POST /api/onchain/my-wallet/deploy`
6. ✅ Expect: `{ deployed: true, txHash: "0x..." }`
7. Verify on https://amoy.polygonscan.com — the proxy address should show contract code

---

## Step 3 — Fund the Safe with test USDC

The MockUSDC contract has a `mint()` or `faucet()` function for testnet.

Option A — call it directly from Polygonscan:
1. Go to `https://amoy.polygonscan.com/address/<MOCK_USDC_ADDRESS>#writeContract`
2. Connect MetaMask (Amoy), call `mint(safeAddress, 1000000000)` (= 1000 USDC)

Option B — run the backend script:
```powershell
node backend/src/scripts/mintTestUsdc.js --address <safeAddress> --amount 1000
```

4. ✅ Verify: `GET /api/onchain/usdc/balance/<safeAddress>` returns `1000`

---

## Step 4 — Create a market on-chain

In the admin panel:
1. Login as admin (`POST /api/admin/auth/login`)
2. Create a market with `createOnChain: true`
3. ✅ Expect market has `conditionId`, `token0`, `token1`, `onChain: true`

Or via script (dry-run first):
```powershell
node backend/src/scripts/publishMarketOnChain.js --dry-run
node backend/src/scripts/publishMarketOnChain.js --id <mongoMarketId>
```

---

## Step 5 — Place a CLOB order (non-custodial)

Using the frontend trading panel or directly:
1. Connect wallet (MetaMask on Amoy, or Magic)
2. Select a market → place a BUY order at 0.60 for 10 shares
3. ✅ Expect: MetaMask prompts `signTypedData` (not a transaction — no gas paid by user)
4. ✅ Expect: `POST /api/clob/order` returns `{ success: true, order: { status: "open" } }`
5. ✅ Verify on `GET /api/clob/orderbook/<conditionId>/<token0>` — bid appears

---

## Step 6 — Match orders (2 accounts)

1. With account B, place a SELL order at 0.60 for 10 shares on the same market
2. ✅ Expect: both orders flip to `filled`
3. ✅ Expect: `settlementTxHash` is populated on both orders
4. Verify tx on Polygonscan — should call `fillOrder` on CTFExchange

---

## Step 7 — Withdrawal (non-custodial)

1. `POST /api/onchain/withdraw/prepare` with `{ recipient: "0x...", amount: 10 }`
2. ✅ Expect: EIP-712 SafeTx payload returned
3. Sign in frontend → `POST /api/onchain/withdraw/exec`
4. ✅ Expect: USDC moved from Safe to recipient on-chain
5. Verify on Polygonscan

---

## Step 8 — Resolve market + redeem

1. Admin resolves market: `POST /api/admin/markets/<id>/resolve` `{ outcome: "yes" }`
2. ✅ Expect: response includes `onChainNote` about cancelled CLOB orders
3. User calls `GET /api/onchain/positions/<conditionId>/redeemable`
4. ✅ Expect: `{ resolved: true, token0Balance: N, redeemableUsdc: N }`
5. User calls `POST /api/onchain/positions/<conditionId>/redeem`
6. ✅ Expect: USDC returns to user's Safe

---

## Step 9 — Admin panel smoke test

| Feature | URL | Expected |
|---------|-----|----------|
| List markets | `GET /api/admin/markets` | Shows all markets with onChain flag |
| List pending on-chain | `GET /api/onchain/markets/pending` | Draft markets only |
| Publish market | `POST /api/onchain/market/:id/publish` | Returns conditionId |
| User list | `GET /api/admin/users` | Shows smartWallet.proxy per user |
| CLOB cleanup | `POST /api/clob/admin/cleanup` | Removes expired orders |

---

## Mainnet cutover (when testnet passes)

Change only these env vars:
```
NETWORK=mainnet
VITE_CHAIN_ID=137
MOCK_USDC_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174   # USDC.e on Polygon
POLYGON_RPC_URL=https://polygon-rpc.com
VITE_BLOCK_EXPLORER=https://polygonscan.com
VITE_BRIDGE_DEST_CHAIN_ID=137
```
And redeploy M1 contracts on mainnet, update all `*_ADDRESS` vars.
