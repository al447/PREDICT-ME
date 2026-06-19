import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star, TrendingUp, DollarSign, Users, Gift, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import { marketsAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const RewardsPage = () => {
  const [activeTab, setActiveTab] = useState('liquidity');
  const { user } = useAuthStore();

  const { data: marketsData, isLoading } = useQuery({
    queryKey: ['markets-rewards'],
    queryFn: async () => {
      const { data } = await marketsAPI.getMarkets({ sort: 'volume', limit: 50 });
      return data;
    },
  });

  const markets = marketsData?.markets || [];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Rewards</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Earn rewards by providing liquidity, trading actively, and referring friends.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1">
          {[
            { id: 'liquidity', label: 'Liquidity Rewards', icon: TrendingUp },
            { id: 'referral', label: 'Referral Program', icon: Users },
            { id: 'trading', label: 'Trading Rewards', icon: DollarSign },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)] border border-[var(--color-gold)]/30'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Liquidity Rewards Tab */}
        {activeTab === 'liquidity' && (
          <div className="space-y-6">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <Gift className="w-5 h-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-[var(--color-text)] text-sm mb-1">How Liquidity Rewards Work</h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    Place limit orders on markets to earn daily rewards. The closer your orders are to the midpoint,
                    the more rewards you earn. Rewards are distributed daily based on your share of total liquidity provided.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[var(--color-gold)]">2%</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Max Spread</p>
                </div>
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[var(--color-text)]">$50</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Min Order Size</p>
                </div>
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[var(--color-text)]">Daily</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Payout Frequency</p>
                </div>
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-emerald-400">$1</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Min Payout</p>
                </div>
              </div>
            </div>

            {/* Eligible Markets */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[var(--color-text)]">Reward-Eligible Markets</h3>
                <span className="text-xs text-[var(--color-text-muted)]">{markets.length} markets</span>
              </div>
              {isLoading ? (
                <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">Loading markets...</div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {markets.slice(0, 20).map((m) => (
                    <Link
                      key={m._id}
                      to={`/market/${m.slug}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface2)] transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-surface2)] flex items-center justify-center text-xs flex-shrink-0">
                          {m.image && (m.image.startsWith('http') || m.image.startsWith('/'))
                            ? <img src={m.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                            : <span>{m.image || '📊'}</span>
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">{m.title}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)]">
                            Vol: ${(m.volume || 0).toLocaleString()} • {m.tradeCount || 0} trades
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-emerald-400">
                          {m.rewards > 0 ? `${m.rewards}%` : '—'}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">reward</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Referral Program Tab */}
        {activeTab === 'referral' && (
          <div className="space-y-6">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <Users className="w-5 h-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-[var(--color-text)] text-sm mb-1">Referral Program</h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    Invite friends to PredictMe and earn commission on their trading fees.
                    You earn $10 when your referral qualifies, and they get $5.
                    Plus 5% ongoing commission on all their trading fees.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[var(--color-gold)]">$10</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">You Earn</p>
                </div>
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-emerald-400">$5</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Friend Gets</p>
                </div>
                <div className="bg-[var(--color-surface2)] rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[var(--color-text)]">5%</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Ongoing Fee Share</p>
                </div>
              </div>
              <Link
                to="/referral"
                className="block w-full text-center py-2.5 rounded-lg bg-[var(--color-gold)] text-black text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Go to Referral Dashboard →
              </Link>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <h4 className="font-semibold text-sm text-[var(--color-text)] mb-3">How It Works</h4>
              <div className="space-y-3">
                {[
                  { step: '1', title: 'Share your link', desc: 'Copy your unique referral link from the dashboard' },
                  { step: '2', title: 'Friend signs up', desc: 'They register using your link' },
                  { step: '3', title: 'Friend trades $5+', desc: 'Once they trade at least $5, both bonuses activate' },
                  { step: '4', title: 'Earn ongoing', desc: 'Get 5% of their trading fees forever' },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--color-gold)]/20 text-[var(--color-gold)] text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{item.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Trading Rewards Tab */}
        {activeTab === 'trading' && (
          <div className="space-y-6">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-[var(--color-text)] text-sm mb-1">Trading Volume Rewards</h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    High-volume traders earn reduced fees and exclusive perks.
                    The more you trade, the better your fee tier.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <h3 className="font-semibold text-sm text-[var(--color-text)]">Fee Tiers</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                      <th className="px-4 py-2 text-left">Tier</th>
                      <th className="px-4 py-2 text-left">30d Volume</th>
                      <th className="px-4 py-2 text-left">Taker Fee</th>
                      <th className="px-4 py-2 text-left">Maker Rebate</th>
                    </tr>
                  </thead>
                  <tbody className="text-[var(--color-text)]">
                    {[
                      { tier: 'Standard', vol: '< $10K', taker: '2.0%', maker: '0%' },
                      { tier: 'Bronze', vol: '$10K–$50K', taker: '1.5%', maker: '0.5%' },
                      { tier: 'Silver', vol: '$50K–$250K', taker: '1.0%', maker: '1.0%' },
                      { tier: 'Gold', vol: '$250K–$1M', taker: '0.5%', maker: '1.5%' },
                      { tier: 'Platinum', vol: '> $1M', taker: '0.25%', maker: '2.0%' },
                    ].map(row => (
                      <tr key={row.tier} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{row.tier}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{row.vol}</td>
                        <td className="px-4 py-2.5">{row.taker}</td>
                        <td className="px-4 py-2.5 text-emerald-400">{row.maker}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {user && (
              <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Your Current Tier</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Based on your 30-day trading volume</p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-[var(--color-gold)]/10 text-[var(--color-gold)] text-sm font-semibold">
                  Standard
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RewardsPage;
