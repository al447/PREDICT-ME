#!/usr/bin/env node
/**
 * Quick Market Migration Script - Testnet Only
 * 
 * Usage: node migrate-markets.js [dry|migrate] [limit]
 *   node migrate-markets.js dry      # Preview what will be migrated (default)
 *   node migrate-markets.js migrate 10 # Actually migrate 10 markets
 * 
 * Requires: BACKEND_URL and ADMIN_TOKEN env vars (or edit below)
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_TOKEN_HERE'; // <-- EDIT THIS

async function main() {
  const mode = process.argv[2] || 'dry';
  const limit = parseInt(process.argv[3] || '10', 10);
  const dryRun = mode !== 'migrate';

  if (ADMIN_TOKEN === 'YOUR_ADMIN_TOKEN_HERE') {
    console.error('❌ Please set your ADMIN_TOKEN in this script or via env var');
    console.error('   Get token from: Login to admin panel → check localStorage or network tab');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('MARKET MIGRATION - POLYGON AMOY TESTNET');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE MIGRATION'}`);
  console.log(`Limit: ${limit} markets`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log();

  try {
    // Step 1: Check status
    console.log('📊 Fetching current status...');
    const statusRes = await fetch(`${BACKEND_URL}/api/onchain/markets/status`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    
    if (!statusRes.ok) {
      throw new Error(`Status check failed: ${statusRes.status} ${statusRes.statusText}`);
    }
    
    const status = await statusRes.json();
    
    console.log(`\n📈 Current State:`);
    console.log(`   Total markets: ${status.summary?.total || '?'}`);
    console.log(`   ✅ On-chain: ${status.summary?.onChain || 0}`);
    console.log(`   ⏳ Pending: ${status.summary?.pending || 0}`);
    
    if (status.summary?.pending === 0) {
      console.log('\n✅ All markets are already on-chain! Nothing to migrate.');
      process.exit(0);
    }

    if (dryRun) {
      console.log('\n🔍 Showing pending markets:');
      status.pendingMarkets?.slice(0, limit).forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.title}`);
      });
      if (status.pendingMarkets?.length > limit) {
        console.log(`   ... and ${status.pendingMarkets.length - limit} more`);
      }
    }

    // Step 2: Execute migration
    console.log(`\n${dryRun ? '🔍' : '🚀'} Running ${dryRun ? 'dry run' : 'migration'}...\n`);
    
    const migrateRes = await fetch(`${BACKEND_URL}/api/onchain/markets/migrate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ limit, dryRun })
    });

    if (!migrateRes.ok) {
      const err = await migrateRes.json().catch(() => ({}));
      throw new Error(err.error || `Migration failed: ${migrateRes.status}`);
    }

    const result = await migrateRes.json();

    if (dryRun) {
      console.log('📋 DRY RUN RESULTS:');
      console.log(`   Would migrate: ${result.wouldMigrate} markets`);
      console.log('\nMarkets to migrate:');
      result.markets?.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.title} ${m.negRisk ? '(NegRisk)' : ''}`);
      });
      console.log('\n👉 To actually migrate, run:');
      console.log(`   node migrate-markets.js migrate ${limit}`);
    } else {
      console.log('✅ MIGRATION COMPLETE!\n');
      console.log(`   Total: ${result.total}`);
      console.log(`   ✅ Success: ${result.migrated}`);
      console.log(`   ❌ Failed: ${result.failed}`);
      
      if (result.results?.some(r => r.success)) {
        console.log('\n📤 Successful migrations:');
        result.results.filter(r => r.success).forEach((r) => {
          console.log(`   ✓ ${r.title}`);
          console.log(`     Condition: ${r.conditionId?.slice(0, 20)}...`);
          console.log(`     Tx: https://amoy.polygonscan.com/tx/${r.txHash}`);
        });
      }
      
      if (result.results?.some(r => !r.success)) {
        console.log('\n❌ Failed migrations:');
        result.results.filter(r => !r.success).forEach((r) => {
          console.log(`   ✗ ${r.title}: ${r.error}`);
        });
      }

      // Refresh status
      console.log('\n📊 Fetching updated status...');
      const newStatusRes = await fetch(`${BACKEND_URL}/api/onchain/markets/status`, {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
      });
      const newStatus = await newStatusRes.json();
      console.log(`\n📈 New State:`);
      console.log(`   ✅ On-chain: ${newStatus.summary?.onChain || 0} (${newStatus.summary?.onChainPercentage || 0}%)`);
      console.log(`   ⏳ Pending: ${newStatus.summary?.pending || 0}`);
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
}

main();
