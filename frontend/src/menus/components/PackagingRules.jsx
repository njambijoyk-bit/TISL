import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import Modal from '../../core/components/admin/ui/Modal';
import { FormError, NumberInput, SelectInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' };
const th = { textAlign: 'left', padding: '6px 6px', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '5px 6px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };
const SCOPES = { per_dish: 'For each dish', per_order: 'Once for the order' };
const RECEIPT = { auto: 'When charged', always: 'Always', never: 'Never' };

/** The packaging that goes with a side or a dish: the item, how many, for each dish or once for the order, compulsory or not, free or charged, and whether the receipt shows it. */
export function PackagingRulesSection({ owner, id, name, canEdit = true, onSaved }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    menusAPI.packagingRules(owner, id).then((d) => { setData(d); setRows(d.rules.filter((r) => !r.grey)); }).catch((e) => setErr(errMsg(e, 'Could not load the packaging rules')));
  }, [owner, id]);

  const patch = (i, p) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await menusAPI.savePackagingRules(owner, id, rows.map((r) => ({ item_id: r.item_id, scope: r.scope, quantity: Number(r.quantity) || 1, compulsory: r.compulsory, charged: r.charged, receipt: r.receipt })));
      setData(res); setRows(res.rules.filter((r) => !r.grey)); toast.success(res.message); onSaved?.();
    } catch (x) { setErr(errMsg(x, 'Could not save the packaging rules')); } finally { setBusy(false); }
  };

  if (!data) return <p role="status" style={{ margin: 0 }}>{err ?? 'Loading…'}</p>;
  if (!data.ready) return <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 208_menus_packaging_rules.sql first (with 207 before it): until then packaging rules can not be saved.</p>;
  const grey = data.rules.filter((r) => r.grey);
  const unused = data.items.filter((i) => !rows.some((r) => r.item_id === i.item_id));

  return (
    <div data-testid="packaging-rules" style={{ display: 'grid', gap: 10 }}>
      <FormError message={err} />
      <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
        What packaging goes with {name}. A dish's own rule for an item replaces what its sides say about that item. A charged item is priced from the packaging price list (<Link to="/admin/menus/settings">Menus, Configuration</Link>); a free one is only a cost.
        With a rule per order, the largest count asked for wins; it is not added up.
      </p>
      {data.items.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>No packaging items yet: choose the packaging kind and give some ingredients that kind (Menus, Configuration; Menus, Ingredients &amp; Supplies).</p>}
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Item</th><th style={th}>Count</th><th style={th}>Counted</th><th style={th}>Compulsory</th><th style={th}>Charged</th><th style={th}>On the receipt</th><th style={th} /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.item_id} data-testid="packaging-rule">
                <td style={td}><strong>{r.item}</strong></td>
                <td style={{ ...td, width: 70 }}><NumberInput aria-label={`Count of ${r.item}`} min="1" max="99" value={r.quantity} disabled={!canEdit} onChange={(e) => patch(i, { quantity: e.target.value })} /></td>
                <td style={td}><SelectInput aria-label={`Scope of ${r.item}`} value={r.scope} disabled={!canEdit} onChange={(e) => patch(i, { scope: e.target.value })}>{Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></td>
                <td style={td}><input type="checkbox" aria-label={`${r.item} is compulsory`} checked={r.compulsory} disabled={!canEdit} onChange={(e) => patch(i, { compulsory: e.target.checked })} /></td>
                <td style={td}><input type="checkbox" aria-label={`${r.item} is charged`} checked={r.charged} disabled={!canEdit || !data.items.find((x) => x.item_id === r.item_id)?.priced} onChange={(e) => patch(i, { charged: e.target.checked })} title={data.items.find((x) => x.item_id === r.item_id)?.priced ? undefined : 'Not on the price list: free only'} /></td>
                <td style={td}><SelectInput aria-label={`Receipt for ${r.item}`} value={r.receipt} disabled={!canEdit} onChange={(e) => patch(i, { receipt: e.target.value })}>{Object.entries(RECEIPT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></td>
                <td style={td}>{canEdit && <button type="button" aria-label={`Remove the rule for ${r.item}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }} onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {grey.length > 0 && <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>Kept but not used, because the item has left the packaging kind: {grey.map((r) => r.item).join(', ')}.</p>}
      {canEdit && unused.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SelectInput aria-label="Add a packaging item" value="" onChange={(e) => { const it = data.items.find((x) => String(x.item_id) === e.target.value); if (it) setRows((xs) => [...xs, { item_id: it.item_id, item: it.name, scope: 'per_dish', quantity: 1, compulsory: false, charged: false, receipt: 'auto' }]); }}>
            <option value="">Add a packaging item…</option>
            {unused.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}{i.priced ? ` (${i.price})` : ' (no price)'}</option>)}
          </SelectInput>
          <Plus size={14} aria-hidden="true" />
        </div>
      )}
      {canEdit && (rows.length > 0 || data.rules.length > 0) && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save packaging rules'}</button></div>}
    </div>
  );
}

/** Menus → Dishes → Packaging. */
export default function DishPackagingModal({ dish, onClose }) {
  return (
    <Modal title={`Packaging: ${dish.name}`} onClose={onClose} width={900}>
      <PackagingRulesSection owner="dish" id={dish.id} name={dish.name} />
      <button type="button" style={{ ...small, marginTop: 12 }} onClick={onClose}>Close</button>
    </Modal>
  );
}
