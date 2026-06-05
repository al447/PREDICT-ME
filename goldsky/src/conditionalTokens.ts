import {
  ConditionPreparation,
  ConditionResolution,
  PositionSplit,
  PositionsMerge,
  PayoutRedemption,
} from '../generated/ConditionalTokens/ConditionalTokens';
import { Condition, Position, PositionBalance, Payout } from '../generated/schema';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';

export function handleConditionPreparation(event: ConditionPreparation): void {
  const conditionId = event.params.conditionId.toHex();
  
  let condition = Condition.load(conditionId);
  if (condition == null) {
    condition = new Condition(conditionId);
    condition.oracle = event.params.oracle;
    condition.questionId = event.params.questionId;
    condition.outcomeSlotCount = event.params.outcomeSlotCount;
    condition.resolved = false;
    condition.save();
  }
}

export function handlePositionSplit(event: PositionSplit): void {
  const conditionId = event.params.conditionId.toHex();

  // partition is uint256[] of index sets (e.g. [1, 2] for YES/NO)
  // Use conditionId + indexSet as the position id
  for (let i = 0; i < event.params.partition.length; i++) {
    const indexSet = event.params.partition[i];
    const positionId = conditionId + '-' + indexSet.toString();
    let position = Position.load(positionId);

    if (position == null) {
      position = new Position(positionId);
      position.condition = conditionId;
      position.tokenId = indexSet;
      position.outcomeIndex = i;
      position.totalSupply = BigInt.fromI32(0);
      position.market = conditionId;
      position.save();
    }

    position.totalSupply = position.totalSupply.plus(event.params.amount);
    position.save();

    updatePositionBalance(positionId, event.params.stakeholder, event.params.amount, event.block.timestamp);
  }
}

export function handlePositionsMerge(event: PositionsMerge): void {
  const conditionId = event.params.conditionId.toHex();

  for (let i = 0; i < event.params.partition.length; i++) {
    const indexSet = event.params.partition[i];
    const positionId = conditionId + '-' + indexSet.toString();
    let position = Position.load(positionId);

    if (position != null) {
      position.totalSupply = position.totalSupply.minus(event.params.amount);
      position.save();
    }

    updatePositionBalance(positionId, event.params.stakeholder, event.params.amount.neg(), event.block.timestamp);
  }
}

export function handlePayoutRedemption(event: PayoutRedemption): void {
  const conditionId = event.params.conditionId.toHex();
  const redeemer = event.params.redeemer;
  const payoutId = conditionId + '-' + redeemer.toHex();
  
  // payout is a single uint256 total USDC amount returned
  const payout = new Payout(payoutId);
  payout.condition = conditionId;
  payout.redeemer = redeemer;
  payout.payout = event.params.payout;
  payout.redeemedAt = event.block.timestamp;
  payout.blockNumber = event.block.number;
  payout.transactionHash = event.transaction.hash;
  payout.save();
  
  // Burn redeemed positions
  for (let i = 0; i < event.params.indexSets.length; i++) {
    // Note: position ID calculation would need the full CTF logic
    // This is simplified
  }
}

export function handleConditionResolution(event: ConditionResolution): void {
  const conditionId = event.params.conditionId.toHex();
  let condition = Condition.load(conditionId);
  if (condition == null) {
    condition = new Condition(conditionId);
    condition.oracle = event.params.oracle;
    condition.questionId = event.params.questionId;
    condition.outcomeSlotCount = event.params.outcomeSlotCount;
  }
  condition.resolved = true;
  condition.payoutNumerators = event.params.payoutNumerators;
  let denom = BigInt.fromI32(0);
  for (let i = 0; i < event.params.payoutNumerators.length; i++) {
    denom = denom.plus(event.params.payoutNumerators[i]);
  }
  condition.payoutDenominator = denom;
  condition.resolutionTimestamp = event.block.timestamp;
  condition.save();
}

function updatePositionBalance(
  positionId: string,
  user: Bytes,
  amount: BigInt,
  timestamp: BigInt
): void {
  const balanceId = positionId + '-' + user.toHex();
  let balance = PositionBalance.load(balanceId);
  
  if (balance == null) {
    balance = new PositionBalance(balanceId);
    balance.position = positionId;
    balance.user = user;
    balance.balance = BigInt.fromI32(0);
    balance.firstAcquiredAt = timestamp;
  }
  
  balance.balance = balance.balance.plus(amount);
  balance.lastUpdatedAt = timestamp;
  balance.save();
}
