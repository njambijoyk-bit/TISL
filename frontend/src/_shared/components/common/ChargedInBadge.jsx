import useCurrencyStore from '../../store/currencyStore';

/**
 * Prices are shown in the shopper's chosen currency, but every order is charged in the base (operating) currency.
 * This small note says so — and shows nothing when the chosen currency IS the base currency.
 */
export default function ChargedInBadge({ style }) {
  const currencies = useCurrencyStore((s) => s.currencies);
  const chosen = useCurrencyStore((s) => s.displayCurrency);
  const base = currencies.find((c) => c.is_base);
  if (!base || !chosen || chosen === base.code) return null;
  return (
    <span title={`Shown in ${chosen} for your convenience; your order is charged in ${base.code}.`}
      style={{ display: 'inline-block', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, background: 'rgba(107,114,128,0.12)', color: '#6b7280', whiteSpace: 'nowrap', ...style }}>
      Charged in {base.code}
    </span>
  );
}
