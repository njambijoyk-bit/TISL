/**
 * PWANavBar
 * - Only renders in PWA mode on non-touch (desktop) devices
 * - Freely draggable to any position, snaps to nearest edge
 * - Fades out on scroll, fades back in when scroll stops
 * - Side position: back + home + forward + refresh (vertical pill)
 * - Top/Bottom position: back + home + forward + refresh + url toggle (horizontal bar)
 * - URL editor bar appears above/below (or beside) the nav when toggled
 * - Persists last position + url toggle state in localStorage
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

const POSITIONS = ['top', 'bottom', 'left', 'right'];
const STORAGE_KEY     = 'pwa_navbar_position';
const STORAGE_XY_KEY  = 'pwa_navbar_xy';
const STORAGE_URL_KEY = 'pwa_navbar_url_open';

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
  // Default: centered on the appropriate edge
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
  const [urlOpen,  setUrlOpen]  = useState(() => {
    try { return localStorage.getItem(STORAGE_URL_KEY) === 'true'; } catch { return false; }
  });
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

    const onMove = (mv) => {
      if (!dragging.current) return;
      const dx = mv.clientX - dragStart.current.mx;
      const dy = mv.clientY - dragStart.current.my;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true;

      const nx = dragStart.current.ox + dx;
      const ny = dragStart.current.oy + dy;
      setXY({ x: nx, y: ny });
    };

    const onUp = (mv) => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      if (!didDrag.current) return;

      // Snap to nearest edge
      const cx = mv.clientX;
      const cy = mv.clientY;
      const W  = window.innerWidth;
      const H  = window.innerHeight;

      const distTop    = cy;
      const distBottom = H - cy;
      const distLeft   = cx;
      const distRight  = W - cx;
      const min = Math.min(distTop, distBottom, distLeft, distRight);

      let newPos = 'bottom';
      let snappedXY = { x: cx, y: H };
      if (min === distTop)    { newPos = 'top';    snappedXY = { x: cx, y: 0 }; }
      if (min === distBottom) { newPos = 'bottom'; snappedXY = { x: cx, y: H }; }
      if (min === distLeft)   { newPos = 'left';   snappedXY = { x: 0,  y: cy }; }
      if (min === distRight)  { newPos = 'right';  snappedXY = { x: W,  y: cy }; }

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

  const handleUrlToggle = () => {
    const next = !urlOpen;
    setUrlOpen(next);
    try { localStorage.setItem(STORAGE_URL_KEY, String(next)); } catch {}
  };

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

  // Position the bar so it's anchored to the snapped edge,
  // offset along the edge by the xy coordinate
  const containerStyle = (() => {
    const base = {
      position:   'fixed',
      zIndex:     500,
      opacity,
      transition: 'opacity 400ms ease',
      userSelect: 'none',
      display:    'flex',
      flexDirection: isSide ? 'row' : 'column',
      alignItems: 'center',
      gap:        6,
    };

    if (position === 'top') return {
      ...base,
      top: 0,
      left: Math.max(40, Math.min(window.innerWidth - 40, xy.x)),
      transform: 'translateX(-50%)',
      flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    };
    if (position === 'bottom') return {
      ...base,
      bottom: 0,
      left: Math.max(40, Math.min(window.innerWidth - 40, xy.x)),
      transform: 'translateX(-50%)',
      flexDirection: 'column-reverse',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    };
    if (position === 'left') return {
      ...base,
      left: 0,
      top: Math.max(40, Math.min(window.innerHeight - 40, xy.y)),
      transform: 'translateY(-50%)',
      flexDirection: 'row',
    };
    // right
    return {
      ...base,
      right: 0,
      top: Math.max(40, Math.min(window.innerHeight - 40, xy.y)),
      transform: 'translateY(-50%)',
      flexDirection: 'row-reverse',
    };
  })();

  const barStyle = {
    display:        'flex',
    flexDirection:  isSide ? 'column' : 'row',
    alignItems:     'center',
    gap:            4,
    padding:        isSide ? '10px 6px' : '6px 10px',
    background:     'rgba(109, 40, 217, 0.15)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border:         '1px solid rgba(168, 85, 247, 0.25)',
    boxShadow:      '0 4px 24px rgba(168, 85, 247, 0.2), 0 1px 0 rgba(168,85,247,0.1)',
    cursor:         hovered ? 'grab' : 'default',
    ...(position === 'top'    && { borderRadius: '0 0 14px 14px', borderTop: 'none' }),
    ...(position === 'bottom' && { borderRadius: '14px 14px 0 0', borderBottom: 'none' }),
    ...(position === 'left'   && { borderRadius: '0 14px 14px 0', borderLeft: 'none' }),
    ...(position === 'right'  && { borderRadius: '14px 0 0 14px', borderRight: 'none' }),
  };

  const urlBarStyle = {
    display:        'flex',
    alignItems:     'center',
    gap:            6,
    background:     'rgba(109, 40, 217, 0.15)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border:         '1px solid rgba(168, 85, 247, 0.25)',
    boxShadow:      '0 4px 24px rgba(168, 85, 247, 0.15)',
    borderRadius:   10,
    minWidth:       220,
    minWidth:       360,
    padding:        '8px 12px', 
  };

  const btnStyle = (active = false) => ({
    width:          isSide ? 30 : 34,
    height:         isSide ? 30 : 34,
    borderRadius:   9,
    border:         'none',
    background:     active ? 'rgba(168,85,247,0.15)' : 'transparent',
    color:          active ? '#a855f7' : 'rgba(168, 85, 247, 0.7)',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    transition:     'background 150ms, color 150ms',
    flexShrink:     0,
  });

  const isHome = pathname === '/home' || pathname === '/';

  // Drag handle dots
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

  // ── URL editor bar ───────────────────────────────────────────────────────────
  const UrlBar = urlOpen && (
    <div style={urlBarStyle} onMouseDown={e => e.stopPropagation()}>
      <input
        ref={urlInputRef}
        value={urlValue}
        onChange={e => setUrlValue(e.target.value)}
        onKeyDown={handleUrlKey}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(168,85,247,0.3)',
          borderRadius: 7,
          color: '#111827',
          fontSize: '11px',
          padding: '5px 9px',
          outline: 'none',
          fontFamily: 'monospace',
          minWidth: 0,
        }}
        onFocus={e => e.target.select()}
      />
      <button
        onClick={handleUrlGo}
        style={{ ...btnStyle(), color: '#a855f7', fontSize: 11, fontWeight: 700, width: 'auto', padding: '0 8px' }}
      >Go</button>
      <button
        onClick={() => setUrlOpen(false)}
        style={btnStyle()}
        title="Close URL editor"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );

  return (
    <div style={containerStyle} onMouseDown={onMouseDown}>

      {/* URL bar — appears above nav for bottom, or beside for sides */}
      {(position === 'bottom' || position === 'right') && UrlBar}

      <div
        style={barStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <DragHandle />

        {/* Back */}
        <button
          style={btnStyle()}
          onClick={() => { if (!didDrag.current) navigate(-1); }}
          title="Back"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <ChevronLeft size={isSide ? 16 : 18} strokeWidth={2.5} />
        </button>

        {/* Home — center */}
        <button
          style={btnStyle(isHome)}
          onClick={() => { if (!didDrag.current) navigate('/home'); }}
          title="Home"
          onMouseEnter={e => { if (!isHome) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
          onMouseLeave={e => { if (!isHome) e.currentTarget.style.background = isHome ? 'rgba(168,85,247,0.15)' : 'transparent'; }}
        >
          <Home size={isSide ? 15 : 17} strokeWidth={2.2} />
        </button>

        {/* Forward */}
        <button
          style={btnStyle()}
          onClick={() => { if (!didDrag.current) navigate(1); }}
          title="Forward"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <ChevronRight size={isSide ? 16 : 18} strokeWidth={2.5} />
        </button>

        {/* Divider */}
        <div style={{
          background: 'rgba(168,85,247,0.2)',
          borderRadius: 99,
          ...(isSide
            ? { width: 20, height: 1, margin: '2px 0' }
            : { width: 1,  height: 20, margin: '0 2px' }),
        }} />

        {/* Refresh — outer edge */}
        <button
          style={btnStyle()}
          onClick={handleRefresh}
          title="Refresh"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <RotateCw size={isSide ? 14 : 15} strokeWidth={2.2} />
        </button>

        {/* URL toggle — top/bottom only */}
        {!isSide && (
          <button
            style={btnStyle(urlOpen)}
            onClick={handleUrlToggle}
            title={urlOpen ? 'Close URL editor' : 'Open URL editor'}
            onMouseDown={e => e.stopPropagation()}
            onMouseEnter={e => { if (!urlOpen) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
            onMouseLeave={e => { if (!urlOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <Link2 size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* URL bar — appears below nav for top position, or beside for left */}
      {(position === 'top' || position === 'left') && UrlBar}

    </div>
  );
}