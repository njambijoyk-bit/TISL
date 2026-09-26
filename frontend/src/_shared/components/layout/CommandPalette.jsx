import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { searchEntries } from '../../navigation/adminNav';

const norm = (s) => (s ?? '').toLowerCase();

/** Every word typed must appear somewhere; title hits rank first. */
function rank(entries, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  const scored = [];
  for (const e of entries) {
    const title = norm(e.title);
    const hay = `${title} ${norm(e.parent)} ${norm(e.section)} ${norm(e.keywords)}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    if (title.startsWith(words[0])) score += 4;
    score += words.filter((w) => title.includes(w)).length * 2;
    if (!e.parent) score += 1;
    scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.e);
}

/**
 * Ctrl+K / ⌘K quick jump over every page in the admin navigation the user
 * can see. Arrow keys move, Enter opens, Esc closes.
 */
/** Mounted only while open, so every open starts empty. */
export default function CommandPalette({ onClose, nav }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  const entries = useMemo(() => searchEntries(nav), [nav]);
  const results = useMemo(() => rank(entries, query).slice(0, 40), [entries, query]);


  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const go = (entry) => {
    if (!entry) return;
    onClose();
    navigate(entry.path);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return createPortal(
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(15,10,25,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: '12vh 16px 16px',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a page"
        style={{
          background: 'var(--bg-primary, #fff)',
          color: 'var(--text-primary, #111827)',
          width: '100%', maxWidth: 560,
          borderRadius: 14,
          border: '1px solid rgba(168,85,247,0.25)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column', maxHeight: '70vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          <Search size={17} style={{ color: '#a855f7', flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to… (orders, tax, bulk edit, currency)"
            aria-label="Search pages"
            aria-controls="cmdk-results"
            aria-activedescendant={results[index] ? `cmdk-${index}` : undefined}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: '0.95rem', fontFamily: 'inherit', color: 'inherit',
            }}
          />
          <kbd style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7', fontFamily: 'inherit' }}>Esc</kbd>
        </div>

        <ul id="cmdk-results" ref={listRef} role="listbox" style={{ listStyle: 'none', margin: 0, padding: 6, overflowY: 'auto' }}>
          {results.length === 0 && (
            <li style={{ padding: '18px 12px', fontSize: '0.85rem', color: 'var(--color-text-muted, #6b7280)', textAlign: 'center' }}>
              Nothing matches "{query}"
            </li>
          )}
          {results.map((r, i) => {
            const Icon = r.icon;
            const sel = i === index;
            return (
              <li
                key={r.key}
                id={`cmdk-${i}`}
                data-idx={i}
                role="option"
                aria-selected={sel}
                onMouseMove={() => setIndex(i)}
                onClick={() => go(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 10px', borderRadius: 9, cursor: 'pointer',
                  background: sel ? 'rgba(168,85,247,0.12)' : 'transparent',
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${r.color}1f`, color: r.color,
                }}>
                  <Icon size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.parent ? <><span style={{ opacity: 0.55, fontWeight: 500 }}>{r.parent} › </span>{r.title}</> : r.title}
                  </span>
                  {r.section && (
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--color-text-muted, #6b7280)' }}>{r.section}</span>
                  )}
                </span>
                {sel && <CornerDownLeft size={14} style={{ color: '#a855f7', flexShrink: 0 }} />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
