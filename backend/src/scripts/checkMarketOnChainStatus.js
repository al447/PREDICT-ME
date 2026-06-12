/**
 * Check Market On-Chain Status
 * 
 * Run this script to see which markets are:
 * - Fully on-chain (published to CTF with conditionId + tokens)
 * - Pending (not yet published, will use off-chain fallback)
 * 
 * Usage: node src/scripts/checkMarketOnChainStatus.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/predictme';

async function checkMarkets() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB\n');

    const Market = mongoose.model('Market', new mongoose.Schema({}, { strict: false }));

    // Get all markets with relevant fields
    const markets = await Market.find({})
      .select('_id title status onChain conditionId questionId token0 token1 negRisk createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const onChainMarkets = [];
    const pendingMarkets = [];

    for (const m of markets) {
      const isOnChain = m.onChain === true && m.conditionId && m.token0 && m.token1;
      
      if (isOnChain) {
        onChainMarkets.push({
          _id: m._id.toString(),
          title: m.title,
          status: m.status,
          conditionId: m.conditionId,
          yesTokenId: m.token0,
          noTokenId: m.token1,
          negRisk: m.negRisk,
          createdAt: m.createdAt,
        });
      } else {
        pendingMarkets.push({
          _id: m._id.toString(),
          title: m.title,
          status: m.status,
          onChain: m.onChain,
          hasConditionId: !!m.conditionId,
          hasToken0: !!m.token0,
          hasToken1: !!m.token1,
          createdAt: m.createdAt,
        });
      }
    }

    console.log('='.repeat(80));
    console.log('MARKET ON-CHAIN STATUS REPORT');
    console.log('='.repeat(80));
    console.log(`\nTotal markets: ${markets.length}`);
    console.log(`✅ On-chain (CLOB trading): ${onChainMarkets.length}`);
    console.log(`⏳ Pending (off-chain fallback): ${pendingMarkets.length}`);
    console.log();

    if (onChainMarkets.length > 0) {
      console.log('-'.repeat(80));
      console.log('ON-CHAIN MARKETS (Will use CLOB order book)');
      console.log('-'.repeat(80));
      onChainMarkets.forEach((m, i) => {
        console.log(`\n${i + 1}. ${m.title}`);
        console.log(`   ID: ${m._id}`);
        console.log(`   Status: ${m.status}`);
        console.log(`   Condition ID: ${m.conditionId}`);
        console.log(`   YES Token: ${m.yesTokenId}`);
        console.log(`   NO Token: ${m.noTokenId}`);
        console.log(`   NegRisk: ${m.negRisk ? 'Yes' : 'No'}`);
        console.log(`   Created: ${new Date(m.createdAt).toLocaleDateString()}`);
      });
    }

    if (pendingMarkets.length > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('PENDING MARKETS (Will use off-chain pari-mutuel fallback)');
      console.log('-'.repeat(80));
      pendingMarkets.forEach((m, i) => {
        console.log(`\n${i + 1}. ${m.title}`);
        console.log(`   ID: ${m._id}`);
        console.log(`   Status: ${m.status}`);
        console.log(`   Missing: ${[
          !m.hasConditionId && 'conditionId',
          !m.hasToken0 && 'token0 (yesTokenId)',
          !m.hasToken1 && 'token1 (noTokenId)',
          m.onChain !== true && 'onChain flag'
        ].filter(Boolean).join(', ') || 'None - check flags'}`);
        console.log(`   Created: ${new Date(m.createdAt).toLocaleDateString()}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('NEXT STEPS');
    console.log('='.repeat(80));
    
    if (pendingMarkets.length === 0) {
      console.log('\n✅ All markets are on-chain! CLOB trading is active for all.');
    } else {
      console.log(`\n⏳ ${pendingMarkets.length} market(s) need to be published on-chain.`);
      console.log('\nTo publish a pending market:');
      console.log('  1. Go to Admin Panel → Markets');
      console.log('  2. Find the pending market');
      console.log('  3. Click "Publish On-Chain" or use API:');
      console.log(`     POST /api/onchain/market/{marketId}/publish`);
      console.log('\nOr run the bulk migration script (if you want me to create it).');
    }

    console.log();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

checkMarkets();
