import toast from 'react-hot-toast';
import codesAPI from '../../../_shared/api/codes';
import { errMsg } from '../../../_shared/store/helpers/apiState';

/**
 * Turn a scanned or typed code into the one thing it stands for, telling the person when it can not (nothing has the code, it is an old code, two things share it).
 * Returns the match (see CodeCatalogue::shape on the server: type, id, variant_id, product_id, sku, label, pack_units, batch_no…) or null.
 */
export async function scanMatch(code, accept = ['variant', 'pack', 'batch', 'asset']) {
  try {
    const r = await codesAPI.lookup(code);
    if (!r.found) { toast.error(`Nothing has the code ${code}.`); return null; }
    const own = r.matches.filter((m) => accept.includes(m.type));   // the screen asks for what it can use: a dish scanned at a stock count is not a product
    if (!own.length) { toast.error(`${code} is ${r.matches[0].label} (${r.matches[0].type.replace('_', ' ')}), which this screen does not use.`); return null; }
    r.matches = own;
    const live = r.matches.filter((m) => !m.retired);
    if (!live.length) { toast(`${code} is an old code of ${r.matches[0].label} (it now has ${r.matches[0].code ?? 'another code'}): counted as that item.`, { duration: 6000, icon: '🏷️' }); return r.matches[0]; }
    if (live.length > 1) toast(`More than one item has the code ${code}: using ${live[0].label}. Give them different codes on the Codes page.`, { duration: 7000, icon: '⚠️' });
    return live[0];
  } catch (e) {
    toast.error(errMsg(e, 'Could not look that code up'));
    return null;
  }
}
