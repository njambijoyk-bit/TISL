import React, { useState } from 'react';
import { Package, Wrench, DollarSign, X, Check } from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const PRODUCT_UNITS = ['each','unit','piece','box','pack','set','dozen','kg','g','liter','ml','meter','cm','sqm','sqft'];
const SERVICE_UNITS = ['hour','day','week','month','session','visit','project','job','each'];
const FEE_UNITS     = ['one-time','per_transaction','per_user','per_month','per_year','per_project','per_item','percentage','flat_rate','each'];

const UNIT_LABELS = { 'each':'Each','unit':'Unit','piece':'Piece','box':'Box','pack':'Pack','set':'Set','dozen':'Dozen','kg':'Kilogram','g':'Gram','liter':'Liter','ml':'Milliliter','meter':'Meter','cm':'Centimeter','sqm':'Square Meter','sqft':'Square Foot','hour':'Hour','day':'Day','week':'Week','month':'Month','session':'Session','visit':'Visit','project':'Project','job':'Job','one-time':'One-Time','per_transaction':'Per Transaction','per_user':'Per User','per_month':'Per Month','per_year':'Per Year','per_project':'Per Project','per_item':'Per Item','percentage':'Percentage','flat_rate':'Flat Rate' };

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'outline', icon, type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', boxShadow: 'none' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 18px', borderRadius: 10, fontSize: '0.83rem', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      transition: 'transform 0.1s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const FieldLabel = ({ children, required }) => (
  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text,#374151)', marginBottom: 6, letterSpacing: '0.02em' }}>
    {children}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
  </label>
);

const StyledInput = ({ error, ...props }) => (
  <input {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: `1.5px solid ${error ? '#ef4444' : 'var(--border,#e5e7eb)'}`,
    background: 'var(--panel-bg,white)', color: 'var(--text,#111827)',
    fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = error ? '#ef4444' : purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledTextarea = ({ rows = 3, ...props }) => (
  <textarea rows={rows} {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)',
    background: 'var(--panel-bg,white)', color: 'var(--text,#111827)',
    fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
    transition: 'border-color 0.15s', fontFamily: 'inherit',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledSelect = ({ options, ...props }) => (
  <select {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)',
    background: 'var(--panel-bg,white)', color: 'var(--text,#111827)',
    fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s', cursor: 'pointer',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  >
    {options.map(v => <option key={v} value={v}>{UNIT_LABELS[v] || v}</option>)}
  </select>
);

const FieldHint = ({ children }) => <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 5 }}>{children}</p>;
const FieldError = ({ children }) => children ? <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4, fontWeight: 600 }}>{children}</p> : null;

