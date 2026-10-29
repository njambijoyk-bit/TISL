import { useCallback, useEffect, useState } from 'react';
import booksAPI from '../../../../_shared/api/books';
import { MAX_FAVOURITES } from './reportCatalog';

const storeKey = (userId) => `report-favourites:${userId ?? 'me'}`;
const readLocal = (userId) => { try { const v = JSON.parse(localStorage.getItem(storeKey(userId)) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLocal = (userId, keys) => { try { localStorage.setItem(storeKey(userId), JSON.stringify(keys)); } catch { /* private window: the list lives for this visit only */ } };

/**
 * The person's favourite reports (engine keys), in the order they were starred: key 1 opens the first. Kept on the server per person once database script 236 has
 * been run, so they follow the person to any device; until then in this browser.
 */
export default function useReportFavourites(userId) {
  const [keys, setKeys] = useState([]);
  const [server, setServer] = useState(false);

  useEffect(() => {
    let live = true;
    booksAPI.reportFavourites()
      .then((r) => { if (!live) return; setServer(Boolean(r.ready)); setKeys(r.ready ? r.keys : readLocal(userId)); })
      .catch(() => { if (live) setKeys(readLocal(userId)); });
    return () => { live = false; };
  }, [userId]);

  /** Star or unstar a report. Returns false when the list is full (nine). */
  const toggle = useCallback((key) => {
    const has = keys.includes(key);
    if (!has && keys.length >= MAX_FAVOURITES) return false;
    const next = has ? keys.filter((k) => k !== key) : [...keys, key];
    setKeys(next);
    if (server) booksAPI.saveReportFavourites(next).then((r) => setKeys(r.keys)).catch(() => setKeys(keys)); else writeLocal(userId, next);
    return true;
  }, [keys, server, userId]);

  return { keys, toggle };
}
