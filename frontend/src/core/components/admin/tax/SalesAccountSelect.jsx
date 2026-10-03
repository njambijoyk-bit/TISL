import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import booksAPI from '../../../../_shared/api/books';
import { colors } from '../../../../_shared/theme/tokens';

const NATURE = { taxable: 'VAT-able', zero_rated: 'zero-rated', exempt: 'exempt', out_of_scope: 'out of scope' };
// every group with what it is reserved for ('service' for Service Income and everything under it), inherited down the tree
const flat = (nodes, out = [], inherited = null) => {
  nodes.forEach((g) => { const applies = g.settings?.applies_to ?? inherited; out.push({ ...g, applies }); flat(g.children ?? [], out, applies); });
  return out;
};

/**
 * The account an item is sold under (or bought under). The account carries the tax, so choosing it is choosing the tax:
 * an exempt product on an exempt account, a VAT-able one on a VAT-able account. Required for anything that can be sold.
 */
export default function SalesAccountSelect({ value, onChange, kind = 'sales', scope = 'product', required = false, disabled = false, label, hint, error, style, amount, currencyCode }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [tree, ledgers] = await Promise.all([booksAPI.groups(), booksAPI.ledgers({ all: 1 })]);
        // services are sold under Service Income, everything else under Sales Accounts
        const ids = new Set(flat(tree).filter((g) => g.behaviour === kind && (kind !== 'sales' || (scope === 'service') === (g.applies === 'service'))).map((g) => g.id));
        const list = Array.isArray(ledgers) ? ledgers : ledgers.data ?? [];
        setRows(list.filter((l) => ids.has(l.group_id) && l.is_active));
      } catch { setRows([]); }
    })();
  }, [kind, scope]);

  const chosen = rows?.find((l) => Number(l.id) === Number(value));
  const usable = (rows ?? []).filter((l) => l.tax_nature);
  const untreated = (rows ?? []).filter((l) => !l.tax_nature);
  const pct = chosen && chosen.tax_nature === 'taxable' && chosen.tax_rate_ledger?.rate_value != null ? Number(chosen.tax_rate_ledger.rate_value) : 0;
  const net = Number(amount);
  const nf = (n) => `${currencyCode ? `${currencyCode} ` : ''}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = label ?? (kind === 'sales' ? (scope === 'service' ? 'Service income account' : 'Sales account') : 'Purchase account');
  const sel = { padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${error ? colors.danger : 'var(--line)'}`, fontSize: '0.85rem', width: '100%', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', ...style };

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
      {chosen && net > 0 && (
        <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>
          The price you enter is <strong>excluding tax</strong>.{' '}
          {pct > 0
            ? <>{nf(net)} + {chosen.tax_rate_ledger?.name ?? 'tax'} {nf(net * pct / 100)} = customer pays <strong>{nf(net * (1 + pct / 100))}</strong>.</>
            : <>No tax is added — customer pays <strong>{nf(net)}</strong>.</>}
        </p>
      )}
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
