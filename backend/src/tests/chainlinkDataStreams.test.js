/**
 * Tests for chainlinkDataStreams.js — Phase 8.3
 * Mocks https and chainlinkFeed; no real network required.
 */

jest.mock('https');
jest.mock('../services/chainlinkFeed', () => ({
  getChainlinkPrice: jest.fn(),
  hasFeed: jest.fn(),
}));

const https = require('https');
const { EventEmitter } = require('events');
const chainlinkFeed = require('../services/chainlinkFeed');

function mockHttpsGet(body, statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  https.get.mockImplementation((url, headers, cb) => {
    const fn = typeof headers === 'function' ? headers : cb;
    fn(res);
    process.nextTick(() => {
      res.emit('data', JSON.stringify(body));
      res.emit('end');
    });
    return { on: jest.fn() };
  });
}

// Re-require after mocks
let streams;
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  jest.mock('https');
  jest.mock('../services/chainlinkFeed', () => ({
    getChainlinkPrice: jest.fn(),
    hasFeed: jest.fn(),
  }));
  streams = require('../services/chainlinkDataStreams');
});

describe('getStreamPrice fallback to on-chain feed', () => {
  it('returns on-chain feed price when Streams key absent', async () => {
    delete process.env.CHAINLINK_STREAMS_API_KEY;
    const { getChainlinkPrice, hasFeed } = require('../services/chainlinkFeed');
    hasFeed.mockReturnValue(true);
    getChainlinkPrice.mockResolvedValue(67000);

    const price = await streams.getStreamPrice('BTC');
    expect(price).toBe(67000);
  });

  it('returns null when neither stream nor feed available', async () => {
    delete process.env.CHAINLINK_STREAMS_API_KEY;
    const { hasFeed } = require('../services/chainlinkFeed');
    hasFeed.mockReturnValue(false);

    const price = await streams.getStreamPrice('UNKNOWN_COIN');
    expect(price).toBeNull();
  });
});

describe('hasSettlementSource', () => {
  it('returns true for BTC (has stream ID)', () => {
    const { hasFeed } = require('../services/chainlinkFeed');
    hasFeed.mockReturnValue(true);
    expect(streams.hasSettlementSource('BTC')).toBe(true);
  });

  it('returns false for unknown symbol', () => {
    const { hasFeed } = require('../services/chainlinkFeed');
    hasFeed.mockReturnValue(false);
    expect(streams.hasSettlementSource('FAKECOIN')).toBe(false);
  });
});

describe('getChainlinkSettlementPrice alias', () => {
  it('delegates to getStreamPrice', async () => {
    delete process.env.CHAINLINK_STREAMS_API_KEY;
    const { getChainlinkPrice, hasFeed } = require('../services/chainlinkFeed');
    hasFeed.mockReturnValue(true);
    getChainlinkPrice.mockResolvedValue(3500);

    const price = await streams.getChainlinkSettlementPrice('ETH');
    expect(price).toBe(3500);
  });
});
