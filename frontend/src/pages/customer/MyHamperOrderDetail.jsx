import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Package, ShoppingBag, MapPin,
  Tag, Wallet, Star, Clock, FileText, CheckCircle,
  ExternalLink, Info
} from 'lucide-react';
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
    <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {(status || '').toUpperCase()}
    </span>
  );
}

export default function MyHamperOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const data = await hampersAPI.getMyHamperOrder(id);
        setOrder(data);
      } catch {
        toast.error('Failed to load order details');
        navigate('/hampers/my-orders');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [id, navigate]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(124,58,237,0.1)', borderTopColor: '#7c3aed', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!order) return null;

  const snapshot = order.hamper_snapshot || {};
  const items = snapshot.items || [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      
      <button 
        onClick={() => navigate('/hampers/my-orders')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6b7280', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginBottom: 24, padding: 0 }}
      >
        <ChevronLeft size={18} /> Back to My Orders
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: '#111827' }}>Order {order.order_number}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p style={{ margin: 0, color: '#6b7280' }}>
            Placed on {format(new Date(order.created_at), 'MMMM d, yyyy · HH:mm')}
          </p>
        </div>
        
        {order.order_id && (
          <button 
            onClick={() => navigate(`/orders/${order.order_id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12, background: 'white', border: '1.5px solid #dcb6ff', color: '#7c3aed', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.02)'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <ExternalLink size={18} /> View Payment & Tracking
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Bundle Content */}
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bundle Contents</h3>
            </div>
            <div style={{ padding: '0 24px' }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: idx === items.length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', border: '1px solid #f3f4f6', flexShrink: 0 }}>
                    {item.main_image ? (
                        <img src={item.main_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={24} style={{ color: '#d1d5db' }} />
                        </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#111827' }}>{item.name}</p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>Quantity: {item.quantity}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#111827' }}>{fmt(item.price * item.quantity)}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>{fmt(item.price)} each</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e5e7eb', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <MapPin size={20} style={{ color: '#7c3aed' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>Delivery Address</h3>
            </div>
            <div style={{ color: '#4b5563', fontSize: '0.95rem', lineHeight: 1.6 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{order.customer?.first_name} {order.customer?.last_name}</p>
              <p style={{ margin: 0 }}>{order.shipping_address?.line1}</p>
              <p style={{ margin: 0 }}>{order.shipping_address?.city}, {order.shipping_address?.country}</p>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div style={{ background: '#fdfaff', borderRadius: 20, border: '1px solid #e9d5ff', padding: '24px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Info size={18} style={{ color: '#a855f7' }} />
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#7c3aed' }}>Order Updates</h3>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: '#581c87', lineHeight: 1.6 }}>
                {order.notes}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e5e7eb', padding: '24px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '0.9rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Summary</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                <span style={{ color: '#6b7280' }}>Subtotal</span>
                <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(order.subtotal)}</span>
              </div>
              
              {Number(order.discount_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: '#059669' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tag size={14} /> Discount</span>
                  <span style={{ fontWeight: 600 }}>−{fmt(order.discount_amount)}</span>
                </div>
              )}

              {Number(order.vat_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                  <span style={{ color: '#6b7280' }}>VAT (16%)</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(order.vat_amount)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                <span style={{ color: '#6b7280' }}>Shipping</span>
                <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(order.shipping_cost)}</span>
              </div>

              {Number(order.store_credit_used) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: '#7c3aed' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={14} /> Store Credit</span>
                  <span style={{ fontWeight: 600 }}>−{fmt(order.store_credit_used)}</span>
                </div>
              )}

              <div style={{ margin: '12px 0', height: 1, background: '#f3f4f6' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 900, color: '#111827' }}>
                <span>Total</span>
                <span>{fmt(order.total)}</span>
              </div>

              {order.loyalty_points_earned > 0 && (
                <div style={{ marginTop: 16, padding: '12px', borderRadius: 12, background: 'rgba(124,58,237,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Star size={16} fill="#7c3aed" color="#7c3aed" />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>Points Earned</p>
                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#7c3aed' }}>+{order.loyalty_points_earned}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {order.promo_code && (
            <div style={{ background: '#fdfaff', borderRadius: 20, border: '1px dashed #dcb6ff', padding: '20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Tag size={20} style={{ color: '#7c3aed' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>Promo Applied</p>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#111827' }}>{order.promo_code}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
