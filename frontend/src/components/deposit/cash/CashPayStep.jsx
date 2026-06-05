import { useState } from 'react';
import { ChevronLeft, Shield, Lock, CreditCard, Calendar, Lock as LockIcon } from 'lucide-react';
import { isSandbox, getTestCard } from '../../../lib/moonpay';
import { depositAPI } from '../../../services/api';
import toast from 'react-hot-toast';

/**
 * Professional card payment form for MoonPay testing
 * Manual card input with real-time validation and secure submission
 */
const CashPayStep = ({ paymentData, onBack, onSuccess, onFailure }) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const { amount, externalTxId } = paymentData;

  // Format card number with spaces
  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  // Format expiry as MM/YY
  const formatExpiry = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const handleCardNumberChange = (e) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
    if (errors.cardNumber) {
      setErrors({ ...errors, cardNumber: null });
    }
  };

  const handleExpiryChange = (e) => {
    const formatted = formatExpiry(e.target.value);
    setExpiry(formatted);
    if (errors.expiry) {
      setErrors({ ...errors, expiry: null });
    }
  };

  const handleCvcChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '').substring(0, 4);
    setCvc(v);
    if (errors.cvc) {
      setErrors({ ...errors, cvc: null });
    }
  };

  const validate = () => {
    const newErrors = {};
    const cardNum = cardNumber.replace(/\s/g, '');

    if (cardNum.length < 13 || cardNum.length > 19) {
      newErrors.cardNumber = 'Card number must be 13-19 digits';
    }

    if (!expiry.match(/^\d{2}\/\d{2}$/)) {
      newErrors.expiry = 'Enter valid expiry (MM/YY)';
    } else {
      const [month, year] = expiry.split('/');
      const currentYear = new Date().getFullYear() % 100;
      const currentMonth = new Date().getMonth() + 1;
      const expYear = parseInt(year, 10);
      const expMonth = parseInt(month, 10);

      if (expMonth < 1 || expMonth > 12) {
        newErrors.expiry = 'Invalid month';
      } else if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
        newErrors.expiry = 'Card expired';
      }
    }

    if (cvc.length < 3) {
      newErrors.cvc = 'CVC must be 3-4 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      // Call backend to process test payment and credit balance
      const { data } = await depositAPI.moonpaySimulatePayment({
        externalTxId: paymentData.externalTxId,
        cardNumber,
        expiry,
        cvc,
      });

      if (data.success) {
        toast.success(`Payment successful! ${data.deposit.usdcReceived.toFixed(2)} USDC added to your balance`);
        onSuccess({
          txId: paymentData.externalTxId,
          amount: data.deposit.usdcReceived,
          methodId: 'credit_debit_card',
          usdcReceived: data.deposit.usdcReceived,
          fee: data.deposit.fee,
        });
      } else {
        toast.error(data.error || 'Payment failed');
        onFailure();
      }
    } catch (err) {
      console.error('Payment error:', err);
      toast.error(err.response?.data?.error || 'Payment failed. Please try again.');
      onFailure();
    } finally {
      setLoading(false);
    }
  };

  const fillTestCard = () => {
    const testCard = getTestCard();
    setCardNumber(testCard.number);
    setExpiry(testCard.expiry);
    setCvc(testCard.cvc);
    toast.success('Test card details filled!');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">Secure Checkout</p>
          <p className="text-sm font-semibold text-[var(--color-text)]">{paymentData.methodLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wide">SSL Secure</span>
        </div>
      </div>

      {/* Security Badge */}
      <div className="flex items-center justify-center gap-4 py-2">
        <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
          <Shield className="w-4 h-4" />
          <span className="text-[10px]">PCI Compliant</span>
        </div>
        <div className="w-px h-3 bg-[var(--color-border)]" />
        <div className="text-[10px] text-[var(--color-text-muted)]">256-bit Encryption</div>
        <div className="w-px h-3 bg-[var(--color-border)]" />
        <div className="text-[10px] text-[var(--color-text-muted)]">MoonPay®</div>
      </div>

      {/* Sandbox Test Card Info */}
      {isSandbox() && (
        <div className="rounded-xl overflow-hidden bg-gradient-to-br from-[#1a1f3a] via-[#0f1429] to-[#1a1f3a] border border-blue-500/30 shadow-lg">
          {/* Card Header */}
          <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Test Environment</span>
            </div>
            <button
              onClick={fillTestCard}
              className="text-[10px] text-blue-400 hover:text-blue-300 underline"
            >
              Auto-fill test card
            </button>
          </div>

          {/* Card Visual */}
          <div className="p-4">
            <div className="relative rounded-xl bg-gradient-to-br from-[#4f6ef7] via-[#6366f1] to-[#8b5cf6] p-4 shadow-xl overflow-hidden mb-4">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/20" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/10" />
              </div>

              <div className="flex items-start justify-between mb-6">
                <div className="w-10 h-8 rounded-md bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 flex items-center justify-center shadow-md">
                  <div className="w-6 h-4 border border-yellow-600/30 rounded-sm grid grid-cols-2 gap-px">
                    <div className="bg-yellow-600/20" />
                    <div className="bg-yellow-600/20" />
                  </div>
                </div>
                <div className="text-white/80 text-xs font-medium">TEST CARD</div>
              </div>

              <div className="text-white/60 text-[10px] uppercase tracking-wider mb-1">Card Number</div>
              <div className="text-white text-lg font-mono font-semibold tracking-wider">
                {getTestCard().number}
              </div>
            </div>

            <p className="text-xs text-blue-400/80 text-center">
              Use the test card above or enter any card details below
            </p>
          </div>
        </div>
      )}

      {/* Card Payment Form */}
      <div className="space-y-4">
        {/* Card Number */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text)] mb-1.5">
            Card Number
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={cardNumber}
              onChange={handleCardNumberChange}
              placeholder="4485 0403 7153 6584"
              maxLength={19}
              className={`w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--color-surface2)] border text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-all ${
                errors.cardNumber ? 'border-red-500 focus:border-red-500' : 'border-[var(--color-border)] focus:border-[#4f6ef7]'
              }`}
            />
          </div>
          {errors.cardNumber && (
            <p className="text-xs text-red-400 mt-1">{errors.cardNumber}</p>
          )}
        </div>

        {/* Expiry and CVC Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Expiry */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1.5">
              Expiry Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={expiry}
                onChange={handleExpiryChange}
                placeholder="MM/YY"
                maxLength={5}
                className={`w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--color-surface2)] border text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-all ${
                  errors.expiry ? 'border-red-500 focus:border-red-500' : 'border-[var(--color-border)] focus:border-[#4f6ef7]'
                }`}
              />
            </div>
            {errors.expiry && (
              <p className="text-xs text-red-400 mt-1">{errors.expiry}</p>
            )}
          </div>

          {/* CVC */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1.5">
              CVC
            </label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={cvc}
                onChange={handleCvcChange}
                placeholder="123"
                maxLength={4}
                className={`w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--color-surface2)] border text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-all ${
                  errors.cvc ? 'border-red-500 focus:border-red-500' : 'border-[var(--color-border)] focus:border-[#4f6ef7]'
                }`}
              />
            </div>
            {errors.cvc && (
              <p className="text-xs text-red-400 mt-1">{errors.cvc}</p>
            )}
          </div>
        </div>

        {/* Amount Display */}
        <div className="p-3 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)]">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--color-text-muted)]">Amount to pay</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">${amount.toFixed(2)} USD</span>
          </div>
        </div>

        {/* Pay Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Pay ${amount.toFixed(2)}
            </>
          )}
        </button>
      </div>


      {/* Footer Note */}
      <p className="text-[10px] text-[var(--color-text-muted)] text-center leading-relaxed">
        By completing this purchase, you agree to MoonPay's{' '}
        <a href="https://www.moonpay.com/legal/terms_of_use" target="_blank" rel="noopener noreferrer" className="text-[#4f6ef7] hover:underline">Terms of Use</a>
        {' '}and{' '}
        <a href="https://www.moonpay.com/legal/privacy_policy" target="_blank" rel="noopener noreferrer" className="text-[#4f6ef7] hover:underline">Privacy Policy</a>.
        Your card details are processed securely by MoonPay.
      </p>
    </div>
  );
};

export default CashPayStep;
