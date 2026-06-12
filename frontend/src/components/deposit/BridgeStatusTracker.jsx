import { useEffect, useState } from 'react';
import { CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react';
import { bridgeAPI } from '../../services/api';

const STATUS_CONFIG = {
  detected:  { label: 'Deposit Detected',        icon: Clock,       color: 'text-yellow-400', step: 1 },
  sweeping:  { label: 'Sweeping Funds',           icon: Loader,      color: 'text-blue-400',   step: 2 },
  bridging:  { label: 'Bridging to USDC',         icon: Loader,      color: 'text-blue-400',   step: 3 },
  attesting: { label: 'Awaiting Attestation',     icon: Loader,      color: 'text-blue-400',   step: 3 },
  minting:   { label: 'Minting USDC on Polygon',  icon: Loader,      color: 'text-purple-400', step: 3 },
  credited:  { label: 'Credited to Account',      icon: CheckCircle, color: 'text-green-400',  step: 4 },
  failed:    { label: 'Failed',                   icon: AlertCircle, color: 'text-red-400',    step: 0 },
};

const STEPS = [
  { key: 'detected', label: 'Detected' },
  { key: 'sweeping', label: 'Sweeping' },
  { key: 'bridging', label: 'Bridging' },
  { key: 'credited', label: 'Credited' },
];

/**
 * BridgeStatusTracker
 *
 * @param {string}   depositId  - BridgeDeposit._id to poll
 * @param {function} onCredited - called when status reaches 'credited'
 */
export default function BridgeStatusTracker({ depositId, onCredited }) {
  const [deposit, setDeposit] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!depositId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const { data } = await bridgeAPI.getStatus(depositId);
        if (cancelled) return;
        setDeposit(data.deposit);
        if (data.deposit?.status === 'credited' && onCredited) {
          onCredited(data.deposit);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [depositId, onCredited]);

  if (!depositId) return null;
  if (error) return <p className="text-xs text-red-400 mt-2">Status error: {error}</p>;
  if (!deposit) return (
    <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
      <Loader size={12} className="animate-spin" />
      <span>Waiting for deposit...</span>
    </div>
  );

  const cfg = STATUS_CONFIG[deposit.status] || STATUS_CONFIG.detected;
  const Icon = cfg.icon;
  const activeStep = cfg.step;
  const isFailed = deposit.status === 'failed';

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      {/* Step progress */}
      {!isFailed && (
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const isCredited = deposit.status === 'credited';
            const done    = stepNum < activeStep || (isCredited && stepNum === activeStep);
            const active  = stepNum === activeStep && !isCredited;
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${done   ? 'bg-green-500 text-white' : ''}
                  ${active ? 'bg-blue-500 text-white animate-pulse' : ''}
                  ${!done && !active ? 'bg-white/10 text-gray-500' : ''}
                `}>
                  {done ? '✓' : stepNum}
                </div>
                <span className={`text-[10px] ${active ? 'text-white' : 'text-gray-500'}`}>
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`absolute hidden`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Current status */}
      <div className={`flex items-center gap-2 text-sm ${cfg.color}`}>
        <Icon size={14} className={['sweeping', 'bridging', 'attesting', 'minting'].includes(deposit.status) ? 'animate-spin' : ''} />
        <span>{cfg.label}</span>
      </div>

      {/* Details */}
      {deposit.sourceAmount && (
        <p className="text-xs text-gray-400">
          {deposit.sourceAmount} {deposit.sourceToken}
          {deposit.bridgeProvider && <> via <span className="capitalize">{deposit.bridgeProvider}</span></>}
        </p>
      )}

      {deposit.creditedAmount && (
        <p className="text-xs text-green-400 font-semibold">
          +${deposit.creditedAmount.toFixed(2)} USDC added to your account
        </p>
      )}

      {deposit.errorMessage && (
        <p className="text-xs text-red-400">{deposit.errorMessage}</p>
      )}
    </div>
  );
}
