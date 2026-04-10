import { useState } from 'react';
import { Pencil, Trash2, UserPlus, Users, X, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useProjectStore from '../../../store/projectStore';
import AddParticipantModal from './AddParticipantModal';

const ROLE_LABELS = {
  customer_owner:  'Customer Owner',
  customer_editor: 'Customer Editor',
  customer_viewer: 'Customer Viewer',
  admin_owner:     'Admin Owner',
  admin_manager:   'Admin Manager',
  admin_finance:   'Admin Finance',
  admin_support:   'Admin Support',
  admin_viewer:    'Admin Viewer',
};

// Status pill tokens — hardcoded against dark + light both
const STATUS_PILL = {
  active:  { color: '#6ee7b7', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)' },
  invited: { color: '#fcd34d', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)' },
  removed: { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.28)' },
};

const OWNER_ROLES = ['admin_owner', 'customer_owner'];

const fullName = (person) => {
  if (!person) return '—';
  if (person.first_name || person.last_name)
    return `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return person.name || person.email || '—';
};

// Initials avatar — same style as MessageThread
const Avatar = ({ name }) => {
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.65rem', fontWeight: 700,
      color: '#c084fc',
      background: 'transparent',
      border: '1.5px solid rgba(168,85,247,0.25)',
    }}>
      {initials}
    </div>
  );
};

const ParticipantsPanel = ({ project }) => {
  const { participants, loading, removeParticipant, updateParticipant, forceDeleteParticipant } = useProjectStore();
  const [showAdd, setShowAdd]             = useState(false);
  const [editingParticipant, setEditing]  = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showRemoved, setShowRemoved]     = useState(false);

  const active    = participants.filter((p) => p.status !== 'removed');
  const admins    = active.filter((p) => p.participant_type === 'admin');
  const customers = active.filter((p) => p.participant_type === 'customer');
  const removed   = participants.filter((p) => p.status === 'removed');

  const handleRemove = async () => {
    if (!confirmRemove) return;
    const res = await removeParticipant(project.id, confirmRemove.id);
    if (res.success) toast.success('Participant removed.');
    else toast.error(res.error || 'Failed to remove participant.');
    setConfirmRemove(null);
  };

  const handleRestore = async (p) => {
    const res = await updateParticipant(project.id, p.id, { status: 'active' });
    if (res.success) toast.success('Participant restored.');
    else toast.error(res.error || 'Failed to restore.');
  };

  const handleForceDelete = async (p) => {
    const res = await forceDeleteParticipant(project.id, p.id);
    if (res.success) toast.success('Participant deleted permanently.');
    else toast.error(res.error || 'Delete failed.');
  };

  const getName  = (p) => p.participant_type === 'admin' ? fullName(p.admin_user)  : fullName(p.customer);
  const getEmail = (p) => p.participant_type === 'admin' ? (p.admin_user?.email || '') : (p.customer?.email || '');
  const isOwner  = (p) => OWNER_ROLES.includes(p.role);

  const renderGroup = (list, title) => (
    <div>
      {/* Group label */}
      <p style={{
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: '#7c3aed', marginBottom: 10,
      }}>
        {title}
      </p>

      {list.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>None added yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((p) => {
            const name   = getName(p);
            const email  = getEmail(p);
            const spl    = STATUS_PILL[p.status] ?? STATUS_PILL.active;
            const owner  = isOwner(p);

            return (
              <div key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(168,85,247,0.18)',
                  background: 'rgba(168,85,247,0.03)',
                  transition: 'border-color 160ms, background 160ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)';
                  e.currentTarget.style.background  = 'rgba(168,85,247,0.06)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)';
                  e.currentTarget.style.background  = 'rgba(168,85,247,0.03)';
                }}>

                {/* Avatar + name/email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar name={name} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{name}</p>
                    <p style={{
                      fontSize: '0.72rem', color: '#6b7280',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{email}</p>
                  </div>
                </div>

                {/* Right side: role + status + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* Role label */}
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 600, color: '#c084fc',
                    background: 'rgba(168,85,247,0.1)',
                    border: '1px solid rgba(168,85,247,0.22)',
                    padding: '2px 8px', borderRadius: 20,
                    whiteSpace: 'nowrap',
                  }}>
                    {ROLE_LABELS[p.role] || p.role}
                  </span>

                  {/* Status pill */}
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700,
                    color: spl.color, background: spl.bg, border: `1px solid ${spl.border}`,
                    padding: '2px 8px', borderRadius: 20,
                    whiteSpace: 'nowrap',
                  }}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </span>

                  {/* Edit */}
                  <button
                    onClick={() => setEditing(p)}
                    title="Edit participant"
                    style={{
                      padding: 5, borderRadius: 7, background: 'transparent', border: 'none',
                      cursor: 'pointer', color: '#6b7280', display: 'flex',
                      transition: 'color 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#c084fc'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
                    <Pencil style={{ width: 13, height: 13 }} />
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => !owner && setConfirmRemove(p)}
                    disabled={owner}
                    title={owner ? 'Cannot remove the project owner' : 'Remove participant'}
                    style={{
                      padding: 5, borderRadius: 7, background: 'transparent', border: 'none',
                      cursor: owner ? 'not-allowed' : 'pointer',
                      color: owner ? '#374151' : '#6b7280',
                      opacity: owner ? 0.4 : 1,
                      display: 'flex',
                      transition: 'color 120ms, background 120ms',
                    }}
                    onMouseEnter={e => { if (!owner) { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}}
                    onMouseLeave={e => { e.currentTarget.style.color = owner ? '#374151' : '#6b7280'; e.currentTarget.style.background = 'transparent'; }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users style={{ width: 14, height: 14, color: '#a855f7' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc' }}>
            Participants ({active.length})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {removed.length > 0 && (
            <button
              onClick={() => setShowRemoved(true)}
              style={{
                padding: '5px 12px', fontSize: '0.72rem', fontWeight: 600,
                borderRadius: 8, cursor: 'pointer',
                color: '#9ca3af', background: 'transparent',
                border: '1px solid rgba(156,163,175,0.25)',
                transition: 'border-color 150ms, color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)'; e.currentTarget.style.color = '#c084fc'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(156,163,175,0.25)'; e.currentTarget.style.color = '#9ca3af'; }}>
              Removed ({removed.length})
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', fontSize: '0.72rem', fontWeight: 700,
              borderRadius: 8, cursor: 'pointer', color: '#f1f0ff',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
              border: 'none',
              boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
              transition: 'box-shadow 150ms, opacity 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
            <UserPlus style={{ width: 12, height: 12 }} />
            Add Participant
          </button>
        </div>
      </div>

      {/* Skeleton */}
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
      ) : (
        <>
          {renderGroup(admins, 'Staff')}
          <div style={{ borderTop: '1px solid rgba(168,85,247,0.12)', paddingTop: 20 }}>
            {renderGroup(customers, 'Customer Side')}
          </div>
        </>
      )}

      {/* ── Add / Edit modal ── */}
      {showAdd && (
        <AddParticipantModal project={project} onClose={() => setShowAdd(false)} />
      )}
      {editingParticipant && (
        <AddParticipantModal
          project={project}
          editParticipant={editingParticipant}
          onClose={() => setEditing(null)}
        />
      )}

      {/* ── Removed participants modal ── */}
      {showRemoved && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          padding: 16,
        }}>
          <div style={{
            width: '100%', maxWidth: 520, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column',
            borderRadius: 16, overflow: 'hidden',
            background: '#0f0d1a',
            border: '1px solid rgba(168,85,247,0.25)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(168,85,247,0.12)',
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c084fc' }}>
                Removed Participants ({removed.length})
              </span>
              <button onClick={() => setShowRemoved(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = '#c084fc'}
                onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
                <X style={{ width: 15, height: 15 }} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {removed.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>No removed participants.</p>
              ) : removed.map((p) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '10px 14px', borderRadius: 12,
                  border: '1px solid rgba(168,85,247,0.15)',
                  background: 'rgba(168,85,247,0.03)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar name={getName(p)} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#d1d5db' }}>{getName(p)}</p>
                      <p style={{ fontSize: '0.71rem', color: '#6b7280' }}>{getEmail(p)}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleRestore(p)}
                      disabled={loading.submitting}
                      style={{
                        padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700,
                        borderRadius: 7, cursor: 'pointer', border: 'none',
                        color: '#f0fdf4', background: 'rgba(16,185,129,0.2)',
                        border: '1px solid rgba(16,185,129,0.35)',
                        opacity: loading.submitting ? 0.6 : 1,
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.35)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.2)'}>
                      Restore
                    </button>
                    <button
                      onClick={() => handleForceDelete(p)}
                      disabled={loading.submitting}
                      style={{
                        padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700,
                        borderRadius: 7, cursor: 'pointer',
                        color: '#fca5a5', background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        opacity: loading.submitting ? 0.6 : 1,
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Remove confirm modal ── */}
      {confirmRemove && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          padding: 16,
        }}>
          <div style={{
            width: '100%', maxWidth: 380, borderRadius: 16, overflow: 'hidden',
            background: '#0f0d1a',
            border: '1px solid rgba(168,85,247,0.25)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            {/* Red accent strip */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }} />

            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AlertTriangle style={{ width: 16, height: 16, color: '#f87171' }} />
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f1f0ff' }}>
                  Remove Participant
                </span>
              </div>

              <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.6, marginBottom: 20 }}>
                Remove <strong style={{ color: '#e2e8f0' }}>{getName(confirmRemove)}</strong> from this project?
              </p>

              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                paddingTop: 16, borderTop: '1px solid rgba(168,85,247,0.12)',
              }}>
                <button onClick={() => setConfirmRemove(null)}
                  style={{
                    padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                    borderRadius: 8, cursor: 'pointer',
                    color: '#9ca3af', background: 'transparent',
                    border: '1px solid rgba(168,85,247,0.22)',
                    transition: 'border-color 150ms, color 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  Cancel
                </button>
                <button onClick={handleRemove} disabled={loading.submitting}
                  style={{
                    padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700,
                    borderRadius: 8, cursor: 'pointer', border: 'none',
                    color: '#fff',
                    background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                    boxShadow: '0 2px 10px rgba(239,68,68,0.35)',
                    opacity: loading.submitting ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'box-shadow 150ms',
                  }}
                  onMouseEnter={e => { if (!loading.submitting) e.currentTarget.style.boxShadow = '0 4px 16px rgba(239,68,68,0.5)'; }}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(239,68,68,0.35)'}>
                  {loading.submitting && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantsPanel;