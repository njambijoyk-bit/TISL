import { useState } from 'react';
import { Pin } from 'lucide-react';
import toast from 'react-hot-toast';
import pinsAPI from '../../_shared/api/pins';
import useAuthStore from '../../_shared/store/authStore';
import { isModuleActive } from '../../_shared/navigation/modules';
import { CAMPAIGN_ROLES } from '../../_shared/lib/roles';
import { errMsg } from '../../_shared/store/helpers/apiState';

/**
 * "Create pin from this product": makes a featured-item pin at once, tagged with the product's category. It does not wait for the product form to be saved
 * (the pin reads the saved product live), so it needs a product that already exists. Only shown when Campaigns is licensed and on, and to staff who may make pins.
 */
export default function ProductPinButton({ productId, name, categoryName, hint }) {
  const role = useAuthStore((s) => s.user?.role);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(0);
  if (!isModuleActive('campaigns') || !CAMPAIGN_ROLES.includes(role)) return null;

  const create = async () => {
    setBusy(true);
    try {
      await pinsAPI.create({ kind: 'item', item_type: 'product', item_id: productId, title: name || undefined, tags: categoryName ? [categoryName] : undefined });
      setMade((n) => n + 1);
      toast.success(categoryName ? `Pin created, tagged "${categoryName}"` : 'Pin created');
    } catch (e) { toast.error(errMsg(e, 'Could not create the pin')); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 6, padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--border-color, rgba(148,163,184,0.35))' }}>
      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>Pin</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Put this product on the Discover wall as a pin{categoryName ? <>, tagged <strong>#{categoryName}</strong></> : ''}. This happens right now; you do not need to save the product first.</div>
      <div>
        <button type="button" onClick={create} disabled={busy || !productId} title={!productId ? 'Save the product first' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700, border: 'none', fontFamily: 'inherit', cursor: busy || !productId ? 'not-allowed' : 'pointer', background: 'var(--color-primary-500)', color: '#fff', opacity: busy || !productId ? 0.55 : 1 }}>
          <Pin size={14} /> {busy ? 'Creating…' : 'Create pin from this product'}
        </button>
      </div>
      {!productId && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{hint ?? 'A pin points at the saved product, so create the product first. Then come back here.'}</div>}
      {made > 0 && <div style={{ fontSize: '0.74rem', color: 'var(--status-success, #15803d)' }}>{made === 1 ? 'Pin made.' : `${made} pins made.`} Find it in Campaigns, Pins. Clicking again makes another one.</div>}
    </div>
  );
}
