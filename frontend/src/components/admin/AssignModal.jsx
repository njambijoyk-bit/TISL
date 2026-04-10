import React, { useState, useEffect } from 'react';
import { UserCheck, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import LoadingSpinner from '../layout/LoadingSpinner';
import api from '../../api/axios';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const iStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1.5px solid var(--border,#e5e7eb)', fontSize: '0.83rem',
  outline: 'none', color: 'var(--text,#111827)', boxSizing: 'border-box',
  fontWeight: 500, background: 'var(--input-bg,white)', appearance: 'none',
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
 * AssignModal — purple design system
 */
const AssignModal = ({ onClose, onAssign, currentAssignedId = null }) => {
  const [admins,        setAdmins]        = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState(currentAssignedId ? String(currentAssignedId) : '');
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState(null);

  useEffect(() => { fetchAdmins(); }, []);

  const fetchAdmins = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/admin/users', { params: { per_page: 200 } });
      const all = r.data.data || r.data;
      setAdmins(Array.isArray(all) ? all.filter(u => u.role !== 'customer') : []);
    } catch {
      setError('Failed to load staff users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAdmin) { setError('Please select a staff member to assign'); return; }
    setSubmitting(true); setError(null);
    try {
      const adminId = parseInt(selectedAdmin, 10);
      if (isNaN(adminId)) throw new Error('Invalid user ID');
      await onAssign(adminId);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to assign ticket');
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: '#a855f7' }}>Assign Staff Member</span>} size="md">
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: '0.83rem', color: '#6b7280', marginBottom: 20, lineHeight: 1.65 }}>
          Select a staff member to handle this ticket. They will be responsible for responding to and resolving the customer's issue.
        </p>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Select */}
        <div style={{ marginBottom: 20 }}>
          <FieldLabel required>Assign To</FieldLabel>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
              <LoadingSpinner size="md" />
            </div>
          ) : admins.length === 0 ? (
            <p style={{ fontSize: '0.83rem', color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No staff users found</p>
          ) : (
            <select
              value={selectedAdmin}
              onChange={e => setSelectedAdmin(e.target.value)}
              style={iStyle}
              onFocus={fIn}
              onBlur={fOut}
            >
              <option value="">Select a staff member…</option>
              {admins.map(a => (
                <option key={a.id} value={String(a.id)}>
                  {a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Unnamed'}
                  {a.email ? ` (${a.email})` : ''}
                  {a.id === currentAssignedId ? ' — Currently Assigned' : ''}
                </option>
              ))}
            </select>
          )}
          <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 6 }}>The assigned staff member will be notified about this ticket</p>
        </div>

        {/* Info box */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: purpleLt, border: `1px solid ${purpleBd}`, marginBottom: 24 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 10 }}>What happens next</p>
          {[
            'The ticket status will change to "In Progress"',
            'The assigned staff member will be notified',
            'They will review and respond to the customer directly',
          ].map(s => (
            <p key={s} style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 5px', display: 'flex', gap: 7 }}>
              <span style={{ color: purple, fontWeight: 700, flexShrink: 0 }}>·</span>{s}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn type="submit" disabled={submitting || loading || !selectedAdmin}>
            {submitting
              ? <><LoadingSpinner size="sm" />&nbsp;Assigning…</>
              : <><UserCheck size={15} />Assign Ticket</>}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default AssignModal;