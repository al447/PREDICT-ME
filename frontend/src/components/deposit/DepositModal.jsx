import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, QrCode, Building2, Copy, Check, ChevronDown, ChevronUp, Info, Droplets, Loader2, Shield, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import useDepositModalStore from '../../store/depositModalStore';
import useAuthStore from '../../store/authStore';
import { depositAPI } from '../../services/api';
import useSmartWallet from '../../hooks/useSmartWallet';
import {
  CHAINS, TOKENS, TOKEN_CHAINS, chainsForToken, getTokenById, getChainById,
} from '../../lib/depositChains';
import { BLOCK_EXPLORER } from '../../config/network';

// Default to first chain (Sepolia testnet when enabled, else Ethereum)
const DEFAULT_CHAIN = CHAINS[0]?.id || 'ethereum';
import Dropdown from './Dropdown';
import DepositReceiptForm from './DepositReceiptForm';
import {
  CashMethodList,
  CashAmountStep,
  CashPayStep,
  CashSuccessStep,
} from './cash';
import {
  ExchangeList,
  CoinbaseIntro,
  BybitAmount,
  BybitCheckout,
  ExchangeSuccess,
} from './exchange';
import { MOONPAY_METHODS } from '../../lib/moonpay';
import { isConnectExchangeEnabled } from '../../lib/exchanges';

/* ── Token icon cluster shown on action row ── */
const TokenCluster = ({ ids }) => (
  <div className="flex -space-x-1.5">
    {ids.slice(0, 7).map((id) => {
      const t = TOKENS.find((x) => x.id === id);
      if (!t) return null;
      return (
        <div
          key={id}
          style={{ background: t.color, width: 22, height: 22 }}
          className="rounded-full border-2 border-[var(--color-surface)] flex items-center justify-center text-white font-bold"
          title={t.label}
        >
          <span style={{ fontSize: 8 }}>{t.label[0]}</span>
        </div>
      );
    })}
  </div>
);

/* ── Chain icon cluster for Connect Exchange row ── */
const ExchangeCluster = () => {
  const EXCHANGES = [
    { label: 'CB', color: '#1652F0' },
    { label: 'BN', color: '#F3BA2F' },
    { label: 'KR', color: '#5B47FB' },
    { label: 'OK', color: '#000000' },
  ];
  return (
    <div className="flex -space-x-1.5">
      {EXCHANGES.map((ex) => (
        <div
          key={ex.label}
          style={{ background: ex.color, width: 22, height: 22 }}
          className="rounded-full border-2 border-[var(--color-surface)] flex items-center justify-center text-white font-bold"
          title={ex.label}
        >
          <span style={{ fontSize: 8 }}>{ex.label[0]}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Chain colored badge ── */
const ChainBadge = ({ chain }) => (
  <div className="flex items-center gap-1.5">
    <div
      style={{ background: '#627EEA', width: 16, height: 16 }}
      className="rounded-full flex items-center justify-center text-white font-bold"
    >
      <span style={{ fontSize: 7 }}>{chain?.name?.[0] || 'E'}</span>
    </div>
    <span className="text-sm text-[var(--color-text)]">{chain?.name}</span>
  </div>
);

const DepositModal = () => {
  const { isOpen, closeDepositModal } = useDepositModalStore();
  const { user } = useAuthStore();

  /* ── FSM ── */
  const [view, setView] = useState('main'); // 'main' | 'transfer' | 'cash-amount' | 'cash-pay' | 'cash-success' | 'exchange-list' | 'exchange-coinbase' | 'exchange-bybit-amount' | 'exchange-bybit-checkout' | 'exchange-success'
  const [tab, setTab] = useState('crypto'); // 'crypto' | 'cash'
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [selectedChainId, setSelectedChainId] = useState(DEFAULT_CHAIN);
  const [priceImpactOpen, setPriceImpactOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── Cash Flow State ── */
  const [cashMethod, setCashMethod] = useState(null);
  const [cashPaymentData, setCashPaymentData] = useState(null);

  /* ── Exchange Flow State ── */
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [exchangeAmount, setExchangeAmount] = useState(null);
  const [exchangeSessionId, setExchangeSessionId] = useState(null);
  const [exchangeCheckoutUrl, setExchangeCheckoutUrl] = useState(null);

  /* ── Non-custodial Smart Wallet (Gnosis Safe proxy per user) ── */
  const {
    proxyAddress: safeAddress,
    isDeployed: safeDeployed,
    balance: safeBalance,
    isLoading: safeLoading,
  } = useSmartWallet();

  /* ── Bridge quote state ── */
  const [bridgeQuote, setBridgeQuote] = useState(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeStatusId, setBridgeStatusId] = useState(null);
  const [bridgeStatus, setBridgeStatus] = useState(null);
  const bridgePollRef = useRef(null);

  /* ── Fetch bridge quote when chain/token changes on transfer view ── */
  const fetchBridgeQuote = useCallback(async (chain, token) => {
    if (!user || !chain || view !== 'transfer') return;
    setBridgeLoading(true);
    setBridgeQuote(null);
    try {
      const fromChainId = chain.chainId || chain.id;
      const { data } = await depositAPI.getBridgeQuote({
        fromChainId,
        fromToken: token,
        fromAmount: '1000000', // 1 USDC in 6-decimal units as a reference quote
      });
      if (data.success) setBridgeQuote(data.quote);
    } catch (err) {
      console.warn('[DepositModal] Bridge quote failed:', err.message);
      // Fallback: just show Safe address without bridge quote
    } finally {
      setBridgeLoading(false);
    }
  }, [user, view]);

  /* ── Poll bridge status once user sends ── */
  const startBridgePoll = useCallback((routeId, provider) => {
    setBridgeStatusId(routeId);
    setBridgeStatus('pending');
    if (bridgePollRef.current) clearInterval(bridgePollRef.current);
    bridgePollRef.current = setInterval(async () => {
      try {
        const { data } = await depositAPI.getBridgeStatus(routeId);
        if (data.success) {
          setBridgeStatus(data.status?.status || 'pending');
          if (data.status?.status === 'completed') {
            clearInterval(bridgePollRef.current);
            toast.success('Deposit confirmed! Funds are in your wallet.');
          } else if (data.status?.status === 'failed') {
            clearInterval(bridgePollRef.current);
            toast.error('Bridge transfer failed. Please contact support.');
          }
        }
      } catch { /* ignore poll errors */ }
    }, 10000);
  }, []);

  useEffect(() => {
    return () => { if (bridgePollRef.current) clearInterval(bridgePollRef.current); };
  }, []);

  useEffect(() => {
    if (view === 'transfer' && selectedChain && selectedToken) {
      fetchBridgeQuote(selectedChain, selectedToken);
    }
  }, [view, selectedChainId, selectedToken]);

  /* ── Reset on close ── */
  useEffect(() => {
    if (!isOpen) {
      setView('main');
      setTab('crypto');
      setSelectedToken('USDC');
      setSelectedChainId(DEFAULT_CHAIN);
      setPriceImpactOpen(false);
      setCopied(false);
      setBridgeQuote(null);
      setBridgeStatusId(null);
      setBridgeStatus(null);
      setCashMethod(null);
      setCashPaymentData(null);
    }
  }, [isOpen]);

  /* ── ESC key ── */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeDepositModal(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeDepositModal]);

  /* ── Body scroll lock ── */
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  /* ── Token ↔ Chain compatibility ── */
  const validChains = chainsForToken(selectedToken);
  const validChainIds = validChains.map((c) => c.id);

  const handleTokenChange = (tokenId) => {
    setSelectedToken(tokenId);
    const chains = chainsForToken(tokenId);
    if (chains.length && !chains.find((c) => c.id === selectedChainId)) {
      setSelectedChainId(chains[0].id);
    }
  };

  const selectedChain = getChainById(selectedChainId);
  const tokenObj = getTokenById(selectedToken);
  // Non-custodial: deposit address is always the user's Gnosis Safe proxy.
  // The bridge (Relay/LI.FI) routes funds from any chain directly to this Safe.
  // Admin never receives these funds.
  const depositAddress = safeAddress || null;
  const [minting, setMinting] = useState(false);

  // Testnet faucet - only for Polygon Amoy MockUSDT
  const isTestnetFaucetAvailable = selectedChainId === 'polygon-amoy' && selectedToken === 'USDT';

  const handleMintFaucet = async () => {
    if (!window.ethereum) {
      toast.error('No wallet detected. Please install MetaMask.');
      return;
    }
    setMinting(true);
    try {
      const amoyChainId = parseInt(import.meta.env.VITE_CHAIN_ID || '80002', 10);
      const chainHex = `0x${amoyChainId.toString(16)}`;
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainHex,
              chainName: 'Polygon Amoy Testnet',
              nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
              rpcUrls: [import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com'],
              blockExplorerUrls: [import.meta.env.VITE_BLOCK_EXPLORER || 'https://amoy.polygonscan.com'],
            }],
          });
        }
      }
      await new Promise(r => setTimeout(r, 500));

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Minimal ERC20 ABI for MockUSDT faucet
      const MockUSDT_ABI = [
        'function faucet() public',
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const MOCK_USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS || '0x820D4ceFa26416dba1d91D63412154433148f835';
      const usdt = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDT_ABI, signer);

      toast.loading('Minting 10,000 test USDT...', { id: 'faucet' });
      const tx = await usdt.faucet();
      await tx.wait();
      toast.success('10,000 USDT minted to your wallet!', { id: 'faucet' });
    } catch (err) {
      toast.dismiss('faucet');
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Mint failed: ' + (err.shortMessage || err.message));
      }
    } finally {
      setMinting(false);
    }
  };

  /* ── Copy address ── */
  const handleCopy = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = depositAddress;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success('Address copied!');
    setTimeout(() => setCopied(false), 2500);
  };

  /* ── Chain dropdown items ── */
  const chainDropdownItems = validChains.map((c) => ({
    id: c.id,
    label: c.name,
    color: c.id === 'ethereum' ? '#627EEA'
      : c.id === 'solana'   ? '#9945FF'
      : c.id === 'bsc'      ? '#F3BA2F'
      : c.id === 'base'     ? '#0052FF'
      : c.id === 'polygon'  ? '#8247E5'
      : c.id === 'arbitrum' ? '#28A0F0'
      : '#888',
  }));

  const tokenDropdownItems = TOKENS.map((t) => ({ id: t.id, label: t.label, color: t.color }));

  const balanceDisplay = user?.balance != null
    ? `$${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '$0.00';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeDepositModal}
          />

          {/* Card */}
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl z-10 overflow-hidden"
          >
            {/* ═══ HEADER ═══ */}
            <div className="flex items-center px-5 pt-5 pb-4 relative">
              {/* Back button for transfer and cash views */}
              {(view === 'transfer' || view.startsWith('cash-') || view.startsWith('exchange-')) && view !== 'cash-success' && view !== 'exchange-success' && (
                <button
                  onClick={() => {
                    if (view === 'transfer') {
                      setView('main');
                      setShowReceipt(false);
                    } else if (view === 'cash-amount') {
                      setView('main');
                      setCashMethod(null);
                    } else if (view === 'cash-pay') {
                      setView('cash-amount');
                    } else if (view === 'exchange-list') {
                      setView('main');
                      setSelectedExchange(null);
                    } else if (view === 'exchange-coinbase') {
                      setView('exchange-list');
                    } else if (view === 'exchange-bybit-amount') {
                      setView('exchange-list');
                      setExchangeAmount(null);
                    } else if (view === 'exchange-bybit-checkout') {
                      setView('exchange-bybit-amount');
                    }
                  }}
                  className="absolute left-5 p-1 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex-1 text-center">
                <h2 className="text-base font-bold text-[var(--color-text)]">
                  {view === 'transfer'
                    ? 'Transfer Crypto'
                    : view === 'cash-amount'
                    ? 'Deposit · Total'
                    : view === 'cash-pay'
                    ? `Pay with ${cashPaymentData?.methodLabel || ''}`
                    : view === 'cash-success'
                    ? 'Deposit Complete'
                    : view === 'exchange-list'
                    ? 'Select an exchange'
                    : view === 'exchange-coinbase'
                    ? 'Deposit'
                    : view === 'exchange-bybit-amount'
                    ? 'Deposit'
                    : view === 'exchange-bybit-checkout'
                    ? `Deposit $${exchangeAmount?.toFixed(2) || '0.00'}`
                    : view === 'exchange-success'
                    ? 'Deposit Complete'
                    : 'Deposit'}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  PolyBet365 Balance: {balanceDisplay}
                </p>
              </div>
              <button
                onClick={closeDepositModal}
                className="absolute right-5 p-1 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ═══ BODY ═══ */}
            <AnimatePresence mode="wait">
              {view === 'main' && (
                <motion.div
                  key="main"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  {/* Tab switcher */}
                  <div className="flex p-1 bg-[var(--color-surface2)] rounded-xl mb-4 border border-[var(--color-border)]">
                    {[
                      { id: 'crypto', label: 'Use Crypto', icon: '₿' },
                      { id: 'cash',   label: 'Use Cash',   icon: '$' },
                    ].map(({ id, label, icon }) => (
                      <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                          tab === id
                            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${tab === id ? 'bg-[var(--color-text)]' : 'bg-[var(--color-text-muted)]'}`}>
                          {icon}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>

                  {tab === 'crypto' ? (
                    <div className="space-y-2">
                      {/* Transfer Crypto row */}
                      <button
                        onClick={() => setView('transfer')}
                        className="w-full flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-border)] hover:border-[#4f6ef7]/50 hover:bg-[var(--color-surface2)]/40 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#4f6ef7]/10 flex items-center justify-center flex-shrink-0">
                          <QrCode className="w-5 h-5 text-[#4f6ef7]" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-[var(--color-text)]">Transfer Crypto</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">No limit · Instant</p>
                        </div>
                        <TokenCluster ids={['USDC', 'ETH', 'BNB', 'MATIC', 'SOL', 'ARB', 'DAI']} />
                      </button>

                      {/* Connect Exchange row */}
                      <button
                        onClick={() => isConnectExchangeEnabled() ? setView('exchange-list') : toast('Connect Exchange — coming soon', { icon: '🏦' })}
                        className="w-full flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-border)] hover:border-[#4f6ef7]/50 hover:bg-[var(--color-surface2)]/40 transition-all"
                      >
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-[var(--color-text)]">Connect Exchange</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">No limit · 2 min</p>
                        </div>
                        <ExchangeCluster />
                      </button>
                    </div>
                  ) : (
                    <CashMethodList
                      onSelect={(methodId) => {
                        setCashMethod(methodId);
                        setView('cash-amount');
                      }}
                    />
                  )}
                </motion.div>
              )}

              {view === 'transfer' && (
                <motion.div
                  key="transfer"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  {/* Token + Chain selectors */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <Dropdown
                      label="Tokens"
                      items={tokenDropdownItems}
                      value={selectedToken}
                      onChange={handleTokenChange}
                    />
                    <Dropdown
                      label="Chains"
                      rightLabel={`Min $${selectedChain?.minUsd ?? 3} ⓘ`}
                      items={chainDropdownItems}
                      value={selectedChainId}
                      onChange={setSelectedChainId}
                    />
                  </div>

                  {/* Testnet Faucet Button */}
                  {isTestnetFaucetAvailable && (
                    <button
                      onClick={handleMintFaucet}
                      disabled={minting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#4f6ef7]/20 to-emerald-500/20 border border-[#4f6ef7]/30 text-sm font-medium text-[#4f6ef7] hover:bg-[#4f6ef7]/10 transition-colors mb-4"
                    >
                      {minting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-[#4f6ef7] border-t-transparent rounded-full animate-spin" />
                          Minting...
                        </>
                      ) : (
                        <>
                          <Droplets className="w-4 h-4" />
                          + Mint 10,000 Test USDT
                        </>
                      )}
                    </button>
                  )}

                  {/* QR Code area — non-custodial Safe address */}
                  {safeLoading ? (
                    <div className="flex flex-col items-center py-10 text-center">
                      <Loader2 className="w-8 h-8 text-[#4f6ef7] animate-spin mb-2" />
                      <p className="text-xs text-[var(--color-text-muted)]">Preparing your wallet…</p>
                    </div>
                  ) : !depositAddress ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Info className="w-10 h-10 text-[var(--color-text-muted)] mb-2" />
                      <p className="text-sm font-medium text-[var(--color-text)]">Connect a wallet to get your deposit address</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Your funds go into your own non-custodial smart wallet.</p>
                    </div>
                  ) : (
                    <>
                      {/* Non-custodial badge */}
                      <div className="flex items-center gap-1.5 mb-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <p className="text-xs text-emerald-400">
                          <span className="font-semibold">Non-custodial</span> — funds go to your personal smart wallet. Only you control them.
                        </p>
                      </div>

                      {/* QR */}
                      <div className="flex justify-center my-4">
                        <div className="relative p-3 bg-white rounded-2xl shadow-sm">
                          <QRCodeSVG
                            value={depositAddress}
                            size={180}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="M"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div
                              style={{ background: tokenObj?.color || '#4f6ef7', width: 36, height: 36 }}
                              className="rounded-full border-4 border-white flex items-center justify-center"
                            >
                              <span className="text-white font-bold text-xs">
                                {tokenObj?.label?.[0] || 'T'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                            <span>Your smart wallet address</span>
                            <a
                              href={`${BLOCK_EXPLORER}/address/${depositAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#4f6ef7] hover:underline inline-flex items-center gap-0.5"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <span className="text-xs text-[var(--color-text-muted)]">
                            Bal: <span className="text-[var(--color-text)] font-medium">${safeBalance?.toFixed(2) ?? '0.00'} USDC</span>
                          </span>
                        </div>
                        <div className="px-3 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                          <p className="text-xs font-mono text-[var(--color-text)] break-all leading-relaxed">
                            {depositAddress}
                          </p>
                        </div>
                      </div>

                      {/* Copy button */}
                      <button
                        onClick={handleCopy}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors mb-3"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy address'}
                      </button>

                      {/* Bridge quote info */}
                      {bridgeLoading && (
                        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                          <Loader2 className="w-4 h-4 text-[#4f6ef7] animate-spin flex-shrink-0" />
                          <p className="text-xs text-[var(--color-text-muted)]">Fetching best bridge route…</p>
                        </div>
                      )}
                      {bridgeQuote && !bridgeLoading && (
                        <div className="mb-3 px-3 py-2.5 rounded-xl bg-[#4f6ef7]/10 border border-[#4f6ef7]/20 text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">You receive (est.)</span>
                            <span className="font-semibold text-[var(--color-text)]">{bridgeQuote.estimatedOutput} USDC</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">Bridge fee</span>
                            <span className="text-[var(--color-text)]">{bridgeQuote.estimatedFee}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">Est. time</span>
                            <span className="text-[var(--color-text)]">{Math.ceil((bridgeQuote.estimatedTime || 60) / 60)} min</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">Provider</span>
                            <span className="capitalize text-[var(--color-text)]">{bridgeQuote.provider}</span>
                          </div>
                        </div>
                      )}

                      {/* Bridge status (after user sends) */}
                      {bridgeStatusId && (
                        <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border text-xs ${
                          bridgeStatus === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : bridgeStatus === 'failed'
                            ? 'bg-red-500/10 border-red-500/20 text-red-400'
                            : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                        }`}>
                          {bridgeStatus !== 'completed' && bridgeStatus !== 'failed' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                          )}
                          <span>
                            {bridgeStatus === 'completed' && '✓ Deposit confirmed — funds in your wallet!'}
                            {bridgeStatus === 'failed' && '✗ Bridge transfer failed. Contact support.'}
                            {bridgeStatus === 'pending' && 'Bridging in progress…'}
                          </span>
                        </div>
                      )}

                      {/* Price impact collapsible */}
                      <button
                        type="button"
                        onClick={() => setPriceImpactOpen((o) => !o)}
                        className="w-full flex items-center justify-between text-xs text-[var(--color-text-muted)] py-2 px-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-[var(--color-surface2)] flex items-center justify-center text-[8px]">$</span>
                          <span>Price impact: 0.00%</span>
                          <Info className="w-3 h-3" />
                        </div>
                        {priceImpactOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {priceImpactOpen && (
                        <div className="mt-1 px-3 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] space-y-1.5">
                          <div className="flex justify-between"><span>Network fee</span><span>&lt; $0.01</span></div>
                          <div className="flex justify-between"><span>Platform fee</span><span>0.00%</span></div>
                          <div className="flex justify-between font-medium text-[var(--color-text)]"><span>You receive</span><span>100% of deposit</span></div>
                        </div>
                      )}

                      {/* Bridge: "I sent it" — start status polling */}
                      {bridgeQuote && !bridgeStatusId && (
                        <div className="mt-2 text-center">
                          <button
                            onClick={() => startBridgePoll(bridgeQuote.routeId, bridgeQuote.provider)}
                            className="text-xs text-[#4f6ef7] hover:underline"
                          >
                            I sent the transfer — track status →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {/* ─── CASH FLOW VIEWS ─── */}
              {view === 'cash-amount' && cashMethod && (
                <motion.div
                  key="cash-amount"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashAmountStep
                    methodId={cashMethod}
                    onBack={() => {
                      setView('main');
                      setCashMethod(null);
                    }}
                    onContinue={(data) => {
                      const method = MOONPAY_METHODS.find((m) => m.id === cashMethod);
                      setCashPaymentData({
                        ...data,
                        methodLabel: method?.label,
                        walletAddress: safeAddress || depositAddress,
                      });
                      setView('cash-pay');
                    }}
                  />
                </motion.div>
              )}

              {view === 'cash-pay' && cashPaymentData && (
                <motion.div
                  key="cash-pay"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashPayStep
                    paymentData={cashPaymentData}
                    onBack={() => setView('cash-amount')}
                    onSuccess={() => setView('cash-success')}
                    onFailure={() => setView('cash-amount')}
                  />
                </motion.div>
              )}

              {view === 'cash-success' && cashPaymentData && (
                <motion.div
                  key="cash-success"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashSuccessStep
                    paymentData={cashPaymentData}
                    onClose={closeDepositModal}
                  />
                </motion.div>
              )}

              {/* ─── EXCHANGE FLOW VIEWS ─── */}
              {view === 'exchange-list' && (
                <motion.div
                  key="exchange-list"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <ExchangeList
                    onSelect={(exchangeId) => {
                      setSelectedExchange(exchangeId);
                      if (exchangeId === 'coinbase') {
                        setView('exchange-coinbase');
                      } else if (exchangeId === 'bybit') {
                        setView('exchange-bybit-amount');
                      }
                    }}
                    balanceDisplay={balanceDisplay}
                  />
                </motion.div>
              )}

              {view === 'exchange-coinbase' && (
                <motion.div
                  key="exchange-coinbase"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CoinbaseIntro
                    onBack={() => setView('exchange-list')}
                    onContinue={async () => {
                      setIsLoading(true);
                      try {
                        const { data } = await depositAPI.createExchangeSession({
                          provider: 'coinbase',
                          amount: 0, // Amount set later in Coinbase flow
                          currency: 'USDC',
                          network: 'polygon'
                        });
                        if (data.success && data.checkoutUrl) {
                          setExchangeSessionId(data.sessionId);
                          setExchangeCheckoutUrl(data.checkoutUrl);
                          // Open popup synchronously for user to complete on Coinbase
                          const popup = window.open(data.checkoutUrl, 'CoinbaseConnect', 'width=500,height=700');
                          if (!popup) {
                            toast.error('Please allow popups to connect Coinbase');
                          }
                        } else {
                          toast.error(data.error || 'Failed to create Coinbase session');
                        }
                      } catch (err) {
                        console.error('Coinbase session error:', err);
                        toast.error(err.response?.data?.error || 'Failed to connect Coinbase. Please try again.');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  />
                </motion.div>
              )}

              {view === 'exchange-bybit-amount' && (
                <motion.div
                  key="exchange-bybit-amount"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <BybitAmount
                    onBack={() => setView('exchange-list')}
                    onContinue={async (amount) => {
                      setIsLoading(true);
                      try {
                        const { data } = await depositAPI.createExchangeSession({
                          provider: 'bybit',
                          amount,
                          currency: 'USDC',
                          network: 'polygon'
                        });
                        if (data.success && data.checkoutUrl) {
                          setExchangeAmount(amount);
                          setExchangeSessionId(data.sessionId);
                          setExchangeCheckoutUrl(data.checkoutUrl);
                          setView('exchange-bybit-checkout');
                        } else {
                          toast.error(data.error || 'Failed to create Bybit session');
                        }
                      } catch (err) {
                        console.error('Bybit session error:', err);
                        toast.error(err.response?.data?.error || 'Failed to connect Bybit. Please try again.');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  />
                </motion.div>
              )}

              {view === 'exchange-bybit-checkout' && exchangeAmount && (
                <motion.div
                  key="exchange-bybit-checkout"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <BybitCheckout
                    amount={exchangeAmount}
                    checkoutUrl={exchangeCheckoutUrl}
                    onBack={() => setView('exchange-bybit-amount')}
                    onContinueInBrowser={() => {
                      if (exchangeCheckoutUrl) {
                        window.open(exchangeCheckoutUrl, 'BybitConnect', 'width=600,height=800');
                      } else {
                        toast.error('Checkout URL not available. Please try again.');
                      }
                    }}
                  />
                </motion.div>
              )}

              {view === 'exchange-success' && (
                <motion.div
                  key="exchange-success"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <ExchangeSuccess
                    amount={exchangeAmount}
                    balance={balanceDisplay}
                    onClose={closeDepositModal}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DepositModal;
