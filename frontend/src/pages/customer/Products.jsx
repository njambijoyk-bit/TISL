import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';
import ProductFilters from '../../components/products/ProductFilters';
import ProductGrid from '../../components/products/ProductGrid';
import CollapsedProductCard from '../../components/products/CollapsedProductCard';
import { productsAPI, categoriesAPI, brandsAPI } from '../../api';
import { useProductStore } from '../../store';
import useLayoutStore from '../../store/layoutStore';

// ── Accent palette ────────────────────────────────────────────────────────────
const ACCENTS = [
  { text: '#a855f7', bg: 'rgba(168,85,247,0.10)',  border: 'rgba(168,85,247,0.35)', glow: 'rgba(168,85,247,0.20)', dot: '#a855f7' },
  { text: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.35)', glow: 'rgba(59,130,246,0.20)', dot: '#3b82f6' },
  { text: '#10b981', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.35)', glow: 'rgba(16,185,129,0.20)', dot: '#10b981' },
  { text: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)', glow: 'rgba(245,158,11,0.20)', dot: '#f59e0b' },
  { text: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.35)',  glow: 'rgba(239,68,68,0.20)',  dot: '#ef4444' },
  { text: '#ec4899', bg: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.35)', glow: 'rgba(236,72,153,0.20)', dot: '#ec4899' },
  { text: '#06b6d4', bg: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.35)',  glow: 'rgba(6,182,212,0.20)',  dot: '#06b6d4' },
  { text: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.35)', glow: 'rgba(139,92,246,0.20)', dot: '#8b5cf6' },
];

// ── Reusable browse card ──────────────────────────────────────────────────────
function BrowseCard({ label, count, logo, active, accent, onClick }) {
  const [hovered, setHovered] = useState(false);
  const lifted = active || hovered;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '9px 16px', borderRadius: 12, cursor: 'pointer',
        border: `1px solid ${lifted ? accent.border : '#e5e7eb'}`,
        background: lifted ? accent.bg : 'white',
        transition: 'all 180ms ease',
        boxShadow: active
          ? `0 0 0 3px ${accent.glow}, 0 0 16px ${accent.glow}`
          : lifted ? `0 4px 12px ${accent.glow}` : '0 1px 3px rgba(0,0,0,0.06)',
        transform: lifted ? 'translateY(-1px)' : 'none',
      }}
    >
      {logo ? (
        <img src={logo} alt={label}
          style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }}
          onError={e => { e.target.style.display = 'none'; }}
        />
      ) : (
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: active ? accent.dot : '#d1d5db',
          boxShadow: active ? `0 0 6px ${accent.dot}` : 'none',
          transition: 'all 180ms ease',
        }} />
      )}
      <span style={{
        fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
        color: lifted ? accent.text : '#374151',
        transition: 'color 180ms ease',
      }}>
        {label}
      </span>
      {count != null && (
        <span style={{
          fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: 9999,
          background: active ? accent.bg : '#f3f4f6',
          border: `1px solid ${active ? accent.border : 'transparent'}`,
          color: active ? accent.text : '#9ca3af',
          transition: 'all 180ms ease', letterSpacing: '0.02em',
        }}>
          {count}
        </span>
      )}
      {active && <span style={{ fontSize: '9px', color: accent.text, opacity: 0.6, marginLeft: -2 }}>✕</span>}
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const CollapsedProductSkeleton = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
    <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, background: '#e5e7eb' }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 12, width: '65%', background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: '85%', background: '#e5e7eb', borderRadius: 6 }} />
    </div>
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ height: 12, width: 56, background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 24, width: 52, background: '#e5e7eb', borderRadius: 20 }} />
    </div>
  </div>
);

