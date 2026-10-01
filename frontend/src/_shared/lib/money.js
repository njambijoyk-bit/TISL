/**
 * Money formatting shared across the app.
 * Prefer the backend's display_price + display_currency for listings;
 * use these helpers to render them.
 */

/**
 * "KES 1,250.00" / "$ 12.50" — symbol if we have one, else ISO code.
 * @param {{ decimals?: 'fixed' | 'auto' }} opts  'auto' drops ".00" on whole
 *   amounts (storefront style: "KSh 3,000"); 'fixed' always shows 2 (admin).
 * @param {number} opts.max  most decimals shown (default 2; auction prices go to 10)
 */
export const formatMoney = (amount, currency, { decimals = 'fixed', max = 2 } = {}) => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  if (Number.isNaN(n)) return '—';
  const label = typeof currency === 'string' ? currency : currency?.symbol || currency?.code || '';
  const whole = Math.abs(n - Math.round(n)) < (max > 2 ? 1e-10 : 0.005);
  const min = decimals === 'auto' && whole ? 0 : 2;
  const body = n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
  return label ? `${label} ${body}` : body;
};

/**
 * Price to show for a product/service coming from the API.
 * Uses display_* (converted to the chosen currency) when present,
 * otherwise the native price + currency.
 * @param {object} item     product or service payload
 * @param {object} opts     { symbolFor?: (code) => symbol, priceKey?: 'price' | 'base_price' }
 */
export const formatItemPrice = (item, { symbolFor, priceKey = 'price' } = {}) => {
  if (!item) return '—';
  if (item.price_is_negotiable) return 'Negotiable';
  if (item.display_price !== undefined && item.display_price !== null) {
    const code = item.display_currency;
    return formatMoney(item.display_price, (symbolFor && symbolFor(code)) || code);
  }
  return formatMoney(item[priceKey], item.currency);
};
