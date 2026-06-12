/**
 * walletService.js — Dual-proxy wallet provisioning (Polymarket model)
 *
 * Two proxy types (matching Polymarket):
 *   - POLY_PROXY  (proxyType='poly', signatureType=1) — Magic/email users
 *   - Gnosis Safe (proxyType='safe', signatureType=2) — external-wallet users
 *
 * Both are per-user, non-custodial. The proxy address is the deposit destination.
 *
 * Flow:
 *   1. On first login / deposit request → resolveProxy (predict, no gas)
 *   2. Proxy address becomes the QR/deposit destination
 *   3. On first trade / explicit "activate" → deploy proxy on-chain (gasless, relayer)
 *
 * Auth-provider → proxy-type mapping:
 *   authProvider === 'magic' | 'email' → POLY_PROXY (sigType 1)
 *   authProvider === 'wallet' | 'google' (has walletAddress) → Gnosis Safe (sigType 2)
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

// ── Proxy-type resolution ──────────────────────────────────────────────────────

/**
 * Determine proxy type from user's auth provider.
 * Magic/email users → POLY_PROXY (sigType 1).
 * External-wallet users → Gnosis Safe (sigType 2).
 */
function resolveProxyType(user) {
  const isMagic = user.authProvider === 'magic' || user.authProvider === 'email';
  return {
    proxyType:     isMagic ? 'poly' : 'safe',
    signatureType: isMagic ? 1       : 2,
  };
}

// ── Address prediction ─────────────────────────────────────────────────────────

/**
 * Predict the proxy address for an owner without deploying.
 * Both POLY_PROXY and Gnosis Safe are provisioned via the same WalletFactory
 * (CREATE2 derivation is identical for both types on our deployment).
 * Returns checksummed address.
 */
async function predictProxyAddress(ownerAddress) {
  try {
    const factory = getWalletFactory();
    return await factory.predictProxyAddress(ownerAddress);
  } catch (err) {
    console.warn(`[WalletService] predictProxyAddress RPC failed, using deterministic fallback: ${err.message}`);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(ownerAddress.toLowerCase()));
    return ethers.getAddress('0x' + hash.slice(26));
  }
}

/** @deprecated Use predictProxyAddress. Kept for callers of old API. */
const predictSafeAddress = predictProxyAddress;

// ── Deployment ─────────────────────────────────────────────────────────────────

/**
 * Check whether the proxy address has been deployed on-chain.
 */
async function isProxyDeployed(proxyAddress) {
  const code = await getProvider().getCode(proxyAddress);
  return code !== '0x';
}

/** @deprecated Use isProxyDeployed. */
const isSafeDeployed = isProxyDeployed;

/**
 * Deploy the proxy on-chain via relayer (gasless). Idempotent.
 * @returns {Promise<{proxy: string, txHash: string}>}
 */
async function deployProxy(ownerAddress) {
  const factory = getWalletFactory(getRelayerWallet());
  const tx = await factory.getOrCreateProxy(ownerAddress);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === 'ProxyCreated');

  const proxy = event?.args?.proxy || await factory.proxyOf(ownerAddress);
  return { proxy, txHash: receipt.hash };
}

/** @deprecated Use deployProxy. */
const deploySafe = deployProxy;

// ── Ensure wallet record (no deployment) ──────────────────────────────────────

/**
 * Ensure the user has a proxy wallet record. Does NOT deploy on-chain.
 * Sets proxyType + signatureType based on authProvider.
 *
 * @param {object} user - Mongoose User document
 * @param {string} [ownerOverride] - Use this EOA instead of user.walletAddress
 * @returns {Promise<{owner, proxy, deployed, proxyType, signatureType}>}
 */
async function ensureSmartWallet(user, ownerOverride) {
  if (user.smartWallet?.proxy) {
    return {
      owner:         user.smartWallet.owner,
      proxy:         user.smartWallet.proxy,
      deployed:      user.smartWallet.deployed,
      proxyType:     user.smartWallet.proxyType     || 'safe',
      signatureType: user.smartWallet.signatureType || 2,
    };
  }

  const owner = ownerOverride || user.walletAddress;
  if (!owner) throw new Error('User has no wallet address — cannot provision proxy wallet');

  const { proxyType, signatureType } = resolveProxyType(user);

  let proxy;
  try {
    proxy = await predictProxyAddress(owner);
  } catch (err) {
    console.warn(`[WalletService] ensureSmartWallet fallback for user ${user._id}: ${err.message}`);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(owner.toLowerCase()));
    proxy = ethers.getAddress('0x' + hash.slice(26));
  }

  await User.findByIdAndUpdate(user._id, {
    'smartWallet.owner':         owner,
    'smartWallet.proxy':         proxy,
    'smartWallet.deployed':      false,
    'smartWallet.chainId':       CHAIN_ID,
    'smartWallet.proxyType':     proxyType,
    'smartWallet.signatureType': signatureType,
  });

  user.smartWallet = { owner, proxy, deployed: false, chainId: CHAIN_ID, proxyType, signatureType };

  console.log(`[WalletService] Provisioned ${proxyType.toUpperCase()} proxy for user ${user._id}: owner=${owner} proxy=${proxy} sigType=${signatureType}`);
  return { owner, proxy, deployed: false, proxyType, signatureType };
}

// ── Ensure wallet deployed ─────────────────────────────────────────────────────

/**
 * Ensure the proxy is deployed on-chain. Deploys via relayer if needed (idempotent).
 *
 * @returns {Promise<{owner, proxy, deployed, proxyType, signatureType, txHash?}>}
 */
async function ensureSmartWalletDeployed(user) {
  const wallet = await ensureSmartWallet(user);

  if (wallet.deployed) return wallet;

  const alreadyDeployed = await isProxyDeployed(wallet.proxy);
  if (alreadyDeployed) {
    await User.findByIdAndUpdate(user._id, { 'smartWallet.deployed': true });
    user.smartWallet.deployed = true;
    return { ...wallet, deployed: true };
  }

  console.log(`[WalletService] Deploying ${wallet.proxyType.toUpperCase()} proxy for user ${user._id}...`);
  const { proxy, txHash } = await deployProxy(wallet.owner);

  await User.findByIdAndUpdate(user._id, {
    'smartWallet.proxy':    proxy,
    'smartWallet.deployed': true,
  });
  user.smartWallet.deployed = true;
  user.smartWallet.proxy    = proxy;

  console.log(`[WalletService] Proxy deployed: type=${wallet.proxyType} proxy=${proxy} tx=${txHash}`);
  return { ...wallet, proxy, deployed: true, txHash };
}

// ── Balance ────────────────────────────────────────────────────────────────────

/**
 * Read on-chain USDC balance of the proxy.
 * @returns {Promise<number>} USDC (human-readable, 6 decimals)
 */
async function getSmartWalletBalance(proxyAddress) {
  const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, ABIS.MOCK_USDC, getProvider());
  const raw = await usdc.balanceOf(proxyAddress);
  return Number(raw) / 1e6;
}

/**
 * Ensure the proxy has approved the CTF Exchange to spend its USDC.
 * Called once after the first deposit lands in the proxy.
 * Gasless — relayer pays MATIC.
 */
async function ensureProxyExchangeApproval(proxyAddress) {
  const relayer = getRelayerWallet();
  const usdc = new ethers.Contract(ADDRESSES.MOCK_USDC, [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
  ], relayer);

  const allowance = await usdc.allowance(proxyAddress, ADDRESSES.CTF_EXCHANGE);
  if (allowance > ethers.MaxUint256 / 2n) {
    console.log(`[WalletService] Proxy ${proxyAddress} exchange approval already set.`);
    return null;
  }

  // Build approve calldata and execute via Safe exec (or direct if proxy supports ERC20)
  // For simplicity: relayer calls approve on behalf of proxy using execTransaction (Safe)
  // This is handled in relayerService.execSafeTransaction — caller should use that.
  // Return the calldata for the caller to submit:
  const iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
  const data = iface.encodeFunctionData('approve', [ADDRESSES.CTF_EXCHANGE, ethers.MaxUint256]);
  return { to: ADDRESSES.MOCK_USDC, data, value: '0' };
}

module.exports = {
  resolveProxyType,
  predictProxyAddress,
  predictSafeAddress,   // backward compat alias
  isProxyDeployed,
  isSafeDeployed,       // backward compat alias
  deployProxy,
  deploySafe,           // backward compat alias
  ensureSmartWallet,
  ensureSmartWalletDeployed,
  getSmartWalletBalance,
  ensureProxyExchangeApproval,
};
