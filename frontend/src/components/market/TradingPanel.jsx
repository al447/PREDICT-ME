import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useDepositModalStore from '../../store/depositModalStore';
import Button from '../common/Button';
import RewardsBadge from './RewardsBadge';
import useTradeStore from '../../store/tradeStore';
import useAuthStore from '../../store/authStore';
import { formatBalance } from '../../utils/format';

const QUICK_AMOUNTS = [1, 5, 10, 20, 50, 100];

const TradingPanel = ({ market, onMarketUpdate }) => {
  const [selectedOutcome, setSelectedOutcome] = useState('Yes');
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { placeTrade, isPlacing, lastMarketUpdate } = useTradeStore();
  const { user, openAuthModal } = useAuthStore();

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
  const price = outcome ? outcome.price / 100 : 0;
  const parsedAmount = parseFloat(amount) || 0;
  const shares = price > 0 ? parsedAmount / price : 0;

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
    return `Buy ${selectedOutcome} — $${parsedAmount.toFixed(2)}`;
  };

  const isButtonDisabled = !user ? false : (cantTrade || invalidAmount || insufficientBalance || isPlacing);

  const handleTrade = async () => {
    if (!user) { openAuthModal(); return; }
    if (isButtonDisabled) return;

    // Confirm for large trades
    if (parsedAmount >= 50 && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);

    const result = await placeTrade(market._id, selectedOutcome, parsedAmount);
    if (result) {
      setAmount('');
    }
  };

  const setPercentage = (pct) => {
    if (!user) return;
    const val = Math.floor(user.balance * pct);
    if (val >= 1) setAmount(String(val));
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 sticky top-32">
      <h3 className="font-semibold text-[var(--color-text)] mb-4 text-base">Place Trade</h3>

      {cantTrade && (
        <div className="bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 rounded-lg px-3 py-2 mb-4 text-xs text-[var(--color-red)] text-center">
          {isMarketClosed ? 'This market is no longer active' : 'Trading has closed for this market'}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {liveOutcomes?.map((o) => (
          <button
            key={o.name}
            onClick={() => setSelectedOutcome(o.name)}
            disabled={cantTrade}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
              selectedOutcome === o.name
                ? o.name === 'Yes'
                  ? 'bg-[var(--color-green)] border-[var(--color-green)] text-white shadow-lg shadow-green-500/20'
                  : 'bg-[var(--color-red)] border-[var(--color-red)] text-white shadow-lg shadow-red-500/20'
                : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div>Buy {o.name}</div>
            <div className="text-lg font-bold mt-0.5">{o.price}¢</div>
          </button>
        ))}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-[var(--color-text-muted)] font-medium">Amount ($)</label>
          {user && (
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
            onClick={() => setAmount(a => String(Math.max(1, (parseFloat(a) || 0) - 1)))}
            disabled={cantTrade}
            className="w-10 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold text-lg transition-colors flex items-center justify-center disabled:opacity-50"
          >−</button>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            max="100000"
            disabled={cantTrade}
            className="flex-1 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)] text-sm focus:border-[var(--color-gold)] outline-none transition-colors text-center font-semibold disabled:opacity-50"
          />
          <button
            onClick={() => setAmount(a => String((parseFloat(a) || 0) + 1))}
            disabled={cantTrade}
            className="w-10 h-10 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-bold text-lg transition-colors flex items-center justify-center disabled:opacity-50"
          >+</button>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(String(a))}
              disabled={cantTrade}
              className={`py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                amount === String(a)
                  ? 'border-[var(--color-gold)] text-[var(--color-gold)] bg-[var(--color-gold)]/10'
                  : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ${a}
            </button>
          ))}
        </div>
      </div>

      {parsedAmount > 0 && (
        <div className="bg-[var(--color-surface2)] rounded-xl p-3 mb-4 space-y-2 text-sm border border-[var(--color-border)]">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Avg price</span>
            <span className="text-[var(--color-text)] font-semibold">{outcome?.price}¢</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Shares</span>
            <span className="text-[var(--color-text)] font-semibold">{shares.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Potential payout</span>
            <span className="text-[var(--color-green)] font-bold">${shares.toFixed(2)}</span>
          </div>
          <div className="border-t border-[var(--color-border)] pt-2 flex justify-between">
            <span className="text-[var(--color-text-muted)]">Potential profit</span>
            <span className={`font-bold ${shares - parsedAmount >= 0 ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
              {shares - parsedAmount >= 0 ? '+' : ''}${(shares - parsedAmount).toFixed(2)}
            </span>
          </div>
          {parsedAmount >= 50 && (
            <p className="text-[10px] text-[var(--color-text-muted)] pt-1">Price may change after large orders</p>
          )}
        </div>
      )}

      {/* Confirm dialog for large trades */}
      {confirmOpen && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3 mb-3 text-xs">
          <p className="text-yellow-300 font-semibold mb-2">Confirm large trade?</p>
          <p className="text-[var(--color-text-muted)] mb-2">Buy {shares.toFixed(2)} {selectedOutcome} shares for ${parsedAmount.toFixed(2)}</p>
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
    </div>
  );
};

export default TradingPanel;
