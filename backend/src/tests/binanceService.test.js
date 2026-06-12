/**
 * Tests for binanceService.js — Phase 8.3
 * Mocks HTTPS calls; no real network required.
 */

jest.mock('https');
const https = require('https');
const { EventEmitter } = require('events');

// Helper: mock a successful https.get response
function mockHttpsGet(body, statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  https.get.mockImplementation((url, opts, cb) => {
    const fn = typeof opts === 'function' ? opts : cb;
    fn(res);
    process.nextTick(() => {
      res.emit('data', JSON.stringify(body));
      res.emit('end');
    });
    return { on: jest.fn() };
  });
}

const { getSpotPrice, getKlines, getChartHistory, getKlineAt, RANGE_TO_INTERVAL } = require('../services/binanceService');

beforeEach(() => {
  jest.clearAllMocks();
  // Clear internal cache by resetting module — simpler: just override cache TTL check
});

describe('getSpotPrice', () => {
  it('returns parsed price for BTCUSDT', async () => {
    mockHttpsGet({ symbol: 'BTCUSDT', price: '67000.50' });
    const price = await getSpotPrice('BTC');
    expect(price).toBeCloseTo(67000.50);
  });

  it('returns null on HTTP error', async () => {
    mockHttpsGet({ msg: 'Invalid symbol' }, 400);
    const price = await getSpotPrice('INVALID');
    expect(price).toBeNull();
  });
});

describe('getKlines', () => {
  const mockKlines = [
    [1700000000000, '66000', '67000', '65000', '66500', '100'],
    [1700003600000, '66500', '68000', '66000', '67200', '120'],
  ];

  it('returns mapped kline objects', async () => {
    mockHttpsGet(mockKlines);
    const klines = await getKlines('BTC', '1h', 2);
    expect(klines).toHaveLength(2);
    expect(klines[0]).toMatchObject({ t: 1700000000000, close: 66500 });
  });

  it('returns null on network error', async () => {
    https.get.mockImplementation((url, opts, cb) => {
      const req = new EventEmitter();
      process.nextTick(() => req.emit('error', new Error('network')));
      return req;
    });
    const klines = await getKlines('BTC', '1h', 2);
    expect(klines).toBeNull();
  });
});

describe('RANGE_TO_INTERVAL mapping', () => {
  it('maps 1H → 1m', () => expect(RANGE_TO_INTERVAL['1H'].interval).toBe('1m'));
  it('maps 6H → 5m', () => expect(RANGE_TO_INTERVAL['6H'].interval).toBe('5m'));
  it('maps 1D → 15m', () => expect(RANGE_TO_INTERVAL['1D'].interval).toBe('15m'));
  it('maps 1W → 1h', () => expect(RANGE_TO_INTERVAL['1W'].interval).toBe('1h'));
  it('maps 1M → 4h', () => expect(RANGE_TO_INTERVAL['1M'].interval).toBe('4h'));
  it('maps ALL → 1d', () => expect(RANGE_TO_INTERVAL['ALL'].interval).toBe('1d'));
});

describe('getChartHistory', () => {
  const mockKlines = Array.from({ length: 60 }, (_, i) => [
    1700000000000 + i * 3600000, '100', '110', '90', `${100 + i}`, '50',
  ]);

  it('returns formatted chart points for range key', async () => {
    mockHttpsGet(mockKlines);
    const data = await getChartHistory('ETH', '1W');
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('price');
    expect(data[0]).toHaveProperty('date');
    expect(data[0]).toHaveProperty('fullDate');
  });

  it('returns formatted chart points for numeric days', async () => {
    mockHttpsGet(mockKlines);
    const data = await getChartHistory('ETH', 7);
    expect(Array.isArray(data)).toBe(true);
  });
});
