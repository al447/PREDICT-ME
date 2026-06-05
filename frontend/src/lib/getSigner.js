/**
 * Magic-aware signer resolution
 * Returns ethers signer for the active connection (Magic or browser wallet)
 */

import { ethers } from 'ethers';
import { getMagic } from './magic.js';
import { getWeb3ModalInstance } from './web3modal.js';

const AMOY_CHAIN_ID = 80002;

/**
 * Get read-only provider for Polygon Amoy
 */
export function getReadProvider() {
  const rpcUrl = import.meta.env.VITE_POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Check and prompt for correct chain
 */
async function ensureCorrectChain(browserProvider) {
  const network = await browserProvider.getNetwork();
  if (Number(network.chainId) !== AMOY_CHAIN_ID) {
    // Request chain switch
    try {
      await browserProvider.send('wallet_switchEthereumChain', [
        { chainId: `0x${AMOY_CHAIN_ID.toString(16)}` }
      ]);
    } catch (switchError) {
      // Chain not added, try adding it
      if (switchError.code === 4902) {
        await browserProvider.send('wallet_addEthereumChain', [{
          chainId: `0x${AMOY_CHAIN_ID.toString(16)}`,
          chainName: 'Polygon Amoy Testnet',
          nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
          rpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com'],
          blockExplorerUrls: ['https://amoy.polygonscan.com'],
        }]);
      } else {
        throw switchError;
      }
    }
  }
}

/**
 * Get connected signer (Magic or Web3Modal)
 * @returns {Promise<ethers.Signer>}
 */
export async function getSigner() {
  // 1. Check Magic first (social/email auth)
  const magic = await getMagic();
  if (magic && magic.rpcProvider) {
    const isLoggedIn = await magic.user.isLoggedIn();
    if (isLoggedIn) {
      const browserProvider = new ethers.BrowserProvider(magic.rpcProvider);
      await ensureCorrectChain(browserProvider);
      return await browserProvider.getSigner();
    }
  }

  // 2. Check Web3Modal (browser wallets)
  const web3Modal = getWeb3ModalInstance();
  if (web3Modal) {
    // Get wallet provider from Web3Modal
    const walletProvider = await web3Modal.getWalletProvider();
    if (walletProvider) {
      const browserProvider = new ethers.BrowserProvider(walletProvider);
      await ensureCorrectChain(browserProvider);
      return await browserProvider.getSigner();
    }
  }

  // 3. Check window.ethereum (injected, not via Web3Modal)
  if (window.ethereum) {
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    await ensureCorrectChain(browserProvider);
    return await browserProvider.getSigner();
  }

  throw new Error('No wallet connected. Please connect via Magic or Web3Modal.');
}

/**
 * Check if any wallet is connected
 */
export async function isWalletConnected() {
  try {
    const magic = await getMagic();
    if (magic) {
      const isLoggedIn = await magic.user.isLoggedIn();
      if (isLoggedIn) return true;
    }
    const web3Modal = getWeb3ModalInstance();
    if (web3Modal) {
      const walletProvider = await web3Modal.getWalletProvider();
      if (walletProvider) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get connected address without needing signer
 */
export async function getConnectedAddress() {
  try {
    const signer = await getSigner();
    return await signer.getAddress();
  } catch {
    return null;
  }
}
