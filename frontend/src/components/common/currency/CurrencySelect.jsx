import { useEffect } from 'react';
import useCurrencyStore from '../../../store/currencyStore';
import { input, inputDisabled, focusRing } from '../../../theme/tokens';

/**
 * Admin currency picker for forms (product price, service rates, tax rates…).
 * Lists active currencies; the base currency is marked. Loads the list once.
 *
 * @param {number|string} value     currency id ('' = let the server use base)
 * @param {(id: number|'') => void} onChange
 * @param {boolean} allowEmpty       show a "Base currency" empty option
 * @param {boolean} includeInactive  also list inactive currencies (e.g. for filters)
 */
export default function CurrencySelect({
  value, onChange, disabled = false, allowEmpty = false, includeInactive = false,
  emptyLabel = 'Base currency', style, id, name = 'currency_id',
}) {
  const { adminCurrencies, adminLoading, fetchAdminCurrencies } = useCurrencyStore();

  useEffect(() => {
    if (!adminCurrencies.length && !adminLoading) fetchAdminCurrencies().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = adminCurrencies.filter((c) => includeInactive || c.is_active || String(c.id) === String(value));

  return (
    <select
      id={id}
      name={name}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled || adminLoading}
      style={{ ...(disabled ? inputDisabled : input), cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      {...(disabled ? {} : focusRing)}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {adminLoading && !options.length && <option value="">Loading currencies…</option>}
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.code} — {c.name}{c.is_base ? ' (base)' : ''}{!c.is_active ? ' (inactive)' : ''}
        </option>
      ))}
    </select>
  );
}
