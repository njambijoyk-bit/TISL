import { useEffect, useState } from 'react';
import api from '../api/axios';

let cached = null;
let inflight = null;
const listeners = new Set();

/** The company profile (name, short code, contact) — one fetch shared by the whole app. */
export const loadCompany = () => {
  if (cached) return Promise.resolve(cached);
  inflight ??= api.get('/company').then((r) => { cached = r.data; return cached; }).catch(() => ({})).finally(() => { inflight = null; });
  return inflight;
};

/** Forget the stored profile (after it was edited) and tell every screen showing it to load the new one. */
export const resetCompany = () => {
  cached = null;
  if (listeners.size) loadCompany().then((c) => listeners.forEach((l) => l(c)));
};

export const useCompany = () => {
  const [company, setCompany] = useState(cached ?? {});
  useEffect(() => {
    let on = true;
    const update = (c) => on && setCompany(c);
    listeners.add(update);
    loadCompany().then(update);
    return () => { on = false; listeners.delete(update); };
  }, []);
  return company;
};

/**
 * What small places (the admin sidebar) call the business: the short code, else a mark from the trading name, else from the legal name.
 * The server works it out (brand_mark), so every screen agrees; nothing is shown until the profile has loaded.
 */
export const brandMark = (company) => company?.brand_mark || '';
