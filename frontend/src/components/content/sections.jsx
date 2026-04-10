// ─────────────────────────────────────────────────────────────────────────────
// Section Components — one per section_type
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Phone, MapPin, Clock, Share2,
  ChevronDown, ChevronUp, ArrowRight,
  ChevronLeft, ChevronRight,
  Wrench, Settings2, Hammer, Scissors, Pin
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

const SectionWrapper = ({ children, className = '' }) => (
  <section className={`w-full ${className}`}>{children}</section>
);

const Container = ({ children, className = '' }) => (
  <div className={`max-w-6xl mx-auto px-6 lg:px-10 ${className}`}>{children}</div>
);

const SectionHeading = ({ title, subtitle, centered = false }) => (
  <div className={`mb-12 ${centered ? 'text-center' : ''}`}>
    <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
      {title}
    </h2>
    {subtitle && (
      <p className={`mt-4 text-lg text-gray-500 dark:text-gray-400 ${
        centered ? 'max-w-2xl mx-auto' : 'max-w-2xl'
      }`}>
        {subtitle}
      </p>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Carousel primitives
// ─────────────────────────────────────────────────────────────────────────────

function useCarousel(total, autoPlayMs = 5000) {
  const [index, setIndex] = useState(0);
  const timer = useRef(null);
  const go   = useCallback(i => setIndex(((i % total) + total) % total), [total]);
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  useEffect(() => {
    if (total <= 1 || !autoPlayMs) return;
    timer.current = setInterval(() => setIndex(i => (i + 1) % total), autoPlayMs);
    return () => clearInterval(timer.current);
  }, [total, autoPlayMs]);

  const pause  = () => clearInterval(timer.current);
  const resume = () => {
    if (total <= 1) return;
    timer.current = setInterval(() => setIndex(i => (i + 1) % total), autoPlayMs);
  };
  return { index, go, prev, next, pause, resume };
}

const CarouselDots = ({ total, index, go, light = false }) => (
  <div className="flex items-center justify-center gap-2 mt-5">
    {Array.from({ length: total }).map((_, i) => (
      <button
        key={i}
        onClick={() => go(i)}
        aria-label={`Slide ${i + 1}`}
        className={`rounded-full transition-all duration-300 ${
          i === index
            ? light ? 'w-6 h-2 bg-white' : 'w-6 h-2 bg-primary-600'
            : light ? 'w-2 h-2 bg-white/40' : 'w-2 h-2 bg-gray-300 dark:bg-gray-600'
        }`}
      />
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// HeroSlide
//
// Three variants:
//   1. Has image_url      → split layout: text LEFT | image RIGHT (CSS grid)
//   2. No image, contact  → centred heading on light background (clean, no dark panel)
//   3. No image, other    → centred text on dark gradient banner
//
// pageType is passed down from HeroCarousel → ContentPage / Home
// ─────────────────────────────────────────────────────────────────────────────

function HeroSlide({ section, pageType }) {
  const hasImage = Boolean(section.image_url);

  // ── Variant 1: split layout ────────────────────────────────────────────────
  if (hasImage) {
    return (
        <div
        className="relative overflow-hidden"
        style={{ minHeight: '480px' }}
        >
        {/* Full-bleed background image */}
        <img
            src={section.image_url}
            alt={section.title}
            className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Text overlay — narrower translucent panel */}
        <div
            className="relative z-10"
            style={{ minHeight: '480px' }}
        >
            <div
            className="flex flex-col justify-between py-10 px-8 lg:px-12"
            style={{
                width: '28%',
                minWidth: '220px',
                maxWidth: '300px',
                minHeight: '480px',
                background: 'rgba(55, 55, 55, 0.55)',
                backdropFilter: 'blur(2px)',
            }}
            >
            {/* Top: subtitle + title */}
            <div className="pt-2">
                {section.subtitle && (
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary-400 mb-4">
                    {section.subtitle}
                </p>
                )}
                <h1 className="text-3xl lg:text-4xl font-bold text-white leading-[1.15]">
                {section.title}
                </h1>
            </div>

            {/* Bottom: body copy + CTA button */}
            <div className="pt-2">
                {section.content && (
                <p className="text-[13px] lg:text-[14px] text-white/70 leading-relaxed mb-6">
                    {section.content}
                </p>
                )}
                {section.button_text && section.button_link && (
                <div>
                    <Link
                    to={section.button_link}
                    className="inline-flex items-center gap-2 px-6 py-3 font-semibold rounded-xl transition-colors text-[14px] shadow-md"
                    style={{
                        background: '#a855f7',
                        border: '1px solid rgba(255,255,255,0.4)',
                        color: '#ffffff',
                    }}
                    >
                    {section.button_text}
                    <ArrowRight size={15} />
                    </Link>
                </div>
                )}
            </div>
            </div>
        </div>
        </div>
    );
    }

  // ── Variant 2: contact page — centred clean heading ────────────────────────
  if (pageType === 'contact') {
    return (
      <div className="py-20 lg:py-28 bg-white dark:bg-gray-900">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-4xl lg:text-6xl font-bold text-primary tracking-tight leading-[1.08] mb-5">
              {section.title}
            </h1>
            {section.subtitle && (
              <p className="text-xl text-gray-500 dark:text-gray-400 leading-relaxed">
                {section.subtitle}
              </p>
            )}
          </div>
        </Container>
      </div>
    );
  }

  // ── Variant 3: no image, other pages — dark banner, centred ───────────────
  return (
    <div className="min-h-[420px] lg:min-h-[520px] flex items-center bg-gradient-to-br from-gray-800 to-gray-900">
      <Container className="py-20">
        <div className="max-w-2xl mx-auto text-center">
          {section.subtitle && (
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary-400 mb-4">
              {section.subtitle}
            </p>
          )}
          <h1 className="text-4xl lg:text-6xl font-bold text-white leading-[1.08] mb-5">
            {section.title}
          </h1>
          {section.content && (
            <p className="text-base lg:text-lg text-white/65 leading-relaxed mb-8 max-w-xl mx-auto">
              {section.content}
            </p>
          )}
          {section.button_text && section.button_link && (
            <Link
              to={section.button_link}
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors text-[15px] shadow-xl shadow-primary-900/25"
            >
              {section.button_text}
              <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </Container>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroCarousel
// Single slide → no carousel chrome. Multiple → cross-fade + dots + arrows.
// Called from ContentPage and Home — NOT via SectionRenderer.
// ─────────────────────────────────────────────────────────────────────────────

export function HeroCarousel({ sections, pageType }) {
  const total  = sections.length;
  const isMulti = total > 1;
  const { index, go, prev, next, pause, resume } = useCarousel(total, 6000);

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {/* Slides — cross-fade */}
      {sections.map((s, i) => (
        <div
          key={s.id ?? i}
          aria-hidden={i !== index}
          className={`transition-opacity duration-700 ${
            i === index
              ? 'opacity-100 relative'
              : 'opacity-0 absolute inset-0 pointer-events-none'
          }`}
        >
          <HeroSlide section={s} pageType={pageType} />
        </div>
      ))}

      {/* Arrows */}
      {isMulti && (
        <>
          
          {/* Prev arrow */}
            <button
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', padding: '8px', color: 'rgba(255,255,255,0.85)' }}
                aria-label="Previous"
            >
                <ChevronLeft size={40} strokeWidth={2} />
            </button>
            {/* Next arrow */}
            <button
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', padding: '8px', color: 'rgba(255,255,255,0.85)' }}
                aria-label="Next"
            >
                <ChevronRight size={40} strokeWidth={2} />
            </button>
          <div className="absolute bottom-4 inset-x-0 z-20">
            <CarouselDots total={total} index={index} go={go} light />
          </div>
        </>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// FeaturesSection — App Store list
// ─────────────────────────────────────────────────────────────────────────────
export function FeaturesSection({ section }) {
  const items = section.items ?? [];

  return (
    <SectionWrapper className="py-16 bg-white dark:bg-gray-800">
      <Container>
        {/* Centered heading with top margin */}
        <div className="text-center mb-12 mt-6">
          {section.title && (
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-3">
              {section.title}
            </h2>
          )}
          {section.subtitle && (
            <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {section.subtitle}
            </p>
          )}
        </div>

        {/* 2-column grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            columnGap: '40px',
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.id ?? index}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 0',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  flexShrink: 0,
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f3f4f6',
                }}
              >
                {item.icon_url ? (
                  <img src={item.icon_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                ) : (
                  <span style={{ fontSize: '25px', fontWeight: 'bold', color: '#a855f7' }}>✦</span>
                )}
              </div>

              {/* Text */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#a855f7', lineHeight: '1.3' }}>
                  {item.title}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {item.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatsSection — horizontal number band (unchanged, it's display not list)
// ─────────────────────────────────────────────────────────────────────────────
// Inject keyframes once
const ringStyles = `
  @keyframes ringFill {
    from { stroke-dashoffset: 283; }
    to   { stroke-dashoffset: var(--target-offset); }
  }
`;

const COLORS = ['#22d3ee', '#f97316', '#4ade80', '#e879f9'];
const TRACK_COLORS = ['#164e63', '#431407', '#14532d', '#581c87'];

// Extracts a numeric value from strings like "1,200+", "8,000+", "10+", "95%"
function extractNumber(str) {
  if (!str) return 0;
  const clean = String(str).replace(/,/g, '').replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
}

// Maps a value to a reasonable ring fill percentage
function calcPercentage(item) {
  const num = extractNumber(item.value);
  
  // If item has explicit percentage, use it
  if (item.percentage) return item.percentage;
  
  // Fixed thresholds — small numbers still get meaningful fill
  if (num >= 10000) return 95;
  if (num >= 5000)  return 88;
  if (num >= 1000)  return 78;
  if (num >= 500)   return 68;
  if (num >= 100)   return 58;
  if (num >= 50)    return 50;
  if (num >= 10)    return 42;
  if (num >= 5)     return 35;
  return 25; // fallback for very small numbers
}

export function StatsSection({ section }) {
  const items = section.items ?? [];

  return (
    <SectionWrapper className="py-20 bg-gray-950 dark:bg-gray-950">
      <style>{ringStyles}</style>
      <Container>
        {section.title && (
          <h2 className="hidden text-center mb-14 mt-6 text-2xl font-bold text-white">
            {section.title}
          </h2>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '48px 32px',
            justifyItems: 'center',
            paddingTop: '48px',  
            paddingBottom: '32px',
          }}
        >
          {items.map((item, i) => {
            const color = COLORS[i % COLORS.length];
            const track = TRACK_COLORS[i % TRACK_COLORS.length];
            const pct = calcPercentage(item); // no longer needs items + index
            const circumference = 283;
            const offset = circumference - (pct / 100) * circumference;

            return (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto' }}>
                  <svg
                    width="160"
                    height="160"
                    viewBox="0 0 100 100"
                    style={{ transform: 'rotate(-90deg)', overflow: 'hidden', borderRadius: '50%' }}
                  >
                    <defs>
                      {/* Circular clip so glow stays inside the SVG bounds */}
                      <clipPath id={`clip-${i}`}>
                        <circle cx="50" cy="50" r="50" />
                      </clipPath>
                    </defs>

                    <g clipPath={`url(#clip-${i})`}>
                      {/* Dark fill */}
                      <circle cx="50" cy="50" r="50" fill="#0f1117" />

                      {/* Track ring */}
                      <circle
                        cx="50" cy="50" r="45"
                        fill="transparent"
                        stroke={track}
                        strokeWidth="6"
                      />

                      {/* Animated glowing arc */}
                      <circle
                        cx="50" cy="50" r="45"
                        fill="transparent"
                        stroke={color}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        style={{
                          '--target-offset': offset,
                          strokeDashoffset: offset,
                          animation: `ringFill 1.4s cubic-bezier(0.4,0,0.2,1) forwards`,
                          filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color})`,
                        }}
                      />
                    </g>
                  </svg>

                  {/* Inner text */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{
                      fontSize: '26px', fontWeight: '800',
                      color: color, lineHeight: 1,
                      textShadow: `0 0 12px ${color}80`,
                    }}>
                      {item.value}
                    </span>
                    <span style={{
                      fontSize: '10px', color: '#94a3b8',
                      marginTop: '4px', textAlign: 'center', maxWidth: '80px',
                    }}>
                      {item.label}
                    </span>
                  </div>
                </div>

                {item.change && (
                  <div style={{ marginTop: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color }}>{item.change}</span>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>From last month</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CtaSection
// ─────────────────────────────────────────────────────────────────────────────

export function CtaSection({ section }) {
  const hasImage = Boolean(section.image_url);
  return (
    <SectionWrapper>
        <div
        className="relative"
        style={{
            paddingTop: '50px',
            paddingBottom: '30px',
            ...(hasImage ? { backgroundImage: `url(${section.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {})
        }}
        >
        
        {/* Darker overlay — covers bright/light images */}
        {hasImage && (
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(10, 10, 20, 0.72)' }} />
        )}

        <Container className="relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-12 mt-6">
            <h2 className={`text-3xl text-primary lg:text-4xl font-bold mb-4 ${
              hasImage ? 'text-white drop-shadow-lg' : 'text-gray-900 dark:text-white'
            }`}>
              {section.title}
            </h2>
            {section.subtitle && (
            <p
                className={`text-lg mb-4 drop-shadow`}
                style={{ color: '#d4d3d3' }}
            >
                {section.subtitle}
            </p>
            )}
            {section.content && (
            <p
                className={`text-lg mb-4 drop-shadow`}
                style={{ color: '#d4d3d3' }}
            >
                {section.content}
            </p>
            )}
            {section.button_text && section.button_link && (
              <Link
                to={section.button_link}
                className="inline-flex items-center gap-2 px-8 py-4 font-semibold rounded-xl transition-colors text-[15px] shadow-lg"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid #a855f7',
                  color: '#a855f7',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {section.button_text}
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </Container>
      </div>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GallerySection — masonry ≤6, carousel >6
// ─────────────────────────────────────────────────────────────────────────────

function GalleryCarousel({ items }) {
  const { index, go, prev, next, pause, resume } = useCarousel(items.length, 4000);
  return (
    <div className="relative rounded-2xl overflow-hidden" onMouseEnter={pause} onMouseLeave={resume}>
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-800">
        {items.map((it, i) => (
          <div key={i} className={`absolute inset-0 transition-opacity duration-500 ${i === index ? 'opacity-100' : 'opacity-0'}`}>
            <img src={it.url} alt={it.caption} className="w-full h-full object-cover" />
            {it.caption && (
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-6 py-4">
                <p className="text-white text-[14px] font-medium text-center">{it.caption}</p>
              </div>
            )}
          </div>
        ))}
        <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-sm flex items-center justify-center z-10">
          <ChevronLeft size={18} />
        </button>
        <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-sm flex items-center justify-center z-10">
          <ChevronRight size={18} />
        </button>
      </div>
      <CarouselDots total={items.length} index={index} go={go} />
    </div>
  );
}

export function GallerySection({ section }) {
  const items = section.items ?? [];
  return (
    <SectionWrapper className="py-24 bg-white dark:bg-gray-900">
      <Container>
        <SectionHeading title={section.title} centered />
        {items.length > 6 ? (
          <div className="max-w-4xl mx-auto"><GalleryCarousel items={items} /></div>
        ) : (
          <div className="columns-2 md:columns-3 gap-4 space-y-4">
            {items.map((item, i) => (
              <div key={i} className="break-inside-avoid rounded-xl overflow-hidden group">
                <div className="relative">
                  <img src={item.url} alt={item.caption} className="w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  {item.caption && (
                    <div className="absolute inset-0 bg-gray-900/0 group-hover:bg-gray-900/50 transition-colors flex items-end">
                      <span className="translate-y-full group-hover:translate-y-0 transition-transform duration-300 w-full px-4 py-3 text-[13px] font-medium text-white text-center">
                        {item.caption}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MissionVisionSection — Crafty Scrapbook Edition 
// Changes:
//   - No emojis → Lucide React icons (Wrench, Settings2, Hammer, Scissors, Pin)
//   - Polaroid reshapes to fit image naturally (no crop, no forced aspect ratio)
//   - Placeholder = preview screenshot illustration
// ─────────────────────────────────────────────────────────────────────────────

export function MissionVisionSection({ section }) {
  const sections = Array.isArray(section) ? section : [section];

  // Placeholder = extracted polaroid illustration from the preview screenshot
  const PLACEHOLDER_IMG = "https://img.icons8.com/doodle-line/1200/image.jpg";

  // Cheesy construction/repair/trades illustrated icons — shown when no image_url
  const FALLBACK_IMAGES = [
    PLACEHOLDER_IMG,
    PLACEHOLDER_IMG,
    PLACEHOLDER_IMG,
    PLACEHOLDER_IMG,
  ];

  const TAPE_COLORS = [
    'rgba(168,85,247,0.72)',  // purple
    'rgba(255,200,80,0.75)',  // yellow
    'rgba(160,210,140,0.75)', // green
    'rgba(255,160,120,0.75)', // orange
  ];

  const ROTATIONS     = [-2.5, 2, -1.5, 3];
  const IMG_ROTATIONS = [3, -2, 2.5, -3];

  // Lucide corner doodle icons — one per section slot
  const CORNER_ICONS = [
    (props) => <Wrench   {...props} />,
    (props) => <Settings2 {...props} />,
    (props) => <Hammer   {...props} />,
    (props) => <Scissors {...props} />,
  ];

  // Lucide divider icon
  const DividerIcon = () => (
    <Scissors size={22} style={{ color: 'var(--border, #c4b99a)' }} />
  );

  // Lucide pin for the polaroid caption
  const PolaroidPin = () => (
    <Pin size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
  );

  return (
    <SectionWrapper className="py-20" style={{ position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Nunito:wght@400;600;800&display=swap');

        /* ── torn paper card — theme-aware card bg ── */
        .mv-torn-card {
          background: var(--card, #fffef9);
          border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 3px 4px 0 rgba(0,0,0,0.07), 6px 8px 18px rgba(0,0,0,0.08);
          position: relative;
        }
        .mv-torn-card::before {
          content: '';
          position: absolute;
          top: -7px; left: 0; right: 0; height: 13px;
          background: var(--card, #fffef9);
          clip-path: polygon(
            0% 100%, 1.5% 15%, 3% 75%, 5% 5%, 7% 65%, 9% 25%,
            11% 85%, 13% 15%, 15% 55%, 17% 0%, 19% 75%, 21% 25%,
            23% 65%, 25% 10%, 27% 50%, 29% 90%, 31% 20%, 33% 70%,
            35% 25%, 37% 80%, 39% 10%, 41% 60%, 43% 30%, 45% 75%,
            47% 20%, 49% 65%, 51% 10%, 53% 55%, 55% 30%, 57% 85%,
            59% 20%, 61% 70%, 63% 0%, 65% 55%, 67% 30%, 69% 80%,
            71% 20%, 73% 70%, 75% 10%, 77% 50%, 79% 90%, 81% 20%,
            83% 60%, 85% 10%, 87% 70%, 89% 25%, 91% 80%, 93% 20%,
            95% 65%, 97% 10%, 99% 55%, 100% 30%, 100% 100%
          );
          z-index: 1;
        }
        .mv-torn-card::after {
          content: '';
          position: absolute;
          bottom: -7px; left: 0; right: 0; height: 13px;
          background: var(--card, #fffef9);
          clip-path: polygon(
            0% 0%, 1.5% 85%, 3% 25%, 5% 95%, 7% 35%, 9% 75%,
            11% 15%, 13% 85%, 15% 45%, 17% 100%, 19% 25%, 21% 75%,
            23% 35%, 25% 95%, 27% 55%, 29% 15%, 31% 85%, 33% 35%,
            35% 75%, 37% 25%, 39% 95%, 41% 45%, 43% 75%, 45% 25%,
            47% 85%, 49% 35%, 51% 95%, 53% 45%, 55% 75%, 57% 15%,
            59% 85%, 61% 35%, 63% 100%, 65% 45%, 67% 75%, 69% 25%,
            71% 85%, 73% 35%, 75% 95%, 77% 55%, 79% 15%, 81% 85%,
            83% 45%, 85% 95%, 87% 35%, 89% 75%, 91% 25%, 93% 85%,
            95% 45%, 97% 95%, 99% 55%, 100% 25%, 100% 0%
          );
          z-index: 1;
        }

        /* ── polaroid frame — resizes to image ── */
        .mv-polaroid {
          background: white;
          /* top/sides padding = the white border; bottom = space for caption */
          padding: 10px 10px 40px;
          box-shadow: 3px 4px 0 rgba(0,0,0,0.1), 5px 7px 20px rgba(0,0,0,0.13);
          position: relative;
          display: inline-block;
          /* NO fixed width/height — shrinks to image content */
          max-width: 260px;
        }
        /* The image sits naturally — no forced container, no crop */
        .mv-polaroid-img {
          display: block;
          width: 100%;
          height: auto;
          max-width: 220px;
          object-fit: contain;
          filter: drop-shadow(1px 3px 5px rgba(0,0,0,0.14));
        }
        .mv-polaroid-caption {
          font-family: 'Caveat', cursive;
          font-size: 15px;
          color: #666;
          text-align: center;
          position: absolute;
          bottom: 8px;
          left: 0; right: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        /* ── washi tape ── */
        .mv-tape { position: absolute; height: 22px; border-radius: 2px; opacity: 0.84; z-index: 10; }
        .mv-tape-tl  { width: 46px; top: -11px; left: 12px;  transform: rotate(-20deg); }
        .mv-tape-tr  { width: 46px; top: -11px; right: 12px; transform: rotate(20deg);  }
        .mv-tape-top { width: 72px; top: -11px; left: 50%; transform: translateX(-50%); }

        /* ── dashed content card ── */
        .mv-dashed-card {
          border: 2.5px dashed;
          border-radius: 16px;
          padding: 28px 32px 32px;
          position: relative;
          background: var(--card, rgba(255,255,255,0.6));
          backdrop-filter: blur(2px);
          margin-top: 14px;
        }

        /* ── stamp ── */
        .mv-stamp {
          font-family: 'Caveat', cursive;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          border: 3px solid;
          padding: 4px 10px;
          border-radius: 4px;
          opacity: 0.52;
          position: absolute;
          top: 14px; right: 18px;
          transform: rotate(-4deg);
          white-space: nowrap;
        }

        /* ── pin ── */
        .mv-pin {
          width: 18px; height: 18px;
          border-radius: 50%;
          position: absolute;
          top: -9px; left: 50%;
          transform: translateX(-50%);
          box-shadow: 0 2px 5px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(0,0,0,0.15);
          z-index: 20;
        }
        .mv-pin::after {
          content: '';
          width: 6px; height: 6px;
          background: rgba(255,255,255,0.5);
          border-radius: 50%;
          position: absolute;
          top: 3px; left: 3px;
        }

        /* ── typography ── */
        .mv-title {
          font-family: 'Caveat', cursive;
          font-weight: 700;
          font-size: clamp(52px, 6vw, 82px);
          line-height: 1;
          margin-bottom: 14px;
        }
        .mv-subtitle {
          font-family: 'Caveat', cursive;
          font-size: 20px;
          line-height: 1.6;
          color: var(--muted-foreground, #4a4035);
          padding-top: 18px;
          margin: 0;
        }
        .mv-body {
          font-family: 'Nunito', sans-serif;
          font-size: 15px;
          line-height: 1.85;
          color: var(--foreground, #3d3428);
        }
        .mv-body p { margin-bottom: 10px; }
        .mv-body p:last-child { margin-bottom: 0; }

        /* ── divider ── */
        .mv-divider { display: flex; align-items: center; gap: 16px; margin: 64px 0; }
        .mv-divider-line {
          flex: 1; height: 2px;
          background: repeating-linear-gradient(
            90deg,
            var(--border, #c4b99a) 0, var(--border, #c4b99a) 8px,
            transparent 8px, transparent 18px
          );
        }

        /* ── corner doodle icon ── */
        .mv-corner-icon {
          position: absolute;
          bottom: 10px; right: 14px;
          opacity: 0.22;
        }

        /* ── float animation ── */
        @keyframes mv-float {
        0%, 100% { transform: var(--base-rot) translateY(-3px); }
        50%       { transform: var(--base-rot) translateY(3px); }
        }
        .mv-float { animation: mv-float 4.5s ease-in-out infinite; }
      `}</style>

      <Container style={{ marginTop: '64px', marginBottom: '64px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sections.map((sec, sectionIdx) => {
            const isEven      = sectionIdx % 2 === 0;
            const imgSrc      = sec.image_url || FALLBACK_IMAGES[sectionIdx % FALLBACK_IMAGES.length];
            const tapeColor   = TAPE_COLORS[sectionIdx % TAPE_COLORS.length];
            const cardRot     = ROTATIONS[sectionIdx % ROTATIONS.length];
            const imgRot      = IMG_ROTATIONS[sectionIdx % IMG_ROTATIONS.length];
            const accentColor = ['#a855f7', '#16a34a', '#2563eb', '#d97706'][sectionIdx % 4];
            const pinColor    = accentColor;
            const CornerIcon  = CORNER_ICONS[sectionIdx % CORNER_ICONS.length];

            return (
              <div key={sectionIdx}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '48px',
                  alignItems: 'center',
                  direction: isEven ? 'ltr' : 'rtl',
                }}>

                  {/* ── Polaroid — card reshapes to image ── */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    direction: 'ltr',
                    padding: '24px',
                  }}>
                    <div
                      className="mv-polaroid mv-float"
                      style={{
                        '--base-rot': `rotate(${imgRot}deg)`,
                        transform: `rotate(${imgRot}deg)`,
                      }}
                    >
                      {/* Washi tape corners */}
                      <div className="mv-tape mv-tape-tl" style={{ background: tapeColor }} />
                      <div className="mv-tape mv-tape-tr" style={{ background: tapeColor }} />

                      {/* Image — natural size, no forced container */}
                      <img
                        className="mv-polaroid-img"
                        src={imgSrc}
                        alt={sec.title}
                      />

                      {/* Caption with Lucide pin icon */}
                      <div className="mv-polaroid-caption">
                        {sec.title}
                        <Pin size={13} strokeWidth={2.5} />
                      </div>
                    </div>
                  </div>

                  {/* ── Content ── */}
                  <div style={{ direction: 'ltr', position: 'relative' }}>

                    <h2
                      className="mv-title"
                      style={{
                        color: accentColor,
                        textAlign: isEven ? 'left' : 'right',
                      }}
                    >
                      {sec.title}
                    </h2>

                    {/* Torn card — subtitle */}
                    <div
                      className="mv-torn-card"
                      style={{
                        transform: `rotate(${cardRot}deg)`,
                        padding: '28px 32px',
                        marginBottom: '20px',
                      }}
                    >
                      <div className="mv-pin" style={{ background: pinColor }} />
                      <div
                        className="mv-stamp"
                        style={{ color: accentColor, borderColor: accentColor }}
                      >
                        {sec.title}
                      </div>
                      <p className="mv-subtitle">{sec.subtitle}</p>
                    </div>

                    {/* Dashed content card */}
                    {sec.content && (
                      <div
                        className="mv-dashed-card"
                        style={{
                          borderColor: accentColor,
                          transform: `rotate(${-cardRot * 0.45}deg)`,
                        }}
                      >
                        <div className="mv-tape mv-tape-top" style={{ background: tapeColor }} />
                        <div
                          className="mv-body"
                          dangerouslySetInnerHTML={{ __html: sec.content ?? '' }}
                        />
                        {/* Lucide corner doodle */}
                        <div className="mv-corner-icon">
                          <CornerIcon size={20} strokeWidth={1.5} color={accentColor} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {sectionIdx < sections.length - 1 && (
                  <div className="mv-divider">
                    <div className="mv-divider-line" />
                    <DividerIcon />
                    <div className="mv-divider-line" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ValuesSection — App Store list
// ─────────────────────────────────────────────────────────────────────────────

export function ValuesSection({ section }) {
  const items = section.items ?? [];

  return (
    <SectionWrapper className="py-16 bg-white dark:bg-gray-800">
      <Container>
        <div className="text-center mb-12 mt-6">
          {section.title && (
            <h2 className="text-2xl lg:text-3xl font-bold text-primary mb-3">
              {section.title}
            </h2>
          )}
          {section.subtitle && (
            <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {section.subtitle}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            columnGap: '40px',
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.id ?? index}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 0',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f3f4f6',
                }}
              >
                {item.icon_url || item.icon ? (
                  <img src={item.icon_url ?? item.icon} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                ) : (
                  <span style={{ fontSize: '25px', fontWeight: 'bold', color: '#a855f7' }}>✦</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#a855f7', lineHeight: '1.3' }}>
                  {item.title}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {item.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamSection — App Store card style
// ≤ 4 → 2-col grid   |   > 4 → sliding carousel
// Each card: text LEFT, circle photo RIGHT
// ─────────────────────────────────────────────────────────────────────────────

function TeamCard({ item }) {
  return (
    <div className="flex items-center gap-5 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      {/* Text LEFT */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-500 dark:text-primary-400 mb-1">
          Team Member
        </p>
        <p className="font-bold text-[16px] text-primary leading-tight">{item.name}</p>
        <p className="text-[12px] text-primary-600 dark:text-primary-400 font-medium mt-0.5 mb-2">{item.role}</p>
        <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{item.bio}</p>
      </div>

      {/* Circle photo RIGHT — fixed size, center-crop */}
      <div style={{ flexShrink: 0, width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden' }}
        className="ring-2 ring-gray-100 dark:ring-gray-700 bg-gray-100 dark:bg-gray-800">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            style={{ width: '120px', height: '120px', objectFit: 'cover', objectPosition: 'center top' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-100 dark:bg-primary-900/30">
            <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {item.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TeamSection({ section }) {
  const items = section.items ?? [];
  return (
    <SectionWrapper className="py-24 bg-gray-50 dark:bg-gray-800/40" style={{ marginTop: '48px' }}>
      <Container>
        <div className="text-center mb-12 mt-6">
          {section.title && (
            <h2 className="text-2xl lg:text-3xl font-bold text-primary mb-3">
              {section.title}
            </h2>
          )}
          {section.subtitle && (
            <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {section.subtitle}
            </p>
          )}
        </div>
        {items.length > 4 ? (
          <TeamCarousel items={items} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: items.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: '16px',
            maxWidth: items.length === 1 ? '480px' : '100%',
            margin: items.length === 1 ? '0 auto' : undefined,
          }}>
            {items.map((item, i) => <TeamCard key={i} item={item} />)}
          </div>
        )}
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ContactInfoSection — App Store list
// Each row: [icon] [label (small caps eyebrow) + value]
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_ICONS = {
  email:   Mail,
  phone:   Phone,
  address: MapPin,
  hours:   Clock,
  social:  Share2,
};

export function ContactInfoSection({ section }) {
  const items = section.items ?? [];

  return (
    <SectionWrapper className="py-16 bg-white dark:bg-gray-800">
      <Container>
        <div className="text-center mb-12 mt-6">
          {section.title && (
            <h2 className="text-2xl lg:text-3xl font-bold text-primary mb-3">
              {section.title}
            </h2>
          )}
          {section.subtitle && (
            <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {section.subtitle}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            columnGap: '40px',
          }}
        >
          {items.map((item, index) => {
            const IconComp = CONTACT_ICONS[item.type] ?? Mail;
            return (
              <div
                key={item.id ?? index}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px 0',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f3f4f6',
                  }}
                >
                  <IconComp size={20} style={{ color: '#a855f7' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#a855f7', lineHeight: '1.3' }}>
                    {item.value}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {item.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FaqSection
// ─────────────────────────────────────────────────────────────────────────────

export function FaqSection({ section }) {
  const [open, setOpen] = useState(null);
  const items = section.items ?? [];

  return (
    <SectionWrapper className="py-24 bg-gray-50 dark:bg-gray-800/40" style={{ marginTop: '48px' }}>
      <Container>
        <div className="text-center mb-12 mt-6">
          {section.title && (
            <h2 className="text-3xl lg:text-4xl font-bold text-primary mb-3">
              {section.title}
            </h2>
          )}
          {section.subtitle && (
            <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {section.subtitle}
            </p>
          )}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginTop: '32px',
          alignItems: 'start',
        }}>
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border overflow-hidden"
              style={{
                borderColor: open === i ? '#a855f7' : 'rgba(168,85,247,0.3)',
                background: open === i ? 'rgba(168,85,247,0.08)' : 'transparent',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
                <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                style={{ background: 'rgba(255, 255, 255, 0.67)', border: 'none' }}
                >
                <span className="text-[14px] font-medium text-gray-800 dark:text-gray-200">
                  {item.question}
                </span>
                <span style={{ fontSize: '20px', color: '#a855f7', flexShrink: 0, lineHeight: 1 }}>
                  {open === i ? '−' : '+'}
                </span>
              </button>
              {open === i && (
                <div className="px-6 pb-6">
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LinksSection
// ─────────────────────────────────────────────────────────────────────────────

export function LinksSection({ section }) {
  const items = section.items ?? [];
  return (
    <SectionWrapper className="py-24 bg-white dark:bg-gray-900">
      <Container>
        <div style={{ marginTop: '48px' }}>  {/* margin here instead of SectionWrapper */}
          <SectionHeading title={section.title} subtitle={section.subtitle} centered />
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            justifyContent: 'center',
            marginTop: '32px',
          }}>
            {items.map((item, i) => (
              <Link
                key={i}
                to={item.url}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group"
                style={{ padding: '14px 28px' }} 
              >
                <ArrowRight size={15} className="text-primary-500 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                <span className="text-[14px] font-medium text-gray-700 dark:text-gray-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RichTextSection
// ─────────────────────────────────────────────────────────────────────────────

export function RichTextSection({ section }) {
  return (
    <SectionWrapper className="py-24 bg-white dark:bg-gray-900">
      <Container>
        <div className="max-w-3xl mx-auto">
          <SectionHeading title={section.title} subtitle={section.subtitle} centered />
          <div
            className="prose prose-lg dark:prose-invert max-w-none text-gray-600 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: section.content ?? '' }}
          />
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TextSection
// ─────────────────────────────────────────────────────────────────────────────

export function TextSection({ section }) {
  return (
    <SectionWrapper className="py-20 bg-gray-50 dark:bg-gray-800/40">
      <Container>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-5 text-center">
            {section.title}
          </h2>
          <p className="text-[15px] text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
            {section.content}
          </p>
        </div>
      </Container>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomSection
// ─────────────────────────────────────────────────────────────────────────────

export function CustomSection({ section }) {
  return (
    <SectionWrapper className="py-20 bg-white dark:bg-gray-900">
      <Container>
        <div className="max-w-3xl mx-auto">
          {section.title && (
            <h2 className="text-2xl font-bold text-primary mb-5 text-center">
              {section.title}
            </h2>
          )}
          {section.content && (
            <div
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: section.content }}
            />
          )}
        </div>
      </Container>
    </SectionWrapper>
  );
}