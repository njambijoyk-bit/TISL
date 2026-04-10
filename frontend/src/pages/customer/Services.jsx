import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, LayoutGrid, List } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import useServiceStore from '../../store/serviceStore';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';
import ServiceGrid from '../../components/services/ServiceGrid';
import ServiceFilters from '../../components/services/ServiceFilters';
import CollapsedServiceCard from '../../components/services/CollapsedServiceCard';
import Button from '../../components/common/Button';
import useLayoutStore from '../../store/layoutStore';

// ── Collapsed skeleton ────────────────────────────────────────────────────────
const CollapsedServiceSkeleton = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 14, padding: '18px 18px 18px 20px', background: 'white',
    borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  }}>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 10, width: '40%', background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 14, width: '70%', background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: '90%', background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: '60%', background: '#e5e7eb', borderRadius: 6 }} />
    </div>
    <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: '50%', background: '#e5e7eb' }} />
  </div>
);

// ── Toggle styles ─────────────────────────────────────────────────────────────
const toggleStyles = {
  wrap:     { display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 },
  btn:      { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: 'all 150ms ease' },
  active:   { background: '#ffffff', color: '#a855f7', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' },
  inactive: { background: 'transparent', color: '#9ca3af' },
};

const Services = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { servicesView: viewMode, setServicesView: setViewMode } = useLayoutStore();

  const {
    services, categories, mainCategories, types,
    pagination, loading, error, filters,
    fetchServices, fetchFeaturedServices, fetchCategories,
    fetchMainCategories, fetchTypes,
    setFilters, resetFilters, setPage,
  } = useServiceStore();

  const urlCategoryId = useMemo(() => {
    const raw = searchParams.get('category');
    const parsed = raw ? Number(raw) : null;
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

  const selectedCategory = useMemo(() =>
    mainCategories?.find((c) => c.id === filters?.category_id) || null,
    [mainCategories, filters?.category_id]);

  useEffect(() => {
    fetchFeaturedServices();
    fetchMainCategories();
    fetchCategories({ all: true });
    fetchTypes();
  }, []);

  useEffect(() => {
    if (urlCategoryId && filters.category_id !== urlCategoryId) {
      setFilters({ category_id: urlCategoryId, page: 1 }); return;
    }
    if (!urlCategoryId && filters.category_id) setFilters({ category_id: null, page: 1 });
  }, [urlCategoryId]);

  useEffect(() => {
    fetchServices();
  }, [
    filters.search, filters.category_id, filters.type,
    filters.pricing_model, filters.min_price, filters.max_price,
    filters.remote_only, filters.requires_site_visit, filters.featured,
    filters.sort_by, filters.sort_order, filters.per_page, filters.page,
  ]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCategoryClick = (categoryId) => {
    setFilters({ category_id: categoryId, page: 1 });
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('category', String(categoryId)); return next; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearSelectedCategory = () => {
    setFilters({ category_id: null, page: 1 });
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('category'); return next; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (patch) => {
    const nextCategoryId = patch?.category_id !== undefined ? patch.category_id : filters.category_id;
    setFilters({ ...patch, page: 1 });
    if (patch?.category_id !== undefined) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (nextCategoryId) next.set('category', String(nextCategoryId));
        else next.delete('category');
        return next;
      });
    }
  };

  const handleSearch = (term) => {
    setFilters({ search: term, page: 1 });
  };

  const handleReset = () => {
    resetFilters();
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('category'); return next; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageChange = (page) => {
    setPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCount = pagination?.total || 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Helmet>
        <title>Our Services — TISL Store</title>
        <meta name="description" content="Explore professional services offered by TISL Store in Nairobi. Request a custom quote for any service." />
        <meta property="og:title" content="Our Services — TISL Store" />
        <meta property="og:type" content="website" />
      </Helmet>
      <Header />

      <div className="w-full px-4 py-6">
        <Breadcrumb items={[{ label: 'Services', href: '/services' }]} />

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Services</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5" style={{ fontSize: '0.85rem' }}>
              {loading
                ? <span className="flex items-center gap-1.5"><Loader className="w-3.5 h-3.5 animate-spin" /> Loading…</span>
                : `${totalCount.toLocaleString()} service${totalCount !== 1 ? 's' : ''} found`
              }
            </p>
          </div>

          {/* View toggle */}
          <div style={toggleStyles.wrap}>
            <button type="button" onClick={() => setViewMode('large')}
              style={{ ...toggleStyles.btn, ...(viewMode === 'large' ? toggleStyles.active : toggleStyles.inactive) }}>
              <LayoutGrid size={15} /> Large
            </button>
            <button type="button" onClick={() => setViewMode('collapsed')}
              style={{ ...toggleStyles.btn, ...(viewMode === 'collapsed' ? toggleStyles.active : toggleStyles.inactive) }}>
              <List size={15} /> Compact
            </button>
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        <ServiceFilters
          categories={categories || []}
          types={types || []}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onReset={handleReset}
        />

        {/* ── Category cards ───────────────────────────────────────────────── */}
        {mainCategories?.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            {/* Section label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                Browse by Category
              </span>
              {filters.category_id && (
                <button type="button" onClick={clearSelectedCategory}
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, textDecoration: 'underline' }}>
                  Clear selection
                </button>
              )}
            </div>

            {/* Cards row */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {mainCategories.map((cat, idx) => {
                const active = filters.category_id === cat.id;
                // Cycle through accent colors for visual variety
                const accents = [
                  { text: '#a855f7', bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.35)', glow: 'rgba(168,85,247,0.20)', dot: '#a855f7' },
                  { text: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.35)',  glow: 'rgba(59,130,246,0.20)',  dot: '#3b82f6' },
                  { text: '#10b981', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.35)',  glow: 'rgba(16,185,129,0.20)',  dot: '#10b981' },
                  { text: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)',  glow: 'rgba(245,158,11,0.20)',  dot: '#f59e0b' },
                  { text: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.35)',   glow: 'rgba(239,68,68,0.20)',   dot: '#ef4444' },
                  { text: '#ec4899', bg: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.35)',  glow: 'rgba(236,72,153,0.20)',  dot: '#ec4899' },
                  { text: '#06b6d4', bg: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.35)',   glow: 'rgba(6,182,212,0.20)',   dot: '#06b6d4' },
                  { text: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.35)',  glow: 'rgba(139,92,246,0.20)',  dot: '#8b5cf6' },
                ];
                const accent = accents[idx % accents.length];

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => active ? clearSelectedCategory() : handleCategoryClick(cat.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '9px 16px', borderRadius: 12, cursor: 'pointer',
                      border: `1px solid ${active ? accent.border : '#e5e7eb'}`,
                      background: active ? accent.bg : 'white',
                      transition: 'all 180ms ease',
                      boxShadow: active
                        ? `0 0 0 3px ${accent.glow}, 0 0 16px ${accent.glow}`
                        : '0 1px 3px rgba(0,0,0,0.06)',
                      transform: active ? 'translateY(-1px)' : 'none',
                      minWidth: 0,
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = accent.border;
                        e.currentTarget.style.background = accent.bg;
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = `0 4px 12px ${accent.glow}`;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
                      }
                    }}
                  >
                    {/* Colored dot indicator */}
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: active ? accent.dot : '#d1d5db',
                      boxShadow: active ? `0 0 6px ${accent.dot}` : 'none',
                      transition: 'all 180ms ease',
                    }} />

                    {/* Name */}
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
                      color: active ? accent.text : '#374151',
                      transition: 'color 180ms ease',
                    }}>
                      {cat.name}
                    </span>

                    {/* Service count badge if available */}
                    {cat.services_count != null && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 800,
                        padding: '1px 6px', borderRadius: 9999,
                        background: active ? accent.bg : '#f3f4f6',
                        border: `1px solid ${active ? accent.border : 'transparent'}`,
                        color: active ? accent.text : '#9ca3af',
                        transition: 'all 180ms ease',
                        letterSpacing: '0.02em',
                      }}>
                        {cat.services_count}
                      </span>
                    )}

                    {/* Active close indicator */}
                    {active && (
                      <span style={{ fontSize: '9px', color: accent.text, opacity: 0.6, marginLeft: -2 }}>✕</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* ── Services display ─────────────────────────────────────────────── */}
        {viewMode === 'large' ? (
          <ServiceGrid
            services={services || []} loading={loading}
            emptyMessage="No services found"
            emptyDescription="Try adjusting your search or filters"
            onServiceClick={(s) => navigate(`/services/${s.id}`)}
            columns={4}
          />
        ) : loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => <CollapsedServiceSkeleton key={i} />)}
          </div>
        ) : services?.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {services.map((service) => <CollapsedServiceCard key={service.id} service={service} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <List size={40} className="mb-3 opacity-25" />
            <p className="text-sm font-medium">No services found</p>
            <p className="text-xs mt-1 opacity-70">Try adjusting your search or filters</p>
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {!loading && pagination && pagination.last_page > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button onClick={() => handlePageChange(pagination.current_page - 1)} disabled={pagination.current_page === 1} className="pagination-btn px-4 py-2 border rounded transition-colors">Previous</button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                let pageNum;
                if (pagination.last_page <= 5) pageNum = i + 1;
                else if (pagination.current_page <= 3) pageNum = i + 1;
                else if (pagination.current_page >= pagination.last_page - 2) pageNum = pagination.last_page - 4 + i;
                else pageNum = pagination.current_page - 2 + i;
                return (
                  <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                    className={`pagination-btn px-4 py-2 border rounded transition-colors ${pagination.current_page === pageNum ? 'active' : ''}`}>
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button onClick={() => handlePageChange(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page} className="pagination-btn px-4 py-2 border rounded transition-colors">Next</button>
          </div>
        )}

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <div className="mt-12 rounded-2xl p-8 text-center" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(124,58,237,0.05))', border: '1px solid rgba(168,85,247,0.15)' }}>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Can't find what you're looking for?</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Request a custom quote and we'll help you find the perfect solution</p>
          <Button variant="primary" size="lg" onClick={() => navigate('/request-quote')}>
            Request Custom Quote
          </Button>
        </div>
      </div>

      <Footer />

      <style>{`
        .pagination-btn { border-color: #d1d5db; color: #374151; background-color: white; }
        .pagination-btn:hover:not(:disabled) { background-color: #f3f4f6; border-color: #a855f7; color: #a855f7; }
        .pagination-btn.active { background-color: #a855f7; color: white; border-color: #a855f7; }
        .pagination-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .dark .pagination-btn { border-color: #4b5563; color: #d1d5db; background-color: #1f2937; }
        .dark .pagination-btn:hover:not(:disabled) { background-color: #374151; border-color: #d8b4fe; color: #d8b4fe; }
        .dark .pagination-btn.active { background-color: #7e22ce; color: white; border-color: #7e22ce; }
      `}</style>
    </div>
  );
};

export default Services;