import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { time: '1H', value: 45 },
  { time: '6H', value: 48 },
  { time: '1D', value: 52 },
  { time: '1W', value: 50 },
  { time: '1M', value: 55 },
  { time: 'ALL', value: 58 },
];

const MarketChart = ({ type = 'line', height = 120 }) => {
  const ChartComponent = type === 'area' ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={data}>
        <defs>
          <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-gold)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-gold)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis 
          dataKey="time" 
          stroke="var(--color-text-muted)" 
          fontSize={10} 
          tickLine={false}
          axisLine={false}
        />
        <YAxis 
          stroke="var(--color-text-muted)" 
          fontSize={10} 
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'var(--color-surface)', 
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-text)',
            fontSize: '12px'
          }} 
        />
        {type === 'area' ? (
          <Area type="monotone" dataKey="value" stroke="var(--color-gold)" fillOpacity={1} fill="url(#colorGradient)" />
        ) : (
          <Line type="monotone" dataKey="value" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
};

export default MarketChart;
