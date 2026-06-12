/**
 * Tests for priceMarketResolver.js — Phase 8.3
 * Tests gte/lte outcome logic; mocks DB and Chainlink calls.
 */

// Helper: build a Market.find mock that returns an array via .lean()
function mockFind(rows) {
  return jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) });
}

describe('resolveExpiredPriceMarkets', () => {
  let resolver, Market, chainlink;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRICE_RESOLVER_ENABLED = 'true';
    process.env.CHAINLINK_AUTO_RESOLVE_ENABLED = 'true';

    jest.mock('../models/Market');
    jest.mock('../services/chainlinkDataStreams');
    jest.mock('../utils/classifyPriceMarket', () => ({
      parsePriceMarket: jest.fn().mockReturnValue(null),
    }));

    resolver = require('../services/priceMarketResolver');
    Market = require('../models/Market');
    chainlink = require('../services/chainlinkDataStreams');
  });

  it('returns early when disabled', async () => {
    jest.resetModules();
    process.env.PRICE_RESOLVER_ENABLED = 'false';
    process.env.CHAINLINK_AUTO_RESOLVE_ENABLED = 'false';
    jest.mock('../models/Market');
    jest.mock('../services/chainlinkDataStreams');
    jest.mock('../utils/classifyPriceMarket', () => ({ parsePriceMarket: jest.fn() }));
    const r = require('../services/priceMarketResolver');
    const result = await r.resolveExpiredPriceMarkets();
    expect(result).toEqual({ resolved: 0, skipped: 0, errors: 0 });
  });

  it('resolves YES for gte when price >= target', async () => {
    const market = {
      _id: 'mkt1', title: 'Will BTC hit $100k?', description: '',
      priceSymbol: 'BTC', priceTarget: 100000, priceComparator: 'gte',
      resolutionSource: 'chainlink', status: 'active',
    };
    chainlink.hasSettlementSource.mockReturnValue(true);
    chainlink.getSettlementPrice.mockResolvedValue({ price: 105000, source: 'feed', report: null });
    Market.find = mockFind([market]);
    Market.findOneAndUpdate = jest.fn().mockResolvedValue({ ...market, status: 'resolved' });

    const result = await resolver.resolveExpiredPriceMarkets();
    expect(result.resolved).toBe(1);
    expect(Market.findOneAndUpdate.mock.calls[0][1].resolvedOutcome).toBe('yes');
  });

  it('resolves NO for gte when price < target', async () => {
    const market = {
      _id: 'mkt2', title: 'Will BTC hit $100k?', description: '',
      priceSymbol: 'BTC', priceTarget: 100000, priceComparator: 'gte',
      resolutionSource: 'chainlink', status: 'active',
    };
    chainlink.hasSettlementSource.mockReturnValue(true);
    chainlink.getSettlementPrice.mockResolvedValue({ price: 80000, source: 'feed', report: null });
    Market.find = mockFind([market]);
    Market.findOneAndUpdate = jest.fn().mockResolvedValue({ ...market, status: 'resolved' });

    const result = await resolver.resolveExpiredPriceMarkets();
    expect(result.resolved).toBe(1);
    expect(Market.findOneAndUpdate.mock.calls[0][1].resolvedOutcome).toBe('no');
  });

  it('resolves YES for lte when price <= target', async () => {
    const market = {
      _id: 'mkt3', title: 'Will BTC drop below $50k?', description: '',
      priceSymbol: 'BTC', priceTarget: 50000, priceComparator: 'lte',
      resolutionSource: 'chainlink', status: 'active',
    };
    chainlink.hasSettlementSource.mockReturnValue(true);
    chainlink.getSettlementPrice.mockResolvedValue({ price: 45000, source: 'feed', report: null });
    Market.find = mockFind([market]);
    Market.findOneAndUpdate = jest.fn().mockResolvedValue({ ...market, status: 'resolved' });

    const result = await resolver.resolveExpiredPriceMarkets();
    expect(result.resolved).toBe(1);
    expect(Market.findOneAndUpdate.mock.calls[0][1].resolvedOutcome).toBe('yes');
  });

  it('skips uma markets', async () => {
    const market = {
      _id: 'mkt4', title: 'Who wins the election?', description: '',
      resolutionSource: 'uma', status: 'active',
    };
    chainlink.hasSettlementSource.mockReturnValue(false);
    Market.find = mockFind([market]);

    const result = await resolver.resolveExpiredPriceMarkets();
    expect(result.skipped).toBe(1);
    expect(result.resolved).toBe(0);
  });
});
