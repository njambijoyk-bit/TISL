import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import useCartStore from '../../../_shared/store/cartStore';
import { fetchVariantData, defaultVariant, defaultUnit, variantLabel, buildCartLine } from '../../../_shared/lib/cartVariants';
import VariantChooserModal from './VariantChooserModal';

/**
 * Add a product to the cart with its variant filled in: a product with one variant gets it automatically, one with several
 * asks which (a small chooser). `chooser` must be rendered by the caller; `add(product, qty)` resolves true once it is in the cart.
 */
export default function useCartAdder() {
  const addItem = useCartStore((s) => s.addItem);
  const [pending, setPending] = useState(null);   // { product, qty, resolve }

  const put = useCallback((product, data, variant, unit, qty) => {
    addItem(buildCartLine(product, variant, unit, variantLabel(data, variant)), qty);
    toast.success(`${product.name} added to cart!`);
  }, [addItem]);

  const add = useCallback(async (product, qty = 1) => {
    if (product.variant_id) { addItem(product, qty); toast.success(`${product.name} added to cart!`); return true; }   // already a specific variant
    let data;
    try { data = await fetchVariantData(product.id); } catch { addItem(product, qty); toast.success(`${product.name} added to cart!`); return true; }   // could not load the variants: keep the old behaviour
    const variants = data?.variants ?? [];
    if (variants.length === 0) { addItem(product, qty); toast.success(`${product.name} added to cart!`); return true; }   // no structured variants
    if (variants.length === 1) {
      const v = variants[0]; const u = defaultUnit(v);
      if (!u) { addItem(product, qty); return true; }
      put(product, data, v, u, qty);
      return true;
    }
    return new Promise((resolve) => setPending({ product, qty, data, resolve }));
  }, [addItem, put]);

  const close = () => { pending?.resolve(false); setPending(null); };
  const chooser = pending ? (
    <VariantChooserModal product={pending.product} onClose={close}
      onConfirm={(c) => { put(pending.product, { options: pending.data.options, variants: pending.data.variants }, c.variant, c.unit, pending.qty); pending.resolve(true); setPending(null); }} />
  ) : null;

  return { add, chooser, defaultVariant };
}
