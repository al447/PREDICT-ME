import { OrdersMatched } from '../generated/CTFExchange/CTFExchange';
import { Trade, OrderMatch, GlobalStats, Market } from '../generated/schema';
import { BigInt, BigDecimal, Bytes } from '@graphprotocol/graph-ts';

// OrdersMatched(bytes32 takerOrderHash, address takerOrderMaker, uint256 makerAssetId,
//               uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)
//
// In CTFExchange binary markets:
//   makerAssetId = YES/NO token id held by the maker (maker is selling this)
//   takerAssetId = the other side (the conditionId-based token the taker provides)
//   takerOrderMaker = the address that created the taker order (the "taker" of liquidity)
//   makerAmountFilled / takerAmountFilled = USDC amounts filled on each side

export function handleOrdersMatched(event: OrdersMatched): void {
  const tradeId = event.transaction.hash.toHex() + '-' + event.logIndex.toString();

  const tokenId = event.params.makerAssetId;

  // Derive conditionId from tokenId: iterate known markets to find which one
  // owns this tokenId. For CTF, tokenId = positionId derived from conditionId.
  // Use tokenId hex as lookup key; market's token0/token1 should match.
  const tokenIdHex = tokenId.toHex();

  // Calculate price: makerAmountFilled / (makerAmountFilled + takerAmountFilled)
  let price = BigDecimal.fromString('0');
  const total = event.params.makerAmountFilled.plus(event.params.takerAmountFilled);
  if (total.gt(BigInt.fromI32(0))) {
    price = event.params.makerAmountFilled.toBigDecimal().div(total.toBigDecimal());
  }

  // Try to resolve market by tokenId (token0 or token1)
  // Market.id is conditionId set by MarketFactory handler
  let market = Market.load(tokenIdHex);

  // Create Trade entity
  let trade = new Trade(tradeId);
  trade.conditionId = market != null ? Bytes.fromHexString(market.id) : Bytes.empty();
  trade.tokenId = tokenId;
  // takerOrderMaker is the address that placed the taker order
  trade.taker = event.params.takerOrderMaker;
  // The operator (transaction.from) submits the match; not the counterparty maker
  trade.maker = event.transaction.from;
  trade.makerAmount = event.params.makerAmountFilled;
  trade.takerAmount = event.params.takerAmountFilled;
  trade.price = price;
  trade.side = 'buy';
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;
  trade.market = market != null ? market.id : tokenIdHex;
  trade.save();

  // Create OrderMatch entity
  const matchId = event.transaction.hash.toHex() + '-' + event.logIndex.toString() + '-match';
  let match = new OrderMatch(matchId);
  match.conditionId = market != null ? Bytes.fromHexString(market.id) : Bytes.empty();
  match.tokenId = tokenId;
  match.taker = event.params.takerOrderMaker;
  match.maker = event.transaction.from;
  match.makerAmount = event.params.makerAmountFilled;
  match.takerAmount = event.params.takerAmountFilled;
  match.timestamp = event.block.timestamp;
  match.blockNumber = event.block.number;
  match.transactionHash = event.transaction.hash;
  match.logIndex = event.logIndex;
  match.market = market != null ? market.id : tokenIdHex;
  match.save();

  // Update global stats
  let stats = GlobalStats.load('global');
  if (stats == null) {
    stats = new GlobalStats('global');
    stats.totalMarkets = BigInt.fromI32(0);
    stats.totalTrades = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.totalValueLocked = BigInt.fromI32(0);
    stats.lastUpdatedAt = event.block.timestamp;
  }
  stats.totalTrades = stats.totalTrades.plus(BigInt.fromI32(1));
  stats.totalVolume = stats.totalVolume.plus(event.params.makerAmountFilled);
  stats.lastUpdatedAt = event.block.timestamp;
  stats.save();
}
