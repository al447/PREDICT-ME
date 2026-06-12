import { useState, useEffect } from 'react';
import { Bell, BellOff, Trash2, Plus, X } from 'lucide-react';
import useNotificationStore from '../../store/notificationStore';
import toast from 'react-hot-toast';

const CATEGORY_LABELS = {
  orderFills: { label: 'Order Fills', desc: 'When your orders are filled or partially filled' },
  tradeExecutions: { label: 'Trade Executions', desc: 'When trades are executed on your behalf' },
  marketResolution: { label: 'Market Resolution', desc: 'When a market you have a position in resolves' },
  positionUpdates: { label: 'Position Outcomes', desc: 'Win, loss, and refund notifications' },
  deposits: { label: 'Deposits', desc: 'Deposit confirmations and pending notifications' },
  withdrawals: { label: 'Withdrawals', desc: 'Withdrawal confirmations and status updates' },
  priceAlerts: { label: 'Price Alerts', desc: 'Custom price target alerts you set' },
  priceMovements: { label: 'Price Movements', desc: 'Significant price changes on your positions' },
  whaleAlerts: { label: 'Whale Alerts', desc: 'Large trades on markets you follow' },
  marketClosing: { label: 'Market Closing', desc: 'Markets closing soon that you have positions in' },
  system: { label: 'System', desc: 'Platform announcements and updates' },
  referral: { label: 'Referrals', desc: 'Referral bonuses and milestones' },
};

const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
      checked ? 'bg-[#4f6ef7]' : 'bg-[var(--color-border)]'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
      checked ? 'translate-x-5' : ''
    }`} />
  </button>
);

const NotificationSettings = () => {
  const { preferences, fetchPreferences, updatePreferences, preferencesLoading } = useNotificationStore();
  const [localPrefs, setLocalPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    if (preferences) setLocalPrefs(preferences);
  }, [preferences]);

  const handleCategoryToggle = async (key, value) => {
    const updated = { ...localPrefs.categories, [key]: value };
    setLocalPrefs(prev => ({ ...prev, categories: updated }));
    try {
      setSaving(true);
      await updatePreferences({ categories: updated });
      toast.success('Preference updated');
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleThresholdChange = async (key, value) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
  };

  const saveThresholds = async () => {
    try {
      setSaving(true);
      await updatePreferences({
        priceMovementThreshold: localPrefs.priceMovementThreshold,
        whaleTradeThreshold: localPrefs.whaleTradeThreshold,
        digestFrequency: localPrefs.digestFrequency,
      });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (preferencesLoading || !localPrefs) {
    return (
      <div className="p-6 text-center text-[var(--color-text-muted)]">
        Loading notification settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">Notification Settings</h3>
        <p className="text-sm text-[var(--color-text-muted)]">Customize which notifications you receive</p>
      </div>

      {/* Category Toggles */}
      <div className="space-y-1">
        {Object.entries(CATEGORY_LABELS).map(([key, { label, desc }]) => (
          <div
            key={key}
            className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--color-surface2)] transition-colors"
          >
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{desc}</p>
            </div>
            <Toggle
              checked={localPrefs.categories?.[key] !== false}
              onChange={(v) => handleCategoryToggle(key, v)}
              disabled={saving}
            />
          </div>
        ))}
      </div>

      {/* Thresholds */}
      <div className="space-y-4 p-4 bg-[var(--color-surface2)] rounded-xl border border-[var(--color-border)]">
        <h4 className="text-sm font-semibold text-[var(--color-text)]">Alert Thresholds</h4>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--color-text)]">Price movement threshold</p>
            <p className="text-xs text-[var(--color-text-muted)]">Minimum % change to trigger alert</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="50"
              value={localPrefs.priceMovementThreshold || 10}
              onChange={(e) => handleThresholdChange('priceMovementThreshold', parseInt(e.target.value) || 10)}
              className="w-16 px-2 py-1 text-sm text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
            />
            <span className="text-sm text-[var(--color-text-muted)]">%</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--color-text)]">Whale trade threshold</p>
            <p className="text-xs text-[var(--color-text-muted)]">Minimum trade size for whale alerts</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)]">$</span>
            <input
              type="number"
              min="100"
              max="1000000"
              step="100"
              value={localPrefs.whaleTradeThreshold || 10000}
              onChange={(e) => handleThresholdChange('whaleTradeThreshold', parseInt(e.target.value) || 10000)}
              className="w-24 px-2 py-1 text-sm text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--color-text)]">Notification frequency</p>
            <p className="text-xs text-[var(--color-text-muted)]">How often you receive bundled notifications</p>
          </div>
          <select
            value={localPrefs.digestFrequency || 'instant'}
            onChange={(e) => handleThresholdChange('digestFrequency', e.target.value)}
            className="px-3 py-1 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
          >
            <option value="instant">Instant</option>
            <option value="hourly">Hourly Digest</option>
            <option value="daily">Daily Digest</option>
            <option value="off">Off</option>
          </select>
        </div>

        <button
          onClick={saveThresholds}
          disabled={saving}
          className="w-full mt-2 py-2 bg-[#4f6ef7] hover:bg-[#3b5ae0] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Thresholds'}
        </button>
      </div>

      {/* Price Alerts List */}
      {localPrefs.priceAlerts?.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">Active Price Alerts</h4>
          {localPrefs.priceAlerts
            .filter(a => !a.triggered)
            .map((alert) => (
              <div key={alert._id} className="flex items-center justify-between p-3 bg-[var(--color-surface2)] rounded-lg border border-[var(--color-border)]">
                <div>
                  <p className="text-sm text-[var(--color-text)]">
                    {alert.outcome || 'Yes'} price {alert.direction} ${alert.targetPrice?.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => useNotificationStore.getState().removePriceAlert(alert._id)}
                  className="p-1 text-[var(--color-text-muted)] hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;
