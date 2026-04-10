import React, { useState } from 'react';
import { MessageCircle, AlertCircle, HelpCircle } from 'lucide-react';
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

const PREDEFINED = [
  'Please provide more details about the specifications',
  'Can you clarify the timeline requirements?',
  'What is the exact delivery location?',
  'Please specify the quantity needed',
  'Can you provide technical specifications?',
  'What is your preferred budget range?',
  'Please clarify the service requirements',
  'Can you provide reference images or documents?',
];

/**
 * ClarificationModal — purple design system
 */
const ClarificationModal = ({ onClose, onRequest }) => {
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const togglePredefined = (q) =>
    setNotes(prev => prev.includes(q) ? prev.replace(q, '').replace(/\n{3,}/g, '\n\n').trim() : prev ? `${prev}\n\n${q}` : q);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!notes.trim()) { setError('Please provide clarification notes'); return; }
    setSubmitting(true); setError(null);
    try {
      await onRequest(notes.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request clarification');
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: '#a855f7' }}>Request Clarification</span>} size="lg">
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: '0.83rem', color: '#6b7280', marginBottom: 20, lineHeight: 1.65 }}>
          Request additional information from the customer. They will be notified and can respond directly.
        </p>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Predefined chips */}
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Common Questions — click to add</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PREDEFINED.map(q => {
              const active = notes.includes(q);
              return (
                <button key={q} type="button" onClick={() => togglePredefined(q)} style={{
                  padding: '5px 12px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                  background: active ? purpleLt : 'white',
                  border: `1.5px solid ${active ? purple : '#e5e7eb'}`,
                  color: active ? purple : '#6b7280',
                }}>
                  {q}
                </button>
              );
            })}
          </div>
        </div>

        {/* Textarea */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel required>Clarification Needed</FieldLabel>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={7}
            placeholder={'What information do you need from the customer?\n\nExamples:\n- Please provide dimensions for the product\n- Can you clarify the service location?\n- What is your target completion date?'}
            style={taStyle}
            onFocus={fIn}
            onBlur={fOut}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Be specific — the customer will see this message</p>
            <span style={{ fontSize: '0.7rem', color: notes.length < 30 ? '#f59e0b' : '#9ca3af' }}>
              {notes.length} chars{notes.length < 30 ? ' (30 recommended)' : ''}
            </span>
          </div>
        </div>

        {/* Tips */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: purpleLt, border: `1px solid ${purpleBd}`, marginBottom: 24 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={12} />Tips for clear requests
          </p>
          {[
            'Ask specific questions rather than general ones',
            'Number your questions if asking multiple things',
            'Explain why you need the information',
            'Provide examples if it helps clarify your question',
          ].map(s => (
            <p key={s} style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 5px', display: 'flex', gap: 7 }}>
              <span style={{ color: purple, fontWeight: 700, flexShrink: 0 }}>·</span>{s}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn type="submit" disabled={submitting || !notes.trim()}>
            {submitting
              ? <><LoadingSpinner size="sm" />&nbsp;Sending…</>
              : <><MessageCircle size={15} />Request Clarification</>}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default ClarificationModal;