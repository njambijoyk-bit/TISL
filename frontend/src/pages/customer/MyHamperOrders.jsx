import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Package, ChevronRight, Search, Clock, ExternalLink } from 'lucide-react';
import hampersAPI from '../../api/hampers';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
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
    <div>
    <Header />
      <div style={{ marginBottom: 32, maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <div></div>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.8rem', fontWeight: 900, color: '#a855f7', marginTop: 8 }}>My Hamper Orders</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem', marginBottom: 4 }}>Track your exclusive bundle orders and status</p>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000, margin: '0 auto' }}>
          {orders.map(order => {
            const snapshot = order.hamper_snapshot || {};
            const accent   = snapshot.accent_color || '#a855f7';
            const image    = snapshot.cover_image  || order.hamper?.cover_image;

            return (
              <div
                key={order.id}
                onClick={() => navigate(`/hampers/my-orders/${order.id}`)}
                style={{
                  background: 'white',
                  border: `1px solid ${accent}40`,
                  borderRadius: 16,
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = accent;
                  e.currentTarget.style.boxShadow = `0 4px 12px ${accent}20`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = `${accent}40`;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Image / fallback icon */}
                <div style={{
                  width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                  background: `${accent}12`,
                  border: `1.5px solid ${accent}30`,
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {image ? (
                    <img src={image} alt={snapshot.name || order.hamper?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Package size={28} style={{ color: accent }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, color: accent }}>{order.order_number}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', fontWeight: 600 }}>
                    {snapshot.name || order.hamper?.name || 'Bundle Offer'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: '0.75rem', color: '#6b7280' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {format(new Date(order.created_at), 'dd MMM yyyy')}
                    </span>
                    <span style={{ color: accent, fontWeight: 700 }}>{fmt(order.total)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {order.order_id && (
                    <div title="Standard order linked" style={{ padding: '6px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                      <ExternalLink size={16} />
                    </div>
                  )}
                  <ChevronRight size={20} style={{ color: accent }} />
                </div>
              </div>
            );
          })}

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
      <Footer />
    </div>
  );
}
