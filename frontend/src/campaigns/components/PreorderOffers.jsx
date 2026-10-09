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
export function OfferFields({ campaignId, variants, taken, onSaved, onCancel, hasMax = true, hasDeposit = false }) {
  const open = variants.filter((v) => !taken.has(v.id));
  const [f, setF] = useState({ variant_id: open[0]?.id ?? '', limit_total: '', max_per_customer: '', deposit_percent: '', closes_at: '', expected_from: '', expected_until: '', terms: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target?.value ?? e }));
  const save = async () => {
    setBusy(true);
    try { await preordersAPI.saveOffer(campaignId, { ...f, limit_total: f.limit_total || null, max_per_customer: hasMax ? (f.max_per_customer || null) : undefined, deposit_percent: hasDeposit ? (f.deposit_percent || null) : undefined, closes_at: f.closes_at || null, expected_from: f.expected_from || null, expected_until: f.expected_until || null }); toast.success('Offer added.'); onSaved(); }
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
        {hasDeposit && <Field label="Deposit % (optional)" hint="Empty = full payment. Otherwise a signed-in customer may pay this share now (1 to 90) and the rest on delivery or online."><TextInput type="number" min="1" max="90" value={f.deposit_percent} onChange={set('deposit_percent')} /></Field>}
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
function NewOffer({ campaignId, featured, taken, onSaved, onCancel, hasMax, hasDeposit }) {
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
          <OfferFields campaignId={campaignId} variants={pick.variants} taken={taken} onSaved={onSaved} onCancel={onCancel} hasMax={hasMax} hasDeposit={hasDeposit} />
        </>
      )}
    </div>
  );
}

const qtyText = (n) => (Math.round(Number(n) * 100) / 100).toString();

/**
 * Where the stock for an offer is coming from: the purchase orders linked to it. What is still to arrive and when are read from the purchase orders, and that date is
 * the one customers are given. Warns when what is owed is more than what is in stock and on order.
 */
function SupplyLine({ campaignId, o, canEdit, onChanged }) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = o.supply;

  const show = async () => {
    setOpen(true);
    try { setCands((await preordersAPI.supply(campaignId, o.id)).candidates); } catch (e) { toast.error(errMsg(e, 'Could not load the purchase orders')); setOpen(false); }
  };
  const link = async (voucherId) => {
    setBusy(true);
    try { const r = await preordersAPI.linkSupply(campaignId, o.id, voucherId); toast.success(r.message); setOpen(false); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not link it'), { duration: 7000 }); } finally { setBusy(false); }
  };
  const unlink = async (voucherId) => {
    setBusy(true);
    try { await preordersAPI.unlinkSupply(campaignId, o.id, voucherId); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not unlink it')); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 6, fontSize: '0.76rem', color: colors.textMuted }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span><strong style={{ color: colors.text }}>Stock coming in:</strong> {s.orders.length ? `${qtyText(s.incoming)} still to arrive` : 'no purchase order linked'}{s.date ? ` · customers are told ${s.date}` : ''}</span>
        {s.orders.map((p) => (
          <span key={p.voucher_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--line)' }}>
            {p.number} · {qtyText(p.incoming)} of {qtyText(p.ordered)}{p.due_date ? ` · due ${p.due_date}` : ' · no due date'}
            {canEdit && <button type="button" aria-label={`Unlink ${p.number}`} disabled={busy} onClick={() => unlink(p.voucher_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, padding: 0, fontFamily: 'inherit' }}>×</button>}
          </span>
        ))}
        {canEdit && !open && <button type="button" style={{ ...btnGhost, padding: '2px 9px', fontSize: '0.74rem' }} onClick={show}>Link a purchase order</button>}
      </div>
      {s.short > 0 && <div style={{ color: colors.warningText }}>Short by {qtyText(s.short)}: {qtyText(s.owed)} owed to customers, {qtyText(s.stock)} in stock, {qtyText(s.incoming)} on order.</div>}
      {open && (
        <div style={{ display: 'grid', gap: 6, padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
          {cands === null ? <span>Loading…</span> : cands.length === 0 ? <span>No open purchase order has this item still to arrive. Make the purchase order in Books first.</span> : cands.map((c) => (
            <div key={c.voucher_id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{c.number}</strong><span>{c.supplier ?? 'supplier not named'} · {qtyText(c.incoming)} still to arrive{c.due_date ? ` · due ${c.due_date}` : ' · no due date'}</span>
              <span style={{ flex: 1 }} /><button type="button" style={{ ...btnPrimary, padding: '3px 12px', fontSize: '0.74rem' }} disabled={busy} onClick={() => link(c.voucher_id)}>Link</button>
            </div>
          ))}
          <div><button type="button" style={{ ...btnGhost, padding: '2px 9px', fontSize: '0.74rem' }} onClick={() => setOpen(false)}>Close</button></div>
        </div>
      )}
    </div>
  );
}

function OfferRow({ campaignId, o, branches, canEdit, onChanged, onPage, hasMax, hasDeposit, hasSupply }) {
  const [on, setOn] = useState(new Set(o.branches ?? []));
  const [max, setMax] = useState(null);   // the per-customer maximum while it is being changed
  const [dep, setDep] = useState(null);   // the deposit percentage while it is being changed
  const saveDep = async () => {
    try { await preordersAPI.updateOffer(campaignId, o.id, { deposit_percent: dep === '' ? null : Number(dep) }); setDep(null); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not change it'), { duration: 7000 }); }
  };
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
      {hasSupply && o.supply && <SupplyLine campaignId={campaignId} o={o} canEdit={canEdit} onChanged={onChanged} />}
      {hasDeposit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.76rem', color: colors.textMuted }}>
          {dep === null ? (
            <>
              <span>{o.deposit_percent ? `Deposit of ${o.deposit_percent}% allowed (signed-in customers).` : 'Full payment only.'}</span>
              {canEdit && <button type="button" style={{ ...btnGhost, padding: '2px 9px', fontSize: '0.74rem' }} onClick={() => setDep(o.deposit_percent ?? '')}>Change</button>}
            </>
          ) : (
            <>
              <label htmlFor={`dep-${o.id}`}>Deposit %</label>
              <input id={`dep-${o.id}`} type="number" min="1" max="90" value={dep} onChange={(e) => setDep(e.target.value)} placeholder="Full payment" style={{ width: 100, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
              <button type="button" style={{ ...btnPrimary, padding: '3px 12px', fontSize: '0.74rem' }} onClick={saveDep}>Save</button>
              <button type="button" style={{ ...btnGhost, padding: '2px 9px', fontSize: '0.74rem' }} onClick={() => setDep(null)}>Cancel</button>
            </>
          )}
        </div>
      )}
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
      {data.data.map((o) => <OfferRow key={o.id} campaignId={campaignId} o={o} branches={data.branches} canEdit={canEdit} onChanged={load} onPage={onPage(o)} hasDeposit={data.has_deposit} hasMax={data.has_max} hasSupply={data.has_supply} />)}
      {adding && <NewOffer campaignId={campaignId} featured={featured} taken={taken} hasMax={data.has_max} hasDeposit={data.has_deposit} onSaved={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}
      {canEdit && !adding && <div><button type="button" style={btnGhost} onClick={() => setAdding(true)}><Plus size={13} /> Add a preorder offer</button></div>}
    </div>
  );
}
