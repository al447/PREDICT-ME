import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Copy, Check, Users, DollarSign, Trophy, Gift, 
  Share2, Link as LinkIcon, ChevronRight, Loader2,
  UserPlus, TrendingUp, Award, ArrowLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import Layout from '../components/layout/Layout';
import { referralAPI } from '../services/api';
import useAuthStore from '../store/authStore';

const ReferralPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // overview | referrals | commissions

  const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
  const referralLink = user?.referralCode 
    ? `${FRONTEND_URL}?ref=${user.referralCode}`
    : '';

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const statsRes = await referralAPI.getMe();
      setStats(statsRes.data);
      setHistory(statsRes.data?.data?.recentReferrals || []);
    } catch (err) {
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const shareReferral = async () => {
    const shareData = {
      title: 'Join PolyBet365',
      text: `Sign up on PolyBet365 with my referral code ${user?.referralCode} and earn bonuses!`,
      url: referralLink
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      copyToClipboard();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-gold)]" />
      </div>
    );
  }

  const data = stats?.data || stats || {};
  const milestones = data?.milestonesProgress || [];
  const nextMilestone = milestones.find(m => !m.reached);
  const qualifiedCount = data?.totalReferred || 0;
  const pendingCount = data?.pendingReferred || 0;
  const totalReferralsCount = qualifiedCount + pendingCount;
  const totalEarned = data?.totalEarned || 0;
  const pendingEarned = data?.pendingEarned || 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Back Button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">
            Referral Program
          </h1>
          <p className="text-[var(--color-text-muted)]">
            Invite friends and earn rewards when they trade
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-gold)]/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-[var(--color-gold)]" />
              </div>
              <span className="text-sm text-[var(--color-text-muted)]">Total Referrals</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              {totalReferralsCount}
            </p>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-emerald-500" />
              </div>
              <span className="text-sm text-[var(--color-text-muted)]">Qualified</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              {qualifiedCount}
            </p>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
              <span className="text-sm text-[var(--color-text-muted)]">Total Earned</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              ${totalEarned.toFixed(2)}
            </p>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Gift className="w-5 h-5 text-purple-500" />
              </div>
              <span className="text-sm text-[var(--color-text-muted)]">Pending</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              ${pendingEarned.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Share Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Share Card */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
              <h2 className="text-xl font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-[var(--color-gold)]" />
                Share Your Link
              </h2>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 p-3 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg">
                    <LinkIcon className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <input 
                      type="text" 
                      value={referralLink}
                      readOnly
                      className="flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-2.5 bg-[var(--color-gold)] text-black font-medium rounded-lg hover:bg-[var(--color-gold)]/90 transition-colors flex items-center gap-2"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={shareReferral}
                    className="px-4 py-2.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg hover:bg-[var(--color-surface2)] transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* QR Code */}
              <div className="flex items-center gap-6">
                <div className="p-3 bg-white rounded-lg">
                  <QRCodeSVG 
                    value={referralLink} 
                    size={120}
                    level="M"
                    includeMargin={true}
                  />
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-muted)] mb-2">
                    Scan this QR code or share your link
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Your referral code: <span className="font-mono font-bold text-[var(--color-gold)]">{user?.referralCode}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg w-fit">
              {[
                { id: 'overview', label: 'Overview', icon: TrendingUp },
                { id: 'referrals', label: 'My Referrals', icon: Users },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab === tab.id 
                      ? 'bg-[var(--color-gold)] text-black' 
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                <h3 className="font-semibold text-[var(--color-text)] mb-4">Recent Referrals</h3>
                {history.length === 0 ? (
                  <div className="text-center py-8 text-[var(--color-text-muted)]">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No referrals yet. Share your link to get started!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.slice(0, 5).map(ref => (
                      <div 
                        key={ref._id}
                        className="flex items-center justify-between p-3 bg-[var(--color-surface2)] rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center">
                            <span className="text-xs font-medium text-[var(--color-gold)]">
                              {ref.referee?.username?.[0] || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--color-text)]">
                              {ref.referee?.username || 'Anonymous'}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {new Date(ref.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            ref.status === 'qualified' 
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : ref.status === 'pending'
                              ? 'bg-yellow-500/10 text-yellow-500'
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {ref.status}
                          </span>
                          <span className="text-sm font-medium text-[var(--color-text)]">
                            ${ref.totalCommissionGenerated?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'referrals' && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                <h3 className="font-semibold text-[var(--color-text)] mb-4">All Referrals</h3>
                {history.length === 0 ? (
                  <div className="text-center py-8 text-[var(--color-text-muted)]">
                    <p>No referrals yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map(ref => (
                      <div 
                        key={ref._id}
                        className="flex items-center justify-between p-4 bg-[var(--color-surface2)] rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-[var(--color-gold)]">
                              {ref.referee?.username?.[0] || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-[var(--color-text)]">
                              {ref.referee?.username || 'Anonymous'}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              Joined {new Date(ref.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-[var(--color-text)]">
                            ${ref.totalCommissionGenerated?.toFixed(2) || '0.00'}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            ref.status === 'qualified' 
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : ref.status === 'pending'
                              ? 'bg-yellow-500/10 text-yellow-500'
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {ref.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Milestones & Info */}
          <div className="space-y-6">
            {/* Milestones Card */}
            {/* <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
              <h3 className="font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[var(--color-gold)]" />
                Milestone Rewards
              </h3>

              {milestones.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Milestone rewards coming soon
                </p>
              ) : (
                <div className="space-y-3">
                  {milestones.map((m, idx) => (
                    <div 
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        m.achieved 
                          ? 'bg-emerald-500/5 border-emerald-500/20' 
                          : m === nextMilestone
                          ? 'bg-[var(--color-gold)]/5 border-[var(--color-gold)]/20'
                          : 'bg-[var(--color-surface2)] border-[var(--color-border)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {m.count} Referrals
                        </span>
                        {m.achieved && <Check className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Earn ${m.bonus} bonus
                      </p>
                      {!m.achieved && m === nextMilestone && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-[var(--color-surface2)] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[var(--color-gold)] rounded-full"
                              style={{ width: `${Math.min((qualifiedCount / m.count) * 100, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            {qualifiedCount} / {m.count} qualified
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div> */}

            {/* How It Works */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
              <h3 className="font-semibold text-[var(--color-text)] mb-4">How It Works</h3>
              <div className="space-y-4">
                {[
                  { icon: Share2, text: 'Share your unique referral link with friends' },
                  { icon: UserPlus, text: 'They sign up using your link' },
                  { icon: TrendingUp, text: 'They trade $5+ to become qualified' },
                  { icon: Gift, text: 'You both earn signup bonuses' },
                  { icon: DollarSign, text: 'Earn 5% commission on their trading fees forever' },
                ].map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-gold)]/10 flex items-center justify-center flex-shrink-0">
                      <step.icon className="w-4 h-4 text-[var(--color-gold)]" />
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Commission Info */}
            <div className="bg-gradient-to-br from-[var(--color-gold)]/10 to-transparent border border-[var(--color-gold)]/20 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-[var(--color-gold)]" />
                <h3 className="font-semibold text-[var(--color-text)]">Commission Rate</h3>
              </div>
              <p className="text-3xl font-bold text-[var(--color-gold)] mb-2">5%</p>
              <p className="text-sm text-[var(--color-text-muted)]">
                of platform fees from your referrals' trades
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ReferralPage;
