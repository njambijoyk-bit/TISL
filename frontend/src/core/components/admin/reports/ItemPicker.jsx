import { useEffect, useState } from 'react';
import booksAPI from '../../../../_shared/api/books';
import { stockReportsAPI } from '../../../../_shared/api/stockOps';
import { card, colors } from '../../../../_shared/theme/tokens';
import { filterStyle } from '../books/booksFmt';

/**
 * Choose a stock item (a product, or the kitchen's stock when Menus is on) by typing part of its name or code.
 * `value` is "product:12" or "ingredient:7" (or empty); `onChange(value)` gets it, or '' when the box is cleared.
 */
export default function ItemPicker({ value, onChange, label = 'Item', source = 'trade' }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!value) setText(''); }, [value]);
  useEffect(() => {
    if (!open) return undefined;
    const ask = source === 'stock'
      ? () => (text.trim().length < 2 ? Promise.resolve([]) : stockReportsAPI.find(text.trim()).then((r) => r.rows.map((x) => ({ item_type: x.item_type, id: x.item_id, name: x.name, sku: x.sku }))))   // any kind of stocked item
      : () => booksAPI.movementProducts(text.trim());
    const t = setTimeout(() => ask().then(setFound).catch(() => {}), text ? 250 : 0);
    return () => clearTimeout(t);
  }, [text, open, source]);

  const pick = (p) => { onChange(`${p.item_type ?? 'product'}:${p.id}`); setText(p.name); setOpen(false); };

  return (
    <div style={{ position: 'relative', minWidth: 240 }}>
      <input type="text" role="combobox" aria-label={label} aria-expanded={open} aria-autocomplete="list" placeholder="Search an item…" value={text} style={{ ...filterStyle, width: '100%' }}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (!e.target.value) onChange(''); }}
        onFocus={(e) => { e.target.select(); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 120)} />
      {open && (
        <ul role="listbox" style={{ ...card, position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, margin: '2px 0 0', padding: 4, listStyle: 'none', maxHeight: 280, overflowY: 'auto' }}>
          {found.length ? found.map((p) => (
            <li key={`${p.item_type}:${p.id}`} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: 6 }}>
              {p.name}{p.sku && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {p.sku}</span>}{p.item_type === 'ingredient' && <span style={{ marginLeft: 6, fontSize: '0.62rem', fontWeight: 800, color: colors.primary }}>KITCHEN</span>}
            </li>
          )) : <li style={{ padding: '6px 10px', fontSize: '0.8rem', color: colors.textMuted }}>No item matches.</li>}
        </ul>
      )}
    </div>
  );
}
