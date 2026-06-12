import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useDepositModalStore from '../../store/depositModalStore';
import Button from '../common/Button';
import RewardsBadge from './RewardsBadge';
import useTradeStore from '../../store/tradeStore';
import useAuthStore from '../../store/authStore';
import { formatBalance } from '../../utils/format';
import { ONCHAIN_ENABLED } from '../../config/network';
import { useCreateOrder, useCancelOrder, useUserOrders, useOrderEstimator } from '../../hooks/useClob';
import { useQueryClient } from '@tanstack/react-query';

const QUICK_AMOUNTS = [1, 5, 10, 20, 50, 100];
const QUICK_SHARES = [1, 5, 10, 25, 50, 100];

const TradingPanel = ({ market, onMarketUpdate }) => {
  const queryClient = useQueryClient();
  // Order type: 'market' | 'limit'
  const [orderType, setOrderType] = useState('market');
  // Side: 'buy' | 'sell'
  const [side, setSide] = useState('buy');
  // Input mode: 'amount' (USDC) | 'shares'
  const [inputMode, setInputMode] = useState('amount');
  const [selectedOutcome, setSelectedOutcome] = useState('Yes');
  const [amount, setAmount] = useState('');
  const [shares, setShares] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { placeTrade, isPlacing, lastMarketUpdate } = useTradeStore();
  const { user, openAuthModal } = useAuthStore();
  const createOrder = useCreateOrder();
  const cancelOrder = useCancelOrder();
  const { data: userOrders = [], refresh: refreshOrders } = useUserOrders('open');
  const estimate = useOrderEstimator();

  // Filter orders for this market
  const marketOrders = useMemo(() => {
    return userOrders.filter(o => o.conditionId === market?.conditionId);
  }, [userOrders, market?.conditionId]);

  // Live outcomes — prefer fresh data from lastMarketUpdate if it matches
  const liveOutcomes = useMemo(() => {
    if (lastMarketUpdate && lastMarketUpdate._id === market?._id) {
      return lastMarketUpdate.outcomes;
    }
    return market?.outcomes;
  }, [market?.outcomes, lastMarketUpdate]);

  // Notify parent when market prices update
  useEffect(() => {
    if (lastMarketUpdate && lastMarketUpdate._id === market?._id && onMarketUpdate) {
      onMarketUpdate(lastMarketUpdate);
    }
  }, [lastMarketUpdate]);

  const outcome = liveOutcomes?.find((o) => o.name === selectedOutcome);
  const marketPrice = outcome ? outcome.price / 100 : 0.5;
  const parsedAmount = parseFloat(amount) || 0;
  const parsedShares = parseFloat(shares) || 0;
  const parsedLimitPrice = parseFloat(limitPrice) || marketPrice;

  // Calculate based on input mode
  const effectivePrice = orderType === 'limit' ? parsedLimitPrice : marketPrice;
  const calculatedShares = inputMode === 'amount' && effectivePrice > 0 ? parsedAmount / effectivePrice : parsedShares;
  const calculatedAmount = inputMode === 'shares' ? parsedShares * effectivePrice : parsedAmount;

  // Estimate fees and payout
  const estimation = useMemo(() => {
    if (side === 'buy') {
      return estimate(calculatedShares, effectivePrice, 'buy');
    } else {
      // For sell: shares is what you pay, you receive notional minus fees
      return estimate(parsedShares || calculatedShares, effectivePrice, 'sell');
    }
  }, [calculatedShares, calculatedAmount, effectivePrice, side, estimate]);

  const isMarketClosed = !market || market.status !== 'active';
  const isExpired = market?.endDate && new Date(market.endDate) < new Date();
  const isTradingClosed = market?.closeDate && new Date(market.closeDate) < new Date();
  const cantTrade = isMarketClosed || isExpired || isTradingClosed;
  const insufficientBalance = user && parsedAmount > (user.balance || 0);
  const invalidAmount = parsedAmount < 1;

  const getButtonLabel = () => {
    if (!user) return 'Log in to trade';
    if (cantTrade) return 'Market closed';
    if (invalidAmount) return 'Enter amount';
    if (insufficientBalance) return 'Insufficient balance';
    const sideLabel = side === 'buy' ? 'Buy' : 'Sell';
    const typeLabel = orderType === 'limit' ? 'Limit' : '';
    if (inputMode === 'shares') {
      return `${sideLabel} ${parsedShares || 0} ${selectedOutcome} ${typeLabel}`;
    }
    return `${sideLabel} ${selectedOutcome}${typeLabel ? ' ' + typeLabel : ''} — $${calculatedAmount.toFixed(2)}`;
  };

  const isButtonDisabled = !user ? false : (cantTrade || invalidAmount || insufficientBalance || isPlacing || createOrder.isPending);

  const handleTrade = async () => {
    if (!user) { openAuthModal(); return; }
    if (isButtonDisabled) return;

    const isOnChain = ONCHAIN_ENABLED && market?.conditionId && market?.yesTokenId;

    // Confirm for large trades
    if (calculatedAmount >= 50 && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);

    // Use CLOB for on-chain markets
    if (isOnChain) {
      const tokenId = selectedOutcome === 'Yes' ? market.yesTokenId : market.noTokenId;
      const sideStr = side; // 'buy' | 'sell'
      const size = inputMode === 'shares' ? parsedShares : calculatedShares;
      // Limit price input is in cents (1-99); convert to decimal (0.01-0.99)
      const price = orderType === 'limit' ? parsedLimitPrice / 100 : marketPrice;

      // Validate limit price
      if (orderType === 'limit' && (price < 0.01 || price > 0.99)) {
        alert('Limit price must be between 1¢ and 99¢');
        return;
      }

      const result = await createOrder.mutateAsync({
        side: sideStr,
        price,
        size,
        conditionId: market.conditionId,
        tokenId,
      });

      if (result?.success) {
        setAmount('');
        setShares('');
        refreshOrders();
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['orderBook'] });
        queryClient.invalidateQueries({ queryKey: ['market', market._id] });
      }
    } else {
      // Legacy path for non-on-chain markets
      const result = await placeTrade(market._id, selectedOutcome, parsedAmount, null, market);
      if (result) {
        setAmount('');
      }
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!confirm('Cancel this order?')) return;
    try {
      await cancelOrder.mutateAsync(orderId);
      refreshOrders();
    } catch (err) {
      alert('Failed to cancel order: ' + err.message);
    }
  };

  const setPercentage = (pct) => {
    if (!user) return;
    const val = Math.floor(user.balance * pct);
    if (val >= 1) setAmount(String(val));
  };

  // Detect social (Magic) user vs wallet user
  const isSocialUser = user && !user.walletAddress;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sticky top-32">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--color-text)] text-base">Place Trade</h3>
        {ONCHAIN_ENABLED && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            ⚡ Gasless
          </span>
        )}
      </div>
      {isSocialUser && ONCHAIN_ENABLED && (
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3 -mt-2">
          No seed phrase, no extension, no crypto knowledge needed.
        </p>
      )}

      {cantTrade && (
        <div className="bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 rounded-lg px-3 py-2 mb-4 text-xs text-[var(--color-red)] text-center">
          {isMarketClosed ? 'This market is no longer active' : 'Trading has closed for this market'}
        </div>
      )}

      {/* Order Type Tabs */}
      <div className="flex gap-1 mb-3 bg-[var(--color-surface2)] rounded-lg p-1">
        {['market', 'limit'].map((type) => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              orderType === type
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {type === 'market' ? 'Market' : 'Limit'}
          </button>
        ))}
      </div>

      {/* Side Tabs */}
      <div className="flex gap-1 mb-3">
        {['buy', 'sell'].map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            disabled={cantTrade}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all border ${
              side === s
                ? s === 'buy'
                  ? 'bg-[var(--color-green)] border-[var(--color-green)] text-white'
                  : 'bg-[var(--color-red)] border-[var(--color-red)] text-white'
                : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)]'
            } disabled:opacity-50`}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      {/* Outcome Selection */}
      <div className="flex gap-2 mb-4">
        {liveOutcomes?.map((o) => (
          <button
            key={o.name}
            onClick={() => setSelectedOutcome(o.name)}
            disabled={cantTrade}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border ${
              selectedOutcome === o.name
                ? o.name === 'Yes'
                  ? 'bg-[var(--color-green)]/20 border-[var(--color-green)] text-[var(--color-green)]'
                  : 'bg-[var(--color-red)]/20 border-[var(--color-red)] text-[var(--color-red)]'
                : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)]'
            } disabled:opacity-50`}
          >
            <div>{o.name}</div>
            <div className="text-lg font-bold mt-0.5">{o.price}¢</div>
          </button>
        ))}
      </div>

      {/* Limit Price Input (only for limit orders) */}
      {orderType === 'limit' && (
        <div className="mb-3">
          <label className="text-xs text-[var(--color-text-muted)] font-medium mb-1.5 block">Limit Price (¢)</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLimitPrice(p => String(Math.max(1, (parseFloat(p) || 0) - 1)))}
              disabled={cantTrade}
              className="w-8 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold transition-colors"
            >−</button>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={Math.round(marketPrice * 100)}
              min="1"
              max="99"
              disabled={cantTrade}
              className="flex-1 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm text-center font-semibold disabled:opacity-50"
            />
            <button
              onClick={() => setLimitPrice(p => String(Math.min(99, (parseFloat(p) || 0) + 1)))}
              disabled={cantTrade}
              className="w-8 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold transition-colors"
            >+</button>
          </div>
          <div className="text-[10px] text-[var(--color-text-muted)] mt-1">
            Market: {Math.round(marketPrice * 100)}¢
          </div>
        </div>
      )}

      {/* Input Mode Toggle */}
      <div className="flex gap-1 mb-2">
        {['amount', 'shares'].map((mode) => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              inputMode === mode
                ? 'bg-[var(--color-gold)]/20 text-[var(--color-gold)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {mode === 'amount' ? 'USDC Amount' : 'Shares'}
          </button>
        ))}
      </div>

      {/* Amount / Shares Input */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-[var(--color-text-muted)] font-medium">
            {inputMode === 'amount' ? 'Amount ($)' : 'Shares'}
          </label>
          {user && inputMode === 'amount' && (
            <div className="flex gap-1">
              {[['25%', 0.25], ['50%', 0.5], ['Max', 1]].map(([label, pct]) => (
                <button key={label} onClick={() => setPercentage(pct)}
                  className="px-2 py-0.5 text-[10px] rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]/50 transition-colors">
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => {
              if (inputMode === 'amount') {
                setAmount(a => String(Math.max(1, (parseFloat(a) || 0) - 1)));
              } else {
                setShares(s => String(Math.max(1, (parseFloat(s) || 0) - 1)));
              }
            }}
            disabled={cantTrade}
            className="w-10 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold text-lg transition-colors flex items-center justify-center disabled:opacity-50"
          >−</button>
          <input
            type="number"
            value={inputMode === 'amount' ? amount : shares}
            onChange={(e) => inputMode === 'amount' ? setAmount(e.target.value) : setShares(e.target.value)}
            placeholder="0.00"
            min="1"
            max="100000"
            disabled={cantTrade}
            className="flex-1 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm focus:border-[var(--color-gold)] outline-none transition-colors text-center font-semibold disabled:opacity-50"
          />
          <button
            onClick={() => {
              if (inputMode === 'amount') {
                setAmount(a => String((parseFloat(a) || 0) + 1));
              } else {
                setShares(s => String((parseFloat(s) || 0) + 1));
              }
            }}
            disabled={cantTrade}
            className="w-10 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold text-lg transition-colors flex items-center justify-center disabled:opacity-50"
          >+</button>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {(inputMode === 'amount' ? QUICK_AMOUNTS : QUICK_SHARES).map((a) => (
            <button
              key={a}
              onClick={() => inputMode === 'amount' ? setAmount(String(a)) : setShares(String(a))}
              disabled={cantTrade}
              className={`py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                (inputMode === 'amount' ? amount : shares) === String(a)
                  ? 'border-[var(--color-gold)] text-[var(--color-gold)] bg-[var(--color-gold)]/10'
                  : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {inputMode === 'amount' ? '$' : ''}{a}
            </button>
          ))}
        </div>
      </div>

      {(parsedAmount > 0 || parsedShares > 0) && (
        <div className="bg-[var(--color-surface2)] rounded-xl p-3 mb-4 space-y-2 text-sm border border-[var(--color-border)]">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{orderType === 'limit' ? 'Limit price' : 'Market price'}</span>
            <span className="text-[var(--color-text)] font-semibold">{Math.round(effectivePrice * 100)}¢</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{side === 'buy' ? 'You pay' : 'You sell'}</span>
            <span className="text-[var(--color-text)] font-semibold">
              {side === 'buy' ? `$${estimation.youPay?.toFixed(2) || calculatedAmount.toFixed(2)}` : `${parsedShares || calculatedShares.toFixed(2)} shares`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{side === 'buy' ? 'You receive' : 'You receive'}</span>
            <span className="text-[var(--color-green)] font-bold">
              {side === 'buy' ? `${calculatedShares.toFixed(2)} shares` : `$${estimation.youReceive?.toFixed(2) || calculatedAmount.toFixed(2)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Fee (2%)</span>
            <span className="text-[var(--color-text)]">${estimation.fees?.toFixed(2) || '0.00'}</span>
          </div>
          {orderType === 'limit' && (
            <div className="text-[10px] text-[var(--color-text-muted)] pt-1">
              Limit order will rest in the order book until filled
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog for large trades */}
      {confirmOpen && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3 mb-3 text-xs">
          <p className="text-yellow-300 font-semibold mb-2">Confirm {orderType} {side}?</p>
          <p className="text-[var(--color-text-muted)] mb-2">
            {side === 'buy'
              ? `Buy ${calculatedShares.toFixed(2)} ${selectedOutcome} shares for $${calculatedAmount.toFixed(2)}`
              : `Sell ${parsedShares || calculatedShares.toFixed(2)} ${selectedOutcome} shares for $${calculatedAmount.toFixed(2)}`}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} className="flex-1 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">Cancel</button>
            <button onClick={handleTrade} className="flex-1 py-1.5 rounded-lg bg-[var(--color-gold)] text-black text-xs font-semibold">Confirm</button>
          </div>
        </div>
      )}

      {!confirmOpen && (
        <Button
          variant={selectedOutcome === 'Yes' ? 'success' : 'danger'}
          size="md"
          fullWidth
          loading={isPlacing}
          disabled={isButtonDisabled}
          onClick={handleTrade}
        >
          {getButtonLabel()}
        </Button>
      )}

      {user && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-muted)] bg-[var(--color-surface2)] rounded-lg px-3 py-2">
          <span>Balance</span>
          <Link to="/portfolio" className="text-[var(--color-gold)] font-semibold hover:underline">{formatBalance(user.balance)}</Link>
        </div>
      )}

      {insufficientBalance && parsedAmount > 0 && (
        <button
          onClick={() => useDepositModalStore.getState().openDepositModal()}
          className="mt-2 block w-full text-center text-xs text-[var(--color-gold)] hover:underline"
        >
          Deposit funds →
        </button>
      )}

      {market?.rewards > 0 && (
        <div className="mt-3 flex justify-center">
          <RewardsBadge percent={market.rewards} />
        </div>
      )}

      {/* Open Orders Panel (CLOB only) */}
      {ONCHAIN_ENABLED && market?.conditionId && marketOrders.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-[var(--color-text)]">Open Orders ({marketOrders.length})</h4>
            <button
              onClick={refreshOrders}
              className="text-[10px] text-[var(--color-gold)] hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {marketOrders.map((order) => (
              <div
                key={order.orderId}
                className="flex items-center justify-between bg-[var(--color-surface2)] rounded-lg px-2 py-1.5 text-xs"
              >
                <div className="flex flex-col">
                  <span className={order.side === 'buy' ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}>
                    {order.side === 'buy' ? 'Buy' : 'Sell'} {Math.round(order.price * 100)}¢
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {order.size.toFixed(2)} shares · {order.outcome || 'YES'}
                  </span>
                </div>
                <button
                  onClick={() => handleCancelOrder(order.orderId)}
                  disabled={cancelOrder.isPending}
                  className="px-2 py-0.5 rounded bg-[var(--color-red)]/20 text-[var(--color-red)] text-[10px] font-medium hover:bg-[var(--color-red)]/30 disabled:opacity-50"
                >
                  {cancelOrder.isPending ? '...' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingPanel;