const toggleStyles = {
  wrap:     { display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 },
  btn:      { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: 'all 150ms ease' },
  active:   { background: '#ffffff', color: '#a855f7', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' },
  inactive: { background: 'transparent', color: '#9ca3af' },
};

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { productsView: viewMode, setProductsView: setViewMode } = useLayoutStore();
  const { products, filters, pagination, loading, setProducts, setFilter, resetFilters, setPage, setLoading } = useProductStore();

  const [error, setError]         = useState(null);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands]       = useState([]);

  // ── On mount: sync URL params + fetch categories/brands ──────────────────
  useEffect(() => {
    const params = Object.fromEntries(searchParams.entries());
    if (params.category) setFilter('category_id', params.category);
    if (params.brand)    setFilter('brand_id',    params.brand);
    if (params.search)   setFilter('search',      params.search);
    if (params.featured) setFilter('featured',    params.featured === 'true');

    // Fetch browse data
    Promise.all([
      categoriesAPI.getCategories().catch(() => []),
      brandsAPI.getBrands().catch(() => []),
    ]).then(([catRes, brandRes]) => {
      setCategories(catRes?.data || catRes || []);
      setBrands(brandRes?.data || brandRes || []);
    });
  }, []);

  useEffect(() => { fetchProducts(); }, [filters, pagination.current_page]);

  const fetchProducts = async () => {
    try {
      setLoading(true); setError(null);
      const response = await productsAPI.getProducts({ ...filters, page: pagination.current_page, per_page: 20 });
      let productsData = [], paginationData = null;
      if (response.data) {
        if (Array.isArray(response.data)) { productsData = response.data; paginationData = response.pagination || response.meta; }
        else if (response.data.data && Array.isArray(response.data.data)) { productsData = response.data.data; paginationData = response.data.pagination || response.data.meta || response.data; }
        else if (typeof response.data === 'object') { productsData = [response.data]; paginationData = response.pagination || response.meta; }
      } else if (Array.isArray(response)) { productsData = response; }
      setProducts(productsData, paginationData);
    } catch (err) { setError(err.message || 'Failed to load products'); }
    finally { setLoading(false); }
  };

  const handleFilterChange = (key, value) => {
    setFilter(key, value); setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    setSearchParams(params);
  };

  const handleResetFilters = () => { resetFilters(); setSearchParams({}); };
  const handlePageChange   = (page) => { setPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const totalCount = pagination?.total ?? products?.length ?? 0;

  const activeCategory = categories.find(c => String(c.id) === String(filters.category_id));
  const activeBrand    = brands.find(b => String(b.id) === String(filters.brand_id));
  
  const handleCategoryClick = (cat) => {
    const same = String(filters.category_id) === String(cat.id);
    handleFilterChange('category_id', same ? '' : cat.id);
  };

  const handleBrandClick = (brand) => {
    const same = String(filters.brand_id) === String(brand.id);
    handleFilterChange('brand_id', same ? '' : brand.id);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
     
      <Header />
      <div className="w-full px-3 sm:px-4 py-4 sm:py-6">
        <Breadcrumb items={[{ label: 'Products', href: '/products' }]} />

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Products</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5" style={{ fontSize: '0.85rem' }}>
              {loading ? 'Loading…' : `${totalCount.toLocaleString()} product${totalCount !== 1 ? 's' : ''} found`}
            </p>
          </div>
          <div style={toggleStyles.wrap} className="self-start sm:self-auto">
            <button type="button" onClick={() => setViewMode('large')} style={{ ...toggleStyles.btn, ...(viewMode === 'large' ? toggleStyles.active : toggleStyles.inactive) }}><LayoutGrid size={15} /> <span className="hidden xs:inline">Large</span></button>
            <button type="button" onClick={() => setViewMode('collapsed')} style={{ ...toggleStyles.btn, ...(viewMode === 'collapsed' ? toggleStyles.active : toggleStyles.inactive) }}><List size={15} /> <span className="hidden xs:inline">Compact</span></button>
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        <ProductFilters filters={filters} onFilterChange={handleFilterChange} onReset={handleResetFilters} />

        {/* ── Categories ───────────────────────────────────────────────────── */}
        {categories.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                Browse by Category
              </span>
              {activeCategory && (
                <button type="button" onClick={() => handleFilterChange('category_id', '')}
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, textDecoration: 'underline' }}>
                  Clear selection
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {categories.map((cat, idx) => (
                <BrowseCard
                  key={cat.id}
                  label={cat.name}
                  count={cat.products_count}
                  active={String(filters.category_id) === String(cat.id)}
                  accent={ACCENTS[idx % ACCENTS.length]}
                  onClick={() => handleCategoryClick(cat)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Products area ────────────────────────────────────────────────── */}
        {error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium mb-2">Error loading products</p>
            <p className="text-red-500 dark:text-red-300 text-sm mb-4">{error}</p>
            <button onClick={fetchProducts} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Try Again</button>
          </div>
        ) : viewMode === 'large' ? (
          <ProductGrid products={products || []} loading={loading} error={null} />
        ) : loading ? (
          <div className="products-compact-grid" style={{ display: 'grid', gap: 8 }}>
            {Array.from({ length: 12 }).map((_, i) => <CollapsedProductSkeleton key={i} />)}
          </div>
        ) : products?.length > 0 ? (
          <div className="products-compact-grid" style={{ display: 'grid', gap: 8 }}>
            {products.map((p) => <CollapsedProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <List size={40} className="mb-3 opacity-25" />
            <p className="text-sm font-medium">No products found</p>
            <p className="text-xs mt-1 opacity-70">Try adjusting or clearing your filters</p>
          </div>
        )}

        {/* ── Brands ───────────────────────────────────────────────────────── */}
        {brands.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                Browse by Brand
              </span>
              {activeBrand && (
                <button type="button" onClick={() => handleFilterChange('brand_id', '')}
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, textDecoration: 'underline' }}>
                  Clear selection
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {brands.map((brand, idx) => (
                <BrowseCard
                  key={brand.id}
                  label={brand.name}
                  count={brand.products_count}
                  logo={brand.logo}
                  active={String(filters.brand_id) === String(brand.id)}
                  accent={ACCENTS[(idx + 3) % ACCENTS.length]}
                  onClick={() => handleBrandClick(brand)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {!loading && !error && pagination && pagination.last_page > 1 && (
          <div className="mt-8 flex justify-center">
            <div className="flex items-center space-x-2">
              <button onClick={() => handlePageChange(pagination.current_page - 1)} disabled={pagination.current_page === 1} className="pagination-btn px-4 py-2 border rounded transition-colors">Previous</button>
              {[...Array(pagination.last_page)].map((_, i) => {
                const page = i + 1;
                if (page === 1 || page === pagination.last_page || (page >= pagination.current_page - 2 && page <= pagination.current_page + 2)) {
                  return <button key={page} onClick={() => handlePageChange(page)} className={`pagination-btn px-4 py-2 border rounded transition-colors ${page === pagination.current_page ? 'active' : ''}`}>{page}</button>;
                } else if (page === pagination.current_page - 3 || page === pagination.current_page + 3) {
                  return <span key={page} className="text-gray-500">…</span>;
                }
                return null;
              })}
              <button onClick={() => handlePageChange(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page} className="pagination-btn px-4 py-2 border rounded transition-colors">Next</button>
            </div>
          </div>
        )}
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
        
        /* Responsive product grids */
        .products-compact-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 480px) {
          .products-compact-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          }
        }
        
        /* Hide text on very small screens */
        @media (max-width: 400px) {
          .hidden-xs { display: none; }
        }
      `}</style>
    </div>
  );
}
