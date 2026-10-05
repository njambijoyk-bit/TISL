import { useEffect, useState } from 'react';
import api from '../api/axios';

/**
 * A customer's order or quotation address carries the document number (/orders/WNKJ-SO-00019), never the internal id.
 * This turns the address part into the id the rest of the page works with: a plain number is taken as the id (old links keep working),
 * anything else is looked up (their own documents only). `id` is null while that is happening, `failed` when there is no such document.
 */
export default function useDocId(ref) {
  const numeric = /^\d+$/.test(String(ref ?? ''));
  const [found, setFound] = useState({ ref: null, id: null, failed: false });
  useEffect(() => {
    if (numeric || !ref) return undefined;
    let live = true;
    api.get('/customer/document-ref', { params: { number: ref } })
      .then((r) => live && setFound({ ref, id: r.data.id, failed: false }))
      .catch(() => live && setFound({ ref, id: null, failed: true }));
    return () => { live = false; };
  }, [ref, numeric]);
  if (numeric) return { id: Number(ref), failed: false };

  return found.ref === ref ? found : { id: null, failed: false };
}
