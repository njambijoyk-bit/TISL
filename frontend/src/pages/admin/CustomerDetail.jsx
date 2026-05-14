import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, Camera, Edit2, Save, X, Plus, Trash2, Check,
  MapPin, ShieldCheck, ShieldOff, AlertTriangle, Ban,
  Star, CreditCard, Coins, TrendingUp, Package, Calendar,
  Phone, Mail, Globe, MessageCircle, Building2, Tag, UserCheck,
  User, Briefcase, FileText, Clock, Hash, ChevronDown, ChevronRight,
  Home, Warehouse, MoreHorizontal, Settings, Loader2,
} from 'lucide-react';
import customersAPI from '../../api/customers';
import customerTiersAPI from '../../api/customerTiers';
import ordersAPI from '../../api/orders';
import AssignModal from '../../components/quotes/AssignModal';

// ── Style constants ───────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputDisabledStyle = {
  ...inputStyle,
  background: 'rgba(168,85,247,0.02)',
  borderColor: 'rgba(168,85,247,0.08)',
  color: '#9ca3af', cursor: 'not-allowed',
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
  padding: 20,
};

const sectionHeader = {
  fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed',
  display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px',
};

// ── Semantic colour maps (as inline style objects) ────────────────────────────

const STATUS_STYLES = {
  active:      { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981',  ring: 'rgba(16,185,129,0.3)'  },
  inactive:    { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af',  ring: 'rgba(107,114,128,0.25)' },
  suspended:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b',  ring: 'rgba(245,158,11,0.3)'  },
  blacklisted: { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444',  ring: 'rgba(239,68,68,0.3)'   },
};

const TIER_STYLES_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.3)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.25)' },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.3)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.3)'  },
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) {
    return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  }
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}

