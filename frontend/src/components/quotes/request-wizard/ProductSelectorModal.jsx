import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Package, Check, X } from 'lucide-react';
import AdminPagination from '../../common/AdminPagination';
import useProductStore from '../../../store/productStore';
import { productsAPI } from '../../../api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'outline', icon, size = 'md', type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', boxShadow: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
  };
  const pad = size === 'sm' ? '5px 12px' : '8px 18px';
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 10, fontSize: size === 'sm' ? '0.75rem' : '0.83rem', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      transition: 'transform 0.1s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const StyledInput = ({ icon, ...props }) => (
  <div style={{ position: 'relative' }}>
    {icon && <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>{icon}</div>}
    <input {...props} style={{
      width: '100%', padding: icon ? '9px 12px 9px 36px' : '9px 12px', borderRadius: 10,
      border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
      color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
      transition: 'border-color 0.15s',
    }}
      onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
      onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
    />
  </div>
);

const StyledSelect = ({ children, ...props }) => (
  <select {...props} style={{
    flex: 1, padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
    transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; }}
  >
    {children}
  </select>
);

const fmt = (amount) => `KES ${parseFloat(amount || 0).toLocaleString()}`;

// ─── Main component ───────────────────────────────────────────────────────────
const ProductSelectorModal = ({ onClose, onSelect, selectedProducts = [] }) => {
  const { categories, fetchCategories } = useProductStore();

  const [searchTerm,       setSearchTerm]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [localSelected,    setLocalSelected]    = useState([]);
  const [previewImage,     setPreviewImage]     = useState(null);

  // FIX 1: Declare the missing state that was used but never defined
  const [localProducts,  setLocalProducts]  = useState([]);
  const [localLoading,   setLocalLoading]   = useState(false);
  const [pagination,     setPagination]     = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });

  const [page, setPage] = useState(1);
  const perPage = 20;

  // FIX 2: Accept search/category as arguments so callers always pass the
  // current values — no stale-closure bugs when page changes independently.
  const fetchModalProducts = useCallback(async (pageNum = 1, search = '', categoryId = '') => {
    setLocalLoading(true);
    try {
      const params = {
        page: pageNum,
        per_page: perPage,
        ...(search     ? { search }                    : {}),
        ...(categoryId ? { category_id: categoryId }  : {}),
      };

      const res = await productsAPI.getProducts(params);

      setLocalProducts(res.data || []);
      setPagination({
        current_page: res.current_page || 1,
        last_page:    res.last_page    || 1,
        per_page:     res.per_page     || perPage,
        total:        res.total        || 0,
      });
    } catch (err) {
      console.error('Failed to fetch modal products', err);
    } finally {
      setLocalLoading(false);
    }
  }, [perPage]);

  // FIX 3: Already-selected ids — defined BEFORE displayProducts so it's in scope
  const alreadySelectedIds = useMemo(() =>
    selectedProducts
      .filter(p => !p.is_custom && p.product_id)
      .map(p => Number(p.product_id)),
    [selectedProducts]
  );

  // FIX 4: Single displayProducts declaration, using localProducts (not store)
  const displayProducts = useMemo(() =>
    localProducts.filter(p => !alreadySelectedIds.includes(Number(p?.id))),
    [localProducts, alreadySelectedIds]
  );

  // Fetch categories once
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // FIX 5: When search/category change, reset to page 1 and fetch with fresh values
  useEffect(() => {
    setPage(1);
    fetchModalProducts(1, searchTerm, selectedCategory);
  }, [searchTerm, selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX 6: When page changes, fetch with the current search/category values passed explicitly
  useEffect(() => {
    fetchModalProducts(page, searchTerm, selectedCategory);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProduct = (product) => {
    const exists = localSelected.some(p => p.id === product.id);
    setLocalSelected(prev => exists ? prev.filter(p => p.id !== product.id) : [...prev, product]);
  };

  const isSelected = (id) => localSelected.some(p => p.id === id);

  return (
    <>
      <style>{`
        @keyframes psmFadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes psmSlideUp { from { opacity:0; transform:translateY(20px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        .psm-overlay { animation: psmFadeIn 0.2s ease both; }
        .psm-modal   { animation: psmSlideUp 0.25s ease both; }
        .psm-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
        @media(max-width:700px){ .psm-grid { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:440px){ .psm-grid { grid-template-columns:1fr; } }
        .psm-card { border-radius:12px; border:1.5px solid var(--border,#f3f4f6); overflow:hidden; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s; }
        .psm-card:hover { border-color:${purpleBd}; }
        .psm-card.sel { border-color:${purple}; box-shadow:0 0 0 2px ${purpleBd}; background:${purpleLt}; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Backdrop */}
      <div className="psm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>
        <div className="psm-modal" style={{ width: '100%', maxWidth: 860, background: 'var(--panel-bg,white)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: purpleLt }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 900, color: purple, margin: 0 }}>Select Products</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#9ca3af', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* Filters */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <StyledInput type="text" placeholder="Search by name, SKU, or brand…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon={<Search size={16} />} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <StyledSelect value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                <option value="">All Categories</option>
                {(categories || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </StyledSelect>
              {(searchTerm || selectedCategory) && (
                <Btn variant="outline" size="sm" onClick={() => { setSearchTerm(''); setSelectedCategory(''); }}>Clear</Btn>
              )}
            </div>

            {localSelected.length > 0 && (
              <div style={{ padding: '8px 12px', borderRadius: 10, background: purpleLt, border: `1.5px solid ${purpleBd}` }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: purple, margin: 0 }}>{localSelected.length} product{localSelected.length !== 1 ? 's' : ''} selected</p>
              </div>
            )}
          </div>

          {/* Product grid */}
          <div style={{ padding: '16px 24px', maxHeight: '52vh', overflowY: 'auto' }}>
            {localLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${purpleLt}`, borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : displayProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
                <Package size={48} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
                <p style={{ fontSize: '0.85rem' }}>{searchTerm || selectedCategory ? 'No products match your filters' : 'No products available'}</p>
              </div>
            ) : (
              <div className="psm-grid">
                {displayProducts.map(product => {
                  const sel = isSelected(product.id);
                  return (
                    <div key={product.id} className={`psm-card${sel ? ' sel' : ''}`} onClick={() => toggleProduct(product)}>
                      {/* Check badge */}
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 24, height: 24, borderRadius: '50%', background: sel ? purple : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                          <Check size={13} color={sel ? 'white' : '#d1d5db'} strokeWidth={3} />
                        </div>

                        {/* Image */}
                        {product.main_image_url && (
                          <div
                            onClick={e => { e.stopPropagation(); setPreviewImage(product.main_image_url); }}
                            style={{ width: '100%', height: 100, background: '#f9fafb', overflow: 'hidden', cursor: 'zoom-in' }}
                          >
                            <img src={product.main_image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <p style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0, lineHeight: 1.3 }}>{product.name}</p>
                        {product.sku && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>SKU: {product.sku}</p>}
                        {product.brand?.name && (
                          <span style={{ display: 'inline-block', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: '#f3f4f6', color: '#6b7280', width: 'fit-content' }}>{product.brand.name}</span>
                        )}
                        {product.category?.name && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{product.category.name}</p>}
                        {product.price && <p style={{ fontSize: '0.82rem', fontWeight: 800, color: purple, margin: 0 }}>{fmt(product.price)}</p>}
                        {product.stock_quantity !== undefined && (
                          <p style={{ fontSize: '0.7rem', fontWeight: 600, color: product.stock_quantity > 0 ? '#10b981' : '#ef4444', margin: 0 }}>
                            {product.stock_quantity > 0 ? `In Stock (${product.stock_quantity})` : 'Out of Stock'}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="outline" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={() => onSelect(localSelected)} disabled={localSelected.length === 0}>
                Add{localSelected.length > 0 ? ` (${localSelected.length})` : ''} Product{localSelected.length !== 1 ? 's' : ''}
              </Btn>
            </div>
          </div>

          {/* Footer — FIX 7: AdminPagination only here, removed the duplicate above */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <AdminPagination
              pagination={pagination}
              onPageChange={(newPage) => setPage(newPage)}
            />
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>{pagination.total} product{pagination.total !== 1 ? 's' : ''} available</p>
            
          </div>
        </div>
      </div>

      {/* Image preview */}
      {previewImage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: 8, cursor: 'pointer', display: 'flex' }}>
            <X size={22} color="white" />
          </button>
          <img src={previewImage} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
};

export default ProductSelectorModal;