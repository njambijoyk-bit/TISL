import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, Tag, Clock, AlertCircle, Receipt, CreditCard, Truck } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import hampersAPI from '../../api/hampers';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

// ── Status colour maps ────────────────────────────────────────────────────────
const ORDER_STATUS_COLORS = {
  pending:    { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  text: '#d97706' },
  confirmed:  { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  text: '#2563eb' },
  processing: { bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.3)',  text: '#7c3aed' },
  shipped:    { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  text: '#059669' },
  delivered:  { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.4)',  text: '#047857' },
  cancelled:  { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   text: '#dc2626' },
  failed:     { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   text: '#dc2626' },
};
const PAYMENT_STATUS_COLORS = {
  unpaid:         { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#d97706' },
  partially_paid: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', text: '#2563eb' },
  paid:           { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', text: '#059669' },
  refunded:       { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.3)', text: '#7c3aed' },
  failed:         { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',  text: '#dc2626' },
};

function StatusBadge({ status, map }) {
  const c = map[status] ?? { bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.3)', text: '#6b7280' };
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function HamperCard({ hamper, onClick }) {
  const accent     = hamper.accent_color || '#a855f7';
  const accentFade = `${accent}18`;
  const accentMid  = `${accent}35`;
  const soldOut    = hamper.is_sold_out && !hamper.is_backorderable;
  const atLimit    = hamper.at_purchase_limit;
  const unavailable = soldOut || atLimit;

  return (
    <div
      onClick={unavailable ? undefined : onClick}
      style={{
        borderRadius: 16,
        border: `1.5px solid ${accentMid}`,
        boxShadow: `0 2px 16px ${accentFade}`,
        overflow: 'hidden',
        cursor: unavailable ? 'not-allowed' : 'pointer',
        opacity: unavailable ? 0.7 : 1,
        transition: 'transform 150ms, box-shadow 150ms',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { if (!unavailable) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${accent}30`; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 16px ${accentFade}`; }}
    >
      {/* Cover image */}
      <div style={{ position: 'relative', height: 200, background: accentFade, flexShrink: 0 }}>
        {hamper.cover_image ? (
          <img src={hamper.cover_image} alt={hamper.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={48} style={{ color: accent, opacity: 0.3 }} />
          </div>
        )}

        {/* Status overlays */}
        {soldOut && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ background: '#111827', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em' }}>SOLD OUT</span>
          </div>
        )}
        {!soldOut && hamper.is_sold_out && hamper.is_backorderable && (
          <div style={{ position: 'absolute', top: 12, right: 12 }}>
            <span style={{ background: '#f59e0b', color: 'white', padding: '4px 10px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 800 }}>BACKORDER</span>
          </div>
        )}
        {atLimit && !soldOut && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ background: '#6b7280', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800 }}>LIMIT REACHED</span>
          </div>
        )}

        {/* Accent dot */}
        <div style={{ position: 'absolute', top: 12, left: 12, width: 10, height: 10, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', flex: 1, gap: 10 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: accent }}>{hamper.name}</h3>
          {hamper.description && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {hamper.description}
            </p>
          )}
        </div>

        {/* Items count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: accent }}>
          <ShoppingBag size={12} />
          {hamper.items?.length ?? 0} item{(hamper.items?.length ?? 0) !== 1 ? 's' : ''} included
        </div>

        {/* Validity */}
        {hamper.valid_until && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#f59e0b' }}>
            <Clock size={12} />
            Ends {new Date(hamper.valid_until).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}

        {/* Price + CTA */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${accentFade}` }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: accent }}>{fmt(hamper.price)}</span>
          {!unavailable && (
            <button
              onClick={onClick}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: accent, color: 'white',
                boxShadow: `0 4px 12px ${accent}40`,
                transition: 'opacity 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              View Deal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── My Hamper Order Card ───────────────────────────────────────────────────────
function MyHamperOrderCard({ order, onClick }) {
  const [expanded, setExpanded] = useState(false);

  const hamper = order.hamper;

  const total       = Number(order.total_kes ?? order.total ?? 0);
  const paid        = Number(order.paid_amount ?? 0);
  const balance     = Math.max(0, total - paid);
  const hasPayments = order.payments?.length > 0;

  return (
    <div style={{
      background: 'white', borderRadius: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      border: '1px solid rgba(168,85,247,0.15)',
      borderLeft: '3px solid #a855f7',
      overflow: 'hidden',
    }}>
      {/* ── main row — clickable to open hamper detail ── */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer' }}
        onClick={onClick}
      >
        {/* icon */}
        <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Package size={20} style={{ color: '#d1d5db' }} />
        </div>

        {/* hamper + order info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.825rem', fontWeight: 700, color: '#a855f7', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hamper?.name ?? 'Hamper'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Receipt size={10} style={{ color: '#9ca3af' }} />
            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{order.order_number}</span>
          </div>
        </div>

        {/* amounts + badges */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <StatusBadge status={order.status}         map={ORDER_STATUS_COLORS} />
            <StatusBadge status={order.payment_status} map={PAYMENT_STATUS_COLORS} />
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151' }}>
            {fmt(total)}
          </span>
          {paid > 0 && (
            <span style={{ fontSize: '0.65rem', color: '#059669' }}>
              Paid {fmt(paid)}
              {balance > 0 && <span style={{ color: '#dc2626' }}> · Bal {fmt(balance)}</span>}
            </span>
          )}
        </div>
      </div>

      {/* ── shipping strip ── */}
      {(order.status === 'shipped' || order.status === 'delivered') && order.tracking_number && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderTop: '1px solid rgba(16,185,129,0.15)',
          background: 'rgba(16,185,129,0.04)',
        }}>
          <Truck size={11} style={{ color: '#059669' }} />
          <span style={{ fontSize: '0.67rem', color: '#059669', fontWeight: 600 }}>
            {order.status === 'delivered' ? 'Delivered' : 'Shipped'}
          </span>
          {order.courier_company && <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>· {order.courier_company}</span>}
          <span style={{ fontSize: '0.65rem', color: '#374151', marginLeft: 2 }}>#{order.tracking_number}</span>
        </div>
      )}

      {/* ── payment history toggle ── */}
      {hasPayments && (
        <>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderTop: '1px solid #f3f4f6', cursor: 'pointer', background: expanded ? 'rgba(168,85,247,0.02)' : 'transparent' }}
            onClick={() => setExpanded(e => !e)}
          >
            <CreditCard size={11} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#a855f7', flex: 1 }}>
              {order.payments.length} payment{order.payments.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '0.6rem', color: '#9ca3af', userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
          </div>

          {expanded && (
            <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 5, borderTop: '1px solid rgba(168,85,247,0.08)' }}>
              {order.payments.map((pmt, i) => {
                const isRefund  = pmt.method === 'refund';
                const pmtAmount = Number(pmt.mpesa_amount_confirmed ?? pmt.amount_received ?? 0);
                const ref       = pmt.mpesa_receipt_number ?? pmt.payment_number;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: 8,
                    background: isRefund ? 'rgba(6,182,212,0.05)' : '#f9fafb',
                    border: isRefund ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isRefund ? '#0891b2' : '#374151' }}>
                        {isRefund ? '−' : ''}{fmt(pmtAmount)}
                      </span>
                      {isRefund && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#0891b2', background: 'rgba(6,182,212,0.1)', padding: '1px 5px', borderRadius: 99 }}>REFUND</span>
                      )}
                      {ref && <span style={{ fontSize: '0.63rem', color: '#9ca3af' }}>{ref}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <StatusBadge status={pmt.status} map={PAYMENT_STATUS_COLORS} />
                      <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>
                        {new Date(pmt.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function HamperListPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [hampers, setHampers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myOrders, setMyOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login?redirect=/hampers'); return; }
    hampersAPI.getPublicHampers()
      .then(data => setHampers(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => toast.error('Failed to load hampers'))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    hampersAPI.getMyHamperOrders()
      .then(data => setMyOrders(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => setMyOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [isAuthenticated]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: '40px 24px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, background: 'rgba(168,85,247,0.08)', marginBottom: 12 }}>
            <Tag size={14} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Exclusive Deals</span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#a855f7', margin: '0 0 8px' }}>Hamper Deals</h1>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: 0 }}>Curated bundles selected just for you</p>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 40, height: 40, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : hampers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <Package size={52} style={{ color: 'rgba(168,85,247,0.2)', display: 'block', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>No hampers available</h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Check back soon for exclusive deals</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {hampers.map(hamper => (
              <HamperCard
                key={hamper.id}
                hamper={hamper}
                onClick={() => navigate(`/hampers/${hamper.slug}`)}
              />
            ))}
          </div>
        )}

        {/* ── MY HAMPER ORDERS — renders regardless of hampers availability ── */}
        {!ordersLoading && myOrders.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Receipt size={18} style={{ color: '#a855f7' }} />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>My Hamper Orders</h2>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99,
                background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7',
              }}>
                {myOrders.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myOrders.map(order => (
                <MyHamperOrderCard
                  key={order.id}
                  order={order}
                  onClick={() => order.hamper?.slug && navigate(`/hampers/${order.hamper.slug}`)}
                />
              ))}
            </div>
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
}