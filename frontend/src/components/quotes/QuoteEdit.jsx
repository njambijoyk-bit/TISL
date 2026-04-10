import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save, Plus, Trash2, AlertCircle, Package, Wrench, Tag,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Percent, X,
  UserCheck, ChevronLeft, Calendar, DollarSign, FileText,
  ClipboardList, MapPin, CreditCard, Truck, ShieldCheck,
  Layers, Hash, CheckCircle, AlertTriangle, Settings,
} from 'lucide-react';
import AdminLayout from '../layout/AdminLayout';
import LoadingSpinner from '../layout/LoadingSpinner';
import ProductSelectorModal from './request-wizard/ProductSelectorModal';
import ServiceSelectorModal from './request-wizard/ServiceSelectorModal';
import CustomItemModal from './request-wizard/CustomItemModal';
import PricingValidationModal from './PricingValidationModal';
import AssignModal from './AssignModal';
import useQuoteStore from '../../store/quoteStore';
import currencyAPI from '../../api/currency';
import toast from 'react-hot-toast';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Input base ───────────────────────────────────────────────────────────────
const iBase = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1.5px solid var(--border,#e5e7eb)', fontSize: '0.83rem',
  outline: 'none', color: 'var(--text,#111827)', boxSizing: 'border-box',
  fontWeight: 500, background: 'var(--input-bg,white)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
const fIn  = e => { e.currentTarget.style.borderColor = purple;    e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'var(--border,#e5e7eb)'; e.currentTarget.style.boxShadow = 'none'; };

// ─── Atoms ────────────────────────────────────────────────────────────────────
const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>
      {children}
    </p>
  </div>
);

const FieldLabel = ({ children, required }) => (
  <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 7 }}>
    {children}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
  </p>
);

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'var(--panel-bg,white)',
    border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}`,
    borderRadius: 16, overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

const Pill = ({ children, color = purple }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 9999,
    fontSize: '0.7rem', fontWeight: 700,
    color, background: `${color}18`, border: `1px solid ${color}30`,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
    {children}
  </span>
);

const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md', fullWidth, type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' },
    outline: { background: 'transparent', color: 'var(--text-muted,#6b7280)', border: '1.5px solid var(--border,#e5e7eb)', boxShadow: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
    warning: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' },
    blue:    { background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' },
  };
  const pad = size === 'sm' ? '6px 14px' : '9px 20px';
  const fs  = size === 'sm' ? '0.78rem' : '0.83rem';
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 10, fontSize: fs,
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s, transform 0.1s',
      width: fullWidth ? '100%' : undefined,
      justifyContent: fullWidth ? 'center' : undefined,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const StatCell = ({ label, value, accent, sub }) => (
  <div style={{
    padding: '10px 12px', borderRadius: 10,
    background: accent ? purpleLt : 'var(--row-bg,rgba(249,250,251,0.7))',
    border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}`,
  }}>
    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
    <p style={{ fontSize: '0.88rem', fontWeight: 800, color: accent ? purple : 'var(--text,#111827)', margin: 0 }}>{value}</p>
    {sub && <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontStyle: 'italic', margin: '2px 0 0' }}>{sub}</p>}
  </div>
);

// ─── Field components ─────────────────────────────────────────────────────────
const Field = ({ label, required, children, hint, error }) => (
  <div>
    <FieldLabel required={required}>{label}</FieldLabel>
    {children}
    {error && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 5 }}>{error}</p>}
    {hint && !error && <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 5 }}>{hint}</p>}
  </div>
);

const StyledInput = ({ value, onChange, type = 'text', min, max, step, placeholder, prefix, disabled, error }) => (
  <div style={{ position: 'relative' }}>
    {prefix && (
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, pointerEvents: 'none', zIndex: 1 }}>
        {prefix}
      </span>
    )}
    <input
      type={type} value={value} onChange={onChange}
      min={min} max={max} step={step} placeholder={placeholder} disabled={disabled}
      style={{ ...iBase, paddingLeft: prefix ? 44 : 12, borderColor: error ? '#ef4444' : undefined, opacity: disabled ? 0.6 : 1 }}
      onFocus={fIn} onBlur={fOut}
    />
  </div>
);

