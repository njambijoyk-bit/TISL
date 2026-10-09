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
export default function ItemOffer({ campaignId, it, r, saved, offers, canEdit, onChanged }) {
  const [form, setForm] = useState(null);           // the options an offer can be made on, once the form is open
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
      {form && <OfferFields campaignId={campaignId} variants={form} taken={taken} onSaved={() => { setForm(null); onChanged(); }} onCancel={() => setForm(null)} />}
    </div>
  );
}
