#!/usr/bin/env node
/**
 * publishMarketOnChain.js — Publish existing DB markets to the M1 on-chain stack
 *
 * Usage:
 *   # Dry-run (no on-chain tx, just show what would be published):
 *   node src/scripts/publishMarketOnChain.js --dry-run
 *
 *   # Publish all DB markets that are not yet on-chain:
 *   node src/scripts/publishMarketOnChain.js
 *
 *   # Publish a single market by MongoDB ID:
 *   node src/scripts/publishMarketOnChain.js --id <mongoId>
 *
 * What this does:
 *   1. Loads each DB market that has onChain=false (or no conditionId)
 *   2. Calls MarketFactory.createMarket(ancillaryData, ...) via the deployer key
 *   3. Stores conditionId, token0, token1, onChainTxHash, onChain=true in MongoDB
 *
 * On Amoy: deployer pays MATIC for gas. On mainnet: same, but real MATIC.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { ethers }  = require('ethers');
const { ADDRESSES, ABIS, RPC_URL, validate, CHAIN_ID, BLOCK_EXPLORER } = require('../config/contracts');

const Market = require('../models/Market');

const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const ONLY_ID  = args.find((a) => a === '--id') ? args[args.indexOf('--id') + 1] : null;

const UMA_LIVENESS         = 7200;  // 2 hours
const UMA_BOND             = (100 * 1e6).toString(); // 100 USDC (6 dec)

async function main() {
  console.log(`\n=== publishMarketOnChain (chain=${CHAIN_ID}, rpc=${RPC_URL}) ===`);
  if (DRY_RUN)  console.log('[DRY-RUN] No transactions will be sent.\n');
  if (ONLY_ID)  console.log(`[FILTER]  Only publishing market _id=${ONLY_ID}\n`);

  validate();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[DB] Connected\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const factory  = new ethers.Contract(ADDRESSES.MARKET_FACTORY, ABIS.MARKET_FACTORY, deployer);

  const query = { onChain: { $ne: true } };
  if (ONLY_ID) query._id = ONLY_ID;

  const markets = await Market.find(query).lean();
  console.log(`[DB] Found ${markets.length} market(s) to publish.\n`);

  if (markets.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  let successCount = 0;
  let errorCount   = 0;

  for (const market of markets) {
    const title = market.title || market.question || market._id.toString();
    console.log(`\n--- ${title} ---`);
    console.log(`    DB _id     : ${market._id}`);
    console.log(`    Category   : ${market.category || 'N/A'}`);
    console.log(`    useNegRisk : ${!!market.negRisk}`);

    // Build ancillaryData: title as UTF-8 bytes
    const ancillaryData = ethers.hexlify(ethers.toUtf8Bytes(
      `title: "${title}", description: "${market.description || ''}", source: PredictMe`
    ));

    if (DRY_RUN) {
      console.log(`    [DRY-RUN] Would call MarketFactory.createMarket with ancillaryData=${ancillaryData.slice(0, 40)}...`);
      successCount++;
      continue;
    }

    try {
      const tx = await factory.createMarket(
        ancillaryData,
        ADDRESSES.MOCK_USDC,     // rewardToken
        '0',                     // reward (0 — no UMA reward incentive)
        UMA_BOND,                // proposalBond
        UMA_LIVENESS,            // liveness in seconds
        !!market.negRisk         // useNegRisk
      );

      console.log(`    [TX] Sent: ${tx.hash}`);
      console.log(`         Explorer: ${BLOCK_EXPLORER}/tx/${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`    [TX] Mined in block ${receipt.blockNumber}`);

      // Parse MarketCreated event to extract conditionId + token addresses
      const iface = factory.interface;
      let conditionId = null;
      let token0      = null;
      let token1      = null;
      let questionId  = null;

      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'MarketCreated') {
            conditionId = parsed.args.conditionId;
            token0      = parsed.args.token0;
            token1      = parsed.args.token1;
            questionId  = parsed.args.questionId;
            break;
          }
        } catch { /* not this ABI */ }
      }

      if (!conditionId) {
        console.warn('    [WARN] MarketCreated event not found in receipt. Using tx hash as identifier.');
      }

      await Market.findByIdAndUpdate(market._id, {
        conditionId:   conditionId || null,
        questionId:    questionId  || null,
        token0:        token0      || null,
        token1:        token1      || null,
        onChainTxHash: receipt.hash,
        onChain:       true,
      });

      console.log(`    [DB] Updated market ${market._id}:`);
      console.log(`         conditionId: ${conditionId}`);
      console.log(`         token0:      ${token0}`);
      console.log(`         token1:      ${token1}`);
      successCount++;

    } catch (err) {
      console.error(`    [ERROR] Failed to publish market ${market._id}:`, err.message);
      errorCount++;
    }

    // Brief pause between transactions to avoid nonce issues
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n=== Done: ${successCount} published, ${errorCount} errors ===\n`);
  await mongoose.disconnect();
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
