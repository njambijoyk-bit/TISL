import { useCallback, useEffect, useState } from 'react';

/**
 * The branch chosen on a Menus page stays chosen as you move between the Menus pages (Stock, Count stock, Opening stock, Recipes, Dishes, Operations, Floor): it is kept on this device.
 * `branches` is the list the page was given; a remembered branch that is not in it any more (switched off, or someone else's) is dropped for the first one.
 */
const KEY = 'menus.branch';
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const write = (v) => { try { if (v) localStorage.setItem(KEY, String(v)); } catch { /* private window: the choice just is not kept */ } };

export function useMenusBranch(branches) {
  const [loc, set] = useState(read);
  const setLoc = useCallback((v) => set((prev) => { const next = typeof v === 'function' ? v(prev) : v; write(next); return next; }), []);
  useEffect(() => {
    if (branches?.length && loc && !branches.some((b) => String(b.id) === String(loc))) setLoc(String(branches[0].id));
  }, [branches, loc, setLoc]);

  return [loc, setLoc];
}
