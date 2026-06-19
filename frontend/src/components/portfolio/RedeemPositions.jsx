/**
 * RedeemPositions — Polymarket-style position redemption UI
 *
 * Shows resolved positions that can be redeemed (claimed) for winnings.
 * Paper positions are auto-redeemed (settlementService handles this).
 * On-chain positions need manual redeem via the API.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { tradesAPI, onchainAPI } from '../../services/api';
import { formatBalance } from '../../utils/format';

const RedeemPositions = () => {
  const queryClient = useQueryClient();
  const [redeeming, setRedeeming] = useState({});

  // Fetch positions that can be redeemed (resolved markets where user has winning positions)
  const { data, isLoading, error } = useQuery({
    queryKey: ['redeemable-positions'],
    queryFn: () => tradesAPI.getRedeemablePositions().then(r => r.data),
    refetchInterval: 30000,
  });

  const redeemablePositions = data?.positions || [];
  const totalClaimable = data?.totalClaimable || 0;

  // Redeem mutation for on-chain positions
  const redeemMutation = useMutation({
    mutationFn: ({ conditionId, tokenId }) => onchainAPI.redeemPositions(conditionId, [tokenId]),
    onSuccess: (_, variables) => {
      setRedeeming(prev => ({ ...prev, [variables.tokenId]: false }));
      queryClient.invalidateQueries(['redeemable-positions']);
      queryClient.invalidateQueries(['user-positions']);
      queryClient.invalidateQueries(['user-profile']);
    },
    onError: (err, variables) => {
      setRedeeming(prev => ({ ...prev, [variables.tokenId]: false }));
      console.error('Redeem failed:', err);
    },
  });

  const handleRedeem = async (position) => {
    // Only on-chain positions need manual redeem
    if (!position.conditionId || !position.tokenId) {
      console.log('Paper position — auto-redeemed already');
      return;
    }

    setRedeeming(prev => ({ ...prev, [position.tokenId]: true }));
    redeemMutation.mutate({ conditionId: position.conditionId, tokenId: position.tokenId });
  };

  if (isLoading) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading redeemable positions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Failed to load positions</span>
        </div>
      </div>
    );
  }

  if (redeemablePositions.length === 0) {
    return null; // Don't show section if nothing to redeem
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden mb-6">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-500/10 to-transparent border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Claim Winnings</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              {redeemablePositions.length}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-text-muted)]">Total claimable</p>
            <p className="text-sm font-semibold text-emerald-400">{formatBalance(totalClaimable)}</p>
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="divide-y divide-[var(--color-border)]">
        {redeemablePositions.map((position) => {
          const isRedeeming = redeeming[position.tokenId];
          const isPaperPosition = !position.conditionId;
          const isWinning = position.outcome === position.resolvedOutcome;

          return (
            <div key={position._id} className="px-4 py-3 flex items-center gap-3">
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isWinning ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}>
                {isWinning ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
              </div>

              {/* Position info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                  {position.market?.title}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {position.outcome} · {position.totalShares} shares
                </p>
              </div>

              {/* Value */}
              <div className="text-right">
                <p className={`text-sm font-semibold ${isWinning ? 'text-emerald-400' : 'text-[var(--color-text-muted)]'}`}>
                  {isWinning ? '+' : ''}{formatBalance(position.claimableAmount)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {position.status === 'auto_redeemed' ? 'Auto-credited' : 'Ready to claim'}
                </p>
              </div>

              {/* Action */}
              {isWinning && !isPaperPosition && (
                <button
                  onClick={() => handleRedeem(position)}
                  disabled={isRedeeming || redeemMutation.isPending}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {isRedeeming ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      Claim
                      <ExternalLink className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}

              {isWinning && isPaperPosition && (
                <span className="px-3 py-1.5 rounded-lg bg-[var(--color-surface2)] text-[var(--color-text-muted)] text-xs">
                  Auto-credited
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Info footer */}
      <div className="px-4 py-2 bg-[var(--color-surface2)] border-t border-[var(--color-border)]">
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Winnings from paper markets are credited automatically. On-chain positions require a blockchain transaction to claim.
        </p>
      </div>
    </div>
  );
};

export default RedeemPositions;
