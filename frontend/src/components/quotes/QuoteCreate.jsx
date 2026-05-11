import React, { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, Save, AlertCircle, Package, Wrench, Tag, Layers,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Percent, UserCheck,
  DollarSign, Calendar, FileText, MapPin, ShieldCheck, Settings,
  CheckCircle, AlertTriangle, Info,
} from 'lucide-react';
import ProductSelectorModalAdmin from './request-wizard/ProductSelectorModalAdmin';
import ServiceSelectorModalAdmin from './request-wizard/ServiceSelectorModalAdmin';
import CustomItemModal from './request-wizard/CustomItemModal';
import PricingValidationModal from './PricingValidationModal';
import AssignModal from './AssignModal';
import CustomerSelectorModal from '../admin/CustomerSelectorModal';
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

const StyledSelect = ({ value, onChange, options, disabled, placeholder }) => (
  <select
    value={value} onChange={onChange} disabled={disabled}
    style={{ ...iBase, appearance: 'auto', cursor: disabled ? 'not-allowed' : 'pointer' }}
    onFocus={fIn} onBlur={fOut}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const StyledTextarea = ({ value, onChange, rows = 3, placeholder, accent }) => (
  <textarea
    value={value} onChange={onChange} rows={rows} placeholder={placeholder}
    style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, ...(accent ? { background: purpleLt, borderColor: purpleBd } : {}) }}
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
const QUOTE_TYPE_OPTIONS   = [{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }, { value: 'mixed', label: 'Mixed' }];
const STATUS_OPTIONS       = [{ value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'revised', label: 'Revised' }];
const PRIORITY_OPTIONS     = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }];
const PRICING_TYPE_OPTIONS = [{ value: 'standard', label: 'Standard' }, { value: 'bulk', label: 'Bulk' }, { value: 'negotiated', label: 'Negotiated' }, { value: 'custom', label: 'Custom' }];
const BILLING_OPTIONS      = [{ value: '', label: 'Not specified' }, { value: 'one_time', label: 'One Time' }, { value: 'milestone_based', label: 'Milestone Based' }, { value: 'monthly', label: 'Monthly' }, { value: 'hourly', label: 'Hourly' }, { value: 'fixed_price', label: 'Fixed Price' }];
const ITEM_TYPE_OPTIONS    = [{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }, { value: 'custom_product', label: 'Custom Product' }, { value: 'custom_service', label: 'Custom Service' }, { value: 'fee', label: 'Fee' }];
const AVAILABILITY_OPTIONS = [{ value: 'in_stock', label: 'In Stock' }, { value: 'available', label: 'Available' }, { value: 'out_of_stock', label: 'Out of Stock' }, { value: 'special_order', label: 'Special Order' }, { value: 'on_request', label: 'On Request' }];
const PRODUCT_UNITS = [{ value: 'each', label: 'Each' }, { value: 'unit', label: 'Unit' }, { value: 'piece', label: 'Piece' }, { value: 'box', label: 'Box' }, { value: 'pack', label: 'Pack' }, { value: 'set', label: 'Set' }, { value: 'dozen', label: 'Dozen' }, { value: 'kg', label: 'Kilogram' }, { value: 'g', label: 'Gram' }, { value: 'liter', label: 'Liter' }, { value: 'ml', label: 'Milliliter' }, { value: 'meter', label: 'Meter' }, { value: 'cm', label: 'Centimeter' }, { value: 'sqm', label: 'Sq Meter' }, { value: 'sqft', label: 'Sq Foot' }];
const SERVICE_UNITS = [{ value: 'hour', label: 'Hour' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'session', label: 'Session' }, { value: 'visit', label: 'Visit' }, { value: 'project', label: 'Project' }, { value: 'job', label: 'Job' }, { value: 'each', label: 'Each' }];
const FEE_UNITS     = [{ value: 'one-time', label: 'One-Time' }, { value: 'per_transaction', label: 'Per Transaction' }, { value: 'per_user', label: 'Per User' }, { value: 'per_month', label: 'Per Month' }, { value: 'per_year', label: 'Per Year' }, { value: 'per_project', label: 'Per Project' }, { value: 'per_item', label: 'Per Item' }, { value: 'percentage', label: 'Percentage' }, { value: 'flat_rate', label: 'Flat Rate' }, { value: 'each', label: 'Each' }];

const fmt   = (n, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));
const fmtRate = (n) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(n || 0));

