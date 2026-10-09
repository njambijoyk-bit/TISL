/** A cart item as the checkout engine wants it. */
export const toApiItem = (i) => (i.hamper_id
  ? { hamper_id: i.hamper_id, quantity: i.quantity }
  : { product_id: i.id, variant_id: i.variant_id, variant_unit_id: i.variant_unit_id, quantity: i.quantity });

/** The same, with its own ready-now / preorder flag: for a checkout that takes both kinds at once. */
export const toApiItemWithKind = (i) => ({ ...toApiItem(i), preorder: Boolean(i.preorder) });
