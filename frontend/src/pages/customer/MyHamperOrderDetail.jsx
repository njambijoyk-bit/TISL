import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Package, MapPin,
  Tag, Wallet, Star, Info, ExternalLink
} from 'lucide-react';
import hampersAPI from '../../api/hampers';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

function StatusBadge({ status }) {
  const map = {
    pending:    { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
    confirmed:  { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    processing: { bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed' },
    shipped:    { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
    delivered:  { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    cancelled:  { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
    refunded:   { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
  };
  const s = map[status] || { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' };
  return (
    <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {(status || '').toUpperCase()}
    </span>
  );
}

export default function MyHamperOrderDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hampersAPI.getMyHamperOrder(id)
      .then(data => setOrder(data))
      .catch(() => { toast.error('Failed to load order details'); navigate('/hampers/my-orders'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(168,85,247,0.15)', borderTopColor: '#a855f7', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!order) return null;

  const snapshot = order.hamper_snapshot || {};
  const items    = snapshot.items || [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>

      <style>{`
        .hod-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .hod-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Breadcrumb */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/hampers/my-orders')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
        >
          <ChevronLeft size={14} /> My Orders
        </button>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ color: '#a855f7' }}>{order.order_number}</span>
      </nav>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#a855f7' }}>
              {order.order_number}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af' }}>
            Placed {format(new Date(order.created_at), 'MMMM d, yyyy · HH:mm')}
          </p>
        </div>

        {order.order_id && (
          <button
            onClick={() => navigate(`/orders/${order.order_id}`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, background: 'white', border: '1.5px solid rgba(168,85,247,0.3)', color: '#7c3aed', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; e.currentTarget.style.borderColor = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; }}
          >
            <ExternalLink size={14} /> View Payment &amp; Tracking
          </button>
        )}
      </div>

      <div className="hod-grid">

        {/* ── Left col ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Bundle contents */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', overflow: 'hidden' }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.03)' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc' }}>Bundle Contents</p>
            </div>
            <div style={{ padding: '0 20px' }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0', borderBottom: idx === items.length - 1 ? 'none' : '1px solid #f9f5ff' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.15)', flexShrink: 0, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.main_image
                      ? <img src={item.main_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Package size={22} style={{ color: '#d8b4fe' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#a855f7', fontWeight: 600 }}>Qty: {item.quantity}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: '0 0 2px', fontWeight: 800, fontSize: '0.875rem', color: '#a855f7' }}>{fmt(item.price * item.quantity)}</p>
                    <p style={{ margin: 0, fontSize: '0.68rem', color: '#9ca3af' }}>{fmt(item.price)} each</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery address */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MapPin size={15} style={{ color: '#a855f7' }} />
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc' }}>Delivery Address</p>
            </div>
            <div style={{ fontSize: '0.875rem', lineHeight: 1.7, color: '#374151' }}>
              {(order.customer?.first_name || order.customer?.last_name) && (
                <p style={{ margin: '0 0 2px', fontWeight: 700, color: '#111827' }}>
                  {order.customer.first_name} {order.customer.last_name}
                </p>
              )}
              {order.shipping_address?.line1 && <p style={{ margin: 0 }}>{order.shipping_address.line1}</p>}
              {order.shipping_address?.line2 && <p style={{ margin: 0 }}>{order.shipping_address.line2}</p>}
              {(order.shipping_address?.city || order.shipping_address?.country) && (
                <p style={{ margin: 0 }}>{[order.shipping_address.city, order.shipping_address.county, order.shipping_address.country].filter(Boolean).join(', ')}</p>
              )}
            </div>
            {order.shipping_method_name && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Delivery Method</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a855f7' }}>{order.shipping_method_name}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          {order.notes && (
            <div style={{ background: 'rgba(168,85,247,0.03)', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Info size={15} style={{ color: '#a855f7' }} />
                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc' }}>Order Notes</p>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{order.notes}</p>
            </div>
          )}
        </div>

        {/* ── Right col (summary) ────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Order summary */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', overflow: 'hidden' }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />
            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 16px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc' }}>Order Summary</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: '#6b7280' }}>Subtotal</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(order.subtotal)}</span>
                </div>

                {Number(order.vat_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>VAT (16%)</span>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(order.vat_amount)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: '#6b7280' }}>Shipping</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(order.shipping_cost)}</span>
                </div>

                {Number(order.discount_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#059669' }}><Tag size={12} /> Discount</span>
                    <span style={{ fontWeight: 600, color: '#059669' }}>−{fmt(order.discount_amount)}</span>
                  </div>
                )}

                {Number(order.store_credit_used) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#7c3aed' }}><Wallet size={12} /> Store Credit</span>
                    <span style={{ fontWeight: 600, color: '#7c3aed' }}>−{fmt(order.store_credit_used)}</span>
                  </div>
                )}

                <div style={{ height: 1, background: 'rgba(168,85,247,0.15)', margin: '6px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Total</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#a855f7' }}>{fmt(order.total)}</span>
                </div>
              </div>

              {/* Loyalty points */}
              {order.loyalty_points_earned > 0 && (
                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(234,179,8,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Star size={18} fill="#eab308" color="#eab308" />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#92400e' }}>Points Earned</p>
                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#a16207' }}>+{order.loyalty_points_earned}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Promo code */}
          {order.promo_code && (
            <div style={{ background: 'white', borderRadius: 16, border: '1px dashed rgba(168,85,247,0.4)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Tag size={16} style={{ color: '#a855f7' }} />
              </div>
              <div>
                <p style={{ margin: '0 0 1px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Promo Applied</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#111827' }}>{order.promo_code}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}