/**
 * Exchange configuration for "Connect Exchange" deposit flow
 * Matches Polymarket's 6 exchange list (2 active, 4 coming soon)
 */

export const EXCHANGES = [
  {
    id: 'coinbase',
    name: 'Coinbase',
    icon: 'coinbase',
    active: true,
    description: 'No limit • 2 min',
  },
  {
    id: 'bybit',
    name: 'Bybit',
    icon: 'bybit',
    active: true,
    description: 'No limit • 2 min',
  },
  {
    id: 'binance',
    name: 'Binance',
    icon: 'binance',
    active: false,
    comingSoon: true,
  },
  {
    id: 'kraken',
    name: 'Kraken',
    icon: 'kraken',
    active: false,
    comingSoon: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: 'gemini',
    active: false,
    comingSoon: true,
  },
  {
    id: 'gate',
    name: 'Gate',
    icon: 'gate',
    active: false,
    comingSoon: true,
  },
];

export const ACTIVE_EXCHANGES = EXCHANGES.filter(e => e.active);
export const COMING_SOON_EXCHANGES = EXCHANGES.filter(e => e.comingSoon);

// Quick amount chips for Bybit (from Image 5)
export const BYBIT_QUICK_AMOUNTS = [10, 20, 50, 100, 500];

// Min/max deposit amounts (USD)
export const BYBIT_MIN_DEPOSIT = 10;
export const BYBIT_MAX_DEPOSIT = 10000;

// Feature flag - controlled via env
export const isConnectExchangeEnabled = () => {
  return import.meta.env.VITE_ENABLE_CONNECT_EXCHANGE === 'true';
};
