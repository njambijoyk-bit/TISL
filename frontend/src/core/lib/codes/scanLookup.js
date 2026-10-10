import toast from 'react-hot-toast';
import codesAPI from '../../../_shared/api/codes';
import { errMsg } from '../../../_shared/store/helpers/apiState';

/**
 * Turn a scanned or typed code into the one thing it stands for, telling the person when it can not (nothing has the code, it is an old code, two things share it).
 * Returns the match (see CodeCatalogue::shape on the server: type, id, variant_id, product_id, sku, label, pack_units, batch_no…) or null.
 */
export async function scanMatch(code) {
  try {
    const r = await codesAPI.lookup(code);
    if (!r.found) { toast.error(`Nothing has the code ${code}.`); return null; }
    const live = r.matches.filter((m) => !m.retired);
    if (!live.length) { toast(`${code} is an old code of ${r.matches[0].label} (it now has ${r.matches[0].code ?? 'another code'}): counted as that item.`, { duration: 6000, icon: '🏷️' }); return r.matches[0]; }
    if (live.length > 1) toast(`More than one item has the code ${code}: using ${live[0].label}. Give them different codes on the Codes page.`, { duration: 7000, icon: '⚠️' });
    return live[0];
  } catch (e) {
    toast.error(errMsg(e, 'Could not look that code up'));
    return null;
  }
}
