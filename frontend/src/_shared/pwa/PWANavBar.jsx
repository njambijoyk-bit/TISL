/**
 * PWANavBar
 * - Only renders in PWA mode on non-touch (desktop) devices
 * - Freely draggable to any position, snaps to nearest edge
 * - Fades out on scroll, fades back in when scroll stops
 * - Side position: back + home + forward + refresh (vertical pill)
 * - Top/Bottom position: back + home + forward + refresh + url toggle (horizontal bar)
 * - URL editor bar appears above/below (or beside) the nav when toggled
 * - Persists last position in localStorage; URL bar always starts CLOSED on mount
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, RotateCw, Link2, X } from 'lucide-react';

const isPWA = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isTouchDevice = () =>
  window.matchMedia('(pointer: coarse)').matches ||
  navigator.maxTouchPoints > 1;

const POSITIONS      = ['top', 'bottom', 'left', 'right'];
const STORAGE_KEY    = 'pwa_navbar_position';
const STORAGE_XY_KEY = 'pwa_navbar_xy';
// STORAGE_URL_KEY intentionally removed — url bar is never persisted

function getInitialPosition() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (POSITIONS.includes(saved)) return saved;
  } catch {}
  return 'bottom';
}

function getInitialXY(position) {
  try {
    const saved = localStorage.getItem(STORAGE_XY_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (position === 'top')    return { x: W / 2, y: 0 };
  if (position === 'bottom') return { x: W / 2, y: H };
  if (position === 'left')   return { x: 0,     y: H / 2 };
  if (position === 'right')  return { x: W,     y: H / 2 };
  return { x: W / 2, y: H };
}

export default function PWANavBar() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  const [position, setPosition] = useState(getInitialPosition);
  const [xy,       setXY]       = useState(() => getInitialXY(getInitialPosition()));
  const [opacity,  setOpacity]  = useState(1);
  const [hovered,  setHovered]  = useState(false);

  // ── URL bar: always starts CLOSED — never restored from localStorage ─────────
  const [urlOpen,  setUrlOpen]  = useState(false);
  const [urlValue, setUrlValue] = useState(window.location.href);

  const scrollTimer = useRef(null);
  const dragging    = useRef(false);
  const didDrag     = useRef(false);
  const dragStart   = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const urlInputRef = useRef(null);

  if (!isPWA() || isTouchDevice()) return null;

  // ── Scroll fade ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      setOpacity(0.2);
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => setOpacity(1), 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(scrollTimer.current);
    };
  }, []);

  // Keep url input in sync with navigation
  useEffect(() => {
    setUrlValue(window.location.href);
  }, [pathname]);

  // Close url bar on every route change
  useEffect(() => {
    setUrlOpen(false);
  }, [pathname]);

  // Focus url input when opened
  useEffect(() => {
    if (urlOpen) setTimeout(() => urlInputRef.current?.focus(), 80);
  }, [urlOpen]);

  // ── Free drag ────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current  = true;
    didDrag.current   = false;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: xy.x, oy: xy.y };

    // ── Edge-hugging drag zone strips ─────────────────────────────────────────
    // Each strip hugs its own edge — the center of the page is left untouched
    const STRIP = 72;
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:grabbing;pointer-events:none;';

    [
      { zone: 'top',    css: `top:0;left:0;right:0;height:${STRIP}px;` },
      { zone: 'bottom', css: `bottom:0;left:0;right:0;height:${STRIP}px;` },
      { zone: 'left',   css: `left:0;top:0;bottom:0;width:${STRIP}px;` },
      { zone: 'right',  css: `right:0;top:0;bottom:0;width:${STRIP}px;` },
    ].forEach(({ zone, css }) => {
      const el = document.createElement('div');
      el.dataset.zone = zone;
      el.style.cssText = `
        position:fixed;${css}
        background:rgba(168,85,247,0.07);
        border:2px dashed rgba(168,85,247,0.25);
        display:flex;align-items:center;justify-content:center;
        font-size:0.68rem;font-weight:800;
        color:rgba(168,85,247,0.5);
        text-transform:uppercase;letter-spacing:0.12em;
        transition:background 120ms,border-color 120ms,color 120ms;
        box-sizing:border-box;
      `;
      el.textContent = zone;
      ghost.appendChild(el);
    });

    document.body.appendChild(ghost);

    const nearestEdge = (cx, cy) => {
      const W = window.innerWidth, H = window.innerHeight;
      const d = { top: cy, bottom: H - cy, left: cx, right: W - cx };
      return Object.keys(d).reduce((a, b) => d[a] < d[b] ? a : b);
    };

    const onMove = (mv) => {
      if (!dragging.current) return;
      const dx = mv.clientX - dragStart.current.mx;
      const dy = mv.clientY - dragStart.current.my;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true;
      setXY({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });

      const active = nearestEdge(mv.clientX, mv.clientY);
      ghost.querySelectorAll('[data-zone]').forEach(el => {
        const on = el.dataset.zone === active;
        el.style.background  = on ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.07)';
        el.style.borderColor = on ? 'rgba(168,85,247,0.7)'  : 'rgba(168,85,247,0.25)';
        el.style.color       = on ? 'rgba(168,85,247,1)'    : 'rgba(168,85,247,0.5)';
      });
    };

    const onUp = (mv) => {
      dragging.current = false;
      ghost.remove();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!didDrag.current) return;

      const cx = mv.clientX, cy = mv.clientY;
      const W  = window.innerWidth, H = window.innerHeight;
      const newPos = nearestEdge(cx, cy);
      const snappedXY = {
        top:    { x: cx, y: 0 },
        bottom: { x: cx, y: H },
        left:   { x: 0,  y: cy },
        right:  { x: W,  y: cy },
      }[newPos];

      setPosition(newPos);
      setXY(snappedXY);
      try {
        localStorage.setItem(STORAGE_KEY, newPos);
        localStorage.setItem(STORAGE_XY_KEY, JSON.stringify(snappedXY));
      } catch {}
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [xy]);

  const handleRefresh = () => {
    if (didDrag.current) return;
    window.location.reload();
  };

  // Toggle only — never written to localStorage
  const handleUrlToggle = () => setUrlOpen(o => !o);

  const handleUrlGo = () => {
    let target = urlValue.trim();
    if (!target.startsWith('http')) target = 'https://' + target;
    window.location.href = target;
  };

  const handleUrlKey = (e) => {
    if (e.key === 'Enter') handleUrlGo();
    if (e.key === 'Escape') setUrlOpen(false);
  };

  // ── Layout helpers ───────────────────────────────────────────────────────────
  const isSide = position === 'left' || position === 'right';

  const containerStyle = (() => {
    const base = {
      position: 'fixed', zIndex: 500, opacity,
      transition: 'opacity 400ms ease',
      userSelect: 'none',
      display: 'flex', alignItems: 'center', gap: 6,
    };
    if (position === 'top') return {
      ...base, top: 0,
      left: Math.max(40, Math.min(window.innerWidth - 40, xy.x)),
      transform: 'translateX(-50%)',
      flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    };
    if (position === 'bottom') return {
      ...base, bottom: 0,
      left: Math.max(40, Math.min(window.innerWidth - 40, xy.x)),
      transform: 'translateX(-50%)',
      flexDirection: 'column-reverse',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    };
    if (position === 'left') return {
      ...base, left: 0,
      top: Math.max(40, Math.min(window.innerHeight - 40, xy.y)),
      transform: 'translateY(-50%)',
      flexDirection: 'row',
    };
    return {
      ...base, right: 0,
      top: Math.max(40, Math.min(window.innerHeight - 40, xy.y)),
      transform: 'translateY(-50%)',
      flexDirection: 'row-reverse',
    };
  })();

  const barStyle = {
    display: 'flex', flexDirection: isSide ? 'column' : 'row',
    alignItems: 'center', gap: 4,
    padding: isSide ? '10px 6px' : '6px 10px',
    background: 'rgba(109,40,217,0.15)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: '1px solid rgba(168,85,247,0.25)',
    boxShadow: '0 4px 24px rgba(168,85,247,0.2), 0 1px 0 rgba(168,85,247,0.1)',
    cursor: hovered ? 'grab' : 'default',
    ...(position === 'top'    && { borderRadius: '0 0 14px 14px', borderTop: 'none' }),
    ...(position === 'bottom' && { borderRadius: '14px 14px 0 0', borderBottom: 'none' }),
    ...(position === 'left'   && { borderRadius: '0 14px 14px 0', borderLeft: 'none' }),
    ...(position === 'right'  && { borderRadius: '14px 0 0 14px', borderRight: 'none' }),
  };

  const urlBarStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(109,40,217,0.15)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: '1px solid rgba(168,85,247,0.25)',
    boxShadow: '0 4px 24px rgba(168,85,247,0.15)',
    borderRadius: 10, minWidth: 360, padding: '8px 12px',
  };

  const btnStyle = (active = false) => ({
    width: isSide ? 30 : 34, height: isSide ? 30 : 34,
    borderRadius: 9, border: 'none',
    background: active ? 'rgba(168,85,247,0.15)' : 'transparent',
    color: active ? '#a855f7' : 'rgba(168,85,247,0.7)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 150ms, color 150ms', flexShrink: 0,
  });

  const isHome = pathname === '/home' || pathname === '/';

  const DragHandle = () => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: isSide ? '4px 0' : '0 4px',
      opacity: hovered ? 1 : 0,
      transition: 'opacity 200ms ease',
      pointerEvents: 'none',
    }}>
      {isSide ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 2 }}>
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168,85,247,0.4)' }} />
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168,85,247,0.4)' }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 2 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168,85,247,0.4)' }} />
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168,85,247,0.4)' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const UrlBar = urlOpen && (
    <div style={urlBarStyle} onMouseDown={e => e.stopPropagation()}>
      <input
        ref={urlInputRef}
        value={urlValue}
        onChange={e => setUrlValue(e.target.value)}
        onKeyDown={handleUrlKey}
        style={{
          flex: 1, background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(168,85,247,0.3)', borderRadius: 7,
          color: '#111827', fontSize: '11px', padding: '5px 9px',
          outline: 'none', fontFamily: 'monospace', minWidth: 0,
        }}
        onFocus={e => e.target.select()}
      />
      <button onClick={handleUrlGo}
        style={{ ...btnStyle(), color: '#a855f7', fontSize: 11, fontWeight: 700, width: 'auto', padding: '0 8px' }}>
        Go
      </button>
      <button onClick={() => setUrlOpen(false)} style={btnStyle()} title="Close URL editor">
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );

  return (
    <div style={containerStyle} onMouseDown={onMouseDown}>

      {urlOpen && (position === 'bottom' || position === 'right') && UrlBar}

      <div
        style={barStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <DragHandle />

        <button style={btnStyle()} onClick={() => { if (!didDrag.current) navigate(-1); }} title="Back"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ChevronLeft size={isSide ? 16 : 18} strokeWidth={2.5} />
        </button>

        <button style={btnStyle(isHome)} onClick={() => { if (!didDrag.current) navigate('/home'); }} title="Home"
          onMouseEnter={e => { if (!isHome) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
          onMouseLeave={e => { if (!isHome) e.currentTarget.style.background = isHome ? 'rgba(168,85,247,0.15)' : 'transparent'; }}>
          <Home size={isSide ? 15 : 17} strokeWidth={2.2} />
        </button>

        <button style={btnStyle()} onClick={() => { if (!didDrag.current) navigate(1); }} title="Forward"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ChevronRight size={isSide ? 16 : 18} strokeWidth={2.5} />
        </button>

        <div style={{
          background: 'rgba(168,85,247,0.2)', borderRadius: 99,
          ...(isSide ? { width: 20, height: 1, margin: '2px 0' } : { width: 1, height: 20, margin: '0 2px' }),
        }} />

        <button style={btnStyle()} onClick={handleRefresh} title="Refresh"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <RotateCw size={isSide ? 14 : 15} strokeWidth={2.2} />
        </button>

        {!isSide && (
          <button style={btnStyle(urlOpen)} onClick={handleUrlToggle}
            title={urlOpen ? 'Close URL editor' : 'Open URL editor'}
            onMouseDown={e => e.stopPropagation()}
            onMouseEnter={e => { if (!urlOpen) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
            onMouseLeave={e => { if (!urlOpen) e.currentTarget.style.background = 'transparent'; }}>
            <Link2 size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {urlOpen && (position === 'top' || position === 'left') && UrlBar}

    </div>
  );
}