import React, { useState, useEffect } from 'react';
import SettingsLayout from '../../../components/layout/SettingsLayout';
import customerTiersAPI from '../../../api/customerTiers';
import { useAuthStore } from '../../../store';
import {
  Plus, Edit2, Save, X, Trash2,
  RefreshCw, UserPlus, Pencil, XCircle,
  Power, PowerOff, Star, Users, Crown,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
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

// ── Add Tier Modal ────────────────────────────────────────────────────────────

function AddTierModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    slug: '', name: '', description: '', color: '#9ca3af',
    discount_percentage: '', free_shipping_threshold: '',
    loyalty_points_multiplier: '1', priority_support: false,
    min_orders: '', min_spent: '', sort_order: '0',
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      slug: form.slug.toLowerCase().replace(/\s+/g, '_'),
      free_shipping_threshold: form.free_shipping_threshold === '' ? null : form.free_shipping_threshold,
      min_orders: form.min_orders === '' ? null : form.min_orders,
      min_spent: form.min_spent === '' ? null : form.min_spent,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 540, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Add tier</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name"><input type="text" required value={form.name} onChange={set('name')} placeholder="Gold" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Slug"><input type="text" required value={form.slug} onChange={set('slug')} placeholder="gold" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <Field label="Description"><input type="text" value={form.description} onChange={set('description')} placeholder="VIP customer" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Discount %"><input type="number" step="0.01" required value={form.discount_percentage} onChange={set('discount_percentage')} placeholder="10" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Loyalty multiplier"><input type="number" step="0.01" required value={form.loyalty_points_multiplier} onChange={set('loyalty_points_multiplier')} placeholder="1.5" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Color"><input type="color" value={form.color} onChange={set('color')} style={{ ...inputStyle, padding: 3, height: 34 }} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Free shipping threshold" hint="Leave empty = use default"><input type="number" step="0.01" value={form.free_shipping_threshold} onChange={set('free_shipping_threshold')} placeholder="20000" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Sort order"><input type="number" value={form.sort_order} onChange={set('sort_order')} placeholder="0" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Min orders for auto-upgrade" hint="Leave empty = manual only"><input type="number" value={form.min_orders} onChange={set('min_orders')} placeholder="50" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Min spent (KES)" hint="Leave empty = manual only"><input type="number" step="0.01" value={form.min_spent} onChange={set('min_spent')} placeholder="500000" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.priority_support} onChange={setBool('priority_support')} /> Priority support
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.35)' }}>Add tier</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Tier Modal ───────────────────────────────────────────────────────────

