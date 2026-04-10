import { useState } from 'react';
import { X, Gift, AlertCircle } from 'lucide-react';
import useReferralsStore from '../../../store/referralsStore';
import toast from 'react-hot-toast';

const TYPES = [
  { value: 'general',    label: 'General',    color: '#6366f1' },
  { value: 'first_time', label: 'First Time', color: '#0891b2' },
  { value: 'bulk_order', label: 'Bulk Order', color: '#7c3aed' },
  { value: 'vip',        label: 'VIP',        color: '#d97706' },
  { value: 'birthday',   label: 'Birthday',   color: '#db2777' },
  { value: 'event',      label: 'Event',      color: '#dc2626' },
];

const REWARD_TYPES = [
  { value: 'percentage',   label: '% Discount'    },
  { value: 'fixed_amount', label: 'Fixed Amount'  },
  { value: 'free_shipping',label: 'Free Shipping' },
  { value: 'store_credit', label: 'Store Credit'  },
];

const REFERRER_REWARD_TYPES = [
  { value: 'none',         label: 'None'          },
  { value: 'store_credit', label: 'Store Credit'  },
  { value: 'points',       label: 'Loyalty Points'},
  { value: 'fixed_amount', label: 'Fixed Amount'  },
  { value: 'percentage',   label: '% of Order'   },
];

const STATUS_OPTIONS = [
  { value: 'draft',  label: 'Draft',  dot: '#9ca3af' },
  { value: 'active', label: 'Active', dot: '#22c55e' },
];

