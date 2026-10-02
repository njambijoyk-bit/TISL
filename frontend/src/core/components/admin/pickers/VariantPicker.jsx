import { useEffect, useState } from 'react';
import booksAPI from '../../../../_shared/api/books';
import { card, colors, input } from '../../../../_shared/theme/tokens';

/** Search-as-you-type over product variants; calls onPick(row) with { variant_id, product, variant, sku, track_expiry, ... }. */
export default function VariantPicker({ onPick, placeholder = 'Search a product or SKU to add…' }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const t = setTimeout(() => booksAPI.lookup('product', q.trim(), 'purchase').then(setRows).catch(() => setRows([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={input} aria-label="Search products" />
      {rows.length > 0 && (
        <div style={{ ...card, padding: 4, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
          {rows.map((r) => (
            <button key={r.variant_id} type="button" onClick={() => { onPick(r); setQ(''); setRows([]); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
              {r.product} <span style={{ color: colors.textFaint }}>{r.variant && r.variant !== 'Standard' ? `${r.variant} · ` : ''}{r.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
