import { QuestionInitialized, QuestionResolved } from '../generated/UmaCtfAdapter/UmaCtfAdapter';
import { Question, Resolution } from '../generated/schema';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';

export function handleQuestionInitialized(event: QuestionInitialized): void {
  const questionId = event.params.questionID.toHex();
  
  let question = Question.load(questionId);
  if (question == null) {
    question = new Question(questionId);
  }
  
  question.ancillaryData = event.params.ancillaryData;
  question.rewardToken = event.params.rewardToken;
  question.reward = event.params.reward;
  question.proposalBond = event.params.proposalBond;
  question.liveness = BigInt.fromU32(7200); // Default 2 hours
  question.initializedAt = event.params.requestTimestamp;
  question.resolved = false;
  question.conditionId = event.params.questionID;
  question.save();
}

export function handleQuestionResolved(event: QuestionResolved): void {
  const questionId = event.params.questionID.toHex();
  
  // Update Question
  let question = Question.load(questionId);
  if (question == null) {
    question = new Question(questionId);
    question.ancillaryData = Bytes.fromHexString('0x00') as Bytes;
    question.rewardToken = Bytes.fromHexString('0x00') as Bytes;
    question.reward = BigInt.fromU32(0);
    question.proposalBond = BigInt.fromU32(0);
    question.liveness = BigInt.fromU32(0);
    question.initializedAt = event.block.timestamp;
  }
  
  question.resolved = true;
  question.outcome = event.params.settledPrice;
  question.resolvedAt = event.block.timestamp;
  question.save();
  
  // Create Resolution record
  const resolutionId = questionId + '-' + event.transaction.hash.toHex();
  let resolution = new Resolution(resolutionId);
  resolution.question = questionId;
  resolution.outcome = event.params.settledPrice;
  resolution.resolvedAt = event.block.timestamp;
  resolution.blockNumber = event.block.number;
  resolution.transactionHash = event.transaction.hash;
  resolution.save();
}
