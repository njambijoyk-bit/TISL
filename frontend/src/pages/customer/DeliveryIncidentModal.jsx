import { useState } from 'react';
import { Flag, X, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import deliveryAPI from '../../api/delivery';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
function ModalShell({ onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 460,
          boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(239,68,68,0.12)',
          overflow: 'hidden', margin: 'auto',
        }}
      >
        {/* Red accent top bar */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }} />
        {children}
      </div>
    </div>
  );
}

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#c084fc', marginBottom: 6 }}>
      {children}
      {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </label>
  );
}

const SELECT_BASE = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12,
  padding: '9px 32px 9px 12px', fontSize: 13, color: '#111827',
  background: 'white', appearance: 'none', WebkitAppearance: 'none',
  outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
};

function Select({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={SELECT_BASE}
        onFocus={e => e.target.style.borderColor = '#a855f7'}
        onBlur={e => e.target.style.borderColor = 'rgba(168,85,247,0.2)'}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} color="#9ca3af" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </div>
  );
}

// ── Config ────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'misconduct',       label: 'Driver Misconduct' },
  { value: 'rude_customer',    label: 'Rude Customer' },
  { value: 'security_issue',   label: 'Security Issue' },
  { value: 'road_condition',   label: 'Road / Condition Problem' },
  { value: 'assault',          label: 'Assault' },
  { value: 'property_damage',  label: 'Property Damage' },
  { value: 'other',            label: 'Other' },
];

const SEVERITIES = [
  { value: 'low',      label: 'Low — Minor inconvenience' },
  { value: 'medium',   label: 'Medium — Notable problem' },
  { value: 'high',     label: 'High — Significant impact' },
  { value: 'critical', label: 'Critical — Safety concern' },
];

const SEVERITY_COLORS = {
  low:      { bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.2)',  color: '#059669' },
  medium:   { bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.2)',  color: '#d97706' },
  high:     { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.2)',   color: '#dc2626' },
  critical: { bg: 'rgba(109,40,217,0.06)',  border: 'rgba(109,40,217,0.25)', color: '#7c3aed' },
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DeliveryIncidentModal({
  orderId,
  driverName,
  driverId,         // reported_against — pass this in from shipment data
  deliveryItemId,
  manifestId,
  onClose,
  onSuccess,
}) {
  const [category,    setCategory]    = useState('');
  const [severity,    setSeverity]    = useState('');
  const [description, setDescription] = useState('');
  const [loading,     setLoading]     = useState(false);

  const descLength = description.trim().length;
  const canSubmit  = category && severity && descLength >= 20 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await deliveryAPI.fileIncident({
        manifest_id:      manifestId    || null,
        delivery_item_id: deliveryItemId || null,
        reported_against: driverId,
        category,
        severity,
        description: description.trim(),
      });
      onSuccess?.();
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs) {
        // Show first validation error
        const first = Object.values(errs)[0];
        toast.error(Array.isArray(first) ? first[0] : first);
      } else {
        toast.error(err.response?.data?.message || 'Could not file incident.');
      }
    } finally {
      setLoading(false);
    }
  };

  const sevColors = severity ? SEVERITY_COLORS[severity] : null;

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Flag size={16} color="#ef4444" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>Report an Issue</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
              {driverName ? `Regarding delivery by ${driverName}` : 'Tell us what happened.'}
            </p>
          </div>
        </div>
        <button
          type="button" onClick={onClose}
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, padding: 6, cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}
        >
          <X size={15} color="#ef4444" />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 20px 20px' }}>

        {/* Category */}
        <div style={{ marginBottom: 14 }}>
          <Label required>Issue Category</Label>
          <Select
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
            placeholder="Select a category…"
          />
        </div>

        {/* Severity */}
        <div style={{ marginBottom: 14 }}>
          <Label required>Severity</Label>
          <Select
            value={severity}
            onChange={setSeverity}
            options={SEVERITIES}
            placeholder="How serious is this?"
          />
          {/* Severity indicator */}
          {sevColors && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: sevColors.bg, border: `1px solid ${sevColors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={13} color={sevColors.color} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: sevColors.color }}>
                {severity === 'critical'
                  ? 'This will be reviewed immediately and may trigger an AI safety analysis.'
                  : severity === 'high'
                  ? 'Our team will prioritise reviewing this report.'
                  : 'Your report will be reviewed by our delivery team.'}
              </p>
            </div>
          )}
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <Label required>Description</Label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={5000}
            rows={4}
            placeholder="Please describe what happened in detail (minimum 20 characters)…"
            style={{
              width: '100%', resize: 'vertical', boxSizing: 'border-box',
              border: `1px solid ${descLength > 0 && descLength < 20 ? 'rgba(239,68,68,0.4)' : 'rgba(168,85,247,0.2)'}`,
              borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#111827',
              outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#a855f7'}
            onBlur={e => e.target.style.borderColor = descLength > 0 && descLength < 20 ? 'rgba(239,68,68,0.4)' : 'rgba(168,85,247,0.2)'}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {descLength > 0 && descLength < 20 && (
              <p style={{ margin: 0, fontSize: 11, color: '#ef4444', fontWeight: 500 }}>
                {20 - descLength} more character{20 - descLength !== 1 ? 's' : ''} required
              </p>
            )}
            <p style={{ margin: '0 0 0 auto', fontSize: 11, color: '#9ca3af' }}>
              {description.length}/5000
            </p>
          </div>
        </div>

        {/* Privacy note */}
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
            Your report is reviewed by our team. Depending on the outcome, the driver may be informed — but your personal details are kept confidential.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button" onClick={onClose}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={handleSubmit} disabled={!canSubmit}
            style={{
              flex: 2, padding: '10px 16px', borderRadius: 12, border: 'none',
              background: canSubmit ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'rgba(239,68,68,0.2)',
              fontSize: 13, fontWeight: 700, color: canSubmit ? 'white' : '#ef4444',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: canSubmit ? '0 4px 14px rgba(239,68,68,0.25)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {loading
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
              : <><Flag size={14} /> Submit Report</>}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </ModalShell>
  );
}
