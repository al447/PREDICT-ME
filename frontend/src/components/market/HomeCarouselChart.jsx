import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';

const fmtUsd = (v) => {
  if (v == null) return '—';
  if (v >= 1000) return `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
};

const HomeCarouselChart = ({ data, lines: rawLines, isCrypto, target }) => {
  if (!rawLines || !data) return null;
  // Cap to 4 outcomes max — matches backend TOP_N and avoids legend overflow
  const lines = rawLines.slice(0, 4);
  const allVals = data.flatMap(d => lines.map(l => d[l.key])).filter(v => v != null);
  if (!allVals.length) return null;
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);

  let yMin, yMax, ticks;
  if (isCrypto) {
    const lo = Math.min(minV, target || minV);
    const hi = Math.max(maxV, target || maxV);
    yMin = lo * 0.98;
    yMax = hi * 1.02;
    ticks = undefined;
  } else {
    const pad = Math.max(5, Math.ceil((maxV - minV) * 0.15));
    yMin = Math.max(0, Math.floor((minV - pad) / 5) * 5);
    yMax = Math.min(100, Math.ceil((maxV + pad) / 5) * 5);
    const tickCount = Math.min(6, Math.max(3, Math.floor((yMax - yMin) / 10) + 1));
    ticks = Array.from({ length: tickCount }, (_, i) => Math.round(yMin + (i * (yMax - yMin)) / (tickCount - 1)));
  }

  // Walk backwards to find last non-null value for each line key (sparse-data safe)
  const lastVal = (key) => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][key] != null) return data[i][key];
    }
    return null;
  };

  return (
    <div className="px-4">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(data.length / 4) - 1)}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={ticks}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => isCrypto ? fmtUsd(v) : `${v}%`}
            width={isCrypto ? 60 : 38}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: 'var(--color-text)', fontSize: 11 }}
            labelStyle={{ color: 'var(--color-text-muted)', fontSize: 11, marginBottom: 4 }}
            formatter={(val) => [isCrypto ? fmtUsd(val) : `${val}%`]}
          />
          {isCrypto && target && (
            <ReferenceLine
              y={target}
              stroke="#22c55e"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: `Target ${fmtUsd(target)}`, position: 'insideTopRight', fill: '#22c55e', fontSize: 10 }}
            />
          )}
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotoneX"
              dataKey={line.key}
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: line.color }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-2">
        {lines.map((line) => {
          const v = lastVal(line.key);
          return (
            <div key={line.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: line.color }} />
              <span className="text-[11px] text-[var(--color-text-muted)]">{line.label}</span>
              <span className="text-[11px] font-semibold" style={{ color: line.color }}>
                {v != null ? (isCrypto ? fmtUsd(v) : `${v}%`) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HomeCarouselChart;
