import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Package, ChevronRight } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import CollapsedProductCard from '../../../ecommerce/components/storefront/products/CollapsedProductCard';
import { HeroCarousel } from '../../components/content/sections';
import SectionRenderer from '../../components/content/SectionRenderer';
import useContentStore from '../../../_shared/store/contentStore';
import { productsAPI, categoriesAPI, brandsAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

// ── Section wrapper — no background, let theme decide ─────────────────────────
function Section({ children, style = {} }) {
  return (
    <section style={{ padding: '64px 0', ...style }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        {children}
      </div>
    </section>
  );
}

// ── Section heading ────────────────────────────────────────────────────────────
function SectionTitle({ eyebrow, title, cta, ctaPath }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32, gap: 16 }}>
      <div>
        {eyebrow && (
          <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c084fc', margin: '0 0 6px' }}>
            {eyebrow}
          </p>
        )}
        <h2 style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, letterSpacing: '-0.02em', color: '#a855f7', margin: 0, lineHeight: 1.2 }}>
          {title}
        </h2>
      </div>
      {cta && ctaPath && (
        <button
          onClick={() => navigate(ctaPath)}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 20px', borderRadius: 99,
            border: '1.5px solid rgba(168,85,247,0.4)',
            boxShadow: '0 0 12px rgba(168,85,247,0.15)',
            background: 'transparent', color: '#a855f7',
            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
            transition: 'all 150ms ease', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#a855f7';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.boxShadow = '0 0 22px rgba(168,85,247,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#a855f7';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(168,85,247,0.15)';
          }}
        >
          {cta} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

// ── Skeletons — pulsating glowy purple, no hardcoded bg ───────────────────────
const PULSE_CSS = `
  @keyframes skel-pulse {
    0%, 100% { opacity: 1;    box-shadow: 0 0 10px rgba(168,85,247,0.10); }
    50%       { opacity: 0.4; box-shadow: 0 0 26px rgba(168,85,247,0.30); }
  }
`;
const ANIM_CSS = `
  @keyframes pill-in {
    from { opacity: 0; transform: translateY(8px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
  }
`;

function Skeleton({ h = 60, r = 12, w = '100%', delay = 0, style = {} }) {
  return (
    <div style={{
      height: h, borderRadius: r, width: w,
      background: 'rgba(168,85,247,0.07)',
      border: '1px solid rgba(168,85,247,0.2)',
      animation: `skel-pulse 1.8s ease-in-out ${delay}ms infinite`,
      ...style,
    }} />
  );
}

