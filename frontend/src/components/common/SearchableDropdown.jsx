import { useState, useRef, useEffect } from 'react';

/**
 * SearchableDropdown
 * Props:
 *   options: [{ id, name }]
 *   value: selected id (or null)
 *   onChange: (id) => void
 *   placeholder: string
 *   disabled: bool
 *   size: 'sm' | 'md'  (default 'md')
 */
export default function SearchableDropdown({
  options = [],
  value = null,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  size = 'md',
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const containerRef        = useRef(null);
  const inputRef            = useRef(null);

  const selected = options.find(o => String(o.id) === String(value));

  const filtered = query.trim()
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (id) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
    setOpen(false);
  };

  const isSmall = size === 'sm';

  const triggerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    padding: isSmall ? '4px 8px' : '7px 10px',
    background: disabled ? 'var(--bg-secondary, #f9f9f9)' : 'var(--bg-primary, #fff)',
    border: '1px solid var(--accent, #7c3aed)',
    boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: isSmall ? 12 : 13,
    color: selected ? 'var(--text-primary, #111)' : 'var(--text-muted, #9ca3af)',
    minWidth: isSmall ? 100 : 140,
    userSelect: 'none',
    transition: 'border-color 0.15s',
    opacity: disabled ? 0.6 : 1,
  };

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    background: 'var(--bg-primary, #fff)',
    border: '1px solid var(--accent, #ae55f7)',
    boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      {/* Trigger */}
      <div style={triggerStyle} onClick={handleOpen}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected ? selected.name : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {selected && !disabled && (
            <span
              onClick={handleClear}
              style={{ cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, fontSize: 14, padding: '0 2px' }}
            >×</span>
          )}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={dropdownStyle}>
          {/* Search input */}
          <div style={{ padding: '8px 8px 4px' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid var(--accent, #ae55f7)',
                boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
                borderRadius: 6,
                fontSize: 12,
                background: 'var(--bg-secondary, #f9fafb)',
                color: 'var(--text-primary, #111)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted, #9ca3af)', textAlign: 'center' }}>
                No results
              </div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: 'var(--text-primary, #111)',
                    background: String(opt.id) === String(value)
                      ? 'var(--accent-light, #f3e8ff)'
                      : 'transparent',
                    fontWeight: String(opt.id) === String(value) ? 600 : 400,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (String(opt.id) !== String(value))
                      e.currentTarget.style.background = 'var(--bg-secondary, #f9fafb)';
                  }}
                  onMouseLeave={e => {
                    if (String(opt.id) !== String(value))
                      e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {opt.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}