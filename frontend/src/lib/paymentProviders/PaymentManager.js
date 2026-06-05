/**
 * Payment Provider Manager
 * Handles multiple payment providers with fallback capability
 * Primary: Fun.xyz (enterprise)
 * Fallback: MoonPay (direct)
 */

import FunProvider from './FunProvider.js';

class PaymentManager {
  constructor() {
    this.providers = new Map();
    this.primaryProvider = null;
    this.fallbackProvider = null;
    this.initialized = false;
  }

  /**
   * Initialize payment providers
   */
  async initialize() {
    // Initialize Fun.xyz if configured
    if (import.meta.env.VITE_FUN_API_KEY) {
      const funProvider = new FunProvider({
        apiKey: import.meta.env.VITE_FUN_API_KEY,
        environment: import.meta.env.VITE_FUN_ENV || 'sandbox',
        baseURL: import.meta.env.VITE_FUN_API_URL,
        webhookSecret: import.meta.env.VITE_FUN_WEBHOOK_SECRET
      });

      try {
        await funProvider.initialize();
        this.providers.set('fun', funProvider);
        this.primaryProvider = funProvider;
        console.log('Fun.xyz provider initialized');
      } catch (error) {
        console.error('Failed to initialize Fun.xyz:', error);
      }
    }

    // Initialize MoonPay as fallback
    // MoonPay React component will be used directly
    console.log('Payment manager initialized');
    this.initialized = true;
  }

  /**
   * Get active provider
   * @returns {Object} Active payment provider
   */
  getActiveProvider() {
    if (!this.initialized) {
      throw new Error('Payment manager not initialized');
    }

    // Prefer Fun.xyz if available, otherwise fallback to MoonPay
    return this.primaryProvider || { name: 'moonpay' };
  }

  /**
   * Create deposit session
   * @param {Object} params - Deposit parameters
   * @returns {Promise<Object>} Deposit session
   */
  async createDeposit(params) {
    const provider = this.getActiveProvider();

    if (provider.name === 'moonpay') {
      // MoonPay flow - return config for MoonPay widget
      return {
        provider: 'moonpay',
        config: {
          apiKey: import.meta.env.VITE_MOONPAY_API_KEY,
          currencyCode: 'USDC',
          walletAddress: params.walletAddress,
          network: 'polygon',
          successURL: `${window.location.origin}/deposit/success`,
          cancelURL: `${window.location.origin}/deposit/cancel`
        }
      };
    }

    // Fun.xyz flow
    return provider.createDepositSession({
      userId: params.userId,
      walletAddress: params.walletAddress,
      currency: 'USDC',
      amount: params.amount,
      network: 'polygon'
    });
  }

  /**
   * Get available payment methods
   * @param {string} country - Country code
   * @returns {Promise<Array>} Payment methods
   */
  async getPaymentMethods(country = 'US') {
    const provider = this.getActiveProvider();

    if (provider.name === 'moonpay') {
      // MoonPay default methods
      return [
        { id: 'card', name: 'Credit/Debit Card', icon: 'card' },
        { id: 'apple_pay', name: 'Apple Pay', icon: 'apple' },
        { id: 'google_pay', name: 'Google Pay', icon: 'google' },
        { id: 'bank_transfer', name: 'Bank Transfer', icon: 'bank' }
      ];
    }

    return provider.getPaymentMethods(country);
  }

  /**
   * Check if provider is available
   * @param {string} providerName - Provider name
   * @returns {boolean} Provider availability
   */
  isProviderAvailable(providerName) {
    return this.providers.has(providerName);
  }

  /**
   * Get provider status
   * @returns {Object} Provider status information
   */
  getProviderStatus() {
    return {
      initialized: this.initialized,
      primary: this.primaryProvider ? 'fun' : 'moonpay',
      providers: Array.from(this.providers.keys())
    };
  }
}

// Singleton instance
const paymentManager = new PaymentManager();

export default paymentManager;
