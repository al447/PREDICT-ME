import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminMarketsAPI } from '../../services/adminApi';
import ImageUpload from '../../components/admin/ImageUpload';
import MarkdownPreview from '../../components/admin/MarkdownPreview';

const AdminMarketEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [market, setMarket] = useState(null);
  const [form, setForm] = useState({});
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminMarketsAPI.getOne(id);
        const m = data.market;
        setMarket(m);
        setIsLocked(data.stats.tradeCount > 0);
        setForm({
          title: m.title,
          description: m.description || '',
          image: m.image || '📊',
          rules: m.rules || '',
          sourceOfTruth: m.sourceOfTruth || '',
          tags: m.tags || [],
          featured: m.featured || false,
          endDate: m.endDate ? new Date(m.endDate).toISOString().slice(0, 16) : '',
          closeDate: m.closeDate ? new Date(m.closeDate).toISOString().slice(0, 16) : '',
        });
      } catch { toast.error('Market not found'); navigate('/admin/markets'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleTagAdd = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (tag && !form.tags.includes(tag) && form.tags.length < 10) {
        set('tags', [...form.tags, tag]);
      }
      setTagInput('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminMarketsAPI.update(id, form);
      toast.success('Market updated!');
      navigate(`/admin/markets/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] transition-colors';

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-[var(--color-gold)]" /></div>;
  if (market?.status === 'resolved') return (
    <div className="max-w-xl mx-auto text-center py-20">
      <AlertCircle size={40} className="text-[var(--color-red)] mx-auto mb-3" />
      <p className="text-[var(--color-text)] font-semibold mb-2">Resolved markets cannot be edited</p>
      <Link to={`/admin/markets/${id}`} className="text-sm text-[var(--color-gold)] hover:underline">← Back to market</Link>
    </div>
  );

  return (
    <div className="max-w-3xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/admin/markets/${id}`} className="p-2 rounded-xl hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] transition-all"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Edit Market</h1>
          <p className="text-sm text-[var(--color-text-muted)] truncate">{market?.title}</p>
        </div>
      </div>

      {isLocked && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-3 flex items-center gap-2 mb-4">
          <AlertCircle size={16} className="text-yellow-400 flex-shrink-0" />
          <p className="text-xs text-yellow-300">This market has trades or is deployed on-chain. Title, dates, and outcomes cannot be changed.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-4">
          {!isLocked && (
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Title</label>
              <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} maxLength={200} />
            </div>
          )}

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000} className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Market Image</label>
            <ImageUpload value={form.image} onChange={(v) => set('image', v)} />
          </div>

          {!isLocked && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">End Date</label>
                <input type="datetime-local" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Close Date</label>
                <input type="datetime-local" value={form.closeDate} onChange={(e) => set('closeDate', e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Source of Truth</label>
            <input type="text" value={form.sourceOfTruth} onChange={(e) => set('sourceOfTruth', e.target.value)} className={inputCls} maxLength={500} />
          </div>
        </div>

        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Rules</h2>
          <MarkdownPreview value={form.rules} onChange={(v) => set('rules', v)} rows={6} />
        </div>

        <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Tags</h2>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags?.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 rounded-full text-xs text-[var(--color-gold)]">
                {tag}
                <button type="button" onClick={() => set('tags', form.tags.filter(t => t !== tag))} className="hover:text-white">×</button>
              </span>
            ))}
          </div>
          {(form.tags?.length || 0) < 10 && (
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagAdd}
              placeholder="Add tag..." className={inputCls} />
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Featured market</label>
            <button
              type="button"
              onClick={() => set('featured', !form.featured)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-gold)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] ${form.featured ? 'bg-[var(--color-gold)]' : 'bg-[var(--color-surface2)]'}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.featured ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link to={`/admin/markets/${id}`} className="px-5 py-2.5 border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-all">
            Cancel
          </Link>
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-[var(--color-gold)] text-black font-semibold rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminMarketEdit;
