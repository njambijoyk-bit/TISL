import React, { useEffect, useState, useCallback } from 'react';
import { MapPin, Save, RefreshCw, Info } from 'lucide-react';
import productsAPI from '../../../_shared/api/products';
import useProductVariantStore from '../../../_shared/store/productVariantStore';
import toast from 'react-hot-toast';

/**
 * Per-branch stock for a product's variants (multi-location).
 *
 * Rows = variants, columns = active branches. Branches differ by quantity only —
 * price is set per variant, not per branch. The product's total stock is
 * auto-calculated from these numbers. Renders nothing when there's a single
 * branch (nothing to split) or the product has no variants yet.
 */
export default function BranchStockPanel({ productId, readOnly = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const setQty = (variantId, locId, val) =>
    setStock((s) => ({ ...s, [`${variantId}:${locId}`]: val }));

  const save = async () => {
    const rows = [];
    (data.variants || []).forEach((v) => {
      (data.locations || []).forEach((l) => {
        const raw = stock[`${v.id}:${l.id}`];
        if (raw !== '' && raw !== null && raw !== undefined) {
          rows.push({ variant_id: v.id, location_id: l.id, quantity: Number(raw) || 0 });
        }
      });
    });
    setSaving(true);
    try {
      const res = await productsAPI.saveBranchStock(productId, { stock: rows });
      if (res.ok === false) throw new Error(res.message);
      toast.success(res.message || 'Saved.');
      load();
      // variants table + product stock read the same numbers — refresh them too
      useProductVariantStore.getState().refreshVariants();
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Could not save.');
    } finally { setSaving(false); }
  };

  if (loading || !data) return null;

  const { locations = [], variants = [] } = data;
  // Only meaningful with more than one branch and at least one variant.
  if (locations.length <= 1 || variants.length === 0) return null;

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #eee' };
  const td = { padding: '6px 10px', borderBottom: '1px solid #f6f6f6' };
  const cell = { width: 90, padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit' };

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed #e5e7eb', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={18} color="var(--color-primary-600)" />
        <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem' }}>Stock by branch</p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)', padding: '10px 12px', borderRadius: 9, fontSize: '0.78rem', color: '#4b5563' }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-primary-500)' }} />
        <span>Quantity per variant, per branch. A blank branch means the variant isn't sold there. The product's total stock is calculated from these automatically.</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
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
                  {v.name}{v.is_default && <span style={{ color: '#9ca3af', fontWeight: 400 }}> · default</span>}
                </td>
                {locations.map((l) => (
                  <td key={l.id} style={{ ...td, textAlign: 'center' }}>
                    <input
                      type="number" min="0" step="1" disabled={readOnly}
                      value={stock[`${v.id}:${l.id}`] ?? ''}
                      onChange={(e) => setQty(v.id, l.id, e.target.value)}
                      placeholder="—"
                      style={cell}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? <RefreshCw size={15} /> : <Save size={15} />} Save branch stock
          </button>
        </div>
      )}
    </div>
  );
}
