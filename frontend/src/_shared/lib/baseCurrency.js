import { useEffect } from 'react';
import useCurrencyStore from '../store/currencyStore';

/**
 * The base currency's ISO code, read from the currencies the app already
 * loaded ('' until they arrive). Use instead of hard-coding a default currency.
 */
export const getBaseCode = () => {
  const s = useCurrencyStore.getState();
  return s.baseCurrency?.code
    || s.currencies.find((c) => c.is_base)?.code
    || s.adminCurrencies.find((c) => c.is_base)?.code
    || '';
};

/** Hook version: loads the currency list if nothing has yet, and re-renders when it lands. */
export const useBaseCode = () => {
  const code = useCurrencyStore((s) => s.baseCurrency?.code || s.currencies.find((c) => c.is_base)?.code || s.adminCurrencies.find((c) => c.is_base)?.code || '');
  const fetchCurrencies = useCurrencyStore((s) => s.fetchCurrencies);
  useEffect(() => {
    if (!code) fetchCurrencies();
  }, [code, fetchCurrencies]);
  return code;
};
