import { useCallback, useEffect, useRef, useState } from 'react';

const read = (key) => { try { const p = JSON.parse(localStorage.getItem(key)); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; } };
const write = (key, p) => { try { if (p) localStorage.setItem(key, JSON.stringify(p)); else localStorage.removeItem(key); } catch { /* storage may be blocked */ } };

/**
 * Lets a fixed-position element be moved by mouse, trackpad or finger (pointer events cover all three).
 * Put `handleProps` on whatever should be grabbed and `ref` on the element that moves; spread `style` over its own position.
 * Until it is first moved `pos` is null and `style` is empty, so the element keeps its default place. The place is remembered on this device,
 * and a double-click on the handle sends it back. `wasDragged()` lets a button ignore the click that ends a drag.
 */
export default function useDragPosition(storageKey) {
  const ref = useRef(null);
  const [pos, setPos] = useState(() => read(storageKey));
  const moved = useRef(false);

  const clamp = useCallback((x, y) => {
    const r = ref.current?.getBoundingClientRect();
    const w = r?.width ?? 0, h = r?.height ?? 0;
    return { x: Math.round(Math.min(Math.max(0, x), Math.max(0, window.innerWidth - w))), y: Math.round(Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h))) };
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const inner = e.target.closest('button, a, input, select, textarea');
    if (inner && inner !== e.currentTarget) return;   // a control inside the handle keeps its own click
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const grab = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
    const handle = e.currentTarget;
    const pid = e.pointerId;
    moved.current = false;
    let last = null;
    try { handle.setPointerCapture(pid); } catch { /* already released */ }
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      if (!moved.current && Math.hypot(ev.clientX - grab.sx, ev.clientY - grab.sy) < 5) return;
      moved.current = true;
      last = clamp(ev.clientX - grab.dx, ev.clientY - grab.dy);
      setPos(last);
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      try { handle.releasePointerCapture(pid); } catch { /* already released */ }
      if (last) write(storageKey, last);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, [clamp, storageKey]);

  // keep it on screen when the window is resized or the phone turned
  useEffect(() => {
    if (!pos) return undefined;
    const fit = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [pos, clamp]);

  const reset = useCallback(() => { setPos(null); write(storageKey, null); }, [storageKey]);
  const wasDragged = useCallback(() => { const m = moved.current; moved.current = false; return m; }, []);

  return {
    ref, pos, reset, wasDragged,
    handleProps: { onPointerDown, onDoubleClick: reset, style: { touchAction: 'none', cursor: 'grab', userSelect: 'none' } },
    style: pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {},
  };
}
