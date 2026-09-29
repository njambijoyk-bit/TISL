import { useEffect, useState } from 'react';
import booksAPI from '../../../../_shared/api/books';

const flat = (nodes, out = []) => { nodes.forEach((g) => { out.push(g); flat(g.children ?? [], out); }); return out; };

export const NATURE_LABEL = { taxable: 'VAT-able', zero_rated: 'zero-rated', exempt: 'exempt', out_of_scope: 'out of scope' };

/** Active accounts of a group behaviour ('sales' | 'purchase') that have their tax set — null while loading. */
export default function useTradingAccounts(kind = 'sales') {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [tree, ledgers] = await Promise.all([booksAPI.groups(), booksAPI.ledgers({ all: 1 })]);
        const ids = new Set(flat(tree).filter((g) => g.behaviour === kind).map((g) => g.id));
        const list = Array.isArray(ledgers) ? ledgers : ledgers.data ?? [];
        if (live) setRows(list.filter((l) => ids.has(l.group_id) && l.is_active && l.tax_nature));
      } catch { if (live) setRows([]); }
    })();
    return () => { live = false; };
  }, [kind]);
  return rows;
}

export const accountLabel = (l) => `${l.name} — ${NATURE_LABEL[l.tax_nature]}${l.tax_rate_ledger?.rate_value != null && l.tax_nature === 'taxable' ? ` ${Number(l.tax_rate_ledger.rate_value)}%` : ''}`;
