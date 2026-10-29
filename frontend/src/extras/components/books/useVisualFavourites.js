import { useCallback, useEffect, useState } from 'react';
import booksAPI from '../../../_shared/api/books';
import { MAX_FAVOURITES } from './visualCatalog';

const storeKey = (userId) => `visual-favourites:${userId ?? 'me'}`;
const readLocal = (userId) => { try { const v = JSON.parse(localStorage.getItem(storeKey(userId)) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLocal = (userId, keys) => { try { localStorage.setItem(storeKey(userId), JSON.stringify(keys)); } catch { /* private window: the list lives for this visit only */ } };

/** The person's favourite charts, in the order they were starred (key 1 opens the first). On the server per person once database script 238 has been run, else in this browser. */
export default function useVisualFavourites(userId) {
  const [keys, setKeys] = useState([]);
  const [server, setServer] = useState(false);
  useEffect(() => {
    let live = true;
    booksAPI.visualFavourites()
      .then((r) => { if (!live) return; setServer(Boolean(r.ready)); setKeys(r.ready ? r.keys : readLocal(userId)); })
      .catch(() => { if (live) setKeys(readLocal(userId)); });
    return () => { live = false; };
  }, [userId]);

  /** Star or unstar a chart. Returns false when the list is full (nine). */
  const toggle = useCallback((key) => {
    const has = keys.includes(key);
    if (!has && keys.length >= MAX_FAVOURITES) return false;
    const next = has ? keys.filter((k) => k !== key) : [...keys, key];
    setKeys(next);
    if (server) booksAPI.saveVisualFavourites(next).then((r) => setKeys(r.keys)).catch(() => setKeys(keys)); else writeLocal(userId, next);
    return true;
  }, [keys, server, userId]);

  return { keys, toggle };
}
