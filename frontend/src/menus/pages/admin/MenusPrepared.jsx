import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { useMenusBranch } from '../../lib/menusBranch';

/**
 * Menus → Prepared food: food cooked ahead from a recipe of its own (ugali, a stew base). Making a batch uses the ingredients the chef really used, puts what came out on the shelf and books the
 * value to Prepared Food Inventory. The shelf shows what is left of each; a batch can be undone while all of it is still there.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));
const today = () => new Date().toISOString().slice(0, 10);

function MakeBatch({ data, location, onClose, onDone }) {
  const [recipeId, setRecipeId] = useState('');
  const [size, setSize] = useState('');
  const [preview, setPreview] = useState(null);
  const [used, setUsed] = useState({});
  const [output, setOutput] = useState('');
  const [chef, setChef] = useState('');
  const [started, setStarted] = useState('');
  const [finished, setFinished] = useState('');
  const [date, setDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
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
        started_at: started || null, finished_at: finished || null, note: note || null, client_key: key.current, inputs,
      });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not make the batch')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Make a batch" onClose={onClose} width={820}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Recipe" htmlFor="pb-recipe">
              <SelectInput id="pb-recipe" required value={recipeId} onChange={(e) => { setRecipeId(e.target.value); setSize(''); setOutput(''); }}>
                <option value="">Choose…</option>
                {data.recipes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.yield_label} a batch)</option>)}
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
          <Field label="Note (optional)" htmlFor="pb-note"><TextInput id="pb-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Make the batch" busy={busy} disabled={!recipeId || !(Number(size) > 0)} />
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
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.preparedFood(loc ? { location_id: loc } : undefined)
      .then((d) => { setData(d); if (first.current && d.location_id) { first.current = false; setLoc(String(d.location_id)); } })
      .catch((e) => toast.error(errMsg(e, 'Could not load the prepared food')))
      .finally(() => setLoading(false));
  }, [loc, setLoc]);
  useEffect(() => { load(); }, [load]);

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
          {canWrite && data?.ready && <button type="button" style={btnPrimary} onClick={() => setModal(true)}>Make a batch</button>}
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>On the shelf</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }} data-testid="prepared-shelf">
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !shelf.length ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing prepared is on the shelf. Make a batch of a recipe of its own (add one under Menus, Recipes, Recipes of their own).</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Recipe</th><th style={{ ...th, textAlign: 'right' }}>On the shelf</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Batches</th></tr></thead>
              <tbody>{shelf.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.name}</strong></td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.on_shelf, 3)} {r.unit}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.value)}</td>
                  <td style={td}>{r.lots.map((l) => <div key={l.id}>{l.lot_no} · {num(l.qty_left, 3)} {r.unit} left · made {l.made_on}{l.expiry_date ? ` · use by ${l.expiry_date}` : ''}</div>)}</td>
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
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.planned, 3)} → {num(r.qty, 3)} {r.unit}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.expected_minutes ?? '—'} / {r.actual_minutes ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.cost)}<div style={{ color: colors.textMuted }}>{num(r.unit_cost, 4)} per {r.unit}</div></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{canWrite && r.can_cancel && <button type="button" style={small} onClick={() => undo(r)}>Undo</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal && data && <MakeBatch data={data} location={loc || String(data.location_id)} onClose={() => setModal(false)} onDone={() => { setModal(false); load(); }} />}
    </AdminLayout>
  );
}
