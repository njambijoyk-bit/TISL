import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, Check, UserCheck, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import customersAPI from '../../api/customers';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const fIn  = e => { e.currentTarget.style.borderColor = purple;               e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.boxShadow = 'none'; };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fullName = (c) => {
  if (!c) return '';
  const n = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return n || c.name || c.email || '';
};

const initials = (c) =>
  `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase() || '?';

// ─── Atoms ────────────────────────────────────────────────────────────────────
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

const Avatar = ({ customer, size = 32 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size <= 28 ? '0.6rem' : '0.65rem', fontWeight: 700,
    color: '#c084fc', border: '1.5px solid rgba(168,85,247,0.25)',
  }}>
    {initials(customer)}
  </div>
);

// ─── Customer search picker ───────────────────────────────────────────────────
const CustomerPicker = ({ selected, onSelect }) => {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [open,      setOpen]      = useState(false);
  const debounceRef  = useRef(null);
  const containerRef = useRef(null);
  const abortRef     = useRef(null);

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
      const res = await customersAPI.getAllCustomers({ search: q, per_page: 25 });
      const list = res?.data || res || [];
      setResults(list);
      setOpen(true);
      setSearching(false);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setResults([]);
        setSearching(false);
      }
    }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (selected) onSelect(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  const handleSelect = (customer) => {
    onSelect(customer);
    setQuery(fullName(customer));
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
          onFocus={e => { if (query && results.length) setOpen(true); fIn(e); }}
          onBlur={fOut}
          placeholder="Search by name, email, or customer number…"
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
          border: `1px solid ${purpleBd}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}>
          {results.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
              No customers found for "{query}"
            </p>
          ) : (
            <ul style={{ maxHeight: 240, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
              {results.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => handleSelect(c)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid rgba(168,85,247,0.07)',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 120ms',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = purpleLt}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Avatar customer={c} size={30} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fullName(c) || 'Unnamed'}
                      </p>
                      <p style={{ fontSize: '0.71rem', color: '#6b7280', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.email}{c.customer_number ? ` · ${c.customer_number}` : ''}
                      </p>
                    </div>
                    {c.company_name && (
                      <span style={{ fontSize: '0.68rem', color: '#9ca3af', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.company_name}
                      </span>
                    )}
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
          background: purpleLt, border: `1px solid ${purpleBd}`,
        }}>
          <Avatar customer={selected} size={28} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#c084fc', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullName(selected)}
            </p>
            <p style={{ fontSize: '0.71rem', color: '#9ca3af', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.email}{selected.customer_number ? ` · ${selected.customer_number}` : ''}
            </p>
          </div>
          <Check style={{ width: 14, height: 14, color: purple, flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────
/**
 * CustomerSelectorModal
 *
 * Props:
 *   onClose()              — close the modal
 *   onSelect(customer)     — called with the full customer object when confirmed
 *   currentCustomerId      — optional, highlights already-selected customer
 *
 * Usage (same pattern as AssignModal):
 *   {showCustomerModal && (
 *     <CustomerSelectorModal
 *       onClose={() => setShowCustomerModal(false)}
 *       onSelect={(customer) => {
 *         handleChange('customer_id', customer.id);
 *         setSelectedCustomer(customer);
 *         setShowCustomerModal(false);
 *       }}
 *       currentCustomerId={formData.customer_id}
 *     />
 *   )}
 */
const CustomerSelectorModal = ({ onClose, onSelect, currentCustomerId = null }) => {
  const [selected, setSelected] = useState(null);
  const [error,    setError]    = useState(null);

  const handleConfirm = () => {
    if (!selected) { setError('Please select a customer'); return; }
    onSelect(selected);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: purple }}>Select Customer</span>} size="md">
      <p style={{ fontSize: '0.83rem', color: '#6b7280', marginBottom: 20, lineHeight: 1.65 }}>
        Search and select a customer to associate with this record.
      </p>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
          <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Picker */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel required>Customer</FieldLabel>
        <CustomerPicker selected={selected} onSelect={(c) => { setSelected(c); setError(null); }} />
        <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 6 }}>
          Search by first name, last name, email, or customer number
        </p>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleConfirm} disabled={!selected}>
          <UserCheck size={15} /> Select Customer
        </Btn>
      </div>
    </Modal>
  );
};

export default CustomerSelectorModal;