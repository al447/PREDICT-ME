/**
 * audit-onchain-markets.js
 *
 * Audits markets flagged onChain:true and checks whether each conditionId has
 * a prepared CTF condition (getOutcomeSlotCount > 0). Reports inconsistencies
 * and optionally fixes them.
 *
 * Modes:
 *   node scripts/audit-onchain-markets.js             -- audit only (dry run)
 *   node scripts/audit-onchain-markets.js --fix-flag  -- reset onChain=false for broken markets
 *   node scripts/audit-onchain-markets.js --fix-chain -- re-publish broken markets on-chain via MarketFactory
 *
 * Options:
 *   --limit=N          Process at most N markets (default: all)
 *   --concurrency=N    Parallel RPC checks (default: 5)
 *   --dry-run          Alias for audit-only (no writes)
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const { ADDRESSES, ABIS, getPolygonProvider } = require('../src/config/contracts');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FIX_FLAG  = args.includes('--fix-flag');   // reset onChain=false
const FIX_CHAIN = args.includes('--fix-chain');  // re-publish on MarketFactory
const DRY_RUN   = args.includes('--dry-run') || (!FIX_FLAG && !FIX_CHAIN);
const LIMIT_ARG = (args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '');
const CONC_ARG  = (args.find(a => a.startsWith('--concurrency=')) || '').replace('--concurrency=', '');
const LIMIT       = LIMIT_ARG   ? parseInt(LIMIT_ARG, 10)   : 0;
const CONCURRENCY = CONC_ARG    ? parseInt(CONC_ARG, 10)    : 5;

const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://predictme:PredictMe%40123@cluster0.jxvqzu2.mongodb.net/predictme';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run async tasks with bounded concurrency */
async function pMap(items, fn, concurrency) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** Check whether a conditionId is prepared on CTF (outcomeSlotCount > 0) */
async function isConditionPrepared(ctf, conditionId) {
  if (!conditionId || conditionId === '0x' + '0'.repeat(64)) return false;
  try {
    const slots = await ctf.getOutcomeSlotCount(conditionId);
    return slots > 0n;
  } catch {
    return false;
  }
}

/** Re-publish a single market on-chain by calling MarketFactory.createMarket */
async function republishMarket(market, deployer, marketFactoryContract, ctf) {
  const title = (market.title || market._id.toString()).slice(0, 200);
  const ancillaryData = ethers.hexlify(ethers.toUtf8Bytes(`q: ${title}`));

  const rewardToken = process.env.UMA_REWARD_TOKEN_ADDRESS || process.env.USDC_ADDRESS || process.env.MOCK_USDC_ADDRESS;

  const tx = await marketFactoryContract.createMarket(
    ethers.getBytes(ancillaryData),
    rewardToken,
    '0',
    '0',
    7200,
    !!market.negRisk,
    { gasLimit: 500_000 }
  );

  const receipt = await tx.wait();

  const event = receipt.logs
    .map(log => {
      try { return marketFactoryContract.interface.parseLog(log); } catch { return null; }
    })
    .find(e => e?.name === 'MarketCreated');

  if (!event) throw new Error('MarketCreated event not found in tx receipt');

  return {
    txHash:      receipt.hash,
    conditionId: event.args.conditionId,
    questionId:  event.args.questionId,
    token0:      event.args.token0.toString(),
    token1:      event.args.token1.toString(),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== AUDIT: onChain Markets vs CTF Condition Preparation ===');
  console.log(`Mode: ${FIX_CHAIN ? '--fix-chain (re-publish)' : FIX_FLAG ? '--fix-flag (reset onChain=false)' : 'DRY RUN (audit only)'}`);
  console.log(`Concurrency: ${CONCURRENCY} | Limit: ${LIMIT || 'all'}\n`);

  await mongoose.connect(MONGODB_URI);
  const Market = require('../src/models/Market');

  // 1. Fetch all onChain:true markets
  const query = { onChain: true };
  const total = await Market.countDocuments(query);
  console.log(`Total onChain:true markets in DB: ${total}`);

  const fetchQuery = Market.find(query).select(
    '_id title conditionId questionId token0 token1 onChainTxHash negRisk marketType candidates status'
  ).lean();

  if (LIMIT > 0) fetchQuery.limit(LIMIT);
  const markets = await fetchQuery;

  console.log(`Fetched: ${markets.length} markets for audit\n`);

  // 2. Set up on-chain read contracts
  const provider = getPolygonProvider();
  const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, provider);

  // 3. Audit each market — collect all conditionIds per market
  console.log('Checking conditions on CTF contract...');

  const results = await pMap(markets, async (market, i) => {
    const ids = [];

    // Binary market — single conditionId
    if (market.conditionId) ids.push({ field: 'conditionId', id: market.conditionId });

    // Grouped market — one conditionId per candidate
    if (market.marketType === 'grouped' && Array.isArray(market.candidates)) {
      market.candidates.forEach((c, ci) => {
        if (c.conditionId) ids.push({ field: `candidates[${ci}].conditionId`, id: c.conditionId });
      });
    }

    if (ids.length === 0) {
      // No conditionId at all — definitely broken
      return { market, broken: true, reason: 'no conditionId stored', ids: [] };
    }

    const checks = await Promise.all(ids.map(async ({ field, id }) => {
      const prepared = await isConditionPrepared(ctf, id);
      return { field, id, prepared };
    }));

    const anyBroken = checks.some(c => !c.prepared);

    if ((i + 1) % 25 === 0 || i + 1 === markets.length) {
      process.stdout.write(`\r  Checked ${i + 1}/${markets.length}...`);
    }

    return {
      market,
      broken: anyBroken,
      reason: anyBroken ? 'condition(s) not prepared on CTF' : null,
      checks,
    };
  }, CONCURRENCY);

  console.log('\n');

  const broken  = results.filter(r => r.broken);
  const healthy = results.filter(r => !r.broken);

  console.log(`✅  Healthy (condition prepared):   ${healthy.length}`);
  console.log(`❌  Broken  (condition NOT prepared): ${broken.length}`);
  console.log();

  if (broken.length === 0) {
    console.log('No inconsistencies found. All conditions are prepared.');
    await mongoose.disconnect();
    return;
  }

  // Print details of broken markets
  console.log('=== BROKEN MARKETS ===');
  broken.forEach(({ market, reason, checks, ids }) => {
    console.log(`\n  _id:        ${market._id}`);
    console.log(`  title:      ${(market.title || '').slice(0, 80)}`);
    console.log(`  status:     ${market.status}`);
    console.log(`  reason:     ${reason}`);
    if (checks && checks.length) {
      checks.forEach(c => {
        console.log(`  ${c.field}: ${c.id}  → prepared=${c.prepared}`);
      });
    } else {
      console.log(`  conditionId: (none)`);
    }
  });

  console.log('\n');

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes made. Re-run with --fix-flag or --fix-chain to apply fixes.');
    await mongoose.disconnect();
    return;
  }

  // ── Fix: reset onChain flag ─────────────────────────────────────────────
  if (FIX_FLAG) {
    console.log(`Resetting onChain=false for ${broken.length} markets...`);
    let fixed = 0, failed = 0;

    for (const { market } of broken) {
      try {
        await Market.findByIdAndUpdate(market._id, {
          onChain:      false,
          conditionId:  null,
          questionId:   null,
          token0:       null,
          token1:       null,
          onChainTxHash: null,
        });
        fixed++;
        process.stdout.write(`\r  Fixed: ${fixed}/${broken.length}`);
      } catch (err) {
        failed++;
        console.error(`\n  Failed to update ${market._id}: ${err.message}`);
      }
    }

    console.log(`\n\n✅  Reset onChain=false for ${fixed} markets. Failed: ${failed}`);
  }

  // ── Fix: re-publish on-chain ────────────────────────────────────────────
  if (FIX_CHAIN) {
    if (process.env.ONCHAIN_ENABLED !== 'true') {
      console.error('ERROR: ONCHAIN_ENABLED is not set to true. Cannot re-publish on-chain.');
      await mongoose.disconnect();
      process.exit(1);
    }

    const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!deployerKey) {
      console.error('ERROR: DEPLOYER_PRIVATE_KEY not set.');
      await mongoose.disconnect();
      process.exit(1);
    }

    const deployer = new ethers.Wallet(deployerKey, provider);
    const marketFactory = new ethers.Contract(ADDRESSES.MARKET_FACTORY, ABIS.MARKET_FACTORY, deployer);

    console.log(`Re-publishing ${broken.length} markets on-chain sequentially...`);
    console.log(`Deployer: ${deployer.address}\n`);

    let published = 0, skipped = 0, errored = 0;

    for (const { market } of broken) {
      // Skip grouped markets with multiple candidates — requires per-candidate logic
      if (market.marketType === 'grouped') {
        console.log(`  [SKIP] ${market._id} — grouped market (manual intervention required)`);
        skipped++;
        continue;
      }

      try {
        console.log(`  Publishing: ${(market.title || market._id).slice(0, 60)}...`);
        const result = await republishMarket(market, deployer, marketFactory, ctf);

        await Market.findByIdAndUpdate(market._id, {
          conditionId:   result.conditionId || null,
          questionId:    result.questionId  || null,
          token0:        result.token0      || null,
          token1:        result.token1      || null,
          onChainTxHash: result.txHash      || null,
          onChain:       true,
        });

        published++;
        console.log(`  ✅ tx=${result.txHash}  conditionId=${result.conditionId}`);

        // Sequential — wait 2s between transactions to avoid nonce issues
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        errored++;
        console.error(`  ❌ ${market._id}: ${err.shortMessage || err.message}`);
      }
    }

    console.log(`\n=== RESULTS ===`);
    console.log(`Published: ${published}`);
    console.log(`Skipped (grouped): ${skipped}`);
    console.log(`Errored: ${errored}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
