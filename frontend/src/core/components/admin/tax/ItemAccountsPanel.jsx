import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors, btnPrimary } from '../../../../_shared/theme/tokens';

const NATURE = { taxable: 'VAT-able', zero_rated: 'zero-rated', exempt: 'exempt', out_of_scope: 'out of scope' };

function flat(nodes, out = []) { nodes.forEach((g) => { out.push(g); flat(g.children ?? [], out); }); return out; }

/**
 * Which account a product / service / hamper sells to (and, for a product, buys from). The account carries the tax
 * nature — a solar panel on "Sales - exempt", batteries on "Sales - VAT-able" — so the voucher taxes each line by
 * the account it posts to. Blank = the voucher type's default account.
 */
export default function ItemAccountsPanel({ type, id, readOnly = false }) {
  const [sales, setSales] = useState([]);
  const [purchase, setPurchase] = useState([]);
  const [v, setV] = useState({ sales_ledger_id: '', purchase_ledger_id: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [tree, ledgers, cur] = await Promise.all([booksAPI.groups(), booksAPI.ledgers({ all: 1 }), booksAPI.itemAccounts(type, id)]);
        const groups = flat(tree);
        const ids = (b) => new Set(groups.filter((g) => g.behaviour === b).map((g) => g.id));
        const rows = Array.isArray(ledgers) ? ledgers : ledgers.data ?? [];
        setSales(rows.filter((l) => ids('sales').has(l.group_id) && l.is_active));
        setPurchase(rows.filter((l) => ids('purchase').has(l.group_id) && l.is_active));
        setV({ sales_ledger_id: cur.sales_ledger_id ?? '', purchase_ledger_id: cur.purchase_ledger_id ?? '' });
      } catch { /* the panel just stays empty */ }
    })();
  }, [type, id]);

  if (!id) return null;
  const label = (l) => `${l.name}${l.tax_nature ? ` — ${NATURE[l.tax_nature]}` : ''}`;
  const save = async () => {
    setBusy(true);
    try {
      await booksAPI.saveItemAccounts({ type, id: Number(id), sales_ledger_id: v.sales_ledger_id || null, purchase_ledger_id: v.purchase_ledger_id || null });
      toast.success('Accounts saved');
    } catch (e) { toast.error(errMsg(e, 'Could not save the accounts'), { duration: 8000 }); }
    finally { setBusy(false); }
  };
  const sel = { padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.82rem', width: '100%' };
  return (
    <div style={{ ...card, padding: 16, marginTop: 16 }}>
      <p style={{ margin: 0, fontWeight: 800, fontSize: '0.85rem', color: colors.text }}>Accounts</p>
      <p style={{ margin: '4px 0 12px', fontSize: '0.72rem', color: colors.textFaint }}>
        The sales account decides the tax: put an exempt item on an exempt account, a VAT-able item on a VAT-able one. Blank uses the default account.
      </p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: type === 'product' ? '1fr 1fr' : '1fr' }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>Sales account
          <select disabled={readOnly} value={v.sales_ledger_id} onChange={(e) => setV((x) => ({ ...x, sales_ledger_id: e.target.value ? Number(e.target.value) : '' }))} style={sel}>
            <option value="">Default sales account</option>
            {sales.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
          </select>
        </label>
        {type === 'product' && (
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>Purchase account
            <select disabled={readOnly} value={v.purchase_ledger_id} onChange={(e) => setV((x) => ({ ...x, purchase_ledger_id: e.target.value ? Number(e.target.value) : '' }))} style={sel}>
              <option value="">Default purchase account</option>
              {purchase.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
            </select>
          </label>
        )}
      </div>
      {!readOnly && <button type="button" disabled={busy} onClick={save} style={{ ...btnPrimary, marginTop: 12 }}>{busy ? 'Saving…' : 'Save accounts'}</button>}
    </div>
  );
}
