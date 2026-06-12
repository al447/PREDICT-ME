/**
 * Contract factory for frontend
 * Provides read-only and signer-capable contract instances
 */

import { ethers } from 'ethers';
import { getSigner } from '../lib/getSigner.js';
import * as addresses from './addresses.js';

// Import all ABIs
import MockUSDC from './MockUSDC.json';
import ConditionalTokens from './ConditionalTokens.json';
import CTFExchange from './CTFExchange.json';
import UmaCtfAdapter from './UmaCtfAdapter.json';
import NegRiskAdapter from './NegRiskAdapter.json';
import NegRiskExchange from './NegRiskExchange.json';
import WalletFactory from './WalletFactory.json';
import MarketFactory from './MarketFactory.json';

const ABIS = {
  MockUSDC,
  ConditionalTokens,
  CTFExchange,
  UmaCtfAdapter,
  NegRiskAdapter,
  NegRiskExchange,
  WalletFactory,
  MarketFactory,
};

const CONTRACT_NAMES = {
  MockUSDC: 'MOCK_USDC_ADDRESS',
  ConditionalTokens: 'CONDITIONAL_TOKENS_ADDRESS',
  CTFExchange: 'CTF_EXCHANGE_ADDRESS',
  UmaCtfAdapter: 'UMA_CTF_ADAPTER_ADDRESS',
  NegRiskAdapter: 'NEG_RISK_ADAPTER_ADDRESS',
  NegRiskExchange: 'NEG_RISK_EXCHANGE_ADDRESS',
  WalletFactory: 'WALLET_FACTORY_ADDRESS',
  MarketFactory: 'MARKET_FACTORY_ADDRESS',
};

/**
 * Get read-only contract instance (uses public RPC)
 */
export function getReadContract(name) {
  const address = addresses[CONTRACT_NAMES[name]];
  const abi = ABIS[name];
  
  if (!address || !abi) {
    throw new Error(`Contract ${name} not found. Address: ${address}, ABI: ${abi ? 'loaded' : 'missing'}`);
  }
  
  const provider = new ethers.JsonRpcProvider(addresses.RPC_URL);
  return new ethers.Contract(address, abi, provider);
}

/**
 * Get signer-capable contract instance (for writes)
 */
export async function getContract(name, withSigner = true) {
  const address = addresses[CONTRACT_NAMES[name]];
  const abi = ABIS[name];
  
  if (!address || !abi) {
    throw new Error(`Contract ${name} not found. Address: ${address}, ABI: ${abi ? 'loaded' : 'missing'}`);
  }
  
  if (withSigner) {
    const signer = await getSigner();
    return new ethers.Contract(address, abi, signer);
  }
  
  const provider = new ethers.JsonRpcProvider(addresses.RPC_URL);
  return new ethers.Contract(address, abi, provider);
}

/**
 * Get contract address by name
 */
export function getContractAddress(name) {
  return addresses[CONTRACT_NAMES[name]];
}

/**
 * Get contract ABI by name
 */
export function getContractAbi(name) {
  return ABIS[name];
}
