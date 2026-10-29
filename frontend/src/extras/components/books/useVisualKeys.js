import { useEffect, useRef } from 'react';
import { HOME_KEY } from './visualCatalog';

const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)); };
const dialogOpen = () => [...document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')].some((el) => el.getClientRects().length > 0);
/** The key's place, not its character: a letter or a digit. */
const keyOf = (e) => (/^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit[0-9]$/.test(e.code) ? e.code.slice(5) : '');

/**
 * The Visual reports keys. None fires while typing in a box or with a dialog open.
 *   G, then a letter or number   go to that chart (each chart has its own, the same for everyone; G 0 goes back to the questions)
 *   1 to 9                       open the person's favourites in the order they starred them
 *   [  ]                         the previous or next chart in the list
 *   F star or unstar the open chart;  R reload it;  T switch it between chart and table;  I save it as an image
 * "/" (focus the search box) is the app-wide key and finds the box on its own.
 */
export default function useVisualKeys({ charts, current, open, home, star, favourites, onGo }) {
  const live = useRef({});
  live.current = { charts, current, open, home, star, favourites, onGo };
  const goAt = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    const endGo = () => { goAt.current = 0; clearTimeout(timer.current); live.current.onGo(false); };
    const click = (sel) => { const el = document.querySelector(sel); if (el && !el.disabled) { el.click(); return true; } return false; };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typing(e) || dialogOpen()) return;
      const { charts: list, current: cur, open: go, home: goHome, star: toggle, favourites: favs } = live.current;
      if (e.key === 'Escape') { endGo(); return; }
      const k = keyOf(e);
      if (goAt.current && Date.now() - goAt.current < 1500) {   // G was pressed: this key names the chart
        endGo();
        if (k === HOME_KEY) { e.preventDefault(); goHome(); return; }
        const hit = list.find((c) => c.go === k);
        if (hit) { e.preventDefault(); go(hit); }
        return;
      }
      if (k === 'G') { e.preventDefault(); goAt.current = Date.now(); live.current.onGo(true); clearTimeout(timer.current); timer.current = setTimeout(endGo, 1500); return; }
      if (/^[1-9]$/.test(e.key)) {
        const hit = list.find((c) => c.key === favs[Number(e.key) - 1]);
        if (hit) { e.preventDefault(); go(hit); }
        return;
      }
      if ((e.key === '[' || e.key === ']') && list.length) {
        const i = list.findIndex((c) => c.key === cur?.key);
        const next = list[(i < 0 ? 0 : i + (e.key === ']' ? 1 : -1) + list.length) % list.length];
        e.preventDefault(); go(next);
        return;
      }
      if (!cur) return;
      if (k === 'F') { e.preventDefault(); toggle(cur); }
      else if (k === 'R') { if (click('[data-visual-reload]')) e.preventDefault(); }
      else if (k === 'T') { if (click('[data-visual-table]')) e.preventDefault(); }
      else if (k === 'I') { if (click('[data-visual-image]')) e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer.current); };
  }, []);   // the handler reads the latest values from `live`
}
