import { create } from 'zustand';
import productVariantsAPI, { deriveCombinationKey } from '../api/productVariants';
import { createRunners, upsertById, removeById } from './helpers/apiState';

/**
 * Structured variants for ONE product at a time (the product being edited).
 * Call loadProduct(productId) when the editor opens and reset() when it closes.
 *
 * Variant-unit prices are in the product's own currency (product.currency).
 */
const initialState = {
  productId: null,
  options: [],    // [{ id, name, position, values: [{ id, value, meta, position }] }]
  variants: [],   // formatVariant payloads: units, option_values, images, has_base_unit
  images: [],

  loading: { all: false, options: false, variants: false, images: false },
  actionLoading: false,
  error: null,
};

const useProductVariantStore = create((set, get) => {
  const { act, load } = createRunners(set, get);

  const pid = () => {
    const id = get().productId;
    if (!id) throw new Error('productVariantStore: call loadProduct(productId) first');
    return id;
  };

  /** Patch one variant's units array in place. */
  const patchVariantUnits = (variantId, fn) =>
    set({
      variants: get().variants.map((v) =>
        v.id === Number(variantId) ? { ...v, units: fn(v.units ?? []) } : v
      ),
    });

  return {
    ...initialState,

    // ── Selectors ────────────────────────────────────────────────────────
    defaultVariant: () => get().variants.find((v) => v.is_default) ?? null,
    variantByCombination: (optionValueIdsByOptionId) =>
      get().variants.find((v) => v.combination_key === deriveCombinationKey(optionValueIdsByOptionId)) ?? null,
    baseUnitOf: (variant) => variant?.units?.find((u) => u.role === 'base') ?? null,
    /** Mirrors ProductVariantUnit::effectivePrice() for display in the editor. */
    effectiveUnitPrice: (variant, unit) => {
      if (!unit) return null;
      if (unit.price !== null && unit.price !== undefined) return Number(unit.price);
      if (unit.role === 'base') return null;
      const base = variant?.units?.find((u) => u.role === 'base');
      return base?.price != null ? Math.round(Number(base.price) * Number(unit.base_factor) * 100) / 100 : null;
    },
    imagesForVariant: (variantId) => get().images.filter((i) => i.variant_id === variantId),

    // ── Lifecycle ────────────────────────────────────────────────────────
    loadProduct: (productId) => {
      set({ ...initialState, productId: Number(productId) });
      return load('all', async () => {
        const [o, v, i] = await Promise.all([
          productVariantsAPI.getOptions(productId),
          productVariantsAPI.getVariants(productId),
          productVariantsAPI.getImages(productId),
        ]);
        set({ options: o.options ?? [], variants: v.variants ?? [], images: i.images ?? [] });
      }, 'Failed to load variants');
    },

    reset: () => set({ ...initialState }),

    // ── Options ──────────────────────────────────────────────────────────
    fetchOptions: () => load('options', async () => {
      const res = await productVariantsAPI.getOptions(pid());
      set({ options: res.options ?? [] });
      return res.options;
    }, 'Failed to load options'),

    createOption: (data) => act(async () => {
      const res = await productVariantsAPI.createOption(pid(), data);
      set({ options: [...get().options, { values: [], ...res.option }] });
      return res.option;
    }, 'Failed to create option'),

    updateOption: (optionId, data) => act(async () => {
      const res = await productVariantsAPI.updateOption(pid(), optionId, data);
      set({ options: upsertById(get().options, res.option) });
      return res.option;
    }, 'Failed to update option'),

    deleteOption: (optionId) => act(async () => {
      await productVariantsAPI.deleteOption(pid(), optionId);
      set({ options: removeById(get().options, optionId) });
    }, 'Failed to delete option'),

    // ── Option values ────────────────────────────────────────────────────
    createOptionValue: (optionId, data) => act(async () => {
      const res = await productVariantsAPI.createOptionValue(pid(), optionId, data);
      set({
        options: get().options.map((o) =>
          o.id === optionId ? { ...o, values: [...(o.values ?? []), res.value] } : o
        ),
      });
      return res.value;
    }, 'Failed to add option value'),

    updateOptionValue: (optionId, valueId, data) => act(async () => {
      const res = await productVariantsAPI.updateOptionValue(pid(), optionId, valueId, data);
      set({
        options: get().options.map((o) =>
          o.id === optionId ? { ...o, values: upsertById(o.values ?? [], res.value) } : o
        ),
      });
      return res.value;
    }, 'Failed to update option value'),

    deleteOptionValue: (optionId, valueId) => act(async () => {
      await productVariantsAPI.deleteOptionValue(pid(), optionId, valueId);
      set({
        options: get().options.map((o) =>
          o.id === optionId ? { ...o, values: removeById(o.values ?? [], valueId) } : o
        ),
      });
    }, 'Failed to delete option value'),

    // ── Variants ─────────────────────────────────────────────────────────
    fetchVariants: () => load('variants', async () => {
      const res = await productVariantsAPI.getVariants(pid());
      set({ variants: res.variants ?? [] });
      return res.variants;
    }, 'Failed to load variants'),

    /** combination_key is derived from option_value_ids automatically. */
    createVariant: (data) => act(async () => {
      const res = await productVariantsAPI.createVariant(pid(), data);
      let variants = upsertById(get().variants, res.variant);
      if (res.variant?.is_default) variants = variants.map((v) => ({ ...v, is_default: v.id === res.variant.id }));
      set({ variants });
      return res.variant;
    }, 'Failed to create variant'),

    updateVariant: (variantId, data) => act(async () => {
      const res = await productVariantsAPI.updateVariant(pid(), variantId, data);
      set({ variants: upsertById(get().variants, res.variant) });
      return res.variant;
    }, 'Failed to update variant'),

    deleteVariant: (variantId) => act(async () => {
      await productVariantsAPI.deleteVariant(pid(), variantId);
      set({ variants: removeById(get().variants, variantId) });
    }, 'Failed to delete variant'),

    setDefaultVariant: (variantId) => act(async () => {
      await productVariantsAPI.setDefaultVariant(pid(), variantId);
      set({ variants: get().variants.map((v) => ({ ...v, is_default: v.id === variantId })) });
    }, 'Failed to set default variant'),

    // ── Variant units ────────────────────────────────────────────────────
    /** base_factor for compound units is derived server-side from contains_qty. */
    createUnit: (variantId, data) => act(async () => {
      const res = await productVariantsAPI.createUnit(variantId, data);
      patchVariantUnits(variantId, (units) => [...units, res.unit]);
      return res.unit;
    }, 'Failed to add unit'),

    updateUnit: (variantId, unitId, data) => act(async () => {
      const res = await productVariantsAPI.updateUnit(unitId, data);
      patchVariantUnits(variantId, (units) => upsertById(units, res.unit));
      return res.unit;
    }, 'Failed to update unit'),

    deleteUnit: (variantId, unitId) => act(async () => {
      await productVariantsAPI.deleteUnit(unitId);
      patchVariantUnits(variantId, (units) => removeById(units, unitId));
    }, 'Failed to delete unit'),

    // ── Images ───────────────────────────────────────────────────────────
    fetchImages: () => load('images', async () => {
      const res = await productVariantsAPI.getImages(pid());
      set({ images: res.images ?? [] });
      return res.images;
    }, 'Failed to load images'),

    createImage: (data) => act(async () => {
      const res = await productVariantsAPI.createImage(pid(), data);
      let images = [...get().images, res.image];
      if (res.image?.is_primary) images = images.map((i) => ({ ...i, is_primary: i.id === res.image.id }));
      set({ images });
      return res.image;
    }, 'Failed to upload image'),

    updateImage: (imageId, data) => act(async () => {
      const res = await productVariantsAPI.updateImage(imageId, data);
      set({ images: upsertById(get().images, res.image) });
      return res.image;
    }, 'Failed to update image'),

    setPrimaryImage: (imageId) => act(async () => {
      await productVariantsAPI.setPrimaryImage(pid(), imageId);
      set({ images: get().images.map((i) => ({ ...i, is_primary: i.id === imageId })) });
    }, 'Failed to set primary image'),

    deleteImage: (imageId) => act(async () => {
      await productVariantsAPI.deleteImage(imageId);
      set({ images: removeById(get().images, imageId) });
    }, 'Failed to delete image'),

    clearError: () => set({ error: null }),
  };
});

export default useProductVariantStore;
