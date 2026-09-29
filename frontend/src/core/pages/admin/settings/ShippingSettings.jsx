import React, { useState, useEffect } from 'react';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import shippingAPI from '../../../../_shared/api/shipping';
import { useAuthStore } from '../../../../_shared/store/index';
import {
  Plus, Edit2, Save, X, Check, Trash2,
  ChevronDown, ChevronUp, Truck, Package,
  RefreshCw, UserPlus, Pencil, XCircle,
  Power, PowerOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import taxAPI from '../../../../_shared/api/tax';
import useCurrencyStore from '../../../../_shared/store/currencyStore';
import { useBaseCode } from '../../../../_shared/lib/baseCurrency';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};

const TH_LABEL = ({ children, right }) => (
  <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', display: 'block', textAlign: right ? 'right' : 'left' }}>
    {children}
  </span>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, hint }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

/** Currency + tax for a shipping option. The cost is entered in that currency and converted on each order. */
function useCurrencyChoices() {
  useBaseCode();   // makes sure currencies are loaded
  const currencies = useCurrencyStore((s) => s.currencies);
  const [rates, setRates] = useState([]);
  useEffect(() => {
    taxAPI.getRates({ active: true }).then((r) => setRates((r.tax_rates ?? []).filter((x) => x.rate_type === 'percentage' && x.tax_type?.application_mode !== 'withheld'))).catch(() => {});
  }, []);
  return { currencies, rates };
}

