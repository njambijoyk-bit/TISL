import { useEffect, useMemo, useRef, useState } from 'react';
import booksAPI from '../../../../_shared/api/books';
import { card, colors } from '../../../../_shared/theme/tokens';
import { filterStyle } from '../books/booksFmt';

const MAX_SHOWN = 40;

/**
 * Choose a ledger by typing part of its name or its group: a search box over every ledger, not a drop-down of hundreds. Up and Down move, Enter
 * chooses, Escape closes. `value` is a ledger id (or empty); `onChange(id)` gets the id, or '' when the box is cleared.
 */
export default function LedgerPicker({ value, onChange, label = 'Ledger' }) {
  const [ledgers, setLedgers] = useState([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);

  useEffect(() => { booksAPI.ledgers({ all: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, []);
  const chosen = ledgers.find((l) => String(l.id) === String(value));
  useEffect(() => { setText(chosen ? chosen.name : ''); }, [chosen?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const pool = chosen && q === chosen.name.toLowerCase() ? ledgers : ledgers.filter((l) => !q || l.name.toLowerCase().includes(q) || (l.group?.name ?? l.group_name ?? '').toLowerCase().includes(q));
    return pool.slice(0, MAX_SHOWN);
  }, [ledgers, text, chosen]);

  const pick = (l) => { onChange(String(l.id)); setText(l.name); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={box} style={{ position: 'relative', minWidth: 240 }}>
      <input type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls="ledger-picker-list" aria-autocomplete="list" placeholder="Search a ledger…" value={text}
        style={{ ...filterStyle, width: '100%' }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); if (!e.target.value) onChange(''); }}
        onFocus={(e) => { e.target.select(); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey} />
      {open && (
        <ul id="ledger-picker-list" role="listbox" style={{ ...card, position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, margin: '2px 0 0', padding: 4, listStyle: 'none', maxHeight: 280, overflowY: 'auto' }}>
          {matches.length ? matches.map((l, i) => (
            <li key={l.id} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(l); }} onMouseEnter={() => setActive(i)}
              style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: 6, background: i === active ? colors.tint(0.08) : 'transparent' }}>
              {l.name} <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}>{l.group?.name ?? l.group_name ?? ''}</span>
            </li>
          )) : <li style={{ padding: '6px 10px', fontSize: '0.8rem', color: colors.textMuted }}>No ledger matches.</li>}
        </ul>
      )}
    </div>
  );
}
