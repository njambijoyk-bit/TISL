import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import api from '../../api/axios';
import useMoney from '../../hooks/useMoney';

/**
 * Storefront variant picker: one row of choices per option (Size, Colour…),
 * then — if the variant sells in more than one unit — a row of units
 * (Piece, Carton of 12…), each with its own price.
 *
 * Renders nothing for products without structured variants, so the page
 * can keep its legacy "Available Options" list for those.
 *
 * @param {object}   product    the product payload (for its currency)
 * @param {function} onChange   ({ variant, unit, image, label } | null) — current choice
 * @param {function} onLoaded   (hasVariants: boolean)
 */
export default function VariantPicker({ product, onChange, onLoaded }) {
  const money = useMoney();
  const [data, setData] = useState(null);           // { options, variants, images }
  const [selection, setSelection] = useState({});   // { [option_id]: value_id }
  const [unitId, setUnitId] = useState(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    setData(null);
    api.get(`/products/${product.id}/variants`)
      .then(({ data: res }) => {
        if (cancelled) return;
        setData(res);
        const start = res.variants.find((v) => v.is_default) ?? res.variants[0];
        setSelection(start ? { ...start.selection } : {});
        setUnitId(defaultUnit(start)?.id ?? null);
        onLoaded?.(res.variants.length > 0);
      })
      .catch(() => { if (!cancelled) { setData({ options: [], variants: [], images: [] }); onLoaded?.(false); } });
    return () => { cancelled = true; };
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = data?.options ?? [];
  const variants = data?.variants ?? [];

  // Variant matching every chosen value (a product with no options has one variant)
  const variant = useMemo(() => {
    if (!variants.length) return null;
    if (!options.length) return variants[0];
    return variants.find((v) => options.every((o) => String(v.selection[o.id]) === String(selection[o.id]))) ?? null;
  }, [variants, options, selection]);

  const unit = variant?.units.find((u) => u.id === unitId) ?? defaultUnit(variant);

  // Photo for this variant, else for one of its option values
  const image = useMemo(() => {
    if (!variant || !data?.images?.length) return null;
    const valueIds = Object.values(variant.selection).map(Number);
    return data.images.find((i) => i.variant_id === variant.id)
      ?? data.images.find((i) => valueIds.includes(Number(i.option_value_id)))
      ?? null;
  }, [variant, data]);

  useEffect(() => {
    if (!data) return;
    // Readable label, e.g. "Large / Red", built from the option values
    const label = variant
      ? (options.map((o) => o.values.find((v) => String(v.id) === String(variant.selection[o.id]))?.value).filter(Boolean).join(' / ')
         || variant.name || 'Standard')
      : null;
    onChange?.(variant && unit ? { variant, unit, image, label } : null);
  }, [variant?.id, unit?.id, image?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !variants.length) return null;

  // Can this value be picked, given the other choices? (some live variant has it)
  const isAvailable = (optionId, valueId) => variants.some((v) =>
    String(v.selection[optionId]) === String(valueId)
    && options.every((o) => o.id === optionId || !selection[o.id] || String(v.selection[o.id]) === String(selection[o.id])));

  const pick = (optionId, valueId) => {
    const next = { ...selection, [optionId]: valueId };
    // If the combination doesn't exist, jump to the closest variant that has this value
    const exact = variants.find((v) => options.every((o) => String(v.selection[o.id]) === String(next[o.id])));
    const target = exact ?? variants.find((v) => String(v.selection[optionId]) === String(valueId));
    setSelection(target ? { ...target.selection } : next);
    // Keep the same kind of unit if the new variant has it
    const sameUnit = target?.units.find((u) => u.unit?.id === unit?.unit?.id);
    setUnitId((sameUnit ?? defaultUnit(target))?.id ?? null);
  };

  const unitLabel = (u) => {
    const name = u.unit?.name ?? 'Unit';
    if (u.role === 'compound' && u.contains_qty) {
      const inner = variant.units.find((x) => x.role === 'base')?.unit?.name?.toLowerCase();
      return `${name} of ${u.contains_qty}${inner ? ` ${inner}s` : ''}`;
    }
    return name;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {options.map((o) => (
        <fieldset key={o.id} style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={legendStyle} className="dark:text-gray-300">
            {o.name}
            {selection[o.id] && (
              <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#6b7280', marginLeft: 6 }}>
                {o.values.find((v) => String(v.id) === String(selection[o.id]))?.value}
              </span>
            )}
          </legend>
          <div role="radiogroup" aria-label={o.name} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {o.values.map((v) => {
              const selected = String(selection[o.id]) === String(v.id);
              const available = isAvailable(o.id, v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pick(o.id, v.id)}
                  title={available ? undefined : 'Not available with your other choices — picking it will change them'}
                  style={chipStyle(selected, available)}
                >
                  {selected && <Check size={12} />}
                  {v.value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {variant && variant.units.length > 1 && (
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={legendStyle} className="dark:text-gray-300">Buy by</legend>
          <div role="radiogroup" aria-label="Unit" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {variant.units.map((u) => {
              const selected = u.id === unit?.id;
              const soldOut = u.available_quantity < 1;
              return (
                <button key={u.id} type="button" role="radio" aria-checked={selected} onClick={() => setUnitId(u.id)}
                  style={{ ...chipStyle(selected, !soldOut), flexDirection: 'column', alignItems: 'flex-start', borderRadius: 12, padding: '8px 12px', gap: 2 }}>
                  <span style={{ fontWeight: 700 }}>{unitLabel(u)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, opacity: 0.85 }}>
                    {u.price != null ? money.itemAmount(u.price, product) : 'Price on request'}
                  </span>
                  {soldOut && <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>Out of stock</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {!variant && (
        <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>That combination isn't available.</p>
      )}
    </div>
  );
}

/** The unit to preselect: the one marked default, else the base, else the first. */
function defaultUnit(variant) {
  if (!variant?.units?.length) return null;
  return variant.units.find((u) => u.is_default_sale)
    ?? variant.units.find((u) => u.role === 'base')
    ?? variant.units[0];
}

const legendStyle = {
  padding: 0, marginBottom: 8, fontSize: '0.8rem', fontWeight: 700, color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const chipStyle = (selected, available) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 20, fontSize: '0.85rem', fontFamily: 'inherit',
  cursor: 'pointer', transition: 'all 150ms ease', textAlign: 'left',
  border: selected ? '2px solid #a855f7' : available ? '1.5px solid rgba(168,85,247,0.3)' : '1.5px dashed rgba(156,163,175,0.5)',
  background: selected ? 'rgba(168,85,247,0.12)' : 'transparent',
  color: selected ? '#a855f7' : available ? 'inherit' : '#9ca3af',
  fontWeight: selected ? 700 : 500,
  textDecoration: available ? 'none' : 'line-through',
});
