/**
 * Diagnose why maker bot splitPosition reverts.
 * Checks: operator MATIC, USDC balance, USDC allowance to CTF,
 * condition prepared (outcomeSlotCount), and simulates splitPosition.
 *
 * Usage: node scripts/diagnose-seed.js [conditionId]
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { ADDRESSES, ABIS, getOperatorKey, getPolygonProvider } = require('../src/config/contracts');

const CONDITION_ID = process.argv[2] || '0x6114a8a3f9ac214f48a7e20d169f1c7a5c84082cb6f7058ed9fe1137b11fd0e7';
const DEPTH_USDC = parseFloat(process.env.MAKER_DEPTH_USDC || '500');

async function main() {
  const provider = getPolygonProvider();
  const operator = new ethers.Wallet(getOperatorKey(), provider);
  const addr = operator.address;

  console.log('=== SEED DIAGNOSTIC ===');
  console.log('Operator:', addr);
  console.log('CTF:', ADDRESSES.CTF);
  console.log('USDC:', ADDRESSES.USDC);
  console.log('ConditionId:', CONDITION_ID);
  console.log('Depth USDC:', DEPTH_USDC);

  // 1. MATIC balance
  const matic = await provider.getBalance(addr);
  console.log('\nMATIC balance:', ethers.formatEther(matic));

  // 2. USDC balance + allowance
  const usdc = new ethers.Contract(
    ADDRESSES.USDC,
    [
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ],
    provider
  );
  const dec = await usdc.decimals().catch(() => 6);
  const bal = await usdc.balanceOf(addr);
  const allow = await usdc.allowance(addr, ADDRESSES.CTF);
  console.log('USDC decimals:', dec.toString());
  console.log('USDC balance:', ethers.formatUnits(bal, dec));
  console.log('USDC allowance → CTF:', ethers.formatUnits(allow, dec));

  // 3. Condition prepared?
  const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, provider);
  try {
    const slots = await ctf.getOutcomeSlotCount(CONDITION_ID);
    console.log('\nOutcomeSlotCount:', slots.toString(), slots === 0n ? '❌ CONDITION NOT PREPARED' : '✅');
  } catch (e) {
    console.log('\ngetOutcomeSlotCount error:', e.shortMessage || e.message);
  }

  // 4. Simulate splitPosition with callStatic
  const amount = ethers.parseUnits(DEPTH_USDC.toFixed(6), 6);
  console.log('\nSimulating splitPosition...');
  try {
    await ctf.connect(operator).splitPosition.staticCall(
      ADDRESSES.USDC,
      ethers.ZeroHash,
      CONDITION_ID,
      [1, 2],
      amount
    );
    console.log('✅ splitPosition simulation OK (would succeed)');
  } catch (e) {
    console.log('❌ splitPosition would REVERT:', e.shortMessage || e.reason || e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