function MoneyFields({ form, set, choices, hintFree }) {
  const code = choices.currencies.find((c) => String(c.id) === String(form.currency_id))?.code
    ?? choices.currencies.find((c) => c.is_base)?.code ?? '';
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Currency" hint="Entered here, converted at each order's rate">
          <select value={form.currency_id ?? ''} onChange={set('currency_id')} style={inputStyle}>
            {choices.currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </Field>
        <Field label="Tax on delivery" hint="Adds this tax to the shipping charge">
          <select value={form.tax_rate_id ?? ''} onChange={set('tax_rate_id')} style={inputStyle}>
            <option value="">No tax</option>
            {choices.rates.map((r) => <option key={r.id} value={r.id}>{r.tax_type?.code} {Number(r.rate_value)}%</option>)}
          </select>
        </Field>
      </div>
      <Field label="Charged as" hint="A percentage of the goods, or a fixed amount">
        <select value={form.rate_type ?? 'fixed'} onChange={set('rate_type')} style={inputStyle}>
          <option value="fixed">Fixed amount</option><option value="percent">Percentage of the goods</option><option value="per_unit">Per unit (kg, km…)</option>
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={form.rate_type === 'percent' ? 'Rate (%)' : `Cost (${code})`}>
          <input type="number" step="0.01" min="0" required value={form.cost} onChange={set('cost')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        <Field label={`Free above (${code})`} hint={hintFree}>
          <input type="number" step="0.01" min="0" value={form.free_above} onChange={set('free_above')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label={`Minimum (${code})`}><input type="number" step="0.01" min="0" value={form.min_amount ?? ''} onChange={set('min_amount')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
        <Field label={`Maximum (${code})`}><input type="number" step="0.01" min="0" value={form.max_amount ?? ''} onChange={set('max_amount')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
        <Field label="Transit days"><input type="number" step="1" min="0" value={form.transit_days ?? ''} onChange={set('transit_days')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
      </div>
    </>
  );
}

function AddShippingModal({ onClose, onSave }) {
  const choices = useCurrencyChoices();
  const [form, setForm] = useState({ slug: '', name: '', description: '', cost: '', free_above: '', icon: 'Truck', sort_order: '0', currency_id: '', tax_rate_id: '', rate_type: 'fixed', min_amount: '', max_amount: '', transit_days: '' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      slug: form.slug.toLowerCase().replace(/\s+/g, '_'),
      free_above: form.free_above === '' ? null : form.free_above,
      min_amount: form.min_amount === '' ? null : form.min_amount,
      max_amount: form.max_amount === '' ? null : form.max_amount,
      transit_days: form.transit_days === '' ? null : form.transit_days,
      currency_id: form.currency_id || undefined,
      tax_rate_id: form.tax_rate_id || null,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Add shipping option</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name">
              <input type="text" required value={form.name} onChange={set('name')}
                placeholder="Express delivery" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
            <Field label="Slug">
              <input type="text" required value={form.slug} onChange={set('slug')}
                placeholder="express_delivery" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
          </div>
          <Field label="Description">
            <input type="text" value={form.description} onChange={set('description')}
              placeholder="1 business day" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
            />
          </Field>
          <MoneyFields form={form} set={set} choices={choices} hintFree="Leave empty = never free" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Icon" hint="Lucide icon name">
              <input type="text" value={form.icon} onChange={set('icon')}
                placeholder="Truck" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
            <Field label="Sort order">
              <input type="number" value={form.sort_order} onChange={set('sort_order')}
                placeholder="0" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
              border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', background: 'white', color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
            <button type="submit" style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
              boxShadow: '0 2px 8px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
            }}>Add option</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditShippingModal({ option, onClose, onSave }) {
  const [form, setForm] = useState({
    name: option.name || '',
    description: option.description || '',
    cost: option.cost ?? '',
    free_above: option.free_above ?? '',
    icon: option.icon || 'Truck',
    sort_order: option.sort_order ?? 0,
    currency_id: option.currency_id ?? '',
    tax_rate_id: option.tax_rate_id ?? '',
    rate_type: option.rate_type ?? 'fixed',
    min_amount: option.min_amount ?? '',
    max_amount: option.max_amount ?? '',
    transit_days: option.transit_days ?? '',
  });
  const choices = useCurrencyChoices();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(option.id, {
      ...form,
      currency_id: form.currency_id || undefined,
      tax_rate_id: form.tax_rate_id || null,
      free_above: form.free_above === '' ? null : form.free_above,
      min_amount: form.min_amount === '' ? null : form.min_amount,
      max_amount: form.max_amount === '' ? null : form.max_amount,
      transit_days: form.transit_days === '' ? null : form.transit_days,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Edit: {option.name}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name">
            <input type="text" required value={form.name} onChange={set('name')}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
            />
          </Field>
          <Field label="Description">
            <input type="text" value={form.description} onChange={set('description')}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
            />
          </Field>
          <MoneyFields form={form} set={set} choices={choices} hintFree="Empty = never free" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Icon">
              <input type="text" value={form.icon} onChange={set('icon')}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
            <Field label="Sort order">
              <input type="number" value={form.sort_order} onChange={set('sort_order')}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
              border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', background: 'white', color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
            <button type="submit" style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
              boxShadow: '0 2px 8px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
            }}>Save changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const ACTION_CFG = {
  CREATED:     { Icon: Plus,     color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  UPDATED:     { Icon: Pencil,   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  ACTIVATED:   { Icon: Power,    color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  DEACTIVATED: { Icon: PowerOff, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  DELETED:     { Icon: Trash2,   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
};
const DEFAULT_CFG = { Icon: RefreshCw, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' };

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

function describeActivity(item, options = []) {
  const resolvedName = options.find(o => o.id === item.shipping_option_id)?.name
    ?? item.shipping_option?.name          // from eager-loaded relation
    ?? item.metadata?.name                 // fallback for deleted options
    ?? `Option #${item.shipping_option_id}`;

  switch (item.action) {
    case 'CREATED':
      return (
        <>created shipping option <strong>"{resolvedName}"</strong></>
      );
    case 'UPDATED': {
      const changes = item.metadata?.changes;
      if (changes?.length > 0) {
        return (
          <>
            updated <strong>"{resolvedName}"</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: '0.72rem', color: '#6b7280' }}>
              {changes.map((c, j) => (
                <li key={j}>
                  {c.field}:{' '}
                  <span style={{ color: '#dc2626' }}>{String(c.old ?? '—')}</span>
                  {' → '}
                  <span style={{ color: '#16a34a' }}>{String(c.new ?? '—')}</span>
                </li>
              ))}
            </ul>
          </>
        );
      }
      return <>updated <strong>"{resolvedName}"</strong></>;
    }
    case 'ACTIVATED':
      return <>activated <strong>"{resolvedName}"</strong></>;
    case 'DEACTIVATED':
      return <>deactivated <strong>"{resolvedName}"</strong></>;
    case 'DELETED':
      return <>deleted <strong>"{resolvedName}"</strong></>;
    default:
      return <>{item.action.toLowerCase()} on <strong>"{resolvedName}"</strong></>;
  }
}

function ShippingActivityFeed({ activity, pagination, loading, onLoadMore, options = [] }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, borderRadius: 4, background: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)', width: '60%', marginBottom: 6 }} />
              <div style={{ height: 10, borderRadius: 4, background: 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)', width: '30%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activity.length) {
    return <p style={{ fontSize: '0.82rem', color: '#9ca3af', fontStyle: 'italic' }}>No activity yet.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activity.map((item, idx) => {
        const cfg      = ACTION_CFG[item.action] ?? DEFAULT_CFG;
        const isLast   = idx === activity.length - 1;
        const actorName = item.actor_user_id === null
          ? 'System'
          : item.actor?.name || `User #${item.actor_user_id}`;

        return (
          <div key={item.id} style={{ display: 'flex', gap: 12 }}>
            {/* Timeline col */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: cfg.bg, border: `1px solid ${cfg.color}30`, flexShrink: 0,
              }}>
                <cfg.Icon size={13} color={cfg.color} />
              </div>
              {!isLast && (
                <div style={{ flex: 1, width: 1.5, background: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', minHeight: 16, margin: '4px 0' }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16, minWidth: 0 }}>
              <p style={{ fontSize: '0.78rem', color: '#374151', margin: '0 0 2px', lineHeight: 1.5 }}>
                <strong style={{ color: '#111827' }}>{actorName}</strong>{' '}
                {describeActivity(item, options)}
              </p>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{formatDate(item.created_at)}</p>
            </div>
          </div>
        );
      })}

      {pagination && pagination.current_page < pagination.last_page && (
        <button onClick={onLoadMore} style={{
          marginTop: 12, padding: '6px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
          border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', background: 'white', color: 'var(--color-primary-600)',
          cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'center',
        }}>
          Load more
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShippingSettings() {
  const [options,       setOptions]       = useState([]);
  const [activity,      setActivity]      = useState([]);
  const [activityPag,   setActivityPag]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actLoading,    setActLoading]    = useState(true);
  const [showAdd,       setShowAdd]       = useState(false);
  const [editing,       setEditing]       = useState(null); // ShippingOption object
  const [showLog,       setShowLog]       = useState(true);

  // Detect role from auth (adjust if your auth store exposes role differently)
  const { user: authUser } = useAuthStore();
  const isSuperAdmin = authUser?.role === 'super_admin';

  useEffect(() => { loadData(); loadActivity(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await shippingAPI.getOptions();
      setOptions(data);
    } catch {
      toast.error('Failed to load shipping options');
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async (page = 1) => {
    try {
      setActLoading(page === 1);
      const res = await shippingAPI.getActivity({ per_page: 20, page });
      if (page === 1) {
        setActivity(res.data);
      } else {
        setActivity(prev => [...prev, ...res.data]);
      }
      setActivityPag({ current_page: res.current_page, last_page: res.last_page });
    } catch {
      toast.error('Failed to load activity log');
    } finally {
      setActLoading(false);
    }
  };

  const handleAdd = async (form) => {
    try {
      await shippingAPI.createOption(form);
      setShowAdd(false);
      await Promise.all([loadData(), loadActivity()]);
      toast.success('Shipping option added');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to add shipping option');
    }
  };

  const handleUpdate = async (id, form) => {
    try {
      await shippingAPI.updateOption(id, form);
      setEditing(null);
      await Promise.all([loadData(), loadActivity()]);
      toast.success('Shipping option updated');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update');
    }
  };

  const handleToggle = async (id, current) => {
    try {
      await shippingAPI.toggleStatus(id, !current);
      await Promise.all([loadData(), loadActivity()]);
    } catch {
      toast.error('Failed to toggle status');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this shipping option? This action cannot be undone.')) return;
    try {
      await shippingAPI.deleteOption(id);
      await Promise.all([loadData(), loadActivity()]);
      toast.success('Shipping option deleted');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete');
    }
  };

  const fmtCost = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (loading) return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {[80, 400].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)', marginBottom: 16 }} />
        ))}
      </div>
    </SettingsLayout>
  );

  return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              Shipping Settings
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              Manage delivery methods and costs for checkout
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
            boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)', transition: 'box-shadow 150ms',
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px color-mix(in srgb, var(--color-primary-500) 50%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)'}
          >
            <Plus size={15} /> Add option
          </button>
        </div>

        {/* ── Table ── */}
        <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)', background: 'color-mix(in srgb, var(--color-primary-500) 2%, transparent)' }}>
                  {[
                    { label: 'ID',         w: 60  },
                    { label: 'Name',       w: 180 },
                    { label: 'Slug',       w: 140 },
                    { label: 'Cost', w: 110 },
                    { label: 'Free above', w: 110 },
                    { label: 'Status',     w: 100 },
                    { label: '',           w: 120 },
                  ].map(({ label, w }) => (
                    <th key={label || 'actions'} style={{ padding: '10px 16px', textAlign: 'left', minWidth: w }}>
                      <TH_LABEL>{label}</TH_LABEL>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((opt, i) => (
                  <tr key={opt.id} style={{
                    borderBottom: i === options.length - 1 ? 'none' : '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)',
                    transition: 'background 120ms',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 2%, transparent)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace' }}>
                        #{opt.id}
                      </span>
                    </td>
                    {/* Name */}
                    <td style={{ padding: '12px 16px' }}>
                      <div>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#111827' }}>{opt.name}</span>
                        {opt.description && (
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{opt.description}</p>
                        )}
                      </div>
                    </td>

                    {/* Slug */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace' }}>{opt.slug}</span>
                    </td>

                    {/* Cost */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: opt.cost == 0 ? '#10b981' : '#374151', fontFamily: 'monospace' }}>
                        {opt.cost == 0 ? 'Free' : opt.rate_type === 'percent' ? `${Number(opt.cost)}% of goods` : `${opt.currency?.code ?? ''} ${fmtCost(opt.cost)}`}
                      </span>
                    </td>

                    {/* Free above */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.8rem', color: opt.free_above ? '#374151' : '#d1d5db', fontFamily: 'monospace' }}>
                        {opt.free_above ? `${opt.currency?.code ?? ''} ${fmtCost(opt.free_above)}` : '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => opt.slug !== 'standard_delivery' && handleToggle(opt.id, opt.is_active)}
                        disabled={opt.slug === 'standard_delivery'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                          border: 'none', fontFamily: 'inherit',
                          cursor: opt.slug === 'standard_delivery' ? 'default' : 'pointer',
                          opacity: opt.slug === 'standard_delivery' ? 0.6 : 1,
                          background: opt.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                          color: opt.is_active ? '#065f46' : '#991b1b',
                          transition: 'background 120ms',
                        }}
                      >
                        {opt.is_active ? <Check size={10} /> : <X size={10} />}
                        {opt.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditing(opt)} style={{
                          width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)', color: 'var(--color-primary-500)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 120ms',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)'}
                          title="Edit"
                        >
                          <Edit2 size={12} />
                        </button>

                        {isSuperAdmin && opt.slug !== 'standard_delivery' && (
                          <button onClick={() => handleDelete(opt.id)} style={{
                            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: 'rgba(239,68,68,0.07)', color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 120ms',
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
                            title="Delete (superadmin only)"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Activity log ── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <button onClick={() => setShowLog(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={14} style={{ color: 'var(--color-primary-500)' }} /> Shipping activity log
            </span>
            {showLog ? <ChevronUp size={14} style={{ color: '#9ca3af' }} /> : <ChevronDown size={14} style={{ color: '#9ca3af' }} />}
          </button>

          {showLog && (
            <div style={{ padding: '0 20px 20px', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)', paddingTop: 16 }}>
              <ShippingActivityFeed
                activity={activity}
                pagination={activityPag}
                loading={actLoading}
                onLoadMore={() => loadActivity((activityPag?.current_page || 1) + 1)}
                options={options}
              />
            </div>
          )}
        </div>

        {/* Modals */}
        {showAdd && <AddShippingModal onClose={() => setShowAdd(false)} onSave={handleAdd} />}
        {editing && <EditShippingModal option={editing} onClose={() => setEditing(null)} onSave={handleUpdate} />}
      </div>
    </SettingsLayout>
  );
}
