import { useEffect, useState } from 'react';
import taxAPI from '../../../../_shared/api/tax';
import { input, inputDisabled, focusRing } from '../../../../_shared/theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);

/** "VAT 16%" — how a rate is named in dropdowns and summaries. */
export const taxRateLabel = (r) => {
  if (!r) return '';
  const pct = Number(r.rate_value).toString();
  const cls = r.classification && r.classification !== 'standard' ? ` (${r.classification.replace(/_/g, ' ')})` : '';
  return `${r.tax_type?.code ?? r.tax_type?.name ?? 'Tax'} ${pct}%${cls}`;
};

/**
 * Pick a tax that is added on top of a price: active, in effect today,
 * a percentage, and of an "added to price" tax type. Empty = no tax.
 *
 * @param {number|string} value  tax rate id ('' = no tax)
 * @param {(id: number|'') => void} onChange
 */
export default function TaxRateSelect({ value, onChange, disabled = false, emptyLabel = 'No tax', id, style }) {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    taxAPI.getRates()
      .then((res) => {
        if (cancelled) return;
        const t = today();
        setRates((res.tax_rates ?? []).filter((r) =>
          r.is_active
          && r.rate_type === 'percentage'
          && r.tax_type?.application_mode === 'additive'
          && r.tax_type?.is_active !== false
          && (!r.valid_from || r.valid_from.slice(0, 10) <= t)
          && (!r.valid_until || r.valid_until.slice(0, 10) >= t)
        ));
      })
      .catch(() => { if (!cancelled) setRates([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Keep showing a saved rate even if it has since ended or been deactivated
  const selectedMissing = value && !rates.some((r) => String(r.id) === String(value));

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled || loading}
      style={{ ...(disabled ? inputDisabled : input), cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      {...(disabled ? {} : focusRing)}
    >
      <option value="">{loading ? 'Loading taxes…' : emptyLabel}</option>
      {selectedMissing && <option value={value}>Current rate (no longer active)</option>}
      {rates.map((r) => <option key={r.id} value={r.id}>{taxRateLabel(r)}</option>)}
    </select>
  );
}