const ADDR_TYPE_ICONS = {
  home:      <Home       size={13} />,
  office:    <Building2  size={13} />,
  warehouse: <Warehouse  size={13} />,
  billing:   <CreditCard size={13} />,
  shipping:  <Package    size={13} />,
  other:     <MapPin     size={13} />,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Shared sub-components ─────────────────────────────────────────────────────

function Badge({ children, bg, color, ring }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`,
    }}>
      {children}
    </span>
  );
}

function StatBlock({ icon, label, value, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
      borderRadius: 10, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)',
    }}>
      <div style={{ marginTop: 2, color: '#c4b5fd', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
        {sub && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '1px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', disabled, placeholder, style: extra = {} }) {
  return (
    <input
      type={type} value={value ?? ''} onChange={onChange}
      disabled={disabled} placeholder={placeholder}
      style={{ ...(disabled ? inputDisabledStyle : inputStyle), ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    />
  );
}

function Select({ value, onChange, disabled, children, style: extra = {} }) {
  return (
    <select
      value={value ?? ''} onChange={onChange} disabled={disabled}
      style={{ ...(disabled ? inputDisabledStyle : inputStyle), ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    >
      {children}
    </select>
  );
}

// ── QuickAddPanel ─────────────────────────────────────────────────────────────

function QuickAddPanel({ type, onSubmit, onClose }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div style={{
      position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 272, zIndex: 30,
      background: 'white', borderRadius: 12, padding: 16,
      border: '1.5px solid rgba(168,85,247,0.22)',
      boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed', margin: 0 }}>
          Add {type === 'credit' ? 'store credit' : 'loyalty points'}
        </p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}
          onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder={type === 'credit' ? 'Amount (KES)' : 'Points'}
          style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
        />
        <input
          type="text" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Reason (optional)"
          style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
        />
        <button onClick={() => { if (!amount || isNaN(amount) || Number(amount) <= 0) return; onSubmit(Number(amount), reason); }}
          style={{
            width: '100%', padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}
        >
          Add {type === 'credit' ? 'credit' : 'points'}
        </button>
      </div>
    </div>
  );
}

// ── StatusPanel ───────────────────────────────────────────────────────────────

function StatusPanel({ currentStatus, onStatusChange, onClose }) {
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');

  const actions = [
    { status: 'active',      label: 'Activate',   icon: <ShieldCheck size={14} />,   color: '#10b981' },
    { status: 'suspended',   label: 'Suspend',     icon: <AlertTriangle size={14} />, color: '#f59e0b' },
    { status: 'inactive',    label: 'Deactivate',  icon: <ShieldOff size={14} />,     color: '#6b7280' },
    { status: 'blacklisted', label: 'Blacklist',   icon: <Ban size={14} />,           color: '#ef4444' },
  ].filter(a => a.status !== currentStatus);

  return (
    <div style={{
      position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 252, zIndex: 30,
      background: 'white', borderRadius: 12, padding: 16,
      border: '1.5px solid rgba(168,85,247,0.22)',
      boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed', margin: 0 }}>Change status</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!target ? (
          actions.map(a => (
            <button key={a.status} onClick={() => setTarget(a.status)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer', color: a.color,
              fontFamily: 'inherit', transition: 'background 120ms',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {a.icon} {a.label}
            </button>
          ))
        ) : (
          <>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 6px' }}>
              Reason for setting to <strong style={{ color: '#7c3aed', textTransform: 'capitalize' }}>{target}</strong>:
            </p>
            <textarea
              rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Reason (optional)"
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={inputFocus} onBlur={inputBlur}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setTarget('')} style={{
                flex: 1, padding: '7px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                background: 'transparent', border: '1px solid rgba(168,85,247,0.22)',
                color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Back
              </button>
              <button onClick={() => onStatusChange(target, reason)} style={{
                flex: 1, padding: '7px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              }}>
                Confirm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── AddressForm ───────────────────────────────────────────────────────────────

const EMPTY_ADDR = {
  address_type: 'home', label: '', contact_name: '', contact_phone: '',
  address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '',
  country: 'Kenya', landmark: '', delivery_instructions: '',
  is_default_shipping: false, is_default_billing: false,
};

function AddressForm({ initial = EMPTY_ADDR, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const tog = (k) => () => setForm(f => ({ ...f, [k]: !f[k] }));

  return (
    <div style={{
      borderRadius: 12, padding: 16,
      border: '1.5px dashed rgba(168,85,247,0.3)',
      background: 'rgba(168,85,247,0.02)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Address type">
          <Select value={form.address_type} onChange={set('address_type')}>
            {['home','office','warehouse','billing','shipping','other'].map(t => (
              <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Label">
          <Input value={form.label} onChange={set('label')} placeholder="e.g. Home, Work" />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Contact name">
          <Input value={form.contact_name} onChange={set('contact_name')} />
        </Field>
        <Field label="Contact phone">
          <Input value={form.contact_phone} onChange={set('contact_phone')} />
        </Field>
      </div>
      <Field label="Address line 1 *">
        <Input value={form.address_line_1} onChange={set('address_line_1')} />
      </Field>
      <Field label="Address line 2">
        <Input value={form.address_line_2} onChange={set('address_line_2')} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="City *"><Input value={form.city} onChange={set('city')} /></Field>
        <Field label="State / County"><Input value={form.state} onChange={set('state')} /></Field>
        <Field label="Postal code"><Input value={form.postal_code} onChange={set('postal_code')} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Country *"><Input value={form.country} onChange={set('country')} /></Field>
        <Field label="Landmark"><Input value={form.landmark} onChange={set('landmark')} /></Field>
      </div>
      <Field label="Delivery instructions">
        <textarea
          rows={2} value={form.delivery_instructions ?? ''} onChange={set('delivery_instructions')}
          style={{ ...inputStyle, resize: 'none' }}
          onFocus={inputFocus} onBlur={inputBlur}
        />
      </Field>

      {/* Checkboxes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {[['is_default_shipping', 'Default shipping'], ['is_default_billing', 'Default billing']].map(([key, lbl]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', userSelect: 'none' }}>
            <span
              onClick={tog(key)}
              style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: form[key] ? '2px solid #a855f7' : '2px solid rgba(168,85,247,0.3)',
                background: form[key] ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
                transition: 'all 150ms', cursor: 'pointer',
              }}
            >
              {form[key] && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </span>
            {lbl}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button onClick={onCancel} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
          background: 'transparent', color: '#9ca3af',
          border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Cancel
        </button>
        <button onClick={() => onSave(form)} style={{
          padding: '7px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
          boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
        }}>
          Save address
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer,    setCustomer]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState('overview');
  const [editing,     setEditing]     = useState(false);
  const [form,        setForm]        = useState({});
  const [saving,      setSaving]      = useState(false);
  const [toastMsg,    setToastMsg]    = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStatus,  setShowStatus]  = useState(false);
  const [showCredit,  setShowCredit]  = useState(false);
  const [showPoints,  setShowPoints]  = useState(false);
  const [tagInput,    setTagInput]    = useState('');
  const [addresses,   setAddresses]   = useState([]);
  const [addrsLoading,setAddrsLoading]= useState(false);
  const [addingAddr,  setAddingAddr]  = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);

  const [orders,       setOrders]       = useState([]);
  const [ordersLoading,setOrdersLoading]= useState(false);
  const [ordersMeta,   setOrdersMeta]   = useState({ current_page: 1, last_page: 1, total: 0 });
  const [ordersPage,   setOrdersPage]   = useState(1);
  const [orderStats, setOrderStats] = useState(null);

  const imgInputRef = useRef(null);

  const notify = (msg, type = 'success') => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const buildForm = (c) => ({
    first_name:                   c.first_name                   ?? '',
    last_name:                    c.last_name                    ?? '',
    phone:                        c.phone                        ?? '',
    alternate_phone:              c.alternate_phone              ?? '',
    birthday:                     c.birthday ? c.birthday.substring(0, 10) : '',
    whatsapp:                     c.whatsapp                     ?? '',
    website:                      c.website                      ?? '',
    company_name:                 c.company_name                 ?? '',
    company_registration_number:  c.company_registration_number  ?? '',
    tax_id:                       c.tax_id                       ?? '',
    customer_type:                c.customer_type                ?? 'individual',
    tier:                         c.tier                         ?? 'bronze',
    discount_percentage:          c.discount_percentage          ?? 0,
    has_credit_account:           c.has_credit_account           ?? false,
    credit_limit:                 c.credit_limit                 ?? '',
    assigned_sales_rep:           c.assigned_sales_rep           ?? '',
    notes:                        c.notes                        ?? '',
  });

  
  // Update the helpers at the top
  const fmt = (n, currency = 'KES') => {
    const num = Number(n ?? 0);
    if (currency === 'KES') {
      return num.toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
    }
    return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Add new state for stats loading
  const [statsLoading, setStatsLoading] = useState(false);

  const [customerUser, setCustomerUser] = useState(null);

  const [tierOptions, setTierOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    try {
      const data = await customersAPI.getCustomer(id);
      setCustomer(data.customer);
      setCustomerUser(data.customer?.user ?? null);
      setForm(buildForm(data.customer));
      loadOrderStats();
    } catch {
      navigate('/admin/customers');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const loadOrderStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await ordersAPI.getCustomerOrderStatistics(id);
      setOrderStats({
        total_orders:        data.total_orders,
        total_spent:         data.total_spent,
        average_order_value: data.average_order_value,
        first_order_date:    data.first_order_date,
        last_order_date:     data.last_order_date,
      });
    } catch (e) {
      console.error('Failed to load order stats:', e);
    } finally {
      setStatsLoading(false);
    }
  }, [id]);

  // Update the useEffect to remove the stats from initial load
  useEffect(() => { 
    loadCustomer(); 
  }, [loadCustomer]);

  useEffect(() => { loadCustomer(); }, [loadCustomer]);

  useEffect(() => {
    customerTiersAPI.getActiveTiers().then(setTierOptions).catch(() => {});
    customerTiersAPI.getActiveTypes().then(setTypeOptions).catch(() => {});
  }, []);
  useEffect(() => {
    if (tab !== 'addresses') return;
    setAddrsLoading(true);
    customersAPI.getAddresses(id)
      .then(data => setAddresses(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => {})
      .finally(() => setAddrsLoading(false));
  }, [tab, id]);

  useEffect(() => {
  if (tab !== 'orders') return;
    setOrdersLoading(true);
    ordersAPI.getAdminCustomerOrders(id, { page: ordersPage, per_page: 15 })
      .then(data => {
        setOrders(Array.isArray(data) ? data : data.data ?? []);
        setOrdersMeta({
          current_page: data.current_page ?? 1,
          last_page:    data.last_page    ?? 1,
          total:        data.total        ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => setOrdersLoading(false));
  }, [tab, id, ordersPage]);

  const setField = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await customersAPI.updateCustomer(id, form);
      setCustomer(data.customer); setEditing(false); notify('Customer updated');
    } catch (e) { notify(e?.response?.data?.message ?? 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleAssignRep = async (adminId) => {
    try {
      const data = await customersAPI.assignSalesRep(id, adminId);
      setCustomer(data.customer);
      setForm(buildForm(data.customer));
      setShowAssignModal(false);
      notify('Sales rep assigned');
    } catch (e) {
      notify(e?.response?.data?.message ?? 'Failed to assign sales rep', 'error');
      throw e; // re-throw so the modal shows the error
    }
  };

  const cancelEdit = () => { setForm(buildForm(customer)); setEditing(false); };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await customersAPI.uploadProfileImage(id, file);
      setCustomer(c => ({ ...c, profile_image_url: data.profile_image_url ?? c.profile_image_url }));
      notify('Profile image updated');
    } catch { notify('Image upload failed', 'error'); }
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim(); if (!tag) return;
    try {
      const data = await customersAPI.addTag(id, tag);
      setCustomer(data.customer); setTagInput(''); notify(`Tag "${tag}" added`);
    } catch { notify('Failed to add tag', 'error'); }
  };

  const handleRemoveTag = async (tag) => {
    try { const data = await customersAPI.removeTag(id, tag); setCustomer(data.customer); }
    catch { notify('Failed to remove tag', 'error'); }
  };

  const handleStatusChange = async (status, reason) => {
    try {
      const data = await customersAPI.updateStatus(id, status, reason);
      setCustomer(data.customer); setShowStatus(false); notify(`Status set to ${status}`);
    } catch { notify('Failed to update status', 'error'); }
  };

  const handleAddCredit = async (amount, reason) => {
    try {
      const data = await customersAPI.addCredit(id, amount, reason);
      setCustomer(c => ({ ...c, store_credit: data.new_balance })); setShowCredit(false);
      notify(`${fmt(amount)} credit added`);
    } catch { notify('Failed to add credit', 'error'); }
  };

  const handleAddPoints = async (points, reason) => {
    try {
      const data = await customersAPI.addLoyaltyPoints(id, points, reason);
      setCustomer(c => ({ ...c, loyalty_points: data.new_balance })); setShowPoints(false);
      notify(`${points} points added`);
    } catch { notify('Failed to add points', 'error'); }
  };

  const handleSaveAddress = async (addrForm) => {
    try {
      if (editingAddr) {
        const data = await customersAPI.updateAddress(id, editingAddr, addrForm);
        setAddresses(prev => prev.map(a => a.id === editingAddr ? (data.address ?? data) : a));
        setEditingAddr(null); notify('Address updated');
      } else {
        const data = await customersAPI.createAddress(id, addrForm);
        setAddresses(prev => [...prev, data.address ?? data]);
        setAddingAddr(false); notify('Address added');
      }
    } catch { notify('Failed to save address', 'error'); }
  };

  const handleDeleteAddress = async (addrId) => {
    if (!window.confirm('Delete this address?')) return;
    try {
      await customersAPI.deleteAddress(id, addrId);
      setAddresses(prev => prev.filter(a => a.id !== addrId)); notify('Address deleted');
    } catch { notify('Failed to delete address', 'error'); }
  };

  const handleSetDefault = async (addrId, type) => {
    try {
      if (type === 'shipping') await customersAPI.setDefaultShipping(id, addrId);
      else                     await customersAPI.setDefaultBilling(id, addrId);
      setAddresses(prev => prev.map(a => ({
        ...a,
        is_default_shipping: type === 'shipping' ? a.id === addrId : a.is_default_shipping,
        is_default_billing:  type === 'billing'  ? a.id === addrId : a.is_default_billing,
      })));
      notify(`Default ${type} address updated`);
    } catch { notify('Failed to update default', 'error'); }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid rgba(168,85,247,0.2)',
        borderTopColor: '#a855f7',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );

  if (!customer) return null;

  const st = STATUS_STYLES[customer.status] ?? STATUS_STYLES.inactive;
  const tr = tierStyle(editing ? form.tier : customer.tier, tierOptions);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
          background: toastMsg.type === 'error'
            ? 'linear-gradient(135deg,#ef4444,#dc2626)'
            : 'linear-gradient(135deg,#a855f7,#7c3aed)',
          color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          {toastMsg.type === 'error' ? <X size={14} /> : <Check size={14} />}
          {toastMsg.msg}
        </div>
      )}

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Top bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={() => navigate('/admin/customers')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'color 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          >
            <ChevronLeft size={16} /> Customers
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editing ? (
              <>
                <button onClick={cancelEdit} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                  background: 'transparent', color: '#9ca3af',
                  border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 150ms, color 150ms',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  <X size={14} /> Discard
                </button>
                <button onClick={handleSave} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                  boxShadow: '0 2px 10px rgba(168,85,247,0.3)', opacity: saving ? 0.7 : 1,
                  transition: 'box-shadow 150ms',
                }}
                  onMouseEnter={e => { if (!saving) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
                  <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                background: 'transparent', color: '#9ca3af',
                border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'border-color 150ms, color 150ms',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
                <Edit2 size={14} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* ── Profile header card ── */}
        <div style={{ ...card, borderRadius: 16, marginBottom: 20, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>

            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={customer.profile_image_url} alt={customer.full_name}
                style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', background: 'rgba(168,85,247,0.08)', display: 'block' }}
              />
              <button
                onClick={() => imgInputRef.current?.click()}
                style={{
                  position: 'absolute', bottom: -4, right: -4, width: 26, height: 26,
                  borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid rgba(168,85,247,0.2)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  cursor: 'pointer', transition: 'border-color 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#a855f7'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}
              >
                <Camera size={11} style={{ color: '#a855f7' }} />
              </button>
              <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
            </div>

            {/* Name & meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{customer.full_name}</h1>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace', margin: '0 0 4px' }}>{customer.customer_number}</p>
                  {customer.company_name && (
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
                      <Building2 size={12} style={{ color: '#c4b5fd' }} /> {customer.company_name}
                    </p>
                  )}
                </div>

                {/* Badges row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge bg={st.bg} color={st.color} ring={st.ring}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                    {customer.status}
                  </Badge>
                  <Badge bg={tr.bg} color={tr.color} ring={tr.ring}>
                    <Star size={9} /> {customer.tier}
                  </Badge>
                  <Badge bg="rgba(168,85,247,0.07)" color="#7c3aed" ring="rgba(168,85,247,0.2)">
                    {customer.customer_type}
                  </Badge>

                  {/* Status change trigger */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => { setShowStatus(v => !v); setShowCredit(false); setShowPoints(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 700,
                        background: 'transparent', color: '#9ca3af',
                        border: '1px solid rgba(168,85,247,0.18)', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'border-color 150ms, color 150ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.color = '#a855f7'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.color = '#9ca3af'; }}
                    >
                      <Settings size={11} /> Status
                    </button>
                    {showStatus && (
                      <StatusPanel currentStatus={customer.status} onStatusChange={handleStatusChange} onClose={() => setShowStatus(false)} />
                    )}
                  </div>
                </div>
              </div>

              {/* Quick contact */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <a href={`mailto:${customer.email}`} style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem',
                  color: '#9ca3af', textDecoration: 'none', transition: 'color 150ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                  onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
                  <Mail size={12} style={{ color: '#c4b5fd' }} /> {customer.email}
                </a>
                {customer.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af' }}>
                    <Phone size={12} style={{ color: '#c4b5fd' }} /> {customer.phone}
                  </span>
                )}
                {customer.whatsapp && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af' }}>
                    <MessageCircle size={12} style={{ color: '#c4b5fd' }} /> {customer.whatsapp}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, borderBottom: '2px solid rgba(168,85,247,0.1)' }}>
          {['overview', 'addresses', 'orders'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', fontSize: '0.82rem', fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#a855f7' : '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2px solid ${tab === t ? '#a855f7' : 'transparent'}`,
              marginBottom: -2, textTransform: 'capitalize', transition: 'color 150ms',
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* ══ TAB: OVERVIEW ══════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}
            className="lg-grid-3col"> {/* you can add a CSS class for the responsive grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

              {/* ── Left column ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Personal info */}
                <div style={card}>
                  <p style={sectionHeader}><User size={14} style={{ color: '#c4b5fd' }} /> Personal information</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="First name"><Input value={form.first_name} onChange={setField('first_name')} disabled={!editing} /></Field>
                    <Field label="Last name"><Input value={form.last_name} onChange={setField('last_name')} disabled={!editing} /></Field>
                    <Field label="Email"><Input value={customer.email} disabled /></Field>
                    <Field label="Phone"><Input value={form.phone} onChange={setField('phone')} disabled={!editing} /></Field>
                    <Field label="Alternate phone"><Input value={form.alternate_phone} onChange={setField('alternate_phone')} disabled={!editing} /></Field>
                    <Field label="Date of birth"><Input type="date" value={form.birthday} onChange={setField('birthday')} disabled={!editing} /></Field>
                    <Field label="WhatsApp"><Input value={form.whatsapp} onChange={setField('whatsapp')} disabled={!editing} placeholder="+254…" /></Field>
                    <Field label="Website"><Input value={form.website} onChange={setField('website')} disabled={!editing} placeholder="https://…" /></Field>
                  </div>
                </div>

                {/* Business info */}
                <div style={card}>
                  <p style={sectionHeader}><Building2 size={14} style={{ color: '#c4b5fd' }} /> Business information</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Customer type">
                      <Select value={form.customer_type} onChange={setField('customer_type')} disabled={!editing}>
                        {(typeOptions.length > 0 ? typeOptions : [
                          { slug: 'individual', name: 'Individual' },
                          { slug: 'business', name: 'Business' },
                          { slug: 'wholesale', name: 'Wholesale' },
                          { slug: 'contractor', name: 'Contractor' },
                        ]).map(t => (
                          <option key={t.slug} value={t.slug}>{t.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Company name"><Input value={form.company_name} onChange={setField('company_name')} disabled={!editing} /></Field>
                    <Field label="Company registration no."><Input value={form.company_registration_number} onChange={setField('company_registration_number')} disabled={!editing} /></Field>
                    <Field label="Tax ID / KRA PIN"><Input value={form.tax_id} onChange={setField('tax_id')} disabled={!editing} /></Field>
                  </div>
                </div>

                {/* Account settings */}
                <div style={card}>
                  <p style={sectionHeader}><Settings size={14} style={{ color: '#c4b5fd' }} /> Account settings</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                    <Field label="Tier (auto-calculated)">
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px',
                        borderRadius: 8, background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.08)',
                      }}>
                        <Badge bg={tr.bg} color={tr.color} ring={tr.ring}>{customer.tier}</Badge>
                        <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>based on orders & spend</span>
                      </div>
                    </Field>
                    {/* Tier */}
                    <Field label="Tier">
                      {editing ? (
                        <Select value={form.tier} onChange={setField('tier')}>
                          {(tierOptions.length > 0 ? tierOptions : [
                            { slug: 'bronze', name: 'Bronze' },
                            { slug: 'silver', name: 'Silver' },
                            { slug: 'gold', name: 'Gold' },
                            { slug: 'platinum', name: 'Platinum' },
                          ]).map(t => (
                            <option key={t.slug} value={t.slug}>{t.name}</option>
                          ))}
                        </Select>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px',
                          borderRadius: 8, background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.08)',
                        }}>
                          <Badge bg={tr.bg} color={tr.color} ring={tr.ring}>{customer.tier}</Badge>
                          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>manual override</span>
                        </div>
                      )}
                    </Field>

                    <Field label="Discount %">
                      <Input type="number" min="0" max="100" value={form.discount_percentage} onChange={setField('discount_percentage')} disabled={!editing} />
                    </Field>

                    {/* Credit account toggle */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 10,
                        background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.1)',
                        cursor: editing ? 'pointer' : 'default',
                      }}
                        onClick={() => editing && setForm(f => ({ ...f, has_credit_account: !f.has_credit_account }))}
                      >
                        <div>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 2px' }}>Credit account</p>
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>Allow this customer to purchase on credit</p>
                        </div>
                        <div style={{
                          width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
                          cursor: editing ? 'pointer' : 'not-allowed', opacity: editing ? 1 : 0.6,
                          background: form.has_credit_account ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.15)',
                          transition: 'background 200ms',
                        }}>
                          <span style={{
                            position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%',
                            background: form.has_credit_account ? 'white' : '#c4b5fd',
                            left: form.has_credit_account ? 19 : 3,
                            transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                      </div>
                    </div>

                    {form.has_credit_account && (
                      <Field label="Credit limit (KES)">
                        <Input type="number" min="0" value={form.credit_limit} onChange={setField('credit_limit')} disabled={!editing} placeholder="0.00" />
                      </Field>
                    )}

                    <Field label="Assigned sales rep">
                      {customer?.sales_rep ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          padding: '7px 11px', borderRadius: 8, background: 'rgba(168,85,247,0.04)',
                          border: '1.5px solid rgba(168,85,247,0.18)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.58rem', fontWeight: 700, color: '#c084fc',
                              border: '1.5px solid rgba(168,85,247,0.25)',
                            }}>
                              {`${customer.sales_rep.first_name ?? ''} ${customer.sales_rep.last_name ?? ''}`.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {`${customer.sales_rep.first_name ?? ''} ${customer.sales_rep.last_name ?? ''}`.trim() || customer.sales_rep.name || customer.sales_rep.email}
                              </p>
                              {customer.sales_rep.email && (
                                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{customer.sales_rep.email}</p>
                              )}
                            </div>
                          </div>
                          {editing && (
                            <button type="button" onClick={() => setShowAssignModal(true)} style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                              background: 'rgba(168,85,247,0.08)', color: '#a855f7',
                              border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer',
                              transition: 'background 150ms',
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                            >Reassign</button>
                          )}
                        </div>
                      ) : (
                        <button type="button" onClick={() => setShowAssignModal(true)} disabled={!editing} style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '8px 11px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                          background: editing ? 'rgba(168,85,247,0.06)' : 'rgba(168,85,247,0.03)',
                          border: '1.5px dashed rgba(168,85,247,0.25)',
                          color: editing ? '#a855f7' : '#c4b5fd',
                          cursor: editing ? 'pointer' : 'not-allowed',
                          transition: 'background 150ms, border-color 150ms',
                        }}
                          onMouseEnter={e => { if (editing) { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; } }}
                          onMouseLeave={e => { e.currentTarget.style.background = editing ? 'rgba(168,85,247,0.06)' : 'rgba(168,85,247,0.03)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; }}
                        >
                          <UserCheck size={14} /> Assign Sales Rep
                        </button>
                      )}
                    </Field>
                  </div>
                </div>

                {/* Notes */}
                <div style={card}>
                  <p style={sectionHeader}><FileText size={14} style={{ color: '#c4b5fd' }} /> Notes</p>
                  <textarea
                    rows={4} value={form.notes} onChange={setField('notes')} disabled={!editing}
                    placeholder="Internal notes about this customer…"
                    style={{
                      ...(editing ? inputStyle : inputDisabledStyle),
                      resize: 'none', width: '100%',
                    }}
                    onFocus={editing ? inputFocus : undefined}
                    onBlur={editing  ? inputBlur  : undefined}
                  />
                </div>
              </div>

              {/* ── Right column ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Order stats */}
                <div style={card}>
                  <p style={sectionHeader}>
                    <TrendingUp size={14} style={{ color: '#c4b5fd' }} />
                    Order statistics
                    {statsLoading && <Loader2 size={12} style={{ marginLeft: 8, animation: 'spin 1s linear infinite' }} />}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <StatBlock
                      icon={<Package size={14} />}
                      label="Total orders"
                      value={statsLoading ? '—' : (orderStats?.total_orders ?? 0).toLocaleString()}
                    />
                    <StatBlock
                      icon={<TrendingUp size={14} />}
                      label="Total spent"
                      value={statsLoading ? '—' : fmt(orderStats?.total_spent)}
                    />
                    <StatBlock
                      icon={<CreditCard size={14} />}
                      label="Avg order value"
                      value={statsLoading ? '—' : fmt(orderStats?.average_order_value)}
                    />
                    <StatBlock
                      icon={<Calendar size={14} />}
                      label="First order"
                      value={statsLoading ? '—' : fmtDate(orderStats?.first_order_date)}
                    />
                    <StatBlock
                      icon={<Clock size={14} />}
                      label="Last order"
                      value={statsLoading ? '—' : fmtDate(orderStats?.last_order_date)}
                    />
                    <StatBlock
                      icon={<CreditCard size={14} />}
                      label="Store credit"
                      value={fmt(customer.store_credit)}
                    />
                    <StatBlock
                      icon={<Star size={14} />}
                      label="Loyalty points"
                      value={`${(customer.loyalty_points ?? 0).toLocaleString()} pts`}
                    />
                  </div>
                  <Link to={`/admin/orders?customer=${id}`} style={{
                    marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: '0.75rem', color: '#a855f7', textDecoration: 'none', fontWeight: 600,
                    padding: '8px', borderRadius: 8,
                    border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.03)',
                    transition: 'background 150ms',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                  >
                    View all orders →
                  </Link>
                </div>

                {/* Store credit */}
                <div style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <p style={{ ...sectionHeader, margin: 0 }}><CreditCard size={14} style={{ color: '#c4b5fd' }} /> Store credit</p>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => { setShowCredit(v => !v); setShowPoints(false); setShowStatus(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700,
                          color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <Plus size={13} /> Add
                      </button>
                      {showCredit && <QuickAddPanel type="credit" onSubmit={handleAddCredit} onClose={() => setShowCredit(false)} />}
                    </div>
                  </div>
                  <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                    {fmt(customer.store_credit)}
                  </p>
                  {customer.has_credit_account && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {[['Credit limit', fmt(customer.credit_limit)], ['Used', fmt(customer.credit_used)], ['Available', fmt(customer.available_credit)]].map(([lbl, val]) => (
                        <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                          <span style={{ color: '#9ca3af' }}>{lbl}</span>
                          <span style={{ color: '#6b7280', fontWeight: 600 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Loyalty points */}
                <div style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <p style={{ ...sectionHeader, margin: 0 }}><Coins size={14} style={{ color: '#c4b5fd' }} /> Loyalty points</p>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => { setShowPoints(v => !v); setShowCredit(false); setShowStatus(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700,
                          color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <Plus size={13} /> Add
                      </button>
                      {showPoints && <QuickAddPanel type="points" onSubmit={handleAddPoints} onClose={() => setShowPoints(false)} />}
                    </div>
                  </div>
                  <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                    {(customer.loyalty_points ?? 0).toLocaleString()}
                    <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>pts</span>
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
                    Tier multiplier: <strong style={{ color: '#a855f7' }}>×{customer.tier_benefits?.loyalty_points_multiplier ?? 1}</strong>
                  </p>
                </div>

                {/* Tags */}
                <div style={card}>
                  <p style={sectionHeader}><Tag size={14} style={{ color: '#c4b5fd' }} /> Tags</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {(customer.tags ?? []).length === 0
                      ? <p style={{ fontSize: '0.72rem', color: '#d1d5db', margin: 0 }}>No tags yet</p>
                      : (customer.tags ?? []).map(tag => (
                          <span key={tag} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                            background: 'rgba(168,85,247,0.07)', color: '#7c3aed',
                            border: '1px solid rgba(168,85,247,0.18)',
                          }}>
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)} style={{
                              background: 'none', border: 'none', cursor: 'pointer', color: '#c4b5fd',
                              display: 'flex', padding: 0, marginLeft: 2, transition: 'color 120ms',
                            }}
                              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                              onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}>
                              <X size={10} />
                            </button>
                          </span>
                        ))
                    }
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text" value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add a tag…"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={inputFocus} onBlur={inputBlur}
                    />
                    <button onClick={handleAddTag} style={{
                      padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
                    }}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* System info */}
                <div style={card}>
                  <p style={sectionHeader}><Clock size={14} style={{ color: '#c4b5fd' }} /> System info</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

                    {/* Dates */}
                    {[
                      ['Joined',      fmtDate(customer.created_at)],
                      ['Last login',  fmtDate(customerUser?.last_login_at ?? customer.last_login_at)],
                    ].map(([lbl, val]) => (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#9ca3af' }}>{lbl}</span>
                        <span style={{ color: '#374151', fontWeight: 600 }}>{val}</span>
                      </div>
                    ))}

                    {/* Auth provider */}
                    {customerUser?.oauth_provider && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#9ca3af' }}>Auth provider</span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                          background: 'rgba(99,102,241,0.08)', color: '#4338ca',
                          boxShadow: '0 0 0 1px rgba(99,102,241,0.2)', textTransform: 'capitalize',
                        }}>
                          {customerUser.oauth_provider === 'google'    && '🔵'}
                          {customerUser.oauth_provider === 'apple'     && '⚫'}
                          {customerUser.oauth_provider === 'microsoft' && '🟦'}
                          {customerUser.oauth_provider === 'email'     && '✉️'}
                          {' '}{customerUser.oauth_provider}
                        </span>
                      </div>
                    )}

                    {/* Last IP */}
                    {(customerUser?.last_login_ip ?? customer.last_login_ip) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#9ca3af' }}>Last IP</span>
                        <span style={{ color: '#374151', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.72rem' }}>
                          {customerUser?.last_login_ip ?? customer.last_login_ip}
                        </span>
                      </div>
                    )}

                    {/* Last user agent */}
                    {(customerUser?.last_login_user_agent) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last device</span>
                        <span style={{
                          fontSize: '0.68rem', color: '#6b7280', lineHeight: 1.4,
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {customerUser.last_login_user_agent}
                        </span>
                      </div>
                    )}

                    {/* Verification badges */}
                    <div style={{ display: 'flex', gap: 6, paddingTop: 4, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Email', verified: customer.email_verified },
                        { label: 'Phone', verified: customer.phone_verified },
                      ].map(({ label, verified }) => (
                        <span key={label} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                          background: verified ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)',
                          color: verified ? '#065f46' : '#b91c1c',
                          boxShadow: `0 0 0 1px ${verified ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        }}>
                          {verified ? <Check size={9} /> : <X size={9} />}
                          {label} {verified ? 'verified' : 'unverified'}
                        </span>
                      ))}
                    </div>

                    {/* Status reason */}
                    {customer.status_reason && (
                      <div style={{
                        marginTop: 4, padding: '8px 10px', borderRadius: 8,
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                        fontSize: '0.72rem', color: '#b45309',
                      }}>
                        Reason: {customer.status_reason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: ADDRESSES ═════════════════════════════════════════════════════ */}
        {tab === 'addresses' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
            {/* ── Customer-entered default addresses (read-only) ── */}
              {(customer.default_shipping_address || customer.default_billing_address) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>
                    Customer-entered addresses (read-only)
                  </p>
                  {customer.default_shipping_address && (
                    <div style={{
                      ...card, padding: '14px 16px',
                      background: 'rgba(59,130,246,0.02)', border: '1px solid rgba(59,130,246,0.15)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Package size={12} style={{ color: '#3b82f6' }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Default shipping
                        </span>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                          background: 'rgba(59,130,246,0.08)', color: '#1d4ed8',
                          border: '1px solid rgba(59,130,246,0.2)',
                        }}>
                          Customer entered
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {customer.default_shipping_address}
                      </p>
                    </div>
                  )}
                  {customer.default_billing_address && (
                    <div style={{
                      ...card, padding: '14px 16px',
                      background: 'rgba(168,85,247,0.02)', border: '1px solid rgba(168,85,247,0.12)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <CreditCard size={12} style={{ color: '#a855f7' }} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Default billing
                        </span>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                          background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
                          border: '1px solid rgba(168,85,247,0.2)',
                        }}>
                          Customer entered
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {customer.default_billing_address}
                      </p>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: 12 }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: 0 }}>
                      Saved address book
                    </p>
                  </div>
                </div>
              )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
                {addresses.length} address{addresses.length !== 1 ? 'es' : ''}
              </p>
              {!addingAddr && (
                <button onClick={() => setAddingAddr(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                  boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
                }}>
                  <Plus size={14} /> Add address
                </button>
              )}
            </div>

            {addingAddr && <AddressForm onSave={handleSaveAddress} onCancel={() => setAddingAddr(false)} />}

            {addrsLoading
              ? [1, 2].map(i => (
                  <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[32, 64, 48].map((w, j) => (
                      <div key={j} style={{ height: 12, width: `${w}%`, borderRadius: 6, background: 'rgba(168,85,247,0.08)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                  </div>
                ))
              : addresses.length === 0 && !addingAddr
                ? (
                  <div style={{
                    ...card, textAlign: 'center', padding: '48px 24px',
                    border: '1.5px dashed rgba(168,85,247,0.2)', background: 'transparent',
                  }}>
                    <MapPin size={28} style={{ color: 'rgba(168,85,247,0.2)', margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No addresses saved by admin</p>
                  </div>
                )
                : addresses.map(addr => (
                    <div key={addr.id}>
                      {editingAddr === addr.id
                        ? <AddressForm initial={addr} onSave={handleSaveAddress} onCancel={() => setEditingAddr(null)} />
                        : (
                          <div style={card}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <span style={{ marginTop: 2, color: '#c4b5fd', flexShrink: 0 }}>
                                  {ADDR_TYPE_ICONS[addr.address_type]}
                                </span>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0, textTransform: 'capitalize' }}>
                                      {addr.label || addr.address_type}
                                    </p>
                                    {addr.is_default_shipping && (
                                      <Badge bg="rgba(59,130,246,0.08)" color="#1d4ed8" ring="rgba(59,130,246,0.2)">Default shipping</Badge>
                                    )}
                                    {addr.is_default_billing && (
                                      <Badge bg="rgba(168,85,247,0.08)" color="#7c3aed" ring="rgba(168,85,247,0.2)">Default billing</Badge>
                                    )}
                                    {addr.verified && (
                                      <Badge bg="rgba(16,185,129,0.08)" color="#065f46" ring="rgba(16,185,129,0.2)">
                                        <Check size={9} /> Verified
                                      </Badge>
                                    )}
                                  </div>
                                  {addr.contact_name && <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 2px' }}>{addr.contact_name}</p>}
                                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 1px' }}>{addr.address_line_1}</p>
                                  {addr.address_line_2 && <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 1px' }}>{addr.address_line_2}</p>}
                                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 1px' }}>{[addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ')}</p>
                                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>{addr.country}</p>
                                  {addr.landmark && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '4px 0 0' }}>Near: {addr.landmark}</p>}
                                  {addr.delivery_instructions && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0', fontStyle: 'italic' }}>"{addr.delivery_instructions}"</p>}
                                  {addr.contact_phone && (
                                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Phone size={11} style={{ color: '#c4b5fd' }} /> {addr.contact_phone}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {!addr.is_default_shipping && (
                                  <button onClick={() => handleSetDefault(addr.id, 'shipping')} style={{
                                    fontSize: '0.68rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                                    background: 'rgba(59,130,246,0.06)', color: '#1d4ed8',
                                    border: '1px solid rgba(59,130,246,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                                    transition: 'background 120ms',
                                  }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.06)'}>
                                    Set shipping
                                  </button>
                                )}
                                {!addr.is_default_billing && (
                                  <button onClick={() => handleSetDefault(addr.id, 'billing')} style={{
                                    fontSize: '0.68rem', padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                                    background: 'rgba(168,85,247,0.06)', color: '#7c3aed',
                                    border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                                    transition: 'background 120ms',
                                  }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.12)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}>
                                    Set billing
                                  </button>
                                )}
                                <button onClick={() => setEditingAddr(addr.id)} style={{
                                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer',
                                  color: '#9ca3af', transition: 'background 120ms, color 120ms',
                                }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = '#a855f7'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; }}>
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => handleDeleteAddress(addr.id)} style={{
                                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer',
                                  color: '#9ca3af', transition: 'background 120ms, color 120ms',
                                }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; }}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      }
                    </div>
                  ))
            }
          </div>
        )}

        {/* ══ TAB: ORDERS ════════════════════════════════════════════════════════ */}
        {tab === 'orders' && (
          <div style={{ maxWidth: 900 }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
                {ordersLoading ? 'Loading…' : `${ordersMeta.total.toLocaleString()} order${ordersMeta.total !== 1 ? 's' : ''}`}
              </p>
              <Link to={`/admin/orders?customer=${id}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                textDecoration: 'none',
                border: '1px solid rgba(168,85,247,0.22)', color: '#a855f7',
                background: 'rgba(168,85,247,0.04)',
                transition: 'background 150ms',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
              >
                Open in Orders →
              </Link>
            </div>

            {/* Table card */}
            <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>
                      {['Order', 'Status', 'Payment', 'Items', 'Total', 'Date'].map(h => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: h === 'Total' || h === 'Items' ? 'right' : 'left',
                          fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.08em', color: '#9ca3af',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordersLoading
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
                            {[140, 80, 80, 40, 90, 80].map((w, j) => (
                              <td key={j} style={{ padding: '12px 16px' }}>
                                <div style={{ height: 11, width: w, borderRadius: 6, background: 'rgba(168,85,247,0.08)' }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : orders.length === 0
                        ? (
                          <tr>
                            <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                              <Package size={28} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 10px', display: 'block' }} />
                              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No orders yet</p>
                            </td>
                          </tr>
                        )
                        : orders.map((o, i) => {
                            const isLast = i === orders.length - 1;

                            // ── status badge colours ──
                            const ORDER_STATUS = {
                              pending:    { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', dot: '#f59e0b'  },
                              confirmed:  { bg: 'rgba(59,130,246,0.1)',  color: '#1d4ed8', dot: '#3b82f6'  },
                              processing: { bg: 'rgba(99,102,241,0.1)',  color: '#4338ca', dot: '#6366f1'  },
                              shipped:    { bg: 'rgba(20,184,166,0.1)',  color: '#0f766e', dot: '#14b8a6'  },
                              delivered:  { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981'  },
                              completed:  { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981'  },
                              cancelled:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444'  },
                            };
                            const PAYMENT_STATUS = {
                              unpaid:           { bg: 'rgba(239,68,68,0.08)',   color: '#b91c1c' },
                              partially_paid:   { bg: 'rgba(245,158,11,0.08)',  color: '#b45309' },
                              paid:             { bg: 'rgba(16,185,129,0.08)',  color: '#065f46' },
                              refunded:         { bg: 'rgba(107,114,128,0.08)', color: '#4b5563' },
                              partially_refunded:{ bg: 'rgba(107,114,128,0.08)', color: '#4b5563' },
                            };

                            const os = ORDER_STATUS[o.status]   ?? { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af' };
                            const ps = PAYMENT_STATUS[o.payment_status] ?? { bg: 'rgba(107,114,128,0.08)', color: '#4b5563' };
                            const cap = (s) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—';

                            return (
                              <tr
                                key={o.id}
                                onClick={() => navigate(`/admin/orders/${o.id}`)}
                                style={{
                                  borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                                  cursor: 'pointer', transition: 'background 120ms',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                {/* Order number */}
                                <td style={{ padding: '11px 16px' }}>
                                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 1px', fontFamily: 'monospace' }}>
                                    {o.order_number}
                                  </p>
                                  {o.title && (
                                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                      {o.title}
                                    </p>
                                  )}
                                </td>

                                {/* Order status */}
                                <td style={{ padding: '11px 16px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                                    background: os.bg, color: os.color,
                                    boxShadow: `0 0 0 1px ${os.bg}`,
                                  }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: os.dot, flexShrink: 0 }} />
                                    {cap(o.status)}
                                  </span>
                                </td>

                                {/* Payment status */}
                                <td style={{ padding: '11px 16px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center',
                                    padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                                    background: ps.bg, color: ps.color,
                                  }}>
                                    {cap(o.payment_status)}
                                  </span>
                                </td>

                                {/* Item count */}
                                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                                  <span style={{ fontSize: '0.82rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                                    {o.items_count ?? o.order_items?.length ?? '—'}
                                  </span>
                                </td>

                                {/* Total */}
                                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                                    {o.currency === 'KES' 
                                      ? fmt(o.total) 
                                      : `${o.currency} ${Number(o.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    }
                                  </span>
                                </td>

                                {/* Date */}
                                <td style={{ padding: '11px 16px' }}>
                                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                    {fmtDate(o.created_at)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                    }
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {!ordersLoading && orders.length > 0 && ordersMeta.last_page > 1 && (
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid rgba(168,85,247,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(168,85,247,0.02)',
                }}>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
                    Page {ordersMeta.current_page} of {ordersMeta.last_page}
                  </p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setOrdersPage(p => Math.max(1, p - 1))}
                      disabled={ordersMeta.current_page <= 1}
                      style={{
                        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                        color: '#a855f7', cursor: ordersMeta.current_page <= 1 ? 'not-allowed' : 'pointer',
                        opacity: ordersMeta.current_page <= 1 ? 0.3 : 1,
                      }}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      onClick={() => setOrdersPage(p => Math.min(ordersMeta.last_page, p + 1))}
                      disabled={ordersMeta.current_page >= ordersMeta.last_page}
                      style={{
                        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                        color: '#a855f7', cursor: ordersMeta.current_page >= ordersMeta.last_page ? 'not-allowed' : 'pointer',
                        opacity: ordersMeta.current_page >= ordersMeta.last_page ? 0.3 : 1,
                      }}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showAssignModal && (
          <AssignModal
            onClose={() => setShowAssignModal(false)}
            onAssign={handleAssignRep}
            currentAssignedId={customer?.assigned_sales_rep || null}
          />
        )}
      </div>
    </div>
  );
}