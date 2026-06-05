/**
 * On-chain Position Widget
 * Shows USDC balance, YES/NO positions, and Redeem button (post-resolution only)
 * Minimal Polymarket-style UI surface — no raw Split/Merge buttons
 */

import React, { useState } from 'react';
import { useUsdcBalance, useMarketPositions, useRedeemPositions } from '../hooks/useOnchain';
import { BLOCK_EXPLORER } from '../contracts/addresses';

export default function OnchainPositionWidget({ address, conditionId, marketInfo }) {
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState(null);

  // Read queries
  const { data: usdcBalance = 0 } = useUsdcBalance(address, !!address);
  const {
    yesBalance,
    noBalance,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = useMarketPositions(address, conditionId, !!address && !!conditionId);

  // Write mutation
  const redeemMutation = useRedeemPositions();

  // Determine if market is resolved (has payout info)
  const isResolved = marketInfo?.resolvedOutcome || marketInfo?.status === 'resolved';

  const handleRedeem = async () => {
    if (!conditionId || (!yesBalance && !noBalance)) return;

    setRedeeming(true);
    setError(null);

    try {
      // Determine which tokens to redeem based on outcome
      const tokenIds = [];
      const amounts = [];

      if (marketInfo.resolvedOutcome?.toLowerCase() === 'yes' && yesBalance > 0) {
        tokenIds.push(marketInfo.token0);
        amounts.push(yesBalance.toString());
      } else if (marketInfo.resolvedOutcome?.toLowerCase() === 'no' && noBalance > 0) {
        tokenIds.push(marketInfo.token1);
        amounts.push(noBalance.toString());
      } else {
        // If outcome unknown or cancelled, can't redeem
        throw new Error('Cannot redeem: market not resolved with valid outcome');
      }

      const result = await redeemMutation.mutateAsync({
        conditionId,
        tokenIds,
        amounts,
      });

      // Refetch after redeem
      await refetchPositions();

      // Show success
      alert(`Redeemed successfully! Tx: ${result.txHash.slice(0, 10)}...`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRedeeming(false);
    }
  };

  const formatBalance = (n) => {
    if (n === 0) return '0';
    if (n < 0.01) return '<0.01';
    return n.toFixed(2);
  };

  return (
    <div className="onchain-widget bg-slate-800 rounded-lg p-4 text-sm">
      <h3 className="text-gold font-semibold mb-3 flex items-center gap-2">
        <span>⛓️</span> On-Chain Position
      </h3>

      {/* USDC Balance */}
      <div className="flex justify-between items-center py-2 border-b border-slate-700">
        <span className="text-slate-400">USDC Balance</span>
        <span className="font-mono text-white">{formatBalance(usdcBalance)} USDC</span>
      </div>

      {/* YES Position */}
      <div className="flex justify-between items-center py-2 border-b border-slate-700">
        <span className="text-slate-400">YES Shares</span>
        <span className="font-mono text-green-400">
          {positionsLoading ? '...' : formatBalance(yesBalance)}
        </span>
      </div>

      {/* NO Position */}
      <div className="flex justify-between items-center py-2">
        <span className="text-slate-400">NO Shares</span>
        <span className="font-mono text-red-400">
          {positionsLoading ? '...' : formatBalance(noBalance)}
        </span>
      </div>

      {/* Post-resolution: Redeem button */}
      {isResolved && (yesBalance > 0 || noBalance > 0) && (
        <div className="mt-4 pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-400 mb-2">
            Market resolved: <span className="text-gold font-semibold">{marketInfo.resolvedOutcome}</span>
          </p>
          <button
            onClick={handleRedeem}
            disabled={redeeming || (!yesBalance && !noBalance)}
            className="w-full py-2 px-4 bg-gold text-black font-semibold rounded 
                       hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {redeeming ? 'Redeeming...' : 'Redeem Winnings'}
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-500/30 rounded text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Block explorer link */}
      {conditionId && (
        <div className="mt-3 text-right">
          <a
            href={`${BLOCK_EXPLORER}/tx/${conditionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-gold transition-colors"
          >
            View on Explorer →
          </a>
        </div>
      )}
    </div>
  );
}
