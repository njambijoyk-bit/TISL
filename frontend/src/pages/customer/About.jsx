import { useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useContentStore from '../../store/contentStore';
import { HeroCarousel } from '../../components/content/sections';
import SectionRenderer from '../../components/content/SectionRenderer';

// 📌 Define your exact visual order here (hero is handled separately)
const ABOUT_SECTION_ORDER = [
  'custom',
  'mission_vision',
  'values',
  'team',
  'stats',
  'cta',
];

const PULSE_CSS = `
  @keyframes skel-pulse {
    0%, 100% { opacity: 1;    box-shadow: 0 0 10px rgba(168,85,247,0.10); }
    50%       { opacity: 0.4; box-shadow: 0 0 26px rgba(168,85,247,0.30); }
  }
`;

function Skel({ h = 16, w = '100%', r = 8, delay = 0, style = {} }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: r,
      background: 'rgba(168,85,247,0.07)',
      border: '1px solid rgba(168,85,247,0.18)',
      animation: `skel-pulse 1.8s ease-in-out ${delay}ms infinite`,
      ...style,
    }} />
  );
}

function AboutSkeleton() {
  return (
    <div>
      <style>{PULSE_CSS}</style>

      {/* Hero */}
      <div style={{
        height: 380,
        background: 'rgba(168,85,247,0.05)',
        borderBottom: '1px solid rgba(168,85,247,0.22)',
        animation: 'skel-pulse 1.8s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 'clamp(5rem, 18vw, 11rem)', fontWeight: 900,
          color: 'rgba(168,85,247,0.08)', letterSpacing: '-0.04em',
          userSelect: 'none', lineHeight: 1,
        }}>
          TISL
        </span>
      </div>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px' }}>

        {/* custom — centred intro block */}
        <div style={{ maxWidth: 640, margin: '0 auto 80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Skel h={28} w={300} r={8} />
          <Skel h={14} w="90%" r={6} delay={60} />
          <Skel h={14} w="75%" r={6} delay={100} />
          <Skel h={14} w="82%" r={6} delay={140} />
        </div>

        {/* mission_vision — 2 polaroid+content rows, alternating sides */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 56, marginBottom: 80 }}>
          {[0, 1].map((row) => (
            <div key={row} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 48,
              alignItems: 'center',
              direction: row % 2 === 0 ? 'ltr' : 'rtl',
            }}>
              {/* Polaroid */}
              <div style={{ display: 'flex', justifyContent: 'center', direction: 'ltr' }}>
                <div style={{
                  width: 220, padding: '10px 10px 40px',
                  background: 'rgba(168,85,247,0.07)',
                  border: '1px solid rgba(168,85,247,0.18)',
                  borderRadius: 4,
                  transform: `rotate(${row % 2 === 0 ? 3 : -2}deg)`,
                  animation: `skel-pulse 1.8s ease-in-out ${row * 200}ms infinite`,
                }}>
                  <Skel h={180} r={2} delay={row * 200} />
                  <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Skel h={10} w={100} r={99} delay={row * 200 + 100} />
                  </div>
                </div>
              </div>
              {/* Content */}
              <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Skel h={40} w="60%" r={8} delay={row * 150} />
                <Skel h={80} r={10} delay={row * 150 + 80} />
                <Skel h={100} r={10} delay={row * 150 + 160} />
              </div>
            </div>
          ))}
        </div>

        {/* values — heading + 2-col icon rows */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <Skel h={28} w={200} r={8} />
            <Skel h={13} w={280} r={6} delay={80} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
                <Skel h={48} w={48} r={12} delay={i * 70} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skel h={13} w="65%" r={6} delay={i * 70} />
                  <Skel h={10} w="50%" r={6} delay={i * 70 + 40} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* team — heading + 2-col cards */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <Skel h={28} w={160} r={8} />
            <Skel h={13} w={240} r={6} delay={80} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 20, padding: 20,
                borderRadius: 16, border: '1px solid rgba(168,85,247,0.18)',
                background: 'rgba(168,85,247,0.04)',
              }}>
                {/* text lines left */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skel h={10} w="40%" r={99} delay={i * 90} />
                  <Skel h={16} w="70%" r={6} delay={i * 90 + 50} />
                  <Skel h={11} w="55%" r={6} delay={i * 90 + 90} />
                  <Skel h={10} w="85%" r={6} delay={i * 90 + 130} />
                  <Skel h={10} w="60%" r={6} delay={i * 90 + 160} />
                </div>
                {/* circle photo right */}
                <Skel h={120} w={120} r={999} style={{ flexShrink: 0 }} delay={i * 90 + 40} />
              </div>
            ))}
          </div>
        </div>

        {/* stats — dark band with 4 rings */}
        <div style={{
          borderRadius: 20, padding: '48px 24px', marginBottom: 80,
          background: 'rgba(168,85,247,0.04)',
          border: '1px solid rgba(168,85,247,0.15)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32,
          justifyItems: 'center',
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Skel h={160} w={160} r={999} delay={i * 120} />
              <Skel h={10} w={80} r={6} delay={i * 120 + 80} />
            </div>
          ))}
        </div>

        {/* cta — centred */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Skel h={32} w={320} r={8} />
          <Skel h={16} w={240} r={6} delay={100} />
          <Skel h={48} w={160} r={12} delay={200} />
        </div>

      </div>
    </div>
  );
}

export default function About() {
  const { publicPage, loading, fetchPublicPage, clearPublicPage } = useContentStore();
  const slug = 'about';

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchPublicPage(slug);
    return () => clearPublicPage();
  }, [slug, fetchPublicPage, clearPublicPage]);

  // 1️⃣ Separate hero from content sections
  const { heroSections, otherSections } = useMemo(() => {
    const raw = publicPage?.active_sections ?? publicPage?.activeSections ?? [];
    const sorted = [...raw].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      heroSections: sorted.filter(s => s.section_type === 'hero'),
      otherSections: sorted.filter(s => s.section_type !== 'hero'),
    };
  }, [publicPage]);

  // 2️⃣ Reorder content sections based on your custom priority
  const orderedSections = useMemo(() => {
    const priorityMap = new Map(ABOUT_SECTION_ORDER.map((type, i) => [type, i]));
    return [...otherSections].sort((a, b) => {
      const rankA = priorityMap.get(a.section_type) ?? Infinity;
      const rankB = priorityMap.get(b.section_type) ?? Infinity;
      return rankA - rankB;
    });
  }, [otherSections]);

  // 🌑 Loading state (dark-themed)
  if (loading.public && !publicPage) {
    return (
      <div className="min-h-screen">
        <Header />
        <AboutSkeleton />
        <Footer />
      </div>
    );
  }

  // 🚫 404 state
  if (!loading.public && !publicPage) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-6xl font-black text-zinc-800 mb-4">404</p>
            <p className="text-sm text-zinc-500">This page isn't available right now.</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>About Us — TISL Store</title>
        <meta name="description" content="Learn more about TISL Store — who we are, what we do, and our mission to serve customers in Nairobi." />
      </Helmet>

      <div className="min-h-screen bg-zinc-950 text-white">
        <Header />

        {/* ── Hero ── */}
        {heroSections.length > 0 && (
          <HeroCarousel sections={heroSections} pageType={publicPage?.page_type} />
        )}

        {/* ── Custom Ordered Sections ── */}
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 space-y-24">
          {orderedSections.map((section) => (
            <SectionRenderer key={section.id ?? section.section_type} section={section} />
          ))}
        </div>

        <Footer />
      </div>
    </>
  );
}