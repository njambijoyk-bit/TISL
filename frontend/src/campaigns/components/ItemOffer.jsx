import { useState } from 'react';
import { Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import preordersAPI from '../../_shared/api/preorders';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../_shared/theme/tokens';
import { OfferFields } from './PreorderOffers';

/**
 * The pre-order panel inside a featured item's row: what is already offered on it, and "Offer as pre-order" for an option (or, for a product featured whole,
 * for one of its options). It needs the page saved first, because the server only lets you offer what the campaign page already features.
 * `offers` is what /preorder-offers returned: { ready, data: [...] }.
 */
export default function ItemOffer({ campaignId, it, r, saved, offers, hampers, canEdit, onChanged }) {
  const [form, setForm] = useState(null);           // the options an offer can be made on, once the form is open
  if (it.item_type === 'hamper') return <HamperParts campaignId={campaignId} it={it} saved={saved} offers={offers} hampers={hampers} canEdit={canEdit} onChanged={onChanged} form={form} setForm={setForm} />;
  if (it.item_type !== 'product' || !offers?.ready) return null;

  const mine = offers.data.filter((o) => (it.variant_id > 0 ? o.variant_id === it.variant_id : o.product_id === it.item_id));
  const taken = new Set(offers.data.map((o) => o.variant_id));

  const open = async () => {
    if (it.variant_id > 0) { setForm([{ id: it.variant_id, name: r?.variant }]); return; }
    try { setForm((await preordersAPI.variants(it.item_id)).data); } catch (e) { toast.error(errMsg(e, 'Could not load the options')); }
  };

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Zap size={13} style={{ color: colors.textFaint }} />
        {mine.length === 0 && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>No pre-order offer.</span>}
        {mine.map((o) => (
          <span key={o.id} style={{ fontSize: '0.74rem', padding: '2px 9px', borderRadius: 999, border: '1px solid var(--line)', opacity: o.is_active ? 1 : 0.6 }}>
            Pre-order{o.option ? ` · ${o.option}` : ''} · {o.limit_total ? `${o.taken} of ${o.limit_total} taken` : `${o.taken} taken`}{o.expected_until ? ` · by ${o.expected_until}` : ''}{o.is_active ? '' : ' · stopped'}
          </span>
        ))}
        {canEdit && !form && (saved
          ? <button type="button" style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.74rem' }} onClick={open}>Offer as pre-order</button>
          : <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>Save the page to offer it as a pre-order.</span>)}
      </div>
      {form && <OfferFields campaignId={campaignId} variants={form} taken={taken} hasMax={offers.has_max} onSaved={() => { setForm(null); onChanged(); }} onCancel={() => setForm(null)} />}
    </div>
  );
}

const PART = { stock: ['In stock', 'var(--status-success, #047857)'], offer: ['Pre-order offer', 'var(--color-primary-600)'], none: ['Nothing covers it', 'var(--status-danger, #b91c1c)'] };

/**
 * A hamper is sold before it is here through its parts: every part that is out of stock at the hamper's branch needs a pre-order offer in this campaign.
 * This lists each part with what covers it, and offers the pre-order form for the parts that are not covered yet.
 */
function HamperParts({ campaignId, it, saved, offers, hampers, canEdit, onChanged, form, setForm }) {
  if (!offers?.ready) return null;
  const h = hampers?.data?.find((x) => x.hamper_id === it.item_id);
  if (!saved || !h) return <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: colors.textFaint, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>Save the page to see whether this hamper can be pre-ordered.</div>;
  const uncovered = h.components.filter((c) => c.covered === 'none');
  const taken = new Set(offers.data.map((o) => o.variant_id));
  const label = { buy: 'Every part is in stock: sold normally.', preorder: 'Out-of-stock parts are covered: it shows as a pre-order.', out: 'Not for sale while a part is out of stock and has no offer.' }[h.state];

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Zap size={13} style={{ color: colors.textFaint }} />
        <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{label}</span>
        {h.branch && <span style={{ fontSize: '0.7rem', color: colors.textFaint }}>Stock is counted at {h.branch}.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {h.components.map((c) => (
          <span key={c.variant_id} style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 999, border: '1px solid var(--line)', color: PART[c.covered][1] }}>
            {c.item}{c.option ? ` · ${c.option}` : ''} ×{c.per_hamper} · {PART[c.covered][0]}
          </span>
        ))}
      </div>
      {canEdit && uncovered.length > 0 && !form && (
        <div><button type="button" style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.74rem' }}
          onClick={() => setForm(uncovered.map((c) => ({ id: c.variant_id, name: `${c.item}${c.option ? ` · ${c.option}` : ''}` })))}>Offer the uncovered parts as pre-order</button></div>
      )}
      {form && <OfferFields campaignId={campaignId} variants={form} taken={taken} hasMax={offers.has_max} onSaved={() => { setForm(null); onChanged(); }} onCancel={() => setForm(null)} />}
    </div>
  );
}
