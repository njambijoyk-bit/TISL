import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Zap, Award, Sparkles, Package,
  TrendingUp, BadgePercent, Truck,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ClockDialHero v2 — single-radial ambient glow (matches v1 look), v2 layout
// Props: slides, countdown, loading  (same as HeroCarousel)
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_TOKENS = {
  deal: {
    eyebrow: 'Flash Deal',
    Icon: Zap,
    glowA: 'rgba(239,68,68,0.28)',
    glowB: 'rgba(239,68,68,0.10)',
    ring: 'rgba(239,68,68,0.55)',
    accent: '#f87171',
    accentDim: 'rgba(248,113,113,0.18)',
    accentBorder: 'rgba(248,113,113,0.35)',
    btnBg: '#ef4444',
    btnText: '#fff',
  },
  featured: {
    eyebrow: 'Featured',
    Icon: Award,
    glowA: 'rgba(168,85,247,0.26)',
    glowB: 'rgba(168,85,247,0.09)',
    ring: 'rgba(168,85,247,0.55)',
    accent: '#a855f7',
    accentDim: 'rgba(168,85,247,0.18)',
    accentBorder: 'rgba(168,85,247,0.35)',
    btnBg: '#7c3aed',
    btnText: '#fff',
  },
  new: {
    eyebrow: 'New Arrival',
    Icon: Sparkles,
    glowA: 'rgba(16,185,129,0.24)',
    glowB: 'rgba(16,185,129,0.08)',
    ring: 'rgba(16,185,129,0.55)',
    accent: '#34d399',
    accentDim: 'rgba(52,211,153,0.15)',
    accentBorder: 'rgba(52,211,153,0.35)',
    btnBg: '#10b981',
    btnText: '#fff',
  },
};

const FALLBACK   = TYPE_TOKENS.featured;
const ORBIT_R    = 188;
const CARD_SIZE  = 108;
const DIAL_SIZE  = 420;

