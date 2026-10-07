import { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import cataloguesAPI from '../../../_shared/api/catalogues';
import { loadCompany } from '../../../_shared/lib/useCompany';
import { downloadCataloguePdf } from '../../lib/catalogue/build';

/**
 * "Download brochure" on a product, hamper or auction page: a brochure of this one item. It asks the server whether the settings allow it
 * (the shop switch is on, the item has not switched its own brochure off, and the customer may see the item) and shows only when they do.
 */
export default function ItemBrochureButton({ type, id, style }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let on = true;
    if (!id) return undefined;
    cataloguesAPI.status({ type, id }).then((r) => on && setOk(Boolean(r.item?.available))).catch(() => on && setOk(false));

    return () => { on = false; };
  }, [type, id]);
  if (!ok) return null;

  const go = async () => {
    setBusy({ stage: 'Starting', done: 0, total: 0 });
    try { await downloadCataloguePdf({ loadSlice: () => cataloguesAPI.itemBrochure(type, id), company: await loadCompany(), onProgress: setBusy }); } catch (e) { toast.error(e?.response?.status === 403 ? 'A brochure is not available for this item.' : 'Could not make the brochure. Please try again.'); } finally { setBusy(null); }
  };

  return (
    <button type="button" onClick={go} disabled={Boolean(busy)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, fontSize: '0.84rem', fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer', border: '1.5px solid var(--color-primary-500)', background: 'transparent', color: 'var(--color-primary-500)', opacity: busy ? 0.65 : 1, ...style }}>
      <FileDown size={16} /> {busy ? 'Making your brochure…' : 'Download brochure'}
    </button>
  );
}
