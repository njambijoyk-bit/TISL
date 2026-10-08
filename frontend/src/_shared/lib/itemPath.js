/**
 * Public addresses for products and services: the id followed by the SKU, e.g. /products/12-ANG-001.
 * The id is what the site looks the item up by (so a SKU that is edited, or a link written by hand with just the id, still works); the SKU is there for people.
 * An item without a SKU is just its id. The detail pages tidy the address to the current one after they load.
 */
const clean = (s) => String(s ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

export const itemSlug = (item) => {
  const sku = clean(item?.sku);
  return sku ? `${item?.id}-${sku}` : `${item?.id}`;
};
export const productPath = (p) => `/products/${itemSlug(p)}`;
export const servicePath = (s) => `/services/${itemSlug(s)}`;

/** An auction's address: its id then its product's SKU, e.g. /auctions/19-ANG-001. */
export const auctionPath = (auction, product) => `/auctions/${itemSlug({ id: auction?.id, sku: (product ?? auction?.product)?.sku })}`;

/** A price list's address: its id then its name, e.g. /price-lists/2-spring-prices. */
export const namedSlug = (id, name) => {
  const n = clean(String(name ?? '').toLowerCase());
  return n ? `${id}-${n}` : `${id}`;
};
export const priceListPath = (l, admin = false) => `${admin ? '/admin' : ''}/price-lists/${namedSlug(l?.id, l?.name)}`;

/** The id from an address parameter such as "12-ANG-001" (or plain "12"). */
export const idFromParam = (param) => {
  const m = /^(\d+)(?:-|$)/.exec(String(param ?? ''));
  return m ? m[1] : param;
};
