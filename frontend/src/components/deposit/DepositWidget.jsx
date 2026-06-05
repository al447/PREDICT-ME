/**
 * Deposit Widget
 * Handles deposits via Fun.xyz or MoonPay
 * Matches Polymarket's deposit interface
 */

import React, { useState, useEffect } from 'react';
import { MoonPay } from '@moonpay/moonpay-react';
import paymentManager from '../../lib/paymentProviders/PaymentManager.js';
import { useAuth } from '../../hooks/useAuth.js';
import { toast } from 'react-hot-toast';

const DepositWidget = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [depositSession, setDepositSession] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);

  useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = async () => {
    try {
      await paymentManager.initialize();
      const status = paymentManager.getProviderStatus();
      setProviderStatus(status);

      // Get available payment methods
      const methods = await paymentManager.getPaymentMethods();
      setPaymentMethods(methods);
    } catch (error) {
      console.error('Failed to initialize payment:', error);
      toast.error('Payment initialization failed');
    }
  };

  const handleAmountChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmount(value);
    }
  };

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      const session = await paymentManager.createDeposit({
        userId: user.id,
        walletAddress: user.walletAddress,
        amount: parseFloat(amount),
        currency: 'USDC',
        network: 'polygon'
      });

      setDepositSession(session);

      if (session.provider === 'moonpay') {
        // MoonPay widget will handle the flow
        console.log('MoonPay session created:', session);
      } else {
        // Fun.xyz flow - redirect to their hosted page
        window.location.href = session.depositUrl;
      }
    } catch (error) {
      console.error('Deposit failed:', error);
      toast.error(error.message || 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (value) => {
    if (!value) return '0.00';
    return parseFloat(value).toFixed(2);
  };

  const getMinDeposit = () => {
    return providerStatus?.primary === 'fun' ? '10.00' : '20.00';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Deposit USDC
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider Badge */}
        {providerStatus && (
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Powered by {providerStatus.primary === 'fun' ? 'Fun.xyz' : 'MoonPay'}
          </div>
        )}

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Amount (USD)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              className="block w-full pl-7 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">USD</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Min deposit: ${getMinDeposit()}
          </p>
        </div>

        {/* Payment Methods */}
        {paymentMethods.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  className={`p-3 border rounded-lg text-sm font-medium transition-colors ${
                    selectedMethod === method.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {method.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Deposit Button */}
        <button
          onClick={handleDeposit}
          disabled={loading || !amount || parseFloat(amount) < parseFloat(getMinDeposit())}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? 'Processing...' : `Deposit $${formatAmount(amount)}`}
        </button>

        {/* MoonPay Widget (if initialized) */}
        {depositSession?.provider === 'moonpay' && (
          <div className="mt-4">
            <MoonPay
              apiKey={depositSession.config.apiKey}
              currencyCode={depositSession.config.currencyCode}
              walletAddress={depositSession.config.walletAddress}
              network={depositSession.config.network}
              successURL={depositSession.config.successURL}
              cancelURL={depositSession.config.cancelURL}
              onTransactionCompleted={(tx) => {
                console.log('MoonPay transaction completed:', tx);
                onSuccess?.(tx);
                onClose();
              }}
              onTransactionFailed={(error) => {
                console.error('MoonPay transaction failed:', error);
                toast.error('Transaction failed');
              }}
            />
          </div>
        )}

        {/* Info */}
        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p>Funds will be deposited as USDC on Polygon network.</p>
          <p>Transactions typically take 2-5 minutes to complete.</p>
        </div>
      </div>
    </div>
  );
};

export default DepositWidget;
