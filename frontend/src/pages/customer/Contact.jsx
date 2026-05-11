import { useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useContentStore from '../../store/contentStore';
import { HeroCarousel } from '../../components/content/sections';
import SectionRenderer from '../../components/content/SectionRenderer';
import Mimi from '../../components/chat/Mimi';

// 📌 CMS section order for Contact page (excluding hero & hardcoded chatbot)
const CONTACT_SECTION_ORDER = [
  'contact_info', // Maps to "contact details" in your CMS
  'faq',
  'cta',
  'custom',
];

const PULSE_CSS = `
  @keyframes skel-pulse {
    0%, 100% { opacity: 1;    box-shadow: 0 0 10px rgba(168,85,247,0.10); }
    50%       { opacity: 0.4; box-shadow: 0 0 26px rgba(168,85,247,0.30); }
  }
`;

function Skel({ h = 16, w = '100%', r = 8, delay = 0 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: r,
      background: 'rgba(168,85,247,0.07)',
      border: '1px solid rgba(168,85,247,0.18)',
      animation: `skel-pulse 1.8s ease-in-out ${delay}ms infinite`,
    }} />
  );
}

function ContactSkeleton() {
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

        {/* Contact info section */}
        <div style={{ marginBottom: 80 }}>
          <Skel h={13} w={120} r={99} style={{ marginBottom: 10 }} />
          <Skel h={28} w={260} r={8} style={{ marginBottom: 32 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
                <Skel h={48} w={48} r={12} delay={i * 80} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skel h={13} w="70%" r={6} delay={i * 80} />
                  <Skel h={10} w="45%" r={6} delay={i * 80 + 40} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ section */}
        <div style={{ marginBottom: 80 }}>
          <Skel h={13} w={60} r={99} style={{ marginBottom: 10 }} />
          <Skel h={28} w={180} r={8} style={{ marginBottom: 32 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skel key={i} h={58} r={10} delay={i * 90} />
            ))}
          </div>
        </div>

        {/* CTA section */}
        <div style={{ marginBottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Skel h={32} w={320} r={8} />
          <Skel h={16} w={240} r={6} delay={100} />
          <Skel h={48} w={160} r={12} delay={200} />
        </div>

        {/* Mimi chatbot */}
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <Skel h={12} w={180} r={6} style={{ marginBottom: 12 }} />
          <Skel h={220} r={16} delay={150} />
        </div>

      </div>
    </div>
  );
}

export default function Contact() {
  const { publicPage, loading, fetchPublicPage, clearPublicPage } = useContentStore();
  const slug = 'contact';

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

  // 2️⃣ Sort CMS sections by your custom priority
  const orderedSections = useMemo(() => {
    const priorityMap = new Map(CONTACT_SECTION_ORDER.map((type, i) => [type, i]));
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
        <ContactSkeleton />
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
        <title>Contact Us — TISL Store</title>
        <meta name="description" content="Get in touch with TISL Store. Find our contact details, FAQs, and reach out to our team." />
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

        {/* ── Mimi Chatbot (Hardcoded inline section) ── */}
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 48px' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a855f7', marginBottom: 12 }}>
          ✨ Or chat with Mimi instantly
        </p>
        <Mimi embedded />
      </div>

        <Footer />
      </div>
    </>
  );
}