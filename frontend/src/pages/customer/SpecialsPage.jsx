import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Tag, Zap, Clock, Sparkles, ArrowRight, Gavel, FileText,
  ShoppingCart, Heart, Star, Package, Wrench, ChevronRight,
  ChevronLeft, Flame, TrendingUp, BadgePercent, Truck, Award, Wand2
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useProductStore from '../../store/productStore';
import auctionsAPI from '../../api/auctions';
import useServiceStore from '../../store/serviceStore';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import toast from 'react-hot-toast';
import CollapsedProductCard from '../../components/products/CollapsedProductCard';
import AuctionCard from '../../components/products/AuctionCard';
import CollapsedServiceCard from '../../components/services/CollapsedServiceCard';

// ─────────────────────────────────────────────────────────────────────────────
// Countdown hook
// ─────────────────────────────────────────────────────────────────────────────
function useCountdown() {
  const [time, setTime] = useState({ h: 0, m: 0, s: 0 });
  useEffect(() => {
    const getMidnight = () => {
      const d = new Date();
      d.setHours(24, 0, 0, 0);
      return d.getTime();
    };
    const tick = () => {
      const diff = Math.max(0, getMidnight() - Date.now());
      setTime({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroCarousel
// ─────────────────────────────────────────────────────────────────────────────
function HeroCarousel({ slides, countdown, loading }) {
  const [index, setIndex]     = useState(0);
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef(null);

  const goTo = useCallback((next) => {
    setVisible(false);
    setTimeout(() => { setIndex(next); setVisible(true); }, 280);
  }, []);

  const advance = useCallback(() => {
    goTo((prev) => (prev + 1) % slides.length);
  }, [goTo, slides.length]);

  const resetTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    if (slides.length > 1) intervalRef.current = setInterval(advance, 6000);
  }, [advance, slides.length]);

  useEffect(() => { resetTimer(); return () => clearInterval(intervalRef.current); }, [resetTimer]);

  const handlePrev = () => { goTo((index - 1 + slides.length) % slides.length); resetTimer(); };
  const handleNext = () => { goTo((index + 1) % slides.length); resetTimer(); };
  const handleDot  = (i) => { goTo(i); resetTimer(); };

  if (loading) {
    return (
      <div className="relative bg-zinc-950 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-24">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 space-y-5">
              <div className="h-4 w-32 bg-zinc-800 animate-pulse rounded-full" />
              <div className="h-14 w-3/4 bg-zinc-800 animate-pulse rounded-xl" />
              <div className="h-14 w-1/2 bg-zinc-800 animate-pulse rounded-xl" />
              <div className="h-4 w-full bg-zinc-800 animate-pulse rounded" />
              <div className="h-4 w-5/6 bg-zinc-800 animate-pulse rounded" />
              <div className="flex gap-3 pt-2">
                <div className="h-11 w-36 bg-zinc-800 animate-pulse rounded-lg" />
                <div className="h-11 w-32 bg-zinc-800 animate-pulse rounded-lg" />
              </div>
            </div>
            <div className="w-full lg:w-[500px] aspect-[4/3] bg-zinc-800 animate-pulse rounded-2xl flex-shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  if (!slides.length) return null;

  const slide = slides[index];
  const imgSrc = slide.main_image_url || slide.main_image || slide.image_url || slide.images?.[0];

  const isDeal     = slide._type === 'deal';
  const isFeatured = slide._type === 'featured';
  const isNew      = slide._type === 'new';

  const discountPct =
    slide.original_price && slide.price
      ? Math.round((1 - Number(slide.price) / Number(slide.original_price)) * 100)
      : null;

  const typeTokens = {
    deal:     { pill: 'bg-red-500 text-white',     accentText: 'text-red-400',     accentBtn: 'bg-red-500 hover:bg-red-400 text-white',        glow: 'from-red-900/15',     eyebrow: 'Flash Deal'  },
    featured: { pill: 'bg-yellow-400 text-black',  accentText: 'text-yellow-400',  accentBtn: 'bg-yellow-400 hover:bg-yellow-300 text-black',   glow: 'from-yellow-900/10',  eyebrow: 'Featured'    },
    new:      { pill: 'bg-emerald-500 text-white', accentText: 'text-emerald-400', accentBtn: 'bg-emerald-500 hover:bg-emerald-400 text-white', glow: 'from-emerald-900/10', eyebrow: 'New Arrival' },
  };
  const t = typeTokens[slide._type] || typeTokens.featured;
  const ctaLabel = isDeal ? 'Grab This Deal' : isFeatured ? 'View Product' : 'Shop Now';

  return (
    <div className="relative bg-zinc-950 border-b border-zinc-800 overflow-hidden select-none">
      <div className={`absolute inset-0 bg-gradient-to-r ${t.glow} to-transparent pointer-events-none transition-all duration-700`} />
      <div className="absolute inset-0 opacity-[0.022] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
      {slides.length > 1 && (
        <div className="absolute top-5 right-6 z-20 text-[10px] font-bold tabular-nums text-zinc-600">
          {index + 1} / {slides.length}
        </div>
      )}
      <div className="relative w-full h-[600px] lg:h-[700px] overflow-hidden rounded-3xl mx-4 lg:mx-8" style={{ width: 'calc(100% - 2rem)' }}>
        {imgSrc ? (
          <img key={slide.id} src={imgSrc} alt={slide.name} className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(1.03)', transition: 'opacity 280ms, transform 280ms' }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 rounded-3xl">
            <Package size={64} className="text-zinc-700" />
          </div>
        )}
        <div className="absolute inset-y-0 left-0 w-[min(520px,45%)] rounded-l-3xl"
          style={{ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0.10) 85%, transparent 100%)', opacity: visible ? 1 : 0, transition: 'opacity 280ms' }} />
        <div className="absolute inset-y-0 left-0 z-10 flex flex-col justify-center w-[min(520px,45%)]"
          style={{ padding: '0 3rem 0 3.5rem', opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(-16px)', transition: 'opacity 280ms, transform 280ms' }}>
          <div style={{ position: 'absolute', top: '1.25rem', left: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7' }}>
              {isDeal && <Zap size={9} />}{isFeatured && <Award size={9} />}{isNew && <Sparkles size={9} />}
              {t.eyebrow}
            </span>
            {slide.category?.name && <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)' }}>{slide.category.name}</span>}
          </div>
          <div style={{ flex: 1 }} />
          <h1 className="font-black leading-[1.0] tracking-tight" style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', color: '#a855f7', marginBottom: '0.75rem' }}>{slide.name}</h1>
          {(slide.short_description || slide.description) && (
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', lineHeight: '1.6', marginBottom: '1.25rem', maxWidth: '380px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {slide.short_description ?? slide.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.875rem', fontWeight: 900, color: '#a855f7' }}>KSh {Number(slide.price).toLocaleString()}</span>
            {slide.original_price && <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.45)', textDecoration: 'line-through' }}>KSh {Number(slide.original_price).toLocaleString()}</span>}
            {discountPct > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 900, padding: '0.25rem 0.625rem', borderRadius: '0.5rem', color: '#a855f7', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)' }}>-{discountPct}% OFF</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link to={`/products/${slide.id}`} className={`inline-flex items-center gap-2 px-6 py-3 font-black text-sm rounded-xl transition-all hover:opacity-90 ${t.accentBtn}`}>
              {ctaLabel} <ArrowRight size={14} />
            </Link>
            <Link to="/products" className="inline-flex items-center gap-2 px-6 py-3 font-semibold text-sm rounded-xl transition-all"
              style={{ color: '#a855f7', border: '1px solid rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.12)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.12)'}>
              Browse All
            </Link>
          </div>
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          {isFeatured && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(234,179,8,0.3)' }}>
              <Award size={11} style={{ color: '#eab308' }} />
              <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#eab308' }}>Editor's Pick</span>
            </div>
          )}
          {discountPct > 0 && !isFeatured && (
            <span style={{ padding: '0.25rem 0.625rem', background: '#ef4444', color: '#ffffff', fontSize: '10px', fontWeight: 900, borderRadius: '0.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>-{discountPct}%</span>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: '3.5rem', right: '1.25rem', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          {isDeal && (
            <div style={{ borderRadius: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(234,179,8,0.2)' }}>
              <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.625rem' }}>
                <Zap size={8} /> Deal ends in
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.375rem' }}>
                {[{ v: countdown.h, l: 'HRS' }, { v: countdown.m, l: 'MIN' }, { v: countdown.s, l: 'SEC' }].map(({ v, l }, i) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.375rem' }}>
                    {i > 0 && <span style={{ color: '#eab308', fontWeight: 900, fontSize: '1.5rem', lineHeight: 1, paddingBottom: '1rem' }}>:</span>}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '2.75rem', height: '2.75rem', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#eab308', fontVariantNumeric: 'tabular-nums' }}>{String(v).padStart(2, '0')}</span>
                      </div>
                      <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(234,179,8,0.6)', marginTop: '0.25rem', letterSpacing: '0.1em' }}>{l}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isNew && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(168,85,247,0.3)' }}>
              <Sparkles size={11} style={{ color: '#a855f7' }} />
              <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7' }}>Just Arrived</span>
            </div>
          )}
        </div>
        {slides.length > 1 && (
          <>
            <button onClick={handlePrev} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 20, width: '3.5rem', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', outline: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.querySelector('svg').style.transform = 'scale(1.15)'}
              onMouseLeave={e => e.currentTarget.querySelector('svg').style.transform = 'scale(1)'}>
              <ChevronLeft size={40} style={{ color: '#a855f7', filter: 'drop-shadow(0 2px 8px rgba(168,85,247,0.5))', transition: 'transform 150ms' }} />
            </button>
            <button onClick={handleNext} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 20, width: '3.5rem', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', outline: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.querySelector('svg').style.transform = 'scale(1.15)'}
              onMouseLeave={e => e.currentTarget.querySelector('svg').style.transform = 'scale(1)'}>
              <ChevronRight size={40} style={{ color: '#a855f7', filter: 'drop-shadow(0 2px 8px rgba(168,85,247,0.5))', transition: 'transform 150ms' }} />
            </button>
          </>
        )}
        {slides.length > 1 && (
          <div style={{ position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {slides.map((_, i) => (
              <button key={i} aria-label={`Slide ${i + 1}`} onClick={() => handleDot(i)} style={{ background: 'none', border: 'none', outline: 'none', padding: '4px', cursor: 'pointer' }}>
                <span style={{ display: 'block', borderRadius: '9999px', transition: 'all 300ms', width: i === index ? '28px' : '8px', height: '8px', background: i === index ? '#a855f7' : 'rgba(255,255,255,0.35)', boxShadow: i === index ? '0 0 8px rgba(168,85,247,0.7)' : 'none' }} />
              </button>
            ))}
          </div>
        )}
        <div style={{ position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1.25rem' }}>
          {[{ icon: Truck, text: 'Nationwide Delivery' }, { icon: BadgePercent, text: 'Best Price Guarantee' }, { icon: TrendingUp, text: 'Updated Weekly' }].map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Icon size={11} style={{ color: '#a855f7', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────
const CollapsedSkeleton = () => (
  <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse">
    <div className="rounded-lg bg-zinc-800 flex-shrink-0" style={{ width: 52, height: 52 }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-zinc-800 rounded w-3/4" />
      <div className="h-2.5 bg-zinc-800 rounded w-1/2" />
    </div>
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <div className="h-3 bg-zinc-800 rounded w-20" />
      <div className="h-6 bg-zinc-800 rounded-full w-14" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SectionHead
// ─────────────────────────────────────────────────────────────────────────────
function SectionHead({ eyebrow, title, subtitle, cta, ctaLink, accent = '#c084fc', icon: Icon }) {
  return (
    <div className="flex items-end justify-between mb-6 gap-4">
      <div>
        <p
          style={{ color: '#c084fc'}}
          className="text-[10px] font-black uppercase tracking-[0.2em] mb-2"
        >
          {eyebrow}
        </p>
        <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight flex items-center gap-3" style={{ color: '#a855f7'}}>
          {Icon && <Icon size={22} />}
          {title}
        </h2>
        {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
      </div>
      {cta && ctaLink && (
        <Link
          to={ctaLink}
          style={{ color: '#c084fc'}}
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:gap-2 transition-all"
        >
          {cta} <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FlashBanner — replace the existing FlashBanner function in SpecialsPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
function FlashBanner({ countdown }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      marginBottom: '24px',
      padding: '20px 24px',
      background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(139,92,246,0.08) 100%)',
      border: '1px solid rgba(168,85,247,0.25)',
      borderRadius: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow blob */}
      <div style={{
        position: 'absolute', top: '-40px', left: '-40px',
        width: '180px', height: '180px',
        background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Left: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(168,85,247,0.4)',
        }}>
          <Clock size={18} color="white" />
        </div>
        <div>
          <p style={{
            fontSize: '10px', fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '0.2em', color: '#c084fc', marginBottom: '2px',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            <Zap size={9} /> Flash Sale
          </p>
          <p style={{ fontSize: '1rem', fontWeight: 900, margin: 0 }}>
            Limited Time Deals
          </p>
        </div>
      </div>

      {/* Right: countdown */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', position: 'relative' }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, color: '#c084fc',
          paddingBottom: '18px', textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Resets in
        </span>
        {[{ v: countdown.h, l: 'HRS' }, { v: countdown.m, l: 'MIN' }, { v: countdown.s, l: 'SEC' }].map(({ v, l }, i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
            {i > 0 && (
              <span style={{ color: '#a855f7', fontWeight: 900, fontSize: '1.4rem', lineHeight: 1, paddingBottom: '18px' }}>:</span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '44px', height: '44px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(168,85,247,0.45)',
                borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(168,85,247,0.2), inset 0 1px 0 rgba(168,85,247,0.15)',
              }}>
                <span style={{
                  fontSize: '1.2rem', fontWeight: 900,
                  color: '#e9d5ff',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {String(v).padStart(2, '0')}
                </span>
              </div>
              <span style={{
                fontSize: '8px', fontWeight: 700,
                color: 'rgba(192,132,252,0.6)',
                marginTop: '4px', letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>
                {l}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function Empty({ icon: Icon, message, sub, cta, ctaLink }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
      <Icon size={36} className="mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
      {sub && <p className="text-xs text-zinc-700 mt-1">{sub}</p>}
      {cta && ctaLink && (
        <Link to={ctaLink} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-a855f7 text-purple-400 hover:text-purple-300 transition-colors">
          {cta} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WishlistSection — fetches + shows wishlisted products as collapsed cards
// ─────────────────────────────────────────────────────────────────────────────
function WishlistSection() {
  const { ids, items, loading, fetchWishlistItems, remove } = useWishlistStore();

  useEffect(() => {
    if (ids.length > 0) fetchWishlistItems();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render the section at all if wishlist is empty
  if (ids.length === 0) return null;

  return (
    <section>
      {/* Header band */}
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-400 mb-2 flex items-center gap-1.5"style={{ color: '#fb3ccb' }}>
            <Wand2 size={10} /> Your Picks
          </p>
          <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight flex items-center gap-3"style={{ color: '#fb3ccb' }}>
            <Heart size={22} className="text-pink-400 fill-pink-400" />
            What You Like
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            {ids.length} item{ids.length !== 1 ? 's' : ''} saved to your wishlist
          </p>
        </div>
        <Link
          to="/wishlist"
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-pink-400 hover:gap-2 transition-all"
          style={{ color: '#fb3ccb' }}
        >
          View all <ChevronRight size={13} />
        </Link>
      </div>

      {/* Decorative left border */}
      <div className="flex gap-5">
        <div className="w-1 rounded-full bg-gradient-to-b from-pink-400 via-pink-400/40 to-transparent flex-shrink-0" />
        <div className="flex-1">
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
              {Array.from({ length: Math.min(ids.length, 6) }).map((_, i) => (
                <CollapsedSkeleton key={i} />
              ))}
            </div>
          ) : items.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
              {items.map((product) => (
                <CollapsedProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            // ids exist but items failed to load
            <Empty
              icon={Heart}
              message="Couldn't load your saved items."
              sub="They may have been removed or are temporarily unavailable."
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CartSection — shows items currently in the cart
// ─────────────────────────────────────────────────────────────────────────────
function CartSection() {
  const navigate = useNavigate();
  const { items, removeItem, clearCart } = useCartStore();

  // items is typically [{ product, quantity }, ...] or [{ ...product, quantity }]
  // Normalise to always have a product object
  const cartProducts = (items || []).map((entry) => {
    const product = entry.product ?? entry;
    const quantity = entry.quantity ?? 1;
    return { product, quantity };
  });

  if (cartProducts.length === 0) return null;

  const handleClearCart = () => {
    clearCart();
    toast.success('Cart cleared');
  };

  const totalItems = cartProducts.reduce((sum, { quantity }) => sum + quantity, 0);

  return (
    <section>
      {/* Header band */}
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400 mb-2 flex items-center gap-1.5"style={{ color: '#fb923c' }}>
            <ShoppingCart size={10} /> Your Cart
          </p>
          <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight flex items-center gap-3"style={{ color: '#fb923c' }}>
            <ShoppingCart size={22} className="text-orange-400" style={{ color: '#fb923c' }} />
            Want to Clear Your Cart?
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            {totalItems} item{totalItems !== 1 ? 's' : ''} waiting — head to checkout or remove what you don't need
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Clear cart */}
          <button
            type="button"
            onClick={handleClearCart}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-secondary hover:text-red-400 transition-colors"
            style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251, 60, 60, 0.35)', color: '#fb3c3c' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,60,60,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,60,60,0.15)'}
          >
            Clear all
          </button>
          {/* Go to cart */}
          <button
            type="button"
            onClick={() => navigate('/cart')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
            style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', color: '#fb923c' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,146,60,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,146,60,0.15)'}
          >
            Checkout <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Decorative left border */}
      <div className="flex gap-5">
        <div className="w-1 rounded-full bg-gradient-to-b from-orange-400 via-orange-400/40 to-transparent flex-shrink-0" />
        <div className="flex-1">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
            {cartProducts.map(({ product, quantity }) => (
              <CartProductRow
                key={product.id}
                product={product}
                quantity={quantity}
                onRemove={() => removeItem(product.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AuctionSection — Live bidding grid
// ─────────────────────────────────────────────────────────────────────────────
function AuctionSection() {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        setLoading(true);
        // Reuses the same API structure as AuctionListPage
        const res = await auctionsAPI.getAllAuctions({ status: 'active', page: 1, per_page: 4 });
        setAuctions(res.data || []);
      } catch {
        setAuctions([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAuctions();
  }, []);

  return (
    <section>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-2 flex items-center gap-1.5" style={{ color: '#dc2626' }}>
            <Gavel size={10} className="animate-pulse"/> Live Bidding 
          </p>
          <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight flex items-center gap-3"style={{ color: '#dc2626' }}>
            Hot Auctions
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Bid before time runs out — prices update in real-time
          </p>
        </div>
        <Link to="/auctions" className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-red-400 hover:gap-2 transition-all">
          View all <ChevronRight size={13} />
        </Link>
      </div>

      {/* Decorative left border */}
      <div className="flex gap-5">
        <div className="w-1 rounded-full bg-gradient-to-b from-red-500 via-red-500/40 to-transparent flex-shrink-0" />
        <div className="flex-1">
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
              {Array.from({ length: 4 }).map((_, i) => <CollapsedSkeleton key={i} />)}
            </div>
          ) : auctions.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
              {auctions.map((a) => (
                <div 
                  key={a.id} 
                  className="bg-zinc-900/50 rounded-xl overflow-hidden"  
                  style={{ border: '1px solid rgba(168,85,247,0.2)' }}   
                >
                  <AuctionCard auction={a} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={Gavel}
              message="No active auctions right now."
              sub="Check back soon or browse our regular products."
              cta="Browse Products"
              ctaLink="/products"
            />
          )}
        </div>
      </div>
    </section>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// CartProductRow — collapsed card variant with quantity badge + remove button
// ─────────────────────────────────────────────────────────────────────────────
function CartProductRow({ product, quantity, onRemove }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  const price = Number(product?.price ?? 0);
  const imageUrl = product?.main_image_url ?? product?.main_image ?? null;
  const description = product?.short_description ?? product?.description ?? '';

  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove();
    toast.success(`${product?.name} removed from cart`);
  };

  return (
    <div
      onClick={() => navigate(`/products/${product?.id}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: 'rgba(251,146,60,0.06)',
        border: '1px solid rgba(251,146,60,0.18)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'box-shadow 150ms ease, transform 150ms ease',
        width: '100%',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(251,146,60,0.15)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Thumbnail */}
      <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#27272a', position: 'relative' }}>
        {!imageError && imageUrl ? (
          <img src={imageUrl} alt={product?.name ?? 'Product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImageError(true)} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={22} style={{ color: '#52525b' }} />
          </div>
        )}
        {/* Quantity badge */}
        {quantity > 1 && (
          <div style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#fb923c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff', border: '1.5px solid #18181b' }}>
            {quantity}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#fb923c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 0 2px', lineHeight: 1.3 }}>
          {product?.name}
        </p>
        {description ? (
          <p style={{ fontSize: '0.72rem', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, lineHeight: 1.4 }}>
            {description}
          </p>
        ) : null}
      </div>

      {/* Right: price + remove */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fb923c', whiteSpace: 'nowrap' }}>
          KSh {(price * quantity).toLocaleString()}
        </span>
        {quantity > 1 && (
          <span style={{ fontSize: '0.65rem', color: '#71717a', whiteSpace: 'nowrap' }}>
            {quantity} × KSh {price.toLocaleString()}
          </span>
        )}
        <button
          type="button"
          onClick={handleRemove}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', transition: 'all 150ms ease', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#ef4444'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SpecialsPage
// ─────────────────────────────────────────────────────────────────────────────
export default function SpecialsPage() {
  const countdown = useCountdown();

  const {
    fetchFeaturedProducts, fetchOnSaleProducts, fetchNewArrivals,
    featuredProducts, onSaleProducts, newArrivals,
    loadingFeatured, loadingOnSale, loadingNewArrivals,
  } = useProductStore();

  const { fetchFeaturedServices, featuredServices, loadingFeatured: serviceLoading } = useServiceStore();

  useEffect(() => {
    fetchFeaturedProducts();
    fetchOnSaleProducts();
    fetchNewArrivals();
    fetchFeaturedServices();
  }, []);

  const carouselSlides = (() => {
    const seen = new Set();
    const tagged = (arr, type) =>
      arr.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).map((p) => ({ ...p, _type: type }));
    return [
      ...tagged(onSaleProducts.slice(0, 3),  'deal'),
      ...tagged(featuredProducts.slice(0, 3), 'featured'),
      ...tagged(newArrivals.slice(0, 2),      'new'),
    ];
  })();

  const heroLoading    = loadingOnSale && loadingFeatured && loadingNewArrivals;
  const dealsToShow    = onSaleProducts.length > 0 ? onSaleProducts.slice(0, 8) : featuredProducts.slice(0, 8);
  const dealsAreOnSale = onSaleProducts.length > 0;

  const isPageLoading = loadingOnSale || loadingFeatured || loadingNewArrivals || serviceLoading;
  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <LoadingSpinner fullScreen />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Helmet>
        <title>Specials & Deals — TISL Store</title>
        <meta name="description" content="Shop the latest deals and special offers at TISL Store. Limited time discounts on top products in Nairobi." />
        <meta property="og:title" content="Specials & Deals — TISL Store" />
        <meta property="og:type" content="website" />
      </Helmet>
      <Header />

      <HeroCarousel slides={carouselSlides} countdown={countdown} loading={heroLoading} />
      <div className="flex items-center justify-center gap-2 mb-5"></div>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 space-y-24">

        {/* ── Flash sale deals ── */}
        <section>
          <FlashBanner countdown={countdown} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
            {loadingOnSale
              ? Array.from({ length: 8 }).map((_, i) => <CollapsedSkeleton key={i} />)
              : dealsToShow.length > 0
                ? dealsToShow.map((p) => (
                    <CollapsedProductCard key={p.id} product={p} badge={dealsAreOnSale ? 'Sale' : 'Featured'} badgeColor={dealsAreOnSale ? 'red' : 'yellow'} theme="dark" />
                  ))
                : <Empty icon={Tag} message="No deals right now — check back soon." />
            }
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 mb-5"></div>

        {/* ── What You Like (wishlist) ── */}
        <WishlistSection />

        <div className="flex items-center justify-center gap-2 mb-5"></div>

        {/* ── Want to clear your cart? ── */}
        <CartSection />

        <div className="flex items-center justify-center gap-2 mb-5"></div>

        {/* ── Featured products ── */}
        <section>
          <SectionHead
            eyebrow="Hand-picked" title="Featured Products"
            subtitle="Top-rated industrial tools selected for quality and value"
            cta="View all" ctaLink="/products?featured=true"
            accent="text-yellow-400"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px',color: '#a855f7'}}>
            {loadingFeatured
              ? Array.from({ length: 8 }).map((_, i) => <CollapsedSkeleton key={i} />)
              : featuredProducts.length > 0
                ? featuredProducts.slice(0, 8).map((p) => (
                    <CollapsedProductCard key={p.id} product={p} badge="Featured" badgeColor="yellow" theme="dark" />
                  ))
                : <Empty icon={Package} message="No featured products yet." />
            }
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 mb-5"></div>
        
        <AuctionSection />

        <div className="flex items-center justify-center gap-2 mb-5"></div>

        {/* ── New arrivals ── */}
        <section>
          <div className="flex gap-5">
            <div className="w-1 rounded-full bg-gradient-to-b from-emerald-400 via-emerald-400/40 to-transparent flex-shrink-0" />
            <div className="flex-1">
              <SectionHead
                eyebrow="Just In" title="New Arrivals"
                subtitle="Fresh stock added to our catalogue — be the first to order"
                cta="Browse all" ctaLink="/products?is_new=true"
                accent="text-emerald-400"
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
                {loadingNewArrivals
                  ? Array.from({ length: 6 }).map((_, i) => <CollapsedSkeleton key={i} />)
                  : newArrivals.length > 0
                    ? newArrivals.slice(0, 6).map((p) => (
                        <CollapsedProductCard key={p.id} product={p} badge="New" badgeColor="green" theme="dark" />
                      ))
                    : <Empty icon={Sparkles} message="No new arrivals yet." />
                }
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 mb-5"></div>

        {/* ── Featured services ── */}
        <section>
          <SectionHead
            eyebrow="Save More" title="Featured Services"
            subtitle="Expert services for your industrial and construction needs"
            cta="All services" ctaLink="/services"
            accent="text-sky-400"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
            {serviceLoading
              ? Array.from({ length: 4 }).map((_, i) => <CollapsedSkeleton key={i} />)
              : featuredServices.length > 0
                ? featuredServices.slice(0, 8).map((service) => (
                    <CollapsedServiceCard key={service.id} service={service} />
                  ))
                : <Empty icon={Wrench} message="No featured services yet." cta="Browse all services" ctaLink="/services" />
            }
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="mt-16 lg:mt-24">
          <div 
            className="relative rounded-2xl overflow-hidden group"
            style={{
              border: '1.5px solid rgba(168, 85, 247, 0.5)',
              boxShadow: '0 0 24px rgba(168, 85, 247, 0.18)',
              transition: 'all 0.3s ease-out',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.8)';
              e.currentTarget.style.boxShadow = '0 0 36px rgba(168, 85, 247, 0.35)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
              e.currentTarget.style.boxShadow = '0 0 24px rgba(168, 85, 247, 0.18)';
            }}
          >
            {/* Base gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800" />
            
            {/* Purple glow orbs */}
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none 
                            group-hover:bg-purple-500/20 transition-all duration-500" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/5 rounded-full blur-2xl pointer-events-none 
                            group-hover:bg-purple-500/15 transition-all duration-500" />
            
            {/* Content */}
            <div className="relative px-8 py-14 lg:px-16 lg:py-20 text-center">
              <div className="flex items-center justify-center gap-2 mb-5">
                
              </div>
              {/* Headline */}
              <h2 className="text-3xl lg:text-5xl font-black text-primary mb-5 leading-[1.05]">
                Can't find what you're looking for?
              </h2>
              
              {/* Description */}
              <p className="text-zinc-400 text-sm max-w-md mx-auto mb-10 leading-relaxed">
                Send us a quote request and we'll respond within <span className="text-purple-400 font-semibold">24 hours</span>.
              </p>
              
              {/* Buttons */}
              <div className="flex flex-wrap gap-4 justify-center">
                <Link 
                  to="/request-quote" 
                  className="inline-flex items-center gap-2 px-8 py-3.5 
                            bg-gradient-to-r from-purple-500 to-purple-600 
                            hover:from-purple-400 hover:to-purple-500 
                            text-white font-black rounded-lg text-sm 
                            transition-all duration-200
                            shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40
                            hover:-translate-y-0.5"
                >
                  Request a Quote <ArrowRight size={15} />
                </Link>
                
                <Link 
                  to="/products" 
                  className="inline-flex items-center gap-2 px-8 py-3.5 
                            border border-purple-500/40 hover:border-purple-400/70
                            text-zinc-300 hover:text-purple-300 
                            font-semibold rounded-lg text-sm 
                            transition-all duration-200
                            bg-zinc-900/50 hover:bg-zinc-900/80
                            hover:-translate-y-0.5"
                >
                  Browse Catalogue
                </Link>
              </div>
              
              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-6 mt-10 pt-8">
                {[
                  { icon: Truck, text: 'Nationwide Delivery' },
                  { icon: BadgePercent, text: 'Price Match Guarantee' },
                  { icon: Award, text: 'Verified Suppliers' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-zinc-400">
                    <Icon size={14} className="text-primary" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-2 mb-5">
                
              </div>
              
              
            </div>
          </div>
        </section>
        <div className="flex items-center justify-center gap-2 mb-5"></div>

      </div>
      <Footer />
    </div>
  );
}