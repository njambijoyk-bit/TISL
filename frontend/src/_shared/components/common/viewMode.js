import { useState } from 'react';

const read = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* not remembered: fine */ } };

/**
 * Table or cards for a list page: cards by default on a phone, the table elsewhere, and whatever the person picks is remembered for that kind of screen.
 * `name` is the page ('customers'). Returns [view, setView].
 */
export function useViewMode(name) {
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  const key = `view.${name}.${phone ? 'phone' : 'desktop'}`;
  const [chosen, setChosen] = useState(null);
  const view = chosen ?? read(key) ?? (phone ? 'cards' : 'table');
  return [view, (v) => { setChosen(v); save(key, v); }];
}
