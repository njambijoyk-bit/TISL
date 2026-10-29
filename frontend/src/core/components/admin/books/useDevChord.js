import { useEffect } from 'react';

/**
 * Shift + D + E + V pressed together (all four held at once) calls `onChord`. It listens before the app's other shortcuts and swallows the last key of the chord, so
 * the voucher picker (Shift + V) does not open as well. Releasing any key starts it over, and it never fires while typing in a box.
 */
export default function useDevChord(onChord) {
  useEffect(() => {
    const down = new Set();
    const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)); };
    const onKeyDown = (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) { down.clear(); return; }
      if (e.code) down.add(e.code);
      if (e.shiftKey && down.has('KeyD') && down.has('KeyE') && down.has('KeyV') && /^Key[DEV]$/.test(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        down.clear();
        onChord();
      }
    };
    const onKeyUp = (e) => { down.delete(e.code); };
    const reset = () => down.clear();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', reset);
    return () => { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true); window.removeEventListener('blur', reset); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- onChord is read through the closure of the first render only; the caller passes a stable updater
}
