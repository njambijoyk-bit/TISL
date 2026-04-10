import React from 'react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const SectionLabel = ({ children, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
    {icon && <span>{icon}</span>}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>{children}</p>
  </div>
);

const Field = ({ label, required, hint, error, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </label>
    {children}
    {hint  && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 5 }}>{hint}</p>}
    {error && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4, fontWeight: 600 }}>{error}</p>}
  </div>
);

const StyledInput = (props) => (
  <input {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledTextarea = ({ rows = 4, ...props }) => (
  <textarea rows={rows} {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', resize: 'vertical',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledSelect = ({ options, ...props }) => (
  <select {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// ─── Data ────────────────────────────────────────────────────────────────────
const budgetOptions = [
  { value: '', label: 'Select a budget range' },
  { value: 'Under KES 50,000', label: 'Under KES 50,000' },
  { value: 'KES 50,000 - 100,000', label: 'KES 50,000 - 100,000' },
  { value: 'KES 100,000 - 250,000', label: 'KES 100,000 - 250,000' },
  { value: 'KES 250,000 - 500,000', label: 'KES 250,000 - 500,000' },
  { value: 'KES 500,000 - 1,000,000', label: 'KES 500,000 - 1,000,000' },
  { value: 'Over KES 1,000,000', label: 'Over KES 1,000,000' },
  { value: 'Not sure', label: 'Not sure' },
];

const timelineOptions = [
  { value: '', label: 'Select a timeline' },
  { value: 'Urgent (Within 1 week)', label: 'Urgent (Within 1 week)' },
  { value: 'Soon (1-2 weeks)', label: 'Soon (1-2 weeks)' },
  { value: '1 month', label: '1 month' },
  { value: '2-3 months', label: '2-3 months' },
  { value: '3+ months', label: '3+ months' },
  { value: 'Flexible', label: 'Flexible' },
];

// ─── Component ────────────────────────────────────────────────────────────────
const Step1BasicInfo = ({ formData, updateFormData }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    {/* Header */}
    <div>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#3b82f6', margin: '0 0 5px' }}>Basic Information</h2>
      <p style={{ fontSize: '0.83rem', color: '#9ca3af', margin: 0 }}>Let's start with some basic information about your request</p>
    </div>

    <Field label="Request Title" required hint="Give your request a clear, descriptive title">
      <StyledInput type="text" placeholder="e.g., Office Network Setup and Equipment" value={formData.request_title} onChange={e => updateFormData({ request_title: e.target.value })} />
    </Field>

    <Field label="Description" required hint="Be as detailed as possible to help us provide an accurate quote">
      <StyledTextarea rows={6} placeholder="Describe what you need in detail. Include any specific requirements, preferences, or constraints…" value={formData.request_description} onChange={e => updateFormData({ request_description: e.target.value })} />
    </Field>

    <Field label="Budget Range" hint="This helps us tailor our recommendations to your budget">
      <StyledSelect options={budgetOptions} name="budget_range" value={formData.budget_range || ''} onChange={e => updateFormData({ budget_range: e.target.value })} />
    </Field>

    <Field label="When Do You Need This?" hint="Let us know your timeline so we can prioritize accordingly">
      <StyledSelect options={timelineOptions} name="timeline_needed" value={formData.timeline_needed || ''} onChange={e => updateFormData({ timeline_needed: e.target.value })} />
    </Field>

    {/* Tip box */}
    <div style={{ borderRadius: 12, border: '1.5px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)', padding: '14px 16px' }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', margin: '0 0 8px' }}>💡 Tip for Getting the Best Quote</p>
      <div style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {['Be specific about your requirements', 'Mention any technical specifications if known', 'Include information about your location/site', 'List any constraints or special considerations'].map((t, i) => (
          <span key={i}>• {t}</span>
        ))}
      </div>
    </div>
  </div>
);

export default Step1BasicInfo;