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

  // The conditionId is encoded in the upper 128 bits of the token ID (CTF convention).
  // For indexing purposes we use takerAssetId as the market key since it represents
  // the outcome token the taker is providing (the complementary side).
  const tokenId = event.params.makerAssetId;
  const marketId = tokenId.toHex();

  // Calculate price: makerAmountFilled / (makerAmountFilled + takerAmountFilled)
  // Avoid division by zero
  let price = BigDecimal.fromString('0');
  const total = event.params.makerAmountFilled.plus(event.params.takerAmountFilled);
  if (total.gt(BigInt.fromI32(0))) {
    price = event.params.makerAmountFilled.toBigDecimal().div(total.toBigDecimal());
  }

  // Resolve market entity (may be null if MarketFactory event not yet indexed)
  const market = Market.load(marketId);

  // Create Trade entity
  let trade = new Trade(tradeId);
  // Use takerOrderHash as a unique order reference; conditionId comes from market lookup
  trade.conditionId = event.params.takerOrderHash;
  trade.tokenId = tokenId;
  // takerOrderMaker is the address of the taker-side order creator
  trade.maker = event.params.takerOrderMaker;
  // The maker-side order maker is not directly in this event; use from as best proxy
  trade.taker = event.transaction.from;
  trade.makerAmount = event.params.makerAmountFilled;
  trade.takerAmount = event.params.takerAmountFilled;
  trade.price = price;
  trade.side = 'buy';
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;
  // market field is required — only set if we can resolve it
  if (market != null) {
    trade.market = market.id;
  } else {
    trade.market = marketId; // forward-reference; will be filled when market is indexed
  }
  trade.save();

  // Create OrderMatch entity
  const matchId = event.transaction.hash.toHex() + '-' + event.logIndex.toString() + '-match';
  let match = new OrderMatch(matchId);
  match.conditionId = event.params.takerOrderHash;
  match.tokenId = tokenId;
  match.maker = event.params.takerOrderMaker;
  match.taker = event.transaction.from;
  match.makerAmount = event.params.makerAmountFilled;
  match.takerAmount = event.params.takerAmountFilled;
  match.timestamp = event.block.timestamp;
  match.blockNumber = event.block.number;
  match.transactionHash = event.transaction.hash;
  match.logIndex = event.logIndex;
  if (market != null) {
    match.market = market.id;
  } else {
    match.market = marketId;
  }
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
