/**
 * AlgorithmBanner
 *
 * Floating panel anchored to the vertical centre of the left edge.
 * - Expanded: shows segment badge + top insight + loyalty points
 * - Collapsed: icon pill that re-opens it
 * - Only renders for authenticated customers (not admins/staff)
 * - Persists collapsed state in localStorage
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store';
import { useCustomerScore } from '../../hooks/useCustomerScore';
import {
  Trophy, Star, Zap, Moon, Sparkles, HandMetal,
  Gift, Rocket, RefreshCw, Heart, Award,
} from 'lucide-react';

// ── Segment config ────────────────────────────────────────────────────────────
const SEGMENT_META = {
  champion: { icon: Trophy,   label: 'Champion', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.30)'  },
  loyal:    { icon: Star,     label: 'Loyal',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.30)'  },
  at_risk:  { icon: Zap,      label: 'At Risk',  color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.30)'  },
  dormant:  { icon: Moon,     label: 'Dormant',  color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.30)' },
  new:      { icon: Sparkles, label: 'New',      color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.30)'  },
  guest:    { icon: HandMetal,label: 'Guest',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.30)'  },
};

const INSIGHT_ICONS = {
  welcome:  Heart,
  champion: Trophy,
  winback:  RefreshCw,
  dormant:  Moon,
  redeem:   Gift,
  points:   Star,
  tier:     Rocket,
};

const STORAGE_KEY = 'algo_banner_collapsed';

export default function AlgorithmBanner() {
  const { isAuthenticated, user } = useAuthStore();
  const profile = useCustomerScore();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch { return false; }
  });
  const [visible, setVisible] = useState(false);

    const [dragTop, setDragTop]   = useState(null); // null = default 50% centered
    const dragging  = useRef(false);
    const didDrag   = useRef(false);
    const dragStart = useRef({ my: 0, top: 0 });

    const getInitialTop = () => dragTop ?? (window.innerHeight / 2);

    const startDrag = useCallback((e) => {
    e.preventDefault();
    didDrag.current  = false;
    dragging.current = true;
    dragStart.current = { my: e.clientY, top: getInitialTop() };

    const onMove = (e) => {
        if (!dragging.current) return;
        const dy = e.clientY - dragStart.current.my;
        if (Math.abs(dy) > 3) didDrag.current = true;
        const next = Math.max(40, Math.min(window.innerHeight - 40, dragStart.current.top + dy));
        setDragTop(next);
    };
    const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    }, [dragTop]);

  // Delay mount so it doesn't flash during initial auth check
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, []);

  const handleCollapse = () => {
    setCollapsed(true);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
  };

  const handleExpand = () => {
    setCollapsed(false);
    try { localStorage.setItem(STORAGE_KEY, 'false'); } catch {}
  };

  // Only show for authenticated non-admin customers
  const role = user?.role;
  const isCustomerFacing = isAuthenticated && !['admin', 'super_admin', 'staff', 'finance'].includes(role);

  if (!visible || !isCustomerFacing || profile.segment === 'guest') return null;

  const meta    = SEGMENT_META[profile.segment] ?? SEGMENT_META.loyal;
  const insight = profile.insights?.[0] ?? null;

  // ── Collapsed pill ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
        <button
        onMouseDown={startDrag}
        onClick={() => { if (!didDrag.current) handleExpand(); }}
        title="Your personalised insights"
        style={{
            position: 'fixed',
            left: 0,
            top: dragTop !== null ? dragTop : '50%',
            transform: dragTop !== null ? 'translateY(-50%)' : 'translateY(-50%)',
            zIndex: 900,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4,
            width: 36, padding: '14px 0',
            borderRadius: '0 10px 10px 0',
            border: `1px solid ${meta.border}`,
            borderLeft: 'none',
            background: 'var(--bg-primary, #fff)',
            boxShadow: `3px 0 16px rgba(0,0,0,0.08), inset -3px 0 0 ${meta.color}`,
            cursor: dragging.current ? 'grabbing' : 'grab',
            transition: 'box-shadow 0.2s',
            userSelect: 'none',
        }}
        onMouseEnter={e => {
            if (dragging.current) return;
            e.currentTarget.style.boxShadow = `4px 0 20px rgba(0,0,0,0.13), inset -4px 0 0 ${meta.color}`;
            e.currentTarget.style.transform = 'translateY(-50%) translateX(2px)';
        }}
        onMouseLeave={e => {
            e.currentTarget.style.boxShadow = `3px 0 16px rgba(0,0,0,0.08), inset -3px 0 0 ${meta.color}`;
            e.currentTarget.style.transform = 'translateY(-50%)';
        }}
        >
        <meta.icon size={16} color={meta.color} strokeWidth={2.2} />
        {profile.loyaltyPoints > 0 && (
            <span style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed',
            fontSize: 9, fontWeight: 800, color: meta.color,
            letterSpacing: '0.05em', marginTop: 4,
            }}>
            {profile.loyaltyPoints >= 1000
                ? `${(profile.loyaltyPoints / 1000).toFixed(1)}k pts`
                : `${profile.loyaltyPoints} pts`}
            </span>
        )}
        </button>
    );
    }

  // ── Expanded panel ────────────────────────────────────────────────────────
  return (
    <div style={{
    position: 'fixed',
    left: 0,
    top: dragTop !== null ? dragTop : '50%',
    transform: 'translateY(-50%)',
    zIndex: 900,
    width: 256,
    borderRadius: '0 16px 16px 0',
    border: `1px solid ${meta.border}`,
    borderLeft: 'none',
    background: 'var(--bg-primary, #fff)',
    boxShadow: '4px 0 24px rgba(0,0,0,0.10)',
    overflow: 'hidden',
    animation: 'bannerSlideIn 0.28s ease',
    userSelect: 'none',
    }}>
      <style>{`
        @keyframes bannerSlideIn {
          from { opacity: 0; transform: translateY(-50%) translateX(-16px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div 
      onMouseDown={startDrag}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px 10px 14px',
        background: meta.bg,
        borderBottom: `1px solid ${meta.border}`,
        cursor: dragging.current ? 'grabbing' : 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <meta.icon size={18} color={meta.color} strokeWidth={2.2} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: meta.color, letterSpacing: '0.04em' }}>
              {profile.customerName}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 10, fontWeight: 700,
              color: meta.color,
              background: `${meta.color}18`,
              border: `1px solid ${meta.border}`,
              borderRadius: 99, padding: '1px 7px',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {meta.label}
            </div>
          </div>
        </div>

        <button
        onMouseDown={e => e.stopPropagation()}
          onClick={handleCollapse}
          title="Minimise"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary, #6b7280)',
            fontSize: 16, lineHeight: 1, padding: 4,
            borderRadius: 6,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          ×
        </button>
      </div>

      {/* ── Loyalty bar ── */}
      {profile.loyaltyPoints >= 0 && (
        <div style={{ padding: '10px 14px 0', }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Loyalty Points
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#a855f7' }}>
              {profile.loyaltyPoints.toLocaleString()}
            </span>
          </div>
          {/* Progress toward 1000-point redemption */}
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(168,85,247,0.12)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (profile.loyaltyPoints / 1000) * 100)}%`,
              background: 'linear-gradient(90deg, #a855f7, #7c3aed)',
              borderRadius: 99,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', marginTop: 4 }}>
            {profile.loyaltyPoints >= 1000
              ? '🎁 Ready to redeem!'
              : `${(1000 - profile.loyaltyPoints).toLocaleString()} pts to first redemption`}
          </div>
        </div>
      )}

      {/* ── Insights ── */}
      {profile.insights.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profile.insights.slice(0, 2).map((ins, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(168,85,247,0.05)',
                border: '1px solid rgba(168,85,247,0.10)',
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                  {(() => { const Icon = INSIGHT_ICONS[ins.type] ?? Award; return <Icon size={13} color="#a855f7" strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />; })()}
                </span>
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-primary, #111827)', fontWeight: 500 }}>
                  {ins.message}
                </p>
              </div>
              {ins.cta && ins.ctaLink && (
                <button
                  onClick={() => navigate(ins.ctaLink)}
                  style={{
                    marginTop: 7,
                    width: '100%',
                    padding: '5px 0',
                    borderRadius: 7,
                    border: 'none',
                    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  {ins.cta} →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Footer — tier progress ── */}
      {profile.tierNext && (
        <div style={{
          padding: '8px 14px 12px',
          borderTop: '1px solid rgba(168,85,247,0.08)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Rocket size={12} color="#a855f7" strokeWidth={2.2} />
          <span style={{ fontSize: 10, color: 'var(--text-secondary, #6b7280)', fontWeight: 500, lineHeight: 1.4 }}>
            Keep ordering to reach{' '}
            <strong style={{ color: '#a855f7' }}>
              {profile.tierNext.charAt(0).toUpperCase() + profile.tierNext.slice(1)}
            </strong>{' '}
            tier
          </span>
        </div>
      )}
    </div>
  );
}