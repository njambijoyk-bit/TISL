import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Info } from 'lucide-react';
import productsAPI from '../../../../_shared/api/products';
import useProductVariantStore from '../../../../_shared/store/productVariantStore';

/**
 * Per-branch stock for a product's variants (multi-location). Read-only: quantities are not typed in, they move with purchases,
 * sales, stock counts, write-offs and transfers (a quantity typed here left no movement and nothing in the books).
 *
 * Rows = variants, columns = active branches. Branches differ by quantity only —
 * price is set per variant, not per branch. The product's total stock is
 * auto-calculated from these numbers. Renders nothing when there's a single
 * branch (nothing to split) or the product has no variants yet.
 */
export default function BranchStockPanel({ productId, embedded = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState({});   // { `${variantId}:${locId}`: qty }

  // A signature of the editor's current variants — changes whenever options or
  // variants are added, edited or removed, so we can reload the grid to match.
  const variantSignature = useProductVariantStore((s) =>
    s.productId === Number(productId)
      ? s.variants.map((v) => `${v.id}:${v.combination_key}:${v.is_default ? 1 : 0}`).join('|')
      : '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await productsAPI.getBranchStock(productId);
      setData(d);
      const s = {};
      (d.variants || []).forEach((v) => {
        (d.locations || []).forEach((l) => {
          s[`${v.id}:${l.id}`] = v.stock?.[l.id] ?? '';
        });
      });
      setStock(s);
    } catch {
      // stay quiet — the panel just won't show
      setData({ locations: [], variants: [] });
    } finally { setLoading(false); }
  }, [productId]);

  // Reload on mount and whenever the variant set changes in the editor.
  useEffect(() => { load(); }, [load, variantSignature]);

  if (loading || !data) return null;

  const { locations = [], variants = [] } = data;
  // Only meaningful with more than one branch and at least one variant.
  if (locations.length <= 1 || variants.length === 0) {
    return embedded ? (
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
        {variants.length === 0 ? 'No variants yet — open the product to add stock.' : 'Only one branch — nothing to split.'}
      </p>
    ) : null;
  }

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #eee' };
  const td = { padding: '6px 10px', borderBottom: '1px solid var(--line)' };

  return (
    <div style={embedded
      ? { display: 'flex', flexDirection: 'column', gap: 10 }
      : { marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--line)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!embedded && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={18} color="var(--color-primary-600)" />
        <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem' }}>Stock by branch</p>
      </div>
      )}

      {!embedded && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--surface-card, #fff)', padding: '10px 12px', borderRadius: 9, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-primary-500)' }} />
        <span>Quantity per variant, per branch. It is not typed in: it moves with purchases, sales, stock counts, write-offs and transfers. To change it use <Link to="/admin/stock/counts">a stock count</Link> (shortage or surplus), <Link to="/admin/purchases/new">a purchase</Link> (stock arrived) or <Link to="/admin/stock/transfers">a transfer</Link> (between branches).</span>
      </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360, color: 'var(--text-primary)' }}>
          <thead>
            <tr>
              <th style={th}>Variant</th>
              {locations.map((l) => <th key={l.id} style={{ ...th, textAlign: 'center' }}>{l.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td style={{ ...td, fontWeight: 600, fontSize: '0.84rem' }}>
                  {v.name}{v.is_default && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · default</span>}
                </td>
                {locations.map((l) => (
                  <td key={l.id} style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{stock[`${v.id}:${l.id}`] === '' || stock[`${v.id}:${l.id}`] == null ? '—' : stock[`${v.id}:${l.id}`]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
