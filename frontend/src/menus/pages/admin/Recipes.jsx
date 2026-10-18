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
 * Menus → Recipes: what each dish is made of, and recipes of their own (a base or sauce that is not a dish), written on ingredients (Menus' own stock): an amount in the ingredient's base or alternate unit, and the waste in preparing it.
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
  const mk = (l) => ({ key: `k${++key.current}`, ref: l?.recipe_id ? `r:${l.recipe_id}` : l?.ingredient_id ? `i:${l.ingredient_id}` : '', quantity: l?.quantity ?? '', unit: l?.unit ?? 'base', waste_pct: l?.waste_pct ?? '' });
  const [yieldQty, setYieldQty] = useState(r?.yield_qty ?? 1);
  const [yieldUnit, setYieldUnit] = useState(r?.yield_unit_id ?? '');
  const [order, setOrder] = useState(r?.made_to_order ?? true);
  const [lines, setLines] = useState(r ? r.lines.map(mk) : [mk()]);
  const [steps, setSteps] = useState((r?.steps ?? []).map((s) => ({ key: `s${++key.current}`, body: s.body, minutes: s.minutes ?? '' })));
  const [times, setTimes] = useState((r?.times ?? []).map((t) => ({ key: `t${++key.current}`, up_to: t.up_to, minutes: t.minutes })));
  const [prep, setPrep] = useState(r?.prep_minutes ?? '');
  const [cook, setCook] = useState(r?.cook_minutes ?? '');
  const [visibility, setVisibility] = useState(r?.visibility ?? 'internal');
  const [note, setNote] = useState(r?.note ?? '');
  const [name, setName] = useState(dish.name ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const unitLabel = dish.standalone ? (options.units ?? []).find((u) => String(u.id) === String(yieldUnit))?.code ?? 'portions' : 'portions';
  const ing = (ref) => (ref.startsWith('i:') ? options.ingredients.find((i) => `i:${i.id}` === ref) : undefined);
  const sub = (ref) => (ref.startsWith('r:') ? (options.recipes ?? []).find((x) => `r:${x.id}` === ref) : undefined);
  const usable = (options.recipes ?? []).filter((x) => !(dish.standalone && dish.id && x.id === dish.id));
  const patch = (k, p) => setLines((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const payload = {
        yield_qty: Number(yieldQty), ...(dish.standalone ? { yield_unit_id: yieldUnit === '' ? null : Number(yieldUnit) } : {}), made_to_order: order, note: note || null, visibility, prep_minutes: prep === '' ? null : Number(prep), cook_minutes: cook === '' ? null : Number(cook),
        lines: lines.filter((l) => l.ref).map((l) => ({ ...(l.ref.startsWith('r:') ? { recipe_id: Number(l.ref.slice(2)) } : { ingredient_id: Number(l.ref.slice(2)) }), quantity: Number(l.quantity) || 0, unit: l.unit, waste_pct: l.waste_pct === '' ? 0 : Number(l.waste_pct) })),
        steps: steps.map((s) => ({ body: s.body, minutes: s.minutes === '' ? null : Number(s.minutes) })),
        ...(options.times_installed ? { times: times.filter((t) => t.up_to !== '' || t.minutes !== '').map((t) => ({ up_to: t.up_to === '' ? 0 : Number(t.up_to), minutes: t.minutes === '' ? 0 : Number(t.minutes) })) } : {}),
      };
      const res = dish.standalone ? await menusAPI.saveRecipeBook({ ...payload, name }, dish.id) : await menusAPI.saveStockRecipe(dish.id, payload);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the recipe')); } finally { setBusy(false); }
  };

  return (
    <Modal title={dish.id || !dish.standalone ? `Recipe: ${dish.name}` : 'New recipe'} onClose={onClose} width={820}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {dish.standalone && <Field label="Name of the recipe" htmlFor="rc-name" hint="A recipe of its own is not a dish: a tomato and onion base, a marinade. Dishes can be made from it later."><TextInput id="rc-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            {dish.standalone ? (
              <Field label="One batch makes" htmlFor="rc-yield" hint={options.units_installed ? 'The amounts below are for this much. Count it in portions, or in a weight, volume or pieces.' : 'Run database script 195_menus_recipe_yield_unit.sql to count a batch in kilograms, litres or pieces. Until then it is portions.'}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <NumberInput id="rc-yield" required min="0.0001" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
                  <SelectInput aria-label="Counted in" value={yieldUnit} disabled={!options.units_installed} onChange={(e) => setYieldUnit(e.target.value)}>
                    <option value="">portions</option>
                    {['mass', 'volume', 'count'].map((dim) => (options.units ?? []).some((u) => u.dimension === dim) && (
                      <optgroup key={dim} label={{ mass: 'Weight', volume: 'Volume', count: 'Pieces' }[dim]}>{options.units.filter((u) => u.dimension === dim).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</optgroup>
                    ))}
                  </SelectInput>
                </div>
              </Field>
            ) : (
              <Field label="One batch makes (portions)" htmlFor="rc-yield" hint="The amounts below are for this many portions. A dish's recipe counts portions; to count a batch in kilograms or litres, add a recipe of its own on the Recipes page."><NumberInput id="rc-yield" required min="0.0001" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} /></Field>
            )}
            <Field label="How it is made" htmlFor="rc-how">
              <SelectInput id="rc-how" value={order ? 'order' : 'ahead'} onChange={(e) => setOrder(e.target.value === 'order')}>
                <option value="order">Made to order (a sale uses the ingredients)</option>
                <option value="ahead">Made ahead in batches (make a batch on the Stock page; sales then take from the dish's own shelf)</option>
              </SelectInput>
            </Field>
          </div>

          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Ingredients (the amount for one batch){options.sub_installed ? '. A line can also be one of your recipes.' : ''}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {lines.map((l) => {
                const i = ing(l.ref);
                const x = sub(l.ref);
                return (
                  <div key={l.key} data-testid="recipe-line" style={{ display: 'grid', gridTemplateColumns: '2fr 0.9fr 0.9fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
                    <Field label="Ingredient or recipe">
                      <SelectInput aria-label="Ingredient" value={l.ref} onChange={(e) => patch(l.key, { ref: e.target.value, unit: 'base' })}>
                        <option value="">Choose…</option>
                        <optgroup label="Ingredients">{options.ingredients.map((y) => <option key={`i${y.id}`} value={`i:${y.id}`}>{y.name}</option>)}</optgroup>
                        {usable.length > 0 && <optgroup label="Recipes of their own">{usable.map((y) => <option key={`r${y.id}`} value={`r:${y.id}`}>{y.name}</option>)}</optgroup>}
                      </SelectInput>
                    </Field>
                    <Field label="Amount"><NumberInput aria-label="Amount" min="0" step="any" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} /></Field>
                    <Field label="In"><SelectInput aria-label="Unit" value={l.unit} onChange={(e) => patch(l.key, { unit: e.target.value })}><option value="base">{x ? x.unit : i?.base_unit ?? 'base unit'}</option>{i?.alt_unit && <option value="alt">{i.alt_unit}</option>}</SelectInput></Field>
                    <Field label="Waste %" hint="lost in preparing"><NumberInput aria-label="Waste percent" min="0" max="90" step="any" value={l.waste_pct} onChange={(e) => patch(l.key, { waste_pct: e.target.value })} /></Field>
                    <button type="button" aria-label="Remove ingredient" style={iconBtn} onClick={() => setLines((xs) => (xs.length > 1 ? xs.filter((y) => y.key !== l.key) : xs))}><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
            <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setLines((xs) => [...xs, mk()])}><Plus size={12} /> Add an ingredient or recipe</button>
          </div>

          {!options.times_installed ? (
            <p role="status" data-testid="recipe-times-missing" style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Time by batch size: run database script 196_menus_recipe_times.sql to add it here.</p>
          ) : (
            <div data-testid="recipe-times">
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 2 }}>Time by batch size</div>
              <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginBottom: 6 }}>A batch is timed by the smallest row that is big enough. A batch bigger than every row has no estimate.</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {times.map((t, i) => (
                  <div key={t.key} style={{ display: 'grid', gridTemplateColumns: 'auto 110px auto 100px auto auto', gap: 8, alignItems: 'center', fontSize: '0.82rem' }}>
                    <span>Up to</span>
                    <NumberInput aria-label={`Batch size for time ${i + 1}`} min="0" step="any" value={t.up_to} onChange={(e) => setTimes((xs) => xs.map((y) => (y.key === t.key ? { ...y, up_to: e.target.value } : y)))} />
                    <span>{unitLabel} takes</span>
                    <NumberInput aria-label={`Minutes for time ${i + 1}`} min="1" max="6000" value={t.minutes} onChange={(e) => setTimes((xs) => xs.map((y) => (y.key === t.key ? { ...y, minutes: e.target.value } : y)))} />
                    <span>minutes</span>
                    <button type="button" aria-label="Remove time" style={iconBtn} onClick={() => setTimes((xs) => xs.filter((y) => y.key !== t.key))}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setTimes((xs) => [...xs, { key: `t${++key.current}`, up_to: '', minutes: '' }])}><Plus size={12} /> Add a time</button>
            </div>
          )}

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
          <ModalActions onCancel={onClose} submitLabel="Save recipe" busy={busy} disabled={!lines.some((l) => l.ref && Number(l.quantity) > 0) || (dish.standalone && !name.trim())} />
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
  const removeOwn = async (r) => {
    if (!window.confirm(`Remove the recipe ${r.name}?`)) return;
    try { const res = await menusAPI.removeRecipeBook(r.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove'), { duration: 8000 }); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="recipes" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="recipes">
        <HubHeader title="Recipes" description="What each dish is made of, in ingredients. It shows what a portion costs from the stock on the shelf and how many portions could be made now." />
        {data?.installed && <p style={{ fontSize: '0.78rem', color: colors.textMuted, margin: '0 0 14px' }}>The <strong>yield unit</strong> (kilograms, litres, pieces) and the <strong>time by batch size</strong> are set inside a recipe: choose Edit recipe on a recipe, or Add a recipe under Recipes of their own below. A dish&apos;s own recipe counts portions.</p>}
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
                  <td style={td}>{d.recipe ? <>{d.recipe.lines.length} line{d.recipe.lines.length === 1 ? '' : 's'} · makes {num(d.recipe.yield_qty, 3)} · {d.recipe.made_to_order ? 'made to order' : 'made ahead'}</> : <span style={{ color: colors.textFaint }}>no recipe yet</span>}</td>
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
        <div style={{ margin: '26px 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Recipes of their own</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: colors.textMuted }}>A base, sauce or marinade that is not a dish. Dishes will be able to use these later.</p>
          </div>
          {canWrite && data?.installed && data.own_installed && <button type="button" style={small} onClick={() => setModal({ dish: { standalone: true, name: '', recipe: null } })}><Plus size={12} /> Add a recipe</button>}
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }} data-testid="own-recipes">
          {data && !data.own_installed ? (
            <p role="status" style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Run database script 194_menus_recipes_stand_alone.sql to add recipes of their own.</p>
          ) : !data?.standalone?.length ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>None yet. Use Add a recipe: that is where a batch is counted in kilograms or litres.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Recipe</th><th style={th}>Made</th><th style={{ ...th, textAlign: 'right' }}>Cost of a batch</th><th style={{ ...th, textAlign: 'right' }}>Cost of each</th><th style={th} /></tr></thead>
              <tbody>{data.standalone.map((r) => (
                <tr key={r.id} style={r.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={td}><strong>{r.name}</strong></td>
                  <td style={td}>{r.lines.length} line{r.lines.length === 1 ? '' : 's'} · makes {r.yield_label} · {r.made_to_order ? 'made to order' : 'made ahead'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.cost?.per_portion != null ? <>{num(r.cost.per_portion * r.yield_qty)}{!r.cost.complete && <span title="Some ingredient has never been bought, so its cost is not in this figure" style={{ color: colors.warning }}> *</span>}</> : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.cost?.per_portion != null ? `${num(r.cost.per_portion)} per ${r.yield_unit ?? 'portion'}` : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ dish: { id: r.id, standalone: true, name: r.name, recipe: r } })}>Edit recipe</button>}
                    {canWrite && <button type="button" style={small} onClick={() => removeOwn(r)}>Remove</button>}
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
