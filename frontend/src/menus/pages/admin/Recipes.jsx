import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextArea, TextInput, FormStack, ModalActions, FormError } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import MenusNav from '../../components/MenusNav';
import VariantPicker from '../../../core/components/admin/pickers/VariantPicker';
import { recipesAPI } from '../../../_shared/api/stockOps';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

/**
 * Recipes and production. A recipe says what an item is made of, per yield. "Made ahead": a production run uses the
 * ingredients and makes a batch of the finished item, costed at what the ingredients cost. "Made to order": selling
 * the item uses the ingredients (a menu dish) and the item itself holds no stock.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const nm = (r) => `${r.product}${r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}`;

function RecipeModal({ recipe, families, units, dishes, onClose, onDone }) {
  const [out, setOut] = useState(recipe ? { variant_id: recipe.variant_id, name: recipe.item } : null);
  const [yieldQty, setYieldQty] = useState(recipe?.yield_qty ?? 1);
  const [onSale, setOnSale] = useState(recipe?.deduct_on_sale ?? false);
  const [note, setNote] = useState(recipe?.note ?? '');
  const [visibility, setVisibility] = useState(recipe?.visibility ?? 'internal');
  const [prep, setPrep] = useState(recipe?.prep_minutes ?? '');
  const [cook, setCook] = useState(recipe?.cook_minutes ?? '');
  const [steps, setSteps] = useState(recipe?.steps ?? []);
  const [items, setItems] = useState(recipe ? recipe.items.map((i) => ({ key: i.family_id ? `f${i.family_id}` : `v${i.variant_id}`, variant_id: i.variant_id, family_id: i.family_id, name: i.name, quantity: i.quantity, unit_id: i.unit_id ?? '', waste_pct: i.waste_pct ?? 0 })) : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const addItem = (r) => setItems((xs) => (xs.some((x) => x.key === `v${r.variant_id}`) ? xs : [...xs, { key: `v${r.variant_id}`, variant_id: r.variant_id, family_id: null, name: nm(r), quantity: 1, unit_id: '', waste_pct: 0 }]));
  const addFamily = (id) => {
    const f = families.find((x) => String(x.id) === String(id));
    if (f && !items.some((x) => x.key === `f${f.id}`)) setItems((xs) => [...xs, { key: `f${f.id}`, variant_id: null, family_id: f.id, name: f.name, quantity: 1, unit_id: f.unit_id, waste_pct: 0 }]);
  };
  const patch = (key, p) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const unitsFor = (x) => {
    const f = x.family_id ? families.find((y) => y.id === x.family_id) : null;
    const base = f ? units.find((u) => u.id === f.unit_id) : null;

    return base ? units.filter((u) => u.dimension === base.dimension) : units;
  };
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await recipesAPI.save({
        variant_id: out.variant_id, yield_qty: Number(yieldQty), deduct_on_sale: onSale, note: note || undefined, visibility,
        prep_minutes: prep === '' ? null : Number(prep), cook_minutes: cook === '' ? null : Number(cook),
        steps: steps.filter((st) => st.body?.trim()).map((st) => ({ body: st.body, minutes: st.minutes === '' || st.minutes == null ? null : Number(st.minutes), image: st.image || null })),
        items: items.map((i) => ({ ...(i.family_id ? { family_id: i.family_id } : { variant_id: i.variant_id }), quantity: Number(i.quantity), unit_id: i.unit_id ? Number(i.unit_id) : null, waste_pct: Number(i.waste_pct) || 0 })),
      });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the recipe')); } finally { setBusy(false); }
  };
  return (
    <Modal title={recipe ? 'Edit recipe' : 'New recipe'} onClose={onClose} width={760}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {out ? <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Makes: {out.name}{!recipe && <button type="button" style={{ ...small, marginLeft: 10 }} onClick={() => setOut(null)}>Change</button>}</div>
            : (
              <Field label="What it makes">
                {dishes.length > 0 && (
                  <SelectInput aria-label="A dish" value="" onChange={(e) => { const d = dishes.find((x) => String(x.variant_id) === e.target.value); if (d) setOut({ variant_id: d.variant_id, name: d.name }); }} style={{ marginBottom: 6 }}>
                    <option value="">A dish…</option>{dishes.map((d) => <option key={d.id} value={d.variant_id}>{d.name}</option>)}
                  </SelectInput>
                )}
                <VariantPicker onPick={(r) => setOut({ variant_id: r.variant_id, name: nm(r) })} placeholder="…or search any other finished item" />
              </Field>
            )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
            <Field label="One batch makes (units)" htmlFor="rc-yield"><NumberInput id="rc-yield" required min="0.0001" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} /></Field>
            <Field label="How it is made" htmlFor="rc-how"><SelectInput id="rc-how" value={onSale ? 'order' : 'ahead'} onChange={(e) => setOnSale(e.target.value === 'order')}><option value="ahead">Made ahead (production run)</option><option value="order">Made to order (a sale uses the ingredients)</option></SelectInput></Field>
          </div>

          <Field label="Ingredients (amount per batch)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <SelectInput aria-label="Add an ingredient" value="" onChange={(e) => addFamily(e.target.value)}><option value="">Add an ingredient (wheat flour, oil…)</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.unit})</option>)}</SelectInput>
              <VariantPicker onPick={addItem} placeholder="…or one exact stock item" />
            </div>
          </Field>
          {items.map((i) => (
            <div key={i.key} data-testid="recipe-line" style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 80px 24px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem' }}>{i.name}{i.family_id && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · the kitchen picks the item</span>}</span>
              <NumberInput min="0.0001" step="any" required value={i.quantity} aria-label={`Amount of ${i.name}`} onChange={(e) => patch(i.key, { quantity: e.target.value })} />
              <SelectInput aria-label={`Unit of ${i.name}`} value={i.unit_id} onChange={(e) => patch(i.key, { unit_id: e.target.value })}>
                <option value="">{i.family_id ? 'ingredient unit' : 'its stock unit'}</option>{unitsFor(i).map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </SelectInput>
              <NumberInput min="0" max="90" step="any" value={i.waste_pct} aria-label={`Waste of ${i.name} (percent)`} title="Percent lost in preparing it (peeling, trimming)" onChange={(e) => patch(i.key, { waste_pct: e.target.value })} />
              <button type="button" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={14} /></button>
            </div>
          ))}
          {items.length > 0 && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>Columns: amount · unit · waste % (what is lost in preparing it: the kitchen takes more to still have this amount).</p>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 10 }}>
            <Field label="Prep (minutes)" htmlFor="rc-prep"><NumberInput id="rc-prep" min="0" max="6000" value={prep} onChange={(e) => setPrep(e.target.value)} /></Field>
            <Field label="Cook (minutes)" htmlFor="rc-cook"><NumberInput id="rc-cook" min="0" max="6000" value={cook} onChange={(e) => setCook(e.target.value)} /></Field>
            <Field label="Who may see it" htmlFor="rc-vis"><SelectInput id="rc-vis" value={visibility} onChange={(e) => setVisibility(e.target.value)}><option value="internal">Kitchen only</option><option value="publishable">May be shown on the website</option></SelectInput></Field>
          </div>

          <Field label="Method (steps)">
            {steps.map((st, n) => (
              <div key={n} data-testid="recipe-step" style={{ display: 'grid', gridTemplateColumns: '24px 1fr 90px 24px', gap: 8, alignItems: 'start', marginBottom: 6 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: colors.textFaint, paddingTop: 9 }}>{n + 1}</span>
                <TextArea rows={2} value={st.body} aria-label={`Step ${n + 1}`} onChange={(e) => setSteps((xs) => xs.map((x, i) => (i === n ? { ...x, body: e.target.value } : x)))} />
                <NumberInput min="0" max="6000" placeholder="min" value={st.minutes ?? ''} aria-label={`Minutes for step ${n + 1}`} onChange={(e) => setSteps((xs) => xs.map((x, i) => (i === n ? { ...x, minutes: e.target.value } : x)))} />
                <button type="button" aria-label={`Remove step ${n + 1}`} onClick={() => setSteps((xs) => xs.filter((_, i) => i !== n))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, paddingTop: 9 }}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" style={small} onClick={() => setSteps((xs) => [...xs, { body: '', minutes: '' }])}>Add a step</button>
          </Field>
          <Field label="Note (optional)" htmlFor="rc-note"><TextInput id="rc-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Save recipe" busy={busy} disabled={!out || !items.length} />
        </FormStack>
      </form>
    </Modal>
  );
}

function RunModal({ recipe, branches, onClose, onDone }) {
  const [qty, setQty] = useState(recipe.yield_qty);
  const [loc, setLoc] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await recipesAPI.produce(recipe.id, { quantity: Number(qty), location_id: Number(loc), batch_no: batch || undefined, expiry_date: expiry || undefined }); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not run production')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Make a batch" subtitle={recipe.item} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Branch"><SelectInput required value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          <Field label="How many made"><NumberInput required min="0.0001" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Batch number (optional)"><TextInput value={batch} onChange={(e) => setBatch(e.target.value)} /></Field>
            <Field label="Expiry date (if it expires)"><TextInput type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Uses {recipe.items.map((i) => `${Math.round(i.quantity * (Number(qty) || 0) / recipe.yield_qty * 10000) / 10000} × ${i.name}`).join(', ')}. The batch is costed at what these cost.</p>
          <ModalActions onCancel={onClose} submitLabel="Make" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function Recipes() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [pick, setPick] = useState({ families: [], units: [], dishes: [] });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([menusAPI.ingredients().catch(() => null), menusAPI.dishes().catch(() => null)]).then(([ing, dsh]) => setPick({ families: (ing?.families ?? []).filter((f) => f.is_active), units: ing?.units ?? [], dishes: dsh?.dishes ?? [] }));
    recipesAPI.list().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load recipes'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };

  const remove = async (r) => {
    if (!window.confirm(`Remove the recipe for ${r.item}?`)) return;
    try { const res = await recipesAPI.remove(r.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove')); }
  };
  const cancelRun = async (p) => {
    if (!window.confirm(`Cancel ${p.number}? The ingredients go back into stock.`)) return;
    try { const res = await recipesAPI.cancelRun(p.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not cancel')); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="recipes and production" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <MenusNav />
        <HubHeader title="Recipes & production" description="What things are made of. Make a batch ahead, or let a sale use the ingredients." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 14px' }}>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'recipe' })}><Plus size={14} /> New recipe</button>}
        </div>

        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 22 }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.recipes?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No recipes yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Item</th><th style={th}>Made from (per batch)</th><th style={{ ...th, textAlign: 'right' }}>Cost each</th><th style={th}>Made</th><th style={th} /></tr></thead>
              <tbody>{data.recipes.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.item}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.yield_qty} per batch</div></td>
                  <td style={td}>{r.items.map((i) => `${i.quantity}${i.waste_pct ? ` (+${i.waste_pct}% waste)` : ''} × ${i.name}`).join(', ')}</td>
                  <td style={{ ...td, textAlign: 'right' }} data-testid="recipe-cost">{r.cost_each == null ? <span style={{ color: colors.textFaint }}>—</span> : <>{r.cost_each.toLocaleString('en-KE', { maximumFractionDigits: 2 })}{!r.cost_complete && <div style={{ fontSize: '0.68rem', color: colors.textFaint }}>some costs unknown</div>}</>}</td>
                  <td style={td}>{r.deduct_on_sale ? 'To order' : 'Ahead'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && !r.deduct_on_sale && <button type="button" style={small} onClick={() => setModal({ kind: 'run', recipe: r })}>Make a batch</button>}
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ kind: 'recipe', recipe: r })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(r)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Recent production</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {!(data?.runs?.length) ? <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing made yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Run</th><th style={th}>Item</th><th style={th}>Branch</th><th style={{ ...th, textAlign: 'right' }}>Made</th><th style={{ ...th, textAlign: 'right' }}>Cost each</th><th style={th}>Status</th><th style={th} /></tr></thead>
              <tbody>{data.runs.map((p) => (
                <tr key={p.id}>
                  <td style={td}><strong>{p.number}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{String(p.created_at).slice(0, 10)}</div></td>
                  <td style={td}>{p.item}</td><td style={td}>{p.location}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.quantity}</td><td style={{ ...td, textAlign: 'right' }}>{p.unit_cost.toFixed(4)}</td>
                  <td style={td}>{p.status}</td>
                  <td style={td}>{canWrite && p.status === 'posted' && <button type="button" style={small} onClick={() => cancelRun(p)}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal?.kind === 'recipe' && <RecipeModal recipe={modal.recipe} families={pick.families} units={pick.units} dishes={pick.dishes.filter((d) => !d.has_recipe || d.variant_id === modal.recipe?.variant_id)} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'run' && <RunModal recipe={modal.recipe} branches={data?.branches ?? []} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
