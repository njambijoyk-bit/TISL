import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { useMenusBranch } from '../../lib/menusBranch';

/**
 * Menus → Recipes: what each dish is made of, written on ingredients (Menus' own stock): an amount in the ingredient's base or alternate unit, and the waste in preparing it.
 * It shows what a portion costs and how many portions the shelf could make now. A recipe made to order uses the ingredients when the dish is sold.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));

function RecipeModal({ dish, options, onClose, onDone }) {
  const r = dish.recipe;
  const key = useRef(0);
  const mk = (l) => ({ key: `k${++key.current}`, ingredient_id: l?.ingredient_id ?? '', quantity: l?.quantity ?? '', unit: l?.unit ?? 'base', waste_pct: l?.waste_pct ?? '' });
  const [yieldQty, setYieldQty] = useState(r?.yield_qty ?? 1);
  const [order, setOrder] = useState(r?.made_to_order ?? true);
  const [lines, setLines] = useState(r ? r.lines.map(mk) : [mk()]);
  const [steps, setSteps] = useState((r?.steps ?? []).map((s) => ({ key: `s${++key.current}`, body: s.body, minutes: s.minutes ?? '' })));
  const [prep, setPrep] = useState(r?.prep_minutes ?? '');
  const [cook, setCook] = useState(r?.cook_minutes ?? '');
  const [visibility, setVisibility] = useState(r?.visibility ?? 'internal');
  const [note, setNote] = useState(r?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ing = (id) => options.ingredients.find((i) => String(i.id) === String(id));
  const patch = (k, p) => setLines((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveStockRecipe(dish.id, {
        yield_qty: Number(yieldQty), made_to_order: order, note: note || null, visibility, prep_minutes: prep === '' ? null : Number(prep), cook_minutes: cook === '' ? null : Number(cook),
        lines: lines.filter((l) => l.ingredient_id).map((l) => ({ ingredient_id: Number(l.ingredient_id), quantity: Number(l.quantity) || 0, unit: l.unit, waste_pct: l.waste_pct === '' ? 0 : Number(l.waste_pct) })),
        steps: steps.map((s) => ({ body: s.body, minutes: s.minutes === '' ? null : Number(s.minutes) })),
      });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the recipe')); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Recipe: ${dish.name}`} onClose={onClose} width={820}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <Field label="One batch makes (portions)" htmlFor="rc-yield" hint="The amounts below are for this many portions."><NumberInput id="rc-yield" required min="0.0001" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} /></Field>
            <Field label="How it is made" htmlFor="rc-how">
              <SelectInput id="rc-how" value={order ? 'order' : 'ahead'} onChange={(e) => setOrder(e.target.value === 'order')}>
                <option value="order">Made to order (a sale uses the ingredients)</option>
                <option value="ahead">Made ahead in batches (make a batch on the Stock page; sales then take from the dish's own shelf)</option>
              </SelectInput>
            </Field>
          </div>

          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Ingredients (the amount for one batch)</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {lines.map((l) => {
                const i = ing(l.ingredient_id);
                return (
                  <div key={l.key} data-testid="recipe-line" style={{ display: 'grid', gridTemplateColumns: '2fr 0.9fr 0.9fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
                    <Field label="Ingredient"><SelectInput aria-label="Ingredient" value={l.ingredient_id} onChange={(e) => patch(l.key, { ingredient_id: e.target.value, unit: 'base' })}><option value="">Choose…</option>{options.ingredients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectInput></Field>
                    <Field label="Amount"><NumberInput aria-label="Amount" min="0" step="any" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} /></Field>
                    <Field label="In"><SelectInput aria-label="Unit" value={l.unit} onChange={(e) => patch(l.key, { unit: e.target.value })}><option value="base">{i?.base_unit ?? 'base unit'}</option>{i?.alt_unit && <option value="alt">{i.alt_unit}</option>}</SelectInput></Field>
                    <Field label="Waste %" hint="lost in preparing"><NumberInput aria-label="Waste percent" min="0" max="90" step="any" value={l.waste_pct} onChange={(e) => patch(l.key, { waste_pct: e.target.value })} /></Field>
                    <button type="button" aria-label="Remove ingredient" style={iconBtn} onClick={() => setLines((xs) => (xs.length > 1 ? xs.filter((y) => y.key !== l.key) : xs))}><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
            <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setLines((xs) => [...xs, mk()])}><Plus size={12} /> Add an ingredient</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
            <Field label="Prep (minutes)"><NumberInput aria-label="Prep minutes" min="0" value={prep} onChange={(e) => setPrep(e.target.value)} /></Field>
            <Field label="Cook (minutes)"><NumberInput aria-label="Cook minutes" min="0" value={cook} onChange={(e) => setCook(e.target.value)} /></Field>
            <Field label="Who may see it">
              <SelectInput aria-label="Who may see it" value={visibility} onChange={(e) => setVisibility(e.target.value)}>{Object.entries(options.visibility).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
            </Field>
          </div>

          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Method (steps)</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {steps.map((s, i) => (
                <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 90px auto', gap: 8, alignItems: 'start' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textFaint, paddingTop: 8 }}>{i + 1}</span>
                  <TextArea aria-label={`Step ${i + 1}`} rows={2} maxLength={2000} value={s.body} onChange={(e) => setSteps((xs) => xs.map((y) => (y.key === s.key ? { ...y, body: e.target.value } : y)))} />
                  <NumberInput aria-label={`Minutes for step ${i + 1}`} min="0" placeholder="min" value={s.minutes} onChange={(e) => setSteps((xs) => xs.map((y) => (y.key === s.key ? { ...y, minutes: e.target.value } : y)))} />
                  <button type="button" aria-label="Remove step" style={iconBtn} onClick={() => setSteps((xs) => xs.filter((y) => y.key !== s.key))}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setSteps((xs) => [...xs, { key: `s${++key.current}`, body: '', minutes: '' }])}><Plus size={12} /> Add a step</button>
          </div>
          <Field label="Note (optional)"><TextInput aria-label="Note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Save recipe" busy={busy} disabled={!lines.some((l) => l.ingredient_id && Number(l.quantity) > 0)} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function Recipes() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loc, setLoc] = useMenusBranch(data?.branches);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.stockRecipes(loc ? { location_id: loc } : undefined)
      .then((d) => { setData(d); if (first.current) { first.current = false; setLoc(String(d.location_id)); } })
      .catch((e) => toast.error(errMsg(e, 'Could not load the recipes')))
      .finally(() => setLoading(false));
  }, [loc, setLoc]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const remove = async (d) => {
    if (!window.confirm(`Remove the recipe of ${d.name}?`)) return;
    try { const res = await menusAPI.removeStockRecipe(d.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove')); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="recipes" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="recipes">
        <HubHeader title="Recipes" description="What each dish is made of, in ingredients. It shows what a portion costs from the stock on the shelf and how many portions could be made now." />
        {data && !data.installed && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 183_menus_recipes_own.sql first: until then recipes can not be saved.</p>}
        <div style={{ minWidth: 200, maxWidth: 260, margin: '0 0 14px' }}>
          <SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)}>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>At {b.name}</option>)}</SelectInput>
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.dishes?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No dishes yet. Add dishes first, then write what each is made of here.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Dish</th><th style={th}>Recipe</th><th style={{ ...th, textAlign: 'right' }}>Cost of a portion</th><th style={{ ...th, textAlign: 'right' }}>Can make now</th><th style={th} /></tr></thead>
              <tbody>{data.dishes.map((d) => (
                <tr key={d.id} style={d.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={td}><strong>{d.name}</strong></td>
                  <td style={td}>{d.recipe ? <>{d.recipe.lines.length} ingredient{d.recipe.lines.length === 1 ? '' : 's'} · makes {num(d.recipe.yield_qty, 3)} · {d.recipe.made_to_order ? 'made to order' : 'made ahead'}</> : <span style={{ color: colors.textFaint }}>no recipe yet</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.recipe?.cost ? <>{num(d.recipe.cost.per_portion)}{!d.recipe.cost.complete && <span title="Some ingredient has never been bought, so its cost is not in this figure" style={{ color: colors.warning }}> *</span>}</> : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.recipe?.portions == null ? '—' : num(Math.floor(d.recipe.portions), 0)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && data.installed && <button type="button" style={small} onClick={() => setModal({ dish: d })}>{d.recipe ? 'Edit recipe' : 'Write recipe'}</button>}
                    {canWrite && d.recipe && <button type="button" style={small} onClick={() => remove(d)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal && data && <RecipeModal dish={modal.dish} options={data} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
