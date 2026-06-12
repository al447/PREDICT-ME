require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET;

(async () => {
  console.log('=== Sepolia Setup Check ===\n');
  console.log(`RPC:               ${SEPOLIA_RPC}`);
  console.log(`Platform Wallet:   ${PLATFORM_WALLET}\n`);

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);

  const network = await provider.getNetwork();
  console.log(`Chain ID:          ${network.chainId} (Sepolia is 11155111)`);
  if (Number(network.chainId) !== 11155111) {
    console.warn('WARNING: RPC is not Sepolia');
  } else {
    console.log('OK Connected to Sepolia\n');
  }

  // Native ETH balance of platform wallet
  const ethBal = await provider.getBalance(PLATFORM_WALLET);
  console.log(`Platform ETH balance: ${ethers.formatEther(ethBal)} ETH`);

  // USDC info
  try {
    const usdc = new ethers.Contract(SEPOLIA_USDC, ERC20_ABI, provider);
    const [sym, dec, bal] = await Promise.all([
      usdc.symbol(),
      usdc.decimals(),
      usdc.balanceOf(PLATFORM_WALLET),
    ]);
    console.log(`Sepolia USDC contract: ${SEPOLIA_USDC}`);
    console.log(`  Symbol:   ${sym}`);
    console.log(`  Decimals: ${dec}`);
    console.log(`  Platform balance: ${ethers.formatUnits(bal, dec)} ${sym}`);
  } catch (err) {
    console.warn('USDC check failed:', err.message);
  }

  console.log('\n=== Faucets ===');
  console.log('Sepolia ETH:  https://sepoliafaucet.com/ or https://www.alchemy.com/faucets/ethereum-sepolia');
  console.log('Sepolia USDC: https://faucet.circle.com (select Ethereum Sepolia)');
  console.log('\nReady to test Sepolia deposits.');
})().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
