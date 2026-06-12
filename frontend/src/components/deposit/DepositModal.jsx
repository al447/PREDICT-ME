import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, QrCode, Building2, Copy, Check, ChevronDown, ChevronUp, Info, Droplets, Loader2, Shield, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import useDepositModalStore from '../../store/depositModalStore';
import useAuthStore from '../../store/authStore';
import { depositAPI, bridgeAPI } from '../../services/api';
import useSmartWallet from '../../hooks/useSmartWallet';
import {
  CHAINS, TOKENS, TOKEN_CHAINS, chainsForToken, getTokenById, getChainById, getDepositAddress,
} from '../../lib/depositChains';
import { BLOCK_EXPLORER } from '../../config/network';
import BridgeStatusTracker from './BridgeStatusTracker';

// Default to first chain (Sepolia testnet when enabled, else Ethereum)
const DEFAULT_CHAIN = CHAINS[0]?.id || 'ethereum';
import Dropdown from './Dropdown';
import DepositReceiptForm from './DepositReceiptForm';
import {
  CashMethodList,
  CashAmountStep,
  CashSuccessStep,
} from './cash';

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
  const [view, setView] = useState('main'); // 'main' | 'transfer' | 'cash-amount' | 'cash-success'
  const [tab, setTab] = useState('crypto'); // 'crypto' | 'cash'
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [selectedChainId, setSelectedChainId] = useState(DEFAULT_CHAIN);
  const [priceImpactOpen, setPriceImpactOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── Cash Flow State ── */
  const [cashMethod, setCashMethod] = useState(null);
  const [cashSuccessData, setCashSuccessData] = useState(null);

  /* ── Non-custodial Smart Wallet (Gnosis Safe proxy per user) ── */
  const {
    proxyAddress: safeAddress,
    isDeployed: safeDeployed,
    balance: safeBalance,
    isLoading: safeLoading,
  } = useSmartWallet();

  /* ── Per-user intake addresses (from bridge API) ── */
  const [userAddresses, setUserAddresses]         = useState(null);
  const [addressesLoading, setAddressesLoading]   = useState(false);
  const [activeBridgeDepositId, setActiveBridgeDepositId] = useState(null);

  /* ── Fetch per-user deposit addresses when entering transfer view ── */
  useEffect(() => {
    if (view !== 'transfer' || !user) return;
    if (userAddresses) return;
    setAddressesLoading(true);
    bridgeAPI.getDepositAddresses()
      .then(({ data }) => { if (data.success) setUserAddresses(data.addresses); })
      .catch(err => console.warn('[DepositModal] getDepositAddresses failed:', err.message))
      .finally(() => setAddressesLoading(false));
  }, [view, user, userAddresses]);


  /* ── Reset on close ── */
  useEffect(() => {
    if (!isOpen) {
      setView('main');
      setTab('crypto');
      setUserAddresses(null);
      setActiveBridgeDepositId(null);
      setSelectedToken('USDC');
      setSelectedChainId(DEFAULT_CHAIN);
      setPriceImpactOpen(false);
      setCopied(false);
      setCashMethod(null);
      setCashSuccessData(null);
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
  // Per-user derived intake address for the selected chain.
  // For EVM: the user's unique HD-derived EVM address.
  // For Solana: the user's Solana intake address.
  // For BTC: the user's BTC intake address.
  const intakeAddress = getDepositAddress(selectedChain, userAddresses);
  const depositAddress = selectedChain?.kind === 'evm' && !userAddresses
    ? (safeAddress || null)   // legacy fallback while addresses load
    : intakeAddress;
  const [minting, setMinting] = useState(false);

  // Testnet faucet - only for Polygon Amoy MockUSDC
  const isTestnetFaucetAvailable = selectedChainId === 'polygon-amoy' && selectedToken === 'USDC';

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

      // Minimal ERC20 ABI for MockUSDC faucet
      const MockUSDC_ABI = [
        'function faucet() public',
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const MOCK_USDC_ADDRESS = import.meta.env.VITE_MOCK_USDC_ADDRESS || '0xC9EfbCF51e175a8171dDb7f65d709e71be969e56';
      const usdc = new ethers.Contract(MOCK_USDC_ADDRESS, MockUSDC_ABI, signer);

      toast.loading('Minting 10,000 test USDC...', { id: 'faucet' });
      const tx = await usdc.faucet();
      await tx.wait();
      toast.success('10,000 USDC minted to your wallet!', { id: 'faucet' });
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
              {(view === 'transfer' || view.startsWith('cash-')) && view !== 'cash-success' && (
                <button
                  onClick={() => {
                    if (view === 'transfer') {
                      setView('main');
                    } else if (view === 'cash-amount') {
                      setView('main');
                      setCashMethod(null);
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
                    : view === 'cash-success'
                    ? 'Deposit Complete'
                    : 'Deposit'}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  PredictMe Balance: {balanceDisplay}
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
                      { id: 'crypto', label: 'Crypto', icon: '₿' },
                      { id: 'cash',   label: 'Cash',   icon: '$' },
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

                  {tab === 'crypto' && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setView('transfer')}
                        className="w-full flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-border)] hover:border-[#4f6ef7]/50 hover:bg-[var(--color-surface2)]/40 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#4f6ef7]/10 flex items-center justify-center flex-shrink-0">
                          <QrCode className="w-5 h-5 text-[#4f6ef7]" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-[var(--color-text)]">Transfer Crypto</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">8 chains supported · Auto-converts to USDC</p>
                        </div>
                        <TokenCluster ids={['USDC', 'ETH', 'BNB', 'MATIC', 'SOL', 'BTC', 'ARB']} />
                      </button>
                    </div>
                  )}

                  {tab === 'cash' && (
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
                          + Mint 10,000 Test USDC
                        </>
                      )}
                    </button>
                  )}

                  {/* QR Code area — per-user intake address */}
                  {(safeLoading || addressesLoading) ? (
                    <div className="flex flex-col items-center py-10 text-center">
                      <Loader2 className="w-8 h-8 text-[#4f6ef7] animate-spin mb-2" />
                      <p className="text-xs text-[var(--color-text-muted)]">Preparing your wallet…</p>
                    </div>
                  ) : !depositAddress ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Info className="w-10 h-10 text-[var(--color-text-muted)] mb-2" />
                      <p className="text-sm font-medium text-[var(--color-text)]">Connect a wallet to get your deposit address</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Your funds are kept secure and only you can access them.</p>
                    </div>
                  ) : (
                    <>
                      {/* Non-custodial badge */}
                      <div className="flex items-center gap-1.5 mb-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <p className="text-xs text-emerald-400">
                          <span className="font-semibold">Your funds are secure</span> — only you can access them.
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
                            <span>
                              {selectedChain?.kind === 'btc' ? 'Your BTC intake address'
                                : selectedChain?.kind === 'svm' ? 'Your Solana intake address'
                                : 'Your intake address'}
                            </span>
                            {selectedChain?.kind === 'evm' && depositAddress && (
                              <a
                                href={`${BLOCK_EXPLORER}/address/${depositAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#4f6ef7] hover:underline inline-flex items-center gap-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
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

                      {/* Bridge info banner */}
                      <div className="mb-3 px-3 py-2 rounded-xl bg-[#4f6ef7]/10 border border-[#4f6ef7]/20 text-xs text-[var(--color-text-muted)]">
                        Funds auto-convert to USDC and credit your account via{' '}
                        <span className="text-[var(--color-text)] font-medium">
                          {selectedChain?.kind === 'btc' ? 'Relay' : selectedChain?.kind === 'svm' ? 'Circle CCTP' : 'Across Protocol'}
                        </span>
                      </div>

                      {/* BridgeStatusTracker — live deposit lifecycle */}
                      <BridgeStatusTracker
                        depositId={activeBridgeDepositId}
                        onCredited={() => toast.success('Deposit confirmed! Funds credited.')}
                      />

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

                      {/* Recent deposit tracker link */}
                      {!activeBridgeDepositId && (
                        <div className="mt-2 text-center">
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Sent already?{' '}
                            <button
                              onClick={async () => {
                                try {
                                  const { data } = await bridgeAPI.getDeposits();
                                  const latest = data.deposits?.[0];
                                  if (latest) setActiveBridgeDepositId(latest._id);
                                  else toast('No recent deposits found');
                                } catch { /* ignore */ }
                              }}
                              className="text-[#4f6ef7] hover:underline"
                            >
                              Track status →
                            </button>
                          </p>
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
                    walletAddress={safeAddress || depositAddress}
                    onBack={() => {
                      setView('main');
                      setCashMethod(null);
                    }}
                    onSuccess={(data) => {
                      setCashSuccessData(data);
                      setView('cash-success');
                    }}
                  />
                </motion.div>
              )}

              {view === 'cash-success' && cashSuccessData && (
                <motion.div
                  key="cash-success"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashSuccessStep
                    paymentData={cashSuccessData}
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
