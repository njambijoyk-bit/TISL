import api from './axios';

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

/**
 * Must match ProductVariantController::deriveCombinationKey():
 * option_value ids sorted ascending, joined with '-'.
 * @param {Object<number, number>} optionValueIdsByOptionId  { [option_id]: option_value_id }
 */
export const deriveCombinationKey = (optionValueIdsByOptionId = {}) =>
  Object.values(optionValueIdsByOptionId)
    .map(Number)
    .sort((a, b) => a - b)
    .join('-');

/** Attach combination_key automatically whenever option_value_ids is sent. */
const withCombinationKey = (data) =>
  data?.option_value_ids
    ? { ...data, combination_key: deriveCombinationKey(data.option_value_ids) }
    : data;

/**
 * Structured product variants (admin): options → values → variants → units, plus images.
 * Variant-unit prices are in the parent product's currency.
 */
const productVariantsAPI = {
  // ── Options (e.g. Size, Colour) ────────────────────────────────────────
  getOptions: async (productId) =>
    (await api.get(`/admin/products/${productId}/options`)).data,
  createOption: async (productId, data) =>
    (await api.post(`/admin/products/${productId}/options`, data)).data,
  updateOption: async (productId, optionId, data) =>
    (await api.put(`/admin/products/${productId}/options/${optionId}`, data)).data,
  deleteOption: async (productId, optionId) =>
    (await api.delete(`/admin/products/${productId}/options/${optionId}`)).data,

  // ── Option values (e.g. Small, Red) — data: { value, meta?, position? } ─
  createOptionValue: async (productId, optionId, data) =>
    (await api.post(`/admin/products/${productId}/options/${optionId}/values`, data)).data,
  updateOptionValue: async (productId, optionId, valueId, data) =>
    (await api.put(`/admin/products/${productId}/options/${optionId}/values/${valueId}`, data)).data,
  deleteOptionValue: async (productId, optionId, valueId) =>
    (await api.delete(`/admin/products/${productId}/options/${optionId}/values/${valueId}`)).data,

  // ── Variants ───────────────────────────────────────────────────────────
  getVariants: async (productId) =>
    (await api.get(`/admin/products/${productId}/variants`)).data,
  getVariant: async (productId, variantId) =>
    (await api.get(`/admin/products/${productId}/variants/${variantId}`)).data,
  /**
   * data: { sku?, barcode?, name?, option_value_ids?: {[option_id]: value_id},
   *         net_content_qty?, net_content_unit_id?, stock_quantity?, is_default?, status?,
   *         base_unit?: { unit_id, price?, compare_at_price?, is_default_sale? } }
   * combination_key is derived for you.
   */
  createVariant: async (productId, data) =>
    (await api.post(`/admin/products/${productId}/variants`, withCombinationKey(data))).data,
  updateVariant: async (productId, variantId, data) =>
    (await api.put(`/admin/products/${productId}/variants/${variantId}`, withCombinationKey(data))).data,
  deleteVariant: async (productId, variantId) =>
    (await api.delete(`/admin/products/${productId}/variants/${variantId}`)).data,
  setDefaultVariant: async (productId, variantId) =>
    (await api.post(`/admin/products/${productId}/variants/${variantId}/set-default`)).data,

  // ── Variant units (base / compound / alternate) ────────────────────────
  getUnits: async (variantId) =>
    (await api.get(`/admin/variants/${variantId}/units`)).data,
  /**
   * data: { unit_id, role: 'base'|'compound'|'alternate',
   *         contains_variant_unit_id? + contains_qty? (compound),
   *         base_factor? (alternate), price?, compare_at_price?,
   *         is_sellable?, is_purchasable?, is_default_sale?, position?, is_active? }
   */
  createUnit: async (variantId, data) =>
    (await api.post(`/admin/variants/${variantId}/units`, data)).data,
  /** Only price/flags/position are editable — structure changes mean delete + recreate. */
  updateUnit: async (unitId, data) =>
    (await api.put(`/admin/variant-units/${unitId}`, data)).data,
  deleteUnit: async (unitId) =>
    (await api.delete(`/admin/variant-units/${unitId}`)).data,

  // ── Images ─────────────────────────────────────────────────────────────
  getImages: async (productId) =>
    (await api.get(`/admin/products/${productId}/images`)).data,
  /**
   * data: { image?: File, image_url?, option_value_id?, variant_id?,
   *         alt_text?, position?, is_primary? }
   */
  createImage: async (productId, data) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
    });
    return (await api.post(`/admin/products/${productId}/images`, fd, multipart)).data;
  },
  updateImage: async (imageId, data) =>
    (await api.put(`/admin/images/${imageId}`, data)).data,
  setPrimaryImage: async (productId, imageId) =>
    (await api.post(`/admin/products/${productId}/images/${imageId}/set-primary`)).data,
  deleteImage: async (imageId) =>
    (await api.delete(`/admin/images/${imageId}`)).data,
};

export default productVariantsAPI;
export { productVariantsAPI };
