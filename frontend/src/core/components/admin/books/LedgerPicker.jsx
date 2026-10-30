import { useEffect, useMemo, useRef, useState } from 'react';
import { colors } from '../../../../_shared/theme/tokens';

/**
 * Pick a ledger the way Tally does: a list under the field that narrows as you type, moved through with the arrow keys, chosen with Enter (or a click), closed with Esc.
 * Every word typed has to be in the name, in any order ("rent off" finds "Office Rent").
 */
export default function LedgerPicker({ ledgers, value, onPick, placeholder = 'Type to find a ledger…', style, autoFocus = false, label = 'Ledger' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const listRef = useRef(null);
  const chosen = useMemo(() => ledgers.find((l) => String(l.id) === String(value)), [ledgers, value]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = words.length ? ledgers.filter((l) => words.every((w) => l.name.toLowerCase().includes(w))) : ledgers;
    return rows.slice(0, 200);
  }, [ledgers, q]);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView?.({ block: 'nearest' }); }, [hi, open]);

  const pick = (l) => { onPick(l); setQ(''); setOpen(false); };
  const keys = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input value={open ? q : (chosen?.name ?? '')} autoFocus={autoFocus} aria-label={label} role="combobox" aria-expanded={open} placeholder={placeholder}
        onFocus={() => { setQ(''); setOpen(true); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={keys} style={style} />
      {open && (
        <ul ref={listRef} role="listbox" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 300, overflowY: 'auto', minWidth: 260,
          background: colors.surface, color: colors.text, border: `1px solid ${colors.tint(0.25)}`, borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
          {shown.length === 0 && <li style={{ padding: '8px 10px', fontSize: '0.78rem', color: colors.textFaint }}>No ledger matches “{q}”.</li>}
          {shown.map((l, i) => (
            <li key={l.id} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(l); }} onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 10px', cursor: 'pointer', fontSize: '0.82rem', background: i === hi ? colors.tint(0.16) : 'transparent', color: colors.text }}>
              <span>{l.name}</span>
              <span style={{ fontSize: '0.68rem', color: colors.textFaint, whiteSpace: 'nowrap' }}>{l.group?.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
