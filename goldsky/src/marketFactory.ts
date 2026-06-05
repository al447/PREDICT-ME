import { MarketCreated, OwnershipTransferred } from '../generated/MarketFactory/MarketFactory';
import { Market, MarketCreatedEvent, GlobalStats } from '../generated/schema';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleMarketCreated(event: MarketCreated): void {
  const conditionId = event.params.conditionId.toHex();
  
  let market = Market.load(conditionId);
  if (market == null) {
    market = new Market(conditionId);
    market.questionId = event.params.questionId;
    market.token0 = event.params.token0;
    market.token1 = event.params.token1;
    market.collateral = event.params.collateral;
    market.negRisk = event.params.negRisk;
    market.createdAt = event.block.timestamp;
    market.createdAtBlock = event.block.number;
    market.createdAtTx = event.transaction.hash;
    market.save();
  }
  
  const eventId = event.transaction.hash.toHex() + '-' + event.logIndex.toString();
  const marketEvent = new MarketCreatedEvent(eventId);
  marketEvent.conditionId = event.params.conditionId;
  marketEvent.questionId = event.params.questionId;
  marketEvent.token0 = event.params.token0;
  marketEvent.token1 = event.params.token1;
  marketEvent.collateral = event.params.collateral;
  marketEvent.negRisk = event.params.negRisk;
  marketEvent.timestamp = event.block.timestamp;
  marketEvent.blockNumber = event.block.number;
  marketEvent.save();
  
  let stats = GlobalStats.load('global');
  if (stats == null) {
    stats = new GlobalStats('global');
    stats.totalMarkets = BigInt.fromI32(0);
    stats.totalTrades = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.totalValueLocked = BigInt.fromI32(0);
    stats.lastUpdatedAt = event.block.timestamp;
  }
  stats.totalMarkets = stats.totalMarkets.plus(BigInt.fromI32(1));
  stats.lastUpdatedAt = event.block.timestamp;
  stats.save();
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  // Log ownership change if needed
}
