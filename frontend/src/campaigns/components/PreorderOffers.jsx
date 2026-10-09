import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import preordersAPI from '../../_shared/api/preorders';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import { Field, TextInput, SelectInput, CheckboxRow } from '../../core/components/admin/ui/Form';

/**
 * A campaign's preorder offers: "we sell this before it is here". Each is one item with a limit (all branches together), a closing date, expected dates
 * and terms. Which branches take preorders for it is set here too. Customers pay in full when they order; delivery follows as stock arrives.
 */
/**
 * The offer's terms. `variants` is what the offer can be made on: one option (fixed) or several (a dropdown). `taken` is a Set of variant ids that already have an offer.
 * Used here (from the campaign's featured items) and inside an item's row in the page builder.
 */
export function OfferFields({ campaignId, variants, taken, onSaved, onCancel, hasMax = true }) {
  const open = variants.filter((v) => !taken.has(v.id));
  const [f, setF] = useState({ variant_id: open[0]?.id ?? '', limit_total: '', max_per_customer: '', closes_at: '', expected_from: '', expected_until: '', terms: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target?.value ?? e }));
  const save = async () => {
    setBusy(true);
    try { await preordersAPI.saveOffer(campaignId, { ...f, limit_total: f.limit_total || null, max_per_customer: hasMax ? (f.max_per_customer || null) : undefined, closes_at: f.closes_at || null, expected_from: f.expected_from || null, expected_until: f.expected_until || null }); toast.success('Offer added.'); onSaved(); }
    catch (e) { toast.error(errMsg(e, 'Could not save the offer'), { duration: 7000 }); } finally { setBusy(false); }
  };
  if (open.length === 0) return <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Every option here already has an offer.</p>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {open.length > 1 && (
        <Field label="Option"><SelectInput value={f.variant_id} onChange={set('variant_id')}>{open.map((v) => <option key={v.id} value={v.id}>{v.name || v.sku || `Option ${v.id}`}</option>)}</SelectInput></Field>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        <Field label="Places (all branches)" hint="Leave empty for no limit."><TextInput type="number" min="1" value={f.limit_total} onChange={set('limit_total')} /></Field>
        {hasMax && <Field label="Most per customer" hint="Leave empty for no limit. A guest is matched by email."><TextInput type="number" min="1" value={f.max_per_customer} onChange={set('max_per_customer')} /></Field>}
        <Field label="Closes (optional)" hint="Empty = when the campaign ends."><TextInput type="datetime-local" value={f.closes_at} onChange={set('closes_at')} /></Field>
        <Field label="Expected from"><TextInput type="date" value={f.expected_from} onChange={set('expected_from')} /></Field>
        <Field label="Expected by"><TextInput type="date" value={f.expected_until} onChange={set('expected_until')} /></Field>
      </div>
      <Field label="Terms shown to the customer"><TextInput value={f.terms} onChange={set('terms')} placeholder="Delivery starts when the stock arrives. Paid in full now." /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="button" style={btnPrimary} onClick={save} disabled={busy || !f.variant_id}>{busy ? 'Saving…' : 'Add offer'}</button>
      </div>
    </div>
  );
}