export default function CreateReferralModal({ onClose, onSuccess }) {
  const { createCode, actionLoading } = useReferralsStore();

  const [form, setForm] = useState({
    name: '', code: '', description: '',
    type: 'general',
    reward_type: 'percentage', reward_value: '',
    referrer_reward_type: 'none', referrer_reward_value: '',
    max_uses: '', max_uses_per_customer: 1,
    min_order_value: '', min_items: '',
    valid_from: '', valid_until: '',
    stackable: false, is_public: true, auto_apply: false,
    status: 'draft',
    admin_notes: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError,   setFormError]   = useState('');

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setFieldErrors(e => { const n = { ...e }; delete n[k]; return n; });
    setFormError('');
  };

  const handleSubmit = async () => {
    setFieldErrors({});
    setFormError('');
    try {
      await createCode(form);
      toast.success('Referral code created.');
      onSuccess();
    } catch (err) {
      const status = err.response?.status;
      const data   = err.response?.data;
      if (status === 422 && data?.errors) {
        setFieldErrors(data.errors);
        setFormError('Please fix the errors below.');
      } else {
        setFormError(data?.message || 'Failed to create code.');
      }
    }
  };

  const showReferrerValue = form.referrer_reward_type !== 'none';
  const showRewardValue   = form.reward_type !== 'free_shipping';
  const selectedType      = TYPES.find(t => t.value === form.type) || TYPES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ boxShadow: '0 32px 80px rgba(124,58,237,0.2), 0 8px 32px rgba(0,0,0,0.25)', maxHeight: '92vh' }}>

        {/* Top accent */}
        <div className="h-1.5 flex-shrink-0" style={{ background: `linear-gradient(90deg, ${selectedType.color}, #7c3aed)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: selectedType.color + '18' }}>
              <Gift size={16} style={{ color: selectedType.color }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Create Referral Code</h2>
              <p className="text-xs text-gray-400 leading-tight">Set up a discount or referral promotion</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {formError && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-50 border border-red-200">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-600">{formError}</p>
            </div>
          )}

          {/* Type */}
          <div>
            <Label>Code Type *</Label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => set('type', t.value)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                  style={form.type === t.value
                    ? { background: t.color + '18', color: t.color, borderColor: t.color + '55', boxShadow: `0 0 0 3px ${t.color}18` }
                    : { background: 'transparent', color: '#9ca3af', borderColor: '#e5e7eb' }
                  }>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name + Code */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *" error={fieldErrors.name?.[0]}>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Summer Sale 20%" className={cls(fieldErrors.name)} />
            </Field>
            <Field label="Code (leave blank to auto-generate)" error={fieldErrors.code?.[0]}>
              <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="AUTO-GENERATED" className={cls(fieldErrors.code) + ' font-mono tracking-wider uppercase'} />
            </Field>
            <Field label="Description" error={fieldErrors.description?.[0]} className="col-span-2">
              <input value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Brief description shown to customers" className={cls(fieldErrors.description)} />
            </Field>
          </div>

          {/* Reward */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer Reward Type *" error={fieldErrors.reward_type?.[0]}>
              <select value={form.reward_type} onChange={e => set('reward_type', e.target.value)} className={cls(fieldErrors.reward_type)}>
                {REWARD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            {showRewardValue && (
              <Field label={`Reward Value ${form.reward_type === 'percentage' ? '(%)' : '(KES)'} *`} error={fieldErrors.reward_value?.[0]}>
                <input type="number" min="0" value={form.reward_value} onChange={e => set('reward_value', e.target.value)}
                  placeholder="0" className={cls(fieldErrors.reward_value)} />
              </Field>
            )}
          </div>

          {/* Referrer reward */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Referrer Reward Type" error={fieldErrors.referrer_reward_type?.[0]}>
              <select value={form.referrer_reward_type} onChange={e => set('referrer_reward_type', e.target.value)} className={cls(fieldErrors.referrer_reward_type)}>
                {REFERRER_REWARD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            {showReferrerValue && (
              <Field label="Referrer Reward Value" error={fieldErrors.referrer_reward_value?.[0]}>
                <input type="number" min="0" value={form.referrer_reward_value} onChange={e => set('referrer_reward_value', e.target.value)}
                  placeholder="0" className={cls(fieldErrors.referrer_reward_value)} />
              </Field>
            )}
          </div>

          {/* Limits */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Max Total Uses" error={fieldErrors.max_uses?.[0]}>
              <input type="number" min="1" value={form.max_uses} onChange={e => set('max_uses', e.target.value)}
                placeholder="Unlimited" className={cls(fieldErrors.max_uses)} />
            </Field>
            <Field label="Per Customer" error={fieldErrors.max_uses_per_customer?.[0]}>
              <input type="number" min="1" value={form.max_uses_per_customer} onChange={e => set('max_uses_per_customer', e.target.value)}
                className={cls(fieldErrors.max_uses_per_customer)} />
            </Field>
            <Field label="Min Order (KES)" error={fieldErrors.min_order_value?.[0]}>
              <input type="number" min="0" value={form.min_order_value} onChange={e => set('min_order_value', e.target.value)}
                placeholder="0" className={cls(fieldErrors.min_order_value)} />
            </Field>
          </div>

          {/* Validity */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valid From" error={fieldErrors.valid_from?.[0]}>
              <input type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} className={cls(fieldErrors.valid_from)} />
            </Field>
            <Field label="Valid Until" error={fieldErrors.valid_until?.[0]}>
              <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} className={cls(fieldErrors.valid_until)} />
            </Field>
          </div>

          {/* Status */}
          <div>
            <Label>Initial Status</Label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} type="button" onClick={() => set('status', s.value)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                  style={form.status === s.value
                    ? { background: s.dot + '18', color: s.dot === '#9ca3af' ? '#6b7280' : '#15803d', borderColor: s.dot + '66' }
                    : { background: 'transparent', color: '#9ca3af', borderColor: '#e5e7eb' }
                  }>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'is_public',  label: 'Public',     sub: 'Visible to all customers' },
              { key: 'stackable',  label: 'Stackable',  sub: 'Can combine with other codes' },
              { key: 'auto_apply', label: 'Auto Apply', sub: 'Apply automatically via link' },
            ].map(({ key, label, sub }) => (
              <button key={key} type="button" onClick={() => set(key, !form[key])}
                className="flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all"
                style={form[key]
                  ? { background: '#f5f3ff', borderColor: '#c4b5fd' }
                  : { background: '#f9fafb', borderColor: '#f3f4f6' }
                }>
                <div className="mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: form[key] ? '#7c3aed' : '#e5e7eb' }}>
                  {form[key] && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Admin notes */}
          <Field label="Admin Notes (internal only)">
            <textarea rows={2} value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)}
              placeholder="Internal notes about this code…"
              className={cls() + ' resize-none'} />
          </Field>

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={actionLoading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', boxShadow: '0 4px 14px rgba(168,85,247,0.35)' }}>
            {actionLoading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</>
              : <><Gift size={14} /> Create Code</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">{children}</label>;
}

function Field({ label, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

const cls = (error) =>
  `w-full px-3 py-2.5 rounded-xl text-sm border outline-none transition-all dark:bg-gray-800 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 ${
    error
      ? 'border-red-400 bg-red-50/30 focus:border-red-400 focus:ring-2 focus:ring-red-100'
      : 'border-gray-200 dark:border-gray-700 focus:border-purple-400 focus:ring-2 focus:ring-purple-100'
  }`;