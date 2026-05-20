import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { productsAPI } from '../../api';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Header from '../../components/layout/Header';
import {
  Plus, Search, Edit2, Eye, Trash2, Filter, X,
  Package, TrendingUp, AlertCircle, CheckCircle, XCircle, Archive,
} from 'lucide-react';

// ─── Theme-agnostic style tokens ─────────────────────────────────────────────

const card = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: '0.875rem',
  border: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
};

const labelStyle = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border-tertiary)',
  fontSize: '0.875rem',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
};

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_MAP = {
  active:       { bg: 'var(--color-background-success)', color: 'var(--color-text-success)', icon: CheckCircle },
  inactive:     { bg: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', icon: XCircle },
  draft:        { bg: 'var(--color-background-warning)', color: 'var(--color-text-warning)', icon: AlertCircle },
  out_of_stock: { bg: 'var(--color-background-danger)', color: 'var(--color-text-danger)', icon: XCircle },
  discontinued: { bg: 'var(--color-background-danger)', color: 'var(--color-text-danger)', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.draft;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99,
      fontSize: '0.68rem', fontWeight: 700,
      background: cfg.bg, color: cfg.color,
    }}>
      <Icon size={11} />
      {status.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

// ─── Reusable button helpers ──────────────────────────────────────────────────

function Btn({ onClick, disabled, style, children, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
        border: '1px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        transition: 'background 150ms',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
        border: 'none', background: '#7c3aed', color: 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DangerBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
        border: 'none', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, color, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'transparent',
        color, cursor: 'pointer', transition: 'background 150ms',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <div style={{ ...card, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          {value}
        </p>
      </div>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.45)',           // ← change to line below
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',              // ← add this
        WebkitBackdropFilter: 'blur(6px)',        // ← add this (Safari)
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        ...card,
        background: 'white', color: '#08070a',
        width: '100%', maxWidth,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Products() {
  const navigate = useNavigate();

  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: '', is_featured: '', on_sale: '', in_stock: '' });
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, product: null, loading: false });
  const [trashModal,  setTrashModal]  = useState({
    isOpen: false, loading: false, products: [], search: '', selectedIds: [],
    pagination: { current_page: 1, last_page: 1, per_page: 10, total: 0 },
  });
  const [bulkConfirm, setBulkConfirm] = useState({ isOpen: false, action: '', loading: false });

  useEffect(() => { fetchProducts(); }, [pagination.current_page, searchTerm, filters]);

  // ── API calls ──────────────────────────────────────────────────────────────

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.current_page, per_page: pagination.per_page, search: searchTerm || undefined, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await productsAPI.getAdminProducts(params);
      if (res.data && Array.isArray(res.data)) {
        setProducts(res.data);
        setPagination(p => ({ ...p, current_page: res.current_page || 1, last_page: res.last_page || 1, per_page: res.per_page || 20, total: res.total || res.data.length }));
      } else { setProducts([]); }
    } catch { toast.error('Failed to load products'); }
    finally { setLoading(false); }
  };

  const fetchTrashProducts = async (page = 1, search = '') => {
    setTrashModal(p => ({ ...p, loading: true }));
    try {
      const params = { page, per_page: trashModal.pagination.per_page, search: search || undefined };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await productsAPI.getTrashProducts(params);
      if (res.data && Array.isArray(res.data)) {
        setTrashModal(p => ({ ...p, products: res.data, loading: false,
          pagination: { current_page: res.current_page || 1, last_page: res.last_page || 1, per_page: res.per_page || 10, total: res.total || res.data.length },
        }));
      } else { setTrashModal(p => ({ ...p, products: [], loading: false })); }
    } catch { toast.error('Failed to load trash'); setTrashModal(p => ({ ...p, loading: false })); }
  };

  const handleDelete = async () => {
    setDeleteModal(p => ({ ...p, loading: true }));
    try {
      await productsAPI.deleteProduct(deleteModal.product.id);
      toast.success(`"${deleteModal.product.name}" moved to trash`);
      setDeleteModal({ isOpen: false, product: null, loading: false });
      fetchProducts();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete product');
      setDeleteModal(p => ({ ...p, loading: false }));
    }
  };

  const confirmBulkAction = async () => {
    setBulkConfirm(p => ({ ...p, loading: true }));
    try {
      const ids = trashModal.selectedIds;
      if (bulkConfirm.action === 'restore') { await productsAPI.restoreProducts(ids); toast.success(`${ids.length} item(s) restored`); }
      else { await productsAPI.forceDeleteProducts(ids); toast.success(`${ids.length} item(s) permanently deleted`); }
      await fetchTrashProducts(trashModal.pagination.current_page, trashModal.search);
      await fetchProducts();
      setTrashModal(p => ({ ...p, selectedIds: [] }));
      setBulkConfirm({ isOpen: false, action: '', loading: false });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Action failed');
      setBulkConfirm(p => ({ ...p, loading: false }));
    }
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const clearFilters = () => { setFilters({ status: '', is_featured: '', on_sale: '', in_stock: '' }); setSearchTerm(''); };
  const hasFilters   = searchTerm || Object.values(filters).some(Boolean);

  const toggleSelect    = (id) => setTrashModal(p => ({ ...p, selectedIds: p.selectedIds.includes(id) ? p.selectedIds.filter(x => x !== id) : [...p.selectedIds, id] }));
  const toggleSelectAll = () => setTrashModal(p => ({ ...p, selectedIds: p.selectedIds.length === p.products.length ? [] : p.products.map(x => x.id) }));

  const openBulkConfirm   = (action) => { if (!trashModal.selectedIds.length) { toast.error('Select at least one item'); return; } setBulkConfirm({ isOpen: true, action, loading: false }); };
  const openSingleConfirm = (action, product) => { setTrashModal(p => ({ ...p, selectedIds: [product.id] })); setBulkConfirm({ isOpen: true, action, loading: false }); };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div style={{ padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh' }}>
       

        {/* ── Page heading ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Package size={24} style={{ color: '#a855f7' }} /> Products
            </h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>Manage your product catalogue</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn onClick={() => { setTrashModal(p => ({ ...p, isOpen: true })); fetchTrashProducts(1, ''); }} title="View Trash">
              <Archive size={15} /> Trash
            </Btn>
            <PrimaryBtn onClick={() => navigate('/admin/products/create')}>
              <Plus size={15} /> Create Product
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard label="Total Products" value={pagination.total}                                  icon={Package}      iconBg="rgba(124,58,237,0.1)"  iconColor="#7c3aed" />
          <StatCard label="Active"         value={products.filter(p => p.status === 'active').length} icon={CheckCircle}  iconBg="rgba(16,185,129,0.1)"  iconColor="#10b981" />
          <StatCard label="Out of Stock"   value={products.filter(p => !p.in_stock).length}           icon={AlertCircle}  iconBg="rgba(239,68,68,0.1)"   iconColor="#ef4444" />
          <StatCard label="Featured"       value={products.filter(p => p.is_featured).length}         icon={TrendingUp}   iconBg="rgba(245,158,11,0.1)"  iconColor="#f59e0b" />
        </div>

        {/* ── Search + filters ────────────────────────────────────────────── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPagination(p => ({ ...p, current_page: 1 })); }}
                placeholder="Search products by name, SKU…"
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>

            {/* Filter toggle */}
            <Btn
              onClick={() => setShowFilters(v => !v)}
              style={showFilters ? { background: 'rgba(124,58,237,0.08)', borderColor: '#7c3aed', color: '#7c3aed' } : {}}
            >
              <Filter size={15} /> Filters {hasFilters && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />}
            </Btn>

            {/* Clear */}
            {hasFilters && (
              <Btn onClick={clearFilters} style={{ color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
                <X size={15} /> Clear
              </Btn>
            )}
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border-tertiary)' }}>
              {[
                { key: 'status',      label: 'Status',       options: [['', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive'], ['draft', 'Draft'], ['out_of_stock', 'Out of stock'], ['discontinued', 'Discontinued']] },
                { key: 'is_featured', label: 'Featured',     options: [['', 'All products'], ['1', 'Featured only'], ['0', 'Not featured']] },
                { key: 'on_sale',     label: 'On sale',      options: [['', 'All products'], ['1', 'On sale only'], ['0', 'Not on sale']] },
                { key: 'in_stock',    label: 'Stock status', options: [['', 'All products'], ['1', 'In stock'], ['0', 'Out of stock']] },
              ].map(({ key, label, options }) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <select
                    value={filters[key]}
                    onChange={e => { setFilters(p => ({ ...p, [key]: e.target.value })); setPagination(p => ({ ...p, current_page: 1 })); }}
                    style={selectStyle}
                  >
                    {options.map(([val, txt]) => <option key={val} value={val}>{txt}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Products table ──────────────────────────────────────────────── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
              <LoadingSpinner />
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <Package size={48} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>No products found</h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                {hasFilters ? 'Try adjusting your search or filters' : 'Get started by creating your first product'}
              </p>
              {!hasFilters && (
                <PrimaryBtn onClick={() => navigate('/admin/products/create')}>
                  <Plus size={15} /> Create First Product
                </PrimaryBtn>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Product', 'SKU', 'Category', 'Price', 'Stock', 'Status', ''].map((h, i) => (
                        <th key={i} style={{ ...thStyle, textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => (
                      <tr
                        key={product.id}
                        style={{ transition: 'background 120ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Product */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {product.main_image_url ? (
                              <img src={product.main_image_url} alt={product.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Package size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{product.name}</p>
                              {product.brand && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{product.brand.name}</p>}
                            </div>
                          </div>
                        </td>
                        {/* SKU */}
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{product.sku}</span>
                        </td>
                        {/* Category */}
                        <td style={tdStyle}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{product.category?.name || '—'}</span>
                        </td>
                        {/* Price */}
                        <td style={tdStyle}>
                          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            KSh {parseFloat(product.price).toLocaleString()}
                          </p>
                          {product.original_price && parseFloat(product.original_price) > parseFloat(product.price) && (
                            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)', textDecoration: 'line-through' }}>
                              KSh {parseFloat(product.original_price).toLocaleString()}
                            </p>
                          )}
                        </td>
                        {/* Stock */}
                        <td style={tdStyle}>
                          {product.in_stock ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--color-text-success)', fontWeight: 600 }}>
                              <CheckCircle size={13} /> {product.stock_quantity ?? 'In stock'}
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--color-text-danger)', fontWeight: 600 }}>
                              <XCircle size={13} /> Out of stock
                            </span>
                          )}
                        </td>
                        {/* Status */}
                        <td style={tdStyle}><StatusBadge status={product.status} /></td>
                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                            <IconBtn onClick={() => navigate(`/admin/products/${product.id}/edit?mode=view`)} title="View" color="var(--color-text-info)">
                              <Eye size={15} />
                            </IconBtn>
                            <IconBtn onClick={() => navigate(`/admin/products/${product.id}/edit`)} title="Edit" color="#7c3aed">
                              <Edit2 size={15} />
                            </IconBtn>
                            <IconBtn onClick={() => setDeleteModal({ isOpen: true, product, loading: false })} title="Delete" color="var(--color-text-danger)">
                              <Trash2 size={15} />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.last_page > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--color-border-tertiary)', flexWrap: 'wrap', gap: 16 }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    Showing <span style={{ color: 'var(--color-text-primary)' }}>{((pagination.current_page - 1) * pagination.per_page) + 1}</span>–<span style={{ color: 'var(--color-text-primary)' }}>{Math.min(pagination.current_page * pagination.per_page, pagination.total)}</span> of <span style={{ color: 'var(--color-text-primary)' }}>{pagination.total}</span>
                  </p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* First Page */}
                    <Btn 
                      onClick={() => setPagination(p => ({ ...p, current_page: 1 }))} 
                      disabled={pagination.current_page === 1}
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                      title="First Page"
                    >
                      «
                    </Btn>

                    {/* Prev */}
                    <Btn 
                      onClick={() => setPagination(p => ({ ...p, current_page: p.current_page - 1 }))} 
                      disabled={pagination.current_page === 1}
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    >
                      ‹ Prev
                    </Btn>

                    {/* Page Numbers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
                      {(() => {
                        const current = pagination.current_page;
                        const last = pagination.last_page;
                        const delta = 2;
                        const range = [];
                        const rangeWithDots = [];
                        let l;

                        for (let i = 1; i <= last; i++) {
                          if (i === 1 || i === last || (i >= current - delta && i <= current + delta)) {
                            range.push(i);
                          }
                        }

                        for (let i of range) {
                          if (l) {
                            if (i - l === 2) {
                              rangeWithDots.push(l + 1);
                            } else if (i - l !== 1) {
                              rangeWithDots.push('...');
                            }
                          }
                          rangeWithDots.push(i);
                          l = i;
                        }

                        return rangeWithDots.map((n, i) => (
                          n === '...' ? (
                            <span key={`dots-${i}`} style={{ padding: '0 4px', color: 'var(--color-text-tertiary)', fontSize: '0.82rem' }}>...</span>
                          ) : (
                            <button
                              key={n}
                              onClick={() => setPagination(p => ({ ...p, current_page: n }))}
                              style={{
                                minWidth: 32, height: 32, borderRadius: 8, border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.82rem', fontWeight: n === current ? 700 : 500,
                                cursor: 'pointer', fontFamily: 'inherit',
                                background: n === current ? '#7c3aed' : 'transparent',
                                color: n === current ? 'white' : 'var(--color-text-secondary)',
                                transition: 'all 150ms',
                              }}
                              onMouseEnter={e => { if (n !== current) e.currentTarget.style.background = 'var(--color-background-secondary)'; }}
                              onMouseLeave={e => { if (n !== current) e.currentTarget.style.background = 'transparent'; }}
                            >
                              {n}
                            </button>
                          )
                        ));
                      })()}
                    </div>

                    {/* Next */}
                    <Btn 
                      onClick={() => setPagination(p => ({ ...p, current_page: p.current_page + 1 }))} 
                      disabled={pagination.current_page === pagination.last_page}
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    >
                      Next ›
                    </Btn>

                    {/* Last Page */}
                    <Btn 
                      onClick={() => setPagination(p => ({ ...p, current_page: pagination.last_page }))} 
                      disabled={pagination.current_page === pagination.last_page}
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                      title="Last Page"
                    >
                      »
                    </Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Delete modal ─────────────────────────────────────────────────── */}
      {deleteModal.isOpen && (
        <Modal onClose={() => setDeleteModal({ isOpen: false, product: null, loading: false })}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--color-background-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={20} style={{ color: '#f87171' }} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 700, color: '#f87171' }}>Delete product</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>This moves the product to trash</p>
              </div>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Are you sure you want to delete <strong style={{ color: '#f87171' }}>"{deleteModal.product?.name}"</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={() => setDeleteModal({ isOpen: false, product: null, loading: false })} disabled={deleteModal.loading} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
              <DangerBtn onClick={handleDelete} disabled={deleteModal.loading} style={{ flex: 1, justifyContent: 'center', background: '#ef4444', color: 'white' }}>
                {deleteModal.loading ? <><LoadingSpinner /> Deleting…</> : 'Delete product'}
              </DangerBtn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Trash modal ──────────────────────────────────────────────────── */}
      {trashModal.isOpen && (
        <Modal onClose={() => setTrashModal(p => ({ ...p, isOpen: false, products: [] }))} maxWidth={860}>
          {/* Modal header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border-tertiary)', flexShrink: 0, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Archive size={16} style={{ color: '#f87171' }} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 1px', fontSize: '0.95rem', fontWeight: 700, color: '#f87171' }}>Trash</h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>Soft-deleted products</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search trashed…"
                  value={trashModal.search}
                  onChange={e => setTrashModal(p => ({ ...p, search: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') fetchTrashProducts(1, trashModal.search); }}
                  style={{ ...inputStyle, width: 180, paddingLeft: 28, fontSize: '0.78rem' }}
                />
              </div>
              <PrimaryBtn onClick={() => fetchTrashProducts(1, trashModal.search)} style={{ padding: '7px 12px', fontSize: '0.78rem' }}>Search</PrimaryBtn>
              <Btn onClick={() => setTrashModal(p => ({ ...p, isOpen: false, products: [] }))} style={{ padding: '7px 12px', fontSize: '0.78rem' }}>
                <X size={13} /> Close
              </Btn>
            </div>
          </div>

          {/* Modal body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
            {trashModal.loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><LoadingSpinner /></div>
            ) : trashModal.products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Archive size={40} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 10px' }} />
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>Trash is empty</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>No soft-deleted products found.</p>
              </div>
            ) : (
              <>
                {/* Bulk bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={trashModal.selectedIds.length === trashModal.products.length && trashModal.products.length > 0}
                      onChange={toggleSelectAll}
                      style={{ accentColor: '#7c3aed' }}
                    />
                    Select page
                    {trashModal.selectedIds.length > 0 && (
                      <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>({trashModal.selectedIds.length} selected)</span>
                    )}
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn onClick={() => openBulkConfirm('restore')} disabled={!trashModal.selectedIds.length} style={{ fontSize: '0.78rem', padding: '6px 12px', color: 'var(--color-text-success)', borderColor: 'var(--color-border-success)' }}>
                      Restore selected
                    </Btn>
                    <DangerBtn onClick={() => openBulkConfirm('force')} disabled={!trashModal.selectedIds.length} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
                      Delete permanently
                    </DangerBtn>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--color-border-tertiary)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 40, textAlign: 'center' }} />
                        {['Product', 'SKU', 'Deleted at', ''].map((h, i) => (
                          <th key={i} style={{ ...thStyle, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trashModal.products.map(p => (
                        <tr
                          key={p.id}
                          style={{ transition: 'background 120ms' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <input type="checkbox" checked={trashModal.selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} style={{ accentColor: '#7c3aed' }} />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {p.main_image_url ? (
                                <img src={p.main_image_url} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Package size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                                </div>
                              )}
                              <div>
                                <p style={{ margin: '0 0 2px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.name}</p>
                                {p.brand && <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-text-tertiary)' }}>{p.brand.name}</p>}
                              </div>
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{p.sku}</span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>{new Date(p.deleted_at).toLocaleString()}</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <Btn onClick={() => openSingleConfirm('restore', p)} style={{ fontSize: '0.72rem', padding: '5px 10px', color: 'var(--color-text-success)', borderColor: 'var(--color-border-success)' }}>Restore</Btn>
                              <DangerBtn onClick={() => openSingleConfirm('force', p)} style={{ fontSize: '0.72rem', padding: '5px 10px' }}>Delete</DangerBtn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Trash pagination */}
                {trashModal.pagination.last_page > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      Showing {((trashModal.pagination.current_page - 1) * trashModal.pagination.per_page) + 1}–{Math.min(trashModal.pagination.current_page * trashModal.pagination.per_page, trashModal.pagination.total)} of {trashModal.pagination.total}
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn onClick={() => fetchTrashProducts(trashModal.pagination.current_page - 1, trashModal.search)} disabled={trashModal.pagination.current_page === 1} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>← Prev</Btn>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>{trashModal.pagination.current_page} / {trashModal.pagination.last_page}</span>
                      <Btn onClick={() => fetchTrashProducts(trashModal.pagination.current_page + 1, trashModal.search)} disabled={trashModal.pagination.current_page === trashModal.pagination.last_page} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>Next →</Btn>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Bulk confirm modal ────────────────────────────────────────────── */}
      {bulkConfirm.isOpen && (
        <Modal onClose={() => setBulkConfirm({ isOpen: false, action: '', loading: false })} maxWidth={440}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: bulkConfirm.action === 'force' ? 'var(--color-background-danger)' : 'var(--color-background-success)',
              }}>
                {bulkConfirm.action === 'force'
                  ? <Trash2 size={20} style={{ color: 'var(--color-text-danger)' }} />
                  : <CheckCircle size={20} style={{ color: 'var(--color-text-success)' }} />
                }
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {bulkConfirm.action === 'force' ? 'Delete permanently' : 'Restore products'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  {trashModal.selectedIds.length} item(s) selected
                </p>
              </div>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {bulkConfirm.action === 'force'
                ? 'These products will be permanently deleted and cannot be recovered.'
                : 'These products will be restored and visible in your catalogue again.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={() => setBulkConfirm({ isOpen: false, action: '', loading: false })} disabled={bulkConfirm.loading} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
              <button
                onClick={confirmBulkAction}
                disabled={bulkConfirm.loading}
                style={{
                  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                  border: 'none', cursor: bulkConfirm.loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  background: bulkConfirm.action === 'force' ? '#ef4444' : '#10b981', color: 'white',
                  opacity: bulkConfirm.loading ? 0.7 : 1,
                }}
              >
                {bulkConfirm.loading ? <><LoadingSpinner /> Processing…</> : (bulkConfirm.action === 'force' ? 'Delete permanently' : 'Restore')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}