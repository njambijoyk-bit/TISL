import { useEffect, useState } from 'react';
import api from '../api/axios';

let cached = null;
let inflight = null;

/** The company profile (name, short code, contact) — one fetch shared by the whole app. */
export const loadCompany = () => {
  if (cached) return Promise.resolve(cached);
  inflight ??= api.get('/company').then((r) => { cached = r.data; return cached; }).catch(() => ({})).finally(() => { inflight = null; });
  return inflight;
};

export const resetCompany = () => { cached = null; };

export const useCompany = () => {
  const [company, setCompany] = useState(cached ?? {});
  useEffect(() => { let on = true; loadCompany().then((c) => on && setCompany(c)); return () => { on = false; }; }, []);
  return company;
};
