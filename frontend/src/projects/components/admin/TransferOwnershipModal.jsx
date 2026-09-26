import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useProjectStore from '../../../_shared/store/projectStore';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};

// ── Modal ─────────────────────────────────────────────────────────────────────

const TransferOwnershipModal = ({ project, onClose }) => {
  const { transferOwnership, participants, loading } = useProjectStore();
  const [newOwnerId, setNewOwnerId] = useState('');

  const eligible = participants.filter(
    (p) =>
      p.participant_type === 'admin' &&
      p.status === 'active' &&
      p.admin_user_id !== project.owner_admin_id
  );

  const handleSubmit = async () => {
    if (!newOwnerId) return toast.error('Please select a new owner.');
    const res = await transferOwnership(project.id, { new_owner_admin_id: Number(newOwnerId) });
    if (res.success) { toast.success('Ownership transferred successfully.'); onClose(); }
    else toast.error(res.error || 'Failed to transfer ownership.');
  };

  const isBusy     = loading.submitting;
  const isDisabled = !newOwnerId || isBusy || eligible.length === 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        display: 'flex', flexDirection: 'column',
        borderRadius: 18, overflow: 'hidden',
        background: 'white',
        border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>

        {/* Accent strip */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,var(--color-primary-500),var(--color-primary-600))' }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)',
        }}>
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-500)', margin: 0 }}>
              Transfer Ownership
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
              {project.title}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', display: 'flex', padding: 4, borderRadius: 6,
            transition: 'color 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Info blurb */}
          <p style={{
            fontSize: '0.8rem', color: '#4b5563', margin: 0,
            padding: '10px 14px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
            lineHeight: 1.6,
          }}>
            The current owner will be downgraded to{' '}
            <strong style={{ color: 'var(--color-primary-600)' }}>Admin Manager</strong>. The new owner
            will have full control over this project.
          </p>

          {/* Selector */}
          <div>
            <span style={labelStyle}>New Owner *</span>

            {/* Warning */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 7,
              padding: '8px 12px', borderRadius: 8, marginBottom: 10,
              background: 'rgba(217,119,6,0.08)',
              border: '1px solid rgba(217,119,6,0.22)',
            }}>
              <span style={{ fontSize: '0.78rem' }}>⚠</span>
              <p style={{ fontSize: '0.72rem', color: '#b45309', margin: 0, lineHeight: 1.5 }}>
                The selected staff member must already be an{' '}
                <strong>active participant</strong> on this project.
              </p>
            </div>

            {eligible.length === 0 ? (
              <p style={{
                fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic',
                padding: '10px 14px', borderRadius: 8, margin: 0,
                border: '1.5px dashed color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
              }}>
                No other active staff participants found. Add a staff participant first.
              </p>
            ) : (
              <select
                value={newOwnerId}
                onChange={e => setNewOwnerId(e.target.value)}
                style={inputStyle}
                onFocus={inputFocus} onBlur={inputBlur}
              >
                <option value="">Select a staff member…</option>
                {eligible.map((p) => (
                  <option key={p.id} value={p.admin_user_id}>
                    {p.admin_user?.name || `User #${p.admin_user_id}`} — {p.role.replace('admin_', '')}
                  </option>
                ))}
              </select>
            )}

            <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '7px 0 0' }}>
              Current owner:{' '}
              <strong style={{ color: '#6b7280' }}>
                {project.owner_admin?.name || `ID ${project.owner_admin_id}`}
              </strong>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px 14px',
          borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)',
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
            background: 'transparent', color: '#9ca3af',
            border: '1px solid color-mix(in srgb, var(--color-primary-500) 22%, transparent)', cursor: 'pointer',
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 45%, transparent)'; e.currentTarget.style.color = 'var(--color-primary-400)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 22%, transparent)'; e.currentTarget.style.color = '#9ca3af'; }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isDisabled} style={{
            padding: '6px 18px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
            border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
            boxShadow: '0 2px 10px color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
            opacity: isDisabled ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'box-shadow 150ms, opacity 150ms',
          }}
            onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.boxShadow = '0 4px 16px color-mix(in srgb, var(--color-primary-500) 45%, transparent)'; }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px color-mix(in srgb, var(--color-primary-500) 30%, transparent)'}>
            {isBusy && <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />}
            {isBusy ? 'Transferring…' : 'Transfer Ownership'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferOwnershipModal;