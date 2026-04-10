import React, { useState } from 'react';
import { Send, AlertCircle, HelpCircle } from 'lucide-react';
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
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
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

/**
 * ClarificationResponseModal — purple design system
 */
const ClarificationResponseModal = ({ onClose, onSubmit, clarificationNotes }) => {
  const [response,   setResponse]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!response.trim())            { setError('Please provide a response'); return; }
    if (response.trim().length < 10) { setError('Response must be at least 10 characters'); return; }
    setSubmitting(true); setError(null);
    try {
      await onSubmit(response.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit response');
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: '#a855f7' }}>Respond to Clarification Request</span>} size="lg">
      <form onSubmit={handleSubmit}>

        {/* What was requested */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '4px solid #f59e0b', marginBottom: 20 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92400e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={12} />Information Requested
          </p>
          <p style={{ fontSize: '0.83rem', color: '#78350f', margin: 0, whiteSpace: 'pre-line', lineHeight: 1.65 }}>{clarificationNotes}</p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Response */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel required>Your Response</FieldLabel>
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            rows={7}
            placeholder={'Please provide the requested information…\n\nBe as detailed and specific as possible to help us process your quote request.'}
            style={taStyle}
            onFocus={fIn}
            onBlur={fOut}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Provide clear and detailed information</p>
            <span style={{ fontSize: '0.7rem', color: response.length < 10 ? '#f59e0b' : '#9ca3af' }}>
              {response.length} chars{response.length < 10 ? ' (min 10)' : ''}
            </span>
          </div>
        </div>

        {/* Tips */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: purpleLt, border: `1px solid ${purpleBd}`, marginBottom: 24 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={12} />Tips for a good response
          </p>
          {[
            'Answer each question clearly and completely',
            'Provide specific details, measurements, or quantities',
            'Include any relevant dates or timeframes',
            'Mention any additional information that might be helpful',
          ].map(s => (
            <p key={s} style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 5px', display: 'flex', gap: 7 }}>
              <span style={{ color: purple, fontWeight: 700, flexShrink: 0 }}>·</span>{s}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn type="submit" disabled={submitting || !response.trim() || response.trim().length < 10}>
            {submitting
              ? <><LoadingSpinner size="sm" />&nbsp;Submitting…</>
              : <><Send size={15} />Submit Response</>}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default ClarificationResponseModal;