import { useQuery } from '@tanstack/react-query';
import { polymarketAPI } from '../services/api';

/**
 * Fetches real-time price history for multiple market tokens from Polymarket CLOB API.
 * Each slide's outcomes have associated CLOB token IDs.
 * Returns formatted chart data ready for recharts.
 */

// Map of carousel market slugs to their CLOB token IDs per outcome
// These are real Polymarket token IDs from live markets
const CAROUSEL_MARKETS = {
  'starmer-out': {
    slug: 'starmer-out-by',
    outcomes: [
      { key: 'dec31', label: 'December 31', color: '#FF7F0E', tokenId: '51508280778202349361616850684455231843716212176724253736363122559269229712002' },
      { key: 'jun30', label: 'June 30', color: '#FDC503', tokenId: '62614530899811899520477071094017427677157399768883595101593938165574544434518' },
      { key: 'may31', label: 'May 31', color: '#4378FF', tokenId: '18122400545605805714121443731624484796893305512593228143644504942154607855386' },
      { key: 'may19', label: 'May 19', color: '#87BFFF', tokenId: '3186812161617275136941873065600103851370007880588093249814268822949706568368' },
    ],
    interval: 'all',
  },
  'iran-deal': {
    slug: 'us-x-iran-permanent-peace-deal',
    outcomes: [
      { key: 'dec31', label: 'December 31', color: '#FF7F0E', tokenId: '97451684594339658527640686745076004983379363188612844397736805725669559082608' },
      { key: 'jun30', label: 'June 30', color: '#FDC503', tokenId: '42498579290170525937803365597001189493798686141769429176410526295573824619073' },
      { key: 'may31', label: 'May 31', color: '#4378FF', tokenId: '34554555827438551101000555305203609600029621153428996114009350892614396532498' },
      { key: 'may15', label: 'May 15', color: '#87BFFF', tokenId: '59804740893116830082655722678282357324530422193334657680222344987920273408829' },
    ],
    interval: 'all',
  },
  'man-city-vs-palace': {
    slug: 'epl-mac-cry-2026-03-21',
    outcomes: [
      { key: 'city', label: 'Man City', color: '#4378FF', tokenId: '59926179825727217606167341176846116057970189763068493202217393131144123674309' },
      { key: 'draw', label: 'Draw', color: '#FDC503', tokenId: '32246936252145176064268879083356302397903981456046560618741718375991557154603' },
      { key: 'palace', label: 'Crystal Palace', color: '#FF7F0E', tokenId: '47798652524102667635886769882234495418506879283040748965001754646341968655128' },
    ],
    interval: '1d',
  },
  'btc-5min': {
    slug: 'btc-up-or-down-5m',
    outcomes: [
      { key: 'up', label: 'Up', color: '#22c55e', tokenId: '' },
      { key: 'down', label: 'Down', color: '#ef4444', tokenId: '' },
    ],
    interval: '1d',
    isCrypto: true,
  },
  'eurovision': {
    slug: 'eurovision-winner-2025',
    outcomes: [
      { key: 'finland', label: 'Finland', color: '#4378FF', tokenId: '86631791178102284835303627564230753701108406544829251476759909669813938704600' },
      { key: 'greece', label: 'Greece', color: '#FF7F0E', tokenId: '88304163265734087403223321042172792808390195323159743956352682998398711353447' },
      { key: 'denmark', label: 'Denmark', color: '#FDC503', tokenId: '70364657290228044448461397404440906092275799648915793839023224483022545171360' },
      { key: 'france', label: 'France', color: '#87BFFF', tokenId: '82294265279517788069388087838037305194656998172027244775425123449776048199682' },
    ],
    interval: 'all',
  },
  'hantavirus': {
    slug: 'hantavirus-pandemic-2026',
    outcomes: [
      { key: 'yes', label: 'Yes', color: '#22c55e', tokenId: '104718292808309433767402444061650910790437726449955521731268760928480423099204' },
    ],
    interval: 'all',
  },
};

/**
 * Transform raw CLOB price history {t, p} into chart-ready format
 * Groups timestamps across all outcome series into unified time axis
 */
function transformPriceHistory(allSeries, maxPoints = 60) {
  if (!allSeries.length || allSeries.every(s => !s.history?.length)) return null;

  // Find the series with the most points to use as time axis
  const longestSeries = allSeries.reduce((a, b) =>
    (a.history?.length || 0) >= (b.history?.length || 0) ? a : b
  );

  const history = longestSeries.history || [];
  if (!history.length) return null;

  // Downsample if too many points
  const step = Math.max(1, Math.floor(history.length / maxPoints));
  const sampledTimestamps = history
    .filter((_, i) => i % step === 0 || i === history.length - 1)
    .map(pt => pt.t);

  // For each sampled timestamp, find the closest price in each series
  const chartData = sampledTimestamps.map(t => {
    const point = { t };
    allSeries.forEach(series => {
      if (!series.history?.length) return;
      // Binary search for closest timestamp
      let closest = series.history[0];
      let minDiff = Math.abs(t - closest.t);
      for (const h of series.history) {
        const diff = Math.abs(t - h.t);
        if (diff < minDiff) { minDiff = diff; closest = h; }
        if (h.t > t + 600) break; // past the point, stop early
      }
      point[series.key] = Math.round(closest.p * 100);
    });
    return point;
  });

  // Convert timestamps to readable date labels
  const formatTime = (t) => {
    const d = new Date(t * 1000);
    const month = d.toLocaleString('en', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day}`;
  };

  return chartData.map(pt => ({
    ...pt,
    t: formatTime(pt.t),
  }));
}

/**
 * Hook to fetch real-time Polymarket chart data for a specific carousel market
 */
export function usePolymarketPrices(marketKey) {
  const config = CAROUSEL_MARKETS[marketKey];

  return useQuery({
    queryKey: ['polymarket-prices', marketKey],
    queryFn: async () => {
      if (!config) return null;

      // Skip crypto (BTC) — uses different API
      if (config.isCrypto) return null;

      const tokenIds = config.outcomes.filter(o => o.tokenId).map(o => o.tokenId);
      if (!tokenIds.length) return null;

      const response = await polymarketAPI.getBatchPricesHistory(
        tokenIds,
        config.interval,
        30
      );

      const seriesData = response.data.map(result => {
        const outcome = config.outcomes.find(o => o.tokenId === result.tokenId);
        return {
          key: outcome?.key || 'unknown',
          history: result.history,
        };
      });

      const chartData = transformPriceHistory(seriesData);
      if (!chartData) return null;

      return {
        chartData,
        chartLines: config.outcomes.filter(o => o.tokenId).map(o => ({
          key: o.key,
          label: o.label,
          color: o.color,
        })),
      };
    },
    staleTime: 30_000, // Refresh every 30s
    refetchInterval: 30_000,
    enabled: !!config && !config.isCrypto,
  });
}

/**
 * Hook to fetch all carousel markets at once
 */
export function useAllCarouselPrices() {
  const keys = Object.keys(CAROUSEL_MARKETS).filter(k => !CAROUSEL_MARKETS[k].isCrypto);

  return useQuery({
    queryKey: ['polymarket-carousel-all'],
    queryFn: async () => {
      const results = {};

      await Promise.all(
        keys.map(async (marketKey) => {
          const config = CAROUSEL_MARKETS[marketKey];
          const tokenIds = config.outcomes.filter(o => o.tokenId).map(o => o.tokenId);
          if (!tokenIds.length) return;

          try {
            const response = await polymarketAPI.getBatchPricesHistory(
              tokenIds,
              config.interval,
              30
            );

            const seriesData = response.data.map(result => {
              const outcome = config.outcomes.find(o => o.tokenId === result.tokenId);
              return { key: outcome?.key || 'unknown', history: result.history };
            });

            const chartData = transformPriceHistory(seriesData);
            if (chartData) {
              results[marketKey] = {
                chartData,
                chartLines: config.outcomes.filter(o => o.tokenId).map(o => ({
                  key: o.key,
                  label: o.label,
                  color: o.color,
                })),
              };
            }
          } catch (err) {
            console.warn(`Failed to fetch prices for ${marketKey}:`, err);
          }
        })
      );

      return results;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export { CAROUSEL_MARKETS };
