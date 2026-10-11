import { useEffect, useState } from 'react';
import booksAPI from '../../_shared/api/books';
import { Field, SelectInput } from '../../core/components/admin/ui/Form';

/** Choose one account from the books (for the tip and the service charge). Accounts of customers, suppliers, cash and bank are refused by the books, so they are left out. */
export default function LedgerSelect({ id, label, hint, value, onChange, disabled }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    booksAPI.ledgers({ all: 1 }).then((r) => {
      const list = Array.isArray(r) ? r : r.data ?? [];
      setRows(list.filter((l) => l.is_active && !/debtor|creditor|cash|bank/i.test(l.group?.name ?? '')).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setRows([]));
  }, []);

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <SelectInput id={id} value={value ?? ''} disabled={disabled || rows === null} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">None</option>
        {(rows ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}{l.group?.name ? ` — ${l.group.name}` : ''}</option>)}
      </SelectInput>
    </Field>
  );
}
