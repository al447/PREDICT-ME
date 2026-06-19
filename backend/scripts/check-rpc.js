/**
 * RPC Connection Diagnostic
 */

const ethers = require('ethers');

const RPC_URLS = [
  { name: 'Polygon Amoy (PublicNode)', url: 'https://polygon-amoy-bor-rpc.publicnode.com' },
  { name: 'Polygon Mainnet (PublicNode)', url: 'https://polygon-bor-rpc.publicnode.com' },
  { name: 'Polygon Amoy (Alternative)', url: 'https://rpc-amoy.polygon.technology' },
];

async function testRPC(name, url) {
  try {
    console.log(`\nTesting ${name}...`);
    const provider = new ethers.JsonRpcProvider(url);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    console.log(`  ✅ Chain ID: ${network.chainId}`);
    console.log(`  ✅ Block: ${blockNumber}`);
    return true;
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('=== RPC CONNECTION TEST ===\n');
  
  for (const { name, url } of RPC_URLS) {
    await testRPC(name, url);
  }
  
  console.log('\n=== ENV CHECK ===');
  console.log('POLYGON_RPC_URL:', process.env.POLYGON_RPC_URL || 'NOT SET');
  console.log('POLYGON_AMOY_RPC_URL:', process.env.POLYGON_AMOY_RPC_URL || 'NOT SET');
  console.log('NETWORK:', process.env.NETWORK || 'NOT SET');
}

main();
