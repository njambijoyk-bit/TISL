/**
 * PWANavBar
 * - Only renders in PWA mode on non-touch (desktop) devices
 * - Draggable to top, bottom, left-side, or right-side
 * - Fades out on scroll, fades back in when scroll stops
 * - Side position: back + forward only (vertical pill)
 * - Top/Bottom position: back + forward + home (horizontal bar)
 * - Persists last position in localStorage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';

const isPWA = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isTouchDevice = () =>
  window.matchMedia('(pointer: coarse)').matches ||
  navigator.maxTouchPoints > 1;

const POSITIONS = ['top', 'bottom', 'left', 'right'];
const STORAGE_KEY = 'pwa_navbar_position';

function getInitialPosition() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (POSITIONS.includes(saved)) return saved;
  } catch {}
  return 'bottom';
}

export default function PWANavBar() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const [position, setPosition] = useState(getInitialPosition);
  const [opacity,  setOpacity]  = useState(1);
  const [hovered, setHovered] = useState(false);
  const scrollTimer = useRef(null);
  const dragging    = useRef(false);
  const didDrag     = useRef(false);
  const dragStart   = useRef({ x: 0, y: 0 });

  // Don't render on mobile or outside PWA
  if (!isPWA() || isTouchDevice()) return null;

  // ── Scroll fade ─────────────────────────────────────────────────────────────
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

  // ── Drag to snap ─────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current  = true;
    didDrag.current   = false;
    dragStart.current = { x: e.clientX, y: e.clientY };

    const onMove = (e) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) didDrag.current = true;
    };

    const onUp = (e) => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      if (!didDrag.current) return;

      // Snap to nearest edge based on drop position
      const cx = e.clientX;
      const cy = e.clientY;
      const W  = window.innerWidth;
      const H  = window.innerHeight;

      const distTop    = cy;
      const distBottom = H - cy;
      const distLeft   = cx;
      const distRight  = W - cx;

      const min = Math.min(distTop, distBottom, distLeft, distRight);
      let newPos = 'bottom';
      if (min === distTop)    newPos = 'top';
      if (min === distBottom) newPos = 'bottom';
      if (min === distLeft)   newPos = 'left';
      if (min === distRight)  newPos = 'right';

      setPosition(newPos);
      try { localStorage.setItem(STORAGE_KEY, newPos); } catch {}
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Styles ───────────────────────────────────────────────────────────────────
  const isSide = position === 'left' || position === 'right';

  const containerStyle = {
    position:   'fixed',
    zIndex:     500,
    opacity,
    transition: 'opacity 400ms ease',
    userSelect: 'none',
    ...(position === 'top'    && { top: 0,    left: '50%', transform: 'translateX(-50%)', paddingTop: 'env(safe-area-inset-top, 0px)' }),
    ...(position === 'bottom' && { bottom: 0, left: '50%', transform: 'translateX(-50%)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }),
    ...(position === 'left'   && { left: 0,   top: '50%',  transform: 'translateY(-50%)' }),
    ...(position === 'right'  && { right: 0,  top: '50%',  transform: 'translateY(-50%)' }),
  };

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
    cursor: hovered ? 'grab' : 'default',
    ...(position === 'top'    && { borderRadius: '0 0 14px 14px', borderTop: 'none' }),
    ...(position === 'bottom' && { borderRadius: '14px 14px 0 0', borderBottom: 'none' }),
    ...(position === 'left'   && { borderRadius: '0 14px 14px 0', borderLeft: 'none' }),
    ...(position === 'right'  && { borderRadius: '14px 0 0 14px', borderRight: 'none' }),
  };

  const btnStyle = (active = false) => ({
    width:          isSide ? 30 : 34,
    height:         isSide ? 30 : 34,
    borderRadius:   9,
    border:         'none',
    background:     active ? 'rgba(168,85,247,0.12)' : 'transparent',
    color: active ? '#a855f7' : 'rgba(168, 85, 247, 0.7)',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    transition:     'background 150ms, color 150ms',
    flexShrink:     0,
  });

  const isHome = pathname === '/home' || pathname === '/';

  return (
    <div style={containerStyle} onMouseDown={onMouseDown}>
      <div
        style={barStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseDown={onMouseDown}
        >
        {/* Drag handle — only visible on hover */}
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: isSide ? '4px 0' : '0 4px',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 200ms ease',
            pointerEvents: 'none',
        }}>
            {isSide ? (
            // vertical dots for side position
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[0,1,2].map(i => (
                <div key={i} style={{ display: 'flex', gap: 2 }}>
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.4)' }} />
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.4)' }} />
                </div>
                ))}
            </div>
            ) : (
            // horizontal dots for top/bottom
            <div style={{ display: 'flex', gap: 2 }}>
                {[0,1,2].map(i => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.4)' }} />
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.4)' }} />
                </div>
                ))}
            </div>
            )}
        </div>
        <button
          style={btnStyle()}
          onClick={() => { if (!didDrag.current) navigate(-1); }}
          title="Back"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft size={isSide ? 16 : 18} strokeWidth={2.5} />
        </button>

        <button
          style={btnStyle()}
          onClick={() => { if (!didDrag.current) navigate(1); }}
          title="Forward"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight size={isSide ? 16 : 18} strokeWidth={2.5} />
        </button>

        {/* Home only on top/bottom */}
        {!isSide && (
          <button
            style={btnStyle(isHome)}
            onClick={() => { if (!didDrag.current) navigate('/home'); }}
            title="Home"
            onMouseEnter={e => { if (!isHome) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
            onMouseLeave={e => { if (!isHome) e.currentTarget.style.background = 'transparent'; }}
          >
            <Home size={16} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}