import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Package, ChevronRight, Search, Clock, ExternalLink } from 'lucide-react';
import hampersAPI from '../../api/hampers';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

function StatusBadge({ status }) {
  const map = {
    pending:     { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
    confirmed:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    processing:  { bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed' },
    shipped:     { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
    delivered:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    cancelled:   { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
    refunded:    { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
  };
  const s = map[status] || { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {(status || '').toUpperCase()}
    </span>
  );
}

export default function MyHamperOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);

  const fetchOrders = async (page = 1) => {
    setLoading(true);
    try {
      const res = await hampersAPI.getMyHamperOrders({ page, per_page: 10 });
      setOrders(res.data ?? res);
      setPagination(res.meta ?? res.pagination ?? null);
    } catch {
      toast.error('Failed to load your hamper orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.8rem', fontWeight: 900, color: '#111827' }}>My Hamper Orders</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>Track your exclusive bundle orders and status</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(124,58,237,0.1)', borderTopColor: '#7c3aed', animation: 'spin 0.6s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', background: '#f9fafb', borderRadius: 20, border: '2px dashed #e5e7eb' }}>
          <ShoppingBag size={48} style={{ color: '#d1d5db', margin: '0 auto 16px' }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: '#374151' }}>No orders found</h3>
          <p style={{ margin: '0 0 24px', color: '#6b7280' }}>You haven't placed any hamper orders yet.</p>
          <button onClick={() => navigate('/hampers')} style={{ padding: '10px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
            Browse Hampers
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => (
            <div
              key={order.id}
              onClick={() => navigate(`/hampers/my-orders/${order.id}`)}
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#dcb6ff';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(124,58,237,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Package size={28} style={{ color: '#7c3aed' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, color: '#111827' }}>{order.order_number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', fontWeight: 600 }}>
                  {order.hamper?.name || 'Bundle Offer'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: '0.75rem', color: '#6b7280' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {format(new Date(order.created_at), 'dd MMM yyyy')}</span>
                  <span>{fmt(order.total)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {order.order_id && (
                    <div title="Standard order linked" style={{ padding: '6px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                        <ExternalLink size={16} />
                    </div>
                )}
                <ChevronRight size={20} style={{ color: '#d1d5db' }} />
              </div>
            </div>
          ))}

          {pagination && pagination.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button
                disabled={pagination.current_page === 1}
                onClick={() => fetchOrders(pagination.current_page - 1)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', opacity: pagination.current_page === 1 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <button
                disabled={pagination.current_page === pagination.last_page}
                onClick={() => fetchOrders(pagination.current_page + 1)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', opacity: pagination.current_page === pagination.last_page ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
