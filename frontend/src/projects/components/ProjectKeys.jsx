import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hasPermission } from '../../_shared/lib/roles';
import { useAuthStore } from '../../_shared/store/index';
import { useProjectNames } from '../lib/names';
import useNamesStore from '../lib/names';
import { GO, ON, onOpenProject } from '../lib/keys';

/**
 * Listens for the Projects shortcut keys while a Projects page is open (build 1.9):
 *   G, then a letter           jump to a part of Projects the person may open
 *   Shift + a letter           on an open piece of work: press the control that carries that key's mark
 * A key presses what is on the screen and nothing else, so it can never do what the person could not do with the mouse. Nothing fires while
 * typing, with a dialog open, or with Ctrl, Alt or Cmd held. It draws nothing.
 */
const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)); };
const dialogOpen = () => !!document.querySelector('[role="dialog"], dialog[open], [aria-modal="true"]');

export default function ProjectKeys() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  useProjectNames();   // makes sure the keys are loaded
  const goAt = useRef(0);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e) || dialogOpen() || !/^Key[A-Z]$/.test(e.code)) { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) goAt.current = 0; return; }
      const letter = e.code.slice(3);   // the key's place, not its character
      const { keys } = useNamesStore.getState();
      if (!e.shiftKey) {
        if (goAt.current && Date.now() - goAt.current < 1500) {
          goAt.current = 0;
          const to = GO.find((g) => keys[g.key] === letter && hasPermission(user, g.perm));
          if (to) { e.preventDefault(); navigate(to.path); }
        } else {
          goAt.current = letter === 'G' ? Date.now() : 0;
        }
        return;
      }
      goAt.current = 0;
      if (!onOpenProject(pathname)) return;
      const on = ON.find((o) => keys[o.key] === letter);
      const el = on && document.querySelector(`[data-project-key="${on.mark}"]`);
      if (el && !el.disabled) { e.preventDefault(); e.stopPropagation(); el.click(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pathname, navigate, user]);

  return null;
}
