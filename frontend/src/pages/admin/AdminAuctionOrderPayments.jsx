
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CreditCard, RefreshCw, Phone, Send, X, CheckCircle,
  AlertTriangle, Clock, Ban, RotateCcw, FileText, DollarSign,
  Shield, TrendingUp, User, Package, ChevronRight, Copy, Check
} from 'lucide-react';
import auctionsAPI from '../../api/auctions';
import paymentsAPI from '../../api/payments';

const statusConfig = {
  pending:    { color: '#d97706', bg: 'rgba(245,158,11,0.08)', label: 'Pending', icon: Clock },
  confirmed:  { color: '#059669', bg: 'rgba(16,185,129,0.08)', label: 'Confirmed', icon: CheckCircle },
  failed:     { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', label: 'Failed', icon: AlertTriangle },
  cancelled:  { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', label: 'Cancelled', icon: Ban },
  refunded:   { color: '#0891b2', bg: 'rgba(6,182,212,0.08)', label: 'Refunded', icon: RotateCcw },
};

const StatusBadge = ({ status, size = 'md' }) => {
  const config = statusConfig[status] || statusConfig.pending;
  const isSmall = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: isSmall ? '3px 10px' : '5px 12px', borderRadius: 99,
      background: config.bg, color: config.color,
      fontSize: isSmall ? '0.7rem' : '0.75rem', fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: '0.06em'
    }}>
      <config.icon size={isSmall ? 11 : 13} />
      {config.label}
    </span>
  );
};

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color="#a855f7" />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a855f7', margin: 0 }}>
      {children}
    </p>
  </div>
);

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'white', borderRadius: 16,
    border: `1px solid ${accent ? 'rgba(168,85,247,0.2)' : '#f3f4f6'}`,
    overflow: 'hidden',
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

const Modal = ({ isOpen, onClose, title, children, maxWidth = 480 }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16, backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
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

export default function AdminAuctionOrderPayments() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pollingPaymentId, setPollingPaymentId] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [modalData, setModalData] = useState({});
  const [copied, setCopied] = useState(false);

  const fetchOrder = async () => {
    try {
      const data = await auctionsAPI.getAuctionOrder(id);
      setOrder(data.order);
    } catch (err) {
      toast.error('Failed to load order');
    }
  };

    const fetchPayments = async () => {
        try {
            const data = await paymentsAPI.getOrderPayments(id, 'auction');
            const allPayments = data.payments || [];
            setPayments(allPayments);

            // Recompute — never count refund records in "paid"
            const totalConfirmed = allPayments
            .filter(p => p.status === 'confirmed' && p.method !== 'refund')
            .reduce((sum, p) => sum + Number(p.mpesa_amount_confirmed || 0), 0);

            const orderTotal = Number(data.order_total_kes || 0);

            setPaymentSummary({
            order_total_kes:      orderTotal,
            total_confirmed_kes:  totalConfirmed,
            balance_remaining:    Math.max(0, orderTotal - totalConfirmed),
            order_payment_status: data.order_payment_status,
            });
        } catch (err) {
            toast.error('Failed to load payments');
        }
    };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchOrder(), fetchPayments()]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [id]);

  // Poll pending payment status
  useEffect(() => {
    if (!pollingPaymentId) return;
    const interval = setInterval(async () => {
      try {
        const data = await paymentsAPI.pollPaymentStatus(pollingPaymentId);
        if (data.status !== 'pending') {
          setPollingPaymentId(null);
          fetchPayments();
          if (data.status === 'confirmed') toast.success('Payment confirmed!');
          else if (data.status === 'failed') toast.error('Payment failed: ' + (data.failure_reason || 'Unknown'));
        }
      } catch {
        // Silently fail poll
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingPaymentId]);

  const formatPrice = (price) => `KSh ${Number(price ?? 0).toLocaleString()}`;
  const formatDate = (date) => date ? new Date(date).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const handleInitiatePayment = async () => {
    try {
      const result = await paymentsAPI.initiateAuctionPayment(id, {
        phone_override: modalData.phone_override || undefined,
        phone_override_reason: modalData.phone_override_reason || undefined,
        is_partial: modalData.is_partial || false,
        partial_amount: modalData.partial_amount ? parseFloat(modalData.partial_amount) : undefined,
        notes: modalData.notes || undefined,
      });
      toast.success(result.message || 'Payment request sent!');
      setPollingPaymentId(result.payment_id);
      setActiveModal(null);
      setModalData({});
      fetchPayments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initiate payment');
    }
  };

  const handleCancelPayment = async () => {
    try {
      await paymentsAPI.cancelPayment(modalData.paymentId, modalData.reason);
      toast.success('Payment cancelled');
      setActiveModal(null);
      fetchPayments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed');
    }
  };

  const handleRetryPayment = async () => {
    try {
      const result = await paymentsAPI.retryPayment(modalData.paymentId, {
        notes: modalData.notes || undefined,
      });
      toast.success('Retry payment request sent!');
      setPollingPaymentId(result.payment_id);
      setActiveModal(null);
      fetchPayments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    }
  };

  const handleRaiseDispute = async () => {
    try {
      await paymentsAPI.raiseDispute(modalData.paymentId, modalData.reason);
      toast.success('Dispute raised');
      setActiveModal(null);
      fetchPayments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to raise dispute');
    }
  };

  const handleQueryDaraja = async (paymentId) => {
    try {
      const result = await paymentsAPI.queryDaraja(paymentId);
      toast.success(result.message);
      fetchPayments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Query failed');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openModal = (type, data = {}) => {
    setModalData(data);
    setActiveModal(type);
  };

  const canInitiate = order && !['cancelled', 'failed', 'delivered'].includes(order.status);
  const hasPending = payments.some(p => p.status === 'pending');
  const outstanding = paymentSummary?.balance_remaining || 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
      <RefreshCw size={36} style={{ color: '#a855f7', opacity: 0.4, animation: 'spin 1s linear infinite' }} />
      <p style={{ color: '#9ca3af', fontWeight: 600 }}>Loading...</p>
    </div>
  );

  return (
    <>
      <Helmet><title>Payments | Order #{order?.order_number}</title></Helmet>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(`/admin/auction-orders/${id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none',
              border: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, fontSize: '0.875rem'
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
              onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
            >
              <ArrowLeft size={16} /> Back to Order
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn variant="outline" icon={RefreshCw} onClick={loadAll}>Refresh</ActionBtn>
            {canInitiate && !hasPending && outstanding > 0 && (
              <ActionBtn variant="success" icon={Send} onClick={() => openModal('initiate', {})}>
                Request Payment
              </ActionBtn>
            )}
          </div>
        </div>

        {/* ── Order Summary ── */}
        <Panel accent>
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CreditCard size={24} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>
                Auction Order #{order?.order_number}
              </p>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                {order?.product_name || order?.auction?.product?.name || 'Unknown Product'}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Order Total</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{formatPrice(paymentSummary?.order_total_kes)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Paid</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669', margin: 0 }}>{formatPrice(paymentSummary?.total_confirmed_kes)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Balance</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: outstanding > 0 ? '#dc2626' : '#059669', margin: 0 }}>
                  {formatPrice(outstanding)}
                </p>
              </div>
            </div>
          </div>
        </Panel>

        {/* ── Progress Bar ── */}
        <Panel>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Payment Progress</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a855f7' }}>
                {paymentSummary?.order_total_kes > 0
                  ? Math.round(((paymentSummary?.total_confirmed_kes || 0) / paymentSummary?.order_total_kes) * 100)
                  : 0}%
              </span>
            </div>
            <div style={{ width: '100%', height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                width: `${paymentSummary?.order_total_kes > 0
                  ? Math.min(100, ((paymentSummary?.total_confirmed_kes || 0) / paymentSummary?.order_total_kes) * 100)
                  : 0}%`,
                height: '100%',
                background: outstanding <= 0 ? '#059669' : '#a855f7',
                borderRadius: 99,
                transition: 'width 500ms ease'
              }} />
            </div>
          </div>
        </Panel>

        {/* ── Payments List ── */}
        <Panel accent>
          <div style={{ padding: 20 }}>
            <SectionLabel icon={CreditCard}>Payment History</SectionLabel>

            {payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af' }}>
                <CreditCard size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontWeight: 600, margin: 0 }}>No payments yet</p>
                <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>Click "Request Payment" to initiate the first M-Pesa STK push</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {payments.map((payment) => (
                  <div key={payment.id} style={{
                    background: payment.status === 'pending' ? 'rgba(245,158,11,0.04)' : 'white',
                    border: `1px solid ${payment.status === 'pending' ? 'rgba(245,158,11,0.15)' : '#f3f4f6'}`,
                    borderRadius: 14, padding: 16,
                    transition: 'all 150ms'
                  }}>
                    {/* Payment Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <StatusBadge status={payment.status} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#111827' }}>
                          #{payment.payment_number}
                        </span>
                        <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', margin: 0, textTransform: 'uppercase' }}>
                            {payment.method === 'refund'
                                ? <span style={{ color: '#0891b2' }}>Refund</span>
                                : payment.method?.replace('_', ' ') || '—'}
                        </p>
                        </div>
                        {payment.is_retry && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#7c3aed', background: 'rgba(139,92,246,0.08)', padding: '2px 8px', borderRadius: 99 }}>
                            RETRY
                          </span>
                        )}
                        {payment.is_partial && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#d97706', background: 'rgba(245,158,11,0.08)', padding: '2px 8px', borderRadius: 99 }}>
                            PARTIAL
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>
                        {formatDate(payment.initiated_at)}
                      </span>
                    </div>

                    {/* Payment Details */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Expected</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#374151', margin: 0 }}>{formatPrice(payment.amount_expected)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Received</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: payment.status === 'confirmed' ? '#059669' : '#374151', margin: 0 }}>
                          {formatPrice(payment.mpesa_amount_confirmed || payment.amount_received)}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Phone</p>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={12} style={{ color: '#a855f7' }} />
                          {payment.phone_number}
                          {payment.phone_overridden && <span style={{ fontSize: '0.6rem', color: '#d97706', fontWeight: 700 }}>(overridden)</span>}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Initiated By</p>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: 0 }}>{payment.initiated_by?.name || 'System'}</p>
                      </div>
                    </div>

                    {/* M-Pesa Receipt */}
                    {payment.mpesa_receipt_number && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', background: 'rgba(16,185,129,0.06)',
                        borderRadius: 10, marginBottom: 12, border: '1px solid rgba(16,185,129,0.1)'
                      }}>
                        <CheckCircle size={14} style={{ color: '#059669' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#059669' }}>
                          M-Pesa Receipt: {payment.mpesa_receipt_number}
                        </span>
                        <button
                          onClick={() => copyToClipboard(payment.mpesa_receipt_number)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669', padding: 2, marginLeft: 'auto' }}
                          title="Copy receipt"
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}

                    {/* Failure Reason */}
                    {payment.failure_reason && payment.status === 'failed' && (
                      <div style={{
                        padding: '8px 12px', background: 'rgba(220,38,38,0.06)',
                        borderRadius: 10, marginBottom: 12, border: '1px solid rgba(220,38,38,0.1)'
                      }}>
                        <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0, fontWeight: 600 }}>
                          <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                          {payment.failure_reason}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {payment.status === 'pending' && (
                        <>
                          <ActionBtn variant="outline" icon={RefreshCw} onClick={() => handleQueryDaraja(payment.id)}>
                            Check Status
                          </ActionBtn>
                          <ActionBtn variant="danger" icon={Ban} onClick={() => openModal('cancel', { paymentId: payment.id })}>
                            Cancel
                          </ActionBtn>
                        </>
                      )}
                      {(payment.status === 'failed' || payment.status === 'cancelled') && outstanding > 0 && (
                        <ActionBtn variant="warning" icon={RotateCcw} onClick={() => openModal('retry', { paymentId: payment.id })}>
                          Retry
                        </ActionBtn>
                      )}
                      {payment.status === 'confirmed' && !payment.hasOpenDispute && (
                        <ActionBtn variant="danger" icon={AlertTriangle} onClick={() => openModal('dispute', { paymentId: payment.id })}>
                          Raise Dispute
                        </ActionBtn>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════════════ */}

      {/* Initiate Payment Modal */}
      <Modal isOpen={activeModal === 'initiate'} onClose={() => setActiveModal(null)} title="Request M-Pesa Payment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 }}>Outstanding Balance</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#dc2626' }}>{formatPrice(outstanding)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 }}>Customer Phone</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>{order?.customer?.phone || '—'}</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Amount (KSh)
            </label>
            <input
              type="number"
              value={modalData.partial_amount || outstanding}
              onChange={e => setModalData(prev => ({ ...prev, partial_amount: e.target.value, is_partial: parseFloat(e.target.value) !== outstanding }))}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.9rem', color: '#111827',
                background: 'white', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '4px 0 0' }}>Leave as full amount or enter partial amount</p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Phone Override (Optional)
            </label>
            <input
              type="text"
              value={modalData.phone_override || ''}
              onChange={e => setModalData(prev => ({ ...prev, phone_override: e.target.value }))}
              placeholder={order?.customer?.phone || '2547XXXXXXXX'}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.9rem', color: '#111827',
                background: 'white', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {modalData.phone_override && (
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Override Reason *
              </label>
              <input
                type="text"
                value={modalData.phone_override_reason || ''}
                onChange={e => setModalData(prev => ({ ...prev, phone_override_reason: e.target.value }))}
                placeholder="Why are you overriding the phone number?"
                style={{
                  width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                  borderRadius: 10, fontSize: '0.9rem', color: '#111827',
                  background: 'white', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Notes (Optional)
            </label>
            <textarea
              value={modalData.notes || ''}
              onChange={e => setModalData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Internal notes about this payment request..."
              rows={2}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.85rem', color: '#111827',
                background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn
              variant="success"
              icon={Send}
              onClick={handleInitiatePayment}
              disabled={!modalData.partial_amount && outstanding <= 0 || (modalData.phone_override && !modalData.phone_override_reason)}
            >
              Send STK Push
            </ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Cancel Payment Modal */}
      <Modal isOpen={activeModal === 'cancel'} onClose={() => setActiveModal(null)} title="Cancel Payment Request">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'rgba(220,38,38,0.06)', borderRadius: 12, border: '1px solid rgba(220,38,38,0.15)' }}>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              Cancelling will stop the M-Pesa STK push. The customer will not be able to complete this payment.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Cancellation Reason *
            </label>
            <textarea
              value={modalData.reason || ''}
              onChange={e => setModalData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Why are you cancelling this payment request?"
              rows={2}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.85rem', color: '#111827',
                background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Back</ActionBtn>
            <ActionBtn variant="danger" icon={Ban} onClick={handleCancelPayment} disabled={!modalData.reason}>
              Confirm Cancel
            </ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Retry Payment Modal */}
      <Modal isOpen={activeModal === 'retry'} onClose={() => setActiveModal(null)} title="Retry Payment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.06)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.15)' }}>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              This will create a new payment request. The previous failed/cancelled payment remains in the history.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Notes (Optional)
            </label>
            <textarea
              value={modalData.notes || ''}
              onChange={e => setModalData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes for this retry..."
              rows={2}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.85rem', color: '#111827',
                background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn variant="warning" icon={RotateCcw} onClick={handleRetryPayment}>
              Retry Payment
            </ActionBtn>
          </div>
        </div>
      </Modal>

      {/* Raise Dispute Modal */}
      <Modal isOpen={activeModal === 'dispute'} onClose={() => setActiveModal(null)} title="Raise Payment Dispute">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'rgba(220,38,38,0.06)', borderRadius: 12, border: '1px solid rgba(220,38,38,0.15)' }}>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              Only raise a dispute if you believe this confirmed payment is fraudulent, incorrect, or needs investigation.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Dispute Reason *
            </label>
            <textarea
              value={modalData.reason || ''}
              onChange={e => setModalData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Describe the issue with this payment..."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: '0.85rem', color: '#111827',
                background: 'white', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <ActionBtn variant="outline" onClick={() => setActiveModal(null)}>Cancel</ActionBtn>
            <ActionBtn variant="danger" icon={AlertTriangle} onClick={handleRaiseDispute} disabled={!modalData.reason}>
              Raise Dispute
            </ActionBtn>
          </div>
        </div>
      </Modal>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
