import { useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useContentStore from '../../store/contentStore';
import { HeroCarousel } from '../../components/content/sections';
import SectionRenderer from '../../components/content/SectionRenderer';

// 📌 Define your exact visual order for the Manuals page
const MANUAL_SECTION_ORDER = [
  'rich_text',
  'faq',
  'links',
  'text',
  'custom',
];

// ─── Skeleton primitives (mirror the About page pattern) ───────────────────

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

function ManualSkeleton() {
  return (
    <div>
      <style>{PULSE_CSS}</style>

      {/* ── Hero banner ── */}
      <div style={{
        height: 320,
        background: 'rgba(168,85,247,0.05)',
        borderBottom: '1px solid rgba(168,85,247,0.22)',
        animation: 'skel-pulse 1.8s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 'clamp(4rem, 15vw, 9rem)', fontWeight: 900,
          color: 'rgba(168,85,247,0.08)', letterSpacing: '-0.04em',
          userSelect: 'none', lineHeight: 1,
        }}>
          TISL
        </span>
      </div>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px' }}>

        {/* ── rich_text — centred heading + long prose block ── */}
        <div style={{ maxWidth: 760, margin: '0 auto 80px' }}>
          {/* Heading block */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <Skel h={32} w={320} r={8} />
            <Skel h={14} w={480} r={6} delay={60} />
          </div>
          {/* Prose lines — long paragraph feel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[100, 94, 97, 88, 100, 72].map((pct, i) => (
              <Skel key={i} h={13} w={`${pct}%`} r={4} delay={i * 40} />
            ))}
            {/* paragraph break */}
            <div style={{ height: 8 }} />
            {[95, 100, 88, 91, 76].map((pct, i) => (
              <Skel key={i + 6} h={13} w={`${pct}%`} r={4} delay={(i + 6) * 40} />
            ))}
          </div>
        </div>

        {/* ── faq — heading + 2-col accordion grid ── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <Skel h={30} w={240} r={8} />
            <Skel h={13} w={320} r={6} delay={80} />
          </div>
          {/* 2-col FAQ items — closed accordion rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                borderRadius: 8,
                border: '1px solid rgba(168,85,247,0.18)',
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                background: 'rgba(168,85,247,0.03)',
              }}>
                <Skel h={13} w="75%" r={4} delay={i * 70} />
                {/* The +/− toggle */}
                <Skel h={20} w={20} r={4} style={{ flexShrink: 0 }} delay={i * 70 + 40} />
              </div>
            ))}
          </div>
        </div>

        {/* ── links — heading + pill row ── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <Skel h={28} w={200} r={8} />
            <Skel h={13} w={280} r={6} delay={80} />
          </div>
          {/* Wrapping flex of pill-shaped link buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {[140, 110, 165, 125, 150, 100, 135].map((w, i) => (
              <Skel key={i} h={48} w={w} r={12} delay={i * 60} />
            ))}
          </div>
        </div>

        {/* ── text — centred h2 + paragraph ── */}
        <div style={{ maxWidth: 760, margin: '0 auto 80px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Skel h={26} w={280} r={8} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[96, 100, 84, 91, 68].map((pct, i) => (
              <Skel key={i} h={13} w={`${pct}%`} r={4} delay={i * 50} />
            ))}
          </div>
        </div>

        {/* ── custom — centred title + prose ── */}
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Skel h={26} w={220} r={8} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[88, 100, 94, 76].map((pct, i) => (
              <Skel key={i} h={13} w={`${pct}%`} r={4} delay={i * 50 + 20} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function Manual() {
  const { publicPage, loading, fetchPublicPage, clearPublicPage } = useContentStore();
  const slug = 'manual';

  useEffect(() => {
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
    const priorityMap = new Map(MANUAL_SECTION_ORDER.map((type, i) => [type, i]));
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
        <ManualSkeleton />
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
        <title>Manuals & Documentation — TISL Store</title>
        <meta name="description" content="Browse product manuals, guides, and frequently asked questions for industrial equipment." />
      </Helmet>

      <div className="min-h-screen bg-zinc-950 text-white">
        <Header />

        {/* ── Hero ── */}
        {heroSections.length > 0 && (
          <HeroCarousel sections={heroSections} pageType={publicPage?.page_type} />
        )}

        {/* ── Custom Ordered CMS Sections ── */}
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