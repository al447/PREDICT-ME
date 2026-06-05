import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { ArrowRight, Check, Loader2, Shield, DollarSign, Wallet, Copy, ExternalLink, ChevronDown } from 'lucide-react';
import Layout from '../components/layout/Layout';
import useAuthStore from '../store/authStore';
import { usersAPI, depositAPI } from '../services/api';
import { CHAINS, TOKENS, TOKEN_CHAINS, chainsForToken, tokensForChain, getChainById, getTokenById } from '../lib/depositChains';
import toast from 'react-hot-toast';

// PolyBet365 runs on Polygon Amoy testnet with MockUSDT (6 decimals). Keep this page
// aligned with DepositModal + backend — no mainnet/testnet address or RPC mismatch.
const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '80002', 10);
const POLYGON_AMOY_RPC = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com';
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS || '0x820D4ceFa26416dba1d91D63412154433148f835';
const PLATFORM_WALLET = import.meta.env.VITE_PLATFORM_WALLET || '';
// Full ABI for the calls this page makes (balance read, faucet mint, transfer).
const UsdtABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function faucet()',
];

const QUICK_AMOUNTS = [10, 50, 100, 500, 1000, 5000];

// Chain configs for on-chain transfers
const CHAIN_CONFIGS = {
  'polygon-amoy': {
    chainId: parseInt(import.meta.env.VITE_CHAIN_ID || '80002', 10),
    name: 'Polygon Amoy Testnet',
    rpc: import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    blockExplorer: import.meta.env.VITE_BLOCK_EXPLORER || 'https://amoy.polygonscan.com',
    usdtAddress: import.meta.env.VITE_USDT_ADDRESS || '0x820D4ceFa26416dba1d91D63412154433148f835',
  },
  'sepolia': {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    blockExplorer: 'https://sepolia.etherscan.io',
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC
  },
};

const DepositPage = () => {
  const navigate = useNavigate();
  const { user, updateBalance, refreshBalance } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('input'); // input | processing | success
  const [depositResult, setDepositResult] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [mode, setMode] = useState('transfer'); // transfer | claim
  const [selectedChain, setSelectedChain] = useState('polygon-amoy');
  const [selectedToken, setSelectedToken] = useState('USDT');
  const [txHash, setTxHash] = useState('');
  const [showChainDropdown, setShowChainDropdown] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);

  // Fetch on-chain USDT balance using MetaMask's actual address
  useEffect(() => {
    const fetchBal = async () => {
      try {
        if (!window.ethereum) return;
        const bp = new ethers.BrowserProvider(window.ethereum);
        const accounts = await bp.send('eth_accounts', []);
        const addr = accounts?.[0];
        if (!addr) return;
        const provider = new ethers.JsonRpcProvider(POLYGON_AMOY_RPC);
        const usdt = new ethers.Contract(USDT_ADDRESS, UsdtABI, provider);
        const bal = await usdt.balanceOf(addr);
        setWalletBalance(Number(bal) / 1e6);
      } catch {}
    };
    fetchBal();
  }, [step]);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-muted)]" />
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Sign in to Deposit</h2>
          <p className="text-[var(--color-text-muted)] mb-6">Connect your wallet to deposit USDT.</p>
          <button
            onClick={() => useAuthStore.getState().openAuthModal()}
            className="px-6 py-3 rounded-xl bg-[#4f6ef7] text-white font-semibold hover:bg-[#4060e0] transition-all"
          >
            Sign In
          </button>
        </div>
      </Layout>
    );
  }

  const parsedAmount = parseFloat(amount) || 0;

  const ensureNetwork = async () => {
    const chainHex = `0x${CHAIN_ID.toString(16)}`;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: chainHex, chainName: 'Polygon Amoy Testnet', nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: [POLYGON_AMOY_RPC], blockExplorerUrls: [import.meta.env.VITE_BLOCK_EXPLORER] }],
        });
      } else {
        throw switchErr;
      }
    }
    // Wait for MetaMask to finish switching
    await new Promise(r => setTimeout(r, 500));
  };

  const handleMintFaucet = async () => {
    if (!window.ethereum) return;
    try {
      await ensureNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdt = new ethers.Contract(USDT_ADDRESS, UsdtABI, signer);
      toast.loading('Minting 10,000 test USDT...', { id: 'faucet' });
      const tx = await usdt.faucet();
      await tx.wait();
      toast.success('10,000 USDT minted!', { id: 'faucet' });
      // Refresh balance
      const bal = await usdt.balanceOf(await signer.getAddress());
      setWalletBalance(Number(bal) / 1e6);
    } catch (err) {
      toast.dismiss('faucet');
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Mint failed: ' + (err.shortMessage || err.message));
      }
    }
  };

  const handleDeposit = async () => {
    if (parsedAmount < 1) {
      toast.error('Minimum deposit is 1 USDT');
      return;
    }
    if (!window.ethereum) {
      toast.error('No wallet detected. Please install MetaMask.');
      return;
    }
    setStep('processing');

    try {
      // 1. Switch to correct network FIRST
      await ensureNetwork();

      // 2. Create fresh provider AFTER switch is complete
      let provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      let signer = await provider.getSigner();
      const userAddr = await signer.getAddress();

      // 3. Check USDT balance using read-only RPC (avoids stale MetaMask state)
      const readProvider = new ethers.JsonRpcProvider(POLYGON_AMOY_RPC);
      const readUsdt = new ethers.Contract(USDT_ADDRESS, UsdtABI, readProvider);
      const balance = await readUsdt.balanceOf(userAddr);
      const amountWei = BigInt(Math.floor(parsedAmount * 1e6));

      if (balance < amountWei) {
        toast.error(`Insufficient USDT. Wallet has ${(Number(balance) / 1e6).toFixed(2)} USDT. Click "Mint Test USDT" to get more.`);
        setStep('input');
        return;
      }

      // Recreate signer on confirmed network for the transfer
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      const usdt = new ethers.Contract(USDT_ADDRESS, UsdtABI, signer);

      // 4. Transfer USDT to platform wallet on-chain
      toast.loading('Confirm transfer in MetaMask...', { id: 'deposit-tx' });
      const tx = await usdt.transfer(PLATFORM_WALLET, amountWei);
      toast.loading('Confirming on Polygon...', { id: 'deposit-tx' });
      const receipt = await tx.wait();
      toast.dismiss('deposit-tx');

      // 5. Notify backend to credit balance using NEW deposit API
      const { data } = await depositAPI.claim({
        chain: 'polygon-amoy',
        token: 'USDT',
        txHash: receipt.hash,
        amount: parsedAmount,
      });
      if (data.success) {
        setDepositResult({ ...data.deposit, txHash: receipt.hash, net: data.creditedAmountUsd, amount: parsedAmount, fee: 0 });
        await refreshBalance();
        setStep('success');
      } else {
        toast.error(data.error || 'Backend failed to credit balance');
        setStep('input');
      }
    } catch (err) {
      toast.dismiss('deposit-tx');
      console.error('[Deposit] Error:', err);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        toast.error('Transaction rejected');
      } else if (err.code === 'NETWORK_ERROR' || err.message?.includes('network changed')) {
        toast.error('Network switched. Please try again.');
      } else if (err.reason) {
        toast.error(`Failed: ${err.reason}`);
      } else {
        toast.error(err.shortMessage || 'Deposit failed');
      }
      setStep('input');
    }
  };

  const handleClaimDeposit = async () => {
    if (!txHash || txHash.length < 66) {
      toast.error('Please enter a valid transaction hash');
      return;
    }
    if (!selectedChain || !selectedToken) {
      toast.error('Please select chain and token');
      return;
    }
    setStep('processing');

    try {
      toast.loading('Verifying transaction on-chain...', { id: 'claim-deposit' });

      const { data } = await depositAPI.claim({
        chain: selectedChain,
        token: selectedToken,
        txHash: txHash.trim(),
        amount: parsedAmount || undefined,
      });

      toast.dismiss('claim-deposit');

      if (data.success) {
        setDepositResult({
          ...data.deposit,
          txHash: data.deposit.txHash,
          net: data.creditedAmountUsd,
          amount: data.deposit.claimedAmountUsd,
          fee: 0,
          method: `${selectedToken} on ${selectedChain}`,
        });
        await refreshBalance();
        setStep('success');
        toast.success(`Deposit verified! Credited $${data.creditedAmountUsd.toFixed(2)}`);
      } else {
        toast.error(data.error || 'Failed to verify deposit');
        setStep('input');
      }
    } catch (err) {
      toast.dismiss('claim-deposit');
      console.error('[Claim Deposit] Error:', err);
      toast.error(err.response?.data?.error || 'Failed to claim deposit');
      setStep('input');
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Deposit</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Add funds to your PolyBet365 balance</p>
        </div>

        {/* ══ INPUT STEP ══ */}
        {step === 'input' && (
          <div className="space-y-6">
            {/* Balances */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Platform Balance</p>
                <p className="text-xl font-bold text-[var(--color-gold)]">
                  ${user.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Wallet USDT</p>
                <p className="text-xl font-bold text-[var(--color-text)]">
                  {walletBalance != null ? walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                </p>
                <button onClick={handleMintFaucet} className="mt-2 text-xs text-[#4f6ef7] hover:underline font-medium">
                  + Mint 10K Test USDT
                </button>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex p-1 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <button
                onClick={() => setMode('transfer')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'transfer'
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                Transfer & Claim
              </button>
              <button
                onClick={() => setMode('claim')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'claim'
                    ? 'bg-[var(--color-gold)] text-black'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                Claim Only
              </button>
            </div>

            {/* Chain & Token Selectors (for Claim mode) */}
            {mode === 'claim' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Chain Selector */}
                  <div className="relative">
                    <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">Chain</label>
                    <button
                      onClick={() => setShowChainDropdown(!showChainDropdown)}
                      className="w-full p-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-left flex items-center justify-between"
                    >
                      <span className="text-[var(--color-text)] font-medium">
                        {getChainById(selectedChain)?.name || 'Select Chain'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                    </button>
                    {showChainDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] shadow-lg z-10 max-h-48 overflow-auto">
                        {CHAINS.map(chain => (
                          <button
                            key={chain.id}
                            onClick={() => {
                              setSelectedChain(chain.id);
                              setShowChainDropdown(false);
                              // Update token if not supported on new chain
                              const supportedTokens = tokensForChain(chain.id);
                              if (!supportedTokens.find(t => t.id === selectedToken)) {
                                setSelectedToken(supportedTokens[0]?.id || '');
                              }
                            }}
                            className="w-full p-3 text-left hover:bg-[var(--color-surface3)] text-[var(--color-text)] text-sm"
                          >
                            {chain.name} {chain.testnet && '(Testnet)'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Token Selector */}
                  <div className="relative">
                    <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">Token</label>
                    <button
                      onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                      className="w-full p-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-left flex items-center justify-between"
                    >
                      <span className="text-[var(--color-text)] font-medium">
                        {getTokenById(selectedToken)?.label || 'Select Token'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                    </button>
                    {showTokenDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] shadow-lg z-10 max-h-48 overflow-auto">
                        {tokensForChain(selectedChain).map(token => (
                          <button
                            key={token.id}
                            onClick={() => {
                              setSelectedToken(token.id);
                              setShowTokenDropdown(false);
                            }}
                            className="w-full p-3 text-left hover:bg-[var(--color-surface3)] text-[var(--color-text)] text-sm"
                          >
                            {token.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Transaction Hash Input */}
                <div>
                  <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">
                    Transaction Hash
                  </label>
                  <input
                    type="text"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="0x..."
                    className="w-full p-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] text-sm font-mono focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none"
                  />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Paste the transaction hash from your wallet
                  </p>
                </div>
              </div>
            )}

            {/* Network info */}
            {mode === 'transfer' && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#4f6ef7]/5 border border-[#4f6ef7]/15">
                <Wallet className="w-5 h-5 text-[#4f6ef7]" />
                <div className="text-xs">
                  <p className="font-medium text-[var(--color-text)]">Polygon Amoy Testnet · USDT</p>
                  <p className="text-[var(--color-text-muted)]">Transfer MockUSDT from your wallet to PolyBet365</p>
                </div>
              </div>
            )}

            {/* Amount Input */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-3">Deposit Amount (USDT)</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  max="100000"
                  className="w-full pl-9 pr-4 py-4 text-2xl font-bold rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/30 focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
                />
              </div>

              {/* Quick amounts */}
              <div className="flex flex-wrap gap-2 mt-3">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setAmount(String(q))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      amount === String(q)
                        ? 'bg-[var(--color-gold)] text-black'
                        : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'
                    }`}
                  >
                    ${q}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            {parsedAmount > 0 && (
              <div className="p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">You send</span>
                  <span className="text-[var(--color-text)] font-medium">{parsedAmount.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Network fee</span>
                  <span className="text-[var(--color-text-muted)]">&lt;$0.01 (POL gas)</span>
                </div>
                <div className="border-t border-[var(--color-border)] pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-[var(--color-text)]">Platform receives</span>
                  <span className="font-bold text-emerald-400">{parsedAmount.toFixed(2)} USDT</span>
                </div>
              </div>
            )}

            {/* Deposit / Claim Button */}
            <button
              onClick={mode === 'transfer' ? handleDeposit : handleClaimDeposit}
              disabled={mode === 'transfer' ? parsedAmount < 1 : !txHash || txHash.length < 66}
              className="w-full py-4 rounded-xl bg-[var(--color-gold)] text-black font-bold text-base hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Wallet className="w-5 h-5" />
              {mode === 'transfer'
                ? `Deposit ${parsedAmount > 0 ? parsedAmount.toFixed(2) : '0'} USDT`
                : 'Claim Deposit'}
            </button>

            {/* Security note */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-muted)]">
                <span className="font-medium text-emerald-400">On-chain transfer</span> — MockUSDT will be transferred from your wallet to the platform on Polygon Amoy. MetaMask will prompt you to confirm.
              </p>
            </div>
          </div>
        )}

        {/* ══ PROCESSING STEP ══ */}
        {step === 'processing' && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-gold)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Processing Deposit</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Confirming on-chain USDT transfer...
            </p>
            <div className="mt-6 space-y-3 max-w-xs mx-auto">
              {['Sending USDT on Polygon', 'Confirming transaction', 'Crediting your account'].map((s, i) => (
                <div key={s} className="flex items-center gap-3 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${i < 2 ? 'bg-emerald-400' : 'bg-[var(--color-gold)] animate-pulse'}`}>
                    {i < 2 ? <Check className="w-3 h-3 text-white" /> : <Loader2 className="w-3 h-3 text-black animate-spin" />}
                  </div>
                  <span className={i < 2 ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text)] font-medium'}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ SUCCESS STEP ══ */}
        {step === 'success' && depositResult && (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-400/10 flex items-center justify-center">
              <Check className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Deposit Successful!</h2>
            <p className="text-lg text-emerald-400 font-bold mb-6">
              +${depositResult.net.toFixed(2)} USDT
            </p>

            <div className="max-w-xs mx-auto p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] space-y-2 mb-8 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Amount</span>
                <span className="text-[var(--color-text)]">${depositResult.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Fee</span>
                <span className="text-[var(--color-text-muted)]">-${depositResult.fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Received</span>
                <span className="text-emerald-400 font-semibold">${depositResult.net.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Method</span>
                <span className="text-[var(--color-text)] capitalize">{depositResult.method}</span>
              </div>
              <div className="border-t border-[var(--color-border)] pt-2 flex justify-between text-sm">
                <span className="font-semibold text-[var(--color-text)]">New Balance</span>
                <span className="font-bold text-[var(--color-gold)]">
                  ${user.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex gap-3 max-w-xs mx-auto">
              <button
                onClick={() => { setStep('input'); setAmount(''); setDepositResult(null); }}
                className="flex-1 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] font-medium text-sm hover:bg-[var(--color-surface2)] transition-colors"
              >
                Deposit More
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 py-3 rounded-xl bg-[var(--color-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-1"
              >
                Start Trading <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DepositPage;
