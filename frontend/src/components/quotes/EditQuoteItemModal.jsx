import React, { useState } from 'react';
import { Save, Package, Wrench, AlertCircle, TrendingDown, DollarSign } from 'lucide-react';
import Modal from '../common/Modal';
import LoadingSpinner from '../layout/LoadingSpinner';

// ─── Design tokens (mirrors QuoteDetail / system) ────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Shared input base ────────────────────────────────────────────────────────
const iBase = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1.5px solid var(--border,#e5e7eb)', fontSize: '0.83rem',
  outline: 'none', color: 'var(--text,#111827)', boxSizing: 'border-box',
  fontWeight: 500, background: 'var(--input-bg,white)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
const fIn    = e => { e.currentTarget.style.borderColor = purple;    e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut   = e => { e.currentTarget.style.borderColor = 'var(--border,#e5e7eb)'; e.currentTarget.style.boxShadow = 'none'; };
const errFIn = e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.1)'; };

// ─── Atoms ────────────────────────────────────────────────────────────────────
const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>
      {children}
    </p>
  </div>
);

const FieldLabel = ({ children, required }) => (
  <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8 }}>
    {children}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
  </p>
);

// Matches StatCell from QuoteDetail exactly
const StatCell = ({ label, value, accent, mono }) => (
  <div style={{
    padding: '10px 12px', borderRadius: 10,
    background: accent ? purpleLt : 'var(--row-bg,rgba(249,250,251,0.7))',
    border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}`,
  }}>
    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
    <p style={{ fontSize: mono ? '0.8rem' : '0.88rem', fontWeight: 800, color: accent ? purple : 'var(--text,#111827)', margin: 0, fontFamily: mono ? 'monospace' : undefined }}>
      {value}
    </p>
  </div>
);

const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md', fullWidth, type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' },
    outline: { background: 'transparent', color: 'var(--text-muted,#6b7280)', border: '1.5px solid var(--border,#e5e7eb)', boxShadow: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
    warning: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' },
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

// Matches fmt / money from QuoteDetail
const fmt   = (n, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));
const money = (v)        => `KSh ${fmt(v)}`;

// ─── Main component ───────────────────────────────────────────────────────────
const EditQuoteItemModal = ({ item, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    quantity:        item?.quantity        || 1,
    unit_price:      item?.unit_price      || 0,
    discount_amount: item?.discount_amount || 0,
    notes:           item?.notes           || '',
  });
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (field, value) => {
    setFormData(p => ({ ...p, [field]: value }));
    if (errors[field]) setErrors(p => ({ ...p, [field]: null }));
  };

  const qty      = parseFloat(formData.quantity)        || 0;
  const price    = parseFloat(formData.unit_price)      || 0;
  const discount = parseFloat(formData.discount_amount) || 0;

  const lineTotal              = qty * price;
  const lineTotalAfterDiscount = Math.max(0, lineTotal - discount);
  const discountPct            = lineTotal > 0 ? ((discount / lineTotal) * 100).toFixed(1) : 0;

  const isService = item?.item_type === 'service' || item?.item_type === 'custom_service';
  const itemName  = item?.description || item?.product_name || item?.service_name || 'Item';

  const validate = () => {
    const e = {};
    if (!formData.quantity || qty <= 0) e.quantity        = 'Must be greater than 0';
    if (formData.unit_price < 0)        e.unit_price      = 'Must be 0 or greater';
    if (discount < 0)                   e.discount_amount = 'Discount cannot be negative';
    if (discount > lineTotal)           e.discount_amount = 'Discount cannot exceed line total';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSave({ quantity: qty, unit_price: price, discount_amount: discount, notes: formData.notes });
      onClose();
    } catch {
      setErrors({ submit: 'Failed to save changes. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: purple }}>Edit Quote Item</span>} size="lg">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .eqi-field { animation: fadeUp 0.25s ease both; }
        .eqi-field:nth-child(1){animation-delay:0.03s}
        .eqi-field:nth-child(2){animation-delay:0.07s}
        .eqi-field:nth-child(3){animation-delay:0.11s}
        .eqi-field:nth-child(4){animation-delay:0.15s}
        .eqi-field:nth-child(5){animation-delay:0.19s}
        .eqi-field:nth-child(6){animation-delay:0.23s}
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── Item info header ─────────────────────────────────────── */}
        <div className="eqi-field" style={{
          display: 'flex', gap: 12, alignItems: 'center',
          padding: '12px 14px', borderRadius: 12,
          background: 'var(--row-bg,rgba(249,250,251,0.8))',
          border: '1px solid var(--border,#f3f4f6)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: isService ? 'rgba(59,130,246,0.08)' : purpleLt,
            border: `1px solid ${isService ? 'rgba(59,130,246,0.2)' : purpleBd}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isService
              ? <Wrench  size={18} color="#3b82f6" />
              : <Package size={18} color={purple} />
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 2px', wordBreak: 'break-word' }}>
              {itemName}
            </p>
            {item?.product_sku && (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>SKU: {item.product_sku}</p>
            )}
          </div>
          {item?.original_price > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', margin: '0 0 2px' }}>List Price</p>
              <p style={{ fontSize: '0.83rem', fontWeight: 700, color: '#9ca3af', textDecoration: 'line-through', margin: 0 }}>
                {money(item.original_price)}
              </p>
            </div>
          )}
        </div>

        {/* ── Quantity & Unit Price ────────────────────────────────── */}
        <div className="eqi-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Quantity */}
          <div>
            <FieldLabel required>{isService ? 'Hours / Qty' : 'Quantity'}</FieldLabel>
            <input
              type="number" min="0.01" step="0.01"
              value={formData.quantity}
              onChange={e => set('quantity', e.target.value)}
              style={{ ...iBase, borderColor: errors.quantity ? '#ef4444' : undefined }}
              onFocus={errors.quantity ? errFIn : fIn}
              onBlur={fOut}
            />
            {errors.quantity && (
              <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 5 }}>{errors.quantity}</p>
            )}
          </div>

          {/* Unit Price */}
          <div>
            <FieldLabel required>{isService ? 'Rate / Hour' : 'Unit Price'}</FieldLabel>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600, pointerEvents: 'none' }}>KSh</span>
              <input
                type="number" min="0" step="0.01"
                value={formData.unit_price}
                onChange={e => set('unit_price', e.target.value)}
                style={{ ...iBase, paddingLeft: 42, borderColor: errors.unit_price ? '#ef4444' : undefined }}
                onFocus={errors.unit_price ? errFIn : fIn}
                onBlur={fOut}
              />
            </div>
            {errors.unit_price && (
              <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 5 }}>{errors.unit_price}</p>
            )}
          </div>
        </div>

        {/* ── Live totals ──────────────────────────────────────────── */}
        <div className="eqi-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <StatCell label="Line Total"     value={money(lineTotal)} />
          <StatCell label="After Discount" value={money(lineTotalAfterDiscount)} accent />
        </div>

        {/* ── Discount ─────────────────────────────────────────────── */}
        <div className="eqi-field">
          <FieldLabel>Discount Amount (optional)</FieldLabel>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600, pointerEvents: 'none' }}>KSh</span>
            <input
              type="number" min="0" step="0.01"
              value={formData.discount_amount}
              onChange={e => set('discount_amount', e.target.value)}
              style={{ ...iBase, paddingLeft: 42, borderColor: errors.discount_amount ? '#ef4444' : undefined }}
              onFocus={errors.discount_amount ? errFIn : fIn}
              onBlur={fOut}
            />
          </div>
          {errors.discount_amount
            ? <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 5 }}>{errors.discount_amount}</p>
            : discount > 0
              ? <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 5, fontWeight: 700 }}>{discountPct}% off</p>
              : <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 5 }}>Leave 0 for no discount</p>
          }
        </div>

        {/* ── Final callout ────────────────────────────────────────── */}
        <div className="eqi-field" style={{
          padding: '12px 16px', borderRadius: 12,
          background: purpleLt, border: `1px solid ${purpleBd}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <DollarSign size={14} color={purple} />
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: purple }}>Final Line Total</span>
            {discount > 0 && (
              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '2px 7px', borderRadius: 9999 }}>
                saving {money(discount)}
              </span>
            )}
          </div>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: purple }}>{money(lineTotalAfterDiscount)}</span>
        </div>

        {/* ── Notes ────────────────────────────────────────────────── */}
        <div className="eqi-field">
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea
            value={formData.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Any special requirements for this item…"
            style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            onFocus={fIn}
            onBlur={fOut}
          />
        </div>

        {/* ── Submit error ─────────────────────────────────────────── */}
        {errors.submit && (
          <div style={{
            display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
            borderLeft: '4px solid #ef4444',
          }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{errors.submit}</p>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border,#f3f4f6)' }}>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={submitting} icon={submitting ? <LoadingSpinner size="sm" /> : <Save size={15} />}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

export default EditQuoteItemModal;