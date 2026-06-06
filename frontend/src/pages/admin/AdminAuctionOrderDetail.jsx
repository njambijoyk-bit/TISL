import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Edit, Trash2, Save, X, Package, Clock,
  Users, AlertTriangle, Gavel, Shield, TrendingUp,
  CreditCard, Truck, XCircle, Activity, Settings,
  CheckCircle, Plus, Minus, ShoppingCart, ChevronDown,
  ChevronUp, Ban, RotateCcw, FileText, Send, DollarSign,
  MapPin, Phone, Mail, ChevronRight, RefreshCw, User,
} from 'lucide-react';
import auctionsAPI from '../../api/auctions';
import paymentsAPI from '../../api/payments';

const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb',
  borderRadius: 10, fontSize: '0.875rem', color: '#111827',
  background: 'white', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
};

const statusConfig = {
  pending:    { color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' },
  confirmed:  { color: '#2563eb', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', dot: '#3b82f6' },
  processing: { color: '#7c3aed', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)', dot: '#8b5cf6' },
  delivered:  { color: '#059669', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', dot: '#10b981' },
  failed:     { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.25)', dot: '#ef4444' },
  cancelled:  { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', dot: '#9ca3af' },
};

const paymentStatusConfig = {
  pending:        { color: '#d97706', label: 'Pending' },
  confirmed:      { color: '#2563eb', label: 'Confirmed' },
  partially_paid: { color: '#7c3aed', label: 'Partial' },
  paid:           { color: '#059669', label: 'Paid' },
  overpayment:    { color: '#0891b2', label: 'Overpaid' },
  refunded:       { color: '#6b7280', label: 'Refunded' },
  unpaid:         { color: '#9ca3af', label: 'Unpaid' },
};

const StatusBadge = ({ status, type = 'order' }) => {
  const config = type === 'order' ? statusConfig[status] : paymentStatusConfig[status];
  if (!config) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 99,
      background: config.bg || config.color + '12',
      border: `1px solid ${config.border || config.color + '30'}`,
      fontSize: '0.72rem', fontWeight: 800, color: config.color,
      textTransform: 'uppercase', letterSpacing: '0.06em'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.dot || config.color }} />
      {config.label || status}
    </span>
  );
};

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color="#a855f7" />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a855f7', margin: 0 }}>{children}</p>
  </div>
);

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'white',
    border: `1px solid ${accent ? 'rgba(168,85,247,0.2)' : '#f3f4f6'}`,
    borderRadius: 16, overflow: 'hidden',
    boxShadow: accent ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>{children}</div>
);

const ActionBtn = ({ children, onClick, variant = 'primary', icon: Icon, disabled }) => {
  const variants = {
    primary: { background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', border: 'none' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb' },
    success: { background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.2)' },
    danger:  { background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1.5px solid rgba(239,68,68,0.2)' },
    warning: { background: 'rgba(245,158,11,0.08)', color: '#d97706', border: '1.5px solid rgba(245,158,11,0.2)' },
    ghost:   { background: 'transparent', color: '#6b7280', border: 'none' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant], display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 10, fontSize: '0.78rem',
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 150ms', whiteSpace: 'nowrap'
    }}>
      {Icon && <Icon size={14} />}{children}
    </button>
  );
};

const Modal = ({ isOpen, onClose, title, children, maxWidth = 560 }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16, backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth,
        maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
};

