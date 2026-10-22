import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import Modal from '../../core/components/admin/ui/Modal';
import { FormError, SelectInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, colors } from '../../_shared/theme/tokens';

const money = (n) => Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '7px 8px', fontSize: '0.82rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };
const keyOf = (i) => `${i.ingredient_id}:${i.kind}`;

/** What a policy charges on a dish at this price, in words. */
const feeWords = (p, price) => {
  if (!p || p.kind === 'free') return 'no charge';
  if (p.kind === 'fixed') return money(p.amount);

  return `${money(p.amount)}% = ${money((price * p.amount) / 100)}`;
};

/** The removals and extras a dish offers (the recipe lines ticked "may be left out" or "may have extra", on the dish and on its sides) and the policy that prices each. */
export function ModifiersSection({ dish, onSaved, saveRef }) {
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState({});
  const [loaded, setLoaded] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    menusAPI.dishModifiers(dish.id).then((d) => { const c = Object.fromEntries(d.items.map((i) => [keyOf(i), i.policy_id ?? ''])); setData(d); setChosen(c); setLoaded(JSON.stringify(c)); }).catch((e) => setErr(errMsg(e, 'Could not load the modifiers')));
  }, [dish.id]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveDishModifiers(dish.id, data.items.map((i) => ({ ingredient_id: i.ingredient_id, kind: i.kind, policy_id: chosen[keyOf(i)] === '' ? null : Number(chosen[keyOf(i)]) })));
      toast.success(res.message); setLoaded(JSON.stringify(chosen)); onSaved?.();

      return true;
    } catch (x) { setErr(errMsg(x, 'Could not save the modifiers')); return false; } finally { setBusy(false); }
  };
  if (saveRef) saveRef.current = async () => (!data?.ready || JSON.stringify(chosen) === loaded ? true : save());

  if (!data) return <p role="status" style={{ margin: 0 }}>{err ?? 'Loading…'}</p>;
  if (!data.ready) return <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 206_menus_dish_modifiers.sql first (with 205 before it): until then a policy can not be chosen.</p>;
  const def = data.policies.find((p) => p.is_default);

  return (
    <div data-testid="dish-modifiers" style={{ display: 'grid', gap: 10 }}>
      <FormError message={err} />
      <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
        What it costs a guest to leave something out of {dish.name}, or to ask for extra. An item with no policy chosen uses the default{def ? ` (${def.name}: ${feeWords(def, data.price)})` : ''}. A percentage is of the price of the size the guest orders; here it is shown at {money(data.price)}.
        {' '}Fees {data.vatable ? 'carry the dish\'s VAT' : 'are kept apart, without VAT'} (Menus, Configuration).
      </p>
      {data.items.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textFaint }}>Nothing on {dish.name} can be left out or added to yet. Tick <em>the customer may leave it out</em> or <em>may ask for extra</em> on an ingredient of its recipe, or of one of its sides, on <Link to="/admin/menus/recipes">Menus, Recipes</Link>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Ingredient</th><th style={th}>When the guest</th><th style={th}>From</th><th style={th}>Policy</th><th style={th}>Costs</th></tr></thead>
          <tbody>
            {data.items.map((i) => {
              const k = keyOf(i);
              const p = chosen[k] === '' ? def : data.policies.find((x) => String(x.id) === String(chosen[k]));

              return (
                <tr key={k} data-testid="modifier-row">
                  <td style={td}><strong>{i.ingredient}</strong></td>
                  <td style={td}>{i.kind === 'remove' ? 'leaves it out' : 'asks for extra'}</td>
                  <td style={{ ...td, color: colors.textMuted }}>{i.in.join(', ')}</td>
                  <td style={td}>
                    <SelectInput aria-label={`Policy for ${i.kind === 'remove' ? 'leaving out' : 'extra'} ${i.ingredient}`} value={chosen[k] ?? ''} onChange={(e) => setChosen((c) => ({ ...c, [k]: e.target.value }))}>
                      <option value="">Default{def ? ` (${def.name})` : ''}</option>
                      {data.policies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </SelectInput>
                  </td>
                  <td style={td}>{feeWords(p, data.price)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data.items.length > 0 && <div><button type="button" style={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save modifiers'}</button></div>}
    </div>
  );
}

/** Menus → Dishes → Modifiers. */
export default function DishModifiersModal({ dish, onClose, onDone }) {
  return (
    <Modal title={`Modifiers: ${dish.name}`} onClose={onClose} width={820}>
      <ModifiersSection dish={dish} onSaved={onDone} />
    </Modal>
  );
}
