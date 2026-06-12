import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { Loader2 } from 'lucide-react';
import { marketsAPI } from '../../services/api';
import { generateHistoricalData } from '../../utils/format';
import useCryptoPriceStream from '../../hooks/useCryptoPriceStream';

const TIME_RANGES = ['1H', '6H', '1D', '1W', '1M', 'ALL'];
const RANGE_DAYS = { '1H': 1, '6H': 1, '1D': 1, '1W': 7, '1M': 30, 'ALL': 90 };
const OUTCOME_COLORS = ['#22c55e', '#ef4444', '#FDC503', '#4378FF', '#FF7F0E', '#87BFFF'];

const fmtPrice = (v) => {
  if (v == null) return '—';
  if (v >= 1000) return `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
};

const MarketChart = ({ market }) => {
  const [timeRange, setTimeRange] = useState('1M');
  const basePrice = market?.outcomes?.[0]?.price || 50;
  const slug = market?.slug;
  const isCryptoCategory = market?.categorySlug === 'crypto';
  const days = RANGE_DAYS[timeRange] || 30;

  // Try crypto price history first for crypto markets
  const { data: cryptoData, isLoading: cryptoLoading } = useQuery({
    queryKey: ['market-crypto-price-history', slug, timeRange],
    queryFn: async () => {
      if (!slug) return null;
      try {
        const res = await marketsAPI.getCryptoPriceHistory(slug, timeRange);
        if (!res.data?.isCrypto) return null;
        if (!res.data?.chartData?.length) return { ...res.data, _unavailable: true };
        return res.data;
      } catch (err) {
        console.error('[MarketChart] Failed to fetch crypto price:', err.message);
        return null;
      }
    },
    enabled: !!slug && isCryptoCategory,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  // Live price stream via Binance WS (display only)
  const cryptoSymbol = cryptoData?.symbol || null;
  const liveSymbols = useMemo(() => (isCryptoCategory && cryptoSymbol ? [cryptoSymbol] : []), [isCryptoCategory, cryptoSymbol]);
  const livePrices = useCryptoPriceStream(liveSymbols);
  const livePrice = cryptoSymbol ? livePrices[cryptoSymbol]?.price ?? null : null;

  // Append live tick to chart data ref
  const [liveTick, setLiveTick] = useState(null);
  const lastLiveRef = useRef(null);
  useEffect(() => {
    if (livePrice == null || !cryptoSymbol) return;
    if (lastLiveRef.current === livePrice) return;
    lastLiveRef.current = livePrice;
    const now = Date.now();
    setLiveTick({
      t: now,
      date: new Date(now).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      fullDate: new Date(now).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      price: Math.round(livePrice * 100) / 100,
    });
  }, [livePrice, cryptoSymbol]);

  const isCryptoChart = !!cryptoData?.chartData?.length;
  const isCryptoUnavailable = !!cryptoData?._unavailable;
  const isLiveStreaming = isCryptoChart && livePrice != null;

  // Fetch probability history from our backend (for non-crypto markets or as fallback)
  const { data: realData, isLoading: probLoading } = useQuery({
    queryKey: ['market-price-history-detail', slug, days],
    queryFn: async () => {
      if (!slug) return null;
      const res = await marketsAPI.getPriceHistory(slug, days);
      if (!res.data?.chartData?.length) return null;
      const outcomes = res.data.outcomes || [];
      const chartData = res.data.chartData.map(pt => {
        const point = { date: pt.t, fullDate: pt.t };
        outcomes.forEach(o => {
          const safeKey = o.replace(/[^a-zA-Z0-9]/g, '_');
          point[safeKey] = pt[o];
        });
        return point;
      });
      const lines = outcomes.map((o, i) => ({
        key: o.replace(/[^a-zA-Z0-9]/g, '_'),
        label: o,
        color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
      }));
      return { chartData, lines };
    },
    enabled: !!slug && !isCryptoChart,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const isLoading = isCryptoCategory ? cryptoLoading : probLoading;

  // Fallback to generated data if everything fails
  const POINTS_MAP = { '1H': 12, '6H': 24, '1D': 24, '1W': 7, '1M': 30, 'ALL': 90 };
  const fallbackData = useMemo(
    () => generateHistoricalData(basePrice, POINTS_MAP[timeRange] || 30),
    [basePrice, timeRange]
  );

  // Determine which data to display
  const hasRealData = isCryptoChart || (realData?.chartData?.length > 1);
  const baseChartData = isCryptoChart ? cryptoData.chartData : (realData?.chartData?.length > 1 ? realData.chartData : fallbackData);
  const chartData = useMemo(() => {
    if (!isCryptoChart || !liveTick) return baseChartData;
    const last = baseChartData[baseChartData.length - 1];
    if (last && last.t === liveTick.t) return baseChartData;
    return [...baseChartData, liveTick];
  }, [baseChartData, liveTick, isCryptoChart]);
  const chartLines = isCryptoChart
    ? [{ key: 'price', label: `${cryptoData.symbol} Price`, color: '#a855f7' }]
    : (realData?.lines || [{ key: 'price', label: 'Yes', color: '#4f6ef7' }]);

  // Calculate stats from first line
  const primaryKey = chartLines[0]?.key || 'price';
  const values = chartData.map(d => d[primaryKey]).filter(v => v != null);
  const currentVal = values[values.length - 1] || basePrice;
  const startVal = values[0] || basePrice;
  const change = currentVal - startVal;
  const isPositive = change >= 0;
  // Stats reflect the primary line, but the Y-axis domain must span every line
  // (e.g. both Yes ~16% and No ~84%) so no series renders off-screen.
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const allValues = isCryptoChart
    ? values
    : chartData.flatMap(d => chartLines.map(l => d[l.key])).filter(v => v != null);
  const axisMin = allValues.length ? Math.min(...allValues) : minVal;
  const axisMax = allValues.length ? Math.max(...allValues) : maxVal;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2.5 text-xs shadow-xl min-w-[120px]">
          <p className="text-[var(--color-text-muted)] mb-1.5">{payload[0]?.payload?.fullDate || payload[0]?.payload?.date}</p>
          {payload.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-[var(--color-text-muted)]">{chartLines.find(l => l.key === p.dataKey)?.label || p.dataKey}</span>
              </span>
              <span className="text-[var(--color-text)] font-semibold">{isCryptoChart ? fmtPrice(p.value) : `${p.value}%`}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          {isCryptoChart && cryptoData?.target ? (
            <div className="flex items-center gap-4 mb-1">
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Price to Beat</p>
                <p className="text-lg font-bold text-[var(--color-text-muted)]">{fmtPrice(cryptoData.target)}</p>
              </div>
              <div className="w-px h-8 bg-[var(--color-border)]" />
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Current Price</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold" style={{ color: '#a855f7' }}>{fmtPrice(currentVal)}</p>
                  <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '▲' : '▼'} {fmtPrice(Math.abs(change))}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {hasRealData ? `${currentVal.toFixed(1)}%` : `${basePrice}¢`}
              </p>
              <span className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{change.toFixed(1)}{hasRealData ? '%' : '¢'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            {isLiveStreaming && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">LIVE</span>
            )}
            {!isLiveStreaming && hasRealData && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">LIVE</span>
            )}
            {isCryptoUnavailable && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">PRICE UNAVAILABLE</span>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              {isCryptoChart ? `${cryptoData.symbol}/USD · Binance` : (hasRealData ? 'Live market data' : 'Simulated data')} · {timeRange}
            </p>
          </div>
        </div>
        <div className="flex gap-0.5 bg-[var(--color-surface2)] rounded-lg p-0.5 border border-[var(--color-border)] overflow-x-auto">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-2 sm:px-2.5 py-1.5 text-xs rounded-md transition-all font-medium whitespace-nowrap flex-shrink-0 ${
                timeRange === r
                  ? 'bg-[var(--color-text)] text-[var(--color-bg)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface)]/80">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
          </div>
        )}
        <ResponsiveContainer width="100%" height={200} className="sm:h-[240px]">
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={isCryptoChart
                ? [Math.min(minVal, cryptoData?.target || minVal) * 0.98, Math.max(maxVal, cryptoData?.target || maxVal) * 1.02]
                : [Math.max(0, axisMin - 5), Math.min(100, axisMax + 5)]}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => isCryptoChart ? fmtPrice(v) : (hasRealData ? `${v}%` : `${v}¢`)}
              width={isCryptoChart ? 60 : undefined}
            />
            <Tooltip content={<CustomTooltip />} />
            {isCryptoChart && cryptoData?.target && (
              <ReferenceLine
                y={cryptoData.target}
                stroke="#22c55e"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `Target ${fmtPrice(cryptoData.target)}`, position: 'insideTopRight', fill: '#22c55e', fontSize: 10 }}
              />
            )}
            {chartLines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: line.color, stroke: 'var(--color-bg)', strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend + Stats */}
      <div className="flex items-center justify-between mt-3">
        {/* Legend */}
        {chartLines.length > 1 && (
          <div className="flex flex-wrap gap-3">
            {chartLines.map((line) => (
              <span key={line.key} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <span className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: line.color }} />
                {line.label}
              </span>
            ))}
          </div>
        )}
        {chartLines.length <= 1 && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Low: {isCryptoChart ? fmtPrice(minVal) : `${minVal.toFixed(1)}${hasRealData ? '%' : '¢'}`}
          </span>
        )}
        <span className="text-xs text-[var(--color-text-muted)]">
          High: {isCryptoChart ? fmtPrice(maxVal) : `${maxVal.toFixed(1)}${hasRealData ? '%' : '¢'}`}
        </span>
      </div>
    </div>
  );
};

export default MarketChart;
