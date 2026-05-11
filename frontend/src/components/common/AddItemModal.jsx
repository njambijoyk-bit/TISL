import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Package, Wrench, FileText, Check, Clock, Star, X } from 'lucide-react';
import AdminPagination from './AdminPagination';
import CustomItemModal from '../quotes/request-wizard/CustomItemModal';
import useProductStore from '../../store/productStore';
import useServiceStore from '../../store/serviceStore';
import { productsAPI, servicesAPI } from '../../api';

// ─── Design tokens ─────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ──────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'outline', size = 'md', type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: size === 'sm' ? '5px 12px' : '8px 18px',
      borderRadius: 10, fontSize: size === 'sm' ? '0.75rem' : '0.83rem', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      transition: 'transform 0.1s', boxShadow: 'none',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {children}
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
  }}
    onFocus={e => { e.target.style.borderColor = purple; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; }}
  >
    {children}
  </select>
);

const Pill = ({ children, color = '#6b7280', bg = '#f3f4f6' }) => (
  <span style={{ display: 'inline-block', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>
);

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
    <div style={{ width: 32, height: 32, border: `3px solid ${purpleLt}`, borderTopColor: purple, borderRadius: '50%', animation: 'aim-spin 0.8s linear infinite' }} />
  </div>
);

const fmt = (v) => `KES ${parseFloat(v || 0).toLocaleString()}`;

const getPricingDisplay = (service) => {
  if (service.price_is_negotiable) return 'Negotiable';
  switch (service.pricing_model) {
    case 'hourly':        return service.hourly_rate ? `${fmt(service.hourly_rate)}/hr`  : 'Contact for pricing';
    case 'daily':         return service.daily_rate  ? `${fmt(service.daily_rate)}/day`  : 'Contact for pricing';
    case 'subscription':  return service.base_price  ? `${fmt(service.base_price)}/mo`   : 'Contact for pricing';
    case 'fixed':
    case 'project_based': return service.base_price  ? `From ${fmt(service.base_price)}` : 'Contact for pricing';
    default:              return 'Contact for pricing';
  }
};

// ─── Products tab ────────────────────────────────────────────────────────────
const ProductsTab = ({ existingItemIds, selectedProducts, onSelectionChange }) => {
  const { categories, fetchCategories } = useProductStore();
  const [searchTerm,       setSearchTerm]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [products,         setProducts]         = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [pagination,       setPagination]       = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [page,             setPage]             = useState(1);
  const perPage = 20;

  const fetchProducts = useCallback(async (pageNum = 1, search = '', categoryId = '') => {
    setLoading(true);
    try {
      const params = { page: pageNum, per_page: perPage, ...(search ? { search } : {}), ...(categoryId ? { category_id: categoryId } : {}) };
      const res = await productsAPI.getProducts(params);
      setProducts(res.data || []);
      setPagination({ current_page: res.current_page || 1, last_page: res.last_page || 1, per_page: res.per_page || perPage, total: res.total || 0 });
    } catch (err) { console.error('Failed to fetch products', err); }
    finally { setLoading(false); }
  }, [perPage]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { setPage(1); fetchProducts(1, searchTerm, selectedCategory); }, [searchTerm, selectedCategory]); // eslint-disable-line
  useEffect(() => { fetchProducts(page, searchTerm, selectedCategory); }, [page]); // eslint-disable-line

  const alreadyIds = useMemo(() => existingItemIds.map(Number), [existingItemIds]);
  const displayProducts = useMemo(() => products.filter(p => !alreadyIds.includes(Number(p.id))), [products, alreadyIds]);

  const toggle = (product) => {
    const exists = selectedProducts.some(p => p.id === product.id);
    onSelectionChange(exists ? selectedProducts.filter(p => p.id !== product.id) : [...selectedProducts, product]);
  };
  const isSel = (id) => selectedProducts.some(p => p.id === id);

  return (
    <>
      {/* Filters */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StyledInput type="text" placeholder="Search by name, SKU, or brand…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon={<Search size={16} />} />
        <div style={{ display: 'flex', gap: 10 }}>
          <StyledSelect value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="">All Categories</option>
            {(categories || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </StyledSelect>
          {(searchTerm || selectedCategory) && (
            <Btn variant="outline" size="sm" onClick={() => { setSearchTerm(''); setSelectedCategory(''); }}>Clear</Btn>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '14px 24px', maxHeight: '44vh', overflowY: 'auto' }}>
        {loading ? <Spinner /> : displayProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
            <Package size={48} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
            <p style={{ fontSize: '0.85rem', margin: 0 }}>{searchTerm || selectedCategory ? 'No products match filters' : 'No products available'}</p>
          </div>
        ) : (
          <div className="aim-product-grid">
            {displayProducts.map(p => {
              const sel = isSel(p.id);
              return (
                <div key={p.id} className={`aim-pcard${sel ? ' sel' : ''}`} onClick={() => toggle(p)}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 22, height: 22, borderRadius: '50%', background: sel ? purple : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                      <Check size={12} color={sel ? 'white' : '#d1d5db'} strokeWidth={3} />
                    </div>
                    {p.main_image_url && (
                      <div style={{ width: '100%', height: 90, background: '#f9fafb', overflow: 'hidden' }}>
                        <img src={p.main_image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0, lineHeight: 1.3 }}>{p.name}</p>
                    {p.sku && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>SKU: {p.sku}</p>}
                    {p.brand?.name && <Pill>{p.brand.name}</Pill>}
                    {p.price && <p style={{ fontSize: '0.8rem', fontWeight: 800, color: purple, margin: 0 }}>{fmt(p.price)}</p>}
                    {p.stock_quantity !== undefined && (
                      <p style={{ fontSize: '0.68rem', fontWeight: 600, color: p.stock_quantity > 0 ? '#10b981' : '#ef4444', margin: 0 }}>
                        {p.stock_quantity > 0 ? `In Stock (${p.stock_quantity})` : 'Out of Stock'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{pagination.total} product{pagination.total !== 1 ? 's' : ''}</p>
        <AdminPagination pagination={pagination} onPageChange={setPage} />
      </div>
    </>
  );
};

// ─── Services tab ────────────────────────────────────────────────────────────
const ServicesTab = ({ existingItemIds, selectedServices, onSelectionChange }) => {
  const { categories, types, fetchCategories, fetchTypes } = useServiceStore();
  const [searchTerm,       setSearchTerm]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType,     setSelectedType]     = useState('');
  const [services,         setServices]         = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [pagination,       setPagination]       = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [page,             setPage]             = useState(1);
  const perPage = 20;

  const fetchServices = useCallback(async (pageNum = 1, search = '', categoryId = '', type = '') => {
    setLoading(true);
    try {
      const params = { page: pageNum, per_page: perPage, ...(search ? { search } : {}), ...(categoryId ? { category_id: categoryId } : {}), ...(type ? { type } : {}) };
      const res = await servicesAPI.getServices(params);
      setServices(res.data || []);
      setPagination({ current_page: res.current_page || 1, last_page: res.last_page || 1, per_page: res.per_page || perPage, total: res.total || 0 });
    } catch (err) { console.error('Failed to fetch services', err); }
    finally { setLoading(false); }
  }, [perPage]);

  useEffect(() => { fetchCategories(); fetchTypes(); }, [fetchCategories, fetchTypes]);
  useEffect(() => { setPage(1); fetchServices(1, searchTerm, selectedCategory, selectedType); }, [searchTerm, selectedCategory, selectedType]); // eslint-disable-line
  useEffect(() => { fetchServices(page, searchTerm, selectedCategory, selectedType); }, [page]); // eslint-disable-line

  const alreadyIds = useMemo(() => existingItemIds.map(Number), [existingItemIds]);
  const displayServices = useMemo(() => services.filter(s => !alreadyIds.includes(Number(s.id))), [services, alreadyIds]);

  const toggle = (service) => {
    const exists = selectedServices.some(s => s.id === service.id);
    onSelectionChange(exists ? selectedServices.filter(s => s.id !== service.id) : [...selectedServices, service]);
  };
  const isSel = (id) => selectedServices.some(s => s.id === id);

  return (
    <>
      {/* Filters */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StyledInput type="text" placeholder="Search services…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon={<Search size={16} />} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StyledSelect value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </StyledSelect>
          <StyledSelect value={selectedType} onChange={e => setSelectedType(e.target.value)}>
            <option value="">All Types</option>
            {types?.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')}</option>)}
          </StyledSelect>
          {(searchTerm || selectedCategory || selectedType) && (
            <Btn variant="outline" size="sm" onClick={() => { setSearchTerm(''); setSelectedCategory(''); setSelectedType(''); }}>Clear</Btn>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '14px 24px', maxHeight: '44vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? <Spinner /> : displayServices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
            <Wrench size={48} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
            <p style={{ fontSize: '0.85rem', margin: 0 }}>{searchTerm || selectedCategory || selectedType ? 'No services match filters' : 'No services available'}</p>
          </div>
        ) : displayServices.map(s => {
          const sel = isSel(s.id);
          return (
            <div key={s.id} className={`aim-scard${sel ? ' sel' : ''}`} onClick={() => toggle(s)}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: sel ? purple : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, transition: 'background 0.15s' }}>
                  <Check size={12} color={sel ? 'white' : '#d1d5db'} strokeWidth={3} />
                </div>
                {s.main_image_url && (
                  <img src={s.main_image_url} alt={s.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 4px' }}>{s.name}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {s.category?.name && <Pill bg={purpleLt} color={purple}>{s.category.name}</Pill>}
                        {s.is_featured && <Pill bg="rgba(245,158,11,0.1)" color="#d97706">⭐ Featured</Pill>}
                        {s.is_remote_available && <Pill bg="rgba(16,185,129,0.1)" color="#10b981">Remote</Pill>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 800, color: purple, margin: '0 0 2px' }}>{getPricingDisplay(s)}</p>
                      {s.minimum_charge && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>Min: {fmt(s.minimum_charge)}</p>}
                    </div>
                  </div>
                  {s.short_description && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 5px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.short_description}</p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {s.estimated_duration && <span style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} />{s.estimated_duration}</span>}
                    {s.rating > 0 && <span style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}><Star size={10} color="#f59e0b" fill="#f59e0b" />{s.rating.toFixed(1)} ({s.review_count})</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{pagination.total} service{pagination.total !== 1 ? 's' : ''}</p>
        <AdminPagination pagination={pagination} onPageChange={setPage} />
      </div>
    </>
  );
};

// ─── Main: AddItemModal ──────────────────────────────────────────────────────
const AddItemModal = ({ onClose, onAdd, existingItemIds = [] }) => {
  const [activeTab,         setActiveTab]         = useState('products'); // 'products' | 'services'
  const [selectedProducts,  setSelectedProducts]  = useState([]);
  const [selectedServices,  setSelectedServices]  = useState([]);
  const [showCustomModal,   setShowCustomModal]   = useState(false);

  const totalSelected = selectedProducts.length + selectedServices.length;

  const handleAdd = () => {
    const items = [
      ...selectedProducts.map(p => ({
        ...p,
        item_type:                  'product',
        product_id:                 p.id,
        product_name:               p.name,
        product_sku:                p.sku  || '',
        brand_name:                 p.brand?.name || '',
        unit_price:                 parseFloat(p.price || 0),
        quantity:                   p.quantity || 1,
        line_total:                 parseFloat(p.price || 0) * (p.quantity || 1),
        line_total_after_discount:  parseFloat(p.price || 0) * (p.quantity || 1),
        discount_amount:            0,
      })),
      ...selectedServices.map(s => {
        const unitPrice = parseFloat(s.base_price || s.hourly_rate || 0);
        return {
          ...s,
          item_type:                  'service',
          service_id:                 s.id,
          service_name:               s.name,
          unit_price:                 unitPrice,
          quantity:                   s.quantity || 1,
          line_total:                 unitPrice * (s.quantity || 1),
          line_total_after_discount:  unitPrice * (s.quantity || 1),
          discount_amount:            0,
        };
      }),
    ];
    onAdd(items);
    onClose();
  };

  const handleCustomAdd = (item) => {
    onAdd([{ ...item, item_type: item.is_service ? 'custom_service' : 'custom_product', quantity: item.quantity || 1 }]);
    onClose();
  };

  return (
    <>
      <style>{`
        @keyframes aim-fadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes aim-slideUp { from { opacity:0; transform:translateY(20px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes aim-spin    { to { transform:rotate(360deg); } }
        .aim-overlay { animation: aim-fadeIn 0.2s ease both; }
        .aim-modal   { animation: aim-slideUp 0.25s ease both; }
        .aim-product-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        @media(max-width:800px){ .aim-product-grid { grid-template-columns:repeat(3,1fr); } }
        @media(max-width:560px){ .aim-product-grid { grid-template-columns:repeat(2,1fr); } }
        .aim-pcard { border-radius:12px; border:1.5px solid var(--border,#f3f4f6); overflow:hidden; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s; background:var(--panel-bg,white); }
        .aim-pcard:hover { border-color:${purpleBd}; }
        .aim-pcard.sel  { border-color:${purple}; box-shadow:0 0 0 2px ${purpleBd}; background:${purpleLt}; }
        .aim-scard { border-radius:12px; border:1.5px solid var(--border,#f3f4f6); padding:12px 14px; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s; background:var(--panel-bg,white); }
        .aim-scard:hover { border-color:${purpleBd}; }
        .aim-scard.sel  { border-color:${purple}; box-shadow:0 0 0 2px ${purpleBd}; background:${purpleLt}; }
        .aim-tab { padding:10px 20px; font-size:0.83rem; font-weight:700; border:none; background:none; cursor:pointer; border-bottom:2.5px solid transparent; transition:color 0.15s, border-color 0.15s; }
        .aim-tab.active { color:${purple}; border-bottom-color:${purple}; }
        .aim-tab:not(.active) { color:#9ca3af; }
      `}</style>

      <div className="aim-overlay" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>
        <div className="aim-modal" style={{ width: '100%', maxWidth: 920, background: 'var(--panel-bg,white)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: purpleLt }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 900, color: purple, margin: 0 }}>Add Item to Order</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Custom item shortcut */}
              <button
                disabled
                title="Unauthorised for this action"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.25)', color: '#d97706', fontSize: '0.78rem', fontWeight: 700, cursor: 'not-allowed', opacity: 0.45 }}>
                <FileText size={14} /> Custom Item
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#9ca3af', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border,#f3f4f6)', padding: '0 24px', gap: 4 }}>
            <button className={`aim-tab${activeTab === 'products' ? ' active' : ''}`} onClick={() => setActiveTab('products')}>
              <Package size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Products
              {selectedProducts.length > 0 && (
                <span style={{ marginLeft: 8, background: purple, color: 'white', borderRadius: 9999, fontSize: '0.68rem', padding: '1px 7px', fontWeight: 700 }}>{selectedProducts.length}</span>
              )}
            </button>
            <button className={`aim-tab${activeTab === 'services' ? ' active' : ''}`} onClick={() => setActiveTab('services')}>
              <Wrench size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Services
              {selectedServices.length > 0 && (
                <span style={{ marginLeft: 8, background: purple, color: 'white', borderRadius: 9999, fontSize: '0.68rem', padding: '1px 7px', fontWeight: 700 }}>{selectedServices.length}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'products' && (
            <ProductsTab
              existingItemIds={existingItemIds}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
            />
          )}
          {activeTab === 'services' && (
            <ServicesTab
              existingItemIds={existingItemIds}
              selectedServices={selectedServices}
              onSelectionChange={setSelectedServices}
            />
          )}

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel-bg,white)' }}>
            {totalSelected > 0 ? (
              <p style={{ fontSize: '0.78rem', fontWeight: 700, color: purple, margin: 0 }}>
                {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
                {selectedProducts.length > 0 && selectedServices.length > 0 && (
                  <span style={{ color: '#9ca3af', fontWeight: 400 }}> ({selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''}, {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''})</span>
                )}
              </p>
            ) : (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Select items to add</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="outline" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={handleAdd} disabled={totalSelected === 0}>
                Add{totalSelected > 0 ? ` (${totalSelected})` : ''} Item{totalSelected !== 1 ? 's' : ''}
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Custom item sub-modal — unchanged/frozen */}
      {showCustomModal && (
        <CustomItemModal
          onClose={() => setShowCustomModal(false)}
          onAdd={handleCustomAdd}
        />
      )}
    </>
  );
};

export default AddItemModal;