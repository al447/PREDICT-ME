/**
 * On-Chain Web3 Service
 * Reads from M1 contracts; writes (market creation) signed by deployer
 */

const { ethers } = require('ethers');
const { ADDRESSES, ABIS, RPC_URL, validate } = require('../config/contracts');

const ONCHAIN_ENABLED = process.env.ONCHAIN_ENABLED === 'true';

// Lazy singletons
let _provider = null;
let _deployerWallet = null;
let _contracts = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return _provider;
}

function getDeployerWallet() {
  if (!_deployerWallet) {
    const key = process.env.DEPLOYER_PRIVATE_KEY;
    if (!key) throw new Error('DEPLOYER_PRIVATE_KEY not set');
    _deployerWallet = new ethers.Wallet(key, getProvider());
  }
  return _deployerWallet;
}

function getContracts() {
  if (!_contracts) {
    validate();
    const provider = getProvider();
    const signer = getDeployerWallet();

    _contracts = {
      // Read-only (provider)
      usdc: new ethers.Contract(ADDRESSES.MOCK_USDC, ABIS.MOCK_USDC, provider),
      ctf: new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, provider),
      ctfExchange: new ethers.Contract(ADDRESSES.CTF_EXCHANGE, ABIS.CTF_EXCHANGE, provider),
      umaAdapter: new ethers.Contract(ADDRESSES.UMA_ADAPTER, ABIS.UMA_ADAPTER, provider),
      negRiskAdapter: new ethers.Contract(ADDRESSES.NEG_RISK_ADAPTER, ABIS.NEG_RISK_ADAPTER, provider),
      negRiskExchange: new ethers.Contract(ADDRESSES.NEG_RISK_EXCHANGE, ABIS.NEG_RISK_EXCHANGE, provider),
      walletFactory: new ethers.Contract(ADDRESSES.WALLET_FACTORY, ABIS.WALLET_FACTORY, provider),
      // Write-capable (signer)
      marketFactory: new ethers.Contract(ADDRESSES.MARKET_FACTORY, ABIS.MARKET_FACTORY, signer),
    };
  }
  return _contracts;
}

function guardEnabled() {
  if (!ONCHAIN_ENABLED) {
    throw new Error('ONCHAIN_ENABLED is not true');
  }
}

// ===== Read Methods =====

async function getUsdcBalance(address) {
  guardEnabled();
  const { usdc } = getContracts();
  const raw = await usdc.balanceOf(address);
  return Number(raw) / 1e6; // 6 decimals
}

async function getUsdcAllowance(owner, spender) {
  guardEnabled();
  const { usdc } = getContracts();
  const raw = await usdc.allowance(owner, spender);
  return Number(raw) / 1e6;
}

async function getMarketInfo(conditionId) {
  guardEnabled();
  const { marketFactory } = getContracts();
  const info = await marketFactory.getMarket(conditionId);
  return {
    questionId: info.questionId,
    conditionId: info.conditionId,
    token0: info.token0.toString(), // YES
    token1: info.token1.toString(), // NO
    collateral: info.collateral,
    createdAt: Number(info.createdAt),
    negRisk: info.negRisk,
  };
}

async function getPositionBalance(address, tokenId) {
  guardEnabled();
  const { ctf } = getContracts();
  const raw = await ctf.balanceOf(address, tokenId);
  return Number(raw);
}

async function getConditionPayouts(conditionId) {
  guardEnabled();
  const { ctf } = getContracts();
  const [numerator, denominator] = await Promise.all([
    ctf.payoutNumerators(conditionId, 0).catch(() => 0n),
    ctf.payoutDenominator(conditionId).catch(() => 0n),
  ]);
  return {
    numerator: Number(numerator),
    denominator: Number(denominator),
    resolved: denominator > 0n,
  };
}

async function predictWallet(owner) {
  guardEnabled();
  const { walletFactory } = getContracts();
  return await walletFactory.predictProxyAddress(owner);
}

async function proxyOf(owner) {
  guardEnabled();
  const { walletFactory } = getContracts();
  return await walletFactory.proxyOf(owner);
}

async function getChainStatus() {
  const provider = getProvider();
  const [block, chainId] = await Promise.all([
    provider.getBlockNumber(),
    provider.getNetwork().then(n => Number(n.chainId)),
  ]);
  return {
    enabled: ONCHAIN_ENABLED,
    chainId,
    block,
    addresses: ADDRESSES,
  };
}

// ===== Write Methods (deployer-signed) =====

/**
 * Create market on-chain via MarketFactory
 * @param {Object} params
 * @param {string} params.ancillaryData - UTF-8 question string as bytes
 * @param {string} params.rewardToken - USDC address
 * @param {string|number} params.reward - UMA reward (0 for no reward)
 * @param {string|number} params.proposalBond - UMA bond (e.g., 100 * 1e6 for 100 USDC)
 * @param {string|number} params.liveness - UMA liveness in seconds (e.g., 7200 = 2h)
 * @param {boolean} params.useNegRisk - false for binary, true for NegRisk markets
 * @returns {Promise<{txHash, conditionId, questionId, token0, token1}>}
 */
async function createMarketOnChain(params) {
  guardEnabled();
  const { marketFactory } = getContracts();

  const {
    ancillaryData,
    rewardToken,
    reward = 0,
    proposalBond = 100 * 1e6, // 100 USDC default
    liveness = 7200, // 2 hours default
    useNegRisk = false,
  } = params;

  // Convert ancillaryData to bytes if string (handle hex strings properly)
  let dataBytes;
  if (typeof ancillaryData === 'string') {
    // If it's already a hex string (0x...), decode it, otherwise convert to UTF-8
    if (ancillaryData.startsWith('0x')) {
      dataBytes = ethers.getBytes(ancillaryData);
    } else {
      dataBytes = ethers.toUtf8Bytes(ancillaryData);
    }
  } else {
    dataBytes = ancillaryData;
  }

  // Send transaction
  const tx = await marketFactory.createMarket(
    dataBytes,
    rewardToken,
    reward,
    proposalBond,
    liveness,
    useNegRisk
  );

  const receipt = await tx.wait();

  // Parse MarketCreated event
  const event = receipt.logs
    .map(log => {
      try {
        return marketFactory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(e => e?.name === 'MarketCreated');

  if (!event) {
    throw new Error('MarketCreated event not found in receipt');
  }

  return {
    txHash: receipt.hash,
    conditionId: event.args.conditionId,
    questionId: event.args.questionId,
    token0: event.args.token0.toString(),
    token1: event.args.token1.toString(),
    collateral: event.args.collateral,
    negRisk: event.args.negRisk,
  };
}

/**
 * Report payouts for a resolved condition on-chain (testnet/admin shortcut).
 *
 * On mainnet this is called by the UmaCtfAdapter after UMA OO settles.
 * On testnet (where UMA OO is stubbed) the deployer wallet acts as oracle
 * because it called prepareCondition() directly via MarketFactory.
 *
 * outcome: 'yes' → payouts = [1, 0]  (YES wins)
 *          'no'  → payouts = [0, 1]  (NO wins)
 *
 * @param {string} questionId  - bytes32 questionId from MarketFactory event
 * @param {string} outcome     - 'yes' | 'no'
 */
async function reportPayoutsOnChain(questionId, outcome) {
  guardEnabled();
  const provider = getProvider();
  const deployer = getDeployerWallet();

  // The oracle that called prepareCondition is the UmaCtfAdapter.
  // On testnet we impersonate it via the deployer who owns the stub.
  // We call CTF.reportPayouts() directly with the deployer as the oracle
  // because our freshMF (test) used the deployer-controlled UmaCtfAdapter stub.
  const ctfWithSigner = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, deployer);

  const payouts = outcome.toLowerCase() === 'yes' ? [1, 0] : [0, 1];

  const tx = await ctfWithSigner.reportPayouts(questionId, payouts, { gasLimit: 200_000 });
  const receipt = await tx.wait();

  console.log(`[OnChain] reportPayouts questionId=${questionId} outcome=${outcome} tx=${receipt.hash}`);
  return { txHash: receipt.hash, questionId, outcome, payouts };
}

/**
 * Check whether a condition is resolved and return redeemable amounts for a user.
 *
 * @param {string} conditionId
 * @param {string} userAddress - Safe proxy or EOA
 * @returns {{ resolved, token0Balance, token1Balance, redeemableUsdc }}
 */
async function getRedeemablePositions(conditionId, userAddress) {
  guardEnabled();
  const { ctf, marketFactory } = getContracts();

  const payouts = await getConditionPayouts(conditionId);
  if (!payouts.resolved) {
    return { resolved: false, token0Balance: 0, token1Balance: 0, redeemableUsdc: 0 };
  }

  const info = await getMarketInfo(conditionId);
  const [bal0, bal1] = await Promise.all([
    ctf.balanceOf(userAddress, info.token0).catch(() => 0n),
    ctf.balanceOf(userAddress, info.token1).catch(() => 0n),
  ]);

  const { numerator, denominator } = payouts;
  const price0 = denominator > 0 ? numerator / denominator : 0;
  const price1 = denominator > 0 ? (denominator - numerator) / denominator : 0;

  const redeemableUsdc = (Number(bal0) * price0 + Number(bal1) * price1) / 1e6;

  return {
    resolved:      true,
    token0Balance: Number(bal0),
    token1Balance: Number(bal1),
    redeemableUsdc,
    conditionId,
    token0: info.token0,
    token1: info.token1,
  };
}

/**
 * Redeem resolved CTF positions for a user via the operator wallet.
 * This is gasless for the user — operator pays the MATIC.
 * Called by the backend after UMA resolves the market.
 *
 * For non-custodial Safes, use the relayer's execSafeTransaction instead.
 * This function handles the direct-EOA or admin-sponsored path.
 *
 * @param {string} conditionId
 * @param {string} userAddress - Safe proxy or EOA that holds the CTF tokens
 * @returns {{ txHash, redeemed, usdcRecovered }}
 */
async function redeemPositions(conditionId, userAddress) {
  guardEnabled();
  const contracts = getContracts();
  const provider  = getProvider();

  // Use operator key to sponsor redemption (operator must be approved on CTF)
  const { getOperatorKey } = require('../config/contracts');
  const operator = new ethers.Wallet(getOperatorKey(), provider);

  const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, operator);

  const info = await getMarketInfo(conditionId);
  const [bal0, bal1] = await Promise.all([
    contracts.ctf.balanceOf(userAddress, info.token0).catch(() => 0n),
    contracts.ctf.balanceOf(userAddress, info.token1).catch(() => 0n),
  ]);

  if (bal0 === 0n && bal1 === 0n) {
    return { txHash: null, redeemed: false, reason: 'No CTF balance to redeem' };
  }

  // redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint[] indexSets)
  // indexSets: [1] = YES (partition 1), [2] = NO (partition 2)
  const indexSets = [];
  if (bal0 > 0n) indexSets.push(1);
  if (bal1 > 0n) indexSets.push(2);

  const tx = await ctf.redeemPositions(
    ADDRESSES.MOCK_USDC,
    ethers.ZeroHash,  // parentCollectionId = 0 for top-level
    conditionId,
    indexSets,
    { gasLimit: 300_000 }
  );

  const receipt = await tx.wait();
  console.log(`[OnChain] redeemPositions conditionId=${conditionId} user=${userAddress} tx=${receipt.hash}`);

  return {
    txHash:   receipt.hash,
    redeemed: true,
    conditionId,
    userAddress,
  };
}

module.exports = {
  getProvider,
  getDeployerWallet,
  getContracts,
  getUsdcBalance,
  getUsdcAllowance,
  getMarketInfo,
  getPositionBalance,
  getConditionPayouts,
  getRedeemablePositions,
  redeemPositions,
  predictWallet,
  proxyOf,
  getChainStatus,
  createMarketOnChain,
  reportPayoutsOnChain,
  ONCHAIN_ENABLED,
};
