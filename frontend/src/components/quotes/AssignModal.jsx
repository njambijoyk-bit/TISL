import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserCheck, AlertCircle, Search, X, Loader2, Check } from 'lucide-react';
import Modal from '../common/Modal';
import LoadingSpinner from '../layout/LoadingSpinner';
import api from '../../api/axios';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const fIn  = e => { e.currentTarget.style.borderColor = purple; e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.boxShadow = 'none'; };

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

const fullName = (a) => {
  if (!a) return '';
  if (a.first_name || a.last_name) return `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
  return a.name || a.email || '';
};

// ─── Searchable Admin Picker ──────────────────────────────────────────────────
const AdminPicker = ({ selected, onSelect, currentAssignedId }) => {
  const [query,     setQuery]     = useState(selected ? fullName(selected) : '');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [open,      setOpen]      = useState(false);
  const debounceRef  = useRef(null);
  const containerRef = useRef(null);
  const abortRef     = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q) => {
  if (abortRef.current) abortRef.current.abort();
  if (!q.trim()) { setResults([]); setOpen(false); setSearching(false); return; }

  const controller = new AbortController();
  abortRef.current = controller;
  setSearching(true);

  try {
    const r = await api.get('/admin/users', {
      params: { search: q, tab: 'staff', per_page: 25 },
      signal: controller.signal,
    });
    setResults(r.data.data || r.data || []);
    setOpen(true);
    setSearching(false); // ✅ only on success
  } catch (err) {
    if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
      setResults([]);
      setSearching(false); // ✅ only on real errors, not aborts
    }
    // aborted requests: do nothing — new search already set searching(true)
  }
}, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (selected) onSelect(null); // clear selection when typing again
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  const handleSelect = (admin) => {
    onSelect(admin);
    setQuery(fullName(admin) || admin.email || '');
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
        <Search style={{ position: 'absolute', left: 12, width: 14, height: 14, color: '#c084fc', pointerEvents: 'none' }} />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={e => {
            if (query && results.length) setOpen(true);
            fIn(e);
          }}
          onBlur={fOut}
          placeholder="Search by name or email…"
          style={{
            width: '100%', paddingLeft: 36, paddingRight: 36, paddingTop: 9, paddingBottom: 9,
            borderRadius: 10, fontSize: '0.83rem',
            background: 'rgba(168,85,247,0.05)',
            border: '1.5px solid rgba(168,85,247,0.22)',
            color: '#111827', outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 150ms, box-shadow 150ms',
            fontFamily: 'inherit',
          }}
        />
        {searching ? (
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
          borderRadius: 12, overflow: 'hidden', background: 'white',
          border: '1px solid rgba(168,85,247,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}>
          {results.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
              No admins found for "{query}"
            </p>
          ) : (
            <ul style={{ maxHeight: 220, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
              {results.map(admin => {
                const isCurrent = admin.id === currentAssignedId;
                return (
                  <li key={admin.id}>
                    <button type="button" onClick={() => handleSelect(admin)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', background: 'transparent', border: 'none',
                      borderBottom: '1px solid rgba(168,85,247,0.07)',
                      cursor: 'pointer', textAlign: 'left', transition: 'background 120ms',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {/* Initials avatar */}
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.6rem', fontWeight: 700, color: '#c084fc',
                        border: '1.5px solid rgba(168,85,247,0.25)',
                      }}>
                        {fullName(admin).split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fullName(admin)}
                          {isCurrent && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: '#a855f7', fontWeight: 700 }}>Currently assigned</span>}
                        </p>
                        <p style={{ fontSize: '0.71rem', color: '#6b7280', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {admin.email}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Selected preview */}
      {selected && (
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', borderRadius: 10,
          background: purpleLt, border: `1px solid ${purpleBd}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6rem', fontWeight: 700, color: '#c084fc',
            border: '1.5px solid rgba(168,85,247,0.25)',
          }}>
            {fullName(selected).split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#c084fc', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullName(selected)}
            </p>
            <p style={{ fontSize: '0.71rem', color: '#9ca3af', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.email}
            </p>
          </div>
          <Check style={{ width: 14, height: 14, color: purple, flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────
const AssignModal = ({ onClose, onAssign, currentAssignedId = null }) => {
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAdmin) { setError('Please select an admin to assign'); return; }
    setSubmitting(true); setError(null);
    try {
      await onAssign(selectedAdmin.id);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to assign request');
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: purple }}>Assign Admin</span>} size="md">
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: '0.83rem', color: '#6b7280', marginBottom: 20, lineHeight: 1.65 }}>
          Select an admin to assign this quote request or quote to. They will be responsible for reviewing and processing it.
        </p>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
            <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Searchable picker */}
        <div style={{ marginBottom: 20 }}>
          <FieldLabel required>Assign To</FieldLabel>
          <AdminPicker
            selected={selectedAdmin}
            onSelect={setSelectedAdmin}
            currentAssignedId={currentAssignedId}
          />
          <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 6 }}>
            The selected admin can manage their assignment through their profile work tab
          </p>
        </div>

        {/* Info box */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: purpleLt, border: `1px solid ${purpleBd}`, marginBottom: 24 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 10 }}>What happens next</p>
          {[
            'The request status will change to "Under Review"',
            'The admin can create a quote from this request',
          ].map(s => (
            <p key={s} style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 5px', display: 'flex', gap: 7 }}>
              <span style={{ color: purple, fontWeight: 700, flexShrink: 0 }}>·</span>{s}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
          <Btn type="submit" disabled={submitting || !selectedAdmin}>
            {submitting
              ? <><LoadingSpinner size="sm" />&nbsp;Assigning…</>
              : <><UserCheck size={15} />Assign Request</>}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

export default AssignModal;