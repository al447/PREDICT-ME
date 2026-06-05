import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { ArrowRight, ArrowDownRight, Check, Loader2, Shield, Wallet, ExternalLink } from 'lucide-react';
import Layout from '../components/layout/Layout';
import useAuthStore from '../store/authStore';
import { usersAPI } from '../services/api';
import toast from 'react-hot-toast';
import { formatBalance, truncateAddress } from '../utils/format';

// Withdrawals run on Polygon Amoy with MockUSDT (6 decimals) — read the on-chain
// wallet balance from the same network/token the platform actually sends.
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS || '0x820D4ceFa26416dba1d91D63412154433148f835';
const POLYGON_RPC = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com';
const UsdtABI = ['function balanceOf(address owner) view returns (uint256)'];

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];

const WithdrawPage = () => {
  const navigate = useNavigate();
  const { user, updateBalance, refreshBalance } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('input'); // input | processing | success
  const [withdrawResult, setWithdrawResult] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);

  useEffect(() => {
    if (user?.walletAddress) {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
      const usdt = new ethers.Contract(USDT_ADDRESS, UsdtABI, provider);
      usdt.balanceOf(user.walletAddress).then(bal => setWalletBalance(Number(bal) / 1e6)).catch(() => {});
    }
  }, [user?.walletAddress, step]);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-muted)]" />
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Sign in to Withdraw</h2>
          <p className="text-[var(--color-text-muted)] mb-6">Connect your wallet to withdraw USDT.</p>
          <button onClick={() => useAuthStore.getState().openAuthModal()} className="px-6 py-3 rounded-xl bg-[#4f6ef7] text-white font-semibold hover:bg-[#4060e0] transition-all">
            Sign In
          </button>
        </div>
      </Layout>
    );
  }

  const parsedAmount = parseFloat(amount) || 0;

  const handleWithdraw = async () => {
    if (parsedAmount < 1) {
      toast.error('Minimum withdrawal is 1 USDT');
      return;
    }
    if (parsedAmount > user.balance) {
      toast.error(`Insufficient balance. You have $${user.balance.toFixed(2)}`);
      return;
    }
    if (!user.walletAddress) {
      toast.error('No wallet address linked. Please sign in with a wallet.');
      return;
    }

    setStep('processing');

    try {
      toast.loading('Processing withdrawal...', { id: 'withdraw' });
      const { data } = await usersAPI.withdraw(parsedAmount);
      toast.dismiss('withdraw');

      if (data.success) {
        setWithdrawResult(data.withdrawal);
        updateBalance(data.newBalance);
        await refreshBalance();
        setStep('success');
        toast.success('Withdrawal complete!');
      } else {
        toast.error(data.error || 'Withdrawal failed');
        setStep('input');
      }
    } catch (err) {
      toast.dismiss('withdraw');
      console.error('[Withdraw] Error:', err);
      toast.error(err.response?.data?.error || 'Withdrawal failed');
      setStep('input');
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Withdraw</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Send USDT from PolyBet365 to your wallet</p>
        </div>

        {/* ══ INPUT ══ */}
        {step === 'input' && (
          <div className="space-y-6">
            {/* Balances */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Available</p>
                <p className="text-xl font-bold text-[var(--color-gold)]">${user.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Wallet USDT</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{walletBalance != null ? walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</p>
              </div>
            </div>

            {/* Destination */}
            <div className="p-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)] mb-1">Withdraw to</p>
              <p className="text-sm font-mono text-[var(--color-text)]">{user.walletAddress}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Polygon Amoy Testnet · USDT</p>
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-[var(--color-text)]">Withdrawal Amount (USDT)</p>
                <button onClick={() => setAmount(String(Math.floor(user.balance)))} className="text-xs text-[#4f6ef7] hover:underline font-medium">Max</button>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  max={user.balance}
                  className="w-full pl-9 pr-4 py-4 text-2xl font-bold rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/30 focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {QUICK_AMOUNTS.filter(q => q <= user.balance).map((q) => (
                  <button key={q} onClick={() => setAmount(String(q))} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${amount === String(q) ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'}`}>
                    ${q}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            {parsedAmount > 0 && (
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Withdrawal</span>
                  <span className="text-[var(--color-text)] font-medium">{parsedAmount.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Network fee</span>
                  <span className="text-[var(--color-text-muted)]">Free (paid by platform)</span>
                </div>
                <div className="border-t border-[var(--color-border)] pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-[var(--color-text)]">You receive</span>
                  <span className="font-bold text-emerald-400">{parsedAmount.toFixed(2)} USDT</span>
                </div>
              </div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={parsedAmount < 1 || parsedAmount > user.balance}
              className="w-full py-4 rounded-xl bg-red-500 text-white font-bold text-base hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ArrowDownRight className="w-5 h-5" />
              Withdraw {parsedAmount > 0 ? parsedAmount.toFixed(2) : '0'} USDT
            </button>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-muted)]">
                <span className="font-medium text-emerald-400">On-chain withdrawal</span> — USDT will be sent from the platform wallet to your address on Polygon Amoy. No wallet approval needed.
              </p>
            </div>
          </div>
        )}

        {/* ══ PROCESSING ══ */}
        {step === 'processing' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Processing Withdrawal</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Sending USDT to your wallet on Polygon...</p>
          </div>
        )}

        {/* ══ SUCCESS ══ */}
        {step === 'success' && withdrawResult && (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-400/10 flex items-center justify-center">
              <Check className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Withdrawal Sent!</h2>
            <p className="text-lg text-emerald-400 font-bold mb-6">{withdrawResult.net.toFixed(2)} USDT</p>

            <div className="max-w-xs mx-auto p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2 mb-6 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Amount</span>
                <span className="text-[var(--color-text)]">{withdrawResult.amount.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">To</span>
                <span className="text-[var(--color-text)] font-mono text-xs">{truncateAddress(withdrawResult.toAddress)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Tx</span>
                <a href={`${import.meta.env.VITE_BLOCK_EXPLORER}/tx/${withdrawResult.txHash}`} target="_blank" rel="noopener noreferrer" className="text-[#4f6ef7] hover:underline text-xs font-mono flex items-center gap-1">
                  {withdrawResult.txHash?.slice(0, 12)}... <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="border-t border-[var(--color-border)] pt-2 flex justify-between text-sm">
                <span className="font-semibold text-[var(--color-text)]">New Balance</span>
                <span className="font-bold text-[var(--color-gold)]">${user.balance?.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3 max-w-xs mx-auto">
              <button onClick={() => { setStep('input'); setAmount(''); setWithdrawResult(null); }} className="flex-1 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] font-medium text-sm hover:bg-[var(--color-surface2)] transition-colors">
                Withdraw More
              </button>
              <button onClick={() => navigate('/')} className="flex-1 py-3 rounded-xl bg-[#4f6ef7] text-white font-semibold text-sm hover:bg-[#4060e0] transition-all flex items-center justify-center gap-1">
                Trade <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WithdrawPage;
