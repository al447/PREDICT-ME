import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { ArrowRight, ArrowDownRight, Check, Loader2, Shield, Wallet, ExternalLink, Banknote } from 'lucide-react';
import Layout from '../components/layout/Layout';
import useAuthStore from '../store/authStore';
import { usersAPI, depositAPI, bridgeAPI, onchainAPI } from '../services/api';
import { getMagic } from '../lib/magic';
import toast from 'react-hot-toast';
import { formatBalance, truncateAddress } from '../utils/format';

/**
 * Resolve the best available EIP-712 signer (Magic first, then injected wallet).
 * Mirrors useWithdraw — used to sign the Safe authorization that debits the
 * user's proxy (proxy → operator) before the operator bridges cross-chain.
 */
async function getEthersSigner() {
  try {
    const magic = await getMagic();
    if (magic && magic.rpcProvider) {
      const isLoggedIn = await magic.user.isLoggedIn();
      if (isLoggedIn) {
        const bp = new ethers.BrowserProvider(magic.rpcProvider);
        return bp.getSigner();
      }
    }
  } catch { /* not Magic */ }

  if (window.ethereum) {
    const bp = new ethers.BrowserProvider(window.ethereum);
    await bp.send('eth_requestAccounts', []);
    return bp.getSigner();
  }

  throw new Error('No wallet signer found. Please connect a wallet.');
}

// Withdrawals run on Polygon Mainnet with native USDC (6 decimals) — read the on-chain
// wallet balance from the same network/token the platform actually sends.
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com';
const UsdcABI = ['function balanceOf(address owner) view returns (uint256)'];

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];
const SELL_MIN = parseInt(import.meta.env.VITE_MOONPAY_SELL_MIN || '20', 10);
const SELL_MAX = parseInt(import.meta.env.VITE_MOONPAY_SELL_MAX || '50000', 10);

const WithdrawPage = () => {
  const navigate = useNavigate();
  const { user, updateBalance, refreshBalance } = useAuthStore();
  const [tab, setTab] = useState('crypto'); // 'crypto' | 'cashout'
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('input'); // input | processing | success
  const [withdrawResult, setWithdrawResult] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [cashOutLoading, setCashOutLoading] = useState(false);

  // Multi-chain withdrawal state
  const [destChainType, setDestChainType] = useState('evm');  // 'evm' | 'svm' | 'btc'
  const [destChainId, setDestChainId]     = useState(1);      // EVM chain id
  const [destToken, setDestToken]         = useState('USDC');
  const [recipientAddr, setRecipientAddr] = useState('');
  const [bridgeQuote, setBridgeQuote]     = useState(null);
  const [quoteLoading, setQuoteLoading]   = useState(false);
  const [withdrawalId, setWithdrawalId]   = useState(null);
  const [destChains, setDestChains]       = useState([]);
  const [isTestnet, setIsTestnet]         = useState(false);

  // Fetch supported chains from backend (handles mainnet vs testnet automatically)
  useEffect(() => {
    bridgeAPI.getSupportedAssets()
      .then(({ data }) => {
        if (data.success && data.chains) {
          // Transform backend chain format to frontend format
          const transformed = data.chains.map(c => ({
            chainType: c.chainType,
            chainId: c.chainId,
            label: c.name,
            tokens: c.tokens,
            isTestnet: c.isTestnet,
          }));
          setDestChains(transformed);
          setIsTestnet(data.isTestnet || false);
          // Set default to first chain
          if (transformed.length > 0) {
            const firstEvm = transformed.find(c => c.chainType === 'evm');
            if (firstEvm) {
              setDestChainType('evm');
              setDestChainId(firstEvm.chainId);
            }
          }
        }
      })
      .catch(err => console.warn('[Withdraw] Failed to load supported chains:', err.message));
  }, []);

  const selectedDest = destChains.find(c => c.chainType === destChainType && c.chainId === destChainId) || destChains[0] || { label: 'Ethereum', tokens: ['USDC'] };

  const fetchQuote = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1 || !recipientAddr) return;
    setQuoteLoading(true);
    setBridgeQuote(null);
    try {
      const { data } = await bridgeAPI.quote({
        fromAmountUsdc: amt,
        toChainType:    destChainType,
        toChainId:      destChainId,
        toToken:        destToken,
        recipientAddr,
      });
      if (data.success) setBridgeQuote(data.quote?.primary || data.quote);
    } catch (err) {
      console.warn('[Withdraw] Quote failed:', err.message);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleBridgeWithdraw = async () => {
    const amt = parseFloat(amount);
    if (amt < 10) { toast.error('Minimum withdrawal is $10'); return; }
    if (amt > user.balance) { toast.error('Insufficient balance'); return; }
    if (!recipientAddr) { toast.error('Enter a recipient address'); return; }
    setStep('processing');
    try {
      // ── Step 1: Resolve the operator wallet the Safe is debited to ──────────
      toast.loading('Preparing withdrawal…', { id: 'bw' });
      const { data: assets } = await bridgeAPI.getSupportedAssets();
      const debitAddress = assets?.withdrawDebitAddress;
      if (!debitAddress) {
        throw new Error('Withdrawals are temporarily unavailable (operator not configured).');
      }

      // ── Step 2: Get EIP-712 SafeTx payload to move USDC proxy → operator ────
      const { data: prep } = await onchainAPI.prepareWithdrawal({
        recipient: debitAddress,
        amount:    amt,
      });
      if (!prep.success) throw new Error(prep.error || 'Failed to prepare withdrawal');

      // ── Step 3: User signs the Safe authorization (debits their own wallet) ─
      toast.loading('Awaiting signature…', { id: 'bw' });
      const signer = await getEthersSigner();
      const userSignature = await signer.signTypedData(prep.domain, prep.types, prep.message);

      // ── Step 4: Submit — backend debits the Safe, then the operator bridges ─
      toast.loading('Submitting withdrawal…', { id: 'bw' });
      const { data } = await bridgeAPI.withdraw({
        fromAmountUsdc: amt,
        toChainType:    destChainType,
        toChainId:      destChainId,
        toToken:        destToken,
        recipientAddr,
        userSignature,
      });
      toast.dismiss('bw');
      if (data.success) {
        setWithdrawalId(data.withdrawalId);
        // Balance is chain-mirrored; the Safe debit is reflected by balanceSyncService.
        await refreshBalance();
        setStep('success');
        toast.success('Withdrawal submitted!');
      } else {
        toast.error(data.error || 'Withdrawal failed');
        setStep('input');
      }
    } catch (err) {
      toast.dismiss('bw');
      toast.error(err?.response?.data?.error || err.message || 'Withdrawal failed');
      setStep('input');
    }
  };

  useEffect(() => {
    if (user?.walletAddress) {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
      const usdc = new ethers.Contract(USDC_ADDRESS, UsdcABI, provider);
      usdc.balanceOf(user.walletAddress).then(bal => setWalletBalance(Number(bal) / 1e6)).catch(() => {});
    }
  }, [user?.walletAddress, step]);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-muted)]" />
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Sign in to Withdraw</h2>
          <p className="text-[var(--color-text-muted)] mb-6">Connect your wallet to withdraw USDC.</p>
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
      toast.error('Minimum withdrawal is 1 USDC');
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

  const handleCashOut = async () => {
    const parsedAmt = parseFloat(amount) || 0;
    if (parsedAmt < SELL_MIN) { toast.error(`Minimum cash-out is ${SELL_MIN} USDC`); return; }
    if (parsedAmt > SELL_MAX) { toast.error(`Maximum cash-out is ${SELL_MAX.toLocaleString()} USDC`); return; }
    if (parsedAmt > user.balance) { toast.error('Insufficient balance'); return; }
    setCashOutLoading(true);
    try {
      const { data } = await depositAPI.moonpaySellSession({ amountUsdc: parsedAmt, quoteCurrencyCode: 'usd' });
      if (data.success && data.widgetUrl) {
        window.open(data.widgetUrl, '_blank', 'noopener,noreferrer');
        toast.success('MoonPay sell window opened. Return here once complete.');
      } else {
        toast.error(data.error || 'Failed to open cash-out');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cash out failed');
    } finally {
      setCashOutLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Withdraw</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Send USDC to your wallet or cash out to fiat</p>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 p-1 bg-[var(--color-surface2)] rounded-xl border border-[var(--color-border)] mb-6">
          <button
            onClick={() => { setTab('crypto'); setStep('input'); setAmount(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
              tab === 'crypto'
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <Wallet className="w-4 h-4" /> Transfer Crypto
          </button>
          <button
            onClick={() => { setTab('cashout'); setStep('input'); setAmount(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
              tab === 'cashout'
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <Banknote className="w-4 h-4" /> Cash Out
          </button>
        </div>

        {/* ══ CASH OUT TAB ══ */}
        {tab === 'cashout' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Available</p>
              <p className="text-xl font-bold text-[var(--color-gold)]">${user.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[var(--color-text)]">Amount to Cash Out (USDC)</p>
                <button onClick={() => setAmount(String(Math.floor(user.balance)))} className="text-xs text-[#4f6ef7] hover:underline font-medium">Max</button>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min={SELL_MIN}
                  max={user.balance}
                  className="w-full pl-9 pr-4 py-4 text-2xl font-bold rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/30 focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {[50, 100, 250, 500].filter(q => q <= user.balance).map((q) => (
                  <button key={q} onClick={() => setAmount(String(q))} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${amount === String(q) ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'}`}>
                    ${q}
                  </button>
                ))}
              </div>
            </div>

            {parseFloat(amount) >= SELL_MIN && (
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">You sell</span>
                  <span className="text-[var(--color-text)] font-medium">{parseFloat(amount).toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">MoonPay fee (est. ~4.5%)</span>
                  <span className="text-[var(--color-text-muted)]">~${(parseFloat(amount) * 0.045).toFixed(2)}</span>
                </div>
                <div className="border-t border-[var(--color-border)] pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-[var(--color-text)]">You receive (est.)</span>
                  <span className="font-bold text-emerald-400">~${(parseFloat(amount) * 0.955).toFixed(2)} USD</span>
                </div>
              </div>
            )}

            <button
              onClick={handleCashOut}
              disabled={cashOutLoading || (parseFloat(amount) || 0) < SELL_MIN || (parseFloat(amount) || 0) > user.balance}
              className="w-full py-4 rounded-xl bg-[#4f6ef7] text-white font-bold text-base hover:bg-[#4060e0] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {cashOutLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
              Cash Out {(parseFloat(amount) || 0) >= SELL_MIN ? `$${parseFloat(amount).toFixed(2)}` : ''} via MoonPay
            </button>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <Shield className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-muted)]">
                <span className="font-medium text-blue-400">MoonPay off-ramp</span> — sell your USDC for fiat. MoonPay will open in a new tab. Minimum ${SELL_MIN} · Maximum ${SELL_MAX.toLocaleString()}.
              </p>
            </div>
          </div>
        )}

        {/* ══ CRYPTO TAB (multi-chain withdrawal) ══ */}
        {tab === 'crypto' && step === 'input' && (
          <div className="space-y-5">
            {/* Testnet warning */}
            {isTestnet && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-400 text-center">
                  🧪 Testnet Mode: Withdrawals are SIMULATED. No real funds will be transferred.
                </p>
              </div>
            )}

            {/* Balance */}
            <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Available Balance</p>
              <p className="text-2xl font-bold text-[var(--color-gold)]">${user.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>

            {/* Destination chain */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">Destination Chain</p>
              <div className="grid grid-cols-4 gap-2">
                {destChains.length === 0 && (
                  <div className="col-span-4 text-center text-sm text-[var(--color-text-muted)] py-2">
                    Loading chains...
                  </div>
                )}
                {destChains.map((c) => (
                  <button
                    key={`${c.chainType}-${c.chainId}`}
                    onClick={() => { setDestChainType(c.chainType); setDestChainId(c.chainId); setDestToken(c.tokens[0]); setBridgeQuote(null); }}
                    className={`py-2 px-1 rounded-xl text-xs font-medium transition-all border ${
                      destChainType === c.chainType && destChainId === c.chainId
                        ? 'bg-[#4f6ef7]/20 border-[#4f6ef7] text-[#4f6ef7]'
                        : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient address */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">Recipient Address</p>
              <input
                type="text"
                value={recipientAddr}
                onChange={(e) => { setRecipientAddr(e.target.value); setBridgeQuote(null); }}
                placeholder={destChainType === 'btc' ? 'bc1q...' : destChainType === 'svm' ? 'Solana address...' : '0x...'}
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/40 focus:border-[#4f6ef7] outline-none transition-colors"
              />
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[var(--color-text)]">Amount (USDC)</p>
                <button onClick={() => { setAmount(String(Math.floor(user.balance))); setBridgeQuote(null); }} className="text-xs text-[#4f6ef7] hover:underline font-medium">Max</button>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setBridgeQuote(null); }}
                  placeholder="0.00"
                  min="10"
                  max={user.balance}
                  className="w-full pl-9 pr-4 py-4 text-2xl font-bold rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/30 focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {QUICK_AMOUNTS.filter(q => q <= user.balance).map((q) => (
                  <button key={q} onClick={() => { setAmount(String(q)); setBridgeQuote(null); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${amount === String(q) ? 'bg-[var(--color-gold)] text-black' : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'}`}>
                    ${q}
                  </button>
                ))}
              </div>
            </div>

            {/* Quote button */}
            {!bridgeQuote && parseFloat(amount) >= 10 && recipientAddr && (
              <button
                onClick={fetchQuote}
                disabled={quoteLoading}
                className="w-full py-3 rounded-xl border border-[#4f6ef7]/50 text-[#4f6ef7] text-sm font-medium hover:bg-[#4f6ef7]/10 transition-colors flex items-center justify-center gap-2"
              >
                {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {quoteLoading ? 'Fetching quote…' : 'Get Quote'}
              </button>
            )}

            {/* Quote preview */}
            {bridgeQuote && (
              <div className="p-4 rounded-xl bg-[#4f6ef7]/10 border border-[#4f6ef7]/20 space-y-2">
                <p className="text-xs font-semibold text-[#4f6ef7] uppercase tracking-wide">Bridge Quote</p>
                {bridgeQuote.estimatedOutput && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-muted)]">You receive (est.)</span>
                    <span className="font-bold text-emerald-400">{(Number(bridgeQuote.estimatedOutput) / 1e6).toFixed(2)} {destToken}</span>
                  </div>
                )}
                {bridgeQuote.estimatedTime && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-muted)]">Est. time</span>
                    <span className="text-[var(--color-text)]">{Math.ceil(bridgeQuote.estimatedTime / 60)} min</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Provider</span>
                  <span className="capitalize text-[var(--color-text)]">{bridgeQuote.provider}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Destination</span>
                  <span className="text-[var(--color-text)] font-mono text-xs">{selectedDest.label} · {recipientAddr.slice(0, 8)}…</span>
                </div>
              </div>
            )}

            <button
              onClick={handleBridgeWithdraw}
              disabled={parsedAmount < 10 || parsedAmount > user.balance || !recipientAddr}
              className="w-full py-4 rounded-xl bg-red-500 text-white font-bold text-base hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ArrowDownRight className="w-5 h-5" />
              Withdraw {parsedAmount > 0 ? `$${parsedAmount.toFixed(2)}` : ''} → {selectedDest.label}
            </button>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-muted)]">
                <span className="font-medium text-emerald-400">Multi-chain withdrawal</span> — bridged via{' '}
                {destChainType === 'btc' ? 'THORChain' : destChainType === 'svm' ? 'Wormhole CCTP' : 'Across Protocol'}. Min $10 · Max $100,000.
              </p>
            </div>
          </div>
        )}

        {/* ══ PROCESSING ══ */}
        {tab === 'crypto' && step === 'processing' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Processing Withdrawal</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Sending USDC to your wallet on Polygon...</p>
          </div>
        )}

        {/* ══ SUCCESS ══ */}
        {tab === 'crypto' && step === 'success' && withdrawResult && (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-400/10 flex items-center justify-center">
              <Check className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Withdrawal Sent!</h2>
            <p className="text-lg text-emerald-400 font-bold mb-6">{withdrawResult.net.toFixed(2)} USDC</p>

            <div className="max-w-xs mx-auto p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2 mb-6 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Amount</span>
                <span className="text-[var(--color-text)]">{withdrawResult.amount.toFixed(2)} USDC</span>
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
