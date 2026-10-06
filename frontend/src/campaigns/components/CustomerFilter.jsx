import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import pinsAPI from '../../_shared/api/pins';
import { filterStyle } from '../../core/components/admin/books/booksFmt';
import { colors } from '../../_shared/theme/tokens';

/** Pick one customer who has pins. The list only holds customers with at least one pin, and narrows as you type. `value` is { id, name } or null. */
export default function CustomerFilter({ value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => pinsAPI.customers(q).then(setRows).catch(() => setRows([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open]);
  useEffect(() => {
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, []);

  if (value) {
    return (
      <span style={{ ...filterStyle, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
        Customer: {value.name}
        <button type="button" aria-label="Clear customer filter" onClick={() => onChange(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: colors.textFaint, display: 'inline-flex', padding: 0 }}><X size={14} /></button>
      </span>
    );
  }

  return (
    <span ref={box} style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Filter by customer…" aria-label="Filter by customer" style={{ ...filterStyle, minWidth: 190 }} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, minWidth: 260, maxHeight: 260, overflowY: 'auto', background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.22)', padding: 4 }}>
          {rows.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.78rem', color: colors.textFaint }}>No customers with pins{q ? ' match that' : ' yet'}.</div>}
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange({ id: c.id, name: c.name }); setOpen(false); setQ(''); }} style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', padding: '7px 10px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: colors.text }}>
              <span style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: '0.82rem' }}>{c.name}</strong>{c.email && <span style={{ display: 'block', fontSize: '0.68rem', color: colors.textFaint, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span>}</span>
              <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>{c.pins} {c.pins === 1 ? 'pin' : 'pins'}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
