require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

(async () => {
  const rpcUrl = process.env.WITHDRAW_RPC_URL || process.env.POLYGON_AMOY_RPC_URL;
  const tokenAddress = process.env.WITHDRAW_TOKEN_ADDRESS || process.env.MOCK_USDT_ADDRESS;
  const privateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  const platformWalletEnv = process.env.PLATFORM_WALLET;

  console.log('=== Withdraw Setup Check ===\n');
  console.log(`RPC URL:           ${rpcUrl}`);
  console.log(`Token Address:     ${tokenAddress}`);
  console.log(`Platform Wallet:   ${platformWalletEnv}`);
  console.log(`Signer Configured: ${privateKey ? 'YES' : 'NO'}\n`);

  if (!rpcUrl || !tokenAddress || !privateKey) {
    console.error('❌ Missing required env vars');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Signer Address:    ${wallet.address}`);
  if (platformWalletEnv && platformWalletEnv.toLowerCase() !== wallet.address.toLowerCase()) {
    console.warn(`⚠️  PLATFORM_WALLET (${platformWalletEnv}) does not match the signer derived from PRIVATE_KEY (${wallet.address})`);
  } else {
    console.log('✅ Signer matches PLATFORM_WALLET\n');
  }

  // Check native gas balance (POL/MATIC)
  const native = await provider.getBalance(wallet.address);
  const nativeFmt = ethers.formatEther(native);
  console.log(`Native Gas Balance: ${nativeFmt} (POL/MATIC)`);
  if (Number(nativeFmt) < 0.01) {
    console.warn('⚠️  Low gas balance — get testnet POL from: https://faucet.polygon.technology/');
  } else {
    console.log('✅ Sufficient gas for withdrawals\n');
  }

  // Check token balance & details
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  let symbol = 'TOKEN';
  let decimals = 6;
  try { symbol = await token.symbol(); } catch {}
  try { decimals = Number(await token.decimals()); } catch {}
  const tokenBal = await token.balanceOf(wallet.address);
  const tokenFmt = ethers.formatUnits(tokenBal, decimals);

  console.log(`Token Symbol:      ${symbol}`);
  console.log(`Token Decimals:    ${decimals}`);
  console.log(`Token Balance:     ${tokenFmt} ${symbol}`);
  if (Number(tokenFmt) < 1) {
    console.warn(`⚠️  Platform wallet has < 1 ${symbol}. Mint MockUSDT via faucet() function or fund the wallet.`);
  } else {
    console.log('✅ Sufficient liquidity for testing\n');
  }

  console.log('=== Network Info ===');
  const network = await provider.getNetwork();
  console.log(`Chain ID:          ${network.chainId}`);
  console.log(`Network Name:      ${network.name || 'polygon-amoy'}\n`);

  console.log('Ready to test withdrawal! 🚀');
})().catch(err => {
  console.error('❌ Setup check failed:', err.message);
  process.exit(1);
});
