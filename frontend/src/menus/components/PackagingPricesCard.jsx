import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../_shared/api/books';
import menusAPI from '../../_shared/api/menus';
import { NumberInput, SelectInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../_shared/theme/tokens';

const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '6px 8px', fontSize: '0.82rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };

/** Menus, Configuration: the price of one unit of each item of the packaging kind (the kind is chosen above). An empty price leaves the item off the list. */
export default function PackagingPricesCard({ canEdit }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState({});
  const [ledgers, setLedgers] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => menusAPI.packagingPrices().then((d) => {
    setData(d);
    setRows(Object.fromEntries(d.items.map((i) => [i.item_id, { price: i.price ?? '', currency_id: i.currency_id ?? '', ledger_id: i.ledger_id ?? '', is_active: i.is_active }])));
  }).catch((e) => toast.error(errMsg(e, 'Could not load the packaging prices'))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    booksAPI.ledgers({ all: 1 }).then((r) => {
      const list = Array.isArray(r) ? r : r.data ?? [];
      setLedgers(list.filter((l) => l.is_active && !/debtor|creditor|cash|bank/i.test(l.group?.name ?? '')).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setLedgers([]));
  }, []);

  const patch = (id, p) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));
  const save = async () => {
    setBusy(true);
    try {
      const live = data.items.filter((i) => !i.grey);
      const res = await menusAPI.savePackagingPrices(live.map((i) => ({ item_id: i.item_id, price: rows[i.item_id].price === '' ? null : Number(rows[i.item_id].price), currency_id: rows[i.item_id].currency_id || null, ledger_id: rows[i.item_id].ledger_id || null, is_active: rows[i.item_id].is_active })));
      toast.success(res.message); await load();
    } catch (x) { toast.error(errMsg(x, 'Could not save the packaging prices'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (!data) return null;
  const menus = data.currencies.find((c) => c.id === data.menus_currency_id);

  return (
    <section data-testid="packaging-prices" style={{ ...card, padding: 18, display: 'grid', gap: 10, marginTop: 16 }}>
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Packaging prices</h2>
      {!data.ready ? (
        <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 207_menus_packaging_prices.sql first (with 190 and 193 before it): until then packaging can not be priced.</p>
      ) : !data.kind ? (
        <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No kind of ingredient is chosen as packaging yet. Choose it in the settings above (the packaging kind), and its items are listed here to be priced.</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
            The price of ONE unit of each item of the kind <strong>{data.kind.name}</strong> (not of a pack). An empty price keeps the item off the list. With no currency chosen a price is in {menus ? menus.code : 'the base currency'}; with no account chosen it is booked to the account the dishes are sold to.
            A price whose item has left this kind stays, greyed out, until its kind is the packaging kind again.
          </p>
          {data.items.length === 0 ? <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textFaint }}>No ingredient is of the kind {data.kind.name} yet. Give some that kind under Menus, Ingredients &amp; Supplies.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Item</th><th style={th}>Price per unit</th><th style={th}>Currency</th><th style={th}>Sales account</th><th style={th}>On</th></tr></thead>
              <tbody>
                {data.items.map((i) => {
                  const r = rows[i.item_id] ?? {};
                  const off = !canEdit || i.grey;

                  return (
                    <tr key={i.item_id} data-testid="packaging-row" data-grey={i.grey ? 'yes' : 'no'} style={i.grey ? { opacity: 0.5 } : undefined}>
                      <td style={td}><strong>{i.name}</strong>{i.grey && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>Not of the packaging kind now</div>}</td>
                      <td style={td}><NumberInput aria-label={`Price of ${i.name}`} min="0" step="any" placeholder={`per ${i.unit ?? 'unit'}`} value={r.price ?? ''} disabled={off} onChange={(e) => patch(i.item_id, { price: e.target.value })} /></td>
                      <td style={td}>
                        <SelectInput aria-label={`Currency of ${i.name}`} value={r.currency_id ?? ''} disabled={off} onChange={(e) => patch(i.item_id, { currency_id: e.target.value ? Number(e.target.value) : '' })}>
                          <option value="">{menus ? `Menus (${menus.code})` : 'Base currency'}</option>
                          {data.currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                        </SelectInput>
                      </td>
                      <td style={td}>
                        <SelectInput aria-label={`Sales account of ${i.name}`} value={r.ledger_id ?? ''} disabled={off} onChange={(e) => patch(i.item_id, { ledger_id: e.target.value ? Number(e.target.value) : '' })}>
                          <option value="">The dishes' account</option>
                          {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </SelectInput>
                      </td>
                      <td style={td}><input type="checkbox" aria-label={`${i.name} is on the price list`} checked={r.is_active ?? true} disabled={off} onChange={(e) => patch(i.item_id, { is_active: e.target.checked })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {canEdit && data.items.some((i) => !i.grey) && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save packaging prices'}</button></div>}
        </>
      )}
    </section>
  );
}
