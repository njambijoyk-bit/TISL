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
