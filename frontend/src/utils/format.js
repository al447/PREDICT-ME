export const formatVolume = (vol) => {
  if (!vol && vol !== 0) return '$0';
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toLocaleString()}`;
};

export const formatBalance = (bal) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(bal);
};

export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatRelativeTime = (date) => {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export const formatProbability = (prob) => {
  return `${Math.round(prob)}¢`;
};

export const truncateAddress = (addr) => {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export const generateHistoricalData = (currentPrice, points = 30) => {
  const data = [];
  let price = currentPrice + Math.random() * 20 - 10;
  for (let i = points; i >= 0; i--) {
    price += Math.random() * 4 - 2;
    price = Math.max(2, Math.min(98, price));
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({ date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), price: parseFloat(price.toFixed(1)) });
  }
  return data;
};
