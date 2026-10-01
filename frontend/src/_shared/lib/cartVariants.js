import api from '../api/axios';

const cache = new Map();   // product id -> Promise<{ options, variants, images }>

/** A product's variants (with their units and prices). Cached for the session. */
export const fetchVariantData = (productId) => {
  if (!cache.has(productId)) {
    cache.set(productId, api.get(`/products/${productId}/variants`).then((r) => r.data).catch((e) => { cache.delete(productId); throw e; }));
  }
  return cache.get(productId);
};

export const defaultVariant = (data) => data?.variants?.find((v) => v.is_default) ?? data?.variants?.[0] ?? null;

export const defaultUnit = (variant) => {
  if (!variant?.units?.length) return null;
  return variant.units.find((u) => u.is_default_sale) ?? variant.units.find((u) => u.role === 'base') ?? variant.units[0];
};

/** "Large / Red" from the chosen option values, else the variant's own name. */
export const variantLabel = (data, variant) => (data?.options ?? [])
  .map((o) => o.values.find((v) => String(v.id) === String(variant.selection?.[o.id]))?.value).filter(Boolean).join(' / ') || variant.name || 'Standard';

/** A cart line for one variant + unit of a product (same shape the product page adds). */
export const buildCartLine = (product, variant, unit, label) => ({
  ...product,
  price: unit.price ?? product.price,
  original_price: unit.compare_at_price ?? null,
  line_key: `${product.id}:${variant.id}:${unit.id}`,
  variant_id: variant.id,
  variant_unit_id: unit.id,
  selectedVariant: { id: variant.id, name: label ?? variant.name, sku: variant.sku, unit: unit.unit?.name, unit_code: unit.unit?.code },
});

/** Is this a plain product line with no variant on it yet? (hampers and anything non-numeric are not) */
export const isLooseProductLine = (item) => Boolean(item) && !item.variant_id && !item.is_hamper && !item.hamper_id && /^\d+$/.test(String(item.id));
