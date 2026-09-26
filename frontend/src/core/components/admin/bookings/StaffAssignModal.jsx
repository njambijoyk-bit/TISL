import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, UserPlus, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLES = ['lead', 'support', 'observer'];
const ROLE_META = {
  lead:     { label: 'Lead',     color: 'var(--color-primary-600)', bg: 'color-mix(in srgb, var(--color-primary-600) 8%, transparent)' },
  support:  { label: 'Support',  color: '#2563eb', bg: 'rgba(37,99,235,0.08)'  },
  observer: { label: 'Observer', color: '#6b7280', bg: 'rgba(107,114,128,0.08)'},
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 9, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)', border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms',
};

const StaffAssignModal = ({ bookingId, existingStaff = [], onClose, onAssigned, staffAPI }) => {
  const [search,  setSearch]  = useState('');
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [role,    setRole]    = useState('support');
  const [task,    setTask]    = useState('');

  const existingIds = useMemo(() => new Set(existingStaff.map(s => s.user_id)), [existingStaff]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await staffAPI.searchStaff({ search: search.trim() || undefined });
        // The /api/admin/users endpoint returns { data: [...], total: ... }
        const list = res.data ?? res ?? [];
        setUsers(list.filter(u => u.role !== 'customer' && !existingIds.has(u.id)));
      } catch (err) {
        toast.error('Failed to load staff list');
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);

    return () => clearTimeout(timer);
  }, [search, staffAPI, existingIds]);

  const handleAssign = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onAssigned({ user_id: selected.id, role, task_description: task || undefined });
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message ?? 'Failed to assign staff');
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 460,
        background: 'white', borderRadius: 18,
        border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)',
        boxShadow: '0 20px 60px color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,var(--color-primary-500),var(--color-primary-600))', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={15} color="white" />
            </div>
            <div>
              <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', margin: 0 }}>Assign Staff</p>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>Search and assign a team member</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          ><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Search */}
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 6 }}>
              Search staff
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-primary-500)', pointerEvents: 'none' }} />
              <input
                type="text" value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                placeholder="Type name or email…"
                style={{ ...inputStyle, paddingLeft: 30 }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary-500)'}
                onBlur={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'}
              />
            </div>

            {/* Results */}
            {(users.length > 0 || loading) && (
              <div style={{ marginTop: 6, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)', borderRadius: 10, overflow: 'hidden' }}>
                {loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    Searching…
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : users.map((u, i) => (
                  <div key={u.id} onClick={() => { setSelected(u); setSearch(u.name); setUsers([]); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                      cursor: 'pointer', borderBottom: i < users.length - 1 ? '1px solid color-mix(in srgb, var(--color-primary-500) 7%, transparent)' : 'none',
                      background: selected?.id === u.id ? 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)' : 'white',
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)'}
                    onMouseLeave={e => e.currentTarget.style.background = selected?.id === u.id ? 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)' : 'white'}
                  >
                    {u.profile_picture_url ? (
                      <img
                        src={u.profile_picture_url}
                        alt=""
                        style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, flexShrink: 0 }}>
                        {u.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{u.role?.replace(/_/g, ' ')} · {u.email}</p>
                    </div>
                    <Shield size={11} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role */}
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 6 }}>Role</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ROLES.map(r => {
                const m = ROLE_META[r];
                const active = role === r;
                return (
                  <button key={r} type="button" onClick={() => setRole(r)} style={{
                    flex: 1, padding: '7px 0', borderRadius: 9, fontSize: '0.75rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                    border: `1.5px solid ${active ? m.color : 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)'}`,
                    background: active ? m.bg : 'transparent',
                    color: active ? m.color : '#9ca3af',
                  }}>{m.label}</button>
                );
              })}
            </div>
          </div>

          {/* Task */}
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 6 }}>
              Task description <span style={{ color: '#d1d5db', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <textarea rows={2} value={task} onChange={e => setTask(e.target.value)}
              placeholder="What is this person responsible for?"
              style={{ ...inputStyle, resize: 'none', fontSize: '0.78rem' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary-500)'}
              onBlur={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600, border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAssign} disabled={!selected || saving} style={{
            padding: '7px 18px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 700,
            border: 'none', cursor: (!selected || saving) ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
            opacity: (!selected || saving) ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Assigning…' : 'Assign Staff'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffAssignModal;