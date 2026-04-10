import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, Check, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import useProjectStore from '../../../store/projectStore';
import api from '../../../api/axios';

const ADMIN_ROLES    = ['admin_manager', 'admin_finance', 'admin_support', 'admin_viewer'];
const CUSTOMER_ROLES = ['customer_editor', 'customer_viewer'];

const roleLabel = (r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fullName = (person) => {
  if (!person) return '';
  if (person.first_name || person.last_name)
    return `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return person.name || person.email || '';
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar = ({ person, size = 32 }) => {
  const name     = fullName(person);
  const initials = name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 28 ? '0.6rem' : '0.65rem', fontWeight: 700,
      color: '#c084fc', background: 'transparent',
      border: '1.5px solid rgba(168,85,247,0.25)',
    }}>
      {initials}
    </div>
  );
};

// ─── PersonDisplay ────────────────────────────────────────────────────────────

const PersonDisplay = ({ person }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', borderRadius: 12,
    background: 'rgba(168,85,247,0.05)',
    border: '1px solid rgba(168,85,247,0.2)',
  }}>
    <Avatar person={person} size={34} />
    <div style={{ minWidth: 0, flex: 1 }}>
      <p style={{ fontSize: '0.84rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {fullName(person)}
      </p>
      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {person?.email}
      </p>
    </div>
  </div>
);

// ─── PersonPicker ─────────────────────────────────────────────────────────────

const PersonPicker = ({ type, selected, onSelect }) => {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef           = useRef(null);
  const containerRef          = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const endpoint = type === 'admin' ? '/admin/users' : '/admin/customers';
      const { data } = await api.get(endpoint, { params: { search: q, per_page: 10 } });
      const raw  = data?.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
      setResults(list);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (selected) onSelect(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (person) => {
    onSelect(person);
    setQuery(fullName(person) || person.email || '');
    setOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    onSelect(null);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Input */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search style={{ position: 'absolute', left: 12, width: 14, height: 14, color: '#c084fc', pointerEvents: 'none', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={e => {
            if (query && results.length) setOpen(true);
            e.currentTarget.style.borderColor = '#a855f7';
            e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(168,85,247,0.1)';
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)';
            e.currentTarget.style.boxShadow   = 'none';
          }}
          placeholder={type === 'admin' ? 'Search staff by name or email…' : 'Search customer by name or email…'}
          style={{
            width: '100%', paddingLeft: 36, paddingRight: 36, paddingTop: 8, paddingBottom: 8,
            borderRadius: 10, fontSize: '0.82rem',
            background: 'rgba(168,85,247,0.06)',
            border: '1.5px solid rgba(168,85,247,0.22)',
            color: '#111827', outline: 'none',
            transition: 'border-color 150ms, box-shadow 150ms',
            fontFamily: 'inherit',
          }}
        />
        {loading ? (
          <Loader2 style={{ position: 'absolute', right: 12, width: 13, height: 13, color: '#c084fc', animation: 'spin 1s linear infinite', pointerEvents: 'none' }} />
        ) : query ? (
          <button type="button" onClick={handleClear} style={{
            position: 'absolute', right: 10, background: 'none', border: 'none',
            cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2,
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
            <X style={{ width: 12, height: 12 }} />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50,
          borderRadius: 12, overflow: 'hidden',
          background: 'white',
          border: '1px solid rgba(168,85,247,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}>
          {results.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
              No results found.
            </p>
          ) : (
            <ul style={{ maxHeight: 200, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
              {results.map(person => (
                <li key={person.id}>
                  <button type="button" onClick={() => handleSelect(person)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Avatar person={person} size={28} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fullName(person)}
                      </p>
                      <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {person.email}
                      </p>
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#6b7280', flexShrink: 0 }}>#{person.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Selected preview */}
      {selected && (
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', borderRadius: 10,
          background: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.3)',
        }}>
          <Avatar person={selected} size={28} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#c084fc', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullName(selected)}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.email}
            </p>
          </div>
          <Check style={{ width: 14, height: 14, color: '#a855f7', flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
};

// ─── PermissionsGrid ──────────────────────────────────────────────────────────

const PERMS = [
  { key: 'canComment',  label: 'Can comment' },
  { key: 'canApprove',  label: 'Can approve milestones' },
];

const PermissionsGrid = ({ canComment, setCanComment, canUploadDocs, setCanUploadDocs, canViewFinance, setCanViewFinance, canApprove, setCanApprove }) => {
  const map = { canComment, canApprove };
  const setters = { canComment: setCanComment, canApprove: setCanApprove };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7c3aed', margin: 0 }}>
        Permissions
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {PERMS.map(({ key, label }) => {
          const checked = map[key];
          const setter  = setters[key];
          return (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
              background: checked ? 'rgba(168,85,247,0.08)' : 'transparent',
              border: `1px solid ${checked ? 'rgba(168,85,247,0.3)' : 'rgba(168,85,247,0.12)'}`,
              transition: 'background 150ms, border-color 150ms',
            }}>
              {/* Custom checkbox */}
              <div
                onClick={() => setter(!checked)}
                style={{
                  width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: checked ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
                  border: checked ? 'none' : '1.5px solid rgba(168,85,247,0.35)',
                  cursor: 'pointer', transition: 'all 150ms',
                }}>
                {checked && <Check style={{ width: 10, height: 10, color: 'white' }} />}
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 500, color: checked ? '#7c3aed' : '#6b7280' }}>
                {label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const AddParticipantModal = ({ project, onClose, editParticipant = null }) => {
  const { addAdminParticipant, addCustomerParticipant, updateParticipant, forceDeleteParticipant, loading } = useProjectStore();

  const isEdit     = Boolean(editParticipant);
  const editPerson = isEdit
    ? (editParticipant.participant_type === 'admin' ? editParticipant.admin_user : editParticipant.customer)
    : null;

  const [tab,            setTab]            = useState(isEdit ? editParticipant.participant_type : 'admin');
  const [selectedPerson, setSelected]       = useState(null);
  const [role,           setRole]           = useState(isEdit ? editParticipant.role : 'admin_support');
  const [canViewFinance, setCanViewFinance] = useState(isEdit ? Boolean(editParticipant.can_view_finance) : false);
  const [canApprove,     setCanApprove]     = useState(isEdit ? Boolean(editParticipant.can_approve)     : false);
  const [canComment,     setCanComment]     = useState(isEdit ? Boolean(editParticipant.can_comment)     : true);
  const [canUploadDocs,  setCanUploadDocs]  = useState(isEdit ? Boolean(editParticipant.can_upload_docs) : true);
  const [confirmDelete,  setConfirmDelete]  = useState(false);

  useEffect(() => {
    if (!isEdit) {
      setRole(tab === 'admin' ? 'admin_support' : 'customer_viewer');
      setSelected(null);
      setCanViewFinance(false);
      setCanApprove(false);
      setCanComment(true);
      setCanUploadDocs(true);
    }
  }, [tab, isEdit]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isEdit) {
      const res = await updateParticipant(project.id, editParticipant.id, {
        role, can_view_finance: canViewFinance, can_approve: canApprove,
        can_comment: canComment, can_upload_docs: canUploadDocs,
      });
      if (res.success) { toast.success('Participant updated.'); onClose(); }
      else toast.error(res.error || 'Failed to update participant.');
      return;
    }
    if (!selectedPerson) return toast.error(tab === 'admin' ? 'Select a staff member.' : 'Select a customer.');
    const res = tab === 'admin'
      ? await addAdminParticipant(project.id, { admin_user_id: selectedPerson.id, role, can_view_finance: canViewFinance, can_approve: canApprove, can_comment: canComment, can_upload_docs: canUploadDocs })
      : await addCustomerParticipant(project.id, { customer_id: selectedPerson.id, role, can_view_finance: canViewFinance, can_approve: canApprove, can_comment: canComment, can_upload_docs: canUploadDocs });
    if (res.success) { toast.success('Participant added.'); onClose(); }
    else toast.error(res.error || 'Failed to add participant.');
  };

  const handleDelete = async () => {
    const res = await forceDeleteParticipant(project.id, editParticipant.id);
    if (res.success) { toast.success('Participant deleted permanently.'); onClose(); }
    else toast.error(res.error || 'Failed to delete participant.');
    setConfirmDelete(false);
  };

  const roles = tab === 'admin' ? ADMIN_ROLES : CUSTOMER_ROLES;

  const labelStyle = {
    fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: '#7c3aed', display: 'block', marginBottom: 6,
  };

  const selectStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 10, fontSize: '0.82rem',
    background: 'rgba(168,85,247,0.06)',
    border: '1.5px solid rgba(168,85,247,0.22)',
    color: '#111827', outline: 'none',
    transition: 'border-color 150ms, box-shadow 150ms',
    fontFamily: 'inherit', appearance: 'none', cursor: 'pointer',
  };

  return (
    <>
      {/* ── Main modal ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', padding: 16,
      }}>
        <div style={{
          width: '100%', maxWidth: 500, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: 18, overflow: 'hidden',
          background: 'white',
          border: '1px solid rgba(168,85,247,0.3)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
        }}>

          {/* Accent strip */}
          <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)', flexShrink: 0 }} />

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
          }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7', margin: 0 }}>
              {isEdit ? 'Edit Participant' : 'Add Participant'}
            </p>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7280', display: 'flex', padding: 4, borderRadius: 6,
              transition: 'color 120ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#c084fc'}
              onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* Tab switcher (add mode only) */}
          {!isEdit && (
            <div style={{
              display: 'flex', borderBottom: '1px solid rgba(168,85,247,0.12)',
              padding: '0 20px', flexShrink: 0,
            }}>
              {['admin', 'customer'].map(t => {
                const active = tab === t;
                return (
                  <button key={t} onClick={() => setTab(t)} type="button" style={{
                    padding: '10px 14px', background: 'transparent', border: 'none',
                    borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
                    marginBottom: -1, cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: active ? 700 : 500,
                    color: active ? '#a855f7' : '#9ca3af',
                    transition: 'color 150ms, border-color 150ms',
                  }}>
                    {t === 'admin' ? 'Staff Member' : 'Customer'}
                  </button>
                );
              })}
            </div>
          )}

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 4px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Person */}
            <div>
              <span style={labelStyle}>{tab === 'admin' ? 'Staff Member' : 'Customer'}{!isEdit && ' *'}</span>
              {isEdit
                ? <PersonDisplay person={editPerson} />
                : <PersonPicker key={tab} type={tab} selected={selectedPerson} onSelect={setSelected} />
              }
            </div>

            {/* Role */}
            <div>
              <span style={labelStyle}>Role *</span>
              <select value={role} onChange={e => setRole(e.target.value)}
                style={selectStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.boxShadow = 'none'; }}>
                {roles.map(r => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>

            {/* Permissions */}
            <PermissionsGrid
              canComment={canComment}        setCanComment={setCanComment}
              canUploadDocs={canUploadDocs}  setCanUploadDocs={setCanUploadDocs}
              canViewFinance={canViewFinance} setCanViewFinance={setCanViewFinance}
              canApprove={canApprove}        setCanApprove={setCanApprove}
            />
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderTop: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
          }}>
            {isEdit ? (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={loading.submitting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'transparent', color: '#f87171', fontSize: '0.78rem', fontWeight: 600,
                  cursor: 'pointer', opacity: loading.submitting ? 0.5 : 1,
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Trash2 style={{ width: 13, height: 13 }} /> Delete
              </button>
            ) : <span />}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                background: 'transparent', color: '#9ca3af',
                border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer',
                transition: 'border-color 150ms, color 150ms',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
                Cancel
              </button>
              <button type="button" onClick={handleSubmit}
                disabled={loading.submitting || (!isEdit && !selectedPerson)}
                style={{
                  padding: '6px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                  border: 'none', cursor: loading.submitting || (!isEdit && !selectedPerson) ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                  boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
                  opacity: loading.submitting || (!isEdit && !selectedPerson) ? 0.55 : 1,
                  transition: 'box-shadow 150ms, opacity 150ms',
                }}
                onMouseEnter={e => { if (!loading.submitting && (isEdit || selectedPerson)) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
                {loading.submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Participant')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', padding: 16,
        }}>
          <div style={{
            width: '100%', maxWidth: 380, borderRadius: 16, overflow: 'hidden',
            background: 'white',
            border: '1px solid rgba(168,85,247,0.25)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
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
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                  Delete Participant
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
                Delete <strong style={{ color: '#7c3aed' }}>{fullName(editPerson)}</strong> from this project? This cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid rgba(168,85,247,0.12)' }}>
                <button onClick={() => setConfirmDelete(false)} style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                  background: 'transparent', color: '#9ca3af',
                  border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={loading.submitting} style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer', color: 'white',
                  background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                  boxShadow: '0 2px 10px rgba(239,68,68,0.35)',
                  opacity: loading.submitting ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {loading.submitting && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddParticipantModal;