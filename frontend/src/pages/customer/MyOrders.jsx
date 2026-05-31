import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Eye, EyeOff, RefreshCw, Filter, Search, X, LayoutGrid, List } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import OrderCard from '../../components/orders/OrderCard';
import OrdersTable from '../../components/orders/OrdersTable';
import AdminPagination from '../../components/common/AdminPagination';
import Button from '../../components/common/Button';
import useOrderStore from '../../store/orderStore';
import toast from 'react-hot-toast';

const STATUS_TABS = [
  { id: 'all',       label: 'Recent' },
  { id: 'pending',   label: 'Pending',   color: '#f59e0b' },
  { id: 'confirmed', label: 'Confirmed', color: '#3b82f6' },
  { id: 'delivered', label: 'Delivered', color: '#10b981' },
];

export default function MyOrders() {
  const navigate = useNavigate();
  const { orders, loading, fetchMyOrders, cancelOrder, restoreCustomerOrder, ordersView, setOrdersView } = useOrderStore();

  const [showCancelled, setShowCancelled]   = useState(false);
  const [statusFilter, setStatusFilter]     = useState('all');
  const [cancelModal, setCancelModal]       = useState(null);
  const [cancelReason, setCancelReason]     = useState('');
  const [searchQuery, setSearchQuery]       = useState('');

  // Add near your other useState calls (after searchQuery, etc.)
  const [currentPage, setCurrentPage] = useState(1);

  // Update loadOrders to accept and use page parameter
  const loadOrders = async (page = 1) => {
    try {
      await fetchMyOrders({ page, per_page: 10 }); // ✅ Pass pagination params
    } catch {
      toast.error('Failed to load orders');
    }
  };

  // Add page change handler
  const handlePageChange = (page) => {
    setCurrentPage(page);
    loadOrders(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset page when filters change (update your existing useEffect)
  useEffect(() => {
    setCurrentPage(1);  // ✅ Reset to page 1
    loadOrders(1);
  }, [statusFilter, showCancelled]); // Add dependencies that affect the list

  const allOrders          = Array.isArray(orders) ? orders : orders?.data || [];
  const cancelledOrders    = allOrders.filter(o => o.status === 'cancelled');
  const nonCancelledOrders = allOrders.filter(o => o.status !== 'cancelled');
  const shouldShowToggle   = cancelledOrders.length > 0 && nonCancelledOrders.length > 0;

  const displayOrders = useMemo(() => {
    let result = shouldShowToggle && !showCancelled ? nonCancelledOrders : allOrders;
    if (statusFilter !== 'all') result = result.filter(o => o.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q) ||
        o.items?.some(item =>
          item.product_name?.toLowerCase().includes(q) ||
          item.name?.toLowerCase().includes(q)
        )
      );
    }
    return result;
  }, [allOrders, showCancelled, statusFilter, searchQuery]);

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a cancellation reason'); return; }
    try {
      await cancelOrder(cancelModal.id, cancelReason);
      toast.success('Order cancelled successfully');
      setCancelModal(null); setCancelReason('');
      await loadOrders();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to cancel order'); }
  };

  const handleRestoreOrder = async (orderId) => {
    if (!window.confirm('Restore this order? Stock will be reserved again.')) return;
    try { await restoreCustomerOrder(orderId); toast.success('Order restored'); await loadOrders(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to restore order'); }
  };

  const clearSearch = () => { setSearchQuery(''); };

  if (loading && allOrders.length === 0) return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex-1 flex items-center justify-center"><LoadingSpinner size="lg" /></div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 px-4 sm:px-6 pt-8 pb-4"
        style={{ borderBottom: '2px solid rgba(168,85,247,0.2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#c084fc' }}>Account</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">My Orders</h1>
              <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500">
                {allOrders.length} order{allOrders.length !== 1 ? 's' : ''} total
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginTop: 4 }}>
              {/* View toggle */}
              <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.2)' }}>
                <button
                  type="button"
                  onClick={() => setOrdersView('card')}
                  title="Card view"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 40, height: 40, cursor: 'pointer', border: 'none', transition: 'all 150ms',
                    background: ordersView === 'card' ? 'rgba(168,85,247,0.12)' : 'transparent',
                    color: ordersView === 'card' ? '#a855f7' : '#c084fc',
                  }}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setOrdersView('table')}
                  title="Table view"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 40, height: 40, cursor: 'pointer', border: 'none',
                    borderLeft: '1px solid rgba(168,85,247,0.2)', transition: 'all 150ms',
                    background: ordersView === 'table' ? 'rgba(168,85,247,0.12)' : 'transparent',
                    color: ordersView === 'table' ? '#a855f7' : '#c084fc',
                  }}
                >
                  <List size={17} />
                </button>
              </div>

              {/* Show / Hide Cancelled */}
              {shouldShowToggle && (
                <button
                  onClick={() => setShowCancelled(v => !v)}
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '0 14px', height: 40, borderRadius: 12, cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: 700, transition: 'all 150ms',
                    ...(showCancelled
                      ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }
                      : { background: 'transparent', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc' }),
                  }}
                >
                  {showCancelled
                    ? <><EyeOff size={14} /> Hide Cancelled ({cancelledOrders.length})</>
                    : <><Eye size={14} /> Show Cancelled ({cancelledOrders.length})</>}
                </button>
              )}
            </div>
          </div>

          {/* ── Search bar (always visible) ───────────────────────────── */}
          <div className="mb-4">
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#c084fc', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by order number, status, or product…"
                style={{
                  width: '100%', padding: '10px 40px', borderRadius: 10,
                  border: '1.5px solid rgba(168,85,247,0.2)', fontSize: '0.85rem',
                  outline: 'none', background: 'white', color: '#111827', boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                onBlur={e =>  { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
              {searchQuery && (
                <button type="button" onClick={clearSearch}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#c084fc', display: 'flex' }}>
                  <X size={15} />
                </button>
              )}
            </div>
            {searchQuery && (
              <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#c084fc' }}>
                {displayOrders.length} result{displayOrders.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            )}
          </div>

          {/* ── Pill tab bar ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {STATUS_TABS.map(({ id, label, color }) => {
              const active      = statusFilter === id;
              const count       = id === 'all' ? allOrders.length : allOrders.filter(o => o.status === id).length;
              const activeColor = color || '#a855f7';
              return (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '11px 16px', border: 'none', cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap',
                    fontSize: '0.82rem', fontWeight: 700,
                    color: active ? activeColor : '#9ca3af',
                    borderBottom: active ? `2.5px solid ${activeColor}` : '2.5px solid transparent',
                    transition: 'all 150ms',
                  }}
                >
                  {color && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? activeColor : '#d1d5db', flexShrink: 0 }} />
                  )}
                  {label}
                  <span style={{
                    minWidth: 18, padding: '1px 5px', borderRadius: 9999, fontSize: '0.65rem', fontWeight: 800,
                    background: active ? `${activeColor}18` : '#f3f4f6',
                    color: active ? activeColor : '#9ca3af',
                    transition: 'all 150ms',
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }} className="w-full px-4 sm:px-6 py-6 sm:py-8 pb-16 flex-1">

        {/* Hidden cancelled notice */}
        {shouldShowToggle && !showCancelled && (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <Eye size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af', fontWeight: 500 }}>
              {cancelledOrders.length} cancelled order{cancelledOrders.length !== 1 ? 's are' : ' is'} hidden.{' '}
              <button
                onClick={() => setShowCancelled(true)}
                type="button"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1e40af', fontWeight: 700, textDecoration: 'underline', fontSize: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'none'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'underline'}
              >
                Show them
              </button>
            </p>
          </div>
        )}

        {/* Empty — no orders at all */}
        {allOrders.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl"
            style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(168,85,247,0.08)' }}>
              <Package size={28} color="#c084fc" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No Orders Yet</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">You haven't placed any orders yet. Start shopping to see them here.</p>
            <Button onClick={() => navigate('/products')}>Browse Products</Button>
          </div>

        /* Empty — search/filter mismatch */
        ) : displayOrders.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl"
            style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(168,85,247,0.08)' }}>
              {searchQuery ? <Search size={28} color="#c084fc" /> : <Filter size={28} color="#c084fc" />}
            </div>
            <h3 className="text-lg font-bold text-secondary mb-2">
              {searchQuery ? 'No Results Found' : 'No Orders Found'}
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
              {searchQuery
                ? `No orders match "${searchQuery}".`
                : 'No orders match the current filter.'}
            </p>
            <Button variant="outline" onClick={() => { setStatusFilter('all'); setShowCancelled(false); clearSearch(); }}>
              Clear Filters
            </Button>
          </div>

        /* Orders — card or table */
        ) : (
          ordersView === 'table' ? (
            <OrdersTable
              orders={displayOrders}
              onCancel={(orderId) => setCancelModal(allOrders.find(o => o.id === orderId))}
            />
          ) : (
          <div className="grid gap-4 sm:gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))' }}>
            {displayOrders.map(order => (
              <div key={order.id}>
                <OrderCard
                  order={order}
                  onCancel={(orderId) => setCancelModal(allOrders.find(o => o.id === orderId))}
                />

                {/* Restore — cancelled + unpaid */}
                {order.status === 'cancelled' && order.payment_status === 'unpaid' && (
                  <div className="mt-3 flex items-start gap-3 p-4 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <RefreshCw size={14} color="#10b981" className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-1">Want to restore this order?</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-3">We'll reserve the stock again for you.</p>
                      <button
                        onClick={() => handleRestoreOrder(order.id)}
                        type="button"
                        className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}
                      >
                        Restore Order
                      </button>
                    </div>
                  </div>
                )}

                {/* Cancelled + paid — contact support */}
                {order.status === 'cancelled' && order.payment_status !== 'unpaid' && (
                  <div className="mt-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.25)' }}>
                    <p className="text-xs text-orange-800 dark:text-orange-200">
                      This paid order cannot be restored online. Please contact support if you need assistance.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          )
        )}
      </div>

      {/* After the orders grid, before the Cancel Modal */}
      {displayOrders.length > 0 && (
        <>
          {/* Debug log (optional, remove later) */}
          {(() => { console.log('📦 Customer pagination:', useOrderStore.getState().pagination); return null; })()}
          
          {/* Pagination component */}
          {useOrderStore.getState().pagination?.last_page > 1 && (
            <div className="mt-8">
              <AdminPagination 
                pagination={useOrderStore.getState().pagination} 
                onPageChange={handlePageChange} 
              />
            </div>
          )}
        </>
      )}

      {/* ── Cancel Modal ─────────────────────────────────────────────────── */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>

            {/* Purple accent bar — matches detail page */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />

            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#c084fc' }}>Action</p>
              <h3 className="text-lg font-bold mb-4" style={{ color: '#111827' }}>
                Cancel <span style={{ color: '#a855f7' }}>{cancelModal.order_number}</span>
              </h3>

              <div className="flex items-start gap-3 p-3 rounded-xl mb-4"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444' }}>
                <span className="flex-shrink-0">⚠️</span>
                <p className="text-sm m-0" style={{ color: '#b91c1c' }}>
                  Cancelling this order will restore stock for all items.
                </p>
              </div>

              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                Cancellation Reason *
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Why are you cancelling this order?"
                rows={3}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid rgba(168,85,247,0.2)', fontSize: '0.82rem',
                  outline: 'none', color: '#111827', background: 'white',
                  fontWeight: 500, resize: 'vertical', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                onBlur={e =>  { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              />

              <div className="flex gap-3 mt-5 pt-4" style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                <button
                  onClick={() => { setCancelModal(null); setCancelReason(''); }}
                  type="button"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{ background: 'white', border: '1.5px solid rgba(168,85,247,0.2)', color: '#6b7280' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  type="button"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 4px 12px rgba(239,68,68,0.3)', border: 'none' }}
                >
                  {loading ? 'Cancelling…' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}