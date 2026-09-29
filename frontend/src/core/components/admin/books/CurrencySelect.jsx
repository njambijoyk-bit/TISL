import useCurrencyStore from '../../../../_shared/store/currencyStore';
import { useBaseCode } from '../../../../_shared/lib/baseCurrency';

/** Pick a currency for a money setting. Empty = the base currency. */
export default function CurrencySelect({ value, onChange, style, className, id, 'aria-label': ariaLabel }) {
  const base = useBaseCode();
  const currencies = useCurrencyStore((s) => s.currencies);
  return (
    <select id={id} aria-label={ariaLabel ?? 'Currency'} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} style={style} className={className}>
      <option value="">Base currency{base ? ` (${base})` : ''}</option>
      {currencies.filter((c) => !c.is_base).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
    </select>
  );
}
