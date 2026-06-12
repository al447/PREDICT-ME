/**
 * Tests for utils/classifyPriceMarket.js — Phase 8.3
 * Tests parsePriceMarket title/comparator parsing matrix.
 */

jest.mock('../services/chainlinkDataStreams', () => ({
  hasSettlementSource: jest.fn().mockReturnValue(true),
}));

const { parsePriceMarket, classifyPriceMarket } = require('../utils/classifyPriceMarket');

describe('parsePriceMarket', () => {
  const cases = [
    ['Will BTC hit $100,000 by end of 2025?',   { symbol: 'BTC',  target: 100000, comparator: 'gte' }],
    ['Will ETH reach $5k?',                      { symbol: 'ETH',  target: 5000,   comparator: 'gte' }],
    ['Will Bitcoin drop below $30,000?',         { symbol: 'BTC',  target: 30000,  comparator: 'lte' }],
    ['Will SOL fall under $50?',                 { symbol: 'SOL',  target: 50,     comparator: 'lte' }],
    ['Will DOGE hit $1?',                        { symbol: 'DOGE', target: 1,      comparator: 'gte' }],
    ['Will BNB reach $1M?',                      { symbol: 'BNB',  target: 1000000,comparator: 'gte' }],
    ['Who will win the 2024 US election?',       null],
    ['Will Arsenal win the Premier League?',     null],
  ];

  test.each(cases)('%s', (title, expected) => {
    const result = parsePriceMarket(title, '');
    if (expected === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toMatchObject(expected);
    }
  });
});

describe('classifyPriceMarket', () => {
  it('classifies crypto price market as chainlink', () => {
    const result = classifyPriceMarket({ title: 'Will BTC hit $100k?', description: '' });
    expect(result.resolutionSource).toBe('chainlink');
    expect(result.priceMarket).toBe(true);
    expect(result.priceSymbol).toBe('BTC');
    expect(result.priceTarget).toBe(100000);
    expect(result.priceComparator).toBe('gte');
  });

  it('classifies subjective market as uma', () => {
    const result = classifyPriceMarket({ title: 'Will Trump win in 2024?', description: '' });
    expect(result.resolutionSource).toBe('uma');
    expect(result.priceMarket).toBe(false);
  });

  it('respects explicitly set resolutionSource', () => {
    const result = classifyPriceMarket({
      title: 'Admin market',
      description: '',
      resolutionSource: 'admin',
      priceSymbol: null,
      priceTarget: null,
    });
    expect(result.resolutionSource).toBe('admin');
  });
});
