import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  Search, Filter, Package, Eye, Trash2, RotateCcw,
  CheckCircle, XCircle, Truck, CreditCard, AlertTriangle, ChevronLeft,
  ChevronRight, Download, RefreshCw, Clock, Shield, X,
} from 'lucide-react';
import auctionsAPI from '../../api/auctions';
import useAuthStore from '../../store/authStore'; // ✅ correct import

// ── shared style helpers ──────────────────────────────────────────────────────

const statusConfig = {
  pending:    { color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' },
  confirmed:  { color: '#2563eb', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', dot: '#3b82f6' },
  processing: { color: '#7c3aed', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)', dot: '#8b5cf6' },
  delivered:  { color: '#059669', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', dot: '#10b981' },
  failed:     { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.25)', dot: '#ef4444' },
  cancelled:  { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', dot: '#9ca3af' },
};

const paymentConfig = {
  pending:        { color: '#d97706', label: 'Pending' },
  confirmed:      { color: '#2563eb', label: 'Confirmed' },
  partially_paid: { color: '#7c3aed', label: 'Partial' },
  paid:           { color: '#059669', label: 'Paid' },
  overpayment:    { color: '#0891b2', label: 'Overpaid' },
  refunded:       { color: '#6b7280', label: 'Refunded' },
};

const StatusBadge = ({ status, type = 'order' }) => {
  const config = type === 'order' ? statusConfig[status] : paymentConfig[status];
  if (!config) return null;
  if (type === 'payment') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 99,
        background: config.color + '14', color: config.color,
        fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em'
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: config.color }} />
        {config.label}
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 99,
      background: config.bg, border: `1px solid ${config.border}`,
      fontSize: '0.72rem', fontWeight: 800, color: config.color,
      textTransform: 'uppercase', letterSpacing: '0.06em'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.dot }} />
      {status}
    </span>
  );
};

const FilterChip = ({ label, active, onClick, count }) => (
  <button onClick={onClick} style={{
    padding: '6px 14px', borderRadius: 99, border: 'none',
    background: active ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : '#f3f4f6',
    color: active ? 'white' : '#6b7280', fontSize: '0.78rem', fontWeight: 700,
    cursor: 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 6
  }}>
    {label}
    {count !== undefined && (
      <span style={{
        background: active ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
        padding: '1px 7px', borderRadius: 99, fontSize: '0.65rem'
      }}>{count}</span>
    )}
  </button>
);

