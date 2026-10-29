import { useEffect, useRef } from 'react';

const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)); };
const dialogOpen = () => [...document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')].some((el) => el.getClientRects().length > 0);

/**
 * The Reports keys, active while the Reports tab is open. None fires while typing in a box or with a dialog open (Ctrl+Enter excepted, so it runs from a date field).
 *   G, then a letter   go to that report (every report has its own letter, the same for everyone)
 *   1 to 9             open the person's favourites in the order they starred them
 *   [  ]               the previous or next report in the list
 *   R or Ctrl+Enter    run the report;  E  open the export menu;  F  star or unstar this report
 * "/" (focus the search box) is the app-wide key and finds the box on its own.
 */
export default function useReportKeys({ visible, current, open, star, favourites, onGo }) {
  const live = useRef({});
  live.current = { visible, current, open, star, favourites, onGo };
  const goAt = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    const endGo = () => { goAt.current = 0; clearTimeout(timer.current); live.current.onGo(false); };
    const onKey = (e) => {
      const { visible: list, current: cur, open: go, star: toggle, favourites: favs } = live.current;
      if (e.ctrlKey && e.key === 'Enter' && !dialogOpen()) {
        const run = document.querySelector('[data-report-run]');
        if (run && !run.disabled) { e.preventDefault(); run.click(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typing(e) || dialogOpen()) return;
      if (e.key === 'Escape') { endGo(); return; }
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : '';
      if (goAt.current && Date.now() - goAt.current < 1500) {   // G was pressed: this key names the report
        endGo();
        const hit = list.find((r) => r.letter === letter);
        if (hit) { e.preventDefault(); go(hit); }
        return;
      }
      if (letter === 'G') { e.preventDefault(); goAt.current = Date.now(); live.current.onGo(true); clearTimeout(timer.current); timer.current = setTimeout(endGo, 1500); return; }
      if (/^[1-9]$/.test(e.key)) {
        const hit = list.find((r) => r.engine === favs[Number(e.key) - 1]);
        if (hit) { e.preventDefault(); go(hit); }
        return;
      }
      if (e.key === '[' || e.key === ']') {
        const i = list.findIndex((r) => r.id === cur.id);
        const next = list[(i + (e.key === ']' ? 1 : -1) + list.length) % list.length];
        if (next) { e.preventDefault(); go(next); }
        return;
      }
      if (letter === 'R') { const run = document.querySelector('[data-report-run]'); if (run && !run.disabled) { e.preventDefault(); run.click(); } return; }
      if (letter === 'E') {
        const menu = document.querySelector('select[data-report-export]');
        if (menu) { e.preventDefault(); menu.focus(); try { menu.showPicker(); } catch { menu.click(); } }
        return;
      }
      if (letter === 'F') { e.preventDefault(); toggle(cur); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer.current); };
  }, []);   // the handler reads the latest values from `live`
}
