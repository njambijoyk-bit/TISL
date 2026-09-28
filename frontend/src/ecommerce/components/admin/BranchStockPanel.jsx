import React, { useEffect, useState, useCallback } from 'react';
import { MapPin, Save, RefreshCw, Info } from 'lucide-react';
import productsAPI from '../../../_shared/api/products';
import toast from 'react-hot-toast';

/**
 * Per-branch stock + price for a product (multi-location).
 *
 * Rows = variants (a simple product shows its single "Default" variant, created
 * on demand by the backend). Columns = active branches: a stock quantity per
 * (variant × branch). Below, an optional per-branch price override (entered in
 * that branch's currency; blank = use the base price, auto-converted).
 *
 * Setting any branch stock switches the product from "sold everywhere" (legacy)
 * to branch-managed, so it then only shows at branches where it has a row.
 */
export default function BranchStockPanel({ productId, readOnly = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stock, setStock] = useState({});   // { `${variantId}:${locId}`: qty }
  const [prices, setPrices] = useState({});  // { locId: { amount, is_tax_inclusive } }

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
      const p = {};
      Object.entries(d.price_overrides || {}).forEach(([locId, o]) => {
        p[locId] = { amount: o.amount ?? '', is_tax_inclusive: !!o.is_tax_inclusive };
      });
      setPrices(p);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not load branch stock.');
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const setQty = (variantId, locId, val) =>
    setStock((s) => ({ ...s, [`${variantId}:${locId}`]: val }));
  const setPrice = (locId, patch) =>
    setPrices((p) => ({ ...p, [locId]: { amount: '', is_tax_inclusive: false, ...p[locId], ...patch } }));

  const save = async () => {
    const stockRows = [];
    (data.variants || []).forEach((v) => {
      (data.locations || []).forEach((l) => {
        const raw = stock[`${v.id}:${l.id}`];
        if (raw !== '' && raw !== null && raw !== undefined) {
          stockRows.push({ variant_id: v.id, location_id: l.id, quantity: Number(raw) || 0 });
        }
      });
    });
    const priceRows = (data.locations || []).map((l) => ({
      location_id: l.id,
      amount: prices[l.id]?.amount === '' || prices[l.id]?.amount == null ? null : Number(prices[l.id].amount),
      is_tax_inclusive: !!prices[l.id]?.is_tax_inclusive,
    }));

    setSaving(true);
    try {
      const res = await productsAPI.saveBranchStock(productId, { stock: stockRows, prices: priceRows });
      if (res.ok === false) throw new Error(res.message);
      toast.success(res.message || 'Saved.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Could not save.');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}><RefreshCw size={16} /> Loading…</div>;
  }
  if (!data) return null;

  const { locations = [], variants = [] } = data;
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #eee' };
  const td = { padding: '6px 10px', borderBottom: '1px solid #f6f6f6' };
  const cell = { width: 90, padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit' };

  if (locations.length === 0) {
    return (
      <div style={{ padding: 20, color: '#6b7280', fontSize: '0.85rem' }}>
        No branches yet. Add branches under Settings → Branches first.
      </div>
    );
  }

  const single = locations.length === 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={18} color="var(--color-primary-600)" />
        <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem' }}>Stock &amp; price by branch</p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)', padding: '10px 12px', borderRadius: 9, fontSize: '0.78rem', color: '#4b5563' }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-primary-500)' }} />
        <span>
          Enter quantity per branch. Leaving a branch blank means the product isn't sold there.
          {single ? ' You currently have one branch — add more under Settings → Branches to sell per location.' : ' A product with any branch stock only appears at the branches where it has a quantity.'}
        </span>
      </div>

      {/* Stock grid: variants × branches */}
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

      {/* Per-branch price override */}
      <div>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.85rem' }}>Per-branch price <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — blank uses the base price, auto-converted)</span></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {locations.map((l) => (
            <div key={l.id} style={{ border: '1px solid #eee', borderRadius: 9, padding: 10 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>{l.name}</div>
              <input
                type="number" min="0" step="0.01" disabled={readOnly}
                value={prices[l.id]?.amount ?? ''}
                onChange={(e) => setPrice(l.id, { amount: e.target.value })}
                placeholder="Base price"
                style={{ ...cell, width: '100%', marginBottom: 6 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: '#6b7280' }}>
                <input type="checkbox" disabled={readOnly}
                  checked={!!prices[l.id]?.is_tax_inclusive}
                  onChange={(e) => setPrice(l.id, { is_tax_inclusive: e.target.checked })} />
                Amount includes tax
              </label>
            </div>
          ))}
        </div>
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