// ─── helpers ─────────────────────────────────────────────────────────────────
function polarToXY(angleDeg, r, cx = 0, cy = 0) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function discountPct(price, original) {
  const p = Number(price), o = Number(original);
  if (!p || !o || o <= p) return null;
  return Math.round((1 - p / o) * 100);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function DialSkeleton() {
  return (
    <div style={{ position: 'relative', background: '#09090f', borderBottom: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 420, height: 420, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', animation: 'cdh-pulse 1.8s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        </div>
      </div>
      <style>{`@keyframes cdh-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

// ─── Countdown ───────────────────────────────────────────────────────────────
function CountdownBlock({ countdown, accent }) {
  const segments = [
    { v: countdown.h, l: 'HRS' },
    { v: countdown.m, l: 'MIN' },
    { v: countdown.s, l: 'SEC' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 24 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: accent, paddingBottom: 20, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
        Ends in
      </span>
      {segments.map(({ v, l }, i) => (
        <div key={l} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          {i > 0 && (
            <span style={{ color: accent, fontWeight: 900, fontSize: '1.25rem', lineHeight: 1, paddingBottom: 20, opacity: 0.8 }}>:</span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 42, height: 42,
              background: 'rgba(0,0,0,0.55)',
              border: `1px solid ${accent}44`,
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 900, color: accent, fontVariantNumeric: 'tabular-nums' }}>
                {String(v ?? 0).padStart(2, '0')}
              </span>
            </div>
            <span style={{ fontSize: 8, fontWeight: 800, color: `${accent}88`, marginTop: 4, letterSpacing: '0.1em' }}>{l}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DialCard ─────────────────────────────────────────────────────────────────
function DialCard({ product, isActive, onClick }) {
  const t = TYPE_TOKENS[product._type] || FALLBACK;
  const imgSrc = product.main_image_url || product.main_image || product.image_url || product.images?.[0];
  const pct = discountPct(product.price, product.original_price);

  return (
    <button
      onClick={onClick}
      aria-pressed={isActive}
      style={{
        position: 'absolute',
        width: CARD_SIZE,
        height: CARD_SIZE,
        transform: 'translate(-50%, -50%)',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
      }}
    >
      {/* Glow halo */}
      <span style={{
        position: 'absolute', inset: -7, borderRadius: '50%',
        background: isActive ? t.glowA : 'transparent',
        boxShadow: isActive ? `0 0 0 2px ${t.ring}` : 'none',
        transition: 'all 0.35s ease',
        pointerEvents: 'none',
      }} />

      <span style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        width: '100%', height: '100%',
        borderRadius: 16,
        background: isActive
          ? `linear-gradient(145deg, ${t.accentDim} 0%, rgba(12,12,16,0.97) 100%)`
          : 'rgba(14,14,18,0.94)',
        border: isActive ? `1.5px solid ${t.accentBorder}` : '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        boxShadow: isActive
          ? `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${t.accentBorder}`
          : '0 4px 16px rgba(0,0,0,0.4)',
        transform: isActive ? 'scale(1.1)' : 'scale(1)',
        padding: '8px 6px 6px',
        gap: 4,
      }}>
        <span style={{
          width: 44, height: 44, borderRadius: 10, overflow: 'hidden',
          background: 'rgba(255,255,255,0.04)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {imgSrc
            ? <img src={imgSrc} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Package size={20} color="rgba(255,255,255,0.25)" />}
        </span>

        <span style={{
          fontSize: 10, fontWeight: 700,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
          textAlign: 'center', lineHeight: 1.25,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          transition: 'color 0.3s',
        }}>
          {product.name}
        </span>

        <span style={{
          fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 6,
          background: isActive ? t.accentDim : 'rgba(255,255,255,0.06)',
          color: isActive ? t.accent : 'rgba(255,255,255,0.35)',
          letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.3s',
        }}>
          {pct ? `-${pct}%` : t.eyebrow}
        </span>
      </span>
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ClockDialHero({ slides = [], countdown, loading }) {
  const [activeIdx, setActiveIdx]         = useState(0);
  const [dialAngle, setDialAngle]         = useState(0);
  const [animating, setAnimating]         = useState(false);
  const [detailVisible, setDetailVisible] = useState(true);
  const autoRef = useRef(null);
  const total   = slides.length;
  const cx      = DIAL_SIZE / 2;
  const cy      = DIAL_SIZE / 2;

  const ringOffset = useCallback((idx) => -(idx / total) * 360, [total]);

  const goTo = useCallback((idx) => {
    if (animating || idx === activeIdx) return;
    setDetailVisible(false);
    setAnimating(true);
    setTimeout(() => {
      setActiveIdx(idx);
      setDialAngle(ringOffset(idx));
      setAnimating(false);
      setDetailVisible(true);
    }, 300);
  }, [animating, activeIdx, ringOffset]);

  const advance    = useCallback(() => goTo((activeIdx + 1) % total), [goTo, activeIdx, total]);
  const resetAuto  = useCallback(() => {
    clearInterval(autoRef.current);
    if (total > 1) autoRef.current = setInterval(advance, 4000);
  }, [advance, total]);

  useEffect(() => { resetAuto(); return () => clearInterval(autoRef.current); }, [resetAuto]);
  useEffect(() => { setDialAngle(ringOffset(activeIdx)); }, [activeIdx, ringOffset]);

  if (loading) return <DialSkeleton />;
  if (!total)  return null;

  const active   = slides[activeIdx];
  const t        = TYPE_TOKENS[active._type] || FALLBACK;
  const TypeIcon = t.Icon;
  const imgSrc   = active.main_image_url || active.main_image || active.image_url || active.images?.[0];
  const pct      = discountPct(active.price, active.original_price);
  const isDeal   = active._type === 'deal';
  const ctaLabel = isDeal ? 'Grab This Deal' : active._type === 'new' ? 'Shop Now' : 'View Product';

  return (
    <>
      <style>{`
        .cdh-outer {
          position: relative;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          overflow: hidden;
        }

        /* Single strong radial — same approach as v1 */
        .cdh-glow {
          pointer-events: none;
          position: absolute;
          inset: 0;
          transition: background 0.7s ease;
        }

        .cdh-grid {
          pointer-events: none;
          position: absolute;
          inset: 0;
          opacity: 0.05;
          background-image:
            linear-gradient(currentColor 1px, transparent 1px),
            linear-gradient(90deg, currentColor 1px, transparent 1px);
          background-size: 48px 48px;
        }

        .dark .cdh-grid {
          opacity: 0.022;
        }

        .cdh-inner {
          position: relative;
          z-index: 1;
          max-width: 1280px;
          margin: 0 auto;
          padding: 48px 40px;
          display: flex;
          flex-direction: row;
          align-items: center;
          flex-wrap: nowrap;
          gap: 0;
        }

        .cdh-dial-col {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-right: 24px;
        }

        /* Dotted vertical divider */
        .cdh-divider {
          flex-shrink: 0;
          width: 1px;
          align-self: stretch;
          margin: 0 8px;
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.14) 0px,
            rgba(255,255,255,0.14) 4px,
            transparent 4px,
            transparent 11px
          );
        }

        .cdh-detail-col {
          flex: 1;
          min-width: 0;
          padding-left: 52px;
        }

        /* ── Mobile ── */
        @media (max-width: 860px) {
          .cdh-inner {
            flex-direction: column;
            align-items: center;
            padding: 36px 20px 40px;
          }
          .cdh-dial-col {
            padding-right: 0;
          }
          .cdh-divider {
            width: 72%;
            height: 1px;
            align-self: auto;
            margin: 24px 0;
            background: repeating-linear-gradient(
              to right,
              rgba(255,255,255,0.14) 0px,
              rgba(255,255,255,0.14) 4px,
              transparent 4px,
              transparent 11px
            );
          }
          .cdh-detail-col {
            padding-left: 0;
            width: 100%;
            max-width: 480px;
          }
        }

        @media (max-width: 480px) {
          .cdh-dial-scale {
            transform: scale(0.78);
            transform-origin: top center;
            margin-bottom: -80px;
          }
          .cdh-inner { padding: 24px 16px 32px; }
        }
      `}</style>

      <div className="cdh-outer">

        {/* Single strong centered radial glow — like v1 */}
        <div
          className="cdh-glow"
          style={{
            background: `radial-gradient(circle at 30% 50%, ${t.glowA} 0%, transparent 58%)`,
          }}
        />
        <div className="cdh-grid" />

        <div className="cdh-inner">

          {/* ── DIAL ─────────────────────────────────────────────────────── */}
          <div className="cdh-dial-col">
            <div className="cdh-dial-scale" style={{ position: 'relative', width: DIAL_SIZE, height: DIAL_SIZE }}>

              {/* Outer decorative ring */}
              <div style={{
                position: 'absolute',
                inset: -14,
                borderRadius: '50%',
                border: `1px solid ${t.ring}`,
                opacity: 0.25,
                transition: 'border-color 0.6s',
                pointerEvents: 'none',
              }} />

              <div style={{ position: 'absolute', inset: 0 }}>

                {/* Inner orbit ring */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '0.5px dashed rgba(255,255,255,0.06)',
                  pointerEvents: 'none',
                }} />

                {/* Rotating layer */}
                <div style={{
                  position: 'absolute', inset: 0,
                  transform: `rotate(${dialAngle}deg)`,
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: 'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
                }}>
                  {/* Spokes */}
                  {slides.map((_, i) => (
                    <div key={`spoke-${i}`} style={{
                      position: 'absolute', top: cy, left: cx,
                      width: ORBIT_R, height: 1,
                      background: 'rgba(255,255,255,0.04)',
                      transformOrigin: 'left center',
                      transform: `rotate(${(i / total) * 360 - 90}deg)`,
                    }} />
                  ))}

                  {/* Cards */}
                  {slides.map((product, i) => {
                    const pos = polarToXY((i / total) * 360, ORBIT_R, cx, cy);
                    return (
                      <div key={product.id ?? i} style={{
                        position: 'absolute', left: pos.x, top: pos.y,
                        transform: `translate(-50%, -50%) rotate(${-dialAngle}deg)`,
                        transition: 'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
                        zIndex: i === activeIdx ? 10 : 1,
                      }}>
                        <DialCard
                          product={product}
                          isActive={i === activeIdx}
                          onClick={() => { goTo(i); resetAuto(); }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Centre hub */}
                <div
                  onClick={() => { advance(); resetAuto(); }}
                  title="Next product"
                  style={{
                    position: 'absolute', top: cy, left: cx,
                    transform: 'translate(-50%,-50%)',
                    width: 92, height: 92, borderRadius: '50%',
                    background: 'rgba(8,8,15,0.97)',
                    border: `1.5px solid ${t.ring}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20, cursor: 'pointer',
                    boxShadow: `0 0 32px ${t.glowA}, inset 0 0 20px rgba(0,0,0,0.6)`,
                    transition: 'border-color 0.5s, box-shadow 0.5s',
                  }}
                >
                  <TypeIcon size={22} color={t.accent} strokeWidth={2} />
                  <span style={{
                    fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                    letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', marginTop: 5,
                  }}>
                    {activeIdx + 1}/{total}
                  </span>
                </div>

              </div>

              {/* Dot indicators */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 }}>
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { goTo(i); resetAuto(); }}
                    aria-label={`Go to product ${i + 1}`}
                    style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
                  >
                    <span style={{
                      display: 'block', borderRadius: 9999,
                      transition: 'all 0.3s',
                      width: i === activeIdx ? 22 : 7,
                      height: 7,
                      background: i === activeIdx ? t.accent : 'rgba(255,255,255,0.18)',
                      boxShadow: i === activeIdx ? `0 0 8px ${t.accent}99` : 'none',
                    }} />
                  </button>
                ))}
              </div>

            </div>
          </div>

          {/* ── DOTTED DIVIDER ────────────────────────────────────────────── */}
          <div className="cdh-divider" />

          {/* ── DETAIL PANEL ─────────────────────────────────────────────── */}
          <div
            className="cdh-detail-col"
            style={{
              opacity: detailVisible ? 1 : 0,
              transform: detailVisible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 0.28s ease, transform 0.28s ease',
            }}
          >

            {/* Eyebrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 9999,
                fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em',
                background: t.accentDim, border: `1px solid ${t.accentBorder}`, color: t.accent,
              }}>
                <TypeIcon size={9} />
                {t.eyebrow}
              </span>
              {active.category?.name && (
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)',
                }}>
                  {active.category.name}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 style={{
              fontWeight: 900, lineHeight: 1.03,
              color: '#ffffff',
              marginBottom: 14,
              fontSize: 'clamp(1.9rem, 3.2vw, 3.1rem)',
              letterSpacing: '-0.02em',
            }}>
              {active.name}
            </h1>

            {/* Description */}
            {(active.short_description || active.description) && (
              <p style={{
                color: 'rgba(255,255,255,0.58)',
                fontSize: 14, lineHeight: 1.7,
                marginBottom: 22, maxWidth: 440,
                display: '-webkit-box', WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {active.short_description ?? active.description}
              </p>
            )}

            {/* Price row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, color: t.accent, letterSpacing: '-0.01em' }}>
                KSh {Number(active.price).toLocaleString()}
              </span>
              {active.original_price && (
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>
                  KSh {Number(active.original_price).toLocaleString()}
                </span>
              )}
              {pct > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 8,
                  color: t.accent, background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                }}>
                  -{pct}% OFF
                </span>
              )}
            </div>

            {/* Countdown — deals only */}
            {isDeal && countdown && (
              <CountdownBlock countdown={countdown} accent={t.accent} />
            )}

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
              <Link
                to={`/products/${active.id}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '11px 22px', borderRadius: 12,
                  fontWeight: 900, fontSize: 13,
                  background: t.btnBg, color: t.btnText,
                  textDecoration: 'none', transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {ctaLabel} <ArrowRight size={14} />
              </Link>
              <Link
                to="/products"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '11px 22px', borderRadius: 12,
                  fontWeight: 600, fontSize: 13,
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.05)',
                  textDecoration: 'none', transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Browse All
              </Link>
            </div>

            {/* Trust pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {[
                { Icon: Truck,        text: 'Nationwide Delivery' },
                { Icon: BadgePercent, text: 'Best Price Guarantee' },
                { Icon: TrendingUp,   text: 'Updated Weekly' },
              ].map(({ Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon size={11} color={`${t.accent}88`} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.33)' }}>{text}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}