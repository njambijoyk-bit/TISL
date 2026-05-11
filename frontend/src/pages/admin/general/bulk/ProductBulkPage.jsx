import { useState, useEffect, useCallback, useRef } from 'react';
import { productsAPI } from '../../../../api';
import useProductStore from '../../../../store/productStore';
import ProductBulkTable from './components/ProductBulkTable';
import BulkActionsBar from './components/BulkActionsBar';
import SearchableDropdown from '../../../../components/common/SearchableDropdown';
import LoadingSpinner from '../../../../components/layout/LoadingSpinner';
import GeneralLayout from '../../../../components/layout/GeneralLayout';
import toast from 'react-hot-toast';
const PER_PAGE = 50;

export default function ProductBulkPage() {
  const { categories, brands, fetchCategories, fetchBrands } = useProductStore();

  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });

  // Filters
  const [search, setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [brandFilter, setBrandFilter]       = useState(null);
  const [stockFilter, setStockFilter]       = useState('');  // '' | 'in_stock' | 'out_of_stock'

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const searchTimer = useRef(null);

  // Load dropdowns once
  useEffect(() => {
    if (!categories.length) fetchCategories();
    if (!brands.length)     fetchBrands();
  }, []);

  // Same unwrap logic as your productStore — handles all Laravel response shapes
  const unwrap = (res) => {
    // Shape 1: plain array
    if (Array.isArray(res))
      return { items: res, meta: null };
    // Shape 2: { data: [...], meta/pagination: {...} }
    if (res?.data && Array.isArray(res.data))
      return { items: res.data, meta: res.meta ?? res.pagination ?? null };
    // Shape 3: { data: { data: [...], current_page, ... } }  ← Laravel default paginator
    if (res?.data?.data && Array.isArray(res.data.data))
      return { items: res.data.data, meta: res.data };
    // Shape 4: { success, data: { data: [...] } }
    if (res?.data?.data?.data && Array.isArray(res.data.data.data))
      return { items: res.data.data.data, meta: res.data.data };
    return { items: [], meta: null };
  };

  // Fetch products
  const fetchProducts = useCallback(async (page = 1, overrides = {}) => {
    setLoading(true);
    try {
      const params = {
        page,
        per_page: PER_PAGE,
        search:      overrides.search      !== undefined ? overrides.search      : search,
        category_id: overrides.category_id !== undefined ? overrides.category_id : (categoryFilter || ''),
        brand_id:    overrides.brand_id    !== undefined ? overrides.brand_id    : (brandFilter    || ''),
        ...(overrides.in_stock !== undefined
          ? { in_stock: overrides.in_stock }
          : stockFilter === 'in_stock'
            ? { in_stock: 1 }
            : stockFilter === 'out_of_stock'
              ? { in_stock: 0 }
              : {}),
      };

      // ✅ Remove empty params — without this backend gets category_id='' → 0 results
      Object.keys(params).forEach(k => {
        if (params[k] === '' || params[k] === null || params[k] === undefined) delete params[k];
      });

      const res = await productsAPI.getAdminProducts(params);
      const { items, meta } = unwrap(res);

      setProducts(items);

      // ✅ Laravel default paginator: meta fields live at root of res, not res.meta
      const paginationSource = meta ?? res;
      if (paginationSource?.current_page) {
        setPagination({
          current_page: paginationSource.current_page ?? 1,
          last_page:    paginationSource.last_page    ?? 1,
          total:        paginationSource.total        ?? items.length,
        });
      }
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[BulkProducts] fetch error:', err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, brandFilter, stockFilter]);

  // Initial load
  useEffect(() => { fetchProducts(1); }, []);

  // Debounced search
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchProducts(1, { search: val });
    }, 350);
  };

  const handleFilter = (field, val) => {
    if (field === 'category_id') setCategoryFilter(val);
    if (field === 'brand_id')    setBrandFilter(val);
    if (field === 'stock')       setStockFilter(val);
    fetchProducts(1, { [field === 'stock' ? 'in_stock' : field]: val || '' });
  };

  const handlePage = (p) => fetchProducts(p);

  // Selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (products.every(p => selectedIds.has(p.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  // Bulk actions
  const handleBulkPrice = async (price) => {
    const ids = [...selectedIds];
    
    // 👈 Show loading toast BEFORE starting (for large batches)
    if (ids.length > 10) {
        toast.loading(`Updating ${ids.length} products…`, { id: 'bulk-update' });
    }
    
    setBulkActionLoading(true);
    try {
        await Promise.all(ids.map(id => productsAPI.updateProduct(id, { price })));
        setProducts(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, price } : p));
        toast.success(`Price updated for ${ids.length} products`);
        setSelectedIds(new Set());
    } catch {
        toast.error('Bulk price update failed');
    } finally {
        setBulkActionLoading(false);
        toast.dismiss('bulk-update'); // 👈 Clean up loading toast
    }
  };

  const handleBulkNegotiable = async () => {
    const ids = [...selectedIds];

    // 👈 Show loading toast BEFORE starting (for large batches)
    if (ids.length > 10) {
        toast.loading(`Marking ${ids.length} products as negotiable…`, { id: 'bulk-update' });
    }
    setBulkActionLoading(true);
    try {
      await Promise.all(ids.map(id => productsAPI.updateProduct(id, { price_is_negotiable: 1 })));
      setProducts(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, price_is_negotiable: true } : p));
      toast.success(`${ids.length} products marked as negotiable`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to mark as negotiable');
    } finally {
        setBulkActionLoading(false); // 👈 Stop spinner
        toast.dismiss('bulk-update');
    }
  };

  const bulkUpdateFlags = async (ids, flags) => {
    if (!ids?.length) return toast.error('No products selected');
    
    // 👈 Show loading toast for large batches
    if (ids.length > 10) {
      toast.loading(`Updating ${ids.length} products…`, { id: 'bulk-update' });
    }
    
    setBulkActionLoading(true);
    try {
      await productsAPI.bulkUpdateFlags(ids, flags);
      
      // Update local state to reflect changes immediately
      setProducts(prev => 
        prev.map(p => 
          selectedIds.has(p.id) ? { ...p, ...flags } : p
        )
      );
      
      // Show success message with readable flag names
      const flagLabels = Object.entries(flags)
        .map(([key, val]) => `${key.replace('is_', '')} ${val ? 'ON' : 'OFF'}`)
        .join(', ');
      
      toast.success(`${ids.length} products: ${flagLabels}`);
      setSelectedIds(new Set());
      
    } catch (err) {
      console.error('Bulk flag update failed:', err);
      toast.error(err.response?.data?.message || 'Failed to update product flags');
    } finally {
      setBulkActionLoading(false);
      toast.dismiss('bulk-update');
    }
  };

  const handleProductUpdated = (id, updated) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
  };

  return (
    <GeneralLayout>
    <div style={{ padding: '24px 28px', maxWidth: '100%' }}>

      {/* ── Page Header ──────────────────────────────────── */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #7c3aed)', margin: 0 }}>
            Bulk Product Manager
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', marginTop: 4 }}>
            {loading ? 'Loading…' : `${pagination.total.toLocaleString()} products — edit prices, categories, brands and images inline`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12, color: 'var(--text-muted)',
            background: 'var(--bg-secondary, #f3f4f6)',
            padding: '4px 10px', borderRadius: 99,
          }}>
            Page {pagination.current_page} / {pagination.last_page}
          </span>
        </div>
      </div>

      {/* ── Filters Bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
        marginBottom: 16, alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted, #9ca3af)', pointerEvents: 'none',
            display: 'flex', alignItems: 'center', // Ensures perfect vertical centering
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        </span>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search name or SKU…"
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              border: '1px solid var(--accent, #7c3aed)',
              boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
              borderRadius: 7,
              fontSize: 13,
              background: 'var(--bg-primary, #fff)',
              color: 'var(--text-primary, #111)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category filter */}
        <div style={{ flex: '0 0 180px' }}>
          <SearchableDropdown
            options={categories}
            value={categoryFilter}
            onChange={val => handleFilter('category_id', val)}
            placeholder="All Categories"
          />
        </div>

        {/* Brand filter */}
        <div style={{ flex: '0 0 160px' }}>
          <SearchableDropdown
            options={brands}
            value={brandFilter}
            onChange={val => handleFilter('brand_id', val)}
            placeholder="All Brands"
          />
        </div>

        {/* Stock filter */}
        <select
          value={stockFilter}
          onChange={e => handleFilter('stock', e.target.value)}
          style={{
            padding: '7px 10px',
            border: '1px solid var(--accent, #7c3aed)',
            boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
            borderRadius: 7,
            fontSize: 13,
            background: 'var(--bg-primary, #fff)',
            color: 'var(--text-primary, #111)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">All Stock</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>

        {/* Clear filters */}
        {(search || categoryFilter || brandFilter || stockFilter) && (
          <button
            onClick={() => {
              setSearch(''); setCategoryFilter(null);
              setBrandFilter(null); setStockFilter('');
              fetchProducts(1, { search: '', category_id: '', brand_id: '', in_stock: '' });
            }}
            style={{
              padding: '7px 12px',
              background: 'none',
              border: '1px solid var(--accent, #7c3aed)',
              boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
              borderRadius: 7,
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--text-muted, #6b7280)',
            }}
          >✕ Clear</button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--border-color, #e5e7eb)',
            borderTopColor: 'var(--accent, #7c3aed)',
            animation: 'spin 600ms linear infinite',
            margin: '0 auto',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>Loading products…</p>
        </div>
      ) : (
        <ProductBulkTable
          products={products}
          categories={categories}
          brands={brands}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onProductUpdated={handleProductUpdated}
        />
      )}

      {/* ── Pagination ───────────────────────────────────── */}
      {pagination.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
          <PageBtn label="← Prev" disabled={pagination.current_page === 1}
            onClick={() => handlePage(pagination.current_page - 1)} />

          {getPaginationRange(pagination.current_page, pagination.last_page).map((p, i) =>
            p === '...' ? (
              <span key={`dot-${i}`} style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>…</span>
            ) : (
              <PageBtn key={p} label={p} active={p === pagination.current_page} onClick={() => handlePage(p)} />
            )
          )}

          <PageBtn label="Next →" disabled={pagination.current_page === pagination.last_page}
            onClick={() => handlePage(pagination.current_page + 1)} />
        </div>
      )}

      {/* ── Bulk Actions Bar ─────────────────────────────── */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onSetPrice={handleBulkPrice}
        onMarkNegotiable={handleBulkNegotiable}
        onSetFlags={(flags) => bulkUpdateFlags([...selectedIds], flags)} // ✅ Spread Set to array
        onClear={() => setSelectedIds(new Set())}
        disabled={bulkActionLoading}
      />

    </div>
          {/* ── Bulk Actions Full-Page Overlay ───────────────── */}
      {bulkActionLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            background: 'var(--bg-primary, #fff)',
            padding: '24px 32px',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          }}>
            <LoadingSpinner />
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary, #111)',
            }}>
              Updating products…
            </span>
            <span style={{
              fontSize: 12,
              color: 'var(--text-muted, #6b7280)',
            }}>
              Please wait
            </span>
          </div>
        </div>
      )}
    </GeneralLayout>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function PageBtn({ label, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        border: '1px solid var(--accent, #7c3aed)',
        boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
        borderRadius: 6,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? 'var(--accent, #7c3aed)' : 'var(--bg-primary, #fff)',
        color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontWeight: active ? 700 : 400,
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );
}

function getPaginationRange(current, last) {
  const range = [];
  if (last <= 7) {
    for (let i = 1; i <= last; i++) range.push(i);
    return range;
  }
  range.push(1);
  if (current > 3) range.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(last - 1, current + 1); i++) range.push(i);
  if (current < last - 2) range.push('...');
  range.push(last);
  return range;
}