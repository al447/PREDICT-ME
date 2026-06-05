/**
 * MoonPay configuration and utilities for fiat-to-crypto on-ramp
 */

// Payment methods exposed in the UI
export const MOONPAY_METHODS = [
  {
    id: 'credit_debit_card',
    label: 'Card',
    icon: 'card',
    limit: 115000,
    popular: true,
  },
  {
    id: 'apple_pay',
    label: 'Apple Pay',
    icon: 'apple',
    limit: 115000,
    popular: true,
  },
  {
    id: 'google_pay',
    label: 'Google Pay',
    icon: 'google',
    limit: 115000,
    popular: true,
  },
];

// Base URL based on environment
export const MOONPAY_BASE_URL = import.meta.env.VITE_MOONPAY_ENV === 'live'
  ? 'https://buy.moonpay.com'
  : 'https://buy-sandbox.moonpay.com';

// Default currency (USDC on Polygon)
export const MOONPAY_DEFAULT_CURRENCY = import.meta.env.VITE_MOONPAY_DEFAULT_CURRENCY || 'usdc_polygon';

// Quick amount chips
export const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

// Minimum deposit amount
export const MIN_DEPOSIT_USD = 20;

// Maximum deposit amount
export const MAX_DEPOSIT_USD = 115000;

/**
 * Estimate USDC received after MoonPay fees
 * @param {number} usdAmount
 * @param {string} paymentMethod
 * @returns {{usdcAmount: number, feePercent: number, feeUsd: number, totalUsd: number}}
 */
export const estimateUsdc = (usdAmount, paymentMethod = 'credit_debit_card') => {
  const feeMap = {
    credit_debit_card: 4.5,
    apple_pay: 3.9,
    google_pay: 3.9,
    revolut_pay: 3.9,
  };

  const feePercent = feeMap[paymentMethod] || 4.5;
  const feeUsd = (usdAmount * feePercent) / 100;
  const usdcAmount = Math.max(0, usdAmount - feeUsd);

  return {
    usdcAmount,
    feePercent,
    feeUsd,
    totalUsd: usdAmount,
  };
};

/**
 * Format currency for display
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Check if running in sandbox mode
 * @returns {boolean}
 */
export const isSandbox = () => import.meta.env.VITE_MOONPAY_ENV !== 'live';

/**
 * Get test card info for sandbox
 * @returns {{number: string, expiry: string, cvc: string}}
 */
export const getTestCard = () => ({
  number: '4485 0403 7153 6584',
  expiry: '12/30',
  cvc: '123',
});
