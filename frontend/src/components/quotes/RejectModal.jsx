import React, { useState } from 'react';
import { XCircle, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import LoadingSpinner from '../layout/LoadingSpinner';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const taStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1.5px solid var(--border,#e5e7eb)', fontSize: '0.83rem',
  outline: 'none', color: 'var(--text,#111827)', boxSizing: 'border-box',
  fontWeight: 500, background: 'var(--input-bg,white)',
  resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
const fIn  = e => { e.currentTarget.style.borderColor = purple; e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'var(--border,#e5e7eb)'; e.currentTarget.style.boxShadow = 'none'; };

const Btn = ({ children, onClick, disabled, variant = 'primary', type = 'button' }) => {
  const v = {
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', boxShadow: 'none' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...v[variant], display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 20px', borderRadius: 10, fontSize: '0.83rem', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      transition: 'opacity 0.15s, transform 0.1s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >{children}</button>
  );
};

const FieldLabel = ({ children, required }) => (
  <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8 }}>
    {children}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
  </p>
);

const PREDEFINED = [
  'Out of scope for our services',
  'Insufficient information provided',
  'Unable to meet requested timeline',
  'Product/service not available',
  'Budget constraints',
  'Request duplicate or invalid',
];

/**
 * RejectModal — purple design system
 */
const RejectModal = ({ onClose, onReject }) => {
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const togglePredefined = (r) =>
    setReason(prev => prev.includes(r) ? prev.replace(r, '').replace(/\n{3,}/g, '\n\n').trim() : prev ? `${prev}\n${r}` : r);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Please provide a reason for rejection'); return; }
    setSubmitting(true); setError(null);
    try {
      await onReject(reason.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject request');
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: '#ef4444' }}>Reject Quote Request</span>}>
      <form onSubmit={handleSubmit}>

        {/* Warning banner */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '4px solid #f59e0b', marginBottom: 20 }}>
          <AlertCircle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e', margin: '0 0 3px' }}>This action cannot be undone</p>
            <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0, lineHeight: 1.5 }}>
              The customer will be notified via email. Provide a clear, professional reason.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Predefined chips */}
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Quick Reasons — click to add</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PREDEFINED.map(r => {
              const active = reason.includes(r);
              return (
                <button key={r} type="button" onClick={() => togglePredefined(r)} style={{
                  padding: '5px 12px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? 'rgba(239,68,68,0.08)' : 'white',
                  border: `1.5px solid ${active ? '#ef4444' : '#e5e7eb'}`,
                  color: active ? '#ef4444' : '#6b7280',
                }}>
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Textarea */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel required>Rejection Reason</FieldLabel>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={6}
            placeholder="Explain why this request is being rejected. Be clear and professional — the customer will see this message."
            style={taStyle}
            onFocus={fIn}
            onBlur={fOut}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>The customer will receive this reason via email</p>
            <span style={{ fontSize: '0.7rem', color: reason.length < 20 ? '#ef4444' : '#9ca3af' }}>
              {reason.length} chars{reason.length < 20 ? ' (min 20)' : ''}
            </span>
          </div>
        </div>

        {/* Info box */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: purpleLt, border: `1px solid ${purpleBd}`, marginBottom: 24 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 10 }}>What happens next</p>
          {[
            'The request status will change to "Rejected"',
            'The customer will receive an email notification',
            'The rejection reason will be visible to the customer',
            'The customer can submit a new request if needed',
          ].map(s => (
            <p key={s} style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 5px', display: 'flex', gap: 7 }}>
              <span style={{ color: purple, fontWeight: 700, flexShrink: 0 }}>·</span>{s}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn variant="danger" type="submit" disabled={submitting || !reason.trim()}>
            {submitting
              ? <><LoadingSpinner size="sm" />&nbsp;Rejecting…</>
              : <><XCircle size={15} />Reject Request</>}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default RejectModal;