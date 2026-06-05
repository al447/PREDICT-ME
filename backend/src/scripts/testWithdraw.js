require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// Burn address — safe destination (cannot be retrieved, proves on-chain flow)
const TO = process.argv[2] || '0x000000000000000000000000000000000000dEaD';
const AMOUNT = parseFloat(process.argv[3] || '1');

(async () => {
  console.log('=== Test Withdrawal (Polygon Amoy) ===\n');

  const rpcUrl = process.env.WITHDRAW_RPC_URL || process.env.POLYGON_AMOY_RPC_URL;
  const tokenAddress = process.env.WITHDRAW_TOKEN_ADDRESS || process.env.MOCK_USDT_ADDRESS;
  const privateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  const symbol = await token.symbol();
  const decimals = Number(await token.decimals());

  const balBefore = await token.balanceOf(wallet.address);
  const toBalBefore = await token.balanceOf(TO);

  console.log(`From:    ${wallet.address}`);
  console.log(`To:      ${TO}`);
  console.log(`Amount:  ${AMOUNT} ${symbol} (${decimals} decimals)`);
  console.log(`\nBalances BEFORE:`);
  console.log(`  Platform:  ${ethers.formatUnits(balBefore, decimals)} ${symbol}`);
  console.log(`  Recipient: ${ethers.formatUnits(toBalBefore, decimals)} ${symbol}\n`);

  const amountWei = ethers.parseUnits(AMOUNT.toFixed(decimals), decimals);

  console.log('Sending transaction...');
  const tx = await token.transfer(TO, amountWei);
  console.log(`  TxHash: ${tx.hash}`);
  console.log('  Waiting for confirmation...\n');

  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);
  console.log(`Status:   ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}\n`);

  const balAfter = await token.balanceOf(wallet.address);
  const toBalAfter = await token.balanceOf(TO);
  console.log('Balances AFTER:');
  console.log(`  Platform:  ${ethers.formatUnits(balAfter, decimals)} ${symbol}`);
  console.log(`  Recipient: ${ethers.formatUnits(toBalAfter, decimals)} ${symbol}\n`);

  const sent = balBefore - balAfter;
  const received = toBalAfter - toBalBefore;
  console.log(`Delta: -${ethers.formatUnits(sent, decimals)} from platform, +${ethers.formatUnits(received, decimals)} to recipient`);

  console.log(`\nView on explorer: https://amoy.polygonscan.com/tx/${tx.hash}`);
})().catch(err => {
  console.error('\nTest failed:', err.message);
  if (err.code) console.error('Error code:', err.code);
  process.exit(1);
});
