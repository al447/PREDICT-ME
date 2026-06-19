/**
 * setResolverForwarder.js
 *
 * Reads the Chainlink Automation Forwarder for our upkeep from the v2.1 Registry
 * and sets it on the CryptoMarketResolver via setForwarder(), so that
 * performUpkeep() can ONLY be called by the Automation network.
 *
 * Polygon Amoy Registry v2.1: 0x93C0e201f7B158F503a1265B6942088975f92ce7
 *
 * Signer: DEPLOYER_PRIVATE_KEY (resolver owner).
 *
 * Usage:
 *   UPKEEP_ID=<id> node src/scripts/setResolverForwarder.js
 */

require('dotenv').config();
const { ethers } = require('ethers');

const REGISTRY = '0x93C0e201f7B158F503a1265B6942088975f92ce7';
const RPC_URL = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com';
const RESOLVER = process.env.CRYPTO_MARKET_RESOLVER_ADDRESS;
const UPKEEP_ID = process.env.UPKEEP_ID;

function normalizeKey(key) {
  if (!key) return null;
  return key.startsWith('0x') ? key : `0x${key}`;
}

const REGISTRY_ABI = ['function getForwarder(uint256 upkeepID) view returns (address)'];
const RESOLVER_ABI = [
  'function setForwarder(address newForwarder) external',
  'function forwarder() view returns (address)',
  'function owner() view returns (address)',
];

async function main() {
  if (!RESOLVER) throw new Error('CRYPTO_MARKET_RESOLVER_ADDRESS not set');
  if (!UPKEEP_ID) throw new Error('UPKEEP_ID env var not set');

  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 137, name: 'polygon' });
  const signer = new ethers.Wallet(normalizeKey(process.env.DEPLOYER_PRIVATE_KEY), provider);

  const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, provider);
  const resolver = new ethers.Contract(RESOLVER, RESOLVER_ABI, signer);

  const forwarder = await registry.getForwarder(UPKEEP_ID);
  console.log('Upkeep forwarder:', forwarder);
  if (!forwarder || forwarder === ethers.ZeroAddress) {
    throw new Error('Registry returned zero forwarder — is the UPKEEP_ID correct?');
  }

  const owner = await resolver.owner();
  console.log('Resolver owner  :', owner);
  console.log('Signer          :', signer.address);
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not resolver owner (${owner})`);
  }

  const current = await resolver.forwarder();
  if (current.toLowerCase() === forwarder.toLowerCase()) {
    console.log('\n✅ Forwarder already set — no action needed.');
    return;
  }

  console.log('\nSetting forwarder on resolver...');
  const tx = await resolver.setForwarder(forwarder);
  console.log('  tx:', tx.hash);
  await tx.wait();
  console.log('  confirmed.');

  const updated = await resolver.forwarder();
  console.log('\n✅ Resolver forwarder set to:', updated);
}

main().catch((e) => {
  console.error('setForwarder failed:', e.message);
  process.exit(1);
});
