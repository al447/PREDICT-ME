/**
 * setOperatorApprovals.js — one-time operator (market-maker) approvals.
 *
 * The operator wallet acts as the on-chain liquidity counterparty. To settle
 * trades via CTFExchange it must:
 *   1. Approve USDC -> CTFExchange  (so the exchange can pull USDC when operator buys)
 *   2. Approve USDC -> CTF          (so splitPosition can pull USDC to mint YES+NO)
 *   3. setApprovalForAll(CTFExchange) on CTF (so the exchange can move operator's ERC1155 outcome tokens)
 *
 * Idempotent: skips approvals already set. Safe to re-run.
 *
 * Usage: node src/scripts/setOperatorApprovals.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { ADDRESSES, RPC_URL, getOperatorKey } = require('../config/contracts');

const MAX_UINT = ethers.MaxUint256;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const operator = new ethers.Wallet(getOperatorKey(), provider);

  console.log('Operator:', operator.address);
  console.log('Exchange:', ADDRESSES.CTF_EXCHANGE);
  console.log('CTF:     ', ADDRESSES.CTF);
  console.log('USDC:    ', ADDRESSES.USDC);

  const usdc = new ethers.Contract(ADDRESSES.USDC, [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
  ], operator);

  const ctf = new ethers.Contract(ADDRESSES.CTF, [
    'function isApprovedForAll(address,address) view returns (bool)',
    'function setApprovalForAll(address,bool)',
  ], operator);

  // 1. USDC -> Exchange
  const allowEx = await usdc.allowance(operator.address, ADDRESSES.CTF_EXCHANGE);
  if (allowEx < MAX_UINT / 2n) {
    const tx = await usdc.approve(ADDRESSES.CTF_EXCHANGE, MAX_UINT);
    await tx.wait();
    console.log('USDC -> Exchange approved. tx=', tx.hash);
  } else {
    console.log('USDC -> Exchange already approved.');
  }

  // 2. USDC -> CTF (for splitPosition)
  const allowCtf = await usdc.allowance(operator.address, ADDRESSES.CTF);
  if (allowCtf < MAX_UINT / 2n) {
    const tx = await usdc.approve(ADDRESSES.CTF, MAX_UINT);
    await tx.wait();
    console.log('USDC -> CTF approved. tx=', tx.hash);
  } else {
    console.log('USDC -> CTF already approved.');
  }

  // 3. CTF setApprovalForAll(Exchange)
  const approvedAll = await ctf.isApprovedForAll(operator.address, ADDRESSES.CTF_EXCHANGE);
  if (!approvedAll) {
    const tx = await ctf.setApprovalForAll(ADDRESSES.CTF_EXCHANGE, true);
    await tx.wait();
    console.log('CTF setApprovalForAll(Exchange) set. tx=', tx.hash);
  } else {
    console.log('CTF setApprovalForAll(Exchange) already set.');
  }

  console.log('\nOperator approvals complete.');
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