const TimelineItem = ({ icon: Icon, title, description, time, color = '#a855f7', isLast = false }) => (
  <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: color + '12', border: `2px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
        <Icon size={14} style={{ color }} />
      </div>
      {!isLast && <div style={{ width: 2, flex: 1, background: '#f3f4f6', marginTop: 4, marginBottom: -8 }} />}
    </div>
    <div style={{ paddingBottom: 20, flex: 1 }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', margin: '0 0 3px' }}>{title}</p>
      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 4px', lineHeight: 1.5 }}>{description}</p>
      {time && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, fontWeight: 600 }}>{time}</p>}
    </div>
  </div>
);

export default function AdminAuctionOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'payments'
  const [activeModal, setActiveModal] = useState(null);
  const [modalData, setModalData] = useState({});
  const [paymentSummary, setPaymentSummary] = useState(null);

const fetchOrder = async () => {
  setLoading(true);
  try {
    const data = await auctionsAPI.getAuctionOrder(id);
    setOrder(data.order);

    // Use the server-computed financials (excludes refunds via getTotalConfirmed)
    if (data.financials) {
      setPaymentSummary({
        total_confirmed_kes:  data.financials.total_paid_kes,
        balance_remaining:    data.financials.balance_kes,
        order_payment_status: data.order?.payment_status,
        payments_count:       null, // fetched separately only when needed
      });
    } else {
      // Fallback: fetch from payments endpoint and filter client-side
      try {
        const payData = await paymentsAPI.getOrderPayments(id, 'auction');
        const allPayments = payData.payments || [];
        const totalConfirmed = allPayments
          .filter(p => p.status === 'confirmed' && p.method !== 'refund')
          .reduce((sum, p) => sum + Number(p.mpesa_amount_confirmed || 0), 0);
        const orderTotal = Number(payData.order_total_kes || 0);

        setPaymentSummary({
          total_confirmed_kes:  totalConfirmed,
          balance_remaining:    Math.max(0, orderTotal - totalConfirmed),
          order_payment_status: payData.order_payment_status,
          payments_count:       allPayments.length,
        });
      } catch { /* silently fail */ }
    }
  } catch (err) {
    toast.error('Failed to load order');
  } finally {
    setLoading(false);
  }
};

  useEffect(() => { fetchOrder(); }, [id]);

  const formatPrice = (price) => `KSh ${Number(price ?? 0).toLocaleString()}`;
  const formatDate = (date) => date ? new Date(date).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const handleUpdateStatus = async () => {
    setSaving(true);
    try {
      await auctionsAPI.updateAuctionOrderStatus(id, {
        status: modalData.status,
        admin_notes: modalData.admin_notes,
      });
      toast.success('Status updated');
      setActiveModal(null);
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

    const handleMarkPaid = async () => {
    setSaving(true);
    try {
        await auctionsAPI.markOrderPaid(id, {
        payment_method: modalData.payment_method,
        payment_reference: modalData.payment_reference,
        });
        toast.success('Order marked as paid');
        setActiveModal(null);
        fetchOrder();
    } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to mark as paid');
    } finally {
        setSaving(false);
    }
    };

    const handleRecordPartial = async () => {
    setSaving(true);
    try {
        await auctionsAPI.recordPartialPayment(id, {
        amount: modalData.partial_amount,
        payment_method: modalData.payment_method,
        payment_reference: modalData.payment_reference,
        });
        toast.success('Partial payment recorded');
        setActiveModal(null);
        fetchOrder();
    } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally {
        setSaving(false);
    }
    };

  const handleShip = async () => {
    setSaving(true);
    try {
      await auctionsAPI.shipAuctionOrder(id, {
        tracking_number: modalData.tracking_number,
        courier_company: modalData.courier_company,
        estimated_delivery_date: modalData.estimated_delivery_date,
      });
      toast.success('Order marked as shipped');
      setActiveModal(null);
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to ship order');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    try {
      await auctionsAPI.cancelAuctionOrder(id, modalData.reason);
      toast.success('Order cancelled');
      setActiveModal(null);
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    setSaving(true);
    try {
      await auctionsAPI.restoreAuctionOrder(id, modalData.reason);
      toast.success('Order restored');
      setActiveModal(null);
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restore failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTrash = async () => {
    if (!window.confirm('Move this order to trash?')) return;
    try {
      await auctionsAPI.trashAuctionOrder(id);
      toast.success('Order moved to trash');
      navigate('/admin/auction-orders');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to trash order');
    }
  };

  const openModal = (type, defaults = {}) => {
    setModalData(defaults);
    setActiveModal(type);
  };

  const getOrderCapabilities = (status) => {
    const transitions = {
        pending:    ['confirmed', 'failed'],
        confirmed:  ['processing', 'failed', 'pending'],
        processing: ['delivered', 'failed', 'pending'],
        delivered:  ['processing', 'failed', 'pending'],
        failed:     ['confirmed', 'pending'],
        cancelled:  [],
    };
    return {
        allowedTransitions: transitions[status] ?? [],
        canShip:           ['confirmed', 'processing'].includes(status),
        canCancel:         !['cancelled', 'delivered'].includes(status),
        canRestore:        status === 'cancelled',
        canTrash:          ['cancelled', 'failed'].includes(status),
        canRecordPayment:  !['cancelled', 'failed'].includes(status),
    };
 };

  const buildTimeline = () => {
    const items = [];
    if (!order) return items;
    items.push({ icon: FileText, title: 'Order Created', description: `Auction order ${order.order_number} was created from winning bid.`, time: formatDate(order.created_at), color: '#a855f7' });
    if (order.confirmed_at) items.push({ icon: CheckCircle, title: 'Order Confirmed', description: 'Order was confirmed and is ready for processing.', time: formatDate(order.confirmed_at), color: '#2563eb' });
    if (order.shipped_at) items.push({ icon: Truck, title: 'Order Shipped', description: order.courier_company ? `Shipped via ${order.courier_company}${order.tracking_number ? ` (Tracking: ${order.tracking_number})` : ''}` : 'Order has been shipped.', time: formatDate(order.shipped_at), color: '#7c3aed' });
    if (order.delivered_at) items.push({ icon: Shield, title: 'Order Delivered', description: 'Order was successfully delivered to the customer.', time: formatDate(order.delivered_at), color: '#059669' });
    if (order.cancelled_at) items.push({ icon: Ban, title: 'Order Cancelled', description: order.cancellation_reason || 'Order was cancelled.', time: formatDate(order.cancelled_at), color: '#dc2626' });
    if (order.paid_at) items.push({ icon: CreditCard, title: 'Payment Received', description: `Payment of ${formatPrice(order.total)} marked as paid.`, time: formatDate(order.paid_at), color: '#059669' });
    return items;
  };

  const { allowedTransitions, canShip, canCancel, canRestore, canTrash, canRecordPayment } = getOrderCapabilities(order?.status);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
      <RefreshCw size={36} style={{ color: '#a855f7', opacity: 0.4, animation: 'spin 1s linear infinite' }} />
      <p style={{ color: '#9ca3af', fontWeight: 600 }}>Loading order...</p>
    </div>
  );

  if (!order) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>Order not found</p>
      <button onClick={() => navigate('/admin/auction-orders')} style={{ color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
        ← Back to orders
      </button>
    </div>
  );

  const timeline = buildTimeline();

  return (
    <>
      <Helmet><title>Order #{order.order_number} | Admin</title></Helmet>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', fontWeight: 600, color: '#9ca3af' }}>
            <button onClick={() => navigate('/admin/auction-orders')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9ca3af', fontWeight: 600, fontSize: '0.875rem', padding: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
            <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Auction Orders
            </button>
            {order.auction_id && (
            <>
                <ChevronRight size={14} />
                <button
                onClick={() => navigate(`/admin/auctions/${order.auction_id}`)}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: '#a855f7', fontWeight: 700, fontSize: '0.875rem',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                }}
                >
                {order.auction?.product?.name
                    ? `${order.auction.product.name}`
                    : `Auction #${order.auction_id}`}
                </button>
            </>
            )}
        </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allowedTransitions.length > 0 && (
              <ActionBtn variant="primary" icon={Edit} onClick={() => openModal('status', { status: allowedTransitions[0], admin_notes: '' })}>
                Update Status
              </ActionBtn>
            )}
            {canShip && (
              <ActionBtn variant="success" icon={Truck} onClick={() => openModal('ship', {})}>
                Mark Shipped
              </ActionBtn>
            )}
            {canRecordPayment && !['paid', 'refunded'].includes(order.payment_status) && (
            <ActionBtn variant="outline" icon={CreditCard} onClick={() => openModal('payment', {
                mode: 'paid',
                payment_method: order.payment_method || '',
                payment_reference: '',
                partial_amount: '',
            })}>
                Payment
            </ActionBtn>
            )}
            {canCancel && (
              <ActionBtn variant="warning" icon={Ban} onClick={() => openModal('cancel', { reason: '' })}>
                Cancel
              </ActionBtn>
            )}
            {canRestore && (
              <ActionBtn variant="success" icon={RotateCcw} onClick={() => openModal('restore', { reason: '' })}>
                Restore
              </ActionBtn>
            )}
            {canTrash && (
              <ActionBtn variant="danger" icon={Trash2} onClick={handleTrash}>
                Trash
              </ActionBtn>
            )}
          </div>
        </div>

        {/* ── Order Summary Bar ── */}
        <div style={{
          background: 'white', borderRadius: 16, border: '1px solid #f3f4f6',
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={22} color="white" />
            </div>
            <div>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>
                Order #{order.order_number}
              </p>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                {order.product_name || order.auction?.product?.name || 'Unknown Product'}
              </h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} type="payment" />
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{formatPrice(order.total)}</p>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0', fontWeight: 600 }}>{order.quantity || 1} item(s)</p>
            </div>
          </div>
        </div>

        {/* ── Payment Quick Stats ── */}
        {paymentSummary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Order Total', value: formatPrice(order.total), color: '#a855f7', icon: DollarSign },
                { 
                label: 'Amount Paid', 
                // If order is cancelled/refunded, paid is 0 — refunds mean money went back
                value: formatPrice(
                    ['cancelled', 'refunded'].includes(order.payment_status) 
                    ? 0 
                    : paymentSummary.total_confirmed_kes
                ), 
                color: '#059669', 
                icon: CheckCircle 
                },
                { 
                label: 'Balance', 
                value: formatPrice(
                    ['cancelled', 'refunded'].includes(order.payment_status) 
                    ? 0 
                    : paymentSummary.balance_remaining
                ), 
                color: ['cancelled', 'refunded'].includes(order.payment_status) 
                    ? '#059669'  // green zero balance on cancelled
                    : paymentSummary.balance_remaining > 0 ? '#dc2626' : '#059669', 
                icon: ['cancelled', 'refunded'].includes(order.payment_status) 
                    ? Shield 
                    : paymentSummary.balance_remaining > 0 ? AlertTriangle : Shield 
                },
              { label: 'Payment Status', value: paymentSummary.order_payment_status, color: '#7c3aed', icon: CreditCard },
            ].map((s, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <div>
                  <p style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', margin: '0 0 2px' }}>{s.value}</p>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #f3f4f6' }}>
          {[
            { key: 'overview', label: 'Overview', icon: FileText },
            { key: 'payments', label: 'Payments', icon: CreditCard },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', border: 'none', background: 'none',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                color: activeTab === tab.key ? '#a855f7' : '#9ca3af',
                borderBottom: activeTab === tab.key ? '2px solid #a855f7' : '2px solid transparent',
                marginBottom: -2, transition: 'all 150ms'
              }}
            >
              <tab.icon size={14} />{tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => navigate(`/admin/auction-orders/${id}/payments`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 14px', border: '1.5px solid rgba(168,85,247,0.2)',
              borderRadius: 10, background: 'rgba(168,85,247,0.06)',
              color: '#a855f7', fontSize: '0.75rem', fontWeight: 700,
              cursor: 'pointer', marginBottom: 8
            }}
          >
            Full Payment Mgmt <ChevronRight size={12} />
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            OVERVIEW TAB
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {/* Product Info */}
              <Panel accent>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={Package}>Product Details</SectionLabel>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {order.product_image || order.auction?.product?.main_image_url ? (
                      <img src={order.product_image || order.auction?.product?.main_image_url} alt="" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 80, height: 80, borderRadius: 12, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Package size={28} style={{ color: '#d1d5db' }} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>{order.product_name || order.auction?.product?.name || 'Unknown Product'}</p>
                      <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 8px' }}>SKU: {order.product_sku || order.auction?.product?.sku || '—'}{order.brand_name ? ` • ${order.brand_name}` : ''}</p>
                      <button onClick={() => navigate(`/admin/auctions/${order.auction_id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#a855f7', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        View Auction <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Customer Info */}
              <Panel>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={User}>Customer</SectionLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800, color: '#a855f7' }}>
                      {(order.customer?.first_name?.[0] || order.customer?.name?.[0] || 'U').toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                        {order.customer?.first_name && order.customer?.last_name ? `${order.customer.first_name} ${order.customer.last_name}` : order.customer?.name || 'Unknown Customer'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Customer ID: #{order.customer_id}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {order.customer?.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#6b7280' }}><Mail size={14} style={{ color: '#a855f7' }} />{order.customer.email}</div>}
                    {order.customer?.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#6b7280' }}><Phone size={14} style={{ color: '#a855f7' }} />{order.customer.phone}</div>}
                  </div>
                </div>
              </Panel>

              {/* Financial Breakdown */}
              <Panel accent>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={DollarSign}>Financials</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Winning Bid', value: formatPrice(order.winning_bid_amount), color: '#6b7280' },
                      { label: 'Charged Amount', value: formatPrice(order.charged_amount), color: '#a855f7', bold: true },
                      { label: 'Quantity', value: order.quantity || 1, color: '#6b7280' },
                      { label: 'Subtotal', value: formatPrice(order.subtotal), color: '#6b7280' },
                      { label: 'Tax (16%)', value: formatPrice(order.tax), color: '#6b7280' },
                      { label: 'Shipping', value: formatPrice(order.shipping_cost), color: '#6b7280' },
                      { label: 'Total', value: formatPrice(order.total), color: '#059669', bold: true, large: true },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: row.large ? '10px 0' : '4px 0', borderTop: row.large ? '1px solid #f3f4f6' : 'none', marginTop: row.large ? 6 : 0 }}>
                        <span style={{ fontSize: row.large ? '0.85rem' : '0.78rem', color: row.large ? '#374151' : '#9ca3af', fontWeight: row.bold || row.large ? 700 : 600 }}>{row.label}</span>
                        <span style={{ fontSize: row.large ? '1.1rem' : '0.82rem', color: row.color, fontWeight: row.bold || row.large ? 800 : 700 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              {/* Shipping Info */}
              <Panel>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={MapPin}>Shipping</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Delivery Address</p>
                      <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, lineHeight: 1.6, fontWeight: 500 }}>{order.shipping_address || 'No address provided'}</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Method</p>
                        <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 600 }}>{order.shipping_method_name || order.delivery_method || '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Payment</p>
                        <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>{order.payment_method || '—'}</p>
                      </div>
                    </div>
                    {order.tracking_number && (
                      <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Truck size={14} style={{ color: '#059669' }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>Tracking Information</span>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: '#374151', margin: '0 0 2px', fontWeight: 600 }}>{order.courier_company} — {order.tracking_number}</p>
                        {order.estimated_delivery_date && <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>Est. delivery: {formatDate(order.estimated_delivery_date)}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Bid Info */}
              <Panel>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={Activity}>Winning Bid</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Bid Amount', value: formatPrice(order.winning_bid_amount), color: '#a855f7' },
                      { label: 'Max Bid', value: formatPrice(order.bid?.max_bid || order.winning_bid_amount), color: '#374151' },
                      { label: 'Bidder', value: order.bid?.bidder?.name || order.customer?.name || 'Unknown', color: '#374151' },
                      { label: 'Placed By', value: order.placed_by?.name || `Admin #${order.placed_by_id}` || 'System', color: '#374151' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 }}>{row.label}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: row.color }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              {/* Notes */}
              <Panel>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={FileText}>Notes</SectionLabel>
                  {order.admin_notes && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Admin Notes</p>
                      <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 10, fontSize: '0.78rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{order.admin_notes}</div>
                    </div>
                  )}
                  {order.customer_notes && (
                    <div>
                      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Customer Notes</p>
                      <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 10, fontSize: '0.78rem', color: '#374151', lineHeight: 1.6 }}>{order.customer_notes}</div>
                    </div>
                  )}
                  {!order.admin_notes && !order.customer_notes && <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0, fontStyle: 'italic' }}>No notes added</p>}
                </div>
              </Panel>
            </div>

            {/* Timeline */}
            <Panel accent>
              <div style={{ padding: 20 }}>
                <SectionLabel icon={Activity}>Order Timeline</SectionLabel>
                {timeline.length > 0 ? (
                  <div style={{ padding: '8px 4px' }}>
                    {timeline.map((item, idx) => (
                      <TimelineItem key={idx} icon={item.icon} title={item.title} description={item.description} time={item.time} color={item.color} isLast={idx === timeline.length - 1} />
                    ))}
                  </div>
                ) : <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0, padding: '20px 0' }}>No activity recorded yet</p>}
              </div>
            </Panel>

            {/* Activity Logs */}
            {order.activity_logs && order.activity_logs.length > 0 && (
              <Panel>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={Activity}>Detailed Activity Logs</SectionLabel>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['Action', 'Description', 'Severity', 'By', 'Date'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {order.activity_logs.map((log, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: log.severity === 'danger' ? '#dc2626' : log.severity === 'success' ? '#059669' : log.severity === 'warning' ? '#d97706' : '#6b7280' }}>{log.action}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#374151', maxWidth: 400 }}>{log.description}</td>
                            <td style={{ padding: '10px 14px' }}><StatusBadge status={log.severity === 'danger' ? 'failed' : log.severity === 'success' ? 'delivered' : log.severity === 'warning' ? 'pending' : 'ended'} size="sm" /></td>
                            <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{log.performed_by || 'System'}</td>
                            <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            PAYMENTS TAB
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'payments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Panel accent>
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <SectionLabel icon={CreditCard}>Payment Management</SectionLabel>
                    <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '-10px 0 0' }}>
                      Manage M-Pesa payments, track status, and handle disputes for this order.
                    </p>
                  </div>
                  <ActionBtn variant="success" icon={CreditCard} onClick={() => navigate(`/admin/auction-orders/${id}/payments`)}>
                    Open Full Payment Page
                  </ActionBtn>
                </div>

                {/* Payment Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Order Total', value: formatPrice(order.total), color: '#a855f7' },
                    { label: 'Amount Paid', value: formatPrice(paymentSummary?.total_confirmed_kes), color: '#059669' },
                    { label: 'Balance Due', value: formatPrice(paymentSummary?.balance_remaining), color: (paymentSummary?.balance_remaining || 0) > 0 ? '#dc2626' : '#059669' },
                    { label: 'Payment Status', value: paymentSummary?.order_payment_status || order.payment_status, color: '#7c3aed' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, margin: '0 0 4px' }}>{s.value}</p>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <ActionBtn variant="success" icon={Send} onClick={() => navigate(`/admin/auction-orders/${id}/payments`)}>
                    Initiate M-Pesa Payment
                  </ActionBtn>
                  <ActionBtn variant="outline" icon={RefreshCw} onClick={() => { fetchOrder(); toast.success('Refreshed'); }}>
                    Refresh Status
                  </ActionBtn>
                </div>
              </div>
            </Panel>

            {/* Payment History Preview */}
            {paymentSummary?.payments_count > 0 && (
              <Panel>
                <div style={{ padding: 20 }}>
                  <SectionLabel icon={CreditCard}>Recent Payment Attempts</SectionLabel>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '-10px 0 16px' }}>
                    View full history and manage disputes on the <button onClick={() => navigate(`/admin/auction-orders/${id}/payments`)} style={{ color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}>payments page</button>.
                  </p>
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS (same as before — status, payment, ship, cancel, restore)
          ═══════════════════════════════════════════════════════════════ */}

      {/* Update Status Modal */}
      <Modal isOpen={activeModal === 'status'} onClose={() => setActiveModal(null)} title="Update Order Status">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>New Status</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allowedTransitions.map(s => (
                <button key={s} onClick={() => setModalData(prev => ({ ...prev, status: s }))} style={{
                  padding: '8px 16px', borderRadius: 10, border: modalData.status === s ? '2px solid #a855f7' : '1.5px solid #e5e7eb',
                  background: modalData.status === s ? 'rgba(168,85,247,0.08)' : 'white', color: modalData.status === s ? '#a855f7' : '#374151',
                  fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize'
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Admin Notes (Optional)</label>
            <textarea value={modalData.admin_notes || ''} onChange={e => setModalData(prev => ({ ...prev, admin_notes: e.target.value }))} placeholder="Add a note about this status change..." rows={3} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn variant="primary" icon={Save} onClick={handleUpdateStatus} disabled={saving}>{saving ? 'Saving...' : 'Update Status'}</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
    <Modal isOpen={activeModal === 'payment'} onClose={() => setActiveModal(null)} title="Record Payment">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Balance info */}
        {paymentSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
            { label: 'Order Total', value: formatPrice(order.total), color: '#a855f7' },
            { label: 'Already Paid', value: formatPrice(paymentSummary.total_confirmed_kes), color: '#059669' },
            { label: 'Balance Due', value: formatPrice(paymentSummary.balance_remaining), color: paymentSummary.balance_remaining > 0 ? '#dc2626' : '#059669' },
            { label: 'Current Status', value: order.payment_status?.replace('_', ' '), color: '#6b7280' },
            ].map((s, i) => (
            <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: s.color, margin: '0 0 2px' }}>{s.value}</p>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{s.label}</p>
            </div>
            ))}
        </div>
        )}

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8 }}>
        {[
            { key: 'paid', label: 'Mark as Paid', desc: 'Covers full remaining balance' },
            { key: 'partial', label: 'Record Partial', desc: 'Enter a specific amount' },
        ].map(m => (
            <button key={m.key} onClick={() => setModalData(prev => ({ ...prev, mode: m.key }))} style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
            border: modalData.mode === m.key ? '2px solid #a855f7' : '1.5px solid #e5e7eb',
            background: modalData.mode === m.key ? 'rgba(168,85,247,0.06)' : 'white',
            }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: modalData.mode === m.key ? '#a855f7' : '#374151', margin: '0 0 2px' }}>{m.label}</p>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{m.desc}</p>
            </button>
        ))}
        </div>

        {/* Partial amount — only shown in partial mode */}
        {modalData.mode === 'partial' && (
        <div>
            <label style={labelStyle}>Amount (KSh) *</label>
            <input
            type="number" min="1"
            value={modalData.partial_amount || ''}
            onChange={e => setModalData(prev => ({ ...prev, partial_amount: e.target.value }))}
            placeholder={`Max: ${formatPrice(paymentSummary?.balance_remaining ?? order.total)}`}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }}
            />
        </div>
        )}

        {/* Mark as paid info box */}
        {modalData.mode === 'paid' && paymentSummary?.balance_remaining > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.15)', fontSize: '0.78rem', color: '#374151' }}>
            A payment record of <strong>{formatPrice(paymentSummary.balance_remaining)}</strong> will be created to cover the remaining balance.
        </div>
        )}

        {/* Method */}
        <div>
        <label style={labelStyle}>Payment Method</label>
        <select value={modalData.payment_method || ''} onChange={e => setModalData(prev => ({ ...prev, payment_method: e.target.value }))}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }}>
            <option value="">— Select —</option>
            <option value="mpesa">M-Pesa</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cod">Cash on Delivery</option>
            <option value="cash">Cash</option>
        </select>
        </div>

        {/* Reference */}
        <div>
        <label style={labelStyle}>Payment Reference</label>
        <input type="text" value={modalData.payment_reference || ''}
            onChange={e => setModalData(prev => ({ ...prev, payment_reference: e.target.value }))}
            placeholder="e.g. MPESA-123456789"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }}
        />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
        {modalData.mode === 'paid' ? (
            <ActionBtn variant="success" icon={CheckCircle} onClick={handleMarkPaid} disabled={saving}>
            {saving ? 'Saving...' : 'Mark as Paid'}
            </ActionBtn>
        ) : (
            <ActionBtn variant="primary" icon={CreditCard} onClick={handleRecordPartial}
            disabled={saving || !modalData.partial_amount || Number(modalData.partial_amount) <= 0}>
            {saving ? 'Saving...' : 'Record Payment'}
            </ActionBtn>
        )}
        </div>
    </div>
    </Modal>

      {/* Ship Order Modal */}
      <Modal isOpen={activeModal === 'ship'} onClose={() => setActiveModal(null)} title="Mark Order as Shipped">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tracking Number *</label>
            <input type="text" value={modalData.tracking_number || ''} onChange={e => setModalData(prev => ({ ...prev, tracking_number: e.target.value }))} placeholder="e.g. TRK-123456789" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Courier Company *</label>
            <input type="text" value={modalData.courier_company || ''} onChange={e => setModalData(prev => ({ ...prev, courier_company: e.target.value }))} placeholder="e.g. G4S, Fargo Courier, etc." style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Estimated Delivery Date</label>
            <input type="date" value={modalData.estimated_delivery_date || ''} onChange={e => setModalData(prev => ({ ...prev, estimated_delivery_date: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn variant="success" icon={Truck} onClick={handleShip} disabled={saving || !modalData.tracking_number || !modalData.courier_company}>{saving ? 'Saving...' : 'Mark Shipped'}</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Cancel Order Modal */}
      <Modal isOpen={activeModal === 'cancel'} onClose={() => setActiveModal(null)} title="Cancel Order">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'rgba(220,38,38,0.06)', borderRadius: 12, border: '1px solid rgba(220,38,38,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <AlertTriangle size={16} style={{ color: '#dc2626' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>Warning</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>Cancelling this order will restore stock. This action cannot be undone from the cancel state without restoring.</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cancellation Reason *</label>
            <textarea value={modalData.reason || ''} onChange={e => setModalData(prev => ({ ...prev, reason: e.target.value }))} placeholder="Why is this order being cancelled?" rows={3} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn variant="danger" icon={Ban} onClick={handleCancel} disabled={saving || !modalData.reason}>{saving ? 'Cancelling...' : 'Confirm Cancel'}</ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Restore Order Modal */}
      <Modal isOpen={activeModal === 'restore'} onClose={() => setActiveModal(null)} title="Restore Order">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <RotateCcw size={16} style={{ color: '#059669' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>Restore Order</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>This will restore the order to "Pending" status and re-deduct stock. Ensure stock is available.</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Reason (Optional)</label>
            <textarea value={modalData.reason || ''} onChange={e => setModalData(prev => ({ ...prev, reason: e.target.value }))} placeholder="Why is this order being restored?" rows={2} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#111827', background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn variant="success" icon={RotateCcw} onClick={handleRestore} disabled={saving}>{saving ? 'Restoring...' : 'Restore Order'}</ActionBtn>
          </div>
        </div>
      </Modal>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
