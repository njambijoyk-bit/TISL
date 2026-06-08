import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Image } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import Pagination from '../../components/common/Pagination';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';
import SmartSearchBox from '../../components/common/SmartSearchBox';
import ProductFilters from '../../components/products/ProductFilters';
import ProductGrid from '../../components/products/ProductGrid';
import CollapsedProductCard from '../../components/products/CollapsedProductCard';
import ProductPolaroidCard from '../../components/products/Productpolaroidcard';
import { searchEvents } from '../../services/searchEventService';
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

const PolaroidSkeleton = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
    <div style={{ width: 210, background: '#fffef9', padding: '10px 10px 46px', boxShadow: '3px 5px 0 rgba(0,0,0,0.10)', borderRadius: 2 }}>
      <div style={{ width: '100%', aspectRatio: '1/1', background: '#e5e7eb', borderRadius: 2 }} />
    </div>
    <div style={{ height: 14, width: 100, background: '#e5e7eb', borderRadius: 6 }} />
    <div style={{ height: 10, width: 70, background: '#e5e7eb', borderRadius: 6 }} />
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

  const [showCategories, setShowCategories] = useState(false);
  const [showBrands, setShowBrands]         = useState(false);

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

    const res = await productsAPI.getProducts({ ...filters, page: pagination.current_page, per_page: 20 });

    // same unwrap logic as ProductBulkPage
    const unwrap = (res) => {
      if (Array.isArray(res))                              return { items: res,           meta: null    };
      if (res?.data && Array.isArray(res.data))            return { items: res.data,       meta: res.meta ?? res.pagination ?? null };
      if (res?.data?.data && Array.isArray(res.data.data)) return { items: res.data.data,  meta: res.data };
      return { items: [], meta: null };
    };

    const { items, meta } = unwrap(res);
    const paginationSource = meta ?? res;

    const paginationData = paginationSource?.current_page ? {
      current_page: paginationSource.current_page ?? 1,
      last_page:    paginationSource.last_page    ?? 1,
      total:        paginationSource.total        ?? items.length,
      per_page:     paginationSource.per_page     ?? 20,
    } : null;

    setProducts(items, paginationData);
    if (filters.search?.trim()) {
      searchEvents.searchResult(filters.search, 'product', paginationSource?.total ?? 0);
    }
  } catch (err) {
    setError(err.message || 'Failed to load products');
  } finally {
    setLoading(false);
  }
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
  
  const handleBrandClick = (brand) => {
    const same = String(filters.brand_id) === String(brand.id);
    if (!same) searchEvents.filter('brand', brand.name, 'product', totalCount);
    handleFilterChange('brand_id', same ? '' : brand.id);
  };

  const handleCategoryClick = (cat) => {
    const same = String(filters.category_id) === String(cat.id);
    if (!same) searchEvents.filter('category', cat.name, 'product', totalCount);
    handleFilterChange('category_id', same ? '' : cat.id);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
     
      <Header />
      <div className="w-full px-4 py-6">
        <Breadcrumb items={[{ label: 'Products', href: '/products' }]} />

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Products</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5" style={{ fontSize: '0.85rem' }}>
              {loading ? 'Loading…' : `${totalCount.toLocaleString()} product${totalCount !== 1 ? 's' : ''} found`}
            </p>
          </div>
          <div style={toggleStyles.wrap}>
            <button type="button" onClick={() => setViewMode('large')} style={{ ...toggleStyles.btn, ...(viewMode === 'large' ? toggleStyles.active : toggleStyles.inactive) }}><LayoutGrid size={15} /> Large</button>
            <button type="button" onClick={() => setViewMode('collapsed')} style={{ ...toggleStyles.btn, ...(viewMode === 'collapsed' ? toggleStyles.active : toggleStyles.inactive) }}><List size={15} /> Compact</button>
            <button type="button" onClick={() => setViewMode('polaroid')} style={{ ...toggleStyles.btn, ...(viewMode === 'polaroid' ? toggleStyles.active : toggleStyles.inactive) }}><Image size={15} /> Polaroid</button>
          </div>
        </div>

        <SmartSearchBox
          context="product"
          mode="inline"
          value={filters.search ?? ''}
          onSearch={q => handleFilterChange('search', q)}
        />

        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        <ProductFilters filters={filters} onFilterChange={handleFilterChange} onReset={handleResetFilters} />

        {/* ── Categories ───────────────────────────────────────────────────── */}
        {categories.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setShowCategories(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: showCategories ? 10 : 0 }}
            >
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                Browse by Category
              </span>
              <span style={{ fontSize: '0.65rem', color: '#c084fc', transition: 'transform 150ms', display: 'inline-block', transform: showCategories ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              {activeCategory && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 99, marginLeft: 4 }}>
                  1 active
                </span>
              )}
            </button>

            {showCategories && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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
              </>
            )}
          </div>
        )}

        {brands.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => setShowBrands(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: showBrands ? 10 : 0 }}
            >
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                Browse by Brand
              </span>
              <span style={{ fontSize: '0.65rem', color: '#c084fc', transition: 'transform 150ms', display: 'inline-block', transform: showBrands ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              {activeBrand && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 99, marginLeft: 4 }}>
                  1 active
                </span>
              )}
            </button>

            {showBrands && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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
              </>
            )}
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
        ) : viewMode === 'polaroid' ? (
          loading ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'center', padding: '32px 0' }}>
              {Array.from({ length: 8 }).map((_, i) => <PolaroidSkeleton key={i} />)}
            </div>
          ) : products?.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'center', padding: '32px 16px' }}>
              {products.map((p, i) => <ProductPolaroidCard key={p.id} product={p} index={i} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <Image size={40} className="mb-3 opacity-25" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-xs mt-1 opacity-70">Try adjusting or clearing your filters</p>
            </div>
          )
        ) : loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {Array.from({ length: 12 }).map((_, i) => <CollapsedProductSkeleton key={i} />)}
          </div>
        ) : products?.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {products.map((p) => <CollapsedProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <List size={40} className="mb-3 opacity-25" />
            <p className="text-sm font-medium">No products found</p>
            <p className="text-xs mt-1 opacity-70">Try adjusting or clearing your filters</p>
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {!loading && !error && (
          <Pagination pagination={pagination} onPageChange={handlePageChange} />
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
      `}</style>
    </div>
  );
}