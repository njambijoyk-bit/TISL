import { useState } from 'react';
import { X, Tag, CheckCircle, AlertCircle } from 'lucide-react';
import usePromoCodeStore from '../../../store/promoCodeStore';

const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.07)';
const purpleBd = 'rgba(168,85,247,0.2)';

const iBase = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none',
  color: '#111827', boxSizing: 'border-box', fontWeight: 500,
  background: 'white', transition: 'border-color 0.15s',
};
const fIn  = e => { e.currentTarget.style.borderColor = purple; };
const fOut = e => { e.currentTarget.style.borderColor = '#e5e7eb'; };

const labelStyle = {
  display: 'block', fontSize: '0.74rem', fontWeight: 700,
  color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 6,
};

const Field = ({ label, required, children, hint, error }) => (
  <div>
    {label && (
      <label style={labelStyle}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
    )}
    {children}
    {error && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4 }}>{error}</p>}
    {hint && !error && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{hint}</p>}
  </div>
);

const EVENT_TYPES = [
  ['birthday',          '🎂 Birthday'],
  ['first_time',        '🎉 First Time'],
  ['vip_upgrade',       '🏆 VIP Upgrade'],
  ['loyalty_milestone', '🎯 Loyalty Milestone'],
  ['win_back',          '👋 Win-Back'],
  ['seasonal',          '🌟 Seasonal'],
  ['flash_sale',        '⚡ Flash Sale'],
  ['bulk_order',        '📦 Bulk Order'],
  ['general',           '🏷 General'],
];

const REWARD_TYPES = [
  ['percentage',    'Percentage (%)'],
  ['fixed_amount',  'Fixed Amount (KES)'],
];

export default function CreatePromoModal({ onClose, onSuccess }) {
  const { createCode } = usePromoCodeStore();

  const [form, setForm] = useState({
    name:                   '',
    code:                   '',
    description:            '',
    event_type:             'general',
    type:                   'general',
    reward_type:            'percentage',
    reward_value:           10,
    max_uses:               '',
    max_uses_per_customer:  1,
    valid_from:             '',
    valid_until:            '',
    min_order_value:        '',
    stackable:              false,
    is_public:              true,
    status:                 'active',
    admin_notes:            '',
  });

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  // Keep type in sync with event_type for backend
  const setEventType = (val) => {
    const typeMap = {
      birthday:          'birthday',
      first_time:        'first_time',
      vip_upgrade:       'vip',
      loyalty_milestone: 'general',
      win_back:          'general',
      seasonal:          'event',
      flash_sale:        'event',
      bulk_order:        'bulk_order',
      general:           'general',
    };
    setForm(f => ({ ...f, event_type: val, type: typeMap[val] || 'general' }));
  };

  const validate = () => {
    if (!form.name.trim())         return 'Name is required.';
    if (!form.reward_value)        return 'Reward value is required.';
    if (form.reward_type === 'percentage' && (form.reward_value < 1 || form.reward_value > 100)) {
      return 'Percentage must be between 1 and 100.';
    }
    if (form.valid_until && form.valid_from && form.valid_until <= form.valid_from) {
      return 'Expiry date must be after start date.';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true); setError('');
    try {
      await createCode({
        ...form,
        code:                  form.code.trim().toUpperCase() || undefined,
        max_uses:              form.max_uses              ? parseInt(form.max_uses)              : null,
        max_uses_per_customer: form.max_uses_per_customer ? parseInt(form.max_uses_per_customer) : null,
        min_order_value:       form.min_order_value       ? parseFloat(form.min_order_value)     : null,
        reward_value:          parseFloat(form.reward_value),
        valid_from:            form.valid_from  || null,
        valid_until:           form.valid_until || null,
        stackable:             form.stackable   ? 1 : 0,
        is_public:             form.is_public   ? 1 : 0,
      });
      onSuccess();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create promo code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 60, padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth: 580,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden',
        margin: 'auto',
      }}>
        {/* Accent bar */}
        <div style={{ height: 3, background: `linear-gradient(90deg,${purple},${purpleDk})` }} />

        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6',
          background: purpleLt, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#c084fc', marginBottom: 3 }}>
              Admin
            </p>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: purple, margin: 0 }}>
              Create Promo Code
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 3 }}>
              Create a discount code for campaigns, events or customer rewards
            </p>
          </div>
          <button onClick={onClose} disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {error && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Name + Code */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name" required>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Black Friday 2025" style={iBase} onFocus={fIn} onBlur={fOut} />
            </Field>
            <Field label="Code" hint="Leave blank to auto-generate">
              <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="e.g. SAVE20" style={{ ...iBase, fontFamily: 'monospace', letterSpacing: '0.05em' }}
                onFocus={fIn} onBlur={fOut} />
            </Field>
          </div>

          {/* Description */}
          <Field label="Description">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Describe what this code is for…" rows={2}
              style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }}
              onFocus={fIn} onBlur={fOut} />
          </Field>

          {/* Event Type */}
          <Field label="Event Type" required>
            <select value={form.event_type} onChange={e => setEventType(e.target.value)}
              style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
              {EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>

          {/* Reward */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Reward Type" required>
              <select value={form.reward_type} onChange={e => set('reward_type', e.target.value)}
                style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                {REWARD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field
              label={form.reward_type === 'percentage' ? 'Discount %' : 'Discount Amount (KES)'}
              required
              hint={form.reward_type === 'free_shipping' || form.reward_type === 'store_credit' ? 'Value not applicable for this type' : undefined}
            >
              <input
                type="number" min="0" step="0.01"
                value={form.reward_value}
                onChange={e => set('reward_value', e.target.value)}
                disabled={form.reward_type === 'free_shipping'}
                style={iBase} onFocus={fIn} onBlur={fOut}
              />
            </Field>
          </div>

          {/* Usage limits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Max Total Uses" hint="Leave blank for unlimited">
              <input type="number" min="1" value={form.max_uses}
                onChange={e => set('max_uses', e.target.value)}
                placeholder="Unlimited" style={iBase} onFocus={fIn} onBlur={fOut} />
            </Field>
            <Field label="Max Uses Per Customer">
              <input type="number" min="1" value={form.max_uses_per_customer}
                onChange={e => set('max_uses_per_customer', e.target.value)}
                style={iBase} onFocus={fIn} onBlur={fOut} />
            </Field>
          </div>

          {/* Validity dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Valid From">
              <input type="date" value={form.valid_from}
                onChange={e => set('valid_from', e.target.value)}
                style={iBase} onFocus={fIn} onBlur={fOut} />
            </Field>
            <Field label="Valid Until">
              <input type="date" value={form.valid_until}
                onChange={e => set('valid_until', e.target.value)}
                style={iBase} onFocus={fIn} onBlur={fOut} />
            </Field>
          </div>

          {/* Min order value */}
          <Field label="Minimum Order Value" hint="Leave blank for no minimum">
            <input type="number" min="0" step="0.01" value={form.min_order_value}
              onChange={e => set('min_order_value', e.target.value)}
              placeholder="e.g. 5000" style={iBase} onFocus={fIn} onBlur={fOut} />
          </Field>

          {/* Toggles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {[
              { key: 'is_public',  label: 'Public (anyone can use)' },
              { key: 'stackable',  label: 'Stackable (combines with referral discount)' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{
                  width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                  background: form[key] ? purple : 'white',
                  border: `2px solid ${form[key] ? purple : '#d1d5db'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                  {form[key] && <CheckCircle size={10} color="white" />}
                </div>
                <input type="checkbox" checked={form[key]}
                  onChange={e => set(key, e.target.checked)}
                  style={{ display: 'none' }} />
                <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>{label}</span>
              </label>
            ))}
          </div>

          {/* Status */}
          <Field label="Initial Status">
            <select value={form.status} onChange={e => set('status', e.target.value)}
              style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
              <option value="active">Active — usable immediately</option>
              <option value="draft">Draft — not usable yet</option>
              <option value="paused">Paused</option>
            </select>
          </Field>

          {/* Admin notes */}
          <Field label="Admin Notes" hint="Internal only, not visible to customers">
            <textarea value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)}
              placeholder="Internal notes…" rows={2}
              style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', background: purpleLt, borderColor: purpleBd }}
              onFocus={fIn} onBlur={fOut} />
          </Field>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f3f4f6',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button onClick={onClose} disabled={loading}
            style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', color: '#6b7280', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', background: 'transparent' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: loading ? '#e5e7eb' : `linear-gradient(135deg,${purple},${purpleDk})`,
              color: loading ? '#9ca3af' : 'white', fontSize: '0.85rem', fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(168,85,247,0.3)',
            }}>
            {loading ? 'Creating…' : 'Create Code'}
          </button>
        </div>
      </div>
    </div>
  );
}