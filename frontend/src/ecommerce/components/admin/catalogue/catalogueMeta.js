import { useEffect, useState } from 'react';
import cataloguesAPI from '../../../../_shared/api/catalogues';
import { ACCESS_LABEL } from '../../../lib/priceList/format';

let metaCache = null;

/** The shop-wide settings, the customer types (from the database) and the section lists: one fetch, shared by the price list and brochure pages. */
export function useCatalogueMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    let on = true;
    cataloguesAPI.settings().then((r) => { metaCache = r; if (on) setMeta(r); }).catch(() => {});

    return () => { on = false; };
  }, []);

  return [meta, (next) => { metaCache = next; setMeta(next); }];
}

export const resetCatalogueMeta = () => { metaCache = null; };

const selectStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-card)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.84rem' };

export const audienceText = (row) => (row.access === 'types' ? `Types: ${(row.type_names ?? []).join(', ') || '(none)'}` : ACCESS_LABEL[row.access] ?? row.access);

/** An ISO date from the server as the value of a datetime-local box, and back. */
export const toLocalInput = (v) => { if (!v) return ''; const d = new Date(v); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? v.replace('T', ' ') + ':00' : null);

export const fieldStyle = selectStyle;