function EditTierModal({ tier, onClose, onSave }) {
  const [form, setForm] = useState({
    name: tier.name || '', description: tier.description || '', color: tier.color || '#9ca3af',
    discount_percentage: tier.discount_percentage ?? '', free_shipping_threshold: tier.free_shipping_threshold ?? '',
    loyalty_points_multiplier: tier.loyalty_points_multiplier ?? '1', priority_support: !!tier.priority_support,
    min_orders: tier.min_orders ?? '', min_spent: tier.min_spent ?? '', sort_order: tier.sort_order ?? 0,
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(tier.id, {
      ...form,
      free_shipping_threshold: form.free_shipping_threshold === '' ? null : form.free_shipping_threshold,
      min_orders: form.min_orders === '' ? null : form.min_orders,
      min_spent: form.min_spent === '' ? null : form.min_spent,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 540, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Edit tier — {tier.name}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name"><input type="text" required value={form.name} onChange={set('name')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Slug (read-only)"><input type="text" value={tier.slug} disabled style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} /></Field>
          </div>
          <Field label="Description"><input type="text" value={form.description} onChange={set('description')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Discount %"><input type="number" step="0.01" required value={form.discount_percentage} onChange={set('discount_percentage')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Loyalty multiplier"><input type="number" step="0.01" required value={form.loyalty_points_multiplier} onChange={set('loyalty_points_multiplier')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Color"><input type="color" value={form.color} onChange={set('color')} style={{ ...inputStyle, padding: 3, height: 34 }} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Free shipping threshold"><input type="number" step="0.01" value={form.free_shipping_threshold} onChange={set('free_shipping_threshold')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Sort order"><input type="number" value={form.sort_order} onChange={set('sort_order')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Min orders"><input type="number" value={form.min_orders} onChange={set('min_orders')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Min spent (KES)"><input type="number" step="0.01" value={form.min_spent} onChange={set('min_spent')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.priority_support} onChange={setBool('priority_support')} /> Priority support
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.35)' }}>Save changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Type Modal ────────────────────────────────────────────────────────────

function AddTypeModal({ onClose, onSave }) {
  const [form, setForm] = useState({ slug: '', name: '', description: '', discount_percentage: '', sort_order: '0' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, slug: form.slug.toLowerCase().replace(/\s+/g, '_') });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Add customer type</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name"><input type="text" required value={form.name} onChange={set('name')} placeholder="Wholesale" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Slug"><input type="text" required value={form.slug} onChange={set('slug')} placeholder="wholesale" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <Field label="Description"><input type="text" value={form.description} onChange={set('description')} placeholder="Wholesale buyer" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Discount %"><input type="number" step="0.01" required value={form.discount_percentage} onChange={set('discount_percentage')} placeholder="15" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Sort order"><input type="number" value={form.sort_order} onChange={set('sort_order')} placeholder="0" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.35)' }}>Add type</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Type Modal ───────────────────────────────────────────────────────────

function EditTypeModal({ type, onClose, onSave }) {
  const [form, setForm] = useState({
    name: type.name || '', description: type.description || '',
    discount_percentage: type.discount_percentage ?? '', sort_order: type.sort_order ?? 0,
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(type.id, form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Edit type — {type.name}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name"><input type="text" required value={form.name} onChange={set('name')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Slug (read-only)"><input type="text" value={type.slug} disabled style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} /></Field>
          </div>
          <Field label="Description"><input type="text" value={form.description} onChange={set('description')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Discount %"><input type="number" step="0.01" required value={form.discount_percentage} onChange={set('discount_percentage')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
            <Field label="Sort order"><input type="number" value={form.sort_order} onChange={set('sort_order')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.35)' }}>Save changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Activity Timeline ─────────────────────────────────────────────────────────

const ACTION_META = {
  CREATED:     { icon: <UserPlus size={12} />,  bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
  UPDATED:     { icon: <Pencil size={12} />,    bg: 'rgba(99,102,241,0.12)', color: '#4f46e5' },
  ACTIVATED:   { icon: <Power size={12} />,     bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
  DEACTIVATED: { icon: <PowerOff size={12} />,  bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
  DELETED:     { icon: <XCircle size={12} />,   bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
};

function ActivityTimeline({ items, pag, onLoadMore, loading }) {
  if (loading) return <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 20px' }}>Loading activity...</p>;
  if (!items.length) return <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 20px' }}>No activity yet</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((a, i) => {
        const meta = ACTION_META[a.action] ?? ACTION_META.UPDATED;
        const isLast = i === items.length - 1;
        const entityLabel = a.entity_type === 'tier' ? 'tier' : 'type';
        return (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 20px', borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.06)' }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, flexShrink: 0, marginTop: 1 }}>
              {meta.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.78rem', color: '#374151', margin: 0 }}>
                <strong>{a.actor?.name ?? 'System'}</strong>{' '}
                <span style={{ color: meta.color, fontWeight: 600, textTransform: 'lowercase' }}>{a.action}</span>{' '}
                {entityLabel}
                {a.metadata?.name && <> <strong>{a.metadata.name}</strong></>}
                {a.metadata?.slug && <> <span style={{ color: '#9ca3af' }}>({a.metadata.slug})</span></>}
              </p>
              {a.metadata?.changes && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: '0.72rem', color: '#6b7280' }}>
                  {a.metadata.changes.map((c, j) => (
                    <li key={j}>{c.field}: <span style={{ color: '#dc2626' }}>{String(c.old ?? '—')}</span> → <span style={{ color: '#16a34a' }}>{String(c.new ?? '—')}</span></li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '3px 0 0' }}>
                {new Date(a.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
      {pag && pag.current_page < pag.last_page && (
        <button onClick={() => onLoadMore(pag.current_page + 1)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px', fontSize: '0.75rem', fontWeight: 600, color: '#7c3aed',
          background: 'rgba(168,85,247,0.04)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <RefreshCw size={12} /> Load more
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

const PROTECTED_TIER_SLUG = 'bronze';
const PROTECTED_TYPE_SLUG = 'individual';

export default function CustomerTierSettings() {
  const [tiers,         setTiers]         = useState([]);
  const [types,         setTypes]         = useState([]);
  const [activity,      setActivity]      = useState([]);
  const [activityPag,   setActivityPag]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actLoading,    setActLoading]    = useState(true);

  const [showAddTier,   setShowAddTier]   = useState(false);
  const [editingTier,   setEditingTier]   = useState(null);
  const [showAddType,   setShowAddType]   = useState(false);
  const [editingType,   setEditingType]   = useState(null);
  const [showLog,       setShowLog]       = useState(true);

  // Tab state: 'tiers' or 'types'
  const [tab, setTab] = useState('tiers');

  const { user: authUser } = useAuthStore();
  const isSuperAdmin = authUser?.role === 'super_admin';

  useEffect(() => { loadAll(); loadActivity(); }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [t, tp] = await Promise.all([customerTiersAPI.getTiers(), customerTiersAPI.getTypes()]);
      setTiers(t);
      setTypes(tp);
    } catch {
      toast.error('Failed to load tier/type data');
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async (page = 1) => {
    try {
      setActLoading(page === 1);
      const res = await customerTiersAPI.getActivity({ per_page: 20, page });
      if (page === 1) setActivity(res.data);
      else setActivity(prev => [...prev, ...res.data]);
      setActivityPag({ current_page: res.current_page, last_page: res.last_page });
    } catch {
      toast.error('Failed to load activity');
    } finally {
      setActLoading(false);
    }
  };

  // ── Tier handlers ─────────────────────────────────────────────────────────

  const handleAddTier = async (form) => {
    try {
      await customerTiersAPI.createTier(form);
      setShowAddTier(false);
      await Promise.all([loadAll(), loadActivity()]);
      toast.success('Tier added');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to add tier'); }
  };

  const handleUpdateTier = async (id, form) => {
    try {
      await customerTiersAPI.updateTier(id, form);
      setEditingTier(null);
      await Promise.all([loadAll(), loadActivity()]);
      toast.success('Tier updated');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to update'); }
  };

  const handleToggleTier = async (id, current) => {
    try {
      await customerTiersAPI.toggleTierStatus(id, !current);
      await Promise.all([loadAll(), loadActivity()]);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to toggle'); }
  };

  const handleDeleteTier = async (id) => {
    if (!confirm('Delete this tier? Customers assigned to it will keep the slug but it won\'t be available for new assignments.')) return;
    try {
      await customerTiersAPI.deleteTier(id);
      await Promise.all([loadAll(), loadActivity()]);
      toast.success('Tier deleted');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to delete'); }
  };

  // ── Type handlers ─────────────────────────────────────────────────────────

  const handleAddType = async (form) => {
    try {
      await customerTiersAPI.createType(form);
      setShowAddType(false);
      await Promise.all([loadAll(), loadActivity()]);
      toast.success('Customer type added');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to add type'); }
  };

  const handleUpdateType = async (id, form) => {
    try {
      await customerTiersAPI.updateType(id, form);
      setEditingType(null);
      await Promise.all([loadAll(), loadActivity()]);
      toast.success('Customer type updated');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to update'); }
  };

  const handleToggleType = async (id, current) => {
    try {
      await customerTiersAPI.toggleTypeStatus(id, !current);
      await Promise.all([loadAll(), loadActivity()]);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to toggle'); }
  };

  const handleDeleteType = async (id) => {
    if (!confirm('Delete this customer type? This action cannot be undone.')) return;
    try {
      await customerTiersAPI.deleteType(id);
      await Promise.all([loadAll(), loadActivity()]);
      toast.success('Customer type deleted');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to delete'); }
  };

  const fmtNum = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {[80, 400].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 12, background: 'rgba(168,85,247,0.07)', marginBottom: 16 }} />
        ))}
      </div>
    </SettingsLayout>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              Customer Tiers & Types
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              Manage discount tiers, loyalty multipliers, and customer type classifications
            </p>
          </div>
          <button
            onClick={() => tab === 'tiers' ? setShowAddTier(true) : setShowAddType(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)', transition: 'box-shadow 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
          >
            <Plus size={15} /> {tab === 'tiers' ? 'Add tier' : 'Add type'}
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(168,85,247,0.05)', borderRadius: 10, padding: 3 }}>
          {[
            { key: 'tiers', label: 'Tiers', icon: <Crown size={13} /> },
            { key: 'types', label: 'Customer Types', icon: <Users size={13} /> },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.key ? 'white' : 'transparent',
              color: tab === t.key ? '#7c3aed' : '#9ca3af',
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 150ms',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Tiers Table ── */}
        {tab === 'tiers' && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(168,85,247,0.04)' }}>
                    {['Tier', 'Discount', 'Loyalty ×', 'Shipping', 'Upgrade at', 'Status', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 16px', textAlign: i >= 5 ? 'center' : 'left' }}>
                        <TH_LABEL right={i >= 5}>{h}</TH_LABEL>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t, i) => {
                    const isProtected = t.slug === PROTECTED_TIER_SLUG;
                    return (
                      <tr key={t.id} style={{ borderTop: i ? '1px solid rgba(168,85,247,0.07)' : 'none' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                            <div>
                              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', margin: 0 }}>{t.name}</p>
                              <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{t.slug}{t.description ? ` — ${t.description}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', fontWeight: 600, color: '#7c3aed' }}>{t.discount_percentage}%</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#374151' }}>×{t.loyalty_points_multiplier}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#6b7280' }}>
                          {t.free_shipping_threshold === null || t.free_shipping_threshold === '0.00' ? 'Always free' : `Free above ${fmtNum(t.free_shipping_threshold)}`}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.72rem', color: '#6b7280' }}>
                          {t.min_orders || t.min_spent
                            ? `${t.min_orders ? t.min_orders + ' orders' : ''}${t.min_orders && t.min_spent ? ' or ' : ''}${t.min_spent ? fmtNum(t.min_spent) + ' KES' : ''}`
                            : 'Manual only'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => !isProtected && handleToggleTier(t.id, t.is_active)}
                            disabled={isProtected}
                            title={isProtected ? 'Default tier — always active' : (t.is_active ? 'Deactivate' : 'Activate')}
                            style={{
                              background: t.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color: t.is_active ? '#16a34a' : '#dc2626',
                              border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700,
                              cursor: isProtected ? 'not-allowed' : 'pointer', opacity: isProtected ? 0.5 : 1,
                            }}
                          >
                            {t.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => setEditingTier(t)} style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex' }}>
                              <Edit2 size={13} />
                            </button>
                            {isSuperAdmin && !isProtected && (
                              <button onClick={() => handleDeleteTier(t.id)} style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex' }}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Types Table ── */}
        {tab === 'types' && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(168,85,247,0.04)' }}>
                    {['Type', 'Discount', 'Description', 'Status', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 16px', textAlign: i >= 3 ? 'center' : 'left' }}>
                        <TH_LABEL right={i >= 3}>{h}</TH_LABEL>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {types.map((t, i) => {
                    const isProtected = t.slug === PROTECTED_TYPE_SLUG;
                    return (
                      <tr key={t.id} style={{ borderTop: i ? '1px solid rgba(168,85,247,0.07)' : 'none' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', margin: 0 }}>{t.name}</p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{t.slug}</p>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', fontWeight: 600, color: '#7c3aed' }}>{t.discount_percentage}%</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#6b7280' }}>{t.description || '—'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => !isProtected && handleToggleType(t.id, t.is_active)}
                            disabled={isProtected}
                            title={isProtected ? 'Default type — always active' : (t.is_active ? 'Deactivate' : 'Activate')}
                            style={{
                              background: t.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color: t.is_active ? '#16a34a' : '#dc2626',
                              border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700,
                              cursor: isProtected ? 'not-allowed' : 'pointer', opacity: isProtected ? 0.5 : 1,
                            }}
                          >
                            {t.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => setEditingType(t)} style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex' }}>
                              <Edit2 size={13} />
                            </button>
                            {isSuperAdmin && !isProtected && (
                              <button onClick={() => handleDeleteType(t.id)} style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex' }}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Activity log ── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <button onClick={() => setShowLog(!showLog)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', background: 'rgba(168,85,247,0.04)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>Activity Log</span>
            {showLog ? <ChevronUp size={14} color="#7c3aed" /> : <ChevronDown size={14} color="#7c3aed" />}
          </button>
          {showLog && <ActivityTimeline items={activity} pag={activityPag} onLoadMore={loadActivity} loading={actLoading} />}
        </div>
      </div>

      {/* ── Modals ── */}
      {showAddTier && <AddTierModal onClose={() => setShowAddTier(false)} onSave={handleAddTier} />}
      {editingTier && <EditTierModal tier={editingTier} onClose={() => setEditingTier(null)} onSave={handleUpdateTier} />}
      {showAddType && <AddTypeModal onClose={() => setShowAddType(false)} onSave={handleAddType} />}
      {editingType && <EditTypeModal type={editingType} onClose={() => setEditingType(null)} onSave={handleUpdateType} />}
    </SettingsLayout>
  );
}
