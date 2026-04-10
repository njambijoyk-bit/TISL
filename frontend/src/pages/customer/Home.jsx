import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Package, FileText } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import CollapsedProductCard from '../../components/products/CollapsedProductCard';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import { HeroCarousel } from '../../components/content/sections';
import SectionRenderer from '../../components/content/SectionRenderer';
import useContentStore from '../../store/contentStore';
import { productsAPI, categoriesAPI, brandsAPI } from '../../api';
import toast from 'react-hot-toast';

export default function Home() {
  const navigate = useNavigate();

  // ── CMS homepage sections ────────────────────────────────────────────────
  const { publicPage, loading: contentLoading, fetchPublicPage, clearPublicPage } = useContentStore();

  useEffect(() => {
    fetchPublicPage('homepage');
    return () => clearPublicPage();
  }, []);

  const { heroSections, otherSections } = useMemo(() => {
    const raw    = publicPage?.active_sections ?? publicPage?.activeSections ?? [];
    const sorted = [...raw].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      heroSections:  sorted.filter(s => s.section_type === 'hero'),
      otherSections: sorted.filter(s => s.section_type !== 'hero'),
    };
  }, [publicPage]);

  // ── Products / categories / brands ───────────────────────────────────────
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories]             = useState([]);
  const [brands, setBrands]                     = useState([]);
  const [loading, setLoading]                   = useState(true);

  useEffect(() => { fetchHomeData(); }, []);

  const fetchHomeData = async () => {
    try {
      setLoading(true);
      const [productsRes, categoriesRes, brandsRes] = await Promise.all([
        productsAPI.getFeaturedProducts().catch(() => []),
        // Fetch main categories + all their subcategories in parallel
        Promise.all([
          categoriesAPI.getCategories().catch(() => ({ data: [] })),
          categoriesAPI.getMainCategories().catch(() => ({ data: [] })),
        ]).then(async ([allRes, mainRes]) => {
          const all  = Array.isArray(allRes)  ? allRes  : allRes?.data  ?? [];
          const main = Array.isArray(mainRes) ? mainRes : mainRes?.data ?? [];
          // If getCategories already returned subs, use it; otherwise fetch subs for each parent
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
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Helmet>
        <title>TISL Store — Products & Services in Nairobi</title>
        <meta name="description" content="Shop quality products and professional services in Nairobi. Browse featured products, top brands, and request custom quotes at TISL Store." />
        <meta property="og:title" content="TISL Store — Products & Services in Nairobi" />
        <meta property="og:description" content="Shop quality products and professional services in Nairobi." />
        <meta property="og:type" content="website" />
      </Helmet>
      <Header />

      {/* ── CMS Hero ─────────────────────────────────────────────────────── */}
      {contentLoading.public && heroSections.length === 0 ? (
        <div className="h-[480px] bg-gray-200 dark:bg-gray-800 animate-pulse" />
      ) : heroSections.length > 0 ? (
        <HeroCarousel sections={heroSections} pageType="homepage" />
      ) : null}

      {/* ── Other CMS sections (features, stats, cta, gallery…) ──────────── */}
      {otherSections.map(section => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      {/* ── Shop by Category ─────────────────────────────────────────────── */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10 mt-6">
            Shop by Category
          </h2>

          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No categories available yet</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                {categories.slice(0, 24).map((category) => (
                  <button
                    key={category.id}
                    onClick={() => navigate(`/products?category=${category.id}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '6px 14px',
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '999px',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      fontSize: category.parent_id ? '0.77rem' : '0.82rem',
                      fontWeight: category.parent_id ? 500 : 600,
                      color: '#374151',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#a855f7';
                      e.currentTarget.style.color = '#a855f7';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(168,85,247,0.15)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.color = '#374151';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    {category.image_url ? (
                      <img
                        src={category.image_url}
                        alt={category.name}
                        style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <Package size={13} style={{ flexShrink: 0, color: '#a855f7' }} />
                    )}
                    {category.name}
                    {category.parent_id && (
                      <span style={{ fontSize: '0.65rem', color: '#c4b5fd', fontWeight: 400 }}>
                        sub
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: '32px' }}>
                <button
                  onClick={() => navigate('/products')}
                  style={{
                    padding: '10px 28px',
                    border: '1px solid #a855f7',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: '#a855f7',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#a855f7';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#a855f7';
                  }}
                >
                  View All Categories
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Featured Products ─────────────────────────────────────────────── */}
      <section className="py-16 bg-white dark:bg-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Featured Products
            </h2>
            <button
                  onClick={() => navigate('/products?featured=true')}
                  style={{
                    padding: '10px 28px',
                    border: '1px solid #a855f7',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: '#a855f7',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#a855f7';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#a855f7';
                  }}
                >
                  View All
                </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : featuredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-4">No featured products available yet</p>
              <Button variant="primary" onClick={() => navigate('/products')}>
                Browse All Products
              </Button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '12px', width: '100%' }}>
              {featuredProducts.slice(0, 8).map((product) => (
                <CollapsedProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Brands marquee ───────────────────────────────────────────────── */}
      {brands.length > 0 && (
        <section style={{ padding: '32px 0', overflow: 'hidden' }}>
          <style>{`
            @keyframes marquee-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .brands-track {
              display: flex;
              align-items: center;
              gap: 24px;
              width: max-content;
              animation: marquee-scroll 28s linear infinite;
            }
            .brands-track:hover {
              animation-play-state: paused;
            }
          `}</style>
          <div style={{ overflow: 'hidden' }}>
            <div className="brands-track">
              {/* Render the list 4× so there's always content filling the viewport */}
              {[0, 1, 2, 3].flatMap(pass =>
                brands.map((brand, i) => (
                  <button
                    key={`${pass}-${brand.id}-${i}`}
                    onClick={() => navigate(`/products?brand=${brand.id}`)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'box-shadow 150ms ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(168,85,247,0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {brand.logo_url ? (
                      <img
                        src={brand.logo_url}
                        alt={brand.name}
                        style={{ height: '32px', width: 'auto', maxWidth: '120px', objectFit: 'contain', display: 'block' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>
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