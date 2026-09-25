import useCurrencyStore from '../../store/currencyStore';
import { formatItemPrice, formatMoney } from '../../lib/money';
import { colors } from '../../theme/tokens';

/**
 * Price for a product or service payload.
 *
 * Storefront (default): shows display_price in the shopper's chosen currency.
 * Admin (native): shows the price exactly as stored, in the item's own currency.
 *
 * @param {object}  item        product / service from the API
 * @param {string}  priceKey    'price' (products) | 'base_price' (services)
 * @param {boolean} native      show the stored price + currency instead of the converted one
 * @param {boolean} showOriginal strike-through original_price when it's higher (products)
 * @param {string}  suffix      e.g. '/hr'
 * @param {'sm'|'md'|'lg'} size
 */
export default function PriceTag({
  item, priceKey = 'price', native = false, showOriginal = false, suffix = '', size = 'md', style,
}) {
  // Subscribe to the lists (not just symbolFor) so symbols appear once currencies load.
  const currencies = useCurrencyStore((s) => s.currencies);
  const adminCurrencies = useCurrencyStore((s) => s.adminCurrencies);
  const symbolFor = (code) =>
    currencies.find((c) => c.code === code)?.symbol
    ?? adminCurrencies.find((c) => c.code === code)?.symbol
    ?? code;
  if (!item) return null;

  const fontSize = { sm: '0.78rem', md: '0.875rem', lg: '1.25rem' }[size] ?? '0.875rem';

  const main = native
    ? (item.price_is_negotiable ? 'Negotiable' : formatMoney(item[priceKey], item.currency))
    : formatItemPrice(item, { symbolFor, priceKey });

  const hasOriginal = showOriginal
    && item.original_price
    && Number(item.original_price) > Number(item[priceKey]);

  const original = hasOriginal
    ? (native || item.display_original_price == null
        ? formatMoney(item.original_price, item.currency)
        : formatMoney(item.display_original_price, symbolFor(item.display_currency)))
    : null;

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', ...style }}>
      <span style={{ fontWeight: 700, fontSize, color: colors.text }}>
        {main}{suffix && main !== 'Negotiable' && <span style={{ fontWeight: 500, color: colors.textMuted }}>{suffix}</span>}
      </span>
      {original && (
        <span style={{ fontSize: '0.72rem', color: colors.textFaint, textDecoration: 'line-through' }}>
          {original}
        </span>
      )}
    </span>
  );
}
