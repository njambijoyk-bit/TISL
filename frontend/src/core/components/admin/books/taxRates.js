import taxAPI from '../../../../_shared/api/tax';

let cache = null;   // the percentage tax rates, fetched once

/** The tax rates a line can be taxed at: percentages, not the withheld ones. */
export const loadTaxRates = () => (cache ??= taxAPI.getRates({ active: true })
  .then((r) => (r.tax_rates ?? []).filter((x) => x.rate_type === 'percentage' && x.tax_type?.application_mode !== 'withheld'))
  .catch(() => { cache = null; return []; }));