const Grid2 = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const CustomItemModal = ({ type = 'product', onClose, onSave, isAdmin = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    lead_time: '',
    pricing_notes: '',
    quantity: 1,
    unit_of_measure: type === 'service' ? 'hour' : type === 'fee' ? 'one-time' : 'each',
    price: '',
    estimated_hours: '',
    hourly_rate: '',
    labor_cost: '',
    material_cost: '',
    estimated_duration: '',
    requires_site_visit: false,
    notes: '',
  });

  const [errors, setErrors] = useState({});

  const isProduct = type === 'product';
  const isService = type === 'service';
  const isFee = type === 'fee';

  const Icon = isProduct ? Package : isService ? Wrench : DollarSign;
  const itemLabel = isProduct ? 'Product' : isService ? 'Service' : 'Fee';
  const unitOptions = isService ? SERVICE_UNITS : isFee ? FEE_UNITS : PRODUCT_UNITS;

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = `${itemLabel} name is required`;
    if (!formData.quantity || formData.quantity < 0.01) newErrors.quantity = 'Quantity must be at least 0.01';
    if (formData.price !== '' && parseFloat(formData.price) < 0) newErrors.price = 'Price cannot be negative';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      type,
      name: formData.name.trim(),
      lead_time: formData.lead_time.trim() || null,
      pricing_notes: formData.pricing_notes.trim() || null,
      quantity: parseFloat(formData.quantity),
      unit_of_measure: formData.unit_of_measure,
      price: formData.price === '' ? null : parseFloat(formData.price),
      estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
      labor_cost: formData.labor_cost ? parseFloat(formData.labor_cost) : null,
      material_cost: formData.material_cost ? parseFloat(formData.material_cost) : null,
      estimated_duration: formData.estimated_duration || null,
      requires_site_visit: formData.requires_site_visit,
      notes: formData.notes.trim() || null,
    });
  };

  const total = ((parseFloat(formData.price) || 0) * (parseFloat(formData.quantity) || 0)).toFixed(2);

  return (
    <>
      <style>{`
        @keyframes cimFadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes cimSlideUp { from { opacity:0; transform:translateY(20px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        .cim-overlay { animation: cimFadeIn 0.2s ease both; }
        .cim-modal   { animation: cimSlideUp 0.25s ease both; }
        @media(max-width:520px){ .cim-grid2 { grid-template-columns:1fr !important; } }
      `}</style>

      {/* Backdrop */}
      <div className="cim-overlay" style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>

        {/* Modal */}
        <div className="cim-modal" style={{ width: '100%', maxWidth: 600, background: 'var(--panel-bg,white)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: purpleLt }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={17} color="white" />
              </div>
              <h2 style={{ fontSize: '1rem', fontWeight: 900, color: purple, margin: 0 }}>Add Custom {itemLabel}</h2>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#9ca3af', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '22px 24px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Name */}
            <div>
              <FieldLabel required>{itemLabel} Name</FieldLabel>
              <StyledInput
                type="text"
                placeholder={isProduct ? 'e.g., Industrial Grade Ethernet Cable' : isService ? 'e.g., Custom Network Security Audit' : 'e.g., Setup Fee'}
                value={formData.name}
                onChange={e => updateField('name', e.target.value)}
                error={errors.name}
              />
              <FieldError>{errors.name}</FieldError>
              <FieldHint>Provide a clear, concise name for this {itemLabel.toLowerCase()}</FieldHint>
            </div>

            {/* Lead Time */}
            {!isFee && (
              <div>
                <FieldLabel>Lead Time</FieldLabel>
                <StyledInput
                  type="text"
                  placeholder={isProduct ? 'e.g., 3-5 business days' : 'e.g., 2 weeks'}
                  value={formData.lead_time}
                  onChange={e => updateField('lead_time', e.target.value)}
                />
                <FieldHint>Expected delivery or completion time</FieldHint>
              </div>
            )}

            {/* Specifications */}
            <div>
              <FieldLabel>Specifications</FieldLabel>
              <StyledTextarea
                rows={3}
                placeholder={isProduct ? 'e.g., Length 20m, Cat6, outdoor-rated, black, includes connectors' : isService ? 'e.g., Scope: audit + report, on-site visit required' : 'What this fee covers, when it applies…'}
                value={formData.pricing_notes}
                onChange={e => updateField('pricing_notes', e.target.value)}
              />
              <FieldHint>Any key details, pricing conditions, discounts, or special terms</FieldHint>
            </div>

            {/* Quantity + Unit */}
            <div className="cim-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <FieldLabel required>Quantity</FieldLabel>
                <StyledInput type="number" min="0.01" step="0.01" placeholder="1" value={formData.quantity} onChange={e => updateField('quantity', e.target.value)} error={errors.quantity} />
                <FieldError>{errors.quantity}</FieldError>
              </div>
              <div>
                <FieldLabel>{isFee ? 'Billing Type' : 'Unit of Measure'}</FieldLabel>
                <StyledSelect options={unitOptions} value={formData.unit_of_measure} onChange={e => updateField('unit_of_measure', e.target.value)} />
                {isFee && <FieldHint>How this fee is charged</FieldHint>}
              </div>
            </div>

            {/* Price */}
            <div>
              <FieldLabel>Budget Price{!isFee && ` per ${formData.unit_of_measure}`}</FieldLabel>
              <StyledInput type="number" min="0.01" step="0.01" placeholder="0.00" value={formData.price} onChange={e => updateField('price', e.target.value)} error={errors.price} />
              <FieldError>{errors.price}</FieldError>
              <FieldHint>Total: KES {parseFloat(total).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</FieldHint>
            </div>

            {/* Service-specific fields */}
            {isService && (
              <div style={{ borderRadius: 12, border: `1.5px solid ${purpleBd}`, background: purpleLt, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: purple, margin: 0 }}>Service Details</p>

                <div className="cim-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <FieldLabel>Estimated Hours</FieldLabel>
                    <StyledInput type="number" min="0" step="0.5" placeholder="e.g., 8" value={formData.estimated_hours} onChange={e => updateField('estimated_hours', e.target.value)} />
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div className="cim-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <FieldLabel>Hourly Rate</FieldLabel>
                        <StyledInput type="number" min="0" step="0.01" placeholder="Rate per hour" value={formData.hourly_rate} onChange={e => updateField('hourly_rate', e.target.value)} />
                      </div>
                      <div>
                        <FieldLabel>Labor Cost</FieldLabel>
                        <StyledInput type="number" min="0" step="0.01" placeholder="Total labor" value={formData.labor_cost} onChange={e => updateField('labor_cost', e.target.value)} />
                      </div>
                      <div>
                        <FieldLabel>Material Cost</FieldLabel>
                        <StyledInput type="number" min="0" step="0.01" placeholder="Materials needed" value={formData.material_cost} onChange={e => updateField('material_cost', e.target.value)} />
                      </div>
                      <div>
                        <FieldLabel>Estimated Duration</FieldLabel>
                        <StyledInput type="text" placeholder="e.g., 2-3 days" value={formData.estimated_duration} onChange={e => updateField('estimated_duration', e.target.value)} />
                      </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <div
                        onClick={() => updateField('requires_site_visit', !formData.requires_site_visit)}
                        style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${formData.requires_site_visit ? purple : '#d1d5db'}`, background: formData.requires_site_visit ? purple : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', cursor: 'pointer', flexShrink: 0 }}
                      >
                        {formData.requires_site_visit && <Check size={11} color="white" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '0.83rem', color: 'var(--text,#374151)', fontWeight: 600 }}>Requires site visit</span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* Additional Notes */}
            <div>
              <FieldLabel>Additional Notes</FieldLabel>
              <StyledTextarea rows={2} placeholder="Any other important information, preferences, or special requirements…" value={formData.notes} onChange={e => updateField('notes', e.target.value)} />
            </div>

            {/* Info box */}
            <div style={{ borderRadius: 12, border: '1.5px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)', padding: '14px 16px' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', margin: '0 0 8px' }}>💡 Why Add Custom Items?</p>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[`Request items not currently in our catalog`, `Specify unique requirements or modifications`, `Get quotes for specialized ${itemLabel.toLowerCase()}s`, `Help us understand your exact needs`].map((t, i) => (
                  <span key={i}>• {t}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSave} icon={<Icon size={14} />}>Add Custom {itemLabel}</Btn>
          </div>
        </div>
      </div>
    </>
  );
};

export default CustomItemModal;