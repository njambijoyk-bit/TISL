import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Shield, Lock, Unlock, KeyRound,
  UserX, UserCheck, Trash2, RotateCcw, Mail,
  Phone, Building2, Calendar, BadgeCheck,
  AlertCircle, Clock, Monitor, MapPin, Save, Eye, EyeOff,
  Edit2, X, Check, User, FileText, Bell, Settings,
} from 'lucide-react';
import useUsersStore from '../../../store/usersStore';
import { useAuthStore } from '../../../store';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_META = {
  super_admin: { label: 'Super Admin', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  ring: 'rgba(124,58,237,0.25)' },
  admin:       { label: 'Admin',       color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   ring: 'rgba(37,99,235,0.25)'  },
  manager:     { label: 'Manager',     color: '#0891b2', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.25)'  },
  sales_rep:   { label: 'Sales Rep',   color: '#059669', bg: 'rgba(5,150,105,0.1)',   ring: 'rgba(5,150,105,0.25)'  },
  customer:    { label: 'Customer',    color: '#d97706', bg: 'rgba(217,119,6,0.1)',   ring: 'rgba(217,119,6,0.25)'  },
};

const STATUS_STYLES = {
  active:               { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)'  },
  inactive:             { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)'  },
  suspended:            { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
  pending_verification: { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
};

const ROLES_ASSIGNABLE = ['admin', 'manager', 'sales_rep', 'customer'];
const LEVELS = { super_admin: 1, admin: 2, manager: 3, sales_rep: 4, customer: 5 };

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
  padding: 20,
};

const sectionHeader = {
  fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed',
  display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDT   = (d) => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ children, bg, color, ring }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`,
    }}>
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, icon, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon} {label}
      </span>
      <div style={{ fontSize: '0.82rem', color: '#374151' }}>{value}</div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, loading, danger, primary }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '7px 13px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
      fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.6 : 1, transition: 'all 150ms',
      ...(primary ? {
        background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
        border: 'none', boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
      } : danger ? {
        background: 'rgba(239,68,68,0.06)', color: '#b91c1c',
        border: '1.5px solid rgba(239,68,68,0.2)',
      } : {
        background: 'transparent', color: '#6b7280',
        border: '1.5px solid rgba(168,85,247,0.18)',
      }),
    }}
      onMouseEnter={e => {
        if (!loading) {
          if (primary) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)';
          else if (danger) e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
          else { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.color = '#a855f7'; }
        }
      }}
      onMouseLeave={e => {
        if (primary) e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)';
        else if (danger) e.currentTarget.style.background = 'rgba(239,68,68,0.06)';
        else { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.color = '#6b7280'; }
      }}
    >
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

function SkeletonBlock({ height }) {
  return <div style={{ height, borderRadius: 12, background: 'rgba(168,85,247,0.07)', marginBottom: 16 }} />;
}

// ── Modals ────────────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 400, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>{title}</p>
            {subtitle && <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResetPasswordModal({ onClose, onConfirm, loading }) {
  const [password, setPassword] = useState('');
  const [show,     setShow]     = useState(false);
  const [error,    setError]    = useState('');

  return (
    <Modal title="Reset Password" subtitle="Set a temporary password. The user must change it on next login." onClose={onClose}>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          type={show ? 'text' : 'password'} value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="New temporary password"
          style={{ ...inputStyle, paddingRight: 36, borderColor: error ? '#ef4444' : 'rgba(168,85,247,0.18)' }}
          onFocus={inputFocus} onBlur={inputBlur}
        />
        <button type="button" onClick={() => setShow(s => !s)} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex',
        }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {error && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{
          flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
          background: 'transparent', border: '1.5px solid rgba(168,85,247,0.18)', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
        <button onClick={() => {
          if (password.length < 8) { setError('At least 8 characters required.'); return; }
          onConfirm(password);
        }} disabled={loading} style={{
          flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
          border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </div>
    </Modal>
  );
}

function LockAccountModal({ onClose, onConfirm, loading }) {
  const [duration, setDuration] = useState(60);
  const presets = [
    { label: '30 min',  value: 30    },
    { label: '1 hour',  value: 60    },
    { label: '6 hours', value: 360   },
    { label: '24 hours',value: 1440  },
    { label: '1 week',  value: 10080 },
  ];

  return (
    <Modal title="Lock Account" subtitle="The user will be signed out immediately and unable to log in for the selected duration." onClose={onClose}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {presets.map(p => (
          <button key={p.value} onClick={() => setDuration(p.value)} style={{
            padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
            background: duration === p.value ? 'rgba(168,85,247,0.1)' : 'transparent',
            border: `1.5px solid ${duration === p.value ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.18)'}`,
            color: duration === p.value ? '#7c3aed' : '#9ca3af',
          }}>
            {p.label}
          </button>
        ))}
      </div>
      <Field label="Custom duration (minutes)">
        <input type="number" min={1} max={10080} value={duration}
          onChange={e => setDuration(parseInt(e.target.value) || 60)}
          style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
        />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{
          flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
          background: 'transparent', border: '1.5px solid rgba(168,85,247,0.18)', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
        <button onClick={() => onConfirm(duration)} disabled={loading} style={{
          flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
          border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          background: 'rgba(239,68,68,0.9)', color: 'white', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? 'Locking…' : 'Lock account'}
        </button>
      </div>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UserDetail() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { user: currentAdmin } = useAuthStore();

  const {
    currentUser: user, loading, actionLoading,
    fetchUserById, updateUser, deleteUser, restoreUser,
    updateStatus, unlockUser, forcePasswordReset, resetPassword,
    clearCurrentUser, verifyEmail, unverifyEmail,
    verifyPhone, unverifyPhone, lockAccount,
  } = useUsersStore();

  const [tab,             setTab]             = useState('profile');
  const [editMode,        setEditMode]        = useState(false);
  const [formData,        setFormData]        = useState({});
  const [showResetModal,  setShowResetModal]  = useState(false);
  const [showLockModal,   setShowLockModal]   = useState(false);

  useEffect(() => {
    fetchUserById(id);
    return () => clearCurrentUser();
  }, [id]);

  useEffect(() => {
    if (user) {
      setFormData({
        name:                user.name || '',
        email:               user.email || '',
        phone:               user.phone || '',
        company_name:        user.company_name || '',
        role:                user.role || '',
        employee_id:         user.employee_id || '',
        department:          user.department || '',
        bio:                 user.bio || '',
        hired_at:            user.hired_at ? user.hired_at.slice(0, 10) : '',
        email_notifications: user.email_notifications ?? true,
        sms_notifications:   user.sms_notifications   ?? false,
      });
    }
  }, [user]);

  const isLocked  = user?.locked_until && new Date(user.locked_until) > new Date();
  const canManage = user ? LEVELS[currentAdmin?.role] < LEVELS[user.role] : false;
  const isStaff   = ['admin', 'manager', 'sales_rep'].includes(user?.role);
  const rm        = ROLE_META[user?.role]        ?? ROLE_META.customer;
  const st        = STATUS_STYLES[user?.status]  ?? STATUS_STYLES.inactive;

  const setF = (k) => (v) => setFormData(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    try { await updateUser(id, formData); toast.success('User updated.'); setEditMode(false); }
    catch (err) { toast.error(err.response?.data?.message || 'Update failed.'); }
  };

  const handleStatusChange = async (status) => {
    try { await updateStatus(id, status); toast.success(`Status set to ${status}.`); }
    catch { toast.error('Failed to update status.'); }
  };

  const handleUnlock     = async () => { try { await unlockUser(id); toast.success('Account unlocked.'); } catch { toast.error('Failed.'); } };
  const handleForceReset = async () => { try { await forcePasswordReset(id); toast.success('Password reset required on next login.'); } catch { toast.error('Failed.'); } };
  const handleVerifyEmail = async () => {
    try { await (user.email_verified_at ? unverifyEmail(id) : verifyEmail(id)); toast.success('Email verification updated.'); }
    catch { toast.error('Failed.'); }
  };
  const handleVerifyPhone = async () => {
    try { await (user.phone_verified_at ? unverifyPhone(id) : verifyPhone(id)); toast.success('Phone verification updated.'); }
    catch { toast.error('Failed.'); }
  };
  const handleDelete = async () => {
    if (!confirm('Delete this user?')) return;
    try { await deleteUser(id); toast.success('User deleted.'); navigate('/admin/users'); }
    catch { toast.error('Failed.'); }
  };
  const handleRestore = async () => { try { await restoreUser(id); toast.success('User restored.'); } catch { toast.error('Failed.'); } };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading || !user) return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <SkeletonBlock height={48} />
      <SkeletonBlock height={120} />
      <SkeletonBlock height={280} />
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Back ── */}
      <button onClick={() => navigate('/admin/users')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.82rem', color: '#9ca3af', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', transition: 'color 150ms',
      }}
        onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
      >
        <ChevronLeft size={16} /> Users
      </button>

      {/* ── Profile hero ── */}
      <div style={{ ...card, padding: 24, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
        {/* accent strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${rm.color},#7c3aed)` }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', paddingTop: 4 }}>

          {/* Avatar */}
          <div style={{
            width: 64, height: 64, borderRadius: 14, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: rm.bg, color: rm.color,
            fontSize: '1.5rem', fontWeight: 800,
            boxShadow: `0 0 0 1px ${rm.ring}`,
          }}>
            {user.name?.[0]?.toUpperCase() ?? '?'}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0 }}>{user.name}</h1>
              <Badge bg={rm.bg} color={rm.color} ring={rm.ring}>{rm.label}</Badge>
              <Badge bg={st.bg} color={st.color} ring={st.ring}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                {user.status?.replace('_', ' ')}
              </Badge>
              {isLocked && (
                <Badge bg="rgba(245,158,11,0.1)" color="#b45309" ring="rgba(245,158,11,0.25)">
                  <Lock size={9} /> Locked
                </Badge>
              )}
              {user.deleted_at && (
                <Badge bg="rgba(239,68,68,0.08)" color="#b91c1c" ring="rgba(239,68,68,0.2)">
                  <Trash2 size={9} /> Deleted
                </Badge>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Mail size={12} style={{ color: '#c4b5fd' }} /> {user.email}
            </p>
            {user.phone && (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Phone size={12} style={{ color: '#c4b5fd' }} /> {user.phone}
              </p>
            )}
          </div>

          {/* Actions */}
          {canManage && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {!user.deleted_at ? (
                <>
                  {editMode
                    ? <><ActionBtn icon={Save} label="Save" onClick={handleSave} loading={actionLoading} primary /><ActionBtn icon={X} label="Cancel" onClick={() => setEditMode(false)} /></>
                    : <ActionBtn icon={Edit2} label="Edit" onClick={() => setEditMode(true)} />
                  }
                  {isLocked && <ActionBtn icon={Unlock} label="Unlock" onClick={handleUnlock} loading={actionLoading} />}
                  <ActionBtn icon={KeyRound} label="Force reset" onClick={handleForceReset} loading={actionLoading} />
                  <ActionBtn icon={KeyRound} label="Reset password" onClick={() => setShowResetModal(true)} />
                  {user.status === 'suspended'
                    ? <ActionBtn icon={UserCheck} label="Activate" onClick={() => handleStatusChange('active')}    loading={actionLoading} />
                    : <ActionBtn icon={UserX}     label="Suspend"  onClick={() => handleStatusChange('suspended')} loading={actionLoading} danger />
                  }
                  <ActionBtn
                    icon={user.email_verified_at ? BadgeCheck : AlertCircle}
                    label={user.email_verified_at ? 'Unverify email' : 'Verify email'}
                    onClick={handleVerifyEmail} loading={actionLoading}
                  />
                  {user.phone && (
                    <ActionBtn
                      icon={user.phone_verified_at ? BadgeCheck : AlertCircle}
                      label={user.phone_verified_at ? 'Unverify phone' : 'Verify phone'}
                      onClick={handleVerifyPhone} loading={actionLoading}
                    />
                  )}
                  {!isLocked && <ActionBtn icon={Lock} label="Lock account" onClick={() => setShowLockModal(true)} danger />}
                  <ActionBtn icon={Trash2} label="Delete" onClick={handleDelete} loading={actionLoading} danger />
                </>
              ) : (
                <ActionBtn icon={RotateCcw} label="Restore" onClick={handleRestore} loading={actionLoading} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar + content ── */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '2px solid rgba(168,85,247,0.1)', padding: '0 20px' }}>
          {['profile', 'security'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '12px 16px', fontSize: '0.82rem', fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#a855f7' : '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2px solid ${tab === t ? '#a855f7' : 'transparent'}`,
              marginBottom: -2, textTransform: 'capitalize', transition: 'color 150ms',
            }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Profile tab ── */}
          {tab === 'profile' && (
            <>
              {/* Personal info */}
              <div>
                <p style={sectionHeader}><User size={14} style={{ color: '#c4b5fd' }} /> Personal information</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Full name">
                    {editMode
                      ? <input value={formData.name} onChange={e => setF('name')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                      : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{user.name}</p>
                    }
                  </Field>
                  <Field label="Email">
                    {editMode
                      ? <input type="email" value={formData.email} onChange={e => setF('email')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                      : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{user.email}</p>
                    }
                  </Field>
                  <Field label="Phone">
                    {editMode
                      ? <input value={formData.phone} onChange={e => setF('phone')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                      : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{user.phone || '—'}</p>
                    }
                  </Field>
                  <Field label="Company">
                    {editMode
                      ? <input value={formData.company_name} onChange={e => setF('company_name')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                      : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{user.company_name || '—'}</p>
                    }
                  </Field>
                </div>
                {(editMode || user.bio) && (
                  <div style={{ marginTop: 14 }}>
                    <Field label="Bio">
                      {editMode
                        ? <textarea rows={3} value={formData.bio} onChange={e => setF('bio')(e.target.value)}
                            style={{ ...inputStyle, resize: 'none' }} onFocus={inputFocus} onBlur={inputBlur} />
                        : <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{user.bio}</p>
                      }
                    </Field>
                  </div>
                )}
              </div>

              {/* Role */}
              {canManage && editMode && (
                <div>
                  <p style={sectionHeader}><Shield size={14} style={{ color: '#c4b5fd' }} /> Role</p>
                  <select value={formData.role} onChange={e => setF('role')(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 180 }} onFocus={inputFocus} onBlur={inputBlur}>
                    {ROLES_ASSIGNABLE.filter(r => LEVELS[currentAdmin?.role] < LEVELS[r]).map(r => (
                      <option key={r} value={r}>{ROLE_META[r].label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Organizational (staff only) */}
              {isStaff && (
                <div>
                  <p style={sectionHeader}><Building2 size={14} style={{ color: '#c4b5fd' }} /> Organizational</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <Field label="Employee ID">
                      {editMode
                        ? <input value={formData.employee_id} onChange={e => setF('employee_id')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                        : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{user.employee_id || '—'}</p>
                      }
                    </Field>
                    <Field label="Department">
                      {editMode
                        ? <input value={formData.department} onChange={e => setF('department')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                        : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{user.department || '—'}</p>
                      }
                    </Field>
                    <Field label="Hired">
                      {editMode
                        ? <input type="date" value={formData.hired_at} onChange={e => setF('hired_at')(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                        : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{fmtDate(user.hired_at)}</p>
                      }
                    </Field>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {editMode && (
                <div>
                  <p style={sectionHeader}><Bell size={14} style={{ color: '#c4b5fd' }} /> Notifications</p>
                  <div style={{ display: 'flex', gap: 24 }}>
                    {[
                      { key: 'email_notifications', label: 'Email notifications' },
                      { key: 'sms_notifications',   label: 'SMS notifications'   },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#6b7280', userSelect: 'none' }}>
                        <input type="checkbox" checked={formData[key]} onChange={e => setF(key)(e.target.checked)}
                          style={{ accentColor: '#a855f7', width: 15, height: 15, cursor: 'pointer' }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Security tab ── */}
          {tab === 'security' && (
            <>
              {/* Account health */}
              <div>
                <p style={sectionHeader}><Shield size={14} style={{ color: '#c4b5fd' }} /> Account health</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <InfoRow label="Email verified" icon={<Mail size={11} />}
                    value={user.email_verified_at
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#065f46', fontWeight: 600, fontSize: '0.82rem' }}><BadgeCheck size={13} /> Verified {fmtDate(user.email_verified_at)}</span>
                      : <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#b45309', fontSize: '0.82rem' }}><AlertCircle size={13} /> Not verified</span>
                    }
                  />
                  <InfoRow label="Phone verified" icon={<Phone size={11} />}
                    value={user.phone_verified_at
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#065f46', fontWeight: 600, fontSize: '0.82rem' }}><BadgeCheck size={13} /> Verified {fmtDate(user.phone_verified_at)}</span>
                      : <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#b45309', fontSize: '0.82rem' }}><AlertCircle size={13} /> Not verified</span>
                    }
                  />
                  <InfoRow label="Account status" icon={<Shield size={11} />}
                    value={<span style={{ display: 'flex', alignItems: 'center', gap: 5, color: st.color, fontWeight: 600, fontSize: '0.82rem' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
                      {user.status?.replace('_', ' ')}
                    </span>}
                  />
                  <InfoRow label="Account lock" icon={<Lock size={11} />}
                    value={isLocked
                      ? <span style={{ color: '#b45309', fontWeight: 600, fontSize: '0.82rem' }}>Locked until {fmtDT(user.locked_until)}</span>
                      : <span style={{ color: '#065f46', fontSize: '0.82rem' }}>Not locked</span>
                    }
                  />
                  <InfoRow label="Failed login attempts" icon={<AlertCircle size={11} />}
                    value={<span style={{ color: user.failed_login_attempts > 0 ? '#b45309' : '#374151', fontWeight: 600, fontSize: '0.82rem' }}>{user.failed_login_attempts}</span>}
                  />
                  <InfoRow label="Force password reset" icon={<KeyRound size={11} />}
                    value={user.force_password_change
                      ? <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.82rem' }}>Pending reset</span>
                      : <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Not required</span>
                    }
                  />
                  <InfoRow label="Password last changed" icon={<KeyRound size={11} />}
                    value={<span style={{ color: '#374151', fontSize: '0.82rem' }}>{fmtDate(user.password_changed_at)}</span>}
                  />
                  {user.phone_otp_expires_at && new Date(user.phone_otp_expires_at) > new Date() && (
                    <InfoRow label="Pending phone OTP" icon={<Phone size={11} />}
                      value={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#7c3aed', background: 'rgba(168,85,247,0.08)', padding: '2px 8px', borderRadius: 6, letterSpacing: '0.15em' }}>
                          {user.phone_otp ?? '••••••'}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>expires {fmtDT(user.phone_otp_expires_at)}</span>
                      </span>}
                    />
                  )}
                </div>
              </div>

              {/* Last session */}
              <div>
                <p style={sectionHeader}><Monitor size={14} style={{ color: '#c4b5fd' }} /> Last session</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <InfoRow label="Login time" icon={<Clock size={11} />}  value={<span style={{ fontSize: '0.82rem', color: '#374151' }}>{fmtDT(user.last_login_at)}</span>} />
                  <InfoRow label="IP address" icon={<MapPin size={11} />} value={<span style={{ fontSize: '0.82rem', color: '#374151', fontFamily: 'monospace' }}>{user.last_login_ip || '—'}</span>} />
                  <InfoRow label="Device" icon={<Monitor size={11} />}
                    value={<span style={{ fontSize: '0.72rem', color: '#6b7280', display: '-webkit-box', overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {user.last_login_user_agent || '—'}
                    </span>}
                  />
                </div>
              </div>

              {/* Auth provider */}
              <div>
                <p style={sectionHeader}><Settings size={14} style={{ color: '#c4b5fd' }} /> Auth provider</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    padding: '5px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                    background: 'rgba(168,85,247,0.07)', color: '#7c3aed',
                    border: '1px solid rgba(168,85,247,0.18)', textTransform: 'capitalize',
                  }}>
                    {user.oauth_provider || 'email'}
                  </span>
                  {user.google_id && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Google ID linked</span>}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <p style={sectionHeader}><Calendar size={14} style={{ color: '#c4b5fd' }} /> Account timeline</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <InfoRow label="Created" icon={<Calendar size={11} />} value={<span style={{ fontSize: '0.82rem', color: '#374151' }}>{fmtDate(user.created_at)}</span>} />
                  <InfoRow label="Updated" icon={<Calendar size={11} />} value={<span style={{ fontSize: '0.82rem', color: '#374151' }}>{fmtDate(user.updated_at)}</span>} />
                  {user.deleted_at && <InfoRow label="Deleted" icon={<Trash2 size={11} />} value={<span style={{ fontSize: '0.82rem', color: '#b91c1c' }}>{fmtDate(user.deleted_at)}</span>} />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showResetModal && (
        <ResetPasswordModal
          onClose={() => setShowResetModal(false)}
          onConfirm={async (password) => {
            try { await resetPassword(id, password); toast.success('Password reset.'); setShowResetModal(false); }
            catch { toast.error('Failed to reset password.'); }
          }}
          loading={actionLoading}
        />
      )}
      {showLockModal && (
        <LockAccountModal
          onClose={() => setShowLockModal(false)}
          onConfirm={async (duration) => {
            try { await lockAccount(id, duration); toast.success(`Account locked for ${duration} min.`); setShowLockModal(false); }
            catch { toast.error('Failed to lock account.'); }
          }}
          loading={actionLoading}
        />
      )}
    </div>
  );
}