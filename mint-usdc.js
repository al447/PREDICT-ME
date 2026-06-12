const { ethers } = require('ethers');

const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) public",
  "function balanceOf(address account) view returns (uint256)"
];

const MOCK_USDC_ADDRESS = "0xC9EfbCF51e175a8171dDb7f65d709e71be969e56";
const YOUR_ADDRESS = "0x4F054b6Bb4fFA7297568D98a9d6A5237b7718B85";

// Connect to Amoy network
const provider = new ethers.JsonRpcProvider("https://polygon-amoy-bor-rpc.publicnode.com");

// Create wallet from private key
// You'll need to enter your private key here (keep it secret!)
// Or you can use: const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const wallet = new ethers.Wallet("YOUR_PRIVATE_KEY_HERE", provider);

const contract = new ethers.Contract(MOCK_USDC_ADDRESS, MOCK_USDC_ABI, wallet);

async function mint() {
  try {
    console.log("Minting 1000 MockUSDC to:", YOUR_ADDRESS);
    
    const amount = ethers.parseUnits("1000", 6); // 1000 USDC with 6 decimals
    const tx = await contract.mint(YOUR_ADDRESS, amount);
    
    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for confirmation...");
    
    await tx.wait();
    console.log("✅ Minted successfully!");
    
    const balance = await contract.balanceOf(YOUR_ADDRESS);
    console.log("Your balance:", ethers.formatUnits(balance, 6), "USDC");
  } catch (error) {
    console.error("Error:", error.message);
    console.log("\nNote: Only the contract owner can mint. If this fails, you may need to:");
    console.log("1. Get USDC from a different source");
    console.log("2. Or use Uniswap to swap Amoy MATIC for USDC");
  }
}

// Check balance first
async function checkBalance() {
  const readContract = new ethers.Contract(MOCK_USDC_ADDRESS, MOCK_USDC_ABI, provider);
  const balance = await readContract.balanceOf(YOUR_ADDRESS);
  console.log("Current balance:", ethers.formatUnits(balance, 6), "USDC");
}

checkBalance().then(() => {
  // Uncomment the line below to mint (requires private key)
  // mint();
});
