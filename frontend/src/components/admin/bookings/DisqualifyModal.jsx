import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 9, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms', resize: 'none',
};

const DisqualifyModal = ({ booking, isDisqualified, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const isReactivate = isDisqualified;
  const customerName = `${booking?.customer?.first_name ?? ''} ${booking?.customer?.last_name ?? ''}`.trim();

  const handleSubmit = async () => {
    if (!isReactivate && !reason.trim()) {
      toast.error('Please provide a reason.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ reason: reason.trim() || undefined });
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message ?? 'Action failed');
    } finally { setSaving(false); }
  };

  const accent = isReactivate ? '#16a34a' : '#dc2626';
  const accentBg = isReactivate ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)';
  const accentBorder = isReactivate ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'white', borderRadius: 18,
        border: `1px solid ${accentBorder}`,
        boxShadow: `0 20px 60px ${accentBg}`,
        overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: isReactivate ? 'linear-gradient(90deg,#16a34a,#059669)' : 'linear-gradient(90deg,#dc2626,#b91c1c)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isReactivate
                ? <CheckCircle size={18} style={{ color: accent }} />
                : <AlertTriangle size={18} style={{ color: accent }} />
              }
            </div>
            <div>
              <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                {isReactivate ? 'Reactivate Customer' : 'Disqualify Customer'}
              </p>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{customerName}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = accent}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          ><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: accentBg, border: `1px solid ${accentBorder}` }}>
            <p style={{ fontSize: '0.78rem', color: accent, fontWeight: 600, margin: 0 }}>
              {isReactivate
                ? `This will allow ${customerName} to place bookings again.`
                : `${customerName} will be blocked from placing any new bookings until reactivated.`
              }
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 6 }}>
              {isReactivate ? 'Reactivation notes' : 'Reason for disqualification'}
              {!isReactivate && <span style={{ color: '#ef4444' }}> *</span>}
            </label>
            <textarea
              rows={3} value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={isReactivate ? 'Optional notes about this reactivation…' : 'Explain why this customer is being disqualified…'}
              style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = accent}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(168,85,247,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(168,85,247,0.2)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            padding: '7px 18px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 700,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: isReactivate ? 'linear-gradient(135deg,#16a34a,#059669)' : 'linear-gradient(135deg,#dc2626,#b91c1c)',
            color: 'white', opacity: saving ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {saving ? 'Processing…' : isReactivate ? 'Reactivate' : 'Disqualify'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DisqualifyModal;