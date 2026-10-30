import { useEffect, useState } from 'react';

const WIDE = 1280;

/** True on a large screen, where the shortcut panel sits beside the form (on a small one it would only take room from it). */
export function useWideScreen(px = WIDE) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= px);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= px);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [px]);
  return wide;
}

/** Calls onKey for Ctrl+<letter> (or Cmd), stopping the browser's own use of it (Ctrl+H is History, Ctrl+S is Save page). */
export function useCtrlKeys(map) {
  useEffect(() => {
    const on = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const fn = map[e.key.toLowerCase()];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [map]);
}

/** Calls the function for a bare function key (F2, F4…), stopping the browser's own use of it. Not while editing a field that needs the key (none do). */
export function useFKeys(map) {
  useEffect(() => {
    const on = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const fn = map[e.key.toLowerCase()];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [map]);
}

/** The vouchers on the Tally-style keys, in Tally's order. */
export const JUMPS = [['f4', 'F4', 'contra', 'Contra'], ['f5', 'F5', 'payment', 'Payment'], ['f6', 'F6', 'receipt', 'Receipt'], ['f7', 'F7', 'journal', 'Journal'], ['f8', 'F8', 'sales', 'Sales'], ['f9', 'F9', 'purchase', 'Purchase']];

/**
 * The panel's voucher buttons and their keys. go(type) moves to that voucher; the entry in progress on this one is kept (each form saves its own draft) so coming back finds it as it was.
 * Returns { actions, keyMap }.
 */
export function voucherJumps(types, currentBase, go) {
  const byBase = (b) => types.find((t) => t.base_type === b && t.is_active !== false);
  const shown = new Set(JUMPS.map((j) => j[2]));
  const keyMap = {};
  const actions = JUMPS.map(([k, label, base, name]) => {
    const t = byBase(base);
    if (t) keyMap[k] = () => go(t);
    return { keys: label, label: name, onClick: () => t && go(t), disabled: !t, active: currentBase === base };
  });
  const others = types.filter((t) => t.is_active !== false && !shown.has(t.base_type) && t.base_type !== 'opening_stock');
  actions.push({ keys: 'F10', label: 'Other vouchers', submenu: others.map((t) => ({ label: t.name, active: currentBase === t.base_type, onClick: () => go(t) })), disabled: !others.length });
  return { actions, keyMap };
}
