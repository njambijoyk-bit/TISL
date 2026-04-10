import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, X } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';

const ROLE_LABELS = {
  customer_owner:  'Owner',
  customer_editor: 'Editor',
  customer_viewer: 'Viewer',
  admin_owner:     'Project Manager',
  admin_manager:   'Manager',
  admin_finance:   'Finance',
  admin_support:   'Support',
  admin_viewer:    'Viewer',
};

const STATUS_CONFIG = {
  active:  { color: '#6ee7b7', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)'  },
  invited: { color: '#fcd34d', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)'  },
  removed: { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.28)' },
};

// Shared input style — hardcoded against dark surface
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
  border: '1.5px solid rgba(168,85,247,0.22)', outline: 'none',
  background: 'rgba(168,85,247,0.06)', color: 'var(--color-text-primary)',
  boxSizing: 'border-box', transition: 'border-color 150ms, box-shadow 150ms',
};

const inputFocus = (e) => {
  e.currentTarget.style.borderColor = '#a855f7';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(168,85,247,0.12)';
};
const inputBlur = (e) => {
  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)';
  e.currentTarget.style.boxShadow   = 'none';
};

const ParticipantList = ({ project, permissions }) => {
  const { participants, loading, customerInviteParticipant } = useProjectStore();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ customer_id: '', role: 'customer_viewer' });

  const canInvite = permissions?.role === 'customer_owner';
  const active    = participants.filter(p => p.status !== 'removed');

  const getName = (p) => {
    if (p.participant_type === 'admin') return p.admin_user?.name || '—';
    const c = p.customer;
    if (!c) return '—';
    if (c.first_name || c.last_name) return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    return c.name || c.email || '—';
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.customer_id) return toast.error('Enter a customer ID.');
    const res = await customerInviteParticipant(project.id, {
      customer_id: Number(inviteForm.customer_id),
      role: inviteForm.role,
    });
    if (res.success) {
      toast.success('Invitation sent.');
      setShowInvite(false);
      setInviteForm({ customer_id: '', role: 'customer_viewer' });
    } else {
      toast.error(res.error || 'Failed to send invitation.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc', margin: 0 }}>
          Team{' '}
          <span style={{ color: '#6b7280', fontWeight: 600 }}>({active.length})</span>
        </p>
        {canInvite && (
          <button onClick={() => setShowInvite(v => !v)} type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: showInvite ? 'rgba(168,85,247,0.15)' : 'linear-gradient(135deg,#a855f7,#7c3aed)',
              color: showInvite ? '#c084fc' : '#f1f0ff',
              fontWeight: 700, fontSize: '0.72rem',
              boxShadow: showInvite ? 'none' : '0 2px 10px rgba(168,85,247,0.3)',
              border: showInvite ? '1px solid rgba(168,85,247,0.3)' : 'none',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => { if (!showInvite) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
            onMouseLeave={e => { if (!showInvite) e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'; }}>
            {showInvite
              ? <><X style={{ width: 11, height: 11 }} /> Cancel</>
              : <><UserPlus style={{ width: 11, height: 11 }} /> Invite</>}
          </button>
        )}
      </div>

      {/* ── Invite form ── */}
      {showInvite && (
        <div style={{
          borderRadius: 12, padding: 16,
          background: 'rgba(168,85,247,0.05)',
          border: '1px solid rgba(168,85,247,0.2)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <p style={{
            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: '#7c3aed', margin: 0,
          }}>
            Invite a customer
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              type="number" placeholder="Customer ID"
              value={inviteForm.customer_id}
              onChange={e => setInviteForm(f => ({ ...f, customer_id: e.target.value }))}
              style={inputStyle}
              onFocus={inputFocus} onBlur={inputBlur}
            />
            <select
              value={inviteForm.role}
              onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
              style={inputStyle}
              onFocus={inputFocus} onBlur={inputBlur}>
              <option value="customer_viewer" style={{ background: '#1e1b2e', color: '#e2e8f0' }}>Viewer</option>
              <option value="customer_editor" style={{ background: '#1e1b2e', color: '#e2e8f0' }}>Editor</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleInvite} disabled={loading.submitting} type="button"
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none',
                cursor: loading.submitting ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#f1f0ff', fontWeight: 700, fontSize: '0.75rem',
                opacity: loading.submitting ? 0.6 : 1,
                boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
              }}>
              {loading.submitting ? 'Sending…' : 'Send Invite'}
            </button>
            <button onClick={() => setShowInvite(false)} type="button"
              style={{
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid rgba(168,85,247,0.22)',
                cursor: 'pointer', background: 'transparent',
                color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem',
                transition: 'border-color 150ms, color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading.participants ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              height: 52, borderRadius: 12,
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.1)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      ) : active.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
          No participants yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {active.map(p => {
            const name     = getName(p);
            const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const scfg     = STATUS_CONFIG[p.status] || STATUS_CONFIG.active;
            const isStaff  = p.participant_type === 'admin';

            return (
              <div key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12,
                  border: '1px solid rgba(168,85,247,0.18)',
                  background: 'rgba(168,85,247,0.03)',
                  transition: 'border-color 160ms, background 160ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.38)';
                  e.currentTarget.style.background  = 'rgba(168,85,247,0.07)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)';
                  e.currentTarget.style.background  = 'rgba(168,85,247,0.03)';
                }}>

                {/* Avatar — transparent, purple initials, faint ring */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700,
                  color: '#c084fc',
                  background: 'transparent',
                  border: '1.5px solid rgba(168,85,247,0.25)',
                }}>
                  {initials}
                </div>

                {/* Name + role */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    fontSize: '0.84rem', fontWeight: 600, color: 'var(--color-text-primary)',
                    margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{name}</p>
                  <p style={{ fontSize: '0.71rem', color: '#6b7280', margin: '2px 0 0' }}>
                    {ROLE_LABELS[p.role] || p.role}
                    {isStaff && (
                      <span style={{
                        marginLeft: 6, fontSize: '0.65rem', fontWeight: 700,
                        color: '#818cf8', background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.28)',
                        padding: '1px 6px', borderRadius: 20,
                      }}>Staff</span>
                    )}
                  </p>
                </div>

                {/* Status pill */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 20, flexShrink: 0,
                  fontSize: '0.68rem', fontWeight: 700, textTransform: 'capitalize',
                  color: scfg.color, background: scfg.bg, border: `1px solid ${scfg.border}`,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: scfg.color, flexShrink: 0 }} />
                  {p.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParticipantList;