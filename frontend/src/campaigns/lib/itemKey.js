/** The key a featured item is known by on both sides: "product:12" for the whole product, "product:12:v34" for one of its options (matches CampaignItem::keyOf). */
export const itemKey = (type, id, variantId = 0) => (Number(variantId) > 0 ? `${type}:${id}:v${variantId}` : `${type}:${id}`);