function PageSkeleton() {
  return (
    <div>
      <style>{PULSE_CSS}</style>

      {/* Hero — full bleed with TISL watermark */}
      <div style={{
        height: 460,
        background: 'rgba(168,85,247,0.05)',
        borderBottom: '1px solid rgba(168,85,247,0.22)',
        animation: 'skel-pulse 1.8s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 'clamp(5rem, 18vw, 11rem)',
          fontWeight: 900,
          color: 'rgba(168,85,247,0.08)',
          letterSpacing: '-0.04em',
          userSelect: 'none',
          lineHeight: 1,
        }}>
          TISL
        </span>
      </div>

      {/* Categories */}
      <div style={{ padding: '64px 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <Skeleton h={11} w={80} r={99} style={{ marginBottom: 10 }} />
        <Skeleton h={24} w={210} r={8} style={{ marginBottom: 28 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} h={34} w={`${70 + (i % 5) * 18}px`} r={99} delay={i * 70} />
          ))}
        </div>
      </div>

      {/* Products */}
      <div style={{ padding: '0 24px 64px', maxWidth: 1200, margin: '0 auto' }}>
        <Skeleton h={11} w={100} r={99} style={{ marginBottom: 10 }} />
        <Skeleton h={24} w={230} r={8} style={{ marginBottom: 28 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h={74} r={12} delay={i * 100} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();

  const { publicPage, loading: contentLoading, fetchPublicPage, clearPublicPage } = useContentStore();

  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories]             = useState([]);
  const [brands, setBrands]                     = useState([]);
  const [dataLoading, setDataLoading]           = useState(true);

  const [catPage, setCatPage] = useState(0);

  useEffect(() => {
    fetchPublicPage('homepage');
    fetchHomeData();
    return () => clearPublicPage();
  }, []);

  
  useEffect(() => {
    if (categories.length <= 10) return;
    const id = setInterval(() => {
      setCatPage(p => (p + 1) % Math.ceil(categories.slice(0, 24).length / 5));
    }, 3000);
    return () => clearInterval(id);
  }, [categories]);


  const fetchHomeData = async () => {
    try {
      setDataLoading(true);
      const [productsRes, categoriesRes, brandsRes] = await Promise.all([
        productsAPI.getFeaturedProducts().catch(() => []),
        Promise.all([
          categoriesAPI.getCategories().catch(() => ({ data: [] })),
          categoriesAPI.getMainCategories().catch(() => ({ data: [] })),
        ]).then(async ([allRes, mainRes]) => {
          const all  = Array.isArray(allRes)  ? allRes  : allRes?.data  ?? [];
          const main = Array.isArray(mainRes) ? mainRes : mainRes?.data ?? [];
          if (all.some(c => c.parent_id)) return all;
          const subResults = await Promise.all(
            main.map(c => categoriesAPI.getSubcategories(c.id).catch(() => []))
          );
          const subs = subResults.flatMap(r => Array.isArray(r) ? r : r?.data ?? []);
          return [...main, ...subs];
        }).catch(() => []),
        brandsAPI.getFeaturedBrands().catch(() => []),
      ]);
      setFeaturedProducts(Array.isArray(productsRes) ? productsRes : productsRes?.data ?? []);
      setCategories(Array.isArray(categoriesRes) ? categoriesRes : []);
      setBrands(Array.isArray(brandsRes) ? brandsRes : brandsRes?.data ?? []);
    } catch {
      toast.error('Failed to load page data. Please refresh.');
    } finally {
      setDataLoading(false);
    }
  };

  const { heroSections, otherSections } = useMemo(() => {
    const raw    = publicPage?.active_sections ?? publicPage?.activeSections ?? [];
    const sorted = [...raw].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      heroSections:  sorted.filter(s => s.section_type === 'hero'),
      otherSections: sorted.filter(s => s.section_type !== 'hero'),
    };
  }, [publicPage]);

  const isLoading = contentLoading.public && dataLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <PageSkeleton />
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>TISL Store — Products & Services in Nairobi</title>
        <meta name="description" content="Shop quality products and professional services in Nairobi. Browse featured products, top brands, and request custom quotes at TISL Store." />
        <meta property="og:title" content="TISL Store — Products & Services in Nairobi" />
        <meta property="og:description" content="Shop quality products and professional services in Nairobi." />
        <meta property="og:type" content="website" />
      </Helmet>
      <Header />

      {/* ── CMS Hero ── */}
      {heroSections.length > 0 && (
        <HeroCarousel sections={heroSections} pageType="homepage" />
      )}

      {/* ── Other CMS sections ── */}
      {otherSections.map(section => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      {/* ── Shop by Category ── */}
      {categories.length > 0 && (() => {
        const COLORS = [
  { color: '#7c3aed', glow: 'rgba(124,58,237,0.25)' }, // deep violet
  { color: '#0891b2', glow: 'rgba(8,145,178,0.22)'  }, // deep cyan
  { color: '#c026d3', glow: 'rgba(192,38,211,0.22)' }, // deep fuchsia
  { color: '#059669', glow: 'rgba(5,150,105,0.22)'  }, // deep emerald
  { color: '#d97706', glow: 'rgba(217,119,6,0.22)'  }, // deep amber
];
        const sliced   = categories.slice(0, 24);
        const perPage  = 10;
        const start    = catPage * perPage;
        const visible  = sliced.slice(start, start + perPage);

        return (
          <Section>
            <style>{`
              @keyframes pill-in {
                from { opacity: 0; transform: translateY(8px) scale(0.95); }
                to   { opacity: 1; transform: translateY(0)   scale(1); }
              }
              @keyframes pill-out {
                from { opacity: 1; transform: translateY(0)   scale(1); }
                to   { opacity: 0; transform: translateY(-6px) scale(0.95); }
              }
            `}</style>

            <SectionTitle eyebrow="Browse" title="Shop by Category" cta="All Products" ctaPath="/products" />

            {/* page dots */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {Array.from({ length: Math.ceil(sliced.length / perPage) }).map((_, di) => (
                <button
                  key={di}
                  onClick={() => setCatPage(di)}
                  style={{
                    width: di === catPage ? 20 : 6,
                    height: 6, borderRadius: 99, border: 'none', padding: 0,
                    background: di === catPage ? '#a855f7' : 'rgba(168,85,247,0.25)',
                    cursor: 'pointer',
                    transition: 'all 400ms ease',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 48 }}>
              {visible.map((category, i) => {
                const { color, glow } = COLORS[i % COLORS.length];
                return (
                  <button
                    key={`${catPage}-${category.id}`}
                    onClick={() => navigate(`/products?category=${category.id}`)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: category.parent_id ? '5px 13px' : '7px 16px',
                      border: `1px solid ${color}55`,
                      boxShadow: `0 0 10px ${glow}`,
                      borderRadius: 999, cursor: 'pointer', color,
                      fontSize: category.parent_id ? '0.76rem' : '0.82rem',
                      fontWeight: category.parent_id ? 500 : 600,
                      whiteSpace: 'nowrap', background: 'transparent',
                      animation: `pill-in 0.35s ease both`,
                      animationDelay: `${i * 60}ms`,
                      transition: 'transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = `0 0 22px ${glow}`;
                      e.currentTarget.style.borderColor = color;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = `0 0 10px ${glow}`;
                      e.currentTarget.style.borderColor = `${color}55`;
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    {category.image_url ? (
                      <img src={category.image_url} alt={category.name}
                        style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <Package size={12} style={{ flexShrink: 0, color }} />
                    )}
                    {category.name}
                    {category.parent_id && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 400 }}>sub</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        );
      })()}

      {/* ── Featured Products ── */}
      {featuredProducts.length > 0 && (
        <Section>
          <SectionTitle eyebrow="Handpicked" title="Featured Products" cta="View All" ctaPath="/products?featured=true" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
            {featuredProducts.slice(0, 8).map(product => (
              <CollapsedProductCard key={product.id} product={product} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Brands marquee ── */}
      {brands.length > 0 && (
        <section style={{
          padding: '40px 0', overflow: 'hidden',
          borderTop: '1px solid rgba(168,85,247,0.18)',
          borderBottom: '1px solid rgba(168,85,247,0.18)',
          boxShadow: '0 0 40px rgba(168,85,247,0.06)',
        }}>
          <style>{`
            @keyframes marquee-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .brands-track {
              display: flex; align-items: center; gap: 14px;
              width: max-content;
              animation: marquee-scroll 28s linear infinite;
            }
            .brands-track:hover { animation-play-state: paused; }
          `}</style>
          <p style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#c084fc', marginBottom: 20 }}>
            Brands
          </p>
          <div style={{ overflow: 'hidden' }}>
            <div className="brands-track">
              {[0, 1, 2, 3].flatMap(pass =>
                brands.map((brand, i) => (
                  <button
                    key={`${pass}-${brand.id}-${i}`}
                    onClick={() => navigate(`/products?brand=${brand.id}`)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '8px 18px', background: 'transparent',
                      border: '1px solid rgba(168,85,247,0.2)',
                      boxShadow: '0 0 8px rgba(168,85,247,0.07)',
                      borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                      transition: 'all 150ms ease',color: '#c084fc',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#a855f7';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(168,85,247,0.28)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)';
                      e.currentTarget.style.boxShadow = '0 0 8px rgba(168,85,247,0.07)';
                    }}
                  >
                    {brand.logo_url ? (
                      <img src={brand.logo_url} alt={brand.name}
                        style={{ height: 28, width: 'auto', maxWidth: 110, objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {brand.name}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}