import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import useCoursesOn from '../../lib/useCoursesOn';
import { fromSteps, wordsOf } from '../../lib/stepMinutes';
import scrollTop from '../../lib/scrollTop';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus, hasPermission } from '../../../_shared/lib/roles';
import { useSearchParams } from 'react-router-dom';
import LabelPrint from '../../components/LabelPrint';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { useMenusBranch } from '../../lib/menusBranch';

/**
 * Menus → Recipes: what each dish is made of, and recipes of their own (a base or sauce that is not a dish), written on ingredients (Menus' own stock): an amount in the ingredient's base or alternate unit, and the waste in preparing it.
 * It shows what a portion costs and how many portions the shelf could make now. A recipe made to order uses the ingredients when the dish is sold.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const tinted = { ...small, background: colors.tint(0.14), color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 700 };   // the Add buttons of the forms
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));

const SCOPES = { per_dish: 'For each dish', per_order: 'Once for the order' };
const RECEIPT = { auto: 'When charged', always: 'Always', never: 'Never' };

/** Rows of size + value (an amount for a side, a price for a dish). */
function SizeRows({ label, rows, setRows, servings, valueLabel, testid }) {
  const free = servings.filter((v) => !rows.some((r) => String(r.serving_id) === String(v.id)));
  return (
    <div data-testid={testid}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted, marginBottom: 4 }}>{label}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <SelectInput aria-label={`${label} size ${i + 1}`} value={r.serving_id} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, serving_id: e.target.value } : x)))}>
            <option value={r.serving_id}>{servings.find((v) => String(v.id) === String(r.serving_id))?.name ?? 'Choose a size'}</option>
            {free.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
          </SelectInput>
          <NumberInput aria-label={`${valueLabel} for ${servings.find((v) => String(v.id) === String(r.serving_id))?.name ?? 'size'}`} min="0" step="any" value={r.value} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <button type="button" aria-label="Remove size" style={iconBtn} onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      {servings.length === 0 ? <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>No sizes on the list yet (Menus, Configuration).</p>
        : free.length > 0 && <button type="button" style={tinted} onClick={() => setRows((xs) => [...xs, { serving_id: String(free[0].id), value: '' }])}><Plus size={12} /> Add a size</button>}
    </div>
  );
}

