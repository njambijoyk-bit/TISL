import useCurrencyStore from '../store/currencyStore';
import { formatMoney } from '../lib/money';

const round2 = (n) => Math.round(n * 100) / 100;

const SERVICE_SUFFIX = { hourly: '/hr', daily: '/day', subscription: '/mo' };
const SERVICE_RATE_KEY = { hourly: 'hourly_rate', daily: 'daily_rate' };

/**
 * Storefront money helpers, all in the shopper's chosen currency.
 *
 * - Main prices come from the server (display_price / display_currency),
 *   converted with the same rates the price filters use.
 * - Secondary amounts the server doesn't convert (original price on listings,
 *   minimum charges, legacy variant prices) are converted here with the
 *   public conversion rates — same maths as Currency::convertTo().
 * - If a rate isn't available yet, amounts are shown in the item's OWN
 *   currency rather than being mislabelled.
 *
 * Components using this re-render when the currency list or choice changes.
 */
export default function useMoney() {
  const currencies = useCurrencyStore((s) => s.currencies);
  const displayCode = useCurrencyStore((s) => s.displayCurrency);

  const base = currencies.find((c) => c.is_base) ?? null;
  const active = currencies.find((c) => c.code === displayCode) ?? base;
  const symbolFor = (code) => currencies.find((c) => c.code === code)?.symbol || code || '';
  const fmt = (n, cur) => formatMoney(n, cur, { decimals: 'auto' });

  /** Native amount → display currency, or null if we can't convert yet. */
  const toDisplay = (amount, nativeCurrencyId) => {
    if (amount === null || amount === undefined || amount === '') return null;
    const from = nativeCurrencyId ? currencies.find((c) => c.id === Number(nativeCurrencyId)) : base;
    if (!from || !active || !Number(active.conversion_rate) || from.conversion_rate == null) return null;
    if (from.id === active.id) return round2(Number(amount));
    return round2((Number(amount) * Number(from.conversion_rate)) / Number(active.conversion_rate));
  };

  const nativeId = (item) => item?.currency_id ?? item?.currency?.id ?? null;

  /** Any native amount of an item, formatted in the display currency. */
  const itemAmount = (amount, item) => {
    if (amount === null || amount === undefined || amount === '') return null;
    const converted = toDisplay(amount, nativeId(item));
    return converted !== null
      ? fmt(converted, active.symbol || active.code)
      : fmt(amount, item?.currency ?? '');
  };

  /**
   * The server's display_price is used when it's in the currency the shopper
   * has chosen *now*. Right after they switch (before a refetch) it's stale,
   * so we convert the native amount here instead — prices change instantly
   * and detail pages never need to refetch (which would bump view counts).
   */
  const serverFresh = (item) =>
    item?.display_price != null && (!active || item.display_currency === active.code);

  /** Main price of a product (or anything with display_price). */
  const price = (item, key = 'price') => {
    if (!item) return null;
    if (key === 'price' && serverFresh(item)) return fmt(item.display_price, symbolFor(item.display_currency));
    const local = itemAmount(item[key], item);
    if (local !== null) return local;
    return item.display_price != null ? fmt(item.display_price, symbolFor(item.display_currency)) : null;
  };

  /** Numeric main price in the display currency (for totals like qty × price). */
  const priceValue = (item, key = 'price') => {
    if (!item) return 0;
    if (key === 'price' && serverFresh(item)) return Number(item.display_price);
    return toDisplay(item[key], nativeId(item)) ?? Number(item.display_price ?? item[key] ?? 0);
  };

  /** Strike-through price, only when it's actually higher. */
  const originalPrice = (item) => {
    if (!item?.original_price || Number(item.original_price) <= Number(item.price)) return null;
    if (item.display_original_price != null && serverFresh(item)) {
      return fmt(item.display_original_price, symbolFor(item.display_currency));
    }
    return itemAmount(item.original_price, item);
  };

  /**
   * "KSh 1,240/day", "From $ 500", "Contact for price" — for any pricing model.
   * @param {object} opts
   *   contactLabel  text when there's no price (null to render nothing)
   *   fromModels    models prefixed with "From " (default: project_based)
   *   suffixes      override per-model suffixes, e.g. { subscription: '/month' }
   */
  const servicePrice = (service, { contactLabel = 'Contact for price', fromModels = ['project_based'], suffixes = {} } = {}) => {
    if (!service) return null;
    if (service.price_is_negotiable) return 'Negotiable';
    const model = service.pricing_model;
    const nativeAmount = service[SERVICE_RATE_KEY[model] ?? 'base_price'];
    const amount = serverFresh(service)
      ? fmt(service.display_price, symbolFor(service.display_currency))
      : (itemAmount(nativeAmount, service)
         ?? (service.display_price != null ? fmt(service.display_price, symbolFor(service.display_currency)) : null));
    if (!amount || (nativeAmount == null && service.display_price == null)) return contactLabel;
    const prefix = fromModels.includes(model) ? 'From ' : '';
    return `${prefix}${amount}${{ ...SERVICE_SUFFIX, ...suffixes }[model] ?? ''}`;
  };

  return {
    active,                                   // { id, code, symbol, … } or null while loading
    code: active?.code ?? null,
    symbol: active?.symbol || active?.code || '',
    format: (n) => fmt(n, active?.symbol || active?.code || ''),
    toDisplay,
    itemAmount,
    price,
    priceValue,
    originalPrice,
    servicePrice,
  };
}
