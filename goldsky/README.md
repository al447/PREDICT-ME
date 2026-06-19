# Goldsky Subgraph for PolyBet365

This subgraph indexes the PolyBet365 M1 on-chain stack for fast GraphQL queries.

## Deployed Contracts (Polygon MAINNET, chainId 137 — deployed 2026-06-17, block 88660117)

| Contract | Address | Purpose |
|----------|---------|---------|
| MarketFactory | `0x0e9Be76713060ae72bF4a431a79DE4e4342703Dd` | Market creation |
| CTFExchange | `0xB2FB436cC2E6F5c8F2cb9a876FF4AF0CfDF2D8D8` | Trade matching |
| ConditionalTokens | `0x4518a86c85F3D0aE6ac100B9384011bba63a9b1c` | Position tokens |
| UmaCtfAdapter | `0x78E4B65e23cAD525851F32A1FF19320dE1Df73f7` | UMA resolution |

## Prerequisites

```bash
# Install Goldsky CLI
npm install -g @goldskyio/cli

# Login to Goldsky
goldsky login
```

## Deployment Steps

### 1. Copy ABIs

```bash
# Copy ABIs from contracts
mkdir -p abis
cp ../contracts/abi/MarketFactory.json abis/
cp ../contracts/abi/CTFExchange.json abis/
cp ../contracts/abi/ConditionalTokens.json abis/
cp ../contracts/abi/UmaCtfAdapter.json abis/
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Generate Code

```bash
npm run codegen
```

### 4. Build Subgraph

```bash
npm run build
```

### 5. Create Subgraph on Goldsky

```bash
goldsky subgraph create polybet365-m1 --from-abi
```

Or deploy directly:

```bash
# Deploy to Goldsky
goldsky subgraph deploy polybet365-m1/amoy \
  --path . \
  --network polygon-amoy
```

### 6. Get GraphQL Endpoint

After deployment, Goldsky provides a GraphQL endpoint:

```
https://api.goldsky.com/api/public/project_cmpx8k9y9dcv701yxhq3k1jyp/subgraphs/polybet365-m1/amoy/gn
```

## Example Queries

### Get All Markets

```graphql
{
  markets(orderBy: createdAt, orderDirection: desc) {
    id
    questionId
    token0
    token1
    collateral
    negRisk
    createdAt
    createdAtBlock
  }
}
```

### Get Market with Trades

```graphql
{
  market(id: "0x...") {
    id
    trades(orderBy: timestamp, orderDirection: desc) {
      id
      maker
      taker
      makerAmount
      takerAmount
      price
      side
      timestamp
    }
  }
}
```

### Get User Positions

```graphql
{
  user(id: "0x...") {
    id
    totalTrades
    totalVolume
    balances {
      position {
        tokenId
        outcomeIndex
      }
      balance
    }
  }
}
```

### Get Order Book (from off-chain CLOB)

```graphql
{
  orderMatches(orderBy: timestamp, orderDirection: desc, first: 50) {
    id
    market {
      id
    }
    maker
    taker
    makerAmount
    takerAmount
    timestamp
  }
}
```

### Get Global Stats

```graphql
{
  globalStats(id: "global") {
    totalMarkets
    totalTrades
    totalVolume
    totalValueLocked
    lastUpdatedAt
  }
}
```

## Indexed Data

### Entities

- **Market**: Created markets with conditionId, tokenIds, collateral
- **Condition**: CTF conditions with payout info
- **Question**: UMA questions with resolution status
- **Trade**: Matched trades with price, amounts, maker/taker
- **Position**: ERC1155 position tokens (YES/NO)
- **PositionBalance**: User holdings per position
- **Payout**: Redemption records
- **User**: Trading statistics per address
- **GlobalStats**: Aggregate protocol metrics

### Events Indexed

1. **MarketFactory**: `MarketCreated`, `OwnershipTransferred`
2. **CTFExchange**: `OrdersMatched`
3. **ConditionalTokens**: `ConditionPreparation`, `PositionSplit`, `PositionsMerge`, `PayoutRedemption`
4. **UmaCtfAdapter**: `QuestionInitialized`, `QuestionResolved`

## Architecture

```
┌─────────────────┐
│  Polygon Amoy   │
│   Contracts     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Goldsky Indexer│
│  (The Graph)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  GraphQL API    │
│  Fast Queries   │
└─────────────────┘
```

## Updating Subgraph

When contracts are redeployed:

1. Update `subgraph.yaml` with new addresses
2. Update `startBlock` to deployment block
3. Rebuild and redeploy:

```bash
npm run build
goldsky subgraph deploy polybet365-m1/amoy --path .
```

## Development

```bash
# Local testing with graph-node
docker-compose up

# Deploy to local
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 polybet365-m1
```
