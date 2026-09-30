/** A cart item as the checkout engine wants it. */
export const toApiItem = (i) => (i.hamper_id
  ? { hamper_id: i.hamper_id, quantity: i.quantity }
  : { product_id: i.id, variant_id: i.variant_id, variant_unit_id: i.variant_unit_id, quantity: i.quantity });