const StyledSelect = ({ value, onChange, options, disabled }) => (
  <select
    value={value} onChange={onChange} disabled={disabled}
    style={{ ...iBase, appearance: 'auto', cursor: disabled ? 'not-allowed' : 'pointer' }}
    onFocus={fIn} onBlur={fOut}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const StyledTextarea = ({ value, onChange, rows = 3, placeholder }) => (
  <textarea
    value={value} onChange={onChange} rows={rows} placeholder={placeholder}
    style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
    onFocus={fIn} onBlur={fOut}
  />
);

const Checkbox = ({ id, checked, onChange, label }) => (
  <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
    <div style={{
      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
      background: checked ? purple : 'white',
      border: `2px solid ${checked ? purple : '#d1d5db'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      {checked && <CheckCircle size={11} color="white" />}
    </div>
    <input type="checkbox" id={id} checked={checked} onChange={onChange} style={{ display: 'none' }} />
    <span style={{ fontSize: '0.83rem', color: 'var(--text,#374151)', fontWeight: 500 }}>{label}</span>
  </label>
);

// ─── Dropdown options ─────────────────────────────────────────────────────────
const QUOTE_TYPE_OPTIONS    = [{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }, { value: 'mixed', label: 'Mixed' }];
const STATUS_OPTIONS        = [{ value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'revised', label: 'Revised' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }];
const PRIORITY_OPTIONS      = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }];
const PRICING_TYPE_OPTIONS  = [{ value: 'standard', label: 'Standard' }, { value: 'bulk', label: 'Bulk' }, { value: 'negotiated', label: 'Negotiated' }, { value: 'custom', label: 'Custom' }];
const BILLING_OPTIONS       = [{ value: '', label: 'Not specified' }, { value: 'one_time', label: 'One Time' }, { value: 'milestone_based', label: 'Milestone Based' }, { value: 'monthly', label: 'Monthly' }, { value: 'hourly', label: 'Hourly' }, { value: 'fixed_price', label: 'Fixed Price' }];
const ITEM_TYPE_OPTIONS     = [{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }, { value: 'custom_product', label: 'Custom Product' }, { value: 'custom_service', label: 'Custom Service' }, { value: 'fee', label: 'Fee' }];
const AVAILABILITY_OPTIONS  = [{ value: 'in_stock', label: 'In Stock' }, { value: 'available', label: 'Available' }, { value: 'out_of_stock', label: 'Out of Stock' }, { value: 'special_order', label: 'Special Order' }, { value: 'on_request', label: 'On Request' }];
const PRODUCT_UNITS = [{ value: 'each', label: 'Each' }, { value: 'unit', label: 'Unit' }, { value: 'piece', label: 'Piece' }, { value: 'box', label: 'Box' }, { value: 'pack', label: 'Pack' }, { value: 'set', label: 'Set' }, { value: 'dozen', label: 'Dozen' }, { value: 'kg', label: 'Kilogram' }, { value: 'g', label: 'Gram' }, { value: 'liter', label: 'Liter' }, { value: 'ml', label: 'Milliliter' }, { value: 'meter', label: 'Meter' }, { value: 'cm', label: 'Centimeter' }, { value: 'sqm', label: 'Sq Meter' }, { value: 'sqft', label: 'Sq Foot' }];
const SERVICE_UNITS = [{ value: 'hour', label: 'Hour' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'session', label: 'Session' }, { value: 'visit', label: 'Visit' }, { value: 'project', label: 'Project' }, { value: 'job', label: 'Job' }, { value: 'each', label: 'Each' }];
const FEE_UNITS     = [{ value: 'one-time', label: 'One-Time' }, { value: 'per_transaction', label: 'Per Transaction' }, { value: 'per_user', label: 'Per User' }, { value: 'per_month', label: 'Per Month' }, { value: 'per_year', label: 'Per Year' }, { value: 'per_project', label: 'Per Project' }, { value: 'per_item', label: 'Per Item' }, { value: 'percentage', label: 'Percentage' }, { value: 'flat_rate', label: 'Flat Rate' }, { value: 'each', label: 'Each' }];

const priorityColor = { low: '#9ca3af', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };
const statusColor   = { draft: '#9ca3af', pending: '#f59e0b', revised: '#3b82f6', approved: '#10b981', rejected: '#ef4444' };

const fmt   = (n, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));

// ─── Main component ───────────────────────────────────────────────────────────
const QuoteEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentQuote: quote, loadingCurrent, fetchQuoteById, updateQuote } = useQuoteStore();

  const [saving,               setSaving]               = useState(false);
  const [useDiscountPct,       setUseDiscountPct]       = useState(true);
  const [expandedItems,        setExpandedItems]        = useState({});
  const [hasChanges,           setHasChanges]           = useState(false);
  const [currencies,           setCurrencies]           = useState([]);
  const [loadingCurrencies,    setLoadingCurrencies]    = useState(false);
  const [showPricingModal,     setShowPricingModal]     = useState(false);
  const [pricingErrors,        setPricingErrors]        = useState([]);
  const [showProductSelector,  setShowProductSelector]  = useState(false);
  const [showServiceSelector,  setShowServiceSelector]  = useState(false);
  const [showCustomModal,      setShowCustomModal]      = useState(null);
  const [showAssignModal,      setShowAssignModal]      = useState(false);

  const [formData, setFormData] = useState({
    customer_id: '', assigned_to: '', quote_type: 'mixed', status: 'pending', priority: 'medium',
    valid_from: '', valid_until: '', service_start_date: '', service_end_date: '',
    pricing_type: 'standard', is_negotiable: false, currency: 'KES', billing_schedule: '',
    discount: 0, discount_percentage: 0, tax: 0, shipping_cost: 0,
    customer_notes: '', admin_notes: '', terms_and_conditions: '', payment_terms: '', delivery_terms: '',
    shipping_address: '', billing_address: '', billing_same_as_shipping: true,
    items: [],
  });

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => { if (id) fetchQuoteById(id); }, [id, fetchQuoteById]);

  useEffect(() => {
    const load = async () => {
      setLoadingCurrencies(true);
      try {
        const res = await currencyAPI.getCurrencies();
        const list = Array.isArray(res) ? res : (res.data || res.currencies || []);
        setCurrencies(list.filter(c => c.is_active !== false));
      } catch { toast.error('Failed to load currencies'); setCurrencies([]); }
      finally { setLoadingCurrencies(false); }
    };
    load();
  }, []);

  useEffect(() => {
    if (!quote) return;
    const items = (quote.items || []).map((item, index) => ({
      item_type: item.item_type || 'product',
      description: item.description || item.product_name || item.service_name || '',
      quantity: parseFloat(item.quantity) || 1,
      unit_of_measure: item.unit_of_measure || 'each',
      original_price: parseFloat(item.original_price) || 0,
      unit_price: parseFloat(item.unit_price) || 0,
      discount_amount: parseFloat(item.discount_amount) || 0,
      line_total: parseFloat(item.line_total) || 0,
      line_total_after_discount: parseFloat(item.line_total_after_discount) || 0,
      variant_details: item.variant_details || null,
      labor_cost: item.labor_cost ? parseFloat(item.labor_cost) : null,
      material_cost: item.material_cost ? parseFloat(item.material_cost) : null,
      estimated_duration: item.estimated_duration || '',
      estimated_hours: item.estimated_hours ? parseFloat(item.estimated_hours) : null,
      hourly_rate: item.hourly_rate ? parseFloat(item.hourly_rate) : null,
      requires_site_visit: item.requires_site_visit || false,
      lead_time: item.lead_time || '',
      scheduled_start_date: item.scheduled_start_date || '',
      scheduled_end_date: item.scheduled_end_date || '',
      notes: item.notes || '',
      pricing_notes: item.pricing_notes || '',
      prerequisites: item.prerequisites || '',
      is_bulk_pricing: item.is_bulk_pricing || false,
      is_negotiated_price: item.is_negotiated_price || false,
      is_taxable: item.is_taxable !== false,
      availability_status: item.availability_status || 'available',
      display_order: item.display_order !== undefined ? item.display_order : index,
      product_id: item.product_id || null, service_id: item.service_id || null,
      product_name: item.product_name || '', product_sku: item.product_sku || '',
      brand_name: item.brand_name || '', product_image: item.product_image || '',
      service_name: item.service_name || '', service_description: item.service_description || '',
      service_category: item.service_category || '',
    }));

    setFormData({
      customer_id: quote.customer_id || '',
      assigned_to: quote.assigned_to?.id || quote.assigned_to || '',
      quote_type: quote.quote_type || 'mixed', status: quote.status || 'pending',
      priority: quote.priority || 'medium',
      valid_from: quote.valid_from ? quote.valid_from.split('T')[0] : '',
      valid_until: quote.valid_until ? quote.valid_until.split('T')[0] : '',
      service_start_date: quote.service_start_date ? quote.service_start_date.split('T')[0] : '',
      service_end_date: quote.service_end_date ? quote.service_end_date.split('T')[0] : '',
      pricing_type: quote.pricing_type || 'standard', is_negotiable: quote.is_negotiable || false,
      currency: quote.currency || 'KES', billing_schedule: quote.billing_schedule || '',
      discount: parseFloat(quote.discount) || 0, discount_percentage: parseFloat(quote.discount_percentage) || 0,
      tax: parseFloat(quote.tax) || 0, shipping_cost: parseFloat(quote.shipping_cost) || 0,
      customer_notes: quote.customer_notes || '', admin_notes: quote.admin_notes || '',
      terms_and_conditions: quote.terms_and_conditions || '', payment_terms: quote.payment_terms || '',
      delivery_terms: quote.delivery_terms || '', shipping_address: quote.shipping_address || '',
      billing_address: quote.billing_address || '',
      billing_same_as_shipping: quote.billing_same_as_shipping !== false,
      items,
    });
    setHasChanges(false);
  }, [quote]);

  // ── Unsaved changes guard ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => { if (hasChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const currencyOptionsFromDb = currencies.map(c => ({ value: c.code, label: `${c.name} (${c.code})` }));
  const selectedCurrency      = currencies.find(c => c.code === formData.currency);
  const isBaseCurrency        = !!selectedCurrency?.is_base || formData.currency === 'KES';
  const exchangeRateToKes     = !isBaseCurrency ? Number(selectedCurrency?.conversion_rate || 0) : 0;
  const showKes               = !isBaseCurrency && exchangeRateToKes > 0;
  const displayCurrency       = formData.currency || 'KES';
  const csMap                 = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
  const cs                    = csMap[displayCurrency] || displayCurrency;
  const money                 = (v, d = 2) => `${cs} ${fmt(v, d)}`;
  const kesMoney              = (v) => `KSh ${fmt(v)}`;
  const toKes                 = (v) => Number(v || 0) * exchangeRateToKes;

  const calculateSubtotal = () =>
    formData.items.reduce((s, i) => s + (parseFloat(i.line_total_after_discount) || 0), 0);

  const calculateTotalItemDiscounts = () =>
    formData.items.reduce((s, i) => s + (parseFloat(i.discount_amount) || 0), 0);

  const calculateTotals = () => {
    const originalTotal               = formData.items.reduce((s, i) => s + (parseFloat(i.line_total) || 0), 0);
    const itemDiscounts               = calculateTotalItemDiscounts();
    const subtotalAfterItemDiscounts  = calculateSubtotal();
    const quoteDiscount               = parseFloat(formData.discount) || 0;
    const subtotalAfterAllDiscounts   = subtotalAfterItemDiscounts - quoteDiscount;
    const tax                         = parseFloat(formData.tax) || 0;
    const shipping                    = parseFloat(formData.shipping_cost) || 0;
    const total                       = subtotalAfterAllDiscounts + tax + shipping;
    const totalSavings                = itemDiscounts + quoteDiscount;
    return { originalTotal, itemDiscounts, subtotalAfterItemDiscounts, quoteDiscount, subtotalAfterAllDiscounts, tax, shipping, total, totalSavings };
  };

  const calculateItemPricing = (item) => {
    const qty = parseFloat(item.quantity) || 0;
    const orig = parseFloat(item.original_price) || 0;
    const unit = parseFloat(item.unit_price) || 0;
    return {
      line_total: qty * orig,
      discount_amount: (orig - unit) * qty,
      line_total_after_discount: qty * unit,
    };
  };

  const validatePricing = () => {
    const errors = [];
    formData.items.forEach((item, i) => {
      const u = parseFloat(item.unit_price) || 0;
      const o = parseFloat(item.original_price) || 0;
      const name = item.description || item.product_name || item.service_name || `Item ${i + 1}`;
      if (u === 0) errors.push({ itemIndex: i, itemName: name, issue: 'Zero price', message: 'Unit price is zero.' });
      if (u > o * 1.5) errors.push({ itemIndex: i, itemName: name, issue: 'Markup exceeds 50%', message: `Unit (${u}) > Original (${o}) by >50%` });
    });
    return errors;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'shipping_address' && prev.billing_same_as_shipping) next.billing_address = value;
      if (field === 'billing_same_as_shipping' && value) next.billing_address = prev.shipping_address;
      if (field === 'discount_percentage') next.discount = (calculateSubtotal() * parseFloat(value || 0)) / 100;
      if (field === 'discount') { const sub = calculateSubtotal(); if (sub > 0) next.discount_percentage = ((parseFloat(value || 0) / sub) * 100).toFixed(2); }
      return next;
    });
    setHasChanges(true);
  };

  const handleItemChange = (index, field, value) => {
    const items = [...formData.items];
    items[index] = { ...items[index], [field]: value };
    if (['quantity', 'original_price', 'unit_price'].includes(field)) {
      const p = calculateItemPricing(items[index]);
      items[index] = { ...items[index], ...p };
    }
    if (field === 'item_type') {
      items[index].unit_of_measure = (value === 'service' || value === 'custom_service') ? 'hour' : 'each';
    }
    setFormData(prev => ({ ...prev, items }));
    setHasChanges(true);
  };

  const handleVariantChange = (index, key, value) => {
    const items = [...formData.items];
    items[index].variant_details = { ...(items[index].variant_details || {}), [key]: value };
    setFormData(prev => ({ ...prev, items }));
  };

  const addVariantField = (index) => {
    const key = prompt('Enter variant attribute name (e.g., Color, Size):');
    if (key) handleVariantChange(index, key, '');
  };

  const removeVariantField = (index, key) => {
    const items = [...formData.items];
    const v = { ...(items[index].variant_details || {}) };
    delete v[key];
    items[index].variant_details = Object.keys(v).length > 0 ? v : null;
    setFormData(prev => ({ ...prev, items }));
  };

  const removeItem = (index) => {
    const items = formData.items.filter((_, i) => i !== index).map((item, idx) => ({ ...item, display_order: idx }));
    setFormData(prev => ({ ...prev, items }));
    setHasChanges(true);
    toast.success('Item removed');
  };

  const moveItem = (index, dir) => {
    const items = formData.items.map(i => ({ ...i }));
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    items.forEach((item, idx) => { item.display_order = idx; });
    setFormData(prev => ({ ...prev, items }));
    setHasChanges(true);
  };

  const sortItems = (type) => {
    const items = formData.items.map(i => ({ ...i }));
    const msgs = { 'price-high': 'Sorted: Highest price first', 'price-low': 'Sorted: Lowest price first', 'name': 'Sorted: Alphabetically', 'type-services': 'Sorted: Services first', 'type-products': 'Sorted: Products first' };
    if (type === 'price-high') items.sort((a, b) => parseFloat(b.unit_price || 0) - parseFloat(a.unit_price || 0));
    else if (type === 'price-low') items.sort((a, b) => parseFloat(a.unit_price || 0) - parseFloat(b.unit_price || 0));
    else if (type === 'name') items.sort((a, b) => (a.description || a.product_name || '').toLowerCase().localeCompare((b.description || b.product_name || '').toLowerCase()));
    else if (type === 'type-services') { const o = { service: 1, custom_service: 2, product: 3, custom_product: 4, fee: 5 }; items.sort((a, b) => (o[a.item_type] || 9) - (o[b.item_type] || 9)); }
    else if (type === 'type-products') { const o = { product: 1, custom_product: 2, service: 3, custom_service: 4, fee: 5 }; items.sort((a, b) => (o[a.item_type] || 9) - (o[b.item_type] || 9)); }
    else return;
    items.forEach((item, idx) => { item.display_order = idx; });
    setFormData(prev => ({ ...prev, items }));
    setHasChanges(true);
    toast.success(msgs[type]);
  };

  const handleProductsSelected = (products) => {
    const newItems = products.map((p, i) => ({
      item_type: 'product', description: p.name || '', quantity: 1,
      unit_of_measure: p.unit_of_measure || 'each',
      original_price: parseFloat(p.price) || 0, unit_price: parseFloat(p.price) || 0,
      discount_amount: 0, line_total: parseFloat(p.price) || 0,
      line_total_after_discount: parseFloat(p.price) || 0,
      variant_details: null, labor_cost: null, material_cost: null,
      estimated_duration: '', estimated_hours: null, requires_site_visit: false,
      notes: '', pricing_notes: '', prerequisites: '', is_bulk_pricing: false,
      is_negotiated_price: false, is_taxable: true,
      availability_status: p.stock_quantity > 0 ? 'in_stock' : 'out_of_stock',
      display_order: formData.items.length + i,
      product_id: p.id, service_id: null,
      product_name: p.name, product_sku: p.sku, brand_name: p.brand?.name || '', product_image: p.image_url || '',
    }));
    setFormData(prev => ({ ...prev, items: [...prev.items, ...newItems] }));
    setShowProductSelector(false);
    setHasChanges(true);
    toast.success(`Added ${products.length} product(s)`);
  };

  const handleServicesSelected = (services) => {
    const newItems = services.map((s, i) => ({
      item_type: 'service', description: s.name || '', quantity: 1,
      unit_of_measure: s.pricing_unit || 'hour',
      original_price: parseFloat(s.base_price) || 0, unit_price: parseFloat(s.base_price) || 0,
      discount_amount: 0, line_total: parseFloat(s.base_price) || 0,
      line_total_after_discount: parseFloat(s.base_price) || 0,
      variant_details: null, labor_cost: null, material_cost: null,
      estimated_duration: s.estimated_duration || '', estimated_hours: parseFloat(s.estimated_hours) || null,
      requires_site_visit: s.requires_site_visit || false, notes: '', pricing_notes: '',
      prerequisites: '', is_bulk_pricing: false, is_negotiated_price: false, is_taxable: true,
      availability_status: 'available', display_order: formData.items.length + i,
      product_id: null, service_id: s.id,
      service_name: s.name, service_description: s.description, service_category: s.category?.name || '',
    }));
    setFormData(prev => ({ ...prev, items: [...prev.items, ...newItems] }));
    setShowServiceSelector(false);
    setHasChanges(true);
    toast.success(`Added ${services.length} service(s)`);
  };

  const handleCustomItemCreated = (customItem) => {
    const isService = customItem.type === 'service';
    const isFee = customItem.type === 'fee';
    const itemType = isFee ? 'fee' : `custom_${customItem.type}`;
    const quantity = parseFloat(customItem.quantity) || 1;
    const price = parseFloat(customItem.price) || 0;
    const lineTotal = quantity * price;
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        item_type: itemType, description: customItem.name || '', quantity, price,
        unit_of_measure: customItem.unit_of_measure || (isService ? 'hour' : isFee ? 'one-time' : 'each'),
        original_price: price, unit_price: price, discount_amount: 0,
        line_total: lineTotal, line_total_after_discount: lineTotal,
        variant_details: null,
        labor_cost: isService ? (parseFloat(customItem.labor_cost) || null) : null,
        material_cost: isService ? (parseFloat(customItem.material_cost) || null) : null,
        estimated_duration: isService ? (customItem.estimated_duration || null) : null,
        estimated_hours: isService ? (parseFloat(customItem.estimated_hours) || null) : null,
        hourly_rate: isService ? (parseFloat(customItem.hourly_rate) || null) : null,
        requires_site_visit: isService ? (customItem.requires_site_visit || false) : false,
        scheduled_start_date: null, scheduled_end_date: null,
        lead_time: customItem.lead_time || null, notes: customItem.notes || '',
        pricing_notes: customItem.pricing_notes || '', prerequisites: '',
        is_bulk_pricing: false, is_negotiated_price: false, is_taxable: true,
        availability_status: 'available', display_order: prev.items.length,
        product_id: null, service_id: null,
      }],
    }));
    setShowCustomModal(null);
    setHasChanges(true);
    toast.success('Custom item added');
  };

  const handleAssign = (adminId) => {
    setFormData(prev => ({ ...prev, assigned_to: adminId }));
    setShowAssignModal(false);
    setHasChanges(true);
    toast.success('Admin assigned');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) { toast.error('Please add at least one item'); return; }
    if (formData.valid_from && formData.valid_until && new Date(formData.valid_from) >= new Date(formData.valid_until)) { toast.error('Valid Until must be after Valid From'); return; }
    if (formData.service_start_date && formData.service_end_date && new Date(formData.service_start_date) >= new Date(formData.service_end_date)) { toast.error('Service End must be after Service Start'); return; }
    const errors = validatePricing();
    if (errors.length > 0) { setPricingErrors(errors); setShowPricingModal(true); return; }

    setSaving(true);
    try {
      const totals = calculateTotals();
      const assignedToId = typeof formData.assigned_to === 'object' && formData.assigned_to !== null ? formData.assigned_to.id : formData.assigned_to;
      await updateQuote(id, {
        quote_type: formData.quote_type, status: formData.status, priority: formData.priority,
        assigned_to: assignedToId || null,
        pricing_type: formData.pricing_type, is_negotiable: formData.is_negotiable ? 1 : 0,
        currency: formData.currency, billing_schedule: formData.billing_schedule || null,
        valid_from: formData.valid_from || null, valid_until: formData.valid_until || null,
        service_start_date: formData.service_start_date || null, service_end_date: formData.service_end_date || null,
        customer_notes: formData.customer_notes || null, admin_notes: formData.admin_notes || null,
        terms_and_conditions: formData.terms_and_conditions || null,
        payment_terms: formData.payment_terms || null, delivery_terms: formData.delivery_terms || null,
        shipping_address: formData.shipping_address || null, billing_address: formData.billing_address || null,
        billing_same_as_shipping: formData.billing_same_as_shipping ? 1 : 0,
        subtotal: totals.subtotalAfterItemDiscounts,
        discount: formData.discount, discount_percentage: formData.discount_percentage,
        tax: formData.tax, shipping_cost: formData.shipping_cost, total: totals.total,
        quote_items: formData.items.map(item => ({
          item_type: item.item_type, description: item.description,
          quantity: item.quantity, unit_of_measure: item.unit_of_measure,
          original_price: item.original_price, unit_price: item.unit_price,
          discount_amount: item.discount_amount, line_total: item.line_total,
          line_total_after_discount: item.line_total_after_discount,
          product_id: item.product_id, service_id: item.service_id,
          variant_details: item.variant_details ? JSON.stringify(item.variant_details) : null,
          labor_cost: item.labor_cost, material_cost: item.material_cost,
          estimated_hours: item.estimated_hours, hourly_rate: item.hourly_rate,
          estimated_duration: item.estimated_duration,
          scheduled_start_date: item.scheduled_start_date || null,
          scheduled_end_date: item.scheduled_end_date || null,
          requires_site_visit: item.requires_site_visit ? 1 : 0,
          lead_time: item.lead_time, pricing_notes: item.pricing_notes,
          prerequisites: item.prerequisites, notes: item.notes,
          is_bulk_pricing: item.is_bulk_pricing ? 1 : 0,
          is_negotiated_price: item.is_negotiated_price ? 1 : 0,
          is_taxable: item.is_taxable ? 1 : 0,
          availability_status: item.availability_status,
          display_order: item.display_order,
        })),
      });
      toast.success('Quote updated successfully');
      setHasChanges(false);
      navigate(`/admin/quotes/${id}`);
    } catch (error) {
      console.error('Update failed:', error);
      toast.error(error.response?.data?.message || 'Failed to update quote');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loadingCurrent) return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <LoadingSpinner size="lg" />
      </div>
    </AdminLayout>
  );

  if (!quote) return (
    <AdminLayout>
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <FileText size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#9ca3af', marginBottom: 20 }}>Quote not found</p>
        <Btn variant="ghost" onClick={() => navigate('/admin/quotes')} icon={<ChevronLeft size={16} />}>Back to Quotes</Btn>
      </div>
    </AdminLayout>
  );

  const canEdit = ['draft', 'pending', 'revised', 'approved', 'rejected', 'converted'].includes(quote.status);

  if (!canEdit) return (
    <AdminLayout>
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px' }}>
        <Panel>
          <div style={{ padding: '28px 28px', display: 'flex', gap: 16, alignItems: 'flex-start', background: 'rgba(245,158,11,0.04)' }}>
            <AlertTriangle size={24} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text,#111827)', marginBottom: 8 }}>Quote Cannot Be Edited</p>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
                This quote has status "{quote.status}" and cannot be edited.
              </p>
              <Btn variant="ghost" onClick={() => navigate(`/admin/quotes/${id}`)} icon={<ChevronLeft size={14} />}>View Quote Details</Btn>
            </div>
          </div>
        </Panel>
      </div>
    </AdminLayout>
  );

  const totals = calculateTotals();
  const hasZeroPriceItems = formData.items.some(item => parseFloat(item.unit_price) === 0);

  return (
    <AdminLayout>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .qe-panel { animation: fadeUp 0.3s ease both; }
        .qe-panel:nth-child(1){animation-delay:0.03s} .qe-panel:nth-child(2){animation-delay:0.07s}
        .qe-panel:nth-child(3){animation-delay:0.11s} .qe-panel:nth-child(4){animation-delay:0.15s}
        .qe-panel:nth-child(5){animation-delay:0.19s} .qe-panel:nth-child(6){animation-delay:0.23s}
        .qe-panel:nth-child(7){animation-delay:0.27s}

        .qe-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .qe-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .qe-grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
        .qe-main   { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }

        .qe-item-card { border-radius: 12px; border: 1px solid var(--border,#f3f4f6); overflow: hidden; transition: border-color 0.15s; }
        .qe-item-card:hover { border-color: ${purpleBd}; }

        @media (max-width: 1100px) { .qe-main { grid-template-columns: 1fr; } }
        @media (max-width: 768px)  { .qe-grid-3 { grid-template-columns: 1fr 1fr; } .qe-grid-4 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 520px)  { .qe-grid-2 { grid-template-columns: 1fr; } .qe-grid-3 { grid-template-columns: 1fr; } }

        .qe-item-fields { display: grid; grid-template-columns: 130px 1fr 90px 110px; gap: 10px; }
        @media (max-width: 768px) { .qe-item-fields { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 400px) { .qe-item-fields { grid-template-columns: 1fr; } }

        .qe-item-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
      `}</style>

      <div style={{ maxWidth: 1380, margin: '0 auto', padding: '24px 20px 100px' }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => navigate(`/admin/quotes/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, padding: 0, marginBottom: 12 }}>
            <ChevronLeft size={14} /> Back to Quote
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', color: purple, margin: 0 }}>
                  Edit · {quote.quote_number}
                </h1>
                <Pill color={statusColor[quote.status] || '#9ca3af'}>{quote.status}</Pill>
                <Pill color={priorityColor[quote.priority] || '#9ca3af'}>{quote.priority}</Pill>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 6 }}>
                {quote.customer?.first_name
                ? `${quote.customer.first_name} ${quote.customer.last_name ?? ''}`
                : quote.customer?.email || 'Unknown Customer'}
                {hasChanges && <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 700 }}>· Unsaved changes</span>}
              </p>
            </div>
          </div>
        </div>

        {/* ── Zero price warning ─────────────────────────────────── */}
        {hasZeroPriceItems && (
          <div className="qe-panel" style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderLeft: '4px solid #f59e0b', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: '0.83rem', fontWeight: 700, color: '#92400e', margin: '0 0 3px' }}>Items Need Pricing</p>
              <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0 }}>Some items have a unit price of zero. Please update pricing before saving.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="qe-main">

            {/* ── LEFT COLUMN ──────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Basic Information */}
              <Panel className="qe-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={Settings}>Basic Information</SectionLabel>
                </div>
                <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="qe-grid-3">
                    <Field label="Quote Type" required>
                      <StyledSelect value={formData.quote_type} onChange={e => handleChange('quote_type', e.target.value)} options={QUOTE_TYPE_OPTIONS} />
                    </Field>
                    <Field label="Status">
                      <StyledSelect value={formData.status} onChange={e => handleChange('status', e.target.value)} options={STATUS_OPTIONS} />
                    </Field>
                    <Field label="Priority">
                      <StyledSelect value={formData.priority} onChange={e => handleChange('priority', e.target.value)} options={PRIORITY_OPTIONS} />
                    </Field>
                  </div>
                  <div className="qe-grid-3">
                    <Field label="Pricing Type">
                      <StyledSelect value={formData.pricing_type} onChange={e => handleChange('pricing_type', e.target.value)} options={PRICING_TYPE_OPTIONS} />
                    </Field>
                    <Field label="Currency">
                      <StyledSelect value={formData.currency} onChange={e => handleChange('currency', e.target.value)} options={currencyOptionsFromDb.length ? currencyOptionsFromDb : [{ value: formData.currency, label: formData.currency }]} disabled={loadingCurrencies} />
                    </Field>
                    <Field label="Billing Schedule">
                      <StyledSelect value={formData.billing_schedule} onChange={e => handleChange('billing_schedule', e.target.value)} options={BILLING_OPTIONS} />
                    </Field>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    <Checkbox id="is_negotiable" checked={formData.is_negotiable} onChange={e => handleChange('is_negotiable', e.target.checked)} label="Price is negotiable" />
                    <div>
                      <Btn type="button" variant="ghost" size="sm" icon={<UserCheck size={14} />} onClick={() => setShowAssignModal(true)}>
                        {formData.assigned_to ? 'Change Assigned Admin' : 'Assign Admin'}
                      </Btn>
                      {formData.assigned_to && (
                        <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 5, fontWeight: 700 }}>✓ Admin assigned (ID: {formData.assigned_to})</p>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Dates */}
              <Panel className="qe-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={Calendar}>Dates</SectionLabel>
                </div>
                <div style={{ padding: '18px 22px' }}>
                  <div className="qe-grid-4">
                    <Field label="Valid From">
                      <StyledInput type="date" value={formData.valid_from} onChange={e => handleChange('valid_from', e.target.value)} />
                    </Field>
                    <Field label="Valid Until">
                      <StyledInput type="date" value={formData.valid_until} onChange={e => handleChange('valid_until', e.target.value)} />
                    </Field>
                    <Field label="Service Start">
                      <StyledInput type="date" value={formData.service_start_date} onChange={e => handleChange('service_start_date', e.target.value)} />
                    </Field>
                    <Field label="Service End">
                      <StyledInput type="date" value={formData.service_end_date} onChange={e => handleChange('service_end_date', e.target.value)} />
                    </Field>
                  </div>
                </div>
              </Panel>

              {/* Quote Items */}
              <Panel className="qe-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <SectionLabel icon={Package}>Quote Items · {formData.items.length}</SectionLabel>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Btn type="button" variant="ghost" size="sm" icon={<Package size={14} />} onClick={() => setShowProductSelector(true)}>Products</Btn>
                    <Btn type="button" variant="blue" size="sm" icon={<Wrench size={14} />} onClick={() => setShowServiceSelector(true)}>Services</Btn>
                    <select
                      onChange={e => { if (e.target.value) { setShowCustomModal({ type: e.target.value }); e.target.value = ''; } }}
                      style={{ ...iBase, width: 'auto', padding: '6px 10px', fontSize: '0.78rem' }}
                    >
                      <option value="">+ Custom Item</option>
                      <option value="product">Custom Product</option>
                      <option value="service">Custom Service</option>
                      <option value="fee">Fee / Charge</option>
                    </select>
                    <select
                      onChange={e => { if (e.target.value) { sortItems(e.target.value); e.target.value = ''; } }}
                      style={{ ...iBase, width: 'auto', padding: '6px 10px', fontSize: '0.78rem' }}
                    >
                      <option value="">Sort Items</option>
                      <option value="price-high">Price: High → Low</option>
                      <option value="price-low">Price: Low → High</option>
                      <option value="name">Name: A–Z</option>
                      <option value="type-services">Services First</option>
                      <option value="type-products">Products First</option>
                    </select>
                  </div>
                </div>

                <div style={{ padding: '16px 22px' }}>
                  {formData.items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px', border: `2px dashed ${purpleBd}`, borderRadius: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 16, background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <Package size={24} color={purple} style={{ opacity: 0.5 }} />
                      </div>
                      <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#9ca3af', marginBottom: 16 }}>No items added yet</p>
                      <Btn type="button" variant="ghost" icon={<Plus size={14} />} onClick={() => setShowProductSelector(true)}>Add First Item</Btn>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {formData.items.map((item, index) => {
                        const isExpanded  = expandedItems[index];
                        const isService   = item.item_type === 'service' || item.item_type === 'custom_service';
                        const isFee       = item.item_type === 'fee';
                        const unitOptions = isFee ? FEE_UNITS : isService ? SERVICE_UNITS : PRODUCT_UNITS;
                        const origPrice   = parseFloat(item.original_price) || 0;
                        const unitPrice   = parseFloat(item.unit_price) || 0;
                        const qty         = parseFloat(item.quantity) || 0;
                        const discAmt     = parseFloat(item.discount_amount) || 0;
                        const hasDiscount = Math.abs(discAmt) > 0.01;
                        const discPct     = origPrice > 0 ? ((discAmt / (origPrice * qty)) * 100).toFixed(1) : 0;
                        const itemName    = item.description || item.product_name || item.service_name || `Item ${index + 1}`;

                        return (
                          <div key={index} className="qe-item-card">
                            {/* Item header */}
                            <div style={{ padding: '12px 14px', background: 'var(--row-bg,rgba(249,250,251,0.6))' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                {/* Reorder arrows */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
                                  <button type="button" onClick={() => moveItem(index, 'up')} disabled={index === 0}
                                    style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', padding: 3, borderRadius: 5, color: '#9ca3af', opacity: index === 0 ? 0.3 : 1 }}>
                                    <ArrowUp size={13} />
                                  </button>
                                  <button type="button" onClick={() => moveItem(index, 'down')} disabled={index === formData.items.length - 1}
                                    style={{ background: 'none', border: 'none', cursor: index === formData.items.length - 1 ? 'not-allowed' : 'pointer', padding: 3, borderRadius: 5, color: '#9ca3af', opacity: index === formData.items.length - 1 ? 0.3 : 1 }}>
                                    <ArrowDown size={13} />
                                  </button>
                                </div>

                                {/* Type icon */}
                                <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: isFee ? 'rgba(107,114,128,0.08)' : isService ? 'rgba(59,130,246,0.08)' : purpleLt, border: `1px solid ${isFee ? 'rgba(107,114,128,0.2)' : isService ? 'rgba(59,130,246,0.2)' : purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                                  {isFee ? <Tag size={15} color="#6b7280" /> : isService ? <Wrench size={15} color="#3b82f6" /> : <Package size={15} color={purple} />}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {/* Row 1: name + price + actions */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                                    <div>
                                      <p style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 4px', wordBreak: 'break-word' }}>{itemName}</p>
                                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                        <Pill color={isFee ? '#6b7280' : isService ? '#3b82f6' : purple}>{ITEM_TYPE_OPTIONS.find(o => o.value === item.item_type)?.label || item.item_type}</Pill>
                                        {item.product_sku && <Pill color="#9ca3af">SKU: {item.product_sku}</Pill>}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                      <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text,#111827)', margin: 0 }}>{money(item.line_total_after_discount)}</p>
                                        {hasDiscount && (
                                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                                            <span style={{ textDecoration: 'line-through' }}>{money(item.line_total)}</span>
                                            <span style={{ marginLeft: 5, color: discAmt > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{discAmt > 0 ? `${Math.abs(discPct)}% off` : `${Math.abs(discPct)}% up`}</span>
                                          </p>
                                        )}
                                      </div>
                                      <button type="button" onClick={() => setExpandedItems(p => ({ ...p, [index]: !p[index] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#a855f7' }}>
                                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={25} />}
                                      </button>
                                      <button type="button" onClick={() => removeItem(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#ef4444' }}>
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Always-visible core fields */}
                                  <div className="qe-item-fields">
                                    <Field label="Type">
                                      <StyledSelect value={item.item_type} onChange={e => handleItemChange(index, 'item_type', e.target.value)} options={ITEM_TYPE_OPTIONS} />
                                    </Field>
                                    <Field label="Description" required>
                                      <StyledInput value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} placeholder="Item description" />
                                    </Field>
                                    <Field label="Quantity" required>
                                      <StyledInput type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} min="0.01" step="0.01" />
                                    </Field>
                                    <Field label="Unit">
                                      <StyledSelect value={item.unit_of_measure} onChange={e => handleItemChange(index, 'unit_of_measure', e.target.value)} options={unitOptions} />
                                    </Field>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Expanded section */}
                            {isExpanded && (
                              <div style={{ padding: '16px 14px', borderTop: `1px solid ${purpleBd}`, background: purpleLt, display: 'flex', flexDirection: 'column', gap: 16 }}>

                                {/* Pricing */}
                                <div>
                                  <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 10 }}>Pricing</p>
                                  <div className="qe-grid-3">
                                    <Field label="Original Price">
                                      <StyledInput type="number" value={item.original_price} onChange={e => handleItemChange(index, 'original_price', e.target.value)} min="0" step="0.01" prefix={cs} />
                                    </Field>
                                    <Field label="Unit Price" required>
                                      <StyledInput type="number" value={item.unit_price} onChange={e => handleItemChange(index, 'unit_price', e.target.value)} min="0" step="0.01" prefix={cs} />
                                    </Field>
                                    <StatCell label={discAmt > 0 ? 'Discount' : discAmt < 0 ? 'Markup' : 'Adjustment'} value={hasDiscount ? `${money(Math.abs(discAmt))} (${Math.abs(discPct)}%)` : '—'} accent={discAmt > 0} />
                                  </div>
                                  <div style={{ marginTop: 10 }}>
                                    <Field label="Pricing Notes">
                                      <StyledTextarea value={item.pricing_notes} onChange={e => handleItemChange(index, 'pricing_notes', e.target.value)} rows={2} placeholder="Special pricing notes…" />
                                    </Field>
                                  </div>
                                </div>

                                {/* Service details */}
                                {isService && (
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                    <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', marginBottom: 10 }}>Service Details</p>
                                    <div className="qe-grid-3">
                                      <Field label="Estimated Hours"><StyledInput type="number" value={item.estimated_hours || ''} onChange={e => handleItemChange(index, 'estimated_hours', e.target.value)} min="0" step="0.5" placeholder="Optional" /></Field>
                                      <Field label="Hourly Rate"><StyledInput type="number" value={item.hourly_rate || ''} onChange={e => handleItemChange(index, 'hourly_rate', e.target.value)} min="0" step="0.01" prefix={cs} placeholder="Optional" /></Field>
                                      <Field label="Duration Estimate"><StyledInput value={item.estimated_duration} onChange={e => handleItemChange(index, 'estimated_duration', e.target.value)} placeholder="e.g. 2–3 days" /></Field>
                                      <Field label="Labor Cost"><StyledInput type="number" value={item.labor_cost || ''} onChange={e => handleItemChange(index, 'labor_cost', e.target.value)} min="0" step="0.01" prefix={cs} placeholder="Optional" /></Field>
                                      <Field label="Material Cost"><StyledInput type="number" value={item.material_cost || ''} onChange={e => handleItemChange(index, 'material_cost', e.target.value)} min="0" step="0.01" prefix={cs} placeholder="Optional" /></Field>
                                      <Field label="Scheduled Start"><StyledInput type="date" value={item.scheduled_start_date} onChange={e => handleItemChange(index, 'scheduled_start_date', e.target.value)} /></Field>
                                      <Field label="Scheduled End"><StyledInput type="date" value={item.scheduled_end_date} onChange={e => handleItemChange(index, 'scheduled_end_date', e.target.value)} /></Field>
                                    </div>
                                    <div style={{ marginTop: 10 }}>
                                      <Checkbox id={`site_${index}`} checked={item.requires_site_visit} onChange={e => handleItemChange(index, 'requires_site_visit', e.target.checked)} label="Requires site visit" />
                                    </div>
                                  </div>
                                )}

                                {/* Lead time + availability */}
                                <div className="qe-grid-2">
                                  {!isFee && (
                                    <Field label="Lead Time" hint="Expected delivery or completion time">
                                      <StyledInput value={item.lead_time || ''} onChange={e => handleItemChange(index, 'lead_time', e.target.value)} placeholder="e.g. 2–3 business days" />
                                    </Field>
                                  )}
                                  <Field label="Availability">
                                    <StyledSelect value={item.availability_status} onChange={e => handleItemChange(index, 'availability_status', e.target.value)} options={AVAILABILITY_OPTIONS} />
                                  </Field>
                                </div>

                                {/* Variant details (products only) */}
                                {!isService && (
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(249,250,251,0.8)', border: '1px solid var(--border,#f3f4f6)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                      <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', margin: 0 }}>Variant Details</p>
                                      <button type="button" onClick={() => addVariantField(index)} style={{ fontSize: '0.75rem', color: purple, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>+ Add Attribute</button>
                                    </div>
                                    {Object.keys(item.variant_details || {}).length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {Object.entries(item.variant_details || {}).map(([key, val]) => (
                                          <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input value={key} disabled style={{ ...iBase, flex: 1, opacity: 0.6 }} />
                                            <input value={val ?? ''} onChange={e => handleVariantChange(index, key, e.target.value)} style={{ ...iBase, flex: 1 }} onFocus={fIn} onBlur={fOut} />
                                            <button type="button" onClick={() => removeVariantField(index, key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: '#ef4444' }}><X size={14} /></button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>No variants. Click "Add Attribute" to add one.</p>
                                    )}
                                  </div>
                                )}

                                {/* Notes & prerequisites */}
                                <div className="qe-grid-2">
                                  <Field label="Prerequisites">
                                    <StyledTextarea value={item.prerequisites} onChange={e => handleItemChange(index, 'prerequisites', e.target.value)} rows={2} placeholder="Requirements before work begins…" />
                                  </Field>
                                  <Field label="Notes">
                                    <StyledTextarea value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)} rows={2} placeholder="Additional notes about this item…" />
                                  </Field>
                                </div>

                                {/* Checkboxes */}
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                  <Checkbox id={`bulk_${index}`} checked={item.is_bulk_pricing} onChange={e => handleItemChange(index, 'is_bulk_pricing', e.target.checked)} label="Bulk Pricing" />
                                  <Checkbox id={`neg_${index}`} checked={item.is_negotiated_price} onChange={e => handleItemChange(index, 'is_negotiated_price', e.target.checked)} label="Negotiated Price" />
                                  <Checkbox id={`tax_${index}`} checked={item.is_taxable} onChange={e => handleItemChange(index, 'is_taxable', e.target.checked)} label="Taxable" />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Panel>

              {/* Terms & Notes */}
              <Panel className="qe-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={FileText}>Terms & Notes</SectionLabel>
                </div>
                <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Terms & Conditions"><StyledTextarea value={formData.terms_and_conditions} onChange={e => handleChange('terms_and_conditions', e.target.value)} rows={4} placeholder="Terms and conditions…" /></Field>
                  <div className="qe-grid-2">
                    <Field label="Payment Terms"><StyledTextarea value={formData.payment_terms} onChange={e => handleChange('payment_terms', e.target.value)} rows={2} placeholder="Payment terms…" /></Field>
                    <Field label="Delivery Terms"><StyledTextarea value={formData.delivery_terms} onChange={e => handleChange('delivery_terms', e.target.value)} rows={2} placeholder="Delivery terms…" /></Field>
                  </div>
                  <Field label="Customer Notes"><StyledTextarea value={formData.customer_notes} onChange={e => handleChange('customer_notes', e.target.value)} rows={3} placeholder="Notes visible to customer…" /></Field>
                  <div>
                    <FieldLabel>Admin Notes (Internal)</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <ShieldCheck size={14} color={purple} style={{ position: 'absolute', left: 12, top: 12, pointerEvents: 'none' }} />
                      <textarea value={formData.admin_notes} onChange={e => handleChange('admin_notes', e.target.value)} rows={3} placeholder="Internal notes only visible to admins…"
                        style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, paddingLeft: 32, background: purpleLt, borderColor: purpleBd }}
                        onFocus={fIn} onBlur={fOut}
                      />
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Addresses */}
              <Panel className="qe-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={MapPin}>Addresses</SectionLabel>
                </div>
                <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Shipping Address">
                    <StyledTextarea value={formData.shipping_address} onChange={e => handleChange('shipping_address', e.target.value)} rows={3} placeholder="Shipping address…" />
                  </Field>
                  <Checkbox id="billing_same" checked={formData.billing_same_as_shipping} onChange={e => handleChange('billing_same_as_shipping', e.target.checked)} label="Billing address same as shipping" />
                  {!formData.billing_same_as_shipping && (
                    <Field label="Billing Address">
                      <StyledTextarea value={formData.billing_address} onChange={e => handleChange('billing_address', e.target.value)} rows={3} placeholder="Billing address…" />
                    </Field>
                  )}
                </div>
              </Panel>
            </div>

            {/* ── RIGHT COLUMN ─────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>

              {/* Financial Summary */}
              <Panel className="qe-panel" accent>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={DollarSign}>Financial Summary</SectionLabel>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Summary rows */}
                  {[
                    { label: 'Subtotal (Original)',          value: money(totals.originalTotal),              show: true },
                    { label: 'Item Discounts',               value: `-${money(totals.itemDiscounts)}`,        show: totals.itemDiscounts > 0, color: '#10b981' },
                    { label: 'After Item Discounts',         value: money(totals.subtotalAfterItemDiscounts), show: totals.itemDiscounts > 0, divider: true },
                  ].filter(r => r.show).map(({ label, value, color, divider }) => (
                    <div key={label} style={{ paddingTop: divider ? 8 : 0, borderTop: divider ? '1px solid var(--border,#f3f4f6)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{label}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'var(--text,#111827)' }}>{value}</span>
                          {showKes && <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontStyle: 'italic', margin: '1px 0 0' }}>{kesMoney(toKes(parseFloat(value.replace(/[^0-9.-]/g, ''))))}</p>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Quote-level discount */}
                  <div style={{ paddingTop: 10, borderTop: '1px solid var(--border,#f3f4f6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Quote Discount</span>
                      <button type="button" onClick={() => setUseDiscountPct(!useDiscountPct)} style={{ fontSize: '0.7rem', color: purple, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {useDiscountPct ? 'Switch to amount' : 'Switch to %'}
                      </button>
                    </div>
                    {useDiscountPct ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <StyledInput type="number" value={formData.discount_percentage} onChange={e => handleChange('discount_percentage', e.target.value)} min="0" max="100" step="0.1" placeholder="0" />
                        </div>
                        <Percent size={15} color="#9ca3af" />
                      </div>
                    ) : (
                      <StyledInput type="number" value={formData.discount} onChange={e => handleChange('discount', e.target.value)} min="0" step="0.01" prefix={cs} />
                    )}
                  </div>

                  {/* Tax */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Tax (VAT)</span>
                      <button type="button" onClick={() => handleChange('tax', totals.subtotalAfterAllDiscounts * 0.16)}
                        style={{ fontSize: '0.7rem', color: purple, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Apply 16%
                      </button>
                    </div>
                    <StyledInput type="number" value={formData.tax} onChange={e => handleChange('tax', e.target.value)} min="0" step="0.01" prefix={cs} />
                  </div>

                  {/* Shipping */}
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 6 }}>Shipping</span>
                    <StyledInput type="number" value={formData.shipping_cost} onChange={e => handleChange('shipping_cost', e.target.value)} min="0" step="0.01" prefix={cs} />
                  </div>

                  {/* Total savings */}
                  {totals.totalSavings > 0 && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#065f46' }}>Total Savings</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#10b981' }}>-{money(totals.totalSavings)}</span>
                    </div>
                  )}

                  {/* Grand total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '2px solid var(--border,#e5e7eb)', marginTop: 4 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text,#111827)' }}>Total</span>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '1.2rem', fontWeight: 900, color: purple, margin: 0 }}>{money(totals.total)}</p>
                      {showKes && <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic', margin: '2px 0 0' }}>{kesMoney(toKes(totals.total))}</p>}
                    </div>
                  </div>

                  {showKes && selectedCurrency && (
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontStyle: 'italic', textAlign: 'right', marginTop: 2 }}>
                      1 {formData.currency} = {fmt(exchangeRateToKes, 4)} KES{selectedCurrency.updated_at ? ` · ${new Date(selectedCurrency.updated_at).toLocaleDateString()}` : ''}
                    </p>
                  )}
                </div>
              </Panel>

              {/* Item count summary */}
              {formData.items.length > 0 && (
                <Panel className="qe-panel">
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <StatCell label="Items" value={formData.items.length} />
                      <StatCell label="Products" value={formData.items.filter(i => i.item_type === 'product' || i.item_type === 'custom_product').length} />
                      <StatCell label="Services" value={formData.items.filter(i => i.item_type === 'service' || i.item_type === 'custom_service').length} accent />
                    </div>
                  </div>
                </Panel>
              )}
            </div>
          </div>

          {/* ── Sticky footer ──────────────────────────────────────── */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'var(--panel-bg,white)', borderTop: '1px solid var(--border,#e5e7eb)',
            padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
          }}>
            {hasChanges && <p style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700, alignSelf: 'center', marginRight: 'auto' }}>• Unsaved changes</p>}
            <Btn type="button" variant="outline" onClick={() => { if (hasChanges && !window.confirm('Discard unsaved changes?')) return; navigate(`/admin/quotes/${id}`); }} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="submit" disabled={saving || formData.items.length === 0} icon={saving ? <LoadingSpinner size="sm" /> : <Save size={15} />}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        </form>
      </div>

      {showProductSelector && <ProductSelectorModal onClose={() => setShowProductSelector(false)} onSelect={handleProductsSelected} excludeIds={formData.items.filter(i => i.product_id).map(i => i.product_id)} />}
      {showServiceSelector && <ServiceSelectorModal onClose={() => setShowServiceSelector(false)} onSelect={handleServicesSelected} excludeIds={formData.items.filter(i => i.service_id).map(i => i.service_id)} />}
      {showCustomModal && <CustomItemModal type={showCustomModal.type} onClose={() => setShowCustomModal(null)} onSave={handleCustomItemCreated} />}
      {showPricingModal && <PricingValidationModal errors={pricingErrors} onClose={() => setShowPricingModal(false)} currencySymbol={displayCurrency} />}
      {showAssignModal && <AssignModal onClose={() => setShowAssignModal(false)} onAssign={handleAssign} currentAssignedId={formData.assigned_to} />}
    </AdminLayout>
  );
};

export default QuoteEdit;