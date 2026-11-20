import { useEffect, useRef, useState } from 'react';
import { TextInput } from './ui';

/**
 * Type to find, then pick one from the list (stage 10: products, equipment, vendors). `look(q)` answers a list; `label(row)` names a row.
 * Typing again clears what was picked.
 */
export default function Finder({ id, value, onChange, look, label, placeholder }) {
  const [q, setQ] = useState(value ? label(value) : '');
  const [found, setFound] = useState([]);
  const timer = useRef(null);
  useEffect(() => { if (value) setQ(label(value)); }, [value, label]);
  const type = (text) => {
    setQ(text); if (value) onChange(null); clearTimeout(timer.current);
    if (text.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => { try { setFound(await look(text)); } catch { setFound([]); } }, 250);
  };
  return (
    <div style={{ position: 'relative' }}>
      <TextInput id={id} value={q} autoComplete="off" placeholder={placeholder} onChange={(e) => type(e.target.value)} />
      {found.length > 0 && !value && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, margin: '2px 0 0', padding: 4, listStyle: 'none', background: 'var(--surface-card)', border: '1px solid var(--line-strong)', borderRadius: 9, maxHeight: 220, overflowY: 'auto' }}>
          {found.map((r) => <li key={r.id} role="option" aria-selected="false"><button type="button" onClick={() => { onChange(r); setFound([]); }} style={{ width: '100%', textAlign: 'left', padding: '6px 8px', border: 0, background: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--text-primary)' }}>{label(r)}</button></li>)}
        </ul>
      )}
    </div>
  );
}
