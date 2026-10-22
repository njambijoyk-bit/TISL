import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { FormError, NumberInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../_shared/theme/tokens';

const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '6px 8px', fontSize: '0.82rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };
const money = (n) => Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });

/** Menus, Dishes, Branches: whether each branch serves the dish and what it charges there. A dish is shared by every branch; an empty price keeps the dish's own. */
export default function DishBranchesModal({ dish, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const fill = (d) => { setData(d); setRows(d.branches.map((b) => ({ location_id: b.location_id, name: b.name, is_available: b.is_available, price: b.price ?? '', size_prices: Object.fromEntries(d.servings.map((s) => [s.serving_id, b.size_prices?.[s.serving_id] ?? ''])) }))); };
  useEffect(() => { menusAPI.dishBranches(dish.id).then(fill).catch((e) => setErr(errMsg(e, 'Could not load the branches'))); }, [dish.id]);

  const patch = (i, p) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveDishBranches(dish.id, rows.map((r) => ({ location_id: r.location_id, is_available: r.is_available, price: r.price === '' ? null : Number(r.price), size_prices: Object.fromEntries(Object.entries(r.size_prices).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) })));
      toast.success(res.message); fill(res); onDone?.();
    } catch (x) { setErr(errMsg(x, 'Could not save the branches')); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Branches: ${dish.name}`} onClose={onClose} width={820}>
      <FormError message={err} />
      {!data ? <p role="status" style={{ margin: 0 }}>{err ? '' : 'Loading…'}</p> : !data.ready ? (
        <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 226_menus_dish_branches.sql first: until then every branch serves every dish at its price.</p>
      ) : (
        <div data-testid="dish-branches" style={{ display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
            {dish.name} is shared by every branch, at {money(data.price)} before tax. Untick a branch that does not serve it: it leaves that branch&apos;s menu, till and kiosk. Type a price to charge something else at a branch; leave it empty to keep the dish&apos;s own.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Branch</th><th style={th}>Served</th><th style={th}>Price here</th>{data.servings.map((s) => <th key={s.serving_id} style={th}>{s.serving} here</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.location_id} data-testid="dish-branch" style={r.is_available ? undefined : { opacity: 0.6 }}>
                    <td style={td}><strong>{r.name}</strong></td>
                    <td style={td}><input type="checkbox" aria-label={`${dish.name} is served at ${r.name}`} checked={r.is_available} onChange={(e) => patch(i, { is_available: e.target.checked })} /></td>
                    <td style={{ ...td, width: 130 }}><NumberInput aria-label={`Price at ${r.name}`} min="0" step="any" placeholder={money(data.price)} value={r.price} disabled={!r.is_available} onChange={(e) => patch(i, { price: e.target.value })} /></td>
                    {data.servings.map((s) => (
                      <td key={s.serving_id} style={{ ...td, width: 130 }}><NumberInput aria-label={`${s.serving} price at ${r.name}`} min="0" step="any" placeholder={money(s.price)} value={r.size_prices[s.serving_id]} disabled={!r.is_available} onChange={(e) => patch(i, { size_prices: { ...r.size_prices, [s.serving_id]: e.target.value } })} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>There is only the one branch you can use, so nothing differs.</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={{ ...btnGhost, padding: '6px 14px' }} onClick={onClose}>Close</button>
            <button type="button" style={{ ...btnPrimary, padding: '6px 16px', opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save branches'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
