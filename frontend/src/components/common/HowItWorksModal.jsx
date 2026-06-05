import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, TrendingUp, DollarSign, ArrowRight, ChevronRight } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import useAuthStore from '../../store/authStore';

const steps = [
  {
    icon: Search,
    color: 'text-[var(--color-gold)]',
    bg: 'bg-yellow-500/15',
    title: 'Pick a Market',
    description: 'Browse prediction markets and pick one that interests you. We cover crypto, sports, politics, finance, weather, and breaking news.',
    illustration: '🔍',
  },
  {
    icon: TrendingUp,
    color: 'text-blue-400',
    bg: 'bg-blue-500/15',
    title: 'Place a Trade',
    description: 'Buy Yes or No shares based on your prediction. Use your $10,000 starting balance. See your potential payout in real time.',
    illustration: '📊',
  },
  {
    icon: DollarSign,
    color: 'text-[var(--color-green)]',
    bg: 'bg-green-500/15',
    title: 'Redeem',
    description: 'Sell anytime or wait for market resolution to redeem $1 per winning share. Track your portfolio P&L on your profile.',
    illustration: '💰',
  },
];

const HowItWorksModal = ({ isOpen, onClose }) => {
  const { openAuthModal, user } = useAuthStore();
  const [step, setStep] = useState(0);

  const handleGetStarted = () => {
    onClose();
    setStep(0);
    if (!user) openAuthModal();
  };

  const handleClose = () => {
    onClose();
    setStep(0);
  };

  const isLast = step === steps.length - 1;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="How PolyBet365 works" size="md">
      <div>
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-[var(--color-gold)]' : 'w-2 bg-[var(--color-border)]'}`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="text-center mb-6"
          >
            <div className="text-6xl mb-4">{steps[step].illustration}</div>
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl ${steps[step].bg} mb-4`}>
              {(() => { const Icon = steps[step].icon; return <Icon className={`w-6 h-6 ${steps[step].color}`} />; })()}
            </div>
            <h3 className="text-xl font-bold text-[var(--color-text)] mb-3">
              Step {step + 1}: {steps[step].title}
            </h3>
            <p className="text-[var(--color-text-muted)] leading-relaxed text-sm max-w-sm mx-auto">
              {steps[step].description}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="secondary" size="md" onClick={() => setStep(s => s - 1)}>
              Back
            </Button>
          )}
          {isLast ? (
            <Button variant="primary" size="md" fullWidth onClick={handleGetStarted}>
              {user ? 'Start Trading' : 'Get Started'} <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="primary" size="md" fullWidth onClick={() => setStep(s => s + 1)}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
        <button onClick={handleClose} className="w-full mt-3 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1">
          Maybe later
        </button>
      </div>
    </Modal>
  );
};

export default HowItWorksModal;
