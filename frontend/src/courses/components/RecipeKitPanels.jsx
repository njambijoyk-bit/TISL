import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChefHat, PackageOpen, Plus, Trash2 } from 'lucide-react';
import Modal from '../../core/components/admin/ui/Modal';
import { TextInput } from '../../core/components/admin/ui/Form';
import VariantPicker from '../../core/components/admin/pickers/VariantPicker';
import coursesAPI from '../../_shared/api/courses';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import Pill from './Pill';

/** Copy a recipe the kitchen made available into a new draft recipe offering (or into an existing offering as a lesson). */
export function RecipePicker({ offeringId, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => coursesAPI.publishableRecipes(q).then(setD).catch((e) => { toast.error(errMsg(e, 'Could not load recipes')); setD({ ready: true, recipes: [] }); }), 250);
    return () => clearTimeout(t);
  }, [q]);
  const copy = async (r) => {
    setBusy(true);
    try { const res = await coursesAPI.publishRecipe(r.id, offeringId); toast.success(res.message); onDone(res); } catch (e) { toast.error(errMsg(e, 'Could not copy the recipe'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Copy a recipe from Menus" onClose={onClose} width={560}>
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.84rem' }}>Only recipes the kitchen has set to "May be shown on the website and in courses" are listed. The copy is text taken now; it does not change when the kitchen changes the recipe.</p>
        <TextInput aria-label="Search recipes" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} />
        {!d && <p>Loading…</p>}
        {d && !d.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 161_courses_recipes_kits.sql first.</p>}
        {d?.ready && d.recipes.length === 0 && <p style={{ color: colors.textMuted }}>No recipe is available to copy.</p>}
        {d?.recipes.map((r) => (
          <div key={r.id} data-recipe={r.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
            <span style={{ flex: 1, minWidth: 160 }}><strong>{r.name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{[r.prep_minutes && `prep ${r.prep_minutes} min`, r.cook_minutes && `cook ${r.cook_minutes} min`].filter(Boolean).join(' · ')}</span></span>
            {r.published_in.length > 0 && <Pill tone="neutral">Already copied</Pill>}
            <button type="button" style={btnPrimary} disabled={busy} onClick={() => copy(r)}><ChefHat size={13} aria-hidden="true" /> Copy</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** The stock items each student is handed, and who has had theirs. */
export function KitPanel({ offering }) {
  const [d, setD] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => coursesAPI.kit(offering.id).then((r) => { setD(r); setItems(r.items); }).catch((e) => { toast.error(errMsg(e, 'Could not load the kit')); setD({ ready: true, items: [], handouts: [] }); }), [offering.id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setBusy(true); try { const r = await fn(); toast.success(r.message); setD((x) => ({ ...x, items: r.items, handouts: r.handouts })); setItems(r.items); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); } };
  const set = (i, k, v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = () => run(() => coursesAPI.saveKit(offering.id, items.map((x) => ({ variant_id: x.variant_id, quantity: Number(x.quantity), note: x.note || '' }))));

  if (!d) return <p>Loading…</p>;
  if (!d.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 161_courses_recipes_kits.sql to switch on cooking kits.</p>;
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="kit-panel">
      <section style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
        <strong><PackageOpen size={16} aria-hidden="true" /> What is in each student's kit</strong>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>Charge for the kit with a "Materials or kit" fee in Fees and payments. Handing a kit over takes these items out of stock.</p>
        {items.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>No kit.</p>}
        {items.map((x, i) => (
          <div key={x.variant_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 160 }}><strong>{x.name}</strong>{x.sku ? <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}> {x.sku}</span> : null}</span>
            <TextInput aria-label={`Quantity of ${x.name}`} inputMode="decimal" value={x.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} style={{ width: 90 }} />
            <TextInput aria-label={`Note for ${x.name}`} placeholder="Note" maxLength={160} value={x.note ?? ''} onChange={(e) => set(i, 'note', e.target.value)} style={{ width: 180 }} />
            <button type="button" aria-label={`Remove ${x.name}`} style={{ ...btnGhost, color: colors.danger }} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={13} aria-hidden="true" /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240, flex: 1 }}><VariantPicker onPick={(r) => setItems((xs) => (xs.some((x) => x.variant_id === r.variant_id) ? xs : [...xs, { variant_id: r.variant_id, name: r.product, sku: r.sku, quantity: 1, note: '' }]))} placeholder="Add a stock item" /></div>
          <button type="button" style={btnPrimary} disabled={busy} onClick={save}><Plus size={13} aria-hidden="true" /> Save kit</button>
        </div>
      </section>
      <section style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
        <strong>Hand-out</strong>
        {d.handouts.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>No enrolled students.</p>}
        {d.handouts.map((h) => (
          <div key={h.enrolment_id} data-handout={h.student} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
            <span style={{ flex: 1, minWidth: 180 }}><strong>{h.student}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{h.number}</span></span>
            {h.balance > 0.009 && <Pill tone="danger">Owes {Number(h.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Pill>}
            {h.stock_note && <Pill tone="warn">{h.stock_note}</Pill>}
            {h.handed_at ? <Pill tone="ok">Handed over {new Date(h.handed_at).toLocaleDateString()}</Pill>
              : <button type="button" style={btnGhost} disabled={busy || d.items.length === 0} onClick={() => run(() => coursesAPI.handOutKit(offering.id, h.enrolment_id))}>Hand over the kit</button>}
          </div>
        ))}
      </section>
    </div>
  );
}
