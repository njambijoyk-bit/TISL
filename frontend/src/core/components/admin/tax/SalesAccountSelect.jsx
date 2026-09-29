import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import booksAPI from '../../../../_shared/api/books';
import { colors } from '../../../../_shared/theme/tokens';

const NATURE = { taxable: 'VAT-able', zero_rated: 'zero-rated', exempt: 'exempt', out_of_scope: 'out of scope' };
const flat = (nodes, out = []) => { nodes.forEach((g) => { out.push(g); flat(g.children ?? [], out); }); return out; };

/**
 * The account an item is sold under (or bought under). The account carries the tax, so choosing it is choosing the tax:
 * an exempt product on an exempt account, a VAT-able one on a VAT-able account. Required for anything that can be sold.
 */
export default function SalesAccountSelect({ value, onChange, kind = 'sales', required = false, disabled = false, label, hint, error, style }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [tree, ledgers] = await Promise.all([booksAPI.groups(), booksAPI.ledgers({ all: 1 })]);
        const ids = new Set(flat(tree).filter((g) => g.behaviour === kind).map((g) => g.id));
        const list = Array.isArray(ledgers) ? ledgers : ledgers.data ?? [];
        setRows(list.filter((l) => ids.has(l.group_id) && l.is_active));
      } catch { setRows([]); }
    })();
  }, [kind]);

  const chosen = rows?.find((l) => Number(l.id) === Number(value));
  const usable = (rows ?? []).filter((l) => l.tax_nature);
  const untreated = (rows ?? []).filter((l) => !l.tax_nature);
  const text = label ?? (kind === 'sales' ? 'Sales account' : 'Purchase account');
  const sel = { padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${error ? colors.danger : colors.tint(0.18)}`, fontSize: '0.85rem', width: '100%', background: 'white', ...style };

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        {text}{required && <span style={{ color: colors.danger }}> *</span>}
      </label>
      <select value={value ?? ''} disabled={disabled} required={required} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '', usable.find((l) => String(l.id) === e.target.value) ?? null)} style={sel}>
        <option value="">{required ? 'Choose the account this is sold under…' : `Default ${kind} account`}</option>
        {usable.map((l) => <option key={l.id} value={l.id}>{l.name} — {NATURE[l.tax_nature]}{l.tax_nature === 'taxable' || l.tax_nature === 'zero_rated' ? ` (${l.tax_rate_ledger?.name ?? 'rate set'})` : ''}</option>)}
      </select>
      {chosen && <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>Tax on this account: <strong>{NATURE[chosen.tax_nature] ?? 'not set'}</strong>{chosen.tax_rate_ledger?.name ? ` — ${chosen.tax_rate_ledger.name}` : ''}</p>}
      {error && <p role="alert" style={{ margin: '5px 0 0', fontSize: '0.72rem', color: colors.danger }}>{error}</p>}
      {!error && (hint || rows?.length === 0 || untreated.length > 0) && (
        <p style={{ margin: '5px 0 0', fontSize: '0.7rem', color: colors.textFaint }}>
          {hint ?? 'The account decides the tax on every sale line.'}
          {rows && usable.length === 0 && <> No {kind} account has its tax set yet — <Link to="/admin/books?tab=accounts">set one up under Books → Chart of accounts</Link>.</>}
          {untreated.length > 0 && usable.length > 0 && <> {untreated.length} account(s) are hidden until their tax is set.</>}
        </p>
      )}
    </div>
  );
}
