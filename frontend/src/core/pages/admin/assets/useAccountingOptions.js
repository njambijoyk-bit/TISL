import { useState, useEffect } from 'react';
import inventoryAPI from '../../../../_shared/api/inventory';

/** What the asset forms choose from (currencies, methods, ledgers); `ready` is false until script 71 has been run. */
export function useAccountingOptions() {
  const [opts, setOpts] = useState(null);
  useEffect(() => { inventoryAPI.accounting.options().then(setOpts).catch(() => setOpts({ ready: false, methods: [], currencies: [], asset_ledgers: [], expense_ledgers: [], pay_from: [] })); }, []);
  return opts;
}
