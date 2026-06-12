/**
 * relayerService.test.js
 * Unit tests for RELAYER_CONFIG.ALLOWED_METHODS and getMethodParamTypes.
 * Covers original methods + Phase 2 additions (fillOrder, matchOrders,
 * matchOrdersSimple, NegRisk split/merge/redeem).
 * No real RPC / ethers network calls needed.
 */

// Stub ethers so the module loads without a real provider
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(0n),
      getTransactionCount: jest.fn().mockResolvedValue(0),
    })),
    Wallet: jest.fn().mockImplementation(() => ({
      address: '0xRELAYER',
      provider: {},
    })),
  };
});

let relayer;
beforeEach(() => {
  jest.resetModules();
  // Minimal env so the module initialises without throwing
  process.env.RELAYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  process.env.POLYGON_AMOY_RPC_URL = 'https://polygon-amoy-bor-rpc.publicnode.com';
  jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    return {
      ...actual,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getBalance: jest.fn().mockResolvedValue(0n),
        getTransactionCount: jest.fn().mockResolvedValue(0),
      })),
      Wallet: jest.fn().mockImplementation(() => ({
        address: '0xRELAYER',
        provider: {},
      })),
    };
  });
  relayer = require('../services/relayerService');
});

// ── ALLOWED_METHODS ────────────────────────────────────────────────────────────

describe('RELAYER_CONFIG.ALLOWED_METHODS', () => {
  const REQUIRED_METHODS = [
    'approve',
    'splitPosition',
    'mergePositions',
    'redeemPositions',
    'split',
    'merge',
    'redeem',
    'fillOrder',
    'matchOrders',
    'matchOrdersSimple',
  ];

  REQUIRED_METHODS.forEach((method) => {
    it(`includes "${method}"`, () => {
      expect(relayer.RELAYER_CONFIG.ALLOWED_METHODS).toContain(method);
    });
  });

  it('contains no duplicate entries', () => {
    const methods = relayer.RELAYER_CONFIG.ALLOWED_METHODS;
    expect(methods.length).toBe(new Set(methods).size);
  });
});

// ── getMethodParamTypes ────────────────────────────────────────────────────────

describe('getMethodParamTypes', () => {
  it('approve returns [address, uint256]', () => {
    expect(relayer.getMethodParamTypes('approve')).toEqual(['address', 'uint256']);
  });

  it('splitPosition returns [address, bytes32, uint256]', () => {
    expect(relayer.getMethodParamTypes('splitPosition')).toEqual(['address', 'bytes32', 'uint256']);
  });

  it('mergePositions returns [address, bytes32, uint256]', () => {
    expect(relayer.getMethodParamTypes('mergePositions')).toEqual(['address', 'bytes32', 'uint256']);
  });

  it('redeemPositions returns [address, bytes32, uint256[], uint256[]]', () => {
    expect(relayer.getMethodParamTypes('redeemPositions')).toEqual([
      'address', 'bytes32', 'uint256[]', 'uint256[]',
    ]);
  });

  it('split (NegRisk) returns [bytes32, uint256]', () => {
    expect(relayer.getMethodParamTypes('split')).toEqual(['bytes32', 'uint256']);
  });

  it('merge (NegRisk) returns [bytes32, uint256]', () => {
    expect(relayer.getMethodParamTypes('merge')).toEqual(['bytes32', 'uint256']);
  });

  it('redeem (NegRisk) returns [bytes32, uint256[]]', () => {
    expect(relayer.getMethodParamTypes('redeem')).toEqual(['bytes32', 'uint256[]']);
  });

  it('fillOrder returns a non-empty array starting with a tuple type', () => {
    const types = relayer.getMethodParamTypes('fillOrder');
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    expect(types[0]).toMatch(/^tuple/);
  });

  it('matchOrders returns a non-empty array with tuple[] as first type', () => {
    const types = relayer.getMethodParamTypes('matchOrders');
    expect(Array.isArray(types)).toBe(true);
    expect(types[0]).toMatch(/^tuple.*\[\]/);
  });

  it('matchOrdersSimple returns [bytes32[], bytes32]', () => {
    expect(relayer.getMethodParamTypes('matchOrdersSimple')).toEqual(['bytes32[]', 'bytes32']);
  });

  it('returns empty array for unknown method', () => {
    expect(relayer.getMethodParamTypes('unknownMethod')).toEqual([]);
  });

  it('every ALLOWED_METHOD has a defined param type entry', () => {
    const { ALLOWED_METHODS } = relayer.RELAYER_CONFIG;
    for (const method of ALLOWED_METHODS) {
      const types = relayer.getMethodParamTypes(method);
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    }
  });
});

// ── USDC-only config guard ──────────────────────────────────────────────────────

describe('USDC-only config', () => {
  it('RELAYER_CONFIG has no USDT reference', () => {
    const configStr = JSON.stringify(relayer.RELAYER_CONFIG);
    expect(configStr.toLowerCase()).not.toContain('usdt');
  });
});
