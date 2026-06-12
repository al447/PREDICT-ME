/**
 * setProxyFactory.js — Phase 0.5 Step 2
 *
 * Calls CTFExchange.setProxyFactory(WALLET_FACTORY_ADDRESS) from the operator
 * so the exchange recognises our WalletFactory for POLY_PROXY (sigType 1) address
 * derivation and validation.
 *
 * Also reads getProxyFactory() before/after to confirm the update.
 *
 * Usage: node src/scripts/setProxyFactory.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { ADDRESSES, ABIS, RPC_URL, getOperatorKey } = require('../config/contracts');

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const operator = new ethers.Wallet(getOperatorKey(), provider);
  const exchange = new ethers.Contract(ADDRESSES.CTF_EXCHANGE, ABIS.CTF_EXCHANGE, operator);

  const newFactory = ADDRESSES.WALLET_FACTORY;
  if (!newFactory || newFactory === ethers.ZeroAddress) {
    throw new Error('WALLET_FACTORY_ADDRESS not set in env');
  }

  console.log('Operator        :', operator.address);
  console.log('Exchange        :', ADDRESSES.CTF_EXCHANGE);
  console.log('New ProxyFactory:', newFactory);
  console.log('');

  // Read current factory
  let currentFactory;
  try {
    currentFactory = await exchange.getProxyFactory();
    console.log('Current proxyFactory:', currentFactory);
  } catch (e) {
    console.log('getProxyFactory() failed (may not exist on this ABI version):', e.message.slice(0, 80));
  }

  if (currentFactory?.toLowerCase() === newFactory.toLowerCase()) {
    console.log('\n✅ proxyFactory already set to WALLET_FACTORY — no action needed.');
    return;
  }

  // Check operator is admin
  let isAdmin = false;
  try {
    isAdmin = await exchange.isAdmin(operator.address);
  } catch (e) {
    // Some exchange versions use isOperator or hasRole
    try { isAdmin = await exchange.isOperator(operator.address); } catch {}
  }
  console.log('Operator is admin:', isAdmin);

  if (!isAdmin) {
    console.error('❌ Operator is NOT admin on CTFExchange — cannot call setProxyFactory.');
    console.error('   Run from the deployer account or add the operator as admin first.');
    process.exit(1);
  }

  console.log('\nCalling setProxyFactory...');
  try {
    const tx = await exchange.setProxyFactory(newFactory);
    console.log('Tx submitted:', tx.hash);
    const receipt = await tx.wait();
    console.log('Confirmed in block:', receipt.blockNumber);
  } catch (err) {
    console.error('❌ setProxyFactory failed:', err.message);
    if (err.data) console.error('   Revert data:', err.data);
    process.exit(1);
  }

  // Verify
  try {
    const updatedFactory = await exchange.getProxyFactory();
    if (updatedFactory.toLowerCase() === newFactory.toLowerCase()) {
      console.log('\n✅ proxyFactory updated successfully:', updatedFactory);
    } else {
      console.warn('⚠ proxyFactory mismatch after tx:', updatedFactory);
    }
  } catch (e) {
    console.log('Post-update getProxyFactory() check skipped:', e.message.slice(0, 60));
  }

  // Also try reading getPolyProxyFactoryImplementation (no-revert = wired correctly)
  try {
    const impl = await exchange.getPolyProxyFactoryImplementation();
    console.log('getPolyProxyFactoryImplementation:', impl);
  } catch (e) {
    console.log('getPolyProxyFactoryImplementation still reverts — proxy factory may need a matching implementation() getter:', e.message.slice(0, 80));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
