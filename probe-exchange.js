const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/.env' });

const RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
const EXCHANGE = process.env.EXCHANGE_ADDRESS || '0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF';
const CTF = process.env.CTF_ADDRESS || '0x688d809494D56aCD8ea8b252937e9b51F7F8111B';
const USDC = process.env.MOCK_USDC_ADDRESS;

const ABI = [
  'function domainSeparator() view returns (bytes32)',
  'function isOperator(address) view returns (bool)',
  'function isAdmin(address) view returns (bool)',
  'function getCollateral() view returns (address)',
  'function getCtf() view returns (address)',
];

// EIP-712 domain typehash: keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
const DOMAIN_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
));

function computeDomainSeparator(name, version, chainId, verifyingContract) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
    [
      DOMAIN_TYPEHASH,
      ethers.keccak256(ethers.toUtf8Bytes(name)),
      ethers.keccak256(ethers.toUtf8Bytes(version)),
      chainId,
      verifyingContract,
    ]
  ));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const operator = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY, provider);
  const ex = new ethers.Contract(EXCHANGE, ABI, provider);

  console.log('Exchange:', EXCHANGE);
  console.log('Operator:', operator.address);

  let onchainSep;
  try {
    onchainSep = await ex.domainSeparator();
    console.log('\nOn-chain domainSeparator():', onchainSep);
  } catch (e) {
    console.log('domainSeparator() failed:', e.message);
  }

  // Try to find which (name, version) reproduces the on-chain separator
  const candidates = [
    ['Polymarket CTF Exchange', '1'],
    ['PolyBet365 CTF Exchange', '1'],
    ['PredictMe CTF Exchange', '1'],
    ['CTF Exchange', '1'],
    ['PolyBet365 CTF Exchange', '0'],
  ];
  console.log('\nMatching domain name/version against on-chain separator (chainId 80002):');
  for (const [name, version] of candidates) {
    const sep = computeDomainSeparator(name, version, 80002, EXCHANGE);
    const match = sep.toLowerCase() === (onchainSep || '').toLowerCase();
    console.log(`  ${match ? 'MATCH ->' : '        '} name="${name}" version="${version}"  ${sep}`);
  }

  // Operator / admin status
  try { console.log('\nisOperator(operator):', await ex.isOperator(operator.address)); } catch (e) { console.log('isOperator failed:', e.message); }
  try { console.log('isAdmin(operator):', await ex.isAdmin(operator.address)); } catch (e) { console.log('isAdmin failed:', e.message); }

  // Approvals
  const erc20 = new ethers.Contract(USDC, ['function allowance(address,address) view returns (uint256)','function balanceOf(address) view returns (uint256)'], provider);
  const ctf = new ethers.Contract(CTF, ['function isApprovedForAll(address,address) view returns (bool)'], provider);
  try {
    const allow = await erc20.allowance(operator.address, EXCHANGE);
    const bal = await erc20.balanceOf(operator.address);
    console.log('\nOperator USDC balance:', ethers.formatUnits(bal, 6));
    console.log('Operator USDC->Exchange allowance:', ethers.formatUnits(allow, 6));
  } catch (e) { console.log('USDC check failed:', e.message); }
  try {
    const approved = await ctf.isApprovedForAll(operator.address, EXCHANGE);
    console.log('Operator CTF setApprovalForAll(Exchange):', approved);
  } catch (e) { console.log('CTF approval check failed:', e.message); }
}

main().catch(console.error);
