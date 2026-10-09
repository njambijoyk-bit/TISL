import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import preordersAPI from '../../_shared/api/preorders';
import campaignsAPI from '../../_shared/api/campaigns';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import { Field, TextInput, SelectInput, CheckboxRow } from '../../core/components/admin/ui/Form';

/**
 * A campaign's preorder offers: "we sell this before it is here". Each is one item with a limit (all branches together), a closing date, expected dates
 * and terms. Which branches take preorders for it is set here too. Customers pay in full when they order; delivery follows as stock arrives.
 */
function NewOffer({ campaignId, taken, onSaved, onCancel }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [f, setF] = useState({ variant_id: '', limit_total: '', closes_at: '', expected_from: '', expected_until: '', terms: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (product) return undefined;
    let live = true;
    const t = setTimeout(() => campaignsAPI.catalogue('product', q).then((r) => live && setFound(r.data)).catch(() => live && setFound([])), q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, product]);

  const pick = async (r) => {
    setProduct(r);
    try { const v = await preordersAPI.variants(r.id); setVariants(v.data); setF((x) => ({ ...x, variant_id: v.data[0]?.id ?? '' })); } catch (e) { toast.error(errMsg(e, 'Could not load the options')); }
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target?.value ?? e }));
  const save = async () => {
    setBusy(true);
    try { await preordersAPI.saveOffer(campaignId, { ...f, limit_total: f.limit_total || null, closes_at: f.closes_at || null, expected_from: f.expected_from || null, expected_until: f.expected_until || null }); toast.success('Offer added.'); onSaved(); }
    catch (e) { toast.error(errMsg(e, 'Could not save the offer')); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
      {!product ? (
        <>
          <div style={{ position: 'relative' }}><Search size={13} style={{ position: 'absolute', left: 10, top: 12, color: colors.textFaint }} /><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find the item by name or SKU" style={{ paddingLeft: 30 }} autoFocus /></div>
          <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {found.length === 0 && <span style={{ fontSize: '0.76rem', color: colors.textFaint }}>Nothing found.</span>}
            {found.map((r) => <button key={r.key} type="button" onClick={() => pick(r)} style={{ ...btnGhost, justifyContent: 'flex-start', textAlign: 'left', padding: '6px 10px' }}>{r.name}{r.sku && <span style={{ marginLeft: 8, fontFamily: 'monospace', color: colors.textFaint }}>{r.sku}</span>}</button>)}
          </div>
        </>
      ) : (
        <>
          <strong style={{ fontSize: '0.85rem' }}>{product.name}</strong>
          {variants.length > 1 && (
            <Field label="Option"><SelectInput value={f.variant_id} onChange={set('variant_id')}>{variants.map((v) => <option key={v.id} value={v.id} disabled={taken.has(v.id)}>{v.name || v.sku || `Option ${v.id}`}{taken.has(v.id) ? ' (already offered)' : ''}</option>)}</SelectInput></Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
            <Field label="Places (all branches)" hint="Leave empty for no limit."><TextInput type="number" min="1" value={f.limit_total} onChange={set('limit_total')} /></Field>
            <Field label="Closes (optional)" hint="Empty = when the campaign ends."><TextInput type="datetime-local" value={f.closes_at} onChange={set('closes_at')} /></Field>
            <Field label="Expected from"><TextInput type="date" value={f.expected_from} onChange={set('expected_from')} /></Field>
            <Field label="Expected by"><TextInput type="date" value={f.expected_until} onChange={set('expected_until')} /></Field>
          </div>
          <Field label="Terms shown to the customer"><TextInput value={f.terms} onChange={set('terms')} placeholder="Delivery starts when the stock arrives. Paid in full now." /></Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={btnGhost} onClick={onCancel}>Cancel</button>
            <button type="button" style={btnPrimary} onClick={save} disabled={busy || !f.variant_id}>{busy ? 'Saving…' : 'Add offer'}</button>
          </div>
        </>
      )}
    </div>
  );
}

function OfferRow({ campaignId, o, branches, canEdit, onChanged }) {
  const [on, setOn] = useState(new Set(o.branches ?? []));
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

export default function PreorderOffers({ campaignId, canEdit }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => preordersAPI.offers(campaignId).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the offers'))), [campaignId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  if (!data.ready) return <p style={{ fontSize: '0.8rem', color: colors.textMuted }}>Run database script 103_preorders.sql to switch preorders on.</p>;
  const taken = new Set(data.data.map((o) => o.variant_id));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {data.data.length === 0 && !adding && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>No preorder offers. Add one to sell an item before it arrives.</p>}
      {data.data.map((o) => <OfferRow key={o.id} campaignId={campaignId} o={o} branches={data.branches} canEdit={canEdit} onChanged={load} />)}
      {adding && <NewOffer campaignId={campaignId} taken={taken} onSaved={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}
      {canEdit && !adding && <div><button type="button" style={btnGhost} onClick={() => setAdding(true)}><Plus size={13} /> Add a preorder offer</button></div>}
    </div>
  );
}