// ─── Main component ───────────────────────────────────────────────────────────
const QuoteCreate = ({ isOpen, onClose, onSuccess, prefilledData = null, customers = [] }) => {
  const [loading,             setLoading]             = useState(false);
  const [currencyOptions,     setCurrencyOptions]     = useState([]);
  const [loadingCurrencies,   setLoadingCurrencies]   = useState(false);
  const [useDiscountPct,      setUseDiscountPct]      = useState(true);
  const [expandedItems,       setExpandedItems]       = useState({});
  const [showPricingModal,    setShowPricingModal]    = useState(false);
  const [pricingErrors,       setPricingErrors]       = useState([]);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showServiceSelector, setShowServiceSelector] = useState(false);
  const [showCustomModal,     setShowCustomModal]     = useState(null);
  const [showAssignModal,     setShowAssignModal]     = useState(false);
  const [showCustomerModal,   setShowCustomerModal]  = useState(false);
  const [selectedCustomer,    setSelectedCustomer]   = useState(null);

  const [formData, setFormData] = useState({
    customer_id: '', quote_type: 'mixed', status: 'pending', priority: 'medium', assigned_to: null,
    valid_from: '', valid_until: '', service_start_date: '', service_end_date: '',
    pricing_type: 'standard', is_negotiable: false, currency: 'KES', billing_schedule: '',
    discount: 0, discount_percentage: 0, tax: 0, shipping_cost: 0,
    customer_notes: '', admin_notes: '',
    terms_and_conditions: 'Please review and accept these terms before proceeding.',
    payment_terms: 'Payment due within 30 days of quote acceptance',
    delivery_terms: 'Delivery within 5-7 business days upon payment confirmation',
    shipping_address: '', billing_address: '', billing_same_as_shipping: true,
    items: [],
  });

  // ── Prefill from request ──────────────────────────────────────────────────
  useEffect(() => {
    if (!prefilledData) return;
    const items = (prefilledData.items || []).map((item, i) => {
      const orig = parseFloat(item.unit_price) || 0;
      return {
        item_type: item.type || item.item_type || 'product',
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 1,
        unit_of_measure: item.unit_of_measure || 'each',
        budget_per_unit: item.budget_per_unit ?? null,
        original_price: orig, unit_price: orig,
        discount_amount: 0, line_total: orig * (parseFloat(item.quantity) || 1),
        line_total_after_discount: orig * (parseFloat(item.quantity) || 1),
        variant_details: item.variant_details || null,
        lead_time: item.lead_time || '',
        labor_cost: item.labor_cost != null ? parseFloat(item.labor_cost) : null,
        material_cost: item.material_cost != null ? parseFloat(item.material_cost) : null,
        estimated_duration: item.estimated_duration || '',
        estimated_hours: item.estimated_hours != null ? parseFloat(item.estimated_hours) : null,
        hourly_rate: item.hourly_rate != null ? parseFloat(item.hourly_rate) : null,
        requires_site_visit: !!item.requires_site_visit,
        scheduled_start_date: item.scheduled_start_date || '',
        scheduled_end_date: item.scheduled_end_date || '',
        notes: item.notes || '', pricing_notes: '', prerequisites: '',
        is_bulk_pricing: false, is_negotiated_price: false, is_taxable: true,
        availability_status: 'available', display_order: i,
        product_id: item.product_id || null, service_id: item.service_id || null,
      };
    });
    const assignedId = typeof prefilledData?.assigned_to === 'object' ? prefilledData?.assigned_to?.id : prefilledData?.assigned_to;
    setFormData(prev => ({
      ...prev,
      customer_id: prefilledData.customer_id || '',
      quote_type: prefilledData.request_type || 'mixed',
      priority: prefilledData.priority || 'medium',
      customer_notes: prefilledData.customer_notes || '',
      admin_notes: `${prefilledData.admin_notes || ''}\nCreated from quote request #${prefilledData.request_number}`.trim(),
      assigned_to: assignedId ?? prev.assigned_to,
      shipping_address: prefilledData.delivery_location || '',
      billing_address: prefilledData.delivery_location || '',
      items,
    }));
  }, [prefilledData]);

  // ── Load currencies ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingCurrencies(true);
      try {
        const data = await currencyAPI.getCurrencies();
        const active = (data || []).filter(c => c.is_active).map(c => ({
          value: c.code, label: `${c.name} (${c.code})`, symbol: c.symbol,
          is_base: c.is_base, conversion_rate: Number(c.conversion_rate),
          anchor_rate: Number(c.anchor_rate), updated_at: c.updated_at ?? null,
        }));
        setCurrencyOptions(active);
        const exists = active.some(c => c.value === formData.currency);
        if (!exists) {
          const base = active.find(c => c.is_base);
          setFormData(prev => ({ ...prev, currency: base?.value || active[0]?.value || 'KES' }));
        }
      } catch { toast.error('Failed to load currencies'); }
      finally { setLoadingCurrencies(false); }
    };
    load();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const selectedCurrency = currencyOptions.find(c => c.value === formData.currency);
  const isBaseCurrency   = !!selectedCurrency?.is_base || formData.currency === 'KES';
  const exchangeRate     = !isBaseCurrency ? Number(selectedCurrency?.conversion_rate || 0) : 0;
  const showKes          = !isBaseCurrency && exchangeRate > 0;
  const csMap            = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
  const cs               = csMap[formData.currency] || formData.currency;
  const money            = (v) => `${cs} ${fmt(v)}`;
  const kesMoney         = (v) => `KSh ${fmt(v)}`;
  const toKes            = (v) => Number(v || 0) * exchangeRate;

  const calculateSubtotal = () =>
    formData.items.reduce((s, i) => s + (parseFloat(i.line_total_after_discount) || 0), 0);

  const calculateTotalItemDiscounts = () =>
    formData.items.reduce((s, i) => s + (parseFloat(i.discount_amount) || 0), 0);

  const calculateTotals = () => {
    const originalTotal              = formData.items.reduce((s, i) => s + (parseFloat(i.line_total) || 0), 0);
    const itemDiscounts              = calculateTotalItemDiscounts();
    const subtotalAfterItemDiscounts = calculateSubtotal();
    const quoteDiscount              = parseFloat(formData.discount) || 0;
    const subtotalAfterAllDiscounts  = subtotalAfterItemDiscounts - quoteDiscount;
    const tax                        = parseFloat(formData.tax) || 0;
    const shipping                   = parseFloat(formData.shipping_cost) || 0;
    const total                      = subtotalAfterAllDiscounts + tax + shipping;
    const totalSavings               = itemDiscounts + quoteDiscount;
    return { originalTotal, itemDiscounts, subtotalAfterItemDiscounts, quoteDiscount, subtotalAfterAllDiscounts, tax, shipping, total, totalSavings };
  };

  const calculateItemPricing = (item) => {
    const qty  = parseFloat(item.quantity) || 0;
    const orig = parseFloat(item.original_price) || 0;
    const unit = parseFloat(item.unit_price) || 0;
    return { line_total: qty * orig, discount_amount: (orig - unit) * qty, line_total_after_discount: qty * unit };
  };

  const validatePricing = () => {
    const errors = [];
    formData.items.forEach((item, i) => {
      const o = parseFloat(item.original_price) || 0;
      const u = parseFloat(item.unit_price) || 0;
      const desc = item.description || `Item ${i + 1}`;

      if (o === 0 || u === 0) {
        errors.push({ itemIndex: i, itemDescription: desc, originalPrice: o, unitPrice: u });
      } else if (o > 0 && u < o) {
        const discountPct = ((o - u) / o) * 100;
        if (discountPct > 50) {
          errors.push({
            itemIndex: i, itemDescription: desc, originalPrice: o, unitPrice: u,
            issueType: 'high_discount', discount_percent: discountPct,
          });
        }
      } else if (u > o) {
        const markupPct = ((u - o) / o) * 100;
        if (markupPct > 50) {
          errors.push({
            itemIndex: i, itemDescription: desc, originalPrice: o, unitPrice: u,
            issueType: 'high_markup', markup_percent: markupPct,
          });
        }
      }
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
      if (field === 'discount') { const sub = calculateSubtotal(); if (sub > 0) next.discount_percentage = ((parseFloat(value || 0) / sub) * 100).toFixed(3); }
      return next;
    });
  };

  const handleItemChange = (index, field, value) => {
    const items = [...formData.items];
    items[index] = { ...items[index], [field]: value };
    if (['quantity', 'original_price', 'unit_price'].includes(field)) {
      Object.assign(items[index], calculateItemPricing(items[index]));
    }
    if (field === 'item_type') items[index].unit_of_measure = (value === 'service' || value === 'custom_service') ? 'hour' : 'each';
    setFormData(prev => ({ ...prev, items }));
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
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    toast.success('Item removed');
  };

  const moveItem = (index, dir) => {
    const items = [...formData.items];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    items.forEach((item, idx) => { item.display_order = idx; });
    setFormData(prev => ({ ...prev, items }));
  };

  const sortItems = (by) => {
    const items = [...formData.items];
    if (by === 'alphabetical') items.sort((a, b) => (a.description || '').localeCompare(b.description || ''));
    else if (by === 'price_high') items.sort((a, b) => (b.unit_price || 0) - (a.unit_price || 0));
    else if (by === 'price_low')  items.sort((a, b) => (a.unit_price || 0) - (b.unit_price || 0));
    else if (by === 'products_first') { const o = { product: 1, custom_product: 2, service: 3, custom_service: 4, fee: 5 }; items.sort((a, b) => (o[a.item_type] || 9) - (o[b.item_type] || 9)); }
    else if (by === 'services_first') { const o = { service: 1, custom_service: 2, product: 3, custom_product: 4, fee: 5 }; items.sort((a, b) => (o[a.item_type] || 9) - (o[b.item_type] || 9)); }
    else return;
    items.forEach((item, idx) => { item.display_order = idx; });
    setFormData(prev => ({ ...prev, items }));
    toast.success('Items sorted');
  };

  const handleProductsSelected = (products) => {
    const existingIds = formData.items.filter(i => i.product_id).map(i => i.product_id);
    const fresh = products.filter(p => !existingIds.includes(p.id));
    if (!fresh.length) { toast.error('All selected products are already in the list'); setShowProductSelector(false); return; }
    const maxOrder = formData.items.length > 0 ? Math.max(...formData.items.map(i => i.display_order || 0)) : -1;
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, ...fresh.map((p, idx) => {
        const price = parseFloat(p.price) || 0;
        return { item_type: 'product', description: p.name, quantity: 1, unit_of_measure: 'each', original_price: price, unit_price: price, discount_amount: 0, line_total: price, line_total_after_discount: price, variant_details: null, labor_cost: null, material_cost: null, estimated_duration: '', estimated_hours: null, hourly_rate: null, scheduled_start_date: '', scheduled_end_date: '', lead_time: '', requires_site_visit: false, notes: '', pricing_notes: '', prerequisites: '', is_bulk_pricing: false, is_negotiated_price: false, is_taxable: true, availability_status: 'available', display_order: maxOrder + idx + 1, product_id: p.id, service_id: null };
      })],
    }));
    toast.success(`Added ${fresh.length} product${fresh.length > 1 ? 's' : ''}`);
    setShowProductSelector(false);
  };

  const handleServicesSelected = (services) => {
    const existingIds = formData.items.filter(i => i.service_id).map(i => i.service_id);
    const fresh = services.filter(s => !existingIds.includes(s.id));
    if (!fresh.length) { toast.error('All selected services are already in the list'); setShowServiceSelector(false); return; }
    const maxOrder = formData.items.length > 0 ? Math.max(...formData.items.map(i => i.display_order || 0)) : -1;
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, ...fresh.map((s, idx) => {
        const price = parseFloat(s.price) || 0;
        return { item_type: 'service', description: s.name, quantity: 1, unit_of_measure: 'hour', original_price: price, unit_price: price, discount_amount: 0, line_total: price, line_total_after_discount: price, variant_details: null, labor_cost: null, material_cost: null, estimated_duration: '', estimated_hours: null, hourly_rate: null, scheduled_start_date: '', scheduled_end_date: '', lead_time: '', requires_site_visit: false, notes: '', pricing_notes: '', prerequisites: '', is_bulk_pricing: false, is_negotiated_price: false, is_taxable: true, availability_status: 'available', display_order: maxOrder + idx + 1, product_id: null, service_id: s.id };
      })],
    }));
    toast.success(`Added ${fresh.length} service${fresh.length > 1 ? 's' : ''}`);
    setShowServiceSelector(false);
  };

  const handleCustomItemCreated = (customItem) => {
    const isService = customItem.type === 'service';
    const isFee = customItem.type === 'fee';
    const qty = parseFloat(customItem.quantity) || 1;
    const price = parseFloat(customItem.price) || 0;
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        item_type: isFee ? 'fee' : `custom_${customItem.type}`,
        description: customItem.name || '', quantity: qty,
        unit_of_measure: customItem.unit_of_measure || (isService ? 'hour' : isFee ? 'one-time' : 'each'),
        original_price: price, unit_price: price, discount_amount: 0,
        line_total: qty * price, line_total_after_discount: qty * price,
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
    toast.success('Custom item added');
  };

  const handleAssign = (adminId) => {
    setFormData(prev => ({ ...prev, assigned_to: adminId }));
    setShowAssignModal(false);
    toast.success('Admin assigned');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_id) { toast.error('Please select a customer'); return; }
    if (!formData.items.length) { toast.error('Please add at least one item'); return; }
    if (formData.valid_from && formData.valid_until && new Date(formData.valid_from) >= new Date(formData.valid_until)) { toast.error('Valid Until must be after Valid From'); return; }
    if (formData.service_start_date && formData.service_end_date && new Date(formData.service_start_date) >= new Date(formData.service_end_date)) { toast.error('Service End must be after Service Start'); return; }
    const errors = validatePricing();
    if (errors.length > 0) { setPricingErrors(errors); setShowPricingModal(true); return; }

    setLoading(true);
    try {
      const { subtotalAfterItemDiscounts: subtotal, tax, total } = calculateTotals();
      await onSuccess({
        quote_request_id: prefilledData?.id || null,
        customer_id: formData.customer_id,
        quote_type: formData.quote_type, status: formData.status, priority: formData.priority,
        assigned_to: formData.assigned_to || null,
        pricing_type: formData.pricing_type, is_negotiable: formData.is_negotiable ? 1 : 0,
        currency: formData.currency, billing_schedule: formData.billing_schedule || null,
        valid_from: formData.valid_from || null, valid_until: formData.valid_until || null,
        service_start_date: formData.service_start_date || null, service_end_date: formData.service_end_date || null,
        customer_notes: formData.customer_notes, admin_notes: formData.admin_notes,
        terms_and_conditions: formData.terms_and_conditions,
        payment_terms: formData.payment_terms, delivery_terms: formData.delivery_terms,
        shipping_address: formData.shipping_address, billing_address: formData.billing_address,
        billing_same_as_shipping: formData.billing_same_as_shipping ? 1 : 0,
        subtotal, tax,
        discount: parseFloat(formData.discount) || 0,
        discount_percentage: parseFloat(formData.discount_percentage) || 0,
        shipping_cost: parseFloat(formData.shipping_cost) || 0,
        total,
        quote_items: formData.items.map(item => ({
          item_type: item.item_type, description: item.description,
          quantity: parseFloat(item.quantity), unit_of_measure: item.unit_of_measure,
          original_price: parseFloat(item.original_price) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          discount_amount: parseFloat(item.discount_amount) || 0,
          line_total: parseFloat(item.line_total) || 0,
          line_total_after_discount: parseFloat(item.line_total_after_discount) || 0,
          variant_details: item.variant_details,
          labor_cost: item.labor_cost ? parseFloat(item.labor_cost) : null,
          material_cost: item.material_cost ? parseFloat(item.material_cost) : null,
          estimated_duration: item.estimated_duration || null,
          estimated_hours: item.estimated_hours ? parseFloat(item.estimated_hours) : null,
          hourly_rate: item.hourly_rate,
          scheduled_start_date: item.scheduled_start_date || null,
          scheduled_end_date: item.scheduled_end_date || null,
          lead_time: item.lead_time,
          requires_site_visit: item.requires_site_visit ? 1 : 0,
          notes: item.notes, pricing_notes: item.pricing_notes,
          prerequisites: item.prerequisites,
          is_bulk_pricing: item.is_bulk_pricing ? 1 : 0,
          is_negotiated_price: item.is_negotiated_price ? 1 : 0,
          is_taxable: item.is_taxable ? 1 : 0,
          availability_status: item.availability_status,
          display_order: item.display_order,
          product_id: item.product_id, service_id: item.service_id,
        })),
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create quote');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totals = calculateTotals();
  const isFromRequest = !!prefilledData;
  const hasZeroPriceItems = formData.items.some(item => !item.unit_price || item.unit_price === 0);

  return (
    <>
      <style>{`
        @keyframes qcFadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes qcSlideUp { from { opacity:0; transform:translateY(20px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes qcFadeUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .qc-overlay  { animation: qcFadeIn  0.2s ease both; }
        .qc-modal    { animation: qcSlideUp 0.25s ease both; }
        .qc-panel    { animation: qcFadeUp  0.25s ease both; }
        .qc-panel:nth-child(1){animation-delay:0.04s} .qc-panel:nth-child(2){animation-delay:0.08s}
        .qc-panel:nth-child(3){animation-delay:0.12s} .qc-panel:nth-child(4){animation-delay:0.16s}
        .qc-panel:nth-child(5){animation-delay:0.20s}

        .qc-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .qc-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
        .qc-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
        .qc-body   { display:grid; grid-template-columns:1fr 320px; gap:20px; align-items:start; }
        .qc-item-card { border-radius:12px; border:1px solid var(--border,#f3f4f6); overflow:hidden; transition:border-color 0.15s; }
        .qc-item-card:hover { border-color:${purpleBd}; }

        @media (max-width:1024px) { .qc-body { grid-template-columns:1fr; } }
        @media (max-width:768px)  { .qc-grid-3 { grid-template-columns:1fr 1fr; } .qc-grid-4 { grid-template-columns:1fr 1fr; } }
        @media (max-width:520px)  { .qc-grid-2 { grid-template-columns:1fr; } .qc-grid-3 { grid-template-columns:1fr; } }
      `}</style>

      {/* Backdrop */}
      <div className="qc-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }} onClick={onClose}>

        {/* Modal */}
        <div className="qc-modal" style={{ width: '100%', maxWidth: 1400, height: 'calc(100vh - 40px)', maxHeight: 960, background: 'var(--panel-bg,white)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 100px rgba(0,0,0,0.25)', position: 'relative', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

          {/* Modal header */}
          <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: purpleLt, flexShrink: 0 }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: purple, margin: 0 }}>
                {isFromRequest ? 'Create Quote from Request' : 'Create New Quote'}
              </h2>
              {isFromRequest && prefilledData?.request_number && (
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>Request #{prefilledData.request_number}</p>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#9ca3af', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* Modal body */}
          <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto' }}>
            <form onSubmit={handleSubmit}>
              <div className="qc-body">

                {/* ── LEFT COLUMN ────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* Zero price warning */}
                  {hasZeroPriceItems && (
                    <div className="qc-panel" style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderLeft: '4px solid #f59e0b', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <p style={{ fontSize: '0.83rem', fontWeight: 700, color: '#92400e', margin: '0 0 2px' }}>Items Need Pricing</p>
                        <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0 }}>Some items have a zero unit price. Please update before creating.</p>
                      </div>
                    </div>
                  )}

                  {/* Basic Information */}
                  <Panel className="qc-panel">
                    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                      <SectionLabel icon={Settings}>Basic Information</SectionLabel>
                    </div>
                    <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {!isFromRequest && (
                        <Field label="Customer" required>
                          <button type="button" onClick={() => setShowCustomerModal(true)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '9px 14px', borderRadius: 9, fontSize: '0.83rem', fontWeight: 600,
                            background: purpleLt, border: `1.5px solid ${purpleBd}`,
                            color: selectedCustomer ? purple : '#9ca3af', cursor: 'pointer',
                          }}>
                            <UserCheck size={14} />
                            {selectedCustomer
                              ? `${selectedCustomer.first_name} ${selectedCustomer.last_name} · ${selectedCustomer.email}`
                              : 'Select a customer…'}
                          </button>
                        </Field>
                      )}
                      <div className="qc-grid-3">
                        <Field label="Quote Type" required><StyledSelect value={formData.quote_type} onChange={e => handleChange('quote_type', e.target.value)} options={QUOTE_TYPE_OPTIONS} /></Field>
                        <Field label="Status"><StyledSelect value={formData.status} onChange={e => handleChange('status', e.target.value)} options={STATUS_OPTIONS} /></Field>
                        <Field label="Priority"><StyledSelect value={formData.priority} onChange={e => handleChange('priority', e.target.value)} options={PRIORITY_OPTIONS} /></Field>
                      </div>
                      <div className="qc-grid-3">
                        <Field label="Pricing Type"><StyledSelect value={formData.pricing_type} onChange={e => handleChange('pricing_type', e.target.value)} options={PRICING_TYPE_OPTIONS} /></Field>
                        <Field label="Currency"><StyledSelect value={formData.currency} onChange={e => handleChange('currency', e.target.value)} options={currencyOptions.length ? currencyOptions : [{ value: formData.currency, label: formData.currency }]} disabled={loadingCurrencies} /></Field>
                        <Field label="Billing Schedule"><StyledSelect value={formData.billing_schedule} onChange={e => handleChange('billing_schedule', e.target.value)} options={BILLING_OPTIONS} /></Field>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                        <Checkbox id="is_negotiable" checked={formData.is_negotiable} onChange={e => handleChange('is_negotiable', e.target.checked)} label="Price is negotiable" />
                        <div>
                          <Btn type="button" variant="ghost" size="sm" icon={<UserCheck size={14} />} onClick={() => setShowAssignModal(true)}>
                            {formData.assigned_to ? 'Change Assigned Admin' : 'Assign Admin'}
                          </Btn>
                          {formData.assigned_to && <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 5, fontWeight: 700 }}>✓ Admin assigned (ID: {formData.assigned_to})</p>}
                        </div>
                      </div>
                    </div>
                  </Panel>

                  {/* Dates */}
                  <Panel className="qc-panel">
                    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                      <SectionLabel icon={Calendar}>Dates</SectionLabel>
                    </div>
                    <div style={{ padding: '18px 22px' }}>
                      <div className="qc-grid-4">
                        <Field label="Valid From"><StyledInput type="date" value={formData.valid_from} onChange={e => handleChange('valid_from', e.target.value)} /></Field>
                        <Field label="Valid Until"><StyledInput type="date" value={formData.valid_until} onChange={e => handleChange('valid_until', e.target.value)} /></Field>
                        <Field label="Service Start"><StyledInput type="date" value={formData.service_start_date} onChange={e => handleChange('service_start_date', e.target.value)} /></Field>
                        <Field label="Service End"><StyledInput type="date" value={formData.service_end_date} onChange={e => handleChange('service_end_date', e.target.value)} /></Field>
                      </div>
                    </div>
                  </Panel>

                  {/* Quote Items */}
                  <Panel className="qc-panel">
                    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <SectionLabel icon={Package}>Quote Items · {formData.items.length}</SectionLabel>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Btn type="button" variant="ghost" size="sm" icon={<Package size={14} />} onClick={() => setShowProductSelector(true)}>Products</Btn>
                        <Btn type="button" variant="blue" size="sm" icon={<Wrench size={14} />} onClick={() => setShowServiceSelector(true)}>Services</Btn>
                        <select onChange={e => { if (e.target.value) { setShowCustomModal({ type: e.target.value }); e.target.value = ''; } }} style={{ ...iBase, width: 'auto', padding: '6px 10px', fontSize: '0.78rem' }}>
                          <option value="">+ Custom Item</option>
                          <option value="product">Custom Product</option>
                          <option value="service">Custom Service</option>
                          <option value="fee">Fee / Charge</option>
                        </select>
                        {formData.items.length > 1 && (
                          <select onChange={e => { if (e.target.value) { sortItems(e.target.value); e.target.value = ''; } }} style={{ ...iBase, width: 'auto', padding: '6px 10px', fontSize: '0.78rem' }}>
                            <option value="">Sort Items</option>
                            <option value="alphabetical">Name: A–Z</option>
                            <option value="price_high">Price: High → Low</option>
                            <option value="price_low">Price: Low → High</option>
                            <option value="products_first">Products First</option>
                            <option value="services_first">Services First</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '16px 22px' }}>
                      {formData.items.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 24px', border: `2px dashed ${purpleBd}`, borderRadius: 14 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 16, background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                            <Package size={24} color={purple} style={{ opacity: 0.5 }} />
                          </div>
                          <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#9ca3af', marginBottom: 16 }}>No items added yet</p>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <Btn type="button" variant="ghost" size="sm" icon={<Package size={14} />} onClick={() => setShowProductSelector(true)}>Add Product</Btn>
                            <Btn type="button" variant="blue" size="sm" icon={<Wrench size={14} />} onClick={() => setShowServiceSelector(true)}>Add Service</Btn>
                          </div>
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
                            const discPct     = origPrice > 0 ? (((origPrice - unitPrice) / origPrice) * 100).toFixed(1) : 0;
                            const lineAfter   = parseFloat(item.line_total_after_discount) || 0;
                            const itemName    = item.description || `Item ${index + 1}`;
                            const budget      = Number(item.budget_per_unit ?? 0);
                            const isFromReq   = isFromRequest && budget > 0;

                            return (
                              <div key={index} className="qc-item-card">
                                {/* Card header */}
                                <div style={{ padding: '12px 14px', background: 'var(--row-bg,rgba(249,250,251,0.6))' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                    {/* Reorder */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
                                      <button type="button" onClick={() => moveItem(index, 'up')} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', padding: 3, color: '#9ca3af', opacity: index === 0 ? 0.3 : 1 }}><ArrowUp size={13} /></button>
                                      <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textAlign: 'center' }}>{index + 1}</span>
                                      <button type="button" onClick={() => moveItem(index, 'down')} disabled={index === formData.items.length - 1} style={{ background: 'none', border: 'none', cursor: index === formData.items.length - 1 ? 'not-allowed' : 'pointer', padding: 3, color: '#9ca3af', opacity: index === formData.items.length - 1 ? 0.3 : 1 }}><ArrowDown size={13} /></button>
                                    </div>

                                    {/* Type icon */}
                                    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: isFee ? 'rgba(107,114,128,0.08)' : isService ? 'rgba(59,130,246,0.08)' : purpleLt, border: `1px solid ${isFee ? 'rgba(107,114,128,0.2)' : isService ? 'rgba(59,130,246,0.2)' : purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                                      {isFee ? <Tag size={15} color="#6b7280" /> : isService ? <Wrench size={15} color="#3b82f6" /> : <Package size={15} color={purple} />}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {/* Name + price + actions row */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                                        <div>
                                          <p style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 4px', wordBreak: 'break-word' }}>{itemName}</p>
                                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                            <Pill color={isFee ? '#6b7280' : isService ? '#3b82f6' : purple}>{ITEM_TYPE_OPTIONS.find(o => o.value === item.item_type)?.label || item.item_type}</Pill>
                                            {isFromReq && <Pill color="#f59e0b">Budget: {money(budget)}/{item.unit_of_measure || 'unit'}</Pill>}
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                          <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text,#111827)', margin: 0 }}>{money(lineAfter)}</p>
                                            {hasDiscount && (
                                              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                                                <span style={{ textDecoration: 'line-through' }}>{money(item.line_total)}</span>
                                                <span style={{ marginLeft: 5, color: discAmt > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{discAmt > 0 ? `${Math.abs(discPct)}% off` : `${Math.abs(discPct)}% up`}</span>
                                              </p>
                                            )}
                                            {showKes && <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>{kesMoney(toKes(lineAfter))}</p>}
                                          </div>
                                          <button type="button" onClick={() => setExpandedItems(p => ({ ...p, [index]: !p[index] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#9ca3af' }}>
                                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                          </button>
                                          <button type="button" onClick={() => removeItem(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#ef4444' }}>
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Always-visible fields */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 100px 110px 110px', gap: 10 }}>
                                        <Field label="Type"><StyledSelect value={item.item_type} onChange={e => handleItemChange(index, 'item_type', e.target.value)} options={ITEM_TYPE_OPTIONS} /></Field>
                                        <Field label="Description" required><StyledInput value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} placeholder="Item description" /></Field>
                                        <Field label="Qty" required><StyledInput type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} min="0.01" step="0.01" /></Field>
                                        <Field label="Unit"><StyledSelect value={item.unit_of_measure} onChange={e => handleItemChange(index, 'unit_of_measure', e.target.value)} options={unitOptions} /></Field>
                                        <Field label="Original" hint="List price"><StyledInput type="number" value={item.original_price} onChange={e => handleItemChange(index, 'original_price', e.target.value)} min="0" step="0.01" prefix={cs} /></Field>
                                        <Field label="Unit Price" hint="Selling price"><StyledInput type="number" value={item.unit_price} onChange={e => handleItemChange(index, 'unit_price', e.target.value)} min="0" step="0.01" prefix={cs} /></Field>
                                      </div>

                                      {/* Inline discount summary */}
                                      {discAmt > 0 && (
                                        <div style={{ marginTop: 8, padding: '7px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '0.75rem', color: '#065f46' }}>Discount: {cs} {fmt(origPrice - unitPrice)} × {qty}</span>
                                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>Saving {money(discAmt)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded section */}
                                {isExpanded && (
                                  <div style={{ padding: '16px 14px', borderTop: `1px solid ${purpleBd}`, background: purpleLt, display: 'flex', flexDirection: 'column', gap: 16 }}>

                                    {/* Availability + lead time */}
                                    <div className="qc-grid-2">
                                      <Field label="Availability"><StyledSelect value={item.availability_status} onChange={e => handleItemChange(index, 'availability_status', e.target.value)} options={AVAILABILITY_OPTIONS} /></Field>
                                      {!isFee && <Field label="Lead Time" hint="Expected delivery or completion time"><StyledInput value={item.lead_time || ''} onChange={e => handleItemChange(index, 'lead_time', e.target.value)} placeholder="e.g. 2–3 business days" /></Field>}
                                    </div>

                                    {/* Service details */}
                                    {isService && (
                                      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', marginBottom: 10 }}>Service Details</p>
                                        <div className="qc-grid-3">
                                          <Field label="Labor Cost"><StyledInput type="number" value={item.labor_cost || ''} onChange={e => handleItemChange(index, 'labor_cost', e.target.value)} min="0" step="0.01" prefix={cs} placeholder="Optional" /></Field>
                                          <Field label="Material Cost"><StyledInput type="number" value={item.material_cost || ''} onChange={e => handleItemChange(index, 'material_cost', e.target.value)} min="0" step="0.01" prefix={cs} placeholder="Optional" /></Field>
                                          <Field label="Est. Hours"><StyledInput type="number" value={item.estimated_hours || ''} onChange={e => handleItemChange(index, 'estimated_hours', e.target.value)} min="0" step="0.5" placeholder="Optional" /></Field>
                                          <Field label="Hourly Rate"><StyledInput type="number" value={item.hourly_rate || ''} onChange={e => handleItemChange(index, 'hourly_rate', e.target.value)} min="0" step="0.01" prefix={cs} placeholder="Optional" /></Field>
                                          <Field label="Duration Estimate"><StyledInput value={item.estimated_duration || ''} onChange={e => handleItemChange(index, 'estimated_duration', e.target.value)} placeholder="e.g. 2–3 days" /></Field>
                                          <Field label="Scheduled Start"><StyledInput type="date" value={item.scheduled_start_date || ''} onChange={e => handleItemChange(index, 'scheduled_start_date', e.target.value)} /></Field>
                                          <Field label="Scheduled End"><StyledInput type="date" value={item.scheduled_end_date || ''} onChange={e => handleItemChange(index, 'scheduled_end_date', e.target.value)} /></Field>
                                        </div>
                                        <div style={{ marginTop: 10 }}>
                                          <Checkbox id={`site_${index}`} checked={item.requires_site_visit || false} onChange={e => handleItemChange(index, 'requires_site_visit', e.target.checked)} label="Requires site visit" />
                                        </div>
                                      </div>
                                    )}

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
                                        ) : <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>No variants. Click "Add Attribute".</p>}
                                      </div>
                                    )}

                                    {/* Notes, pricing notes, prerequisites */}
                                    <div className="qc-grid-2">
                                      <Field label="Pricing Notes (internal)"><StyledTextarea value={item.pricing_notes || ''} onChange={e => handleItemChange(index, 'pricing_notes', e.target.value)} rows={2} placeholder="Notes about pricing…" /></Field>
                                      <Field label="Prerequisites"><StyledTextarea value={item.prerequisites || ''} onChange={e => handleItemChange(index, 'prerequisites', e.target.value)} rows={2} placeholder="Requirements or dependencies…" /></Field>
                                    </div>
                                    <Field label="Notes (visible to customer)"><StyledTextarea value={item.notes || ''} onChange={e => handleItemChange(index, 'notes', e.target.value)} rows={2} placeholder="Additional notes for this item…" /></Field>

                                    {/* Checkboxes */}
                                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                      <Checkbox id={`bulk_${index}`} checked={item.is_bulk_pricing || false} onChange={e => handleItemChange(index, 'is_bulk_pricing', e.target.checked)} label="Bulk Pricing" />
                                      <Checkbox id={`neg_${index}`} checked={item.is_negotiated_price || false} onChange={e => handleItemChange(index, 'is_negotiated_price', e.target.checked)} label="Negotiated Price" />
                                      <Checkbox id={`tax_${index}`} checked={item.is_taxable !== false} onChange={e => handleItemChange(index, 'is_taxable', e.target.checked)} label="Taxable" />
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

                  {/* Addresses */}
                  <Panel className="qc-panel">
                    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                      <SectionLabel icon={MapPin}>Addresses</SectionLabel>
                    </div>
                    <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <Field label="Shipping Address"><StyledTextarea value={formData.shipping_address} onChange={e => handleChange('shipping_address', e.target.value)} rows={3} placeholder="Shipping address…" /></Field>
                      <Checkbox id="billing_same" checked={formData.billing_same_as_shipping} onChange={e => handleChange('billing_same_as_shipping', e.target.checked)} label="Billing address same as shipping" />
                      {!formData.billing_same_as_shipping && <Field label="Billing Address"><StyledTextarea value={formData.billing_address} onChange={e => handleChange('billing_address', e.target.value)} rows={3} placeholder="Billing address…" /></Field>}
                    </div>
                  </Panel>

                  {/* Terms & Notes */}
                  <Panel className="qc-panel">
                    <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                      <SectionLabel icon={FileText}>Terms & Notes</SectionLabel>
                    </div>
                    <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div className="qc-grid-2">
                        <Field label="Payment Terms"><StyledTextarea value={formData.payment_terms} onChange={e => handleChange('payment_terms', e.target.value)} rows={2} placeholder="e.g. Net 30, 50% upfront" /></Field>
                        <Field label="Delivery Terms"><StyledTextarea value={formData.delivery_terms} onChange={e => handleChange('delivery_terms', e.target.value)} rows={2} placeholder="Delivery conditions…" /></Field>
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
                      <Field label="Terms & Conditions"><StyledTextarea value={formData.terms_and_conditions} onChange={e => handleChange('terms_and_conditions', e.target.value)} rows={4} placeholder="Terms and conditions…" /></Field>
                    </div>
                  </Panel>
                </div>

                {/* ── RIGHT COLUMN ──────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>

                  {/* Financial summary */}
                  <Panel className="qc-panel" accent>
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                      <SectionLabel icon={DollarSign}>Quote Summary</SectionLabel>
                    </div>
                    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* Summary rows */}
                      {[
                        { label: 'Original Total',          value: money(totals.originalTotal),              show: true },
                        { label: 'Item Discounts',          value: `-${money(totals.itemDiscounts)}`,        show: totals.itemDiscounts > 0, color: '#10b981' },
                        { label: 'After Item Discounts',    value: money(totals.subtotalAfterItemDiscounts), show: totals.itemDiscounts > 0, divider: true },
                      ].filter(r => r.show).map(({ label, value, color, divider }) => (
                        <div key={label} style={{ paddingTop: divider ? 8 : 0, borderTop: divider ? '1px solid var(--border,#f3f4f6)' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{label}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'var(--text,#111827)' }}>{value}</span>
                          </div>
                        </div>
                      ))}

                      {/* Quote discount */}
                      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border,#f3f4f6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Quote Discount</span>
                          <button type="button" onClick={() => setUseDiscountPct(!useDiscountPct)} style={{ fontSize: '0.7rem', color: purple, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {useDiscountPct ? 'Switch to amount' : 'Switch to %'}
                          </button>
                        </div>
                        {useDiscountPct ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1 }}><StyledInput type="number" value={formData.discount_percentage} onChange={e => handleChange('discount_percentage', e.target.value)} min="0" max="100" step="0.01" placeholder="0" /></div>
                            <Percent size={15} color="#9ca3af" />
                          </div>
                        ) : (
                          <StyledInput type="number" value={formData.discount} onChange={e => handleChange('discount', e.target.value)} min="0" step="0.01" prefix={cs} />
                        )}
                        {totals.quoteDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Quote Discount applied</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>-{money(totals.quoteDiscount)}</span>
                          </div>
                        )}
                      </div>

                      {/* Tax */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Tax (VAT)</span>
                          <button type="button" onClick={() => handleChange('tax', totals.subtotalAfterAllDiscounts * 0.16)} style={{ fontSize: '0.7rem', color: purple, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Apply 16%</button>
                        </div>
                        <StyledInput type="number" value={formData.tax} onChange={e => handleChange('tax', e.target.value)} min="0" step="0.01" prefix={cs} />
                      </div>

                      {/* Shipping */}
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 6 }}>Shipping</span>
                        <StyledInput type="number" value={formData.shipping_cost} onChange={e => handleChange('shipping_cost', e.target.value)} min="0" step="0.01" prefix={cs} />
                      </div>

                      {/* Savings banner */}
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
                          1 {formData.currency} = {fmtRate(exchangeRate)} KES{selectedCurrency.updated_at ? ` · ${new Date(selectedCurrency.updated_at).toLocaleDateString()}` : ''}
                        </p>
                      )}
                    </div>
                  </Panel>

                  {/* Item count summary */}
                  {formData.items.length > 0 && (
                    <Panel className="qc-panel">
                      <div style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <StatCell label="Items"    value={formData.items.length} />
                          <StatCell label="Products" value={formData.items.filter(i => i.item_type === 'product' || i.item_type === 'custom_product').length} />
                          <StatCell label="Services" value={formData.items.filter(i => i.item_type === 'service' || i.item_type === 'custom_service').length} accent />
                        </div>
                      </div>
                    </Panel>
                  )}

                  {/* Pricing guide */}
                  <Panel className="qc-panel">
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                      <SectionLabel icon={Info}>Pricing Guide</SectionLabel>
                    </div>
                    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: purple, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Price Fields</p>
                        {[['Original', 'List / catalog price'], ['Unit Price', 'Actual selling price'], ['Discount', 'Auto-calculated difference']].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text,#374151)', minWidth: 72 }}>{k}</span>
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>— {v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: '1px solid var(--border,#f3f4f6)', paddingTop: 10 }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: purple, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Two Discount Levels</p>
                        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--row-bg,rgba(249,250,251,0.7))', border: '1px solid var(--border,#f3f4f6)', marginBottom: 6 }}>
                          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text,#374151)', margin: '0 0 2px' }}>1. Item Discounts</p>
                          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Lower Unit Price on specific items</p>
                        </div>
                        <div style={{ padding: '8px 10px', borderRadius: 8, background: purpleLt, border: `1px solid ${purpleBd}` }}>
                          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: purple, margin: '0 0 2px' }}>2. Quote Discount</p>
                          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Additional % or amount off entire quote</p>
                        </div>
                      </div>
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', margin: '0 0 2px' }}>Pro Tip: Combine Both</p>
                        <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: 0 }}>10% off items + 5% quote discount = maximum savings</p>
                      </div>
                    </div>
                  </Panel>
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, marginTop: 20, borderTop: '1px solid var(--border,#f3f4f6)' }}>
                <Btn type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Btn>
                <Btn type="submit" disabled={loading || formData.items.length === 0} icon={loading ? null : <Save size={15} />}>
                  {loading ? 'Creating…' : 'Create Quote'}
                </Btn>
              </div>
            </form>
          </div>
            {showProductSelector && <ProductSelectorModalAdmin onClose={() => setShowProductSelector(false)} onSelect={handleProductsSelected} excludeIds={formData.items.filter(i => i.product_id).map(i => i.product_id)} />}
            {showServiceSelector && <ServiceSelectorModalAdmin onClose={() => setShowServiceSelector(false)} onSelect={handleServicesSelected} excludeIds={formData.items.filter(i => i.service_id).map(i => i.service_id)} />}
            {showCustomModal && <CustomItemModal type={showCustomModal.type} onClose={() => setShowCustomModal(null)} onSave={handleCustomItemCreated} />}
            {showPricingModal && <PricingValidationModal errors={pricingErrors} onClose={() => setShowPricingModal(false)} currencySymbol={cs} />}
            {showAssignModal && <AssignModal onClose={() => setShowAssignModal(false)} onAssign={handleAssign} currentAssignedId={formData.assigned_to} />}
            {showCustomerModal && (
              <CustomerSelectorModal
                onClose={() => setShowCustomerModal(false)}
                onSelect={(customer) => {
                  setSelectedCustomer(customer);
                  handleChange('customer_id', customer.id);
                  setShowCustomerModal(false);
                }}
                currentCustomerId={formData.customer_id}
              />
            )}
        </div>
      </div>

    </>
  );
};

export default QuoteCreate;