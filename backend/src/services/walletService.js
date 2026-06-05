/**
 * walletService.js — Per-user Gnosis Safe provisioning
 *
 * Every user gets their own 1-of-1 Gnosis Safe proxy (via WalletFactory).
 * The Safe is the non-custodial wallet that holds the user's USDC + ERC1155
 * prediction-market positions. The admin never controls these funds.
 *
 * Flow:
 *   1. On first login / deposit request → predictProxyAddress (no gas, instant)
 *   2. The predicted address is used as the deposit destination QR
 *   3. On first trade / explicit "activate wallet" → deploy the proxy on-chain
 *      (gasless via relayer, one-time ~200k gas)
 *
 * Key model (matches Polymarket's POLY_PROXY / Gnosis Safe approach):
 *   - Magic users: owner = Magic EOA address (user controls via Magic key)
 *   - Web3 users:  owner = connected wallet address
 */

const { ethers } = require('ethers');
const User = require('../models/User');
const { ADDRESSES, ABIS, RPC_URL, CHAIN_ID, getRelayerKey } = require('../config/contracts');

let _provider = null;
let _relayerWallet = null;

function getProvider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(RPC_URL);
  return _provider;
}

function getRelayerWallet() {
  if (!_relayerWallet) {
    _relayerWallet = new ethers.Wallet(getRelayerKey(), getProvider());
  }
  return _relayerWallet;
}

function getWalletFactory(signerOrProvider) {
  return new ethers.Contract(
    ADDRESSES.WALLET_FACTORY,
    ABIS.WALLET_FACTORY,
    signerOrProvider || getProvider()
  );
}

/**
 * Get the predicted Safe proxy address for an owner without deploying.
 * Uses WalletFactory.predictProxyAddress — pure computation, no gas.
 *
 * @param {string} ownerAddress - EOA that will own the Safe
 * @returns {Promise<string>} - Predicted proxy address (checksummed)
 */
async function predictSafeAddress(ownerAddress) {
  const factory = getWalletFactory();
  return await factory.predictProxyAddress(ownerAddress);
}

/**
 * Check whether a Safe proxy has been deployed on-chain.
 *
 * @param {string} proxyAddress
 * @returns {Promise<boolean>}
 */
async function isSafeDeployed(proxyAddress) {
  const provider = getProvider();
  const code = await provider.getCode(proxyAddress);
  return code !== '0x';
}

/**
 * Deploy a Safe proxy on-chain for the given owner via the relayer (gasless).
 * Calls WalletFactory.getOrCreateProxy(owner) — idempotent.
 *
 * @param {string} ownerAddress
 * @returns {Promise<{proxy: string, txHash: string}>}
 */
async function deploySafe(ownerAddress) {
  const factory = getWalletFactory(getRelayerWallet());
  const tx = await factory.getOrCreateProxy(ownerAddress);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try { return factory.interface.parseLog(log); } catch { return null; }
    })
    .find((e) => e?.name === 'ProxyCreated');

  const proxy = event?.args?.proxy || await factory.proxyOf(ownerAddress);
  return { proxy, txHash: receipt.hash };
}

/**
 * Ensure the user has a smart wallet record. Does NOT deploy on-chain.
 * Predicts the address instantly and persists it for use as deposit destination.
 *
 * @param {import('../models/User').default} user - Mongoose user document
 * @param {string} [ownerOverride] - Use this address instead of user.walletAddress
 * @returns {Promise<{owner: string, proxy: string, deployed: boolean}>}
 */
async function ensureSmartWallet(user, ownerOverride) {
  if (user.smartWallet?.proxy) {
    return {
      owner:    user.smartWallet.owner,
      proxy:    user.smartWallet.proxy,
      deployed: user.smartWallet.deployed,
    };
  }

  const owner = ownerOverride || user.walletAddress;
  if (!owner) {
    throw new Error('User has no wallet address — cannot provision smart wallet');
  }

  const proxy = await predictSafeAddress(owner);

  await User.findByIdAndUpdate(user._id, {
    'smartWallet.owner':   owner,
    'smartWallet.proxy':   proxy,
    'smartWallet.deployed': false,
    'smartWallet.chainId': CHAIN_ID,
  });

  user.smartWallet = { owner, proxy, deployed: false, chainId: CHAIN_ID };

  console.log(`[WalletService] Provisioned Safe for user ${user._id}: owner=${owner} proxy=${proxy}`);
  return { owner, proxy, deployed: false };
}

/**
 * Ensure the user's Safe is deployed on-chain. Deploys if needed (via relayer).
 * Safe to call multiple times — deployment is idempotent.
 *
 * @param {import('../models/User').default} user
 * @returns {Promise<{owner: string, proxy: string, deployed: boolean, txHash?: string}>}
 */
async function ensureSmartWalletDeployed(user) {
  const wallet = await ensureSmartWallet(user);

  if (wallet.deployed) return wallet;

  const alreadyDeployed = await isSafeDeployed(wallet.proxy);
  if (alreadyDeployed) {
    await User.findByIdAndUpdate(user._id, { 'smartWallet.deployed': true });
    user.smartWallet.deployed = true;
    return { ...wallet, deployed: true };
  }

  console.log(`[WalletService] Deploying Safe for user ${user._id} owner=${wallet.owner}...`);
  const { proxy, txHash } = await deploySafe(wallet.owner);

  await User.findByIdAndUpdate(user._id, {
    'smartWallet.proxy':    proxy,
    'smartWallet.deployed': true,
  });
  user.smartWallet.deployed = true;
  user.smartWallet.proxy    = proxy;

  console.log(`[WalletService] Safe deployed: proxy=${proxy} tx=${txHash}`);
  return { owner: wallet.owner, proxy, deployed: true, txHash };
}

/**
 * Get the on-chain USDC balance of a user's Safe.
 *
 * @param {string} proxyAddress
 * @returns {Promise<number>} balance in human-readable USDC (6 decimals)
 */
async function getSmartWalletBalance(proxyAddress) {
  const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, ABIS.MOCK_USDC, getProvider());
  const raw = await usdc.balanceOf(proxyAddress);
  return Number(raw) / 1e6;
}

module.exports = {
  predictSafeAddress,
  isSafeDeployed,
  deploySafe,
  ensureSmartWallet,
  ensureSmartWalletDeployed,
  getSmartWalletBalance,
};
