import { useEffect, useState } from 'react';
import productsAPI from '../../../_shared/api/products';
import { input, focusRing } from '../../../_shared/theme/tokens';

/**
 * Pick which variant of a product goes into a hamper / auction, showing how
 * many are in stock at the owning branch. When the chosen variant is out of
 * stock there, it says so and lists the branches that do have it.
 *
 * @param {number} productId
 * @param {number} locationId   the branch the hamper/auction belongs to
 * @param {number|string} value variant id
 * @param {(variantId: number) => void} onChange
 */
export default function VariantAtBranchPicker({ productId, locationId, value, onChange, style }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    productsAPI.getBranchStock(productId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ locations: [], variants: [] }); });
    return () => { cancelled = true; };
  }, [productId]);

  const variants = data?.variants ?? [];
  const locations = data?.locations ?? [];
  const at = (v, locId) => Number(v.stock?.[locId] ?? 0);
  const branchName = locations.find((l) => String(l.id) === String(locationId))?.name ?? 'this branch';

  // Choose something sensible once the data arrives: a variant stocked here, else the default
  useEffect(() => {
    if (!data || value || !variants.length) return;
    const pick = variants.find((v) => at(v, locationId) > 0) ?? variants.find((v) => v.is_default) ?? variants[0];
    onChange(pick.id);
  }, [data, locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Loading variants…</span>;
  if (!variants.length) return <span style={{ fontSize: '0.75rem', color: '#b45309' }}>No variants yet — give this product stock first.</span>;

  const chosen = variants.find((v) => String(v.id) === String(value));
  const here = chosen ? at(chosen, locationId) : 0;
  const elsewhere = chosen
    ? locations.filter((l) => String(l.id) !== String(locationId) && at(chosen, l.id) > 0)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <select value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} style={{ ...input, padding: '6px 8px', fontSize: '0.8rem' }} {...focusRing}>
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} — {at(v, locationId) > 0 ? `${at(v, locationId)} at ${branchName}` : `out of stock at ${branchName}`}
          </option>
        ))}
      </select>
      {chosen && here <= 0 && (
        <span role="alert" style={{ fontSize: '0.72rem', color: '#b91c1c' }}>
          {branchName} is out of stock.
          {elsewhere.length > 0
            ? ` Available at: ${elsewhere.map((l) => `${l.name} (${at(chosen, l.id)})`).join(', ')}.`
            : ' No other branch has it either.'}
        </span>
      )}
    </div>
  );
}