/** A new offer starts from what this campaign features: an option on its own, or one option of a product featured whole. (Feature the item on the page first.) */
function NewOffer({ campaignId, featured, taken, onSaved, onCancel, hasMax }) {
  const [pick, setPick] = useState(null);       // { label, variants: [{ id, name }] }
  const choose = async (f) => {
    const label = f.variant ? `${f.name} · ${f.variant}` : f.name;
    if (f.variant_id > 0) { setPick({ label, variants: [{ id: f.variant_id, name: f.variant }] }); return; }
    try { const v = await preordersAPI.variants(f.product_id); setPick({ label, variants: v.data }); } catch (e) { toast.error(errMsg(e, 'Could not load the options')); }
  };
  return (
    <div style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
      {!pick ? (
        <>
          <strong style={{ fontSize: '0.84rem' }}>Which featured item?</strong>
          {featured.length === 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Nothing is featured yet. Add the item (or the option) to a products section on the page above, save the page, then offer it here.</p>}
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {featured.map((f) => {
              const done = f.variant_id > 0 && taken.has(f.variant_id);
              return <button key={`${f.product_id}:${f.variant_id}`} type="button" disabled={done} onClick={() => choose(f)} style={{ ...btnGhost, justifyContent: 'flex-start', textAlign: 'left', padding: '6px 10px', opacity: done ? 0.5 : 1 }}>{f.name ?? `Product #${f.product_id}`}{f.variant && <span style={{ marginLeft: 6, color: colors.textMuted }}>· {f.variant}</span>}{done && <span style={{ marginLeft: 8, color: colors.textFaint }}>(already offered)</span>}</button>;
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onCancel}>Cancel</button></div>
        </>
      ) : (
        <>
          <strong style={{ fontSize: '0.85rem' }}>{pick.label}</strong>
          <OfferFields campaignId={campaignId} variants={pick.variants} taken={taken} onSaved={onSaved} onCancel={onCancel} hasMax={hasMax} />
        </>
      )}
    </div>
  );
}

function OfferRow({ campaignId, o, branches, canEdit, onChanged, onPage, hasMax }) {
  const [on, setOn] = useState(new Set(o.branches ?? []));
  const [max, setMax] = useState(null);   // the per-customer maximum while it is being changed
  const saveMax = async () => {
    try { await preordersAPI.updateOffer(campaignId, o.id, { max_per_customer: max === '' ? null : Number(max) }); setMax(null); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not change it'), { duration: 7000 }); }
  };
  useEffect(() => setOn(new Set(o.branches ?? [])), [o.branches]);

  const flag = async (loc, v) => {
    try { await preordersAPI.setBranchFlag({ variant_id: o.variant_id, location_id: loc, enabled: v }); setOn((s) => { const n = new Set(s); if (v) n.add(loc); else n.delete(loc); return n; }); }
    catch (e) { toast.error(errMsg(e, 'Could not change it')); }
  };
  const toggle = async () => { try { await preordersAPI.updateOffer(campaignId, o.id, { is_active: !o.is_active }); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not change it')); } };
  const remove = async () => {
    if (!window.confirm('Remove this offer?')) return;
    try { await preordersAPI.deleteOffer(campaignId, o.id); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); }
  };

  return (
    <div style={{ ...card, padding: 14, display: 'grid', gap: 8, opacity: o.is_active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem' }}>{o.item}{o.option && <span style={{ fontWeight: 500, color: colors.textMuted }}> · {o.option}</span>}</strong>
        <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>
          {o.limit_total ? `${o.taken} of ${o.limit_total} taken (${o.places_left} left)` : `${o.taken} taken, no limit`}
          {o.expected_until ? ` · expected by ${o.expected_until}` : ''}{o.closes_at ? ` · closes ${o.closes_at.replace('T', ' ')}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {canEdit && <button type="button" style={btnGhost} onClick={toggle}>{o.is_active ? 'Stop new preorders' : 'Switch on'}</button>}
        {canEdit && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove} aria-label="Remove offer"><Trash2 size={13} /></button>}
      </div>
      {o.terms && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>{o.terms}</p>}
      {hasMax && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.76rem', color: colors.textMuted }}>
          {max === null ? (
            <>
              <span>{o.max_per_customer ? `Most ${o.max_per_customer} per customer.` : 'No limit per customer.'}</span>
              {canEdit && <button type="button" style={{ ...btnGhost, padding: '2px 9px', fontSize: '0.74rem' }} onClick={() => setMax(o.max_per_customer ?? '')}>Change</button>}
            </>
          ) : (
            <>
              <label htmlFor={`max-${o.id}`}>Most per customer</label>
              <input id={`max-${o.id}`} type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} placeholder="No limit" style={{ width: 90, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
              <button type="button" style={{ ...btnPrimary, padding: '3px 12px', fontSize: '0.74rem' }} onClick={saveMax}>Save</button>
              <button type="button" style={{ ...btnGhost, padding: '2px 9px', fontSize: '0.74rem' }} onClick={() => setMax(null)}>Cancel</button>
            </>
          )}
        </div>
      )}
      {!onPage && <p style={{ margin: 0, fontSize: '0.76rem', color: colors.warningText }}>This option is not featured on the campaign page. It still works from its product page; feature it above so the campaign shows it.</p>}
      {branches.length > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase' }}>Takes preorders at</span>
          {branches.map((b) => <CheckboxRow key={b.id} checked={on.has(b.id)} disabled={!canEdit} onChange={(v) => flag(b.id, v)} label={b.name} />)}
        </div>
      )}
      {on.size === 0 && <p style={{ margin: 0, fontSize: '0.76rem', color: colors.warningText }}>No branch takes preorders for this yet, so customers will not see it.</p>}
    </div>
  );
}

export default function PreorderOffers({ campaignId, canEdit, featured = [], refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => preordersAPI.offers(campaignId).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the offers'))), [campaignId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data) return null;
  if (!data.ready) return <p style={{ fontSize: '0.8rem', color: colors.textMuted }}>Run database script 103_preorders.sql to switch preorders on.</p>;
  const taken = new Set(data.data.map((o) => o.variant_id));
  const wholeProducts = new Set(featured.filter((f) => !f.variant_id).map((f) => f.product_id));
  const onPage = (o) => wholeProducts.has(o.product_id) || featured.some((f) => f.variant_id === o.variant_id);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {data.data.length === 0 && !adding && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>No preorder offers. Feature an option on the page, then offer it here (or from its row in the page builder).</p>}
      {data.data.map((o) => <OfferRow key={o.id} campaignId={campaignId} o={o} branches={data.branches} canEdit={canEdit} onChanged={load} onPage={onPage(o)} hasMax={data.has_max} />)}
      {adding && <NewOffer campaignId={campaignId} featured={featured} taken={taken} hasMax={data.has_max} onSaved={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}
      {canEdit && !adding && <div><button type="button" style={btnGhost} onClick={() => setAdding(true)}><Plus size={13} /> Add a preorder offer</button></div>}
    </div>
  );
}