const ActionBtn = ({ children, onClick, variant = 'primary', icon: Icon, disabled }) => {
  const variants = {
    primary: { background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', border: 'none' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb' },
    success: { background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.2)' },
    danger:  { background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1.5px solid rgba(239,68,68,0.2)' },
    ghost:   { background: 'transparent', color: '#6b7280', border: 'none' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 14px', borderRadius: 10, fontSize: '0.78rem',
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 150ms', whiteSpace: 'nowrap'
    }}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
};

// ── Trashed Orders Modal ──────────────────────────────────────────────────────

function TrashedOrdersModal({ isOpen, onClose, isSuperAdmin, onRestored }) {
  const [trashed, setTrashed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ last_page: 1, total: 0 });
  const [acting, setActing] = useState(null);

  const fetchTrashed = async (p = 1, s = search) => {
    setLoading(true);
    try {
      const data = await auctionsAPI.listTrashedAuctionOrders({ page: p, per_page: 15, search: s });
      setTrashed(data.data || []);
      setPagination({ last_page: data.last_page || 1, total: data.total || 0 });
      setPage(p);
    } catch {
      toast.error('Failed to load trashed orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) { setSearch(''); fetchTrashed(1, ''); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => fetchTrashed(1, search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleRestore = async (id) => {
    setActing(id);
    try {
        await auctionsAPI.restoreAuctionOrderFromTrash(id);
        toast.success('Order restored from trash');
        fetchTrashed(page);      // refresh trash list first
        onRestored();            // then notify parent
    } catch (err) {
        toast.error(err.response?.data?.message || 'Restore failed');
    } finally {
        setActing(null);
    }
    };

  const handleForceDelete = async (id, orderNumber) => {
    if (!window.confirm(`Permanently delete order #${orderNumber}? This cannot be undone.`)) return;
    setActing(id);
    try {
      await auctionsAPI.forceDeleteAuctionOrder(id);
      toast.success('Order permanently deleted');
      fetchTrashed(page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setActing(null);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';
  const formatPrice = (p) => `KSh ${Number(p ?? 0).toLocaleString()}`;

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16, backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth: 860,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(220,38,38,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Trash2 size={16} style={{ color: '#dc2626' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                Trashed Orders
              </h3>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
                {pagination.total} order{pagination.total !== 1 ? 's' : ''} in trash
                {isSuperAdmin && (
                  <span style={{ color: '#dc2626', fontWeight: 700 }}> · Permanent delete available</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Search by order number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 34px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.85rem', color: '#111827',
                background: '#f9fafb', outline: 'none', boxSizing: 'border-box'
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af'
              }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', flexDirection: 'column', gap: 10 }}>
              <RefreshCw size={28} style={{ color: '#a855f7', opacity: 0.4, animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#9ca3af', fontWeight: 600, fontSize: '0.85rem' }}>Loading...</p>
            </div>
          ) : trashed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <Trash2 size={40} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>Trash is empty</p>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No trashed orders found</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Order #', 'Product', 'Customer', 'Total', 'Deleted On', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: '0.65rem', fontWeight: 800, color: '#a855f7',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trashed.map(order => (
                  <tr key={order.id} style={{ borderTop: '1px solid #f9fafb' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626' }}>
                        #{order.order_number}
                      </span>
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>
                        Auction #{order.auction_id}
                      </p>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{
                        fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: 0,
                        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {order.auction?.product?.name || order.product_name || '—'}
                      </p>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 2px' }}>
                        {order.customer?.first_name && order.customer?.last_name
                          ? `${order.customer.first_name} ${order.customer.last_name}`
                          : order.customer?.name || 'Unknown'}
                      </p>
                      <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{order.customer?.email || '—'}</p>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.88rem', fontWeight: 800, color: '#111827' }}>
                      {formatPrice(order.total)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, margin: 0, whiteSpace: 'nowrap' }}>
                        {formatDate(order.deleted_at)}
                      </p>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleRestore(order.id)}
                          disabled={acting === order.id}
                          title="Restore from trash"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 8,
                            border: '1.5px solid rgba(16,185,129,0.25)',
                            background: 'rgba(16,185,129,0.07)', color: '#059669',
                            fontSize: '0.75rem', fontWeight: 700,
                            cursor: acting === order.id ? 'not-allowed' : 'pointer',
                            opacity: acting === order.id ? 0.6 : 1
                          }}
                        >
                          <RotateCcw size={13} />
                          {acting === order.id ? '...' : 'Restore'}
                        </button>

                        {isSuperAdmin && (
                          <button
                            onClick={() => handleForceDelete(order.id, order.order_number)}
                            disabled={acting === order.id}
                            title="Permanently delete"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 8,
                              border: '1.5px solid rgba(220,38,38,0.25)',
                              background: 'rgba(220,38,38,0.07)', color: '#dc2626',
                              fontSize: '0.75rem', fontWeight: 700,
                              cursor: acting === order.id ? 'not-allowed' : 'pointer',
                              opacity: acting === order.id ? 0.6 : 1
                            }}
                          >
                            <Trash2 size={13} />
                            Delete Forever
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination footer */}
        {pagination.last_page > 1 && (
          <div style={{
            padding: '12px 24px', borderTop: '1px solid #f3f4f6', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>
              Page {page} of {pagination.last_page}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => fetchTrashed(page - 1)} disabled={page === 1}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d1d5db' : '#374151' }}>
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => fetchTrashed(page + 1)} disabled={page === pagination.last_page}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'white', cursor: page === pagination.last_page ? 'not-allowed' : 'pointer', color: page === pagination.last_page ? '#d1d5db' : '#374151' }}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminAuctionOrders() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);               // ✅ zustand selector
  const isSuperAdmin = user?.role === 'super_admin';            // ✅ derived here, passed as prop

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);            // ✅ lives in parent
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [filters, setFilters] = useState({ status: '', payment_status: '', search: '', per_page: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const statusFilters = [
    { key: '', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'processing', label: 'Processing' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'failed', label: 'Failed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const fetchOrders = async (page = 1, extra = {}) => {
    setLoading(true);
    try {
      const params = { page, per_page: filters.per_page, ...extra };
      if (filters.status) params.status = filters.status;
      if (filters.payment_status) params.payment_status = filters.payment_status;
      if (filters.search) params.search = filters.search;
      const data = await auctionsAPI.listAuctionOrders(params);
      setOrders(data.data || []);
      setPagination({ current_page: data.current_page || 1, last_page: data.last_page || 1, total: data.total || 0 });
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters(prev => ({ ...prev, search: searchInput }));
        fetchOrders(1, { search: searchInput });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleStatusFilter = (status) => {
    setFilters(prev => ({ ...prev, status }));
    fetchOrders(1, { status });
  };

  const handleRefresh = () => { setRefreshing(true); fetchOrders(pagination.current_page); };
  const handlePageChange = (page) => { if (page >= 1 && page <= pagination.last_page) fetchOrders(page); };

  const handleTrashOrder = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Move this order to trash?')) return;
    try {
      await auctionsAPI.trashAuctionOrder(id);
      toast.success('Order moved to trash');
      fetchOrders(pagination.current_page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to trash order');
    }
  };

  const formatPrice = (price) => `KSh ${Number(price ?? 0).toLocaleString()}`;
  const formatDate = (date) => date ? new Date(date).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const stats = useMemo(() => {
    const counts = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders]);

  return (
    <>
      <Helmet><title>Auction Orders | Admin</title></Helmet>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <button
                onClick={() => navigate('/admin/auctions')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#a855f7', fontSize: '0.8rem', fontWeight: 600, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
                <ChevronLeft size={14} /> Auctions
            </button>
            <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>›</span>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Orders</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Auction Orders</h1>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>Manage and track all auction winner orders</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ActionBtn variant="outline" icon={RefreshCw} onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </ActionBtn>
            <ActionBtn variant="danger" icon={Trash2} onClick={() => setShowTrash(true)}>
              Trash
            </ActionBtn>
            <ActionBtn variant="outline" icon={Download}>Export</ActionBtn>
            <button onClick={() => navigate('/admin/auctions')} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
              border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.825rem', cursor: 'pointer'
            }}>
              <Package size={14} /> Auctions
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: 'Total Orders', value: pagination.total, color: '#a855f7', icon: Package },
            { label: 'Pending',      value: stats.pending || 0, color: '#d97706', icon: Clock },
            { label: 'Confirmed',    value: stats.confirmed || 0, color: '#2563eb', icon: CheckCircle },
            { label: 'Processing',   value: stats.processing || 0, color: '#7c3aed', icon: Truck },
            { label: 'Delivered',    value: stats.delivered || 0, color: '#059669', icon: Shield },
            { label: 'Failed/Cancelled', value: (stats.failed || 0) + (stats.cancelled || 0), color: '#dc2626', icon: XCircle },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: s.color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', margin: '0 0 2px' }}>{s.value}</p>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters & Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 400 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input type="text" placeholder="Search by order number..." value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{ width: '100%', padding: '9px 12px 9px 38px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.875rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }}
              />
              {searchInput && (
                <button onClick={() => setSearchInput('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {statusFilters.map(f => (
              <FilterChip key={f.key} label={f.label} active={filters.status === f.key}
                onClick={() => handleStatusFilter(f.key)}
                count={f.key === '' ? pagination.total : stats[f.key] || 0}
              />
            ))}
          </div>
        </div>

        {/* Orders Table */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: 12 }}>
              <RefreshCw size={32} style={{ color: '#a855f7', opacity: 0.4, animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#9ca3af', fontWeight: 600 }}>Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#9ca3af' }}>
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ fontWeight: 700, fontSize: '1rem', color: '#374151', margin: '0 0 4px' }}>No orders found</p>
              <p style={{ fontSize: '0.8rem', margin: 0 }}>Try adjusting your filters or search query</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Order #', 'Product', 'Customer', 'Total', 'Status', 'Payment', 'Date', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} onClick={() => navigate(`/admin/auction-orders/${order.id}`)}
                        style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background 150ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#faf5ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a855f7' }}>#{order.order_number}</span>
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>Auction #{order.auction_id}</p>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {order.auction?.product?.main_image_url
                              ? <img src={order.auction.product.main_image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }} />
                              : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={16} style={{ color: '#d1d5db' }} /></div>
                            }
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                                {order.product_name || order.auction?.product?.name || 'Unknown Product'}
                              </p>
                              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{order.product_sku || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#a855f7', flexShrink: 0 }}>
                              {(order.customer?.first_name?.[0] || 'U').toUpperCase()}
                            </div>
                            <div>
                              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>
                                {order.customer?.first_name && order.customer?.last_name
                                  ? `${order.customer.first_name} ${order.customer.last_name}`
                                  : order.customer?.name || 'Unknown'}
                              </p>
                              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{order.customer?.email || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827', margin: 0 }}>{formatPrice(order.total)}</p>
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{order.quantity || 1} × {formatPrice(order.charged_amount || order.winning_bid_amount)}</p>
                        </td>
                        <td style={{ padding: '14px 16px' }}><StatusBadge status={order.status} /></td>
                        <td style={{ padding: '14px 16px' }}><StatusBadge status={order.payment_status} type="payment" /></td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatDate(order.created_at)}</span>
                          {order.shipped_at && (
                            <p style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600, margin: '2px 0 0' }}>
                              <Truck size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />Shipped
                            </p>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => navigate(`/admin/auction-orders/${order.id}`)}
                              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.06)', color: '#a855f7', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                              title="View Details">
                              <Eye size={14} />
                            </button>
                            {['cancelled', 'failed'].includes(order.status) && (
                              <button onClick={(e) => handleTrashOrder(order.id, e)}
                                style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.06)', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                title="Move to Trash">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination.last_page > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, fontWeight: 600 }}>
                    Showing {orders.length} of {pagination.total} orders
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => handlePageChange(pagination.current_page - 1)} disabled={pagination.current_page === 1}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'white', color: pagination.current_page === 1 ? '#d1d5db' : '#374151', cursor: pagination.current_page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', minWidth: 60, textAlign: 'center' }}>
                      {pagination.current_page} / {pagination.last_page}
                    </span>
                    <button onClick={() => handlePageChange(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'white', color: pagination.current_page === pagination.last_page ? '#d1d5db' : '#374151', cursor: pagination.current_page === pagination.last_page ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <TrashedOrdersModal
        isOpen={showTrash}
        onClose={() => setShowTrash(false)}
        isSuperAdmin={isSuperAdmin}
        onRestored={() => fetchOrders(pagination.current_page)}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}