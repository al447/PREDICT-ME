import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminMarketsAPI } from '../../services/adminApi';
import ImageUpload from '../../components/admin/ImageUpload';
import MarkdownPreview from '../../components/admin/MarkdownPreview';

const CATEGORIES = ['crypto', 'sports', 'weather', 'politics', 'finance', 'breaking'];

const defaultForm = () => ({
  title: '', description: '', categorySlug: '', image: '📊',
  endDate: '', closeDate: '', rules: '', sourceOfTruth: '',
  tags: [], featured: false,
  outcomes: [{ name: 'Yes', probability: 50, price: 50 }, { name: 'No', probability: 50, price: 50 }],
});

const AdminMarketCreate = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm());
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const validate = () => {
    const e = {};
    if (!form.title || form.title.trim().length < 5) e.title = 'Title must be at least 5 characters';
    if (form.title.trim().length > 200) e.title = 'Title too long (max 200)';
    if (!form.categorySlug) e.categorySlug = 'Category is required';
    if (!form.endDate || new Date(form.endDate) <= new Date()) e.endDate = 'End date must be in the future';
    if (form.closeDate && new Date(form.closeDate) > new Date(form.endDate)) e.closeDate = 'Close date must be ≤ end date';
    if (!form.rules || form.rules.trim().length === 0) e.rules = 'Rules are required';
    if (!form.sourceOfTruth || form.sourceOfTruth.trim().length < 5) e.sourceOfTruth = 'Source of truth is required (min 5 chars)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

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
    if (!validate()) return;
    setLoading(true);
    const tid = toast.loading('Deploying market to Polygon Amoy...');
    try {
      const { data } = await adminMarketsAPI.create(form);
      toast.success('Market created and deployed on-chain!', { id: tid });
      if (data.txHash) {
        toast.custom((t) => (
          <div className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 flex items-center gap-3 text-sm shadow-xl ${t.visible ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-[var(--color-text)]">View transaction</span>
            <a href={`https://amoy.polygonscan.com/tx/${data.txHash}`} target="_blank" rel="noreferrer"
              className="text-[var(--color-gold)] flex items-center gap-1 hover:underline">
              Polygonscan <ExternalLink size={12} />
            </a>
          </div>
        ), { duration: 8000 });
      }
      navigate(`/admin/markets/${data.market._id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create market', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (field) =>
    `w-full bg-[var(--color-surface2)] border rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none transition-colors ${errors[field] ? 'border-[var(--color-red)]' : 'border-[var(--color-border)] focus:border-[var(--color-gold)]'}`;

  return (
    <div className="max-w-5xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/markets" className="p-2 rounded-xl hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] transition-all"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Create Market</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Basic Info</h2>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Title <span className="text-[var(--color-red)]">*</span></label>
                <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls('title')} placeholder="Will BTC exceed $100K before 2027?" maxLength={200} />
                <div className="flex justify-between mt-1">
                  {errors.title && <p className="text-xs text-[var(--color-red)]">{errors.title}</p>}
                  <span className="text-xs text-[var(--color-text-muted)] ml-auto">{form.title.length}/200</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000}
                  className={inputCls('description') + ' resize-none'} placeholder="Provide context for traders..." />
                <p className="text-xs text-[var(--color-text-muted)] mt-1 text-right">{form.description.length}/2000</p>
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Category <span className="text-[var(--color-red)]">*</span></label>
                <select value={form.categorySlug} onChange={(e) => set('categorySlug', e.target.value)} className={inputCls('categorySlug')}>
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                {errors.categorySlug && <p className="text-xs text-[var(--color-red)] mt-1">{errors.categorySlug}</p>}
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Market Image</label>
                <ImageUpload value={form.image} onChange={(v) => set('image', v)} />
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Tags (max 10, press Enter)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 rounded-full text-xs text-[var(--color-gold)]">
                      {tag}
                      <button type="button" onClick={() => set('tags', form.tags.filter(t => t !== tag))} className="hover:text-white">×</button>
                    </span>
                  ))}
                </div>
                {form.tags.length < 10 && (
                  <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagAdd}
                    placeholder="Add tag..." className={inputCls('tags')} />
                )}
              </div>

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
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Dates & Resolution</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">End Date <span className="text-[var(--color-red)]">*</span></label>
                  <input type="datetime-local" value={form.endDate} onChange={(e) => { set('endDate', e.target.value); if (!form.closeDate) set('closeDate', e.target.value); }}
                    className={inputCls('endDate')} />
                  {errors.endDate && <p className="text-xs text-[var(--color-red)] mt-1">{errors.endDate}</p>}
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Close Date</label>
                  <input type="datetime-local" value={form.closeDate} onChange={(e) => set('closeDate', e.target.value)} className={inputCls('closeDate')} />
                  {errors.closeDate && <p className="text-xs text-[var(--color-red)] mt-1">{errors.closeDate}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">Source of Truth <span className="text-[var(--color-red)]">*</span></label>
                <input type="text" value={form.sourceOfTruth} onChange={(e) => set('sourceOfTruth', e.target.value)} className={inputCls('sourceOfTruth')}
                  placeholder="e.g. CoinGecko BTC price at market end date" maxLength={500} />
                {errors.sourceOfTruth && <p className="text-xs text-[var(--color-red)] mt-1">{errors.sourceOfTruth}</p>}
              </div>
            </div>

            <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Rules <span className="text-[var(--color-red)]">*</span></h2>
              <MarkdownPreview value={form.rules} onChange={(v) => set('rules', v)} placeholder="Enter resolution rules in markdown..." rows={6} />
              {errors.rules && <p className="text-xs text-[var(--color-red)]">{errors.rules}</p>}
            </div>

            <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Outcomes</h2>
              {form.outcomes.map((outcome, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input type="text" value={outcome.name} onChange={(e) => {
                    const o = [...form.outcomes]; o[i] = { ...o[i], name: e.target.value };
                    set('outcomes', o);
                  }} className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)]" />
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100} value={outcome.probability} onChange={(e) => {
                      const o = [...form.outcomes]; o[i] = { ...o[i], probability: Number(e.target.value), price: Number(e.target.value) };
                      set('outcomes', o);
                    }} className="w-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-2 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-gold)] text-center" />
                    <span className="text-xs text-[var(--color-text-muted)]">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-[var(--color-border)]">
          <Link to="/admin/markets" className="px-5 py-2.5 border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-all">
            Cancel
          </Link>
          <button type="submit" disabled={loading}
            className="px-6 py-2.5 bg-[var(--color-gold)] text-black font-semibold rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Deploying to chain...' : 'Create Market'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminMarketCreate;