/** Packaging that goes with the new side or dish: the item, how many, for each dish or once for the order, compulsory, charged, receipt. */
function PackRows({ label, rows, setRows, items }) {
  const patch = (i, p) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div data-testid="also-packaging">
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted, marginBottom: 4 }}>{label}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6, fontSize: '0.78rem' }}>
          <SelectInput aria-label={`${label} item ${i + 1}`} value={r.item_id} onChange={(e) => patch(i, { item_id: e.target.value })} style={{ maxWidth: 220 }}>
            <option value="">Choose…</option>
            {items.map((it) => <option key={it.item_id} value={String(it.item_id)}>{it.name}</option>)}
          </SelectInput>
          <NumberInput aria-label={`${label} count ${i + 1}`} min="1" max="99" value={r.quantity} onChange={(e) => patch(i, { quantity: e.target.value })} style={{ width: 70 }} />
          <SelectInput aria-label={`${label} counted ${i + 1}`} value={r.scope} onChange={(e) => patch(i, { scope: e.target.value })} style={{ maxWidth: 170 }}>{Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={r.compulsory} onChange={(e) => patch(i, { compulsory: e.target.checked })} /> Compulsory</label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={r.charged} onChange={(e) => patch(i, { charged: e.target.checked })} /> Charged</label>
          <SelectInput aria-label={`${label} receipt ${i + 1}`} value={r.receipt} onChange={(e) => patch(i, { receipt: e.target.value })} style={{ maxWidth: 140 }}>{Object.entries(RECEIPT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
          <button type="button" aria-label="Remove packaging" style={iconBtn} onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      {items.length === 0 ? <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>No packaging items yet (Menus, Configuration: choose the packaging kind and price list).</p>
        : <button type="button" style={tinted} onClick={() => setRows((xs) => [...xs, { item_id: '', quantity: 1, scope: 'per_dish', compulsory: false, charged: false, receipt: 'auto' }])}><Plus size={12} /> Add packaging</button>}
    </div>
  );
}

function RecipeModal({ dish, options, onClose, onDone }) {
  const coursesOn = useCoursesOn();
  const r = dish.recipe;
  const key = useRef(0);
  const mk = (l) => ({ key: `k${++key.current}`, ref: l?.recipe_id ? `r:${l.recipe_id}` : l?.ingredient_id ? `i:${l.ingredient_id}` : '', quantity: l?.quantity ?? '', unit: l?.unit ?? 'base', waste_pct: l?.waste_pct ?? '', item_id: l?.item_id ? String(l.item_id) : '', removable: Boolean(l?.removable), extra_allowed: Boolean(l?.extra_allowed) });
  const [yieldQty, setYieldQty] = useState(r?.yield_qty ?? 1);
  const [yieldUnit, setYieldUnit] = useState(r?.yield_unit_id ?? '');
  const [order, setOrder] = useState(r?.made_to_order ?? true);
  const [lines, setLines] = useState(r ? r.lines.map(mk) : [mk()]);
  const [steps, setSteps] = useState((r?.steps ?? []).map((s) => ({ key: `s${++key.current}`, body: s.body, minutes: s.minutes ?? '' })));
  const [times, setTimes] = useState((r?.times ?? []).map((t) => ({ key: `t${++key.current}`, up_to: t.up_to, minutes: t.minutes })));
  const [prep, setPrep] = useState(r?.prep_minutes ?? '');
  const [cook, setCook] = useState(r?.cook_minutes ?? '');
  const topRef = useRef(null);
  const [screen, setScreen] = useState(1);   // 1: what it is made of; 2: the method, times and the rest
  const [timesOpen, setTimesOpen] = useState(true);   // the time by batch size starts open; the arrow folds it away
  // prep and cook follow the steps (by the words in them) until someone types their own figure; a recipe saved with figures that differ from its steps keeps them
  const fromMethod = fromSteps(r ? (r.steps ?? []).map((x) => ({ body: x.body, minutes: x.minutes ?? '' })) : []);
  const [prepOwn, setPrepOwn] = useState(r?.prep_minutes != null && r.prep_minutes !== fromMethod.prep);
  const [cookOwn, setCookOwn] = useState(r?.cook_minutes != null && r.cook_minutes !== fromMethod.cook);
  const [visibility, setVisibility] = useState(r?.visibility ?? 'internal');
  const [note, setNote] = useState(r?.note ?? '');
  const [name, setName] = useState(dish.name ?? '');
  const [notSimple, setNotSimple] = useState(false);   // a new recipe also makes its side unless it is ticked as not a simple meal (a base, a marinade)
  const own = dish.standalone && dish.id ? r?.side ?? null : null;   // the side already made from this recipe, edited here with it
  const [station, setStation] = useState(own?.station_id ? String(own.station_id) : '');
  const [sideAmount, setSideAmount] = useState(own ? String(own.base_amount) : '1');
  const [sideSizes, setSideSizes] = useState((own?.amounts ?? []).map((a) => ({ serving_id: String(a.serving_id), value: String(a.amount) })));
  const [sideTask, setSideTask] = useState(own?.task_minutes ? String(own.task_minutes) : '');
  const [sideNote, setSideNote] = useState(own?.note ?? '');
  const [sidePack, setSidePack] = useState((own?.packaging ?? []).map((x) => ({ item_id: String(x.item_id), quantity: x.quantity, scope: x.scope, compulsory: x.compulsory, charged: x.charged, receipt: x.receipt })));
  const [addSide, setAddSide] = useState(false);   // editing a recipe that has no side: tick to make one
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const shown = useRef(false);
  useEffect(() => {   // a new screen starts at its top, not wherever the last one was scrolled to
    if (shown.current) scrollTop(topRef.current);
    shown.current = true;
  }, [screen]);
  const auto = fromSteps(steps);
  useEffect(() => {
    if (!prepOwn) setPrep(auto.prep > 0 ? String(auto.prep) : '');
    if (!cookOwn) setCook(auto.cook > 0 ? String(auto.cook) : '');
  }, [auto.prep, auto.cook, prepOwn, cookOwn]);
  const unitLabel = dish.standalone ? (options.units ?? []).find((u) => String(u.id) === String(yieldUnit))?.code ?? 'portions' : 'portions';
  const ing = (ref) => (ref.startsWith('i:') ? options.ingredients.find((i) => `i:${i.id}` === ref) : undefined);
  const sub = (ref) => (ref.startsWith('r:') ? (options.recipes ?? []).find((x) => `r:${x.id}` === ref) : undefined);
  const usable = (options.recipes ?? []).filter((x) => !(dish.standalone && dish.id && x.id === dish.id));
  const patch = (k, p) => setLines((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));
  const canFlag = order && Boolean(options.flags_installed);   // only a recipe made to order can lose or add an ingredient

  const packOut = (rows) => rows.filter((r) => r.item_id).map((r) => ({ item_id: Number(r.item_id), scope: r.scope, quantity: Number(r.quantity) || 1, compulsory: r.compulsory, charged: r.charged, receipt: r.receipt }));
  const sizesOut = (rows, key) => rows.filter((r) => r.serving_id && r.value !== '').map((r) => ({ serving_id: Number(r.serving_id), [key]: Number(r.value) }));
  const sideDetails = () => ({ base_amount: sideAmount === '' ? 1 : Number(sideAmount), amounts: sizesOut(sideSizes, 'amount'), task_minutes: sideTask === '' ? null : Number(sideTask), note: sideNote || null, packaging: packOut(sidePack) });

  const makesSide = Boolean(dish.standalone && options.plate_installed && (dish.id ? (own || addSide) : !notSimple));   // a new recipe of its own, or one being edited that has a side (or is given one now)
  const go = async (e) => {
    e.preventDefault();
    if (screen === 1) { setScreen(2); return; }   // Enter on the first screen goes on to the next, it does not save
    setBusy(true); setErr(null);
    try {
      const payload = {
        yield_qty: Number(yieldQty), ...(dish.standalone ? { yield_unit_id: yieldUnit === '' ? null : Number(yieldUnit) } : {}), made_to_order: order, note: note || null, visibility, prep_minutes: prep === '' ? null : Number(prep), cook_minutes: cook === '' ? null : Number(cook),
        lines: lines.filter((l) => l.ref).map((l) => ({ ...(l.ref.startsWith('r:') ? { recipe_id: Number(l.ref.slice(2)) } : { ingredient_id: Number(l.ref.slice(2)), ...(options.pins_installed ? { item_id: l.item_id ? Number(l.item_id) : null } : {}), ...(options.flags_installed ? { removable: order && l.removable, extra_allowed: order && l.extra_allowed } : {}) }), quantity: Number(l.quantity) || 0, unit: l.unit, waste_pct: l.waste_pct === '' ? 0 : Number(l.waste_pct) })),
        steps: steps.map((s) => ({ body: s.body, minutes: s.minutes === '' ? null : Number(s.minutes) })),
        ...(options.times_installed ? { times: times.filter((t) => t.up_to !== '' || t.minutes !== '').map((t) => ({ up_to: t.up_to === '' ? 0 : Number(t.up_to), minutes: t.minutes === '' ? 0 : Number(t.minutes) })) } : {}),
      };
      const res = dish.standalone ? await menusAPI.saveRecipeBook({ ...payload, name, ...(makesSide ? { also_side: true, ...(own ? { update_side: true } : {}), station_id: station === '' ? null : Number(station), side_details: sideDetails() } : {}) }, dish.id) : await menusAPI.saveStockRecipe(dish.id, payload);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the recipe')); } finally { setBusy(false); }
  };

  return (
    <Modal title={dish.id || !dish.standalone ? `Recipe: ${dish.name}` : 'New recipe'} onClose={onClose} width={820}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <ol ref={topRef} data-testid="recipe-screens" style={{ scrollMarginTop: 0, display: 'flex', gap: 18, flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0, fontSize: '0.8rem', borderBottom: `1px solid ${colors.tint(0.12)}` }}>
            {['Ingredients', 'Method and details'].map((t, i) => (
              <li key={t} aria-current={screen === i + 1 ? 'step' : undefined} style={{ padding: '4px 2px 6px', marginBottom: -1, fontWeight: screen === i + 1 ? 800 : 500, color: screen === i + 1 ? colors.primary : colors.textMuted, borderBottom: `2px solid ${screen === i + 1 ? colors.primary : 'transparent'}` }}>{i + 1}. {t}</li>
            ))}
          </ol>
          {screen === 1 && (
            <>
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
              <SelectInput id="rc-how" value={order ? 'order' : 'ahead'} onChange={(e) => { const toOrder = e.target.value === 'order'; setOrder(toOrder); if (!toOrder) setLines((xs) => xs.map((x) => ({ ...x, removable: false, extra_allowed: false }))); }}>
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
                      <SelectInput aria-label="Ingredient" value={l.ref} onChange={(e) => patch(l.key, { ref: e.target.value, unit: 'base', item_id: '' })}>
                        <option value="">Choose…</option>
                        <optgroup label="Ingredients">{options.ingredients.map((y) => <option key={`i${y.id}`} value={`i:${y.id}`}>{y.name}</option>)}</optgroup>
                        {usable.length > 0 && <optgroup label="Recipes of their own">{usable.map((y) => <option key={`r${y.id}`} value={`r:${y.id}`}>{y.name}</option>)}</optgroup>}
                      </SelectInput>
                    </Field>
                    <Field label="Amount"><NumberInput aria-label="Amount" min="0" step="any" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} /></Field>
                    <Field label="In"><SelectInput aria-label="Unit" value={l.unit} onChange={(e) => patch(l.key, { unit: e.target.value })}><option value="base">{x ? x.unit : i?.base_unit ?? 'base unit'}</option>{i?.alt_unit && <option value="alt">{i.alt_unit}</option>}</SelectInput></Field>
                    <Field label="Waste %" hint="lost in preparing"><NumberInput aria-label="Waste percent" min="0" max="90" step="any" value={l.waste_pct} onChange={(e) => patch(l.key, { waste_pct: e.target.value })} /></Field>
                    <button type="button" aria-label="Remove ingredient" style={iconBtn} onClick={() => setLines((xs) => (xs.length > 1 ? xs.filter((y) => y.key !== l.key) : xs))}><Trash2 size={15} /></button>
                    {i && options.pins_installed && (
                      <div data-testid="recipe-line-variant" style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.76rem', color: colors.textMuted, marginTop: -2 }}>
                        <label htmlFor={`rv-${l.key}`}>Variant</label>
                        <SelectInput id={`rv-${l.key}`} aria-label={`${i.name} variant`} value={l.item_id} onChange={(e) => patch(l.key, { item_id: e.target.value })} style={{ maxWidth: 300 }}>
                          <option value="">Automatic ({i.pick_label})</option>
                          {(i.variants ?? []).map((v) => <option key={v.id} value={String(v.id)}>{v.name} ({num(v.left, 2)} {i.base_unit} left)</option>)}
                        </SelectInput>
                        <span data-testid="recipe-line-variant-note">
                          {l.item_id
                            ? `Takes ${(i.variants ?? []).find((v) => String(v.id) === l.item_id)?.name ?? 'the chosen variant'} first; if it runs short, the rest comes ${i.pick_label}.`
                            : i.auto ? `Takes now: ${i.auto.name}` : 'Nothing usable on the shelf at this branch.'}
                        </span>
                      </div>
                    )}
                    {i && (
                      <div data-testid="recipe-line-flags" style={{ gridColumn: '1 / -1', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.76rem', color: colors.textMuted, marginTop: -2 }}>
                        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" aria-label={`${i.name} may be left out`} disabled={!canFlag} checked={canFlag && l.removable} onChange={(e) => patch(l.key, { removable: e.target.checked })} /> The customer may leave it out</label>
                        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" aria-label={`${i.name} may have extra`} disabled={!canFlag} checked={canFlag && l.extra_allowed} onChange={(e) => patch(l.key, { extra_allowed: e.target.checked })} /> The customer may ask for extra</label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setLines((xs) => [...xs, mk()])}><Plus size={12} /> Add an ingredient or recipe</button>
            {!options.pins_installed && <p role="status" data-testid="recipe-pins-missing" style={{ margin: '8px 0 0', fontSize: '0.76rem', color: colors.textMuted }}>Choosing a variant for a line: run database script 225_menus_recipe_line_variant.sql to add it here. Until then the pick rule chooses.</p>}
            {!options.flags_installed && <p role="status" data-testid="recipe-flags-missing" style={{ margin: '8px 0 0', fontSize: '0.76rem', color: colors.textMuted }}>What a customer may leave out or add: run database script 205_menus_recipe_line_flags.sql to add it here.</p>}
            {options.flags_installed && !order && <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: colors.textFaint }}>A recipe made ahead in batches cannot lose an ingredient once it is cooked, so nothing can be left out or added to. Make it to order to allow that.</p>}
          </div>

            </>
          )}
          {screen === 2 && (
            <>
          {!options.times_installed ? (
            <p role="status" data-testid="recipe-times-missing" style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Time by batch size: run database script 196_menus_recipe_times.sql to add it here.</p>
          ) : (
            <div data-testid="recipe-times">
              <button type="button" aria-expanded={timesOpen} aria-controls="recipe-times-body" onClick={() => setTimesOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                {timesOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.primary }}>Time by batch size</span>
                <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>{times.filter((t) => t.up_to !== '' || t.minutes !== '').length ? `${times.filter((t) => t.up_to !== '' || t.minutes !== '').length} row${times.filter((t) => t.up_to !== '' || t.minutes !== '').length === 1 ? '' : 's'}` : 'optional: for a recipe made in different sizes'}</span>
              </button>
              <div id="recipe-times-body" hidden={!timesOpen} style={{ marginTop: 6 }}>
              <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginBottom: 6 }}>This is what the batch timers use. A batch is timed by the smallest row that is big enough; a batch bigger than every row is worked out from the two biggest rows. With no rows, the timers use prep plus cook below, for a batch of any size.</div>
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
              <button type="button" style={{ ...small, marginTop: 8, background: colors.primary, color: '#fff', border: `1px solid ${colors.primary}`, fontWeight: 700 }} onClick={() => setTimes((xs) => [...xs, { key: `t${++key.current}`, up_to: '', minutes: '' }])}><Plus size={12} /> Add a time</button>
              </div>
            </div>
          )}


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
            <button type="button" style={{ ...small, marginTop: 8, background: colors.tint(0.14), color: colors.primary, border: `1px solid ${colors.primary}`, fontWeight: 700 }} onClick={() => setSteps((xs) => [...xs, { key: `s${++key.current}`, body: '', minutes: '' }])}><Plus size={12} /> Add a step</button>
          </div>
          <div data-testid="recipe-prep-cook" style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Prep (minutes)" hint={prepOwn ? 'Typed by you: the steps no longer change it.' : 'Added up from the steps that say dice, chop, wash and so on. Type a number to use your own.'}>
                <NumberInput aria-label="Prep minutes" min="0" value={prep} onChange={(e) => { setPrep(e.target.value); setPrepOwn(true); }} />
              </Field>
              <Field label="Cook (minutes)" hint={cookOwn ? 'Typed by you: the steps no longer change it.' : 'Added up from the steps that say fry, boil, bake and so on. Type a number to use your own.'}>
                <NumberInput aria-label="Cook minutes" min="0" value={cook} onChange={(e) => { setCook(e.target.value); setCookOwn(true); }} />
              </Field>
            </div>
            <div style={{ fontSize: '0.72rem', color: colors.textFaint, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} data-testid="prep-cook-note">
              <span>Shown on the kitchen card, and used as the batch time when there is no time by batch size.{auto.left > 0 ? ` ${auto.left} min in steps with no prep or cook word is not counted.` : ''}</span>
              {(prepOwn || cookOwn) && <button type="button" style={{ ...small, marginRight: 0 }} onClick={() => { setPrepOwn(false); setCookOwn(false); }}>Use the steps again</button>}
              <details style={{ fontSize: '0.72rem' }}>
                <summary style={{ cursor: 'pointer' }}>Which words count?</summary>
                <div style={{ display: 'grid', gap: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                  <div>A word in a step counts when it <em>starts</em> with one of these (so &ldquo;fry&rdquo; finds &ldquo;frying&rdquo;); capitals and accents do not matter. A step with a cooking word counts as cooking, even if it has a prep word too.</div>
                  {[['Prep', 'prep'], ['Cook', 'cook']].map(([title, kind]) => (
                    <div key={kind}>
                      <strong>{title}</strong>
                      {wordsOf(kind).map(([language, words]) => <div key={language}><em>{language}:</em> {words.join(', ')}.</div>)}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <Field label="Who may see it">
              <SelectInput aria-label="Who may see it" value={visibility} onChange={(e) => setVisibility(e.target.value)}>{Object.entries(options.visibility).map(([k, v]) => <option key={k} value={k}>{coursesOn ? v : v.replace(' and in courses', '')}</option>)}</SelectInput>
            </Field>
          </div>
          {dish.standalone && dish.id && !own && options.plate_installed && (
            <label data-testid="recipe-add-side" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', fontWeight: 700 }}>
              <input type="checkbox" aria-label="Make a side from this recipe" checked={addSide} onChange={(e) => setAddSide(e.target.checked)} /> Make a side from this recipe too
            </label>
          )}
          {dish.standalone && !dish.id && options.plate_installed && (
            <div data-testid="recipe-also" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', fontWeight: 700 }}>
                  <input type="checkbox" aria-label="Not a simple meal" checked={notSimple} onChange={(e) => setNotSimple(e.target.checked)} /> Not a simple meal: save only the recipe
                </label>
                <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginTop: 3 }}>Saving a recipe also makes a side of the same name, so it is ready to put on a plate. Tick this for a base, a marinade or anything that is only part of something else.</div>
              </div>
              {!notSimple && (
                <Field label="Station" htmlFor="rc-station" hint="who makes the side">
                  <SelectInput id="rc-station" value={station} onChange={(e) => setStation(e.target.value)}>
                    <option value="">None yet</option>
                    {(options.stations ?? []).map((st) => <option key={st.id} value={String(st.id)}>{st.name}</option>)}
                  </SelectInput>
                </Field>
              )}
            </div>
          )}
          {makesSide && (
            <div data-testid="also-side" style={{ display: 'grid', gap: 10, padding: 10, border: `1px solid ${colors.tint(0.1)}`, borderRadius: 8 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>The side: {own?.name ?? (name || 'this recipe')}{own && <span style={{ fontWeight: 400, color: colors.textFaint }}> (saved together with the recipe)</span>}</div>
              {dish.id && (
                <Field label="Station" htmlFor="rc-station2" hint="who makes the side">
                  <SelectInput id="rc-station2" value={station} onChange={(e) => setStation(e.target.value)}>
                    <option value="">None yet</option>
                    {(options.stations ?? []).map((st) => <option key={st.id} value={String(st.id)}>{st.name}</option>)}
                  </SelectInput>
                </Field>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
                <Field label="In a serving" htmlFor="rc-sideamt" hint={`in ${unitLabel}`}><NumberInput id="rc-sideamt" min="0" step="any" value={sideAmount} onChange={(e) => setSideAmount(e.target.value)} /></Field>
                <Field label="Plating (minutes)" htmlFor="rc-sidetask" hint="at the pass"><NumberInput id="rc-sidetask" min="1" max="240" value={sideTask} onChange={(e) => setSideTask(e.target.value)} /></Field>
                <Field label="Note" htmlFor="rc-sidenote"><TextInput id="rc-sidenote" maxLength={255} value={sideNote} onChange={(e) => setSideNote(e.target.value)} /></Field>
              </div>
              <SizeRows label="Amount for a size" rows={sideSizes} setRows={setSideSizes} servings={options.lists?.servings ?? []} valueLabel="Amount" testid="also-side-sizes" />
              <PackRows label="Side packaging" rows={sidePack} setRows={setSidePack} items={options.packaging_items ?? []} />
            </div>
          )}
          <Field label="Note (optional)"><TextInput aria-label="Note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" style={{ ...btnGhost, padding: '8px 16px' }} onClick={onClose}>Cancel</button>
            {screen === 2 && <button type="button" style={{ ...btnGhost, padding: '8px 16px' }} onClick={() => setScreen(1)}>Back</button>}
            {screen === 1
              ? <button type="submit" style={{ ...btnPrimary, padding: '8px 18px' }} disabled={!lines.some((l) => l.ref && Number(l.quantity) > 0) || (dish.standalone && !name.trim())}>Next</button>
              : <button type="submit" style={{ ...btnPrimary, padding: '8px 18px', opacity: busy ? 0.6 : 1 }} disabled={busy || !lines.some((l) => l.ref && Number(l.quantity) > 0) || (dish.standalone && !name.trim())}>{busy ? 'Saving…' : 'Save recipe'}</button>}
          </div>
        </FormStack>
      </form>
    </Modal>
  );
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The kitchen card of a recipe (the page its QR opens): what goes in, in what amount, the steps and the times. Read only, and printable. */
function KitchenCard({ title, recipe, onClose, onLabel }) {
  const unitOf = (l) => (l.unit === 'alt' ? l.alt_unit : l.base_unit);
  const print = () => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { toast.error('Allow pop-ups to print the card.'); return; }
    w.document.write(`<!doctype html><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;margin:24px;color:#0f172a}h1{margin:0 0 4px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #cbd5e1;padding:5px 8px;text-align:left}ol{padding-left:20px}li{margin:6px 0}small{color:#475569}</style>
      <h1>${esc(title)}</h1><p><small>${esc(recipe.yield_label ? `Makes ${recipe.yield_label}` : '')}${recipe.made_to_order ? ', made to order' : ', made ahead'}${recipe.prep_minutes ? `, prep ${recipe.prep_minutes} min` : ''}${recipe.cook_minutes ? `, cook ${recipe.cook_minutes} min` : ''}</small></p>
      <h2>Ingredients</h2><table>${recipe.lines.map((l) => `<tr><td>${esc(l.name)}${l.variant ? ` (${esc(l.variant)})` : ''}</td><td>${esc(num(l.quantity, 3))} ${esc(unitOf(l) ?? '')}</td></tr>`).join('')}</table>
      ${recipe.steps.length ? `<h2>Method</h2><ol>${recipe.steps.map((s) => `<li>${esc(s.body)}${s.minutes ? ` <small>(${s.minutes} min)</small>` : ''}</li>`).join('')}</ol>` : ''}
      ${recipe.times?.length ? `<h2>Time by batch size</h2><table>${recipe.times.map((t) => `<tr><td>up to ${esc(num(t.up_to, 3))}</td><td>${t.minutes} min</td></tr>`).join('')}</table>` : ''}`);
    w.document.close(); w.focus(); w.print();
  };

  return (
    <Modal title={`Kitchen card: ${title}`} subtitle={`${recipe.yield_label ? `Makes ${recipe.yield_label}` : ''}${recipe.made_to_order ? ' · made to order' : ' · made ahead'}`} onClose={onClose} width={640}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{onLabel && <button type="button" style={btnGhost} onClick={onLabel}>Print the QR label</button>}<button type="button" style={btnGhost} onClick={print}>Print the card</button><button type="button" style={btnGhost} onClick={onClose}>Close</button></div>}>
      <div data-testid="kitchen-card" style={{ display: 'grid', gap: 12, fontSize: '0.88rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Ingredient</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>{recipe.lines.map((l, i) => <tr key={i}><td style={td}>{l.name}{l.variant && <span style={{ color: colors.textMuted }}> ({l.variant})</span>}</td><td style={{ ...td, textAlign: 'right' }}>{num(l.quantity, 3)} {unitOf(l)}</td></tr>)}</tbody>
        </table>
        {recipe.steps.length > 0 && <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>{recipe.steps.map((s, i) => <li key={i}>{s.body}{s.minutes ? <small style={{ color: colors.textMuted }}> ({s.minutes} min)</small> : null}</li>)}</ol>}
        {(recipe.prep_minutes || recipe.cook_minutes) && <p style={{ margin: 0, color: colors.textMuted }}>{recipe.prep_minutes ? `Prep ${recipe.prep_minutes} min. ` : ''}{recipe.cook_minutes ? `Cook ${recipe.cook_minutes} min.` : ''}</p>}
        {recipe.times?.length > 0 && <p style={{ margin: 0, color: colors.textMuted }}>By batch size: {recipe.times.map((t) => `up to ${num(t.up_to, 3)} takes ${t.minutes} min`).join(', ')}.</p>}
      </div>
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
  const [params, setParams] = useSearchParams();
  const [labels, setLabels] = useState(null);
  const canPrint = hasPermission(user, 'codes.print');

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.stockRecipes(loc ? { location_id: loc } : undefined)
      .then((d) => { setData(d); if (first.current) { first.current = false; setLoc(String(d.location_id)); } })
      .catch((e) => toast.error(errMsg(e, 'Could not load the recipes')))
      .finally(() => setLoading(false));
  }, [loc, setLoc]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  // the QR of a recipe opens its kitchen card: ?card=<recipe id>
  const cards = [...(data?.dishes ?? []).filter((d) => d.recipe).map((d) => ({ title: d.name, recipe: d.recipe })), ...(data?.standalone ?? []).map((r) => ({ title: r.name, recipe: r }))];
  const cardOf = (id) => cards.find((c) => String(c.recipe.id) === String(id));
  const opened = params.get('card') ? cardOf(params.get('card')) : null;
  const closeCard = () => { const p = new URLSearchParams(params); p.delete('card'); setParams(p, { replace: true }); };
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
                  <td style={td}>{d.recipe ? <>{d.recipe.lines.length} line{d.recipe.lines.length === 1 ? '' : 's'} · makes {num(d.recipe.yield_qty, 3)} · {d.recipe.made_to_order ? 'made to order' : 'made ahead'}</> : d.made_of?.length ? <span>Made of {d.made_of.join(', ')} (their recipes, under Sides)</span> : <span style={{ color: colors.textFaint }}>no recipe yet</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.recipe?.cost ? <>{num(d.recipe.cost.per_portion)}{!d.recipe.cost.complete && <span title="Some ingredient has never been bought, so its cost is not in this figure" style={{ color: colors.warning }}> *</span>}</> : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.recipe?.portions == null ? '—' : num(Math.floor(d.recipe.portions), 0)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {d.recipe && <button type="button" style={small} onClick={() => setParams({ card: d.recipe.id })}>Kitchen card</button>}
                    {canWrite && data.installed && (d.recipe || !d.made_of?.length) && <button type="button" style={small} onClick={() => setModal({ dish: d })}>{d.recipe ? 'Edit recipe' : 'Write recipe'}</button>}
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
                    <button type="button" style={small} onClick={() => setParams({ card: r.id })}>Kitchen card</button>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ dish: { id: r.id, standalone: true, name: r.name, recipe: r } })}>Edit recipe</button>}
                    {canWrite && <button type="button" style={small} onClick={() => removeOwn(r)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {opened && <KitchenCard title={opened.title} recipe={opened.recipe} onClose={closeCard} onLabel={canPrint ? () => setLabels([{ type: 'recipe', id: opened.recipe.id, label: opened.title }]) : null} />}
      {labels && <LabelPrint items={labels} onClose={() => setLabels(null)} />}
      {modal && data && <RecipeModal dish={modal.dish} options={data} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
