#!/usr/bin/env node
/**
 * Check Deployer Wallet Status
 * 
 * Usage: node check-deployer.js
 */

const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/.env' });

const RPC_URL = process.env.SEPOLIA_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com';
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const ADDRESSES = {
  MOCK_USDC: process.env.MOCK_USDC_ADDRESS || '0xC9EfbCF51e175a8171dDb7f65d709e71be969e56',
  MARKET_FACTORY: '0x14f5b9db28c1af09726cf0ca327652303565ae0e',
};

async function main() {
  console.log('='.repeat(60));
  console.log('DEPLOYER WALLET DIAGNOSTIC');
  console.log('='.repeat(60));
  console.log(`RPC: ${RPC_URL}`);
  console.log();

  if (!DEPLOYER_KEY) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  
  console.log(`Deployer Address: ${deployer.address}`);
  console.log();

  try {
    // Check MATIC balance
    const balance = await provider.getBalance(deployer.address);
    const matic = ethers.formatEther(balance);
    console.log(`MATIC Balance: ${matic}`);
    
    if (balance === 0n) {
      console.log('\n⚠️  WARNING: Deployer has NO MATIC!');
      console.log('   Get free MATIC from: https://faucet.polygon.technology/');
      console.log(`   Your address: ${deployer.address}`);
    } else if (balance < ethers.parseEther('0.01')) {
      console.log('\n⚠️  WARNING: Low MATIC balance (need ~0.01-0.1 per market)');
    } else {
      console.log('✅ MATIC balance OK');
    }

    // Check USDC balance
    const usdcAbi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
    const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, usdcAbi, provider);
    const usdcBalance = await usdc.balanceOf(deployer.address);
    const usdcDecimals = await usdc.decimals();
    console.log(`\nUSDC Balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)}`);

    // Check MarketFactory
    console.log('\n📋 Market Factory Status:');
    const factoryCode = await provider.getCode(ADDRESSES.MARKET_FACTORY);
    if (factoryCode === '0x') {
      console.log('❌ MarketFactory not deployed at this address!');
    } else {
      console.log('✅ MarketFactory contract exists');
    }

    // Check network
    const network = await provider.getNetwork();
    console.log(`\n🌐 Network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== 80002n) {
      console.log('⚠️  WARNING: Not on Polygon Amoy (expected chain 80002)');
    }

    // Gas price estimate
    const feeData = await provider.getFeeData();
    console.log(`\n⛽ Gas Price: ${ethers.formatUnits(feeData.maxFeePerGas || feeData.gasPrice, 'gwei')} gwei`);

    console.log('\n' + '='.repeat(60));
    
    if (balance === 0n) {
      console.log('\n🚫 CANNOT MIGRATE: Deployer needs MATIC for gas');
      console.log(`\n👉 Get free MATIC:`);
      console.log(`   1. Go to: https://faucet.polygon.technology/`);
      console.log(`   2. Select "Amoy" testnet`);
      console.log(`   3. Paste address: ${deployer.address}`);
      console.log(`   4. Request tokens`);
      console.log(`   5. Wait 30 seconds, then re-run migration`);
    } else {
      console.log('\n✅ Ready to migrate!');
      console.log(`   Run: node migrate-markets.js migrate 5`);
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
  
  console.log('='.repeat(60));
}

main();
