import { useEffect, useState } from 'react';
import { card, colors, input } from '../../../../_shared/theme/tokens';
import { lookupStock, searchPlaceholder, stockKinds } from '../../../lib/stockKinds';

/**
 * Search-as-you-type over what this business stocks: products when E-commerce is on, ingredient variants when Menus is on, both together when both are.
 * `onPick(row)` gets the row from the lookup: type 'product' ({ variant_id, product, variant, sku, ... }) or type 'ingredient' ({ item_id, ingredient, variant, units, ... }).
 */
export default function StockItemPicker({ onPick, locationId, purpose = 'purchase', placeholder, autoFocus = false }) {
  const kinds = stockKinds();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const t = setTimeout(() => lookupStock(q.trim(), { purpose, locationId, kinds }).then(setRows).catch(() => setRows([])), 200);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kinds.products && !kinds.ingredients) return <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Switch on E-commerce (products) or Menus (kitchen stock) to stock anything.</p>;
  return (
    <div>
      <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? searchPlaceholder(kinds)} style={input} aria-label="Search items" />
      {rows.length > 0 && (
        <div style={{ ...card, padding: 4, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
          {rows.map((r) => (
            <button key={`${r.type}-${r.item_id ?? r.variant_id}`} type="button" onClick={() => { onPick(r); setQ(''); setRows([]); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
              {r.type === 'ingredient'
                ? <>{r.ingredient} <span style={{ color: colors.textFaint }}>↳ {r.variant}</span>{kinds.products && <span style={{ marginLeft: 6, fontSize: '0.62rem', fontWeight: 800, color: colors.primary }}>KITCHEN</span>}</>
                : <>{r.product} <span style={{ color: colors.textFaint }}>{r.variant && r.variant !== 'Standard' ? `${r.variant} · ` : ''}{r.sku}</span>{kinds.ingredients && <span style={{ marginLeft: 6, fontSize: '0.62rem', fontWeight: 800, color: colors.textFaint }}>PRODUCT</span>}</>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
