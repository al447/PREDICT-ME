import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAuthAPI } from '../../services/adminApi';
import useAdminAuthStore from '../../store/adminAuthStore';

const AdminLoginPage = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setAdmin, admin } = useAdminAuthStore();
  const navigate = useNavigate();

  if (admin) { navigate('/admin', { replace: true }); return null; }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await adminAuthAPI.login({ email: form.email, password: form.password });
      setAdmin(data.admin, data.token);
      toast.success(`Welcome back, ${data.admin.username || data.admin.email}!`);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg)] to-[var(--color-surface)] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[var(--color-gold)]/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[var(--color-gold)]/30">
            <Crown size={28} className="text-[var(--color-gold)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Admin Sign In</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">PolyBet365 Admin Panel</p>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required
                  className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl pl-10 pr-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
                  placeholder="admin@polybet365.com" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} required
                  className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl pl-10 pr-10 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 rounded-xl px-3 py-2 text-sm text-[var(--color-red)]">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[var(--color-gold)] text-black font-semibold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLoginPage;
