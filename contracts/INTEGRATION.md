# M1 On-Chain Integration Guide

## Overview
This document describes the M1 on-chain stack integration with PolyBet365 backend and frontend.

## Deployed Contracts (Polygon Amoy)

| Contract | Address | Purpose |
|----------|---------|---------|
| MockUSDC | `0xC9EfbCF51e175a8171dDb7f65d709e71be969e56` | 6-decimal test USDC collateral |
| ConditionalTokens (CTF) | `0x688d809494D56aCD8ea8b252937e9b51F7F8111B` | Gnosis CTF ERC1155 position tokens |
| CTFExchange | `0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF` | Binary orderbook exchange |
| UmaCtfAdapter | `0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5` | UMA OO bridge |
| NegRiskAdapter | `0x2B73d9B65e1d4829aA5405101d64d6042d7fDa44` | Multi-outcome wrapper |
| NegRiskExchange | `0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87` | NegRisk orderbook |
| WalletFactory | `0xf88b96e47F45aA98176F4A5496A647e039B6ad5E` | Gnosis Safe proxy per user |
| **MarketFactory** | `0x3dbafb417c9a86017209ed743c2c248e49a7ba84` | Market orchestrator (redeployed with bug fix) |

## Quick Commands

### Export ABIs
```bash
cd contracts
node scripts/exportAbis.js
```

### Redeploy MarketFactory (if needed)
```bash
cd contracts
wsl -u root bash -c "~/.foundry/bin/forge script script/DeployMarketFactory.s.sol --rpc-url https://polygon-amoy-bor-rpc.publicnode.com --broadcast -vvvv"
```

## Backend API

### Status Check
```bash
curl https://polybet365-api.onrender.com/api/onchain/status
```

### Get USDC Balance
```bash
curl https://polybet365-api.onrender.com/api/onchain/usdc/balance/0x786d99F5024acE87250544cE56309AEdB97f44cF
```

### Get Market Info (by conditionId)
```bash
curl https://polybet365-api.onrender.com/api/onchain/market/0x...
```

### Create Market (Admin only)
```bash
curl -X POST https://polybet365-api.onrender.com/api/onchain/market \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ancillaryData": "q:Will BTC > 100k res_data:p1:0,p2:1 category:crypto",
    "rewardToken": "0xC9EfbCF51e175a8171dDb7f65d709e71be969e56",
    "reward": "0",
    "proposalBond": "100000000",
    "liveness": 7200,
    "useNegRisk": false
  }'
```

## Admin Market Creation

When creating a market via admin API with `createOnChain: true`:

1. Market saves as `draft` initially
2. Server calls `MarketFactory.createMarket()` with deployer key
3. On success: updates with `conditionId`, `token0`, `token1`, `onChainTxHash`, sets `status: 'active'`
4. On failure: returns warning, market stays `draft` for retry

## Frontend Hooks

### Read Hooks
```javascript
import {
  useUsdcBalance,
  useMarketPositions,
  usePredictedWallet,
} from '../hooks/useOnchain';

// USDC balance
const { data: balance } = useUsdcBalance(address);

// Market positions (YES/NO)
const { yesBalance, noBalance } = useMarketPositions(address, conditionId);

// Predicted smart wallet
const { data: walletAddress } = usePredictedWallet(userAddress);
```

### Write Helpers
```javascript
import {
  approveUsdc,
  splitPosition,
  mergePositions,
  redeemPositions,
} from '../hooks/useOnchain';

// Approve USDC for CTF
await approveUsdc(ctfAddress, '100');

// Split USDC into YES/NO (internal use)
await splitPosition(conditionId, '50');

// Redeem after resolution
await redeemPositions(conditionId, [tokenId], [amount]);
```

## Environment Variables

### Backend `.env`
```env
ONCHAIN_ENABLED=true
POLYGON_AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
DEPLOYER_PRIVATE_KEY=0x...
MOCK_USDC_ADDRESS=0xC9EfbCF51e175a8171dDb7f65d709e71be969e56
CTF_ADDRESS=0x688d809494D56aCD8ea8b252937e9b51F7F8111B
EXCHANGE_ADDRESS=0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF
UMA_ADAPTER_ADDRESS=0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5
NEG_RISK_ADAPTER_ADDRESS=0x2B73d9B65e1d4829aA5405101d64d6042d7fDa44
NEG_RISK_EXCHANGE_ADDRESS=0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87
WALLET_FACTORY_ADDRESS=0xf88b96e47F45aA98176F4A5496A647e039B6ad5E
MARKET_FACTORY_ADDRESS=0x3dbafb417c9a86017209ed743c2c248e49a7ba84
```

## Architecture Notes

- **Additive Integration**: On-chain layer is behind `ONCHAIN_ENABLED` flag; existing MongoDB trading stays live
- **Gas**: Users need Amoy MATIC for transactions (Magic users included until M2 relayer)
- **UMA Resolution**: Deferred (MarketFactory-only redeploy chosen; UmaCtfAdapter still points to old OO)
- **CLOB Trading**: Deferred to M3; current integration is position read + redeem only
