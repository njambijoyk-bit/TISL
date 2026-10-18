import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import LabelPrint from '../../components/LabelPrint';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus, hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { useMenusBranch } from '../../lib/menusBranch';
import PreparedReports from '../../components/PreparedReports';

/**
 * Menus → Prepared food: food cooked ahead from a recipe of its own (ugali, a stew base). Making a batch uses the ingredients the chef really used, puts what came out on the shelf and books the
 * value to Prepared Food Inventory. The shelf shows what is left of each; a batch can be undone while all of it is still there.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));
const today = () => new Date().toISOString().slice(0, 10);

/** A timestamp from the server as the value of a datetime-local box (the browser's own time). */
const localInput = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const mmss = (s) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;

/** Seconds to go until a time, ticking every second. Negative when it has passed. */
function useSecondsLeft(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  return Math.round((new Date(iso).getTime() - now) / 1000);
}

/** One batch on the stove: what it is, when it is ready, and the clock. */
function TimerCard({ t, canWrite, onMake, onCancel }) {
  const left = useSecondsLeft(t.ready_at);
  const over = left < 0;

  return (
    <div data-timer={t.id} data-overdue={over ? 'yes' : 'no'} style={{ ...card, padding: 14, display: 'grid', gap: 6, borderColor: over ? '#ef4444' : undefined, borderWidth: over ? 2 : undefined }}>
      <strong>{t.note ? `${t.note}: ` : ''}{t.recipe}</strong>
      <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{t.planned} {t.unit}, {t.minutes} min, ready {t.ready_time}{t.chef ? `, ${t.chef}` : ''}</span>
      <span data-testid="timer-clock" style={{ fontSize: '1.6rem', fontWeight: 900, color: over ? '#b91c1c' : '#047857' }}>{over ? `${mmss(left)} over` : `${mmss(left)} left`}</span>
      {canWrite && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => onMake(t)}>Make the batch</button>
          <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => onCancel(t)}>Switch off</button>
        </div>
      )}
    </div>
  );
}

/** Start the clock on a batch: the recipe, the size, and how long when the recipe has no time for that size. */
function StartTimer({ data, location, onClose, onDone }) {
  const [recipeId, setRecipeId] = useState('');
  const [size, setSize] = useState('');
  const [minutes, setMinutes] = useState('');
  const [chef, setChef] = useState('');
  const [note, setNote] = useState('');
  const [expected, setExpected] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const recipe = data.recipes.find((r) => String(r.id) === String(recipeId));

  useEffect(() => {
    setExpected(undefined);
    if (!recipeId || !(Number(size) > 0)) return undefined;
    const t = setTimeout(() => { menusAPI.preparedPreview({ recipe_id: recipeId, location_id: location, qty: Number(size) }).then((p) => setExpected(p.expected_minutes ?? null)).catch(() => setExpected(null)); }, 350);
    return () => clearTimeout(t);
  }, [recipeId, size, location]);

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.startBatchTimer({ recipe_id: Number(recipeId), location_id: Number(location), qty: Number(size), minutes: minutes === '' ? null : Number(minutes), chef_id: chef ? Number(chef) : null, note: note || null });
      toast.success(res.message); onDone(res.timers);
    } catch (x) { setErr(errMsg(x, 'Could not start the timer')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Start a batch timer" onClose={onClose} width={520}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Recipe" htmlFor="pt-recipe"><SelectInput id="pt-recipe" required value={recipeId} onChange={(e) => setRecipeId(e.target.value)}><option value="">Choose a recipe</option>{data.recipes.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>
          <Field label={`Batch size${recipe ? ` (${recipe.unit})` : ''}`} htmlFor="pt-size"><NumberInput id="pt-size" required min="0.0001" step="any" value={size} onChange={(e) => setSize(e.target.value)} /></Field>
          <Field label="Minutes" htmlFor="pt-min" hint={expected === undefined ? 'The recipe\'s own time for this size is used when there is one.' : expected === null ? 'The recipe has no time for this size: type how long it takes.' : `The recipe says ${expected} minutes for this size. Type a number to use another.`}><NumberInput id="pt-min" min="1" max="6000" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          <Field label="What it is doing (optional)" htmlFor="pt-note"><TextInput id="pt-note" maxLength={120} placeholder="Simmer" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {data.chefs.length > 0 && <Field label="Chef (optional)" htmlFor="pt-chef"><SelectInput id="pt-chef" value={chef} onChange={(e) => setChef(e.target.value)}><option value="">Nobody in particular</option>{data.chefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>}
          <ModalActions onCancel={onClose} submitLabel="Start the clock" busy={busy} disabled={!recipeId || !(Number(size) > 0) || (expected === null && minutes === '')} />
        </FormStack>
      </form>
    </Modal>
  );
}

function MakeBatch({ data, location, initial = null, onClose, onDone }) {
  const [recipeId, setRecipeId] = useState(initial?.recipe_id ? String(initial.recipe_id) : '');
  const [size, setSize] = useState(initial?.planned ? String(initial.planned) : '');
  const [preview, setPreview] = useState(null);
  const [used, setUsed] = useState({});
  const [output, setOutput] = useState('');
  const [chef, setChef] = useState(initial?.chef_id ? String(initial.chef_id) : '');
  const [started, setStarted] = useState(initial?.started_at ? localInput(initial.started_at) : '');   // a batch made from a timer is timed from when the timer started
  const [finished, setFinished] = useState('');
  const [date, setDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [cut, setCut] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const key = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const recipe = data.recipes.find((r) => String(r.id) === String(recipeId));

  useEffect(() => {
    setPreview(null); setUsed({});
    if (!recipeId || !(Number(size) > 0)) return undefined;
    const t = setTimeout(() => {
      menusAPI.preparedPreview({ recipe_id: recipeId, location_id: location, qty: Number(size) })
        .then(setPreview).catch((e) => setErr(errMsg(e, 'Could not work out the batch')));
    }, 350);
    return () => clearTimeout(t);
  }, [recipeId, size, location]);

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const inputs = (preview?.inputs ?? []).filter((i) => used[i.ingredient_id] !== undefined && used[i.ingredient_id] !== '' && Number(used[i.ingredient_id]) !== i.expected)
        .map((i) => ({ ingredient_id: i.ingredient_id, qty: Number(used[i.ingredient_id]) }));
      const res = await menusAPI.makePrepared({
        recipe_id: Number(recipeId), location_id: Number(location), qty: Number(size), output_qty: output === '' ? Number(size) : Number(output), date, expiry_date: expiry || null, chef_id: chef ? Number(chef) : null,
        started_at: started || null, finished_at: finished || null, note: note || null, client_key: key.current, inputs, ...(initial?.id ? { timer_id: initial.id } : {}),
        servings: cut.filter((c) => c.serving_id && Number(c.count) > 0).map((c) => ({ serving_id: Number(c.serving_id), count: Number(c.count) })),
      });
      toast.success(res.message); onDone(res.lot_id);
    } catch (x) { setErr(errMsg(x, 'Could not make the batch')); } finally { setBusy(false); }
  };

  return (
    <Modal title={initial ? `Make the batch: ${initial.recipe}` : 'Make a batch'} onClose={onClose} width={820}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Recipe" htmlFor="pb-recipe">
              <SelectInput id="pb-recipe" required value={recipeId} onChange={(e) => { setRecipeId(e.target.value); setSize(''); setOutput(''); }}>
                <option value="">Choose…</option>
                {data.recipes.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.yield_label} a batch)</option>)}
              </SelectInput>
            </Field>
            <Field label={`Batch size (${recipe?.unit ?? 'portions'})`} htmlFor="pb-size" hint="The amount the ingredients are worked out for.">
              <NumberInput id="pb-size" required min="0.0001" step="any" value={size} onChange={(e) => { setSize(e.target.value); setOutput(''); }} />
            </Field>
          </div>

          {preview && (
            <div data-testid="batch-preview">
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>
                What it takes{preview.expected_minutes != null ? ` · expected ${preview.expected_minutes} minutes` : ' · no time set for a batch this size'}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Ingredient</th><th style={{ ...th, textAlign: 'right' }}>Recipe says</th><th style={{ ...th, textAlign: 'right' }}>Really used</th><th style={{ ...th, textAlign: 'right' }}>On the shelf</th><th style={{ ...th, textAlign: 'right' }}>Cost</th></tr></thead>
                <tbody>{preview.inputs.map((i) => (
                  <tr key={i.ingredient_id}>
                    <td style={td}>{i.name}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(i.expected, 3)} {i.unit}</td>
                    <td style={{ ...td, textAlign: 'right', width: 130 }}><NumberInput aria-label={`Used of ${i.name}`} min="0" step="any" value={used[i.ingredient_id] ?? i.expected} onChange={(e) => setUsed((u) => ({ ...u, [i.ingredient_id]: e.target.value }))} /></td>
                    <td style={{ ...td, textAlign: 'right', color: i.short > 0 ? colors.danger : undefined }}>{num(i.on_hand, 3)} {i.unit}{i.short > 0 && ` (short ${num(i.short, 3)})`}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{i.cost == null ? '—' : num(i.cost)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {preview.cost != null && <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: colors.textMuted }}>About {num(preview.cost)} for the batch{!preview.complete ? ' (an ingredient that has never been bought is not counted)' : ''}.</p>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <Field label={`What came out (${recipe?.unit ?? 'portions'})`} htmlFor="pb-out" hint="Empty: the batch size."><NumberInput id="pb-out" min="0" step="any" value={output} onChange={(e) => setOutput(e.target.value)} /></Field>
            <Field label="Made by" htmlFor="pb-chef"><SelectInput id="pb-chef" value={chef} onChange={(e) => setChef(e.target.value)}><option value="">Nobody named</option>{data.chefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
            <Field label="Started" htmlFor="pb-start"><TextInput id="pb-start" type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} /></Field>
            <Field label="Finished" htmlFor="pb-end"><TextInput id="pb-end" type="datetime-local" value={finished} onChange={(e) => setFinished(e.target.value)} /></Field>
            <Field label="Made on" htmlFor="pb-date"><TextInput id="pb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Use by (optional)" htmlFor="pb-exp"><TextInput id="pb-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
          </div>
          {data.servings.length > 0 && (
            <div data-testid="servings-cut">
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>What it was cut into (optional)</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {cut.map((c, i) => (
                  <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8, alignItems: 'center' }}>
                    <SelectInput aria-label={`Serving ${i + 1}`} value={c.serving_id} onChange={(e) => setCut((xs) => xs.map((y) => (y.key === c.key ? { ...y, serving_id: e.target.value } : y)))}>
                      <option value="">Choose a serving…</option>{data.servings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </SelectInput>
                    <NumberInput aria-label={`Number of serving ${i + 1}`} min="1" step="1" value={c.count} onChange={(e) => setCut((xs) => xs.map((y) => (y.key === c.key ? { ...y, count: e.target.value } : y)))} />
                    <button type="button" aria-label="Remove serving" style={small} onClick={() => setCut((xs) => xs.filter((y) => y.key !== c.key))}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" style={{ ...small, marginTop: 8 }} onClick={() => setCut((xs) => [...xs, { key: `c${Date.now()}${xs.length}`, serving_id: '', count: '' }])}>Add a serving</button>
            </div>
          )}
          <Field label="Note (optional)" htmlFor="pb-note"><TextInput id="pb-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Make the batch" busy={busy} disabled={!recipeId || !(Number(size) > 0)} />
        </FormStack>
      </form>
    </Modal>
  );
}

function WriteOff({ data, location, recipe, onClose, onDone }) {
  const [qty, setQty] = useState('');
  const [kind, setKind] = useState('spoilage');
  const [lot, setLot] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.wastePrepared({ recipe_id: recipe.id, location_id: Number(location), quantity: Number(qty), kind, lot_id: lot ? Number(lot) : null, note: note || null, date });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not write it off')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Write off: ${recipe.name}`} onClose={onClose} width={560}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>{num(recipe.on_shelf, 3)} {recipe.unit} on the shelf. It is booked to Food Waste Expense and shows in the waste log.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={`How much (${recipe.unit})`} htmlFor="pw-qty"><NumberInput id="pw-qty" required min="0.0001" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Why" htmlFor="pw-kind"><SelectInput id="pw-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(data.waste_kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          </div>
          <Field label="From which batch" htmlFor="pw-lot" hint="Oldest use-by first, unless you choose one.">
            <SelectInput id="pw-lot" value={lot} onChange={(e) => setLot(e.target.value)}><option value="">Oldest first</option>{recipe.lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no} · {num(l.qty_left, 3)} {recipe.unit} left{l.expiry_date ? ` · use by ${l.expiry_date}` : ''}</option>)}</SelectInput>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <Field label="Day" htmlFor="pw-date"><TextInput id="pw-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Note (optional)" htmlFor="pw-note"><TextInput id="pw-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <ModalActions onCancel={onClose} submitLabel="Write it off" busy={busy} disabled={!(Number(qty) > 0)} />
        </FormStack>
      </form>
    </Modal>
  );
}

function CountShelf({ data, location, onClose, onDone }) {
  const rows = data.recipes.filter((r) => r.active || r.on_shelf > 0);
  const [counted, setCounted] = useState({});
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const lines = rows.filter((r) => counted[r.id] !== undefined && counted[r.id] !== '').map((r) => ({ recipe_id: r.id, counted: Number(counted[r.id]) }));
      const res = await menusAPI.countPrepared({ location_id: Number(location), lines, date, note: note || null });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the count')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Count the shelf" onClose={onClose} width={720}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Enter what is really there for each recipe you counted; leave the rest empty. A shortage comes off the oldest batches and is booked as waste; a surplus goes on the shelf as a batch of its own.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Recipe</th><th style={{ ...th, textAlign: 'right' }}>System says</th><th style={{ ...th, textAlign: 'right' }}>Counted</th><th style={{ ...th, textAlign: 'right' }}>Difference</th></tr></thead>
            <tbody>{rows.map((r) => {
              const v = counted[r.id];
              const diff = v === undefined || v === '' ? null : Number(v) - r.on_shelf;
              return (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.on_shelf, 3)} {r.unit}</td>
                  <td style={{ ...td, textAlign: 'right', width: 140 }}><NumberInput aria-label={`Counted ${r.name}`} min="0" step="any" value={v ?? ''} onChange={(e) => setCounted((c) => ({ ...c, [r.id]: e.target.value }))} /></td>
                  <td style={{ ...td, textAlign: 'right', color: diff == null ? undefined : diff < -0.00005 ? colors.danger : diff > 0.00005 ? colors.success : undefined }}>{diff == null ? '' : `${diff > 0 ? '+' : ''}${num(diff, 3)} ${r.unit}`}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <Field label="Day" htmlFor="pc-date"><TextInput id="pc-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Note (optional)" htmlFor="pc-note"><TextInput id="pc-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <ModalActions onCancel={onClose} submitLabel="Save the count" busy={busy} disabled={!rows.some((r) => counted[r.id] !== undefined && counted[r.id] !== '')} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function MenusPrepared() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loc, setLoc] = useMenusBranch(data?.branches);
  const [modal, setModal] = useState(null);
  const [timers, setTimers] = useState([]);
  const [labels, setLabels] = useState(null);   // lots to print labels for
  const canPrint = hasPermission(user, 'codes.print');
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.preparedFood(loc ? { location_id: loc } : undefined)
      .then((d) => { setData(d); setTimers(d.timers ?? []); if (first.current && d.location_id) { first.current = false; setLoc(String(d.location_id)); } })
      .catch((e) => toast.error(errMsg(e, 'Could not load the prepared food')))
      .finally(() => setLoading(false));
  }, [loc, setLoc]);
  useEffect(() => { load(); }, [load]);

  const dropTimer = async (t) => {
    if (!window.confirm(`Switch off the timer for ${t.recipe}? Nothing is made or used.`)) return;
    try { const res = await menusAPI.cancelBatchTimer(t.id); toast.success(res.message); setTimers(res.timers); } catch (x) { toast.error(errMsg(x, 'Could not switch the timer off'), { duration: 8000 }); }
  };

  const undo = async (r) => {
    const reason = window.prompt(`Undo ${r.number}? The ingredients go back on the shelf. Why? (optional)`, '');
    if (reason === null) return;
    try { const res = await menusAPI.undoPrepared(r.id, reason || null); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not undo the batch'), { duration: 8000 }); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="prepared food" /></div></AdminLayout>;

  const shelf = (data?.recipes ?? []).filter((r) => r.on_shelf > 0);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="prepared">
        <HubHeader title="Prepared food" description="Food cooked ahead from a recipe of its own. A batch uses the ingredients, puts what came out on the shelf and is booked to Prepared Food Inventory." />
        {data && !data.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 198_menus_prepared_food.sql first (and 194 to 197 before it): until then batches can not be made.</p>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
          <div style={{ minWidth: 200, maxWidth: 260 }}>
            <SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)}>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>At {b.name}</option>)}</SelectInput>
          </div>
          {canWrite && data?.ready && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'make' })}>Make a batch</button>}
          {canWrite && data?.ready && data.timers_ready && <button type="button" style={btnGhost} onClick={() => setModal({ kind: 'timer' })}>Start a timer</button>}
          {canWrite && data?.ready && data.counts_ready && <button type="button" style={btnGhost} onClick={() => setModal({ kind: 'count' })}>Count the shelf</button>}
        </div>

        {timers.length > 0 && (
          <section aria-label="On the stove" style={{ margin: '0 0 16px' }} data-testid="timers">
            <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>On the stove · {timers.length}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
              {timers.map((t) => <TimerCard key={t.id} t={t} canWrite={canWrite} onMake={(x) => setModal({ kind: 'make', timer: x })} onCancel={dropTimer} />)}
            </div>
          </section>
        )}
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>On the shelf</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }} data-testid="prepared-shelf">
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !shelf.length ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing prepared is on the shelf. Make a batch of a recipe of its own (add one under Menus, Recipes, Recipes of their own).</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Recipe</th><th style={{ ...th, textAlign: 'right' }}>On the shelf</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Batches</th><th style={th} /></tr></thead>
              <tbody>{shelf.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.name}</strong></td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.on_shelf, 3)} {r.unit}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.value)}</td>
                  <td style={td}>{r.lots.map((l) => <div key={l.id}>{l.lot_no} · {num(l.qty_left, 3)} {r.unit} left · made {l.made_on}{l.expiry_date ? ` · use by ${l.expiry_date}` : ''}{canPrint && <button type="button" aria-label={`Print the label for ${l.lot_no}`} style={{ ...small, marginLeft: 8 }} onClick={() => setLabels([{ type: 'prep_lot', id: l.id, label: `${r.name} · ${l.lot_no}` }])}>Label</button>}</div>)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{canWrite && data.waste_ready && <button type="button" style={small} onClick={() => setModal({ kind: 'waste', recipe: r })}>Write off</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <h2 style={{ margin: '26px 0 8px', fontSize: '1rem', fontWeight: 800 }}>Batches made</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }} data-testid="prepared-runs">
          {!data?.runs?.length ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No batches yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Batch</th><th style={th}>Recipe</th><th style={th}>Made by</th><th style={{ ...th, textAlign: 'right' }}>Planned → made</th><th style={{ ...th, textAlign: 'right' }}>Minutes (expected / took)</th><th style={{ ...th, textAlign: 'right' }}>Cost</th><th style={th} /></tr></thead>
              <tbody>{data.runs.map((r) => (
                <tr key={r.id} style={r.status === 'posted' ? undefined : { opacity: 0.55 }}>
                  <td style={td}><strong>{r.number}</strong><div style={{ color: colors.textMuted }}>{r.date}{r.status !== 'posted' ? ` · ${r.status}` : ''}</div></td>
                  <td style={td}>{r.recipe}{r.note && <div style={{ color: colors.textMuted }}>{r.note}</div>}</td>
                  <td style={td}>{r.chef ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.planned, 3)} → {num(r.qty, 3)} {r.unit}{r.servings && <div style={{ color: colors.textMuted }}>Cut into {r.servings}</div>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.expected_minutes ?? '—'} / {r.actual_minutes ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.cost)}<div style={{ color: colors.textMuted }}>{num(r.unit_cost, 4)} per {r.unit}</div></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{canWrite && r.can_cancel && <button type="button" style={small} onClick={() => undo(r)}>Undo</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {data?.counts?.length > 0 && (
          <>
            <h2 style={{ margin: '26px 0 8px', fontSize: '1rem', fontWeight: 800 }}>Counts</h2>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }} data-testid="prepared-counts">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Count</th><th style={th}>Day</th><th style={{ ...th, textAlign: 'right' }}>Recipes</th><th style={{ ...th, textAlign: 'right' }}>Short</th><th style={{ ...th, textAlign: 'right' }}>Found</th><th style={{ ...th, textAlign: 'right' }}>Worth</th></tr></thead>
                <tbody>{data.counts.map((c) => (
                  <tr key={c.id}>
                    <td style={td}><strong>{c.number}</strong>{c.note && <div style={{ color: colors.textMuted }}>{c.note}</div>}</td>
                    <td style={td}>{c.date}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{c.recipes}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{c.short}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{c.found}</td>
                    <td style={{ ...td, textAlign: 'right', color: c.value_change < 0 ? colors.danger : undefined }}>{num(c.value_change)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
        {data?.ready && <PreparedReports location={loc || String(data.location_id)} recipes={data.recipes} />}
      </div>
      {modal?.kind === 'make' && data && <MakeBatch data={data} location={loc || String(data.location_id)} initial={modal.timer ?? null} onClose={() => setModal(null)} onDone={(lotId) => { setModal(null); load(); if (lotId && canPrint) toast((t) => (<span>The batch is on the shelf. <button type="button" onClick={() => { toast.dismiss(t.id); setLabels([{ type: 'prep_lot', id: lotId, label: 'The batch you made' }]); }} style={{ fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}>Print its label</button></span>), { duration: 12000 }); }} />}
      {modal?.kind === 'timer' && data && <StartTimer data={data} location={loc || String(data.location_id)} onClose={() => setModal(null)} onDone={(list) => { setModal(null); setTimers(list); }} />}
      {labels && <LabelPrint items={labels} onClose={() => setLabels(null)} />}
      {modal?.kind === 'waste' && data && <WriteOff data={data} location={loc || String(data.location_id)} recipe={modal.recipe} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === 'count' && data && <CountShelf data={data} location={loc || String(data.location_id)} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </AdminLayout>
  );
}
