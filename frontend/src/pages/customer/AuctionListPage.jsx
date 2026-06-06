import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuctionCard from '../../components/products/AuctionCard';
import auctionsAPI from '../../api/auctions';
import { Gavel, Package, Receipt, CreditCard, Truck } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';

// ── Skeleton ──────────────────────────────────────────────────────────────────
const AuctionSkeleton = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: '3px solid #e5e7eb' }}>
    <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, background: '#e5e7eb' }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 12, width: '65%', background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: '85%', background: '#e5e7eb', borderRadius: 6 }} />
    </div>
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ height: 12, width: 56, background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: 40, background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 24, width: 52, background: '#e5e7eb', borderRadius: 20 }} />
    </div>
  </div>
);

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

// ── My Auction Order Card ─────────────────────────────────────────────────────
function MyOrderCard({ order, onClick }) {
  const [expanded, setExpanded] = useState(false);

  const auction  = order.auction;
  const product  = auction?.product;
  const imageUrl = product?.main_image_url ?? null;
  const [imgErr, setImgErr] = useState(false);

  const total      = Number(order.total_kes ?? order.total ?? 0);
  const paid       = Number(order.paid_amount ?? 0);
  const balance    = Math.max(0, total - paid);
  const hasPayments = order.payments?.length > 0;
  const isEnded    = auction?.status === 'ended' || auction?.status === 'cancelled';

  return (
    <div style={{
      background: 'white', borderRadius: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      border: '1px solid rgba(168,85,247,0.15)',
      borderLeft: '3px solid #a855f7',
      overflow: 'hidden',
    }}>
      {/* ── main row — clickable to open auction detail ── */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer' }}
        onClick={onClick}
      >
        {/* thumbnail */}
        <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6' }}>
          {!imgErr && imageUrl
            ? <img src={imageUrl} alt={product?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={20} style={{ color: '#d1d5db' }} /></div>
          }
        </div>

        {/* product + order info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.825rem', fontWeight: 700, color: '#a855f7', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {product?.name ?? 'Auction Item'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Receipt size={10} style={{ color: '#9ca3af' }} />
            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{order.order_number}</span>
            {isEnded && (
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 99 }}>ENDED</span>
            )}
          </div>
        </div>

        {/* amounts + badges */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <StatusBadge status={order.status}         map={ORDER_STATUS_COLORS} />
            <StatusBadge status={order.payment_status} map={PAYMENT_STATUS_COLORS} />
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151' }}>
            KSh {total.toLocaleString()}
          </span>
          {paid > 0 && (
            <span style={{ fontSize: '0.65rem', color: '#059669' }}>
              Paid KSh {paid.toLocaleString()}
              {balance > 0 && <span style={{ color: '#dc2626' }}> · Bal KSh {balance.toLocaleString()}</span>}
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
                        {isRefund ? '−' : ''}KSh {pmtAmount.toLocaleString()}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuctionListPage() {
  const navigate = useNavigate();
  const [auctions, setAuctions]         = useState([]);
  const [myOrders, setMyOrders]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [page, setPage]                 = useState(1);

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        setLoading(true);
        const res = await auctionsAPI.getAllAuctions({ status: 'active', page, per_page: 24 });
        setAuctions(res.data || []);
      } catch { setAuctions([]); }
      finally { setLoading(false); }
    };
    fetchAuctions();
  }, [page]);

  useEffect(() => {
    const fetchMyOrders = async () => {
      try {
        setOrdersLoading(true);
        const res = await auctionsAPI.myAuctionOrders();
        setMyOrders(res.data || []);
      } catch {
        // Not logged in or not a customer — silently skip, section won't render
        setMyOrders([]);
      } finally { setOrdersLoading(false); }
    };
    fetchMyOrders();
  }, []);

  return (
    <>
      <Helmet><title>Live Auctions | TISL</title></Helmet>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="w-full px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Breadcrumb items={[{ label: 'Auctions', href: '/auctions' }]} />

          {/* ── ACTIVE AUCTIONS ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                <Gavel className="text-red-600" /> Live Auctions
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5" style={{ fontSize: '0.85rem' }}>
                {loading ? 'Loading…' : `${auctions.length} active auction${auctions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 99,
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
              color: '#dc2626', fontSize: '0.75rem', fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', animation: 'pulse 1.2s infinite' }} />
              Live Now
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {Array.from({ length: 12 }).map((_, i) => <AuctionSkeleton key={i} />)}
            </div>
          ) : auctions.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">No active auctions right now</h3>
              <p className="text-sm text-gray-400 mt-1 mb-4">Check back soon or browse our products</p>
              <button onClick={() => navigate('/products')} className="text-purple-600 hover:underline text-sm font-medium">
                Browse regular products →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auctions.map(a => <AuctionCard key={a.id} auction={a} />)}
            </div>
          )}

          {/* ── MY AUCTION ORDERS — only renders when customer has orders ── */}
          {!ordersLoading && myOrders.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Receipt size={18} style={{ color: '#a855f7' }} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>My Auction Orders</h2>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99,
                  background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7',
                }}>
                  {myOrders.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myOrders.map(order => (
                  <MyOrderCard
                    key={order.id}
                    order={order}
                    onClick={() => navigate(`/auctions/${order.auction_id}`)}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
        <Footer />
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  );
}