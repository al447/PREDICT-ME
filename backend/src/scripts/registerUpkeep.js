/**
 * registerUpkeep.js — Programmatic Chainlink Automation upkeep registration.
 *
 * The web UI at automation.chain.link disables "Register new Upkeep" on Polygon
 * Amoy (v2.1 testnet sunset). This script registers the CryptoMarketResolver as
 * a Custom-Logic (conditional) upkeep directly via the AutomationRegistrar2_1,
 * by approving LINK and calling registerUpkeep().
 *
 * Polygon Amoy (chainId 80002):
 *   Registry  v2.1: 0x93C0e201f7B158F503a1265B6942088975f92ce7
 *   Registrar v2.1: 0x99083A4bb154B0a3EC7a0D1eb40370C892Db4225
 *   LINK token    : 0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904
 *
 * Signer: DEPLOYER_PRIVATE_KEY (holds the 25 LINK; also the resolver owner so it
 * becomes the upkeep admin). Override LINK amount with UPKEEP_LINK (default 5).
 *
 * Usage:
 *   node src/scripts/registerUpkeep.js
 *   UPKEEP_LINK=8 node src/scripts/registerUpkeep.js
 */

require('dotenv').config();
const { ethers } = require('ethers');

// ── Polygon Amoy Chainlink Automation v2.1 addresses ────────────────────────
const REGISTRAR = '0x99083A4bb154B0a3EC7a0D1eb40370C892Db4225';
const REGISTRY   = '0x93C0e201f7B158F503a1265B6942088975f92ce7';
const LINK       = '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904';

const RPC_URL = process.env.POLYGON_AMOY_RPC_URL
  || process.env.POLYGON_RPC_URL
  || 'https://polygon-amoy-bor-rpc.publicnode.com';

const RESOLVER = process.env.CRYPTO_MARKET_RESOLVER_ADDRESS;
const LINK_AMOUNT = process.env.UPKEEP_LINK || '5';        // LINK to fund
const GAS_LIMIT = parseInt(process.env.UPKEEP_GAS_LIMIT || '500000', 10);
const UPKEEP_NAME = process.env.UPKEEP_NAME || 'PolyBet365 Crypto Resolver';

function normalizeKey(key) {
  if (!key) return null;
  return key.startsWith('0x') ? key : `0x${key}`;
}

const LINK_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// AutomationRegistrar2_1.registerUpkeep(RegistrationParams)
const REGISTRAR_ABI = [
  'function registerUpkeep((string name, bytes encryptedEmail, address upkeepContract, uint32 gasLimit, address adminAddress, uint8 triggerType, bytes checkData, bytes triggerConfig, bytes offchainConfig, uint96 amount) requestParams) returns (uint256 id)',
  'event RegistrationApproved(bytes32 indexed hash, string displayName, uint256 indexed upkeepId)',
  'event RegistrationRequested(bytes32 indexed hash, string name, bytes encryptedEmail, address indexed upkeepContract, uint32 gasLimit, address adminAddress, uint8 triggerType, bytes checkData, bytes triggerConfig, bytes offchainConfig, uint96 amount, address indexed sender)',
];

const REGISTRY_ABI = [
  'event UpkeepRegistered(uint256 indexed id, uint32 performGas, address admin)',
];

async function main() {
  if (!RESOLVER || RESOLVER === ethers.ZeroAddress) {
    throw new Error('CRYPTO_MARKET_RESOLVER_ADDRESS not set in env');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 137, name: 'polygon' });
  const signer = new ethers.Wallet(normalizeKey(process.env.DEPLOYER_PRIVATE_KEY), provider);

  const amountJuels = ethers.parseUnits(LINK_AMOUNT, 18);

  console.log('=== Register Chainlink Automation Upkeep ===');
  console.log('Signer / Admin :', signer.address);
  console.log('Resolver       :', RESOLVER);
  console.log('Registrar      :', REGISTRAR);
  console.log('Gas limit      :', GAS_LIMIT);
  console.log('LINK to fund   :', LINK_AMOUNT, 'LINK');
  console.log('');

  const link = new ethers.Contract(LINK, LINK_ABI, signer);
  const registrar = new ethers.Contract(REGISTRAR, REGISTRAR_ABI, signer);

  // ── Balance check ──
  const bal = await link.balanceOf(signer.address);
  console.log('LINK balance   :', ethers.formatUnits(bal, 18));
  if (bal < amountJuels) {
    throw new Error(`Insufficient LINK: have ${ethers.formatUnits(bal, 18)}, need ${LINK_AMOUNT}`);
  }

  // ── Approve LINK to registrar (if needed) ──
  const allowance = await link.allowance(signer.address, REGISTRAR);
  if (allowance < amountJuels) {
    console.log('Approving LINK to registrar...');
    const aTx = await link.approve(REGISTRAR, amountJuels);
    console.log('  approve tx:', aTx.hash);
    await aTx.wait();
    console.log('  approved.');
  } else {
    console.log('LINK allowance already sufficient.');
  }

  // ── Build registration params (Custom Logic = triggerType 0) ──
  const params = {
    name:           UPKEEP_NAME,
    encryptedEmail: '0x',
    upkeepContract: RESOLVER,
    gasLimit:       GAS_LIMIT,
    adminAddress:   signer.address,
    triggerType:    0,        // 0 = conditional (custom logic)
    checkData:      '0x',
    triggerConfig:  '0x',
    offchainConfig: '0x',
    amount:         amountJuels,
  };

  console.log('\nRegistering upkeep...');
  const tx = await registrar.registerUpkeep(params);
  console.log('  register tx:', tx.hash);
  const receipt = await tx.wait();
  console.log('  confirmed in block:', receipt.blockNumber);

  // ── Parse logs for the upkeep ID ──
  const ifaces = [
    new ethers.Interface(REGISTRAR_ABI),
    new ethers.Interface(REGISTRY_ABI),
  ];
  let upkeepId = null;
  let autoApproved = false;
  for (const log of receipt.logs) {
    for (const iface of ifaces) {
      try {
        const parsed = iface.parseLog(log);
        if (!parsed) continue;
        if (parsed.name === 'RegistrationApproved' || parsed.name === 'UpkeepRegistered') {
          upkeepId = parsed.args.upkeepId?.toString() || parsed.args.id?.toString();
          autoApproved = true;
        } else if (parsed.name === 'RegistrationRequested') {
          // Pending manual approval (auto-approve disabled)
          autoApproved = false;
        }
      } catch { /* not this iface */ }
    }
  }

  console.log('\n=== Result ===');
  if (upkeepId) {
    console.log('✅ Upkeep registered & active.');
    console.log('Upkeep ID :', upkeepId);
    console.log('Manage at : https://automation.chain.link/polygon-amoy/' + upkeepId);
  } else {
    console.log('⚠ Registration submitted but auto-approve appears disabled.');
    console.log('  A RegistrationRequested event was emitted — the request may need');
    console.log('  manual approval by the registry owner, or check the dashboard.');
  }

  console.log('\nNext: copy the upkeep Forwarder address and run setForwarder on the resolver.');
}

main().catch((e) => {
  console.error('registerUpkeep failed:', e.message);
  if (e.info?.error) console.error('  detail:', JSON.stringify(e.info.error).slice(0, 300));
  process.exit(1);
});
