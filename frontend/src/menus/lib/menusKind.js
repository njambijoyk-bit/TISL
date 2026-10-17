import { useCallback, useState } from 'react';

/**
 * The kind of ingredient chosen as a filter on a Menus stock page (Stock, Count stock, Opening stock) stays chosen between them: it is kept on this device.
 * `kinds` is the list the page was given; a remembered kind that is not in it any more counts as "all kinds".
 */
const KEY = 'menus.kind';
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const write = (v) => { try { if (v) localStorage.setItem(KEY, String(v)); else localStorage.removeItem(KEY); } catch { /* private window: the choice just is not kept */ } };

export function useMenusKind(kinds) {
  const [kept, set] = useState(read);
  const setKind = useCallback((v) => { write(v); set(String(v ?? '')); }, []);
  const kind = kinds?.some((k) => String(k.id) === kept) ? kept : '';

  return [kind, setKind];
}
