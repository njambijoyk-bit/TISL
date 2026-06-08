/**
 * SmartSearchBox — universal search component with silent analytics tracking
 *
 * Usage:
 *   // Header (navigates to /products or /services)
 *   <SmartSearchBox context="product" mode="header" />
 *   <SmartSearchBox context="service" mode="header" />
 *
 *   // Products page (calls onSearch instead of navigating)
 *   <SmartSearchBox context="product" mode="inline" value={filters.search} onSearch={q => handleFilterChange('search', q)} />
 *
 *   // Services page
 *   <SmartSearchBox context="service" mode="inline" value={filters.search} onSearch={q => handleFilterChange('search', q)} />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchEvents } from '../../services/searchEventService';

const PLACEHOLDERS = {
  product: [
    'Search power tools, cables, fittings…',
    'e.g. "3-phase motor" or "PVC conduit"',
    'Try "safety gloves" or "circuit breaker"',
    'Find by brand, SKU, or description…',
  ],
  service: [
    'Search electrical installations, repairs…',
    'e.g. "site survey" or "panel upgrade"',
    'Find by service type or area…',
    'Try "remote support" or "maintenance"',
  ],
};

// Debounce helper
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SmartSearchBox({
  context = 'product',   // 'product' | 'service'
  mode = 'header',       // 'header' | 'inline'
  value = '',            // controlled value (inline mode)
  onSearch,              // callback for inline mode
  placeholder,           // override placeholder
  autoFocus = false,
  className = '',
}) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState(value);
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debouncedQuery = useDebounce(query, 600);

  // Rotate placeholder text every 3 seconds
  useEffect(() => {
    const placeholders = PLACEHOLDERS[context];
    const interval = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [context]);

  // Sync external value changes (inline mode)
  useEffect(() => {
    if (mode === 'inline') setQuery(value);
  }, [value, mode]);

  // Fire search analytics on debounce (only when focused & has content)
  // We don't know results_count here so we fire the 'search' event,
  // and the page that calls fetchProducts/fetchServices fires the result count
  // via searchEvents.searchResult() after the API responds.
  useEffect(() => {
    if (!focused || !debouncedQuery.trim()) return;
    // Don't fire on initial load
    searchEvents._trackTyping(debouncedQuery.trim(), context);
  }, [debouncedQuery]);

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setIsSubmitting(true);

    if (mode === 'header') {
      const path = context === 'service' ? '/services' : '/products';
      navigate(`${path}?search=${encodeURIComponent(q)}`);
    } else {
      onSearch?.(q);
    }

    setIsSubmitting(false);
    inputRef.current?.blur();
  }, [query, mode, context, navigate, onSearch]);

  const handleClear = () => {
    setQuery('');
    if (mode === 'inline') onSearch?.('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClear();
      inputRef.current?.blur();
    }
  };

  const activePlaceholder = placeholder ?? PLACEHOLDERS[context][placeholderIdx];
  const hasValue = query.length > 0;

  // ── Inline mode (used in Products / Services page) ────────────────────────
  if (mode === 'inline') {
    return (
      <form
        onSubmit={handleSubmit}
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          width: '100%',
        }}
      >
        {/* Search icon */}
        <span style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: focused ? '#a855f7' : '#9ca3af',
          transition: 'color 150ms',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
        }}>
          <Search size={15} />
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={activePlaceholder}
          style={{
            width: '100%',
            padding: '9px 80px 9px 38px',
            borderRadius: 10,
            border: `1.5px solid ${focused ? '#a855f7' : '#e5e7eb'}`,
            fontSize: '0.85rem',
            outline: 'none',
            background: 'white',
            color: '#111827',
            transition: 'border-color 150ms, box-shadow 150ms',
            boxShadow: focused ? '0 0 0 3px rgba(168,85,247,0.12)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
          className="dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
        />

        {/* Clear button */}
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: 46,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
              transition: 'color 120ms',
            }}
            className="hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={14} />
          </button>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={!hasValue || isSubmitting}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '5px 10px',
            borderRadius: 7,
            border: 'none',
            background: hasValue
              ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
              : '#f3f4f6',
            color: hasValue ? 'white' : '#d1d5db',
            cursor: hasValue ? 'pointer' : 'default',
            fontSize: '0.72rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 150ms',
            letterSpacing: '0.04em',
          }}
        >
          {isSubmitting
            ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <ArrowRight size={12} />
          }
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </form>
    );
  }

  // ── Header mode (dropdown with navigate) ─────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      style={{ display: 'flex', gap: 8, maxWidth: 560, width: '100%' }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <span style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: focused ? '#a855f7' : '#9ca3af',
          transition: 'color 150ms',
          pointerEvents: 'none',
          display: 'flex',
        }}>
          <Search size={15} />
        </span>

        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={activePlaceholder}
          style={{
            width: '100%',
            padding: '8px 36px 8px 38px',
            borderRadius: 10,
            border: `1.5px solid ${focused ? '#a855f7' : '#e5e7eb'}`,
            fontSize: '0.85rem',
            outline: 'none',
            transition: 'border-color 150ms, box-shadow 150ms',
            boxShadow: focused ? '0 0 0 3px rgba(168,85,247,0.12)' : 'none',
            boxSizing: 'border-box',
          }}
          className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />

        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <button
        type="submit"
        style={{
          padding: '8px 18px',
          borderRadius: 10,
          background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
        }}
      >
        <Search size={14} />
        Search
      </button>
    </form>
  );
}