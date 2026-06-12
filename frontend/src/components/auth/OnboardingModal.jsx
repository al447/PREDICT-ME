import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { usersAPI } from '../../services/api';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════
   Post-auth onboarding modal — Polymarket-style flow
   Step 1: Choose a username + referral code + ToS
   Step 2: What's your email? (skippable)
   Step 3: All set — Start Trading
   Only shown to brand-new accounts (isNewUser flag).
   ═══════════════════════════════════════════════════════ */

const OnboardingModal = () => {
  const { user, isNewUser, clearNewUser, updateUser } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1 state
  const [username, setUsername] = useState('');
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [tosChecked, setTosChecked] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // Step 2 state
  const [email, setEmail] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const usernameRef = useRef(null);

  // Open only for brand-new users
  useEffect(() => {
    if (isNewUser && user?.id) {
      // Pre-fill username if it's the default wallet truncation
      const defaultUsername = user.username || '';
      const isDefault = /^0x[0-9a-f]{4}\.{3}[0-9a-f]{4}$/i.test(defaultUsername);
      setUsername(isDefault ? '' : defaultUsername);
      setEmail(user.email || '');
      const timer = setTimeout(() => {
        setIsOpen(true);
        setTimeout(() => usernameRef.current?.focus(), 350);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isNewUser, user?.id]);

  const handleClose = () => {
    clearNewUser();
    setIsOpen(false);
  };

  // ── Step 1: Save username ──
  const handleUsernameNext = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameError('Please choose a username');
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 30) {
      setUsernameError('Username must be 2–30 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      setUsernameError('Only letters, numbers, _, . and - allowed');
      return;
    }
    if (!tosChecked) {
      toast.error('Please accept the Terms of Use to continue');
      return;
    }

    setIsSaving(true);
    try {
      const payload = { username: trimmed };
      if (referralCode.trim()) payload.referralCode = referralCode.trim();
      const { data } = await usersAPI.updateProfile(payload);
      if (data.success) {
        updateUser(data.user);
        setStep(2);
      } else {
        setUsernameError(data.error || 'Username unavailable');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save username';
      setUsernameError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Step 2: Save email (optional) ──
  const handleEmailNext = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      // User skipped — go straight to step 3
      setStep(3);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email address');
      return;
    }
    setIsSaving(true);
    try {
      const { data } = await usersAPI.updateProfile({ email: trimmed });
      if (data.success) {
        updateUser(data.user);
        setStep(3);
      } else {
        toast.error(data.error || 'Failed to save email');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save email');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[440px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl z-10 overflow-hidden"
          >
            <AnimatePresence mode="wait">

              {/* ════════ STEP 1: Choose a username ════════ */}
              {step === 1 && (
                <motion.div
                  key="username"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                  className="px-8 pt-10 pb-8"
                >
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-[var(--color-text)] mb-1">Choose a username</h2>
                    <p className="text-sm text-[var(--color-text-muted)]">You can update this later.</p>
                  </div>

                  {/* Username input */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 px-4 py-3.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] focus-within:border-[#4f6ef7] transition-colors">
                      <span className="text-[var(--color-text-muted)] font-medium select-none">@</span>
                      <input
                        ref={usernameRef}
                        type="text"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleUsernameNext()}
                        placeholder="username"
                        maxLength={30}
                        className="flex-1 bg-transparent outline-none text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] text-sm"
                      />
                    </div>
                    {usernameError && (
                      <p className="text-red-400 text-xs mt-1.5 px-1">{usernameError}</p>
                    )}
                  </div>

                  {/* Referral code (collapsible) */}
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={() => setReferralOpen((v) => !v)}
                      className="flex items-center justify-between w-full text-sm text-[var(--color-text-muted)] py-2 px-1 hover:text-[var(--color-text)] transition-colors"
                    >
                      <span>Referral Code (Optional)</span>
                      {referralOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <AnimatePresence>
                      {referralOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <input
                            type="text"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                            placeholder="Enter referral code"
                            className="w-full px-4 py-3 mt-1 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[#4f6ef7] transition-colors"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ToS checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer mb-7 group">
                    <div
                      onClick={() => setTosChecked((v) => !v)}
                      className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors cursor-pointer ${
                        tosChecked
                          ? 'bg-[#4f6ef7] border-[#4f6ef7]'
                          : 'border-[var(--color-border)] bg-transparent group-hover:border-[#4f6ef7]'
                      }`}
                    >
                      {tosChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                      By trading, you agree to the{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#4f6ef7] hover:underline">
                        Terms of Use
                      </a>{' '}
                      and attest you are not a U.S. person, are not located in the U.S. and are not the resident of or located in a restricted jurisdiction.
                    </span>
                  </label>

                  <button
                    onClick={handleUsernameNext}
                    disabled={isSaving}
                    className="w-full py-4 rounded-full bg-[#4f6ef7] text-white font-semibold text-base hover:bg-[#4060e0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Continue'}
                  </button>
                </motion.div>
              )}

              {/* ════════ STEP 2: What's your email? ════════ */}
              {step === 2 && (
                <motion.div
                  key="email"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                  className="px-8 pt-10 pb-8"
                >
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">What's your email?</h2>
                    <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                      Add your email to receive market and<br />trading notifications.
                    </p>
                  </div>

                  <div className="mb-5">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEmailNext()}
                      placeholder="Email address"
                      autoFocus
                      className="w-full px-4 py-3.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[#4f6ef7] transition-colors"
                    />
                  </div>

                  <button
                    onClick={handleEmailNext}
                    disabled={isSaving}
                    className="w-full py-4 rounded-full bg-[#4f6ef7] text-white font-semibold text-base hover:bg-[#4060e0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-3"
                  >
                    {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Continue'}
                  </button>

                  <button
                    onClick={() => setStep(3)}
                    className="w-full py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    Do this later
                  </button>
                </motion.div>
              )}

              {/* ════════ STEP 3: All set — Start Trading ════════ */}
              {step === 3 && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="px-8 pt-12 pb-8 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 15, delay: 0.05 }}
                    className="w-20 h-20 rounded-2xl bg-[#4f6ef7]/10 flex items-center justify-center mx-auto mb-6"
                  >
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                      <circle cx="20" cy="20" r="20" fill="#4f6ef7" fillOpacity="0.15" />
                      <path d="M12 20l6 6 10-12" stroke="#4f6ef7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-2xl font-bold text-[var(--color-text)] mb-2"
                  >
                    You're all set, @{user?.username}!
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                    className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-8"
                  >
                    Your account is ready. Start trading on prediction markets and win big.
                  </motion.p>

                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={handleClose}
                    className="w-full py-4 rounded-full bg-[#4f6ef7] text-white font-semibold text-base hover:bg-[#4060e0] transition-colors"
                  >
                    Start Trading
                  </motion.button>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingModal;
