import { useState } from 'react';
import { Send, ExternalLink, Loader2 } from 'lucide-react';
import { depositAPI } from '../../services/api';
import { CHAINS, TOKENS, getChainById } from '../../lib/depositChains';
import toast from 'react-hot-toast';

const DepositReceiptForm = ({ defaultChain, defaultToken, onSubmitted }) => {
  const [txHash, setTxHash] = useState('');
  const [chain, setChain] = useState(defaultChain || 'ethereum');
  const [token, setToken] = useState(defaultToken || 'USDC');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!txHash.trim()) {
      toast.error('Please enter a transaction hash');
      return;
    }
    setLoading(true);
    try {
      await depositAPI.claim({
        chain,
        token,
        txHash: txHash.trim(),
        amount: amount ? parseFloat(amount) : undefined,
      });
      toast.success('Deposit submitted! Admin will verify and credit your balance.');
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      const msg = err.response?.data?.error || 'Submission failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const explorerBase = getChainById(chain)?.explorer;

  if (submitted) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 text-center">
        ✅ Submitted for review. We'll credit your balance once verified.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-3">
      <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider">Submitted a deposit?</p>

      <div>
        <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Transaction Hash *</label>
        <div className="flex items-center gap-1.5">
          <input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-3 py-2 rounded-lg text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] focus:border-[#4f6ef7] outline-none"
          />
          {explorerBase && txHash && (
            <a href={`${explorerBase}${txHash}`} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors text-[var(--color-text-muted)]">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Chain</label>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="w-full px-2 py-2 rounded-lg text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] focus:border-[#4f6ef7] outline-none"
          >
            {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Token</label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full px-2 py-2 rounded-lg text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] focus:border-[#4f6ef7] outline-none"
          >
            {TOKENS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Amount (optional)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 100"
          min="0"
          step="any"
          className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] focus:border-[#4f6ef7] outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {loading ? 'Submitting...' : 'Submit for Review'}
      </button>
    </form>
  );
};

export default DepositReceiptForm;
