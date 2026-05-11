import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Trash2, Truck, CheckCircle, XCircle, FileText, Package, Star,
  AlertTriangle, RefreshCw, Clock, DollarSign, RotateCcw, Wrench,
  ChevronLeft, MapPin, CreditCard, User, Hash, Calendar, Info, Download,
  Tag, TrendingUp, ArrowUpRight, Zap, Shield, Edit3, Save, ChevronDown, ChevronUp
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import CreateOrderModal from '../../components/admin/CreateOrderModal';
import ReturnItemsModal from '../../components/admin/ReturnItemsModal';
import InitiatePaymentModal from './finance/InitiatePaymentModal';
import paymentsAPI from '../../api/payments';
import useOrderStore from '../../store/orderStore';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Currency helpers ─────────────────────────────────────────────────────────
const SYMBOLS = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
const sym = (c = 'KES') => SYMBOLS[c] || c;
const fmt = (n, d = 2) =>
  new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));

// ─── Tiny shared atoms ────────────────────────────────────────────────────────
const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{
      fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '0.14em', color: purple, margin: 0,
    }}>{children}</p>
  </div>
);

const Pill = ({ children, color = purple, bg }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 9999,
    fontSize: '0.7rem', fontWeight: 700,
    color, background: bg || `${color}18`,
    border: `1px solid ${color}30`,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
    {children}
  </span>
);

const statusColors = {
  pending:          '#f59e0b',
  confirmed:        '#3b82f6',
  processing:       '#8b5cf6',
  ready_for_pickup: '#06b6d4',
  shipped:          '#a855f7',
  delivered:        '#10b981',
  cancelled:        '#ef4444',
  failed:           '#6b7280',
};
const paymentColors = {
  unpaid:           '#f59e0b',
  paid:             '#10b981',
  partially_paid:   '#3b82f6',
  refunded:         '#8b5cf6',
  failed:           '#ef4444',
};

const StatusPill  = ({ s }) => <Pill color={statusColors[s]  || '#9ca3af'}>{s?.replace(/_/g,' ')}</Pill>;
const PaymentPill = ({ s }) => <Pill color={paymentColors[s] || '#9ca3af'}>{s?.replace(/_/g,' ')}</Pill>;

// ─── Card wrapper ─────────────────────────────────────────────────────────────
const Panel = ({ children, style = {}, accent = false, className }) => (
  <div className={className} style={{
    background: 'var(--panel-bg, white)',
    border: `1px solid ${accent ? purpleBd : 'var(--border, #f3f4f6)'}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

// ─── Input style ──────────────────────────────────────────────────────────────
const iStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 9,
  border: '1.5px solid var(--border, #e5e7eb)', fontSize: '0.82rem',
  outline: 'none', color: 'var(--text, #111827)', boxSizing: 'border-box',
  fontWeight: 500, background: 'var(--input-bg, white)',
};
const fIn  = e => { e.currentTarget.style.borderColor = purple; e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)'; e.currentTarget.style.boxShadow = 'none'; };

// ─── Action button ────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md' }) => {
  const variants = {
    primary:  { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    success:  { background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' },
    danger:   { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' },
    outline:  { background: 'transparent', color: 'var(--text-muted,#6b7280)', border: '1.5px solid var(--border,#e5e7eb)', boxShadow: 'none' },
    ghost:    { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
    warning:  { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' },
  };
  const pad = size === 'sm' ? '6px 14px' : '9px 20px';
  const fs  = size === 'sm' ? '0.78rem' : '0.83rem';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      style={{
        ...variants[variant],
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: pad, borderRadius: 10, fontSize: fs,
        fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

// ─── Alert banner ─────────────────────────────────────────────────────────────
const Alert = ({ icon: Icon, color, bg, border, title, children }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 18px', borderRadius: 12,
    background: bg, border: `1px solid ${border}`,
    borderLeft: `4px solid ${color}`,
  }}>
    {Icon && <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 2 }} />}
    <div>
      {title && <p style={{ fontSize: '0.82rem', fontWeight: 700, color, margin: '0 0 4px' }}>{title}</p>}
      <div style={{ fontSize: '0.82rem', color, opacity: 0.85 }}>{children}</div>
    </div>
  </div>
);

// ─── Inline modal ─────────────────────────────────────────────────────────────
const InlineModal = ({ title, subtitle, accentColor = purple, onClose, children }) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 50, padding: 16,
  }}>
    <div style={{
      background: 'white', borderRadius: 20, maxWidth: 520, width: '100%',
      boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '22px 26px 18px', borderBottom: '1px solid #f3f4f6',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg,${accentColor},${accentColor}cc)`,
          borderRadius: '20px 20px 0 0',
        }} />
        <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: accentColor, marginBottom: 4 }}>Action</p>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#111827' }}>{title}</h3>
        {subtitle && <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 4 }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '22px 26px 26px' }}>{children}</div>
    </div>
  </div>
);

// ─── Timeline dot ─────────────────────────────────────────────────────────────
const TimelineDot = ({ color, filled }) => (
  <div style={{
    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
    background: filled ? color : 'transparent',
    border: `2px solid ${color}`,
    boxShadow: filled ? `0 0 0 3px ${color}20` : 'none',
  }} />
);

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { currentOrder: order, loading, fetchOrder, fetchAdminOrder } = useOrderStore();

  const [shipModal,    setShipModal]    = useState(false);
  const [statusModal,  setStatusModal]  = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [returnModal,  setReturnModal]  = useState(false);
  const [restoreModal, setRestoreModal] = useState(false);
  const [editModal, setEditModal] = useState(false);

  const [shipData, setShipData] = useState({ tracking_number: '', courier_company: '', estimated_delivery_date: '' });
  const [newStatus,        setNewStatus]        = useState('');
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [adminNotes,       setAdminNotes]       = useState('');
  const [restoreReason,    setRestoreReason]    = useState('');

  const [subtotal,     setSubtotal]     = useState(0);
  const [tax,          setTax]          = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [discount,     setDiscount]     = useState(0);
  const [total,        setTotal]        = useState(0);
  const [orderType,    setOrderType]    = useState('standard');
  const [trackingNumber,        setTrackingNumber]        = useState('');
  const [courierCompany,        setCourierCompany]        = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [expandedItems, setExpandedItems] = useState({});

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const toggleItemExpansion = (index) => {
    setExpandedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // ── Payment History State ─────────────────────────────────────────────
  const [orderPayments, setOrderPayments] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const isCancelled   = order?.status === 'cancelled';
  const isPaidPending = order?.status === 'pending' && order?.payment_status === 'paid';

  const editableStatuses = ['pending', 'confirmed', 'processing', 'failed'];
  const editablePayments = ['unpaid', 'failed'];
  const canEdit = editableStatuses.includes(order?.status) && editablePayments.includes(order?.payment_status);

  const displayCurrency = order?.currency || 'KES';
  const showKes   = displayCurrency !== 'KES' && Number(order?.exchange_rate_to_kes) > 0;
  const money     = (v, d = 2) => `${sym(displayCurrency)} ${fmt(v, d)}`;
  const kesMoney  = (v) => `KSh ${fmt(v)}`;
  const totalKes    = order?.total_kes    ?? (Number(order?.total    || 0) * Number(order?.exchange_rate_to_kes || 0));
  const subtotalKes = order?.subtotal_kes ?? (Number(order?.subtotal || 0) * Number(order?.exchange_rate_to_kes || 0));
  const exchangeDate = order?.converted_at ? format(new Date(order.converted_at), 'MMM d, yyyy') : null;

  const cancelledDetails = isCancelled && order ? {
    totalRefunded: order.items?.reduce((s, i) => s + (parseFloat(i.refund_amount) || 0), 0) || 0,
    totalReturned: order.items?.reduce((s, i) => s + (parseInt(i.quantity_returned) || 0), 0) || 0,
  } : null;

  const backorderSummary = order?.items?.reduce(
    (acc, item) => { if (item.backorder_quantity > 0) { acc.total += item.backorder_quantity; acc.items.push(item); } return acc; },
    { total: 0, items: [] }
  ) || { total: 0, items: [] };

  // Calculate remaining balance in KES for payment initiation
  const getRemainingBalanceKes = () => {
    if (!order) return 0;
    
    const totalKes = order.total_kes ?? (Number(order.total || 0) * Number(order.exchange_rate_to_kes || 1));
    const confirmedPayments = order.payments?.filter(p => p.status === 'confirmed')
      .reduce((sum, p) => sum + (Number(p.mpesa_amount_confirmed) || 0), 0) || 0;
    
    return Math.max(0, totalKes - confirmedPayments);
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        location.pathname.startsWith('/admin') ? await fetchAdminOrder(id) : await fetchOrder(id);
      } catch { toast.error('Failed to load order'); navigate(location.pathname.startsWith('/admin') ? '/admin/orders' : '/orders'); }
    };
    load();
  }, [id, location.pathname]);

  useEffect(() => {
    if (!order) return;
    setNewStatus(order.status); setNewPaymentStatus(order.payment_status);
    setAdminNotes(order.admin_notes || '');
    setSubtotal(Number(order.subtotal || 0)); setTax(Number(order.tax || 0));
    setShippingCost(Number(order.shipping_cost || 0)); setDiscount(Number(order.discount || 0));
    setTotal(Number(order.total || 0)); setOrderType(order.order_type || 'standard');
    setTrackingNumber(order.tracking_number || ''); setCourierCompany(order.courier_company || '');
    setEstimatedDeliveryDate(order.estimated_delivery_date?.slice(0, 10) || '');
  }, [order]);

  useEffect(() => { setTotal(subtotal - discount + tax + shippingCost); }, [subtotal, tax, shippingCost, discount]);

  // Fetch payment history when order loads
  useEffect(() => {
    if (!order?.id) return;
    
    const loadPayments = async () => {
      setPaymentsLoading(true);
      try {
        const data = await paymentsAPI.getAdminOrderPaymentHistory(order.id);
        setOrderPayments(data);
      } catch (e) {
        console.error('Failed to load payment history:', e);
      } finally {
        setPaymentsLoading(false);
      }
    };
    
    loadPayments();
  }, [order?.id]);

  const run = async (fn, successMsg, extra) => {
    try { const r = await fn(); toast.success(successMsg); if (extra) extra(r); await fetchAdminOrder(id); }
    catch (e) { toast.error(e.response?.data?.message || 'Action failed'); }
  };

  const handleConfirm  = () => run(() => useOrderStore.getState().confirmOrder(id), 'Order confirmed');
  const handleDeliver  = () => run(() => useOrderStore.getState().deliverOrder(id), 'Marked as delivered');
 
  const handleInvoice = async () => {
  try {
    if (!order.invoice_number) {
      await run(() => useOrderStore.getState().generateInvoice(id), 'Invoice generated');
      await fetchAdminOrder(id);
    }

    const o      = useOrderStore.getState().currentOrder;
    const invNum = o?.invoice_number || order.invoice_number || 'INV';
    const doc    = new jsPDF({ unit: 'pt', format: 'a4' });
    const W      = doc.internal.pageSize.getWidth();
    const purple = [168, 85, 247];
    const dark   = [17, 24, 39];
    const gray   = [107, 114, 128];
    const light  = [243, 244, 246];
    const cs     = sym(o?.currency || order.currency || 'KES');
    const cust   = o?.customer || order.customer;
    const items  = o?.items    || order.items   || [];

    // ── Decide whether to show adjustment column ──────────────────────
    const hasItemDiscount = items.some(i => parseFloat(i.discount_amount || 0) > 0.01);
    const hasItemMarkup   = items.some(i => {
      const lineTotal = parseFloat(i.line_total || 0);
      const lineAfter = parseFloat(i.line_total_after_discount || lineTotal);
      return lineAfter > lineTotal + 0.01;
    });
    const showAdjCol = hasItemDiscount || hasItemMarkup;
    const adjLabel   = hasItemMarkup && !hasItemDiscount ? 'MARKUP' : 'DISCOUNT';

    // ── Header band ───────────────────────────────────────────────────
    doc.setFillColor(...purple);
    doc.rect(0, 0, W, 70, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24); doc.setFont('helvetica', 'bold');
    doc.text('PROFORMA INVOICE', 40, 46);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(invNum, W - 40, 38, { align: 'right' });
    doc.setFontSize(8);
    doc.text(`Generated ${format(new Date(), 'MMMM d, yyyy')}`, W - 40, 54, { align: 'right' });

    let y = 96;

    // ── Two-column meta block ─────────────────────────────────────────
    const metaLeft  = 40;
    const metaRight = W / 2 + 10;
    const labelW    = 110;

    const metaLeftRows = [
      ['Order Number', o?.order_number || order.order_number],
      ['Invoice',      invNum],
      ['Date',         format(new Date(o?.created_at || order.created_at), 'MMMM d, yyyy')],
    ];

    const metaRightRows = [
      ['Customer', `${cust?.first_name || ''} ${cust?.last_name || ''}`.trim() || '—'],
      ['Company',  cust?.company_name || '—'],
      ['Email',    cust?.email        || '—'],
      ['Phone',    cust?.phone        || '—'],
      ['Address',  (o?.shipping_address || order.shipping_address || '—').substring(0, 40)],
    ];

    const startY = y;
    doc.setFontSize(9);

    metaLeftRows.forEach(([label, val], i) => {
      const rowY = startY + i * 18;
      doc.setFont('helvetica', 'bold');   doc.setTextColor(...dark); doc.text(label,       metaLeft,          rowY);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray); doc.text(String(val), metaLeft + labelW, rowY);
    });

    metaRightRows.forEach(([label, val], i) => {
      const rowY = startY + i * 18;
      doc.setFont('helvetica', 'bold');   doc.setTextColor(...dark); doc.text(label,       metaRight,          rowY);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray); doc.text(String(val), metaRight + labelW, rowY);
    });

    y = startY + Math.max(metaLeftRows.length, metaRightRows.length) * 18 + 20;

    // Divider
    doc.setDrawColor(...purple);
    doc.setLineWidth(0.5);
    doc.line(40, y, W - 40, y);
    y += 16;

    // ── Column positions ──────────────────────────────────────────────
    // Column order: ITEM | UNIT | ORIG PRICE | UNIT PRICE | QTY | SUBTOTAL | [ADJ] | TOTAL
    // Orig price is derived: line_total / quantity  (gross before any adjustment)
    const COL = showAdjCol ? {
      name:      40,
      uom:       160,
      origPrice: 202,
      unitPrice: 260,
      qty:       318,
      subtotal:  355,
      adj:       413,
      total:     W - 40,
    } : {
      name:      40,
      uom:       170,
      origPrice: 215,
      unitPrice: 278,
      qty:       340,
      subtotal:  385,
      total:     W - 40,
    };

    // ── Table header ──────────────────────────────────────────────────
    doc.setFillColor(...light);
    doc.rect(40, y, W - 80, 22, 'F');
    doc.setTextColor(...purple);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('ITEM',       COL.name      + 4, y + 15);
    doc.text('UNIT',       COL.uom       + 4, y + 15);
    doc.text('ORIG PRICE', COL.origPrice + 4, y + 15);
    doc.text('UNIT PRICE', COL.unitPrice + 4, y + 15);
    doc.text('QTY',        COL.qty       + 4, y + 15);
    doc.text('SUBTOTAL',   COL.subtotal  + 4, y + 15);
    if (showAdjCol) doc.text(adjLabel,   COL.adj      + 4, y + 15);
    doc.text('TOTAL',      COL.total,         y + 15, { align: 'right' });
    y += 22;

    // ── Table rows ────────────────────────────────────────────────────
    doc.setFontSize(8.5);
    items.forEach((item, i) => {
      const nameText  = item.product_name || item.service_name || item.description || 'Item';
      const nameLines = doc.splitTextToSize(nameText, COL.uom - COL.name - 8);
      const rowH      = Math.max(22, nameLines.length * 13 + 8);

      if (y + rowH > 780) { doc.addPage(); y = 40; }

      // Alternating row background
      doc.setFillColor(...(i % 2 === 0 ? [255, 255, 255] : [250, 248, 255]));
      doc.rect(40, y, W - 80, rowH, 'F');

      const midY = y + rowH / 2 + 4;

      const qty      = parseFloat(item.quantity || 1);
      const unitP    = parseFloat(item.unit_price || 0);
      const discAmt  = parseFloat(item.discount_amount || 0);
      const lineTot  = parseFloat(item.line_total || qty * unitP);
      const lineAft  = parseFloat(item.line_total_after_discount || lineTot);

      // Orig unit price — derived from line_total (gross before adjustment) / qty
      const origUnitP   = qty > 0 ? lineTot / qty : unitP;
      const hasDiscount = discAmt > 0.01;
      const hasMarkup   = lineAft > lineTot + 0.01;

      // Item name
      doc.setTextColor(...dark); doc.setFont('helvetica', 'normal');
      doc.text(nameLines, COL.name + 4, y + 13);

      // Unit of measure
      doc.setTextColor(...gray);
      doc.setFontSize(8);
      doc.text(item.unit_of_measure || 'each', COL.uom + 4, midY);

      // Orig price — greyed when it differs from unit price
      doc.setFontSize(8.5);
      if (hasDiscount || hasMarkup) { doc.setTextColor(...gray); }
      else                          { doc.setTextColor(...dark); }
      doc.text(fmt(origUnitP), COL.origPrice + 4, midY);

      // Unit price (the effective selling price)
      doc.setTextColor(...dark);
      doc.text(fmt(unitP), COL.unitPrice + 4, midY);

      // Qty
      doc.setTextColor(...dark);
      doc.text(String(qty), COL.qty + 4, midY);

      // Subtotal (gross line total before adjustment)
      doc.setTextColor(...gray);
      doc.text(fmt(lineTot), COL.subtotal + 4, midY);

      // Adjustment column
      if (showAdjCol) {
        if (hasDiscount) {
          doc.setTextColor(16, 185, 129);                         // green
          doc.text(`-${fmt(discAmt)}`, COL.adj + 4, midY);
        } else if (hasMarkup) {
          doc.setTextColor(249, 115, 22);                         // orange
          doc.text(`+${fmt(lineAft - lineTot)}`, COL.adj + 4, midY);
        } else {
          doc.setTextColor(...gray);
          doc.text('—', COL.adj + 4, midY);
        }
      }

      // Line total (after adjustment)
      doc.setTextColor(...dark); doc.setFont('helvetica', 'bold');
      doc.text(fmt(lineAft), COL.total, midY, { align: 'right' });

      y += rowH;
    });

    // Currency legend
    y += 6;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...gray);
    doc.text(`* All amounts in ${cs} (${o?.currency || order.currency || 'KES'})`, 44, y);
    y += 20;

    // ── Totals block ──────────────────────────────────────────────────
    const totalsX = W - 230;
    const totalsW = 190;

    const totalRows = [
    ['Subtotal',  fmt(o?.subtotal      || order.subtotal)],
    ...(Number(o?.discount || order.discount) > 0
      ? [['Order Discount',    `-${fmt(o?.discount          || order.discount)}`]]          : []),
    ...(Number(o?.referral_discount || order.referral_discount) > 0
      ? [['Referral Discount', `-${fmt(o?.referral_discount || order.referral_discount)}`]] : []),
    ...(Number(o?.promo_discount || order.promo_discount) > 0
      ? [['Promo Discount',    `-${fmt(o?.promo_discount    || order.promo_discount)}`]]    : []),
    ...(Number(o?.store_credit_deduction || order.store_credit_deduction) > 0
      ? [['Store Credit',      `-${fmt(o?.store_credit_deduction || order.store_credit_deduction)}`]] : []),
    ['Tax (16%)', fmt(o?.tax           || order.tax)],
    ['Shipping',  fmt(o?.shipping_cost || order.shipping_cost)],
  ];

    doc.setFontSize(9);
    totalRows.forEach(([label, val]) => {
      if (y > 780) { doc.addPage(); y = 40; }
      doc.setTextColor(...gray); doc.setFont('helvetica', 'normal');
      doc.text(label, totalsX, y);
      doc.setTextColor(...dark); doc.setFont('helvetica', 'bold');
      doc.text(`${cs} ${val}`, totalsX + totalsW, y, { align: 'right' });
      y += 17;
    });

    // ── Total band ────────────────────────────────────────────────────
    y += 4;
    if (y > 780) { doc.addPage(); y = 40; }
    doc.setFillColor(...purple);
    doc.rect(totalsX - 10, y, totalsW + 10, 28, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('TOTAL',                                    totalsX,           y + 19);
    doc.text(`${cs} ${fmt(o?.total || order.total)}`,   totalsX + totalsW, y + 19, { align: 'right' });
    y += 44;

    // ── Footer ────────────────────────────────────────────────────────
    if (y > 780) { doc.addPage(); y = 40; }
    doc.setDrawColor(...purple);
    doc.setLineWidth(1);
    doc.line(40, y, W - 40, y);
    y += 14;
    doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business.', W / 2, y, { align: 'center' });

    doc.save(`${invNum}.pdf`);
    toast.success('Proforma Invoice downloaded');
  } catch (e) {
    console.error(e);
    toast.error(e.response?.data?.message || 'Failed to generate proforma invoice');
  }
};

  const handleShip     = async () => {
    if (!shipData.tracking_number || !shipData.courier_company) return toast.error('Fill all required fields');
    await run(() => useOrderStore.getState().shipOrder(id, shipData), 'Order shipped');
    setShipModal(false); setShipData({ tracking_number: '', courier_company: '', estimated_delivery_date: '' });
  };
  const handleAdminCancel = async (data) => {
    await run(() => useOrderStore.getState().adminCancelOrder(order.id, data), 'Order cancelled');
    setReturnModal(false);
  };
  const handleUpdateStatus = async () => {
    await run(() => useOrderStore.getState().updateOrderStatus(id, { status: newStatus, admin_notes: adminNotes }), 'Status updated');
    setStatusModal(false);
  };
  const handleUpdatePayment = async () => {
    await run(() => useOrderStore.getState().updatePaymentStatus(id, { payment_status: newPaymentStatus, payment_reference: paymentReference }), 'Payment updated');
    setPaymentModal(false);
  };
  const handleSaveTotals  = () => run(() => useOrderStore.getState().updateAdminOrder(order.id, { subtotal, tax, shipping_cost: shippingCost, discount, total, order_type: orderType }), 'Totals saved');
  const handleSaveCourier = () => run(() => useOrderStore.getState().updateAdminOrder(order.id, { tracking_number: trackingNumber||null, courier_company: courierCompany||null, estimated_delivery_date: estimatedDeliveryDate||null }), 'Courier saved');
  const handleClearCourier = () => run(() => useOrderStore.getState().updateAdminOrder(order.id, { tracking_number:null, courier_company:null, estimated_delivery_date:null }), 'Courier cleared', () => { setTrackingNumber(''); setCourierCompany(''); setEstimatedDeliveryDate(''); });
  const handleRestore = async () => {
    await run(() => useOrderStore.getState().restoreOrder(order.id, restoreReason), 'Order restored');
    setRestoreModal(false); setRestoreReason('');
  };
  const handleDelete = async () => {
    if (!window.confirm(`Move order ${order.order_number} to Trash?`)) return;
    try { await useOrderStore.getState().trashOrder(order.id); toast.success('Moved to trash'); navigate('/admin/orders'); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  // ── Loading / not found ─────────────────────────────────────────────────────
  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: `3px solid ${purpleBd}`, borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Loading order…</p>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </AdminLayout>
  );

  if (!order) return (
    <AdminLayout>
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <Package size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#9ca3af', marginBottom: 20 }}>Order not found</p>
        <Btn onClick={() => navigate('/admin/orders')} variant="ghost" icon={<ChevronLeft size={16} />}>Back to Orders</Btn>
      </div>
    </AdminLayout>
  );

  // ── Timeline entries ────────────────────────────────────────────────────────
  const timeline = [
    { label: 'Created',   date: order.created_at,   color: '#9ca3af', filled: true },
    { label: 'Confirmed', date: order.confirmed_at,  color: '#3b82f6' },
    { label: 'Shipped',   date: order.shipped_at,    color: purple },
    { label: 'Delivered', date: order.delivered_at,  color: '#10b981' },
    { label: 'Cancelled', date: order.cancelled_at,  color: '#ef4444' },
  ].filter(t => t.date || t.label === 'Created');

  return (
    <AdminLayout>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform:rotate(360deg); } }

        .order-panel { animation: fadeUp 0.3s ease both; }
        .order-panel:nth-child(1) { animation-delay: 0.03s; }
        .order-panel:nth-child(2) { animation-delay: 0.07s; }
        .order-panel:nth-child(3) { animation-delay: 0.11s; }
        .order-panel:nth-child(4) { animation-delay: 0.15s; }
        .order-panel:nth-child(5) { animation-delay: 0.19s; }

        /* ── Responsive layout ───────────────────────────────── */

        /* Main two-column grid */
        .od-main-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 20px;
          align-items: start;
        }

        /* Page header row */
        .od-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .od-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .od-title {
          font-size: 1.6rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          margin: 0;
          color: #a855f7;
        }
        .od-pills {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        /* Inner grids */
        .od-financials-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .od-shipping-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 20px;
        }
        .od-courier-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .od-item-stats {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        /* ── Tablet (≤ 900px): stack sidebar below content ── */
        @media (max-width: 900px) {
          .od-main-grid {
            grid-template-columns: 1fr;
          }
        }

        /* ── Mobile (≤ 640px) ── */
        @media (max-width: 640px) {
          .od-header {
            flex-direction: column;
          }
          .od-header-actions {
            width: 100%;
          }
          .od-header-actions > * {
            flex: 1 1 calc(50% - 4px);
            justify-content: center;
          }
          .od-title {
            font-size: 1.25rem;
          }
          .od-financials-grid {
            grid-template-columns: 1fr;
          }
          .od-shipping-meta {
            grid-template-columns: 1fr;
          }
          .od-courier-grid {
            grid-template-columns: 1fr;
          }
          .od-item-stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* ── Very small phones (≤ 400px) ── */
        @media (max-width: 400px) {
          .od-header-actions > * {
            flex: 1 1 100%;
          }
          .od-item-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="od-header">
        <div>
          <button
            onClick={() => navigate('/admin/orders')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, padding: 0, marginBottom: 10 }}
          >
            <ChevronLeft size={14} /> Back to Orders
          </button>
          <div className="od-pills">
            <h1 className="od-title">{order.order_number}</h1>
            <StatusPill  s={order.status} />
            <PaymentPill s={order.payment_status} />
            {order.priority === 'urgent' && <Pill color="#ef4444">Urgent</Pill>}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 6 }}>
            Placed {format(new Date(order.created_at), 'MMMM d, yyyy · h:mm a')}
            {order.invoice_number && <span style={{ marginLeft: 8, color: purple, fontWeight: 700 }}>· {order.invoice_number}</span>}
          </p>
        </div>

        <div className="od-header-actions">
          {isCancelled ? (
            <>
              <Btn variant="success" icon={<RefreshCw size={15} />} onClick={() => setRestoreModal(true)}>Restore</Btn>
              <Btn variant="danger"  icon={<Trash2 size={15} />}   onClick={handleDelete}>Move to Trash</Btn>
            </>
          ) : (
            <>
              {order.status === 'pending'    && <Btn variant="success" icon={<CheckCircle size={15} />} onClick={handleConfirm}>Confirm Order</Btn>}
              {(order.status === 'confirmed' || order.status === 'processing') && <Btn variant="primary" icon={<Truck size={15} />} onClick={() => setShipModal(true)}>Ship Order</Btn>}
              {order.status === 'shipped'    && <Btn variant="success" icon={<CheckCircle size={15} />} onClick={handleDeliver}>Mark Delivered</Btn>}
              <Btn variant="danger"  icon={<XCircle size={15} />} onClick={() => setReturnModal(true)}>Cancel Order</Btn>
              {canEdit && (
                <Btn variant="ghost" icon={<Edit3 size={15} />} onClick={() => setEditModal(true)}>
                  Edit Order
                </Btn>
              )}
              <Btn variant="outline" icon={<Trash2  size={15} />} onClick={handleDelete}>Delete</Btn>
            </>
          )}
          <Btn
            variant="ghost"
            icon={order.invoice_number ? <Download size={15} /> : <FileText size={15} />}
            onClick={handleInvoice}
          >
            {order.invoice_number ? 'Download Proforma Invoice' : 'Generate Proforma Invoice'}
          </Btn>
        </div>
      </div>

      {/* ── Alert banners ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {isCancelled && order.cancelled_at && (
          <Panel accent style={{ overflow: 'visible' }}>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <XCircle size={18} color="#ef4444" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#b91c1c', margin: '0 0 4px' }}>Order Cancelled</p>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
                    {format(new Date(order.cancelled_at), 'MMMM d, yyyy · h:mm a')}
                  </p>
                  {order.cancellation_reason && (
                    <p style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8, lineHeight: 1.5 }}>{order.cancellation_reason}</p>
                  )}
                  {cancelledDetails?.totalRefunded > 0 && (
                    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#b91c1c', marginBottom: 8 }}>Refund Summary</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Total Refunded</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#b91c1c' }}>{money(cancelledDetails.totalRefunded)}</span>
                      </div>
                      {cancelledDetails.totalReturned > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                          <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Items Returned</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>{cancelledDetails.totalReturned} unit(s)</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )}
        {backorderSummary.total > 0 && (
          <Alert icon={AlertTriangle} color="#92400e" bg="rgba(245,158,11,0.06)" border="rgba(245,158,11,0.25)" title="Backorder Alert">
            <strong>{backorderSummary.total}</strong> unit(s) on backorder:&nbsp;
            {backorderSummary.items.map((i, idx) => <span key={idx}>{i.product_name} ({i.backorder_quantity}){idx < backorderSummary.items.length - 1 ? ', ' : ''}</span>)}
          </Alert>
        )}
        {isPaidPending && (
          <Alert icon={Zap} color="#1d4ed8" bg="rgba(59,130,246,0.06)" border="rgba(59,130,246,0.25)" title="Payment received — order still pending">
            Payment is marked as <strong>paid</strong> but order is still <strong>pending</strong>. Consider confirming.
          </Alert>
        )}
        {order.customer_notes && (
          <Alert icon={FileText} color="#1d4ed8" bg="rgba(59,130,246,0.06)" border="rgba(59,130,246,0.2)" title="Customer Notes">
            {order.customer_notes}
          </Alert>
        )}
        <Panel className="order-panel">
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
            <SectionLabel icon={Info}>Inventory Handling</SectionLabel>
          </div>

          <div style={{ padding: '16px 22px' }}>
            <p style={{
              fontSize: '0.84rem',
              color: 'var(--text,#374151)',
              lineHeight: 1.75,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}>
              Inventory is updated directly when an order is created. If enough stock is available, the ordered quantity is deducted from the product inventory immediately. If the ordered quantity is greater than the available stock, the system allocates the available quantity and records the remaining quantity as backorder. For example, if stock is 40 and the order quantity is 140, the system fulfills 40 units and places 100 units on backorder.

              Where decimal quantities are used, backorder values are rounded upward before being recorded when the backorder field is stored as a whole number. This means a shortage of 3.1, 3.2, or 3.8 units is recorded as 4 units on backorder. This ensures that fractional shortages are treated as full units for backorder planning and stock follow-up.

              If the order is cancelled before shipment, the allocated stock is returned to inventory, while the backordered quantity remains unfulfilled because it was never deducted from stock. If the order had already been shipped, inventory is adjusted through the return process, where only the quantity entered as returned is restored back into stock.

              If an order has already had some items returned previously, only the remaining items still with the customer can be returned in a future cancellation. For example, if 9 out of 11 items were already returned earlier, only the remaining 2 items can be returned when the order is cancelled again.

              If a cancelled order is restored, the system reapplies the inventory logic based on available stock. Previously returned stock is deducted again, and any quantity that cannot be fulfilled remains on backorder.

              If an order is permanently deleted, the system removes its inventory effect completely and restores the full ordered quantity to stock, including quantities that were previously recorded as backorder. For this reason, deleting an order should only be done when it is truly necessary.
            </p>
          </div>
        </Panel>
      </div>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="od-main-grid">

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Order Items */}
            <Panel className="order-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionLabel icon={Package}>Order Items · {order.items?.length || 0}</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {order.items?.map((item, idx) => {
                  const isService    = item.item_type === 'service' || item.item_type === 'custom_service';
                  const isFee        = item.item_type === 'fee';
                  const lineTotal    = parseFloat(item.line_total || 0);
                  const lineAfterDisc = parseFloat(item.line_total_after_discount || lineTotal);
                  const discAmt      = parseFloat(item.discount_amount || 0);
                  const origPrice    = lineTotal / Math.max(parseFloat(item.quantity || 1), 0.01);
                  const unitPrice    = parseFloat(item.unit_price || 0);
                  const qty          = parseFloat(item.quantity || 1);
                  const hasDiscount  = discAmt > 0.01;
                  const hasMarkup    = unitPrice > origPrice && origPrice > 0;
                  const discPct      = hasDiscount && origPrice > 0 ? ((origPrice - unitPrice) / origPrice * 100).toFixed(1) : 0;
                  const markupPct    = hasMarkup ? ((unitPrice - origPrice) / origPrice * 100).toFixed(1) : 0;
                  const isExpanded   = expandedItems[idx];
                  const ItemIcon     = isFee ? Tag : isService ? Wrench : Package;
                  const itemColor    = isFee ? '#6b7280' : isService ? '#3b82f6' : purple;

                  const completionCfg = {
                    not_started: { color: '#9ca3af', label: 'Not Started' },
                    in_progress:  { color: '#f59e0b', label: 'In Progress' },
                    completed:    { color: '#10b981', label: 'Completed' },
                    on_hold:      { color: '#ef4444', label: 'On Hold' },
                    cancelled:    { color: '#6b7280', label: 'Cancelled' },
                  }[item.completion_status] || { color: '#9ca3af', label: item.completion_status };

                  const returnCfg = {
                    none:      null,
                    requested: { color: '#f59e0b', label: 'Return Requested' },
                    approved:  { color: '#3b82f6', label: 'Return Approved' },
                    rejected:  { color: '#ef4444', label: 'Return Rejected' },
                    completed: { color: '#10b981', label: 'Return Completed' },
                  }[item.return_status];

                  return (
                    <div key={idx} style={{
                      borderRadius: 14,
                      border: `1px solid rgba(168,85,247,0.2)`,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = purpleBd; e.currentTarget.style.boxShadow = '0 2px 16px rgba(168,85,247,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      {/* ── Item header ── */}
                      <div style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--panel-bg,white)', flexWrap: 'wrap' }}>
                        {/* Icon */}
                        <div style={{ width: 44, height: 44, borderRadius: 11, background: `${itemColor}14`, border: `1px solid ${itemColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ItemIcon size={20} color={itemColor} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Badges row */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                                {item.product_sku  && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', background: 'var(--tag-bg,#f3f4f6)', padding: '2px 8px', borderRadius: 6 }}>SKU: {item.product_sku}</span>}
                                {item.brand_name   && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', background: 'var(--tag-bg,#f3f4f6)', padding: '2px 8px', borderRadius: 6 }}>{item.brand_name}</span>}
                                {item.service_category && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.08)', padding: '2px 8px', borderRadius: 6 }}>{item.service_category}</span>}
                                <Pill color={itemColor}>{item.item_type?.replace('_', ' ')}</Pill>
                                {item.is_custom_item  && <Pill color="#f59e0b">Custom</Pill>}
                                {item.is_bulk_pricing && <Pill color="#3b82f6">Bulk Price</Pill>}
                                {item.is_negotiated_price && <Pill color="#a855f7">Negotiated</Pill>}
                                {item.is_taxable ? <Pill color="#10b981">Taxable</Pill> : <Pill color="#9ca3af">Non-Taxable</Pill>}
                                {item.requires_site_visit && <Pill color="#f59e0b">Site Visit</Pill>}
                                {(item.item_type === 'product' || item.item_type === 'custom_product') && item.fulfillment_status === 'backorder' && <Pill color="#f59e0b">Backorder</Pill>}
                                {(item.item_type === 'product' || item.item_type === 'custom_product') && item.fulfillment_status === 'in_stock'  && <Pill color="#10b981">In Stock</Pill>}
                                {returnCfg && <Pill color={returnCfg.color}>{returnCfg.label}</Pill>}
                              </div>

                              {/* Name */}
                              <p style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text,#111827)', margin: 0, wordBreak: 'break-word' }}>
                                {item.product_name || item.service_name || `Item ${idx + 1}`}
                              </p>
                              {item.service_description && (
                                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '3px 0 0', lineHeight: 1.5 }}>{item.service_description}</p>
                              )}
                            </div>

                            {/* Price + expand */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '1.05rem', fontWeight: 900, color: purple, margin: 0 }}>{money(lineAfterDisc)}</p>
                                {hasDiscount && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', textDecoration: 'line-through' }}>{money(lineTotal)}</span>
                                    <Pill color="#10b981">{discPct}% off</Pill>
                                  </div>
                                )}
                                {hasMarkup && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', textDecoration: 'line-through' }}>{money(lineTotal)}</span>
                                    <Pill color="#f97316">{markupPct}% up</Pill>
                                  </div>
                                )}
                                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '3px 0 0' }}>{qty} × {money(unitPrice)}</p>
                              </div>
                              <button onClick={() => toggleItemExpansion(idx)} style={{ padding: 6, borderRadius: 8, border: `1px solid rgba(168,85,247,0.2)`, background: 'var(--panel-bg,white)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#9ca3af', marginTop: 2 }}>
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </div>
                          </div>

                          {/* Completion progress bar (always visible for services) */}
                          {isService && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: completionCfg.color }}>{completionCfg.label}</span>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: completionCfg.color }}>{item.completion_percentage || 0}%</span>
                              </div>
                              <div style={{ height: 5, borderRadius: 99, background: 'var(--border,#f3f4f6)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${item.completion_percentage || 0}%`, background: completionCfg.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Expanded details ── */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid rgba(168,85,247,0.15)`, background: purpleLt, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                          {/* Pricing table */}
                          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(168,85,247,0.2)` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '8px 14px', background: 'rgba(168,85,247,0.08)', borderBottom: `1px solid rgba(168,85,247,0.15)` }}>
                              {['Unit Price', 'Quantity', hasMarkup ? 'Markup' : 'Discount', 'Total'].map((h, i) => (
                                <span key={h} style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', textAlign: i > 1 ? 'center' : 'left' }}>{h}</span>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '10px 14px', background: 'var(--panel-bg,white)' }}>
                              <div>
                                <p style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text,#111827)', margin: 0 }}>{money(unitPrice)}</p>
                                {item.unit_of_measure && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>per {item.unit_of_measure}</p>}
                              </div>
                              <div>
                                <p style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text,#111827)', margin: 0 }}>{qty}</p>
                                {item.unit_of_measure && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{item.unit_of_measure}</p>}
                              </div>
                              <div style={{ textAlign: 'center' }}>
                                {hasDiscount ? (
                                  <>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', margin: 0 }}>-{money(discAmt)}</p>
                                    <p style={{ fontSize: '0.7rem', color: '#10b981', margin: '2px 0 0' }}>{discPct}% off</p>
                                  </>
                                ) : hasMarkup ? (
                                  <>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f97316', margin: 0 }}>+{money((unitPrice - origPrice) * qty)}</p>
                                    <p style={{ fontSize: '0.7rem', color: '#f97316', margin: '2px 0 0' }}>{markupPct}% up</p>
                                  </>
                                ) : (
                                  <p style={{ color: '#d1d5db', fontSize: '0.85rem' }}>—</p>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '0.9rem', fontWeight: 900, color: purple, margin: 0 }}>{money(lineAfterDisc)}</p>
                                {hasDiscount && <p style={{ fontSize: '0.7rem', color: '#9ca3af', textDecoration: 'line-through', margin: '2px 0 0' }}>{money(lineTotal)}</p>}
                              </div>
                            </div>
                            {(hasDiscount || hasMarkup) && (
                              <div style={{ padding: '8px 14px', borderTop: `1px solid rgba(168,85,247,0.1)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: hasDiscount ? 'rgba(16,185,129,0.05)' : 'rgba(249,115,22,0.05)' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: hasDiscount ? '#065f46' : '#9a3412' }}>
                                  {hasDiscount ? 'Customer saves on this item' : 'Price includes a markup'}
                                </span>
                                <Pill color={hasDiscount ? '#10b981' : '#f97316'}>
                                  {hasDiscount ? `Save ${money(discAmt)} · ${discPct}% off` : `+${money((unitPrice - origPrice) * qty)} · ${markupPct}% up`}
                                </Pill>
                              </div>
                            )}
                            {item.pricing_notes && (
                              <div style={{ padding: '8px 14px', borderTop: `1px solid rgba(168,85,247,0.1)`, background: purpleLt, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <Info size={12} color={purple} style={{ flexShrink: 0, marginTop: 1 }} />
                                <p style={{ fontSize: '0.75rem', color: purple, margin: 0, fontWeight: 600 }}>{item.pricing_notes}</p>
                              </div>
                            )}
                          </div>

                          {/* Fulfillment & stock — products only */}
                          {(item.item_type === 'product' || item.item_type === 'custom_product') && (
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(168,85,247,0.2)` }}>
                              <div style={{ padding: '8px 14px', background: 'rgba(168,85,247,0.08)', borderBottom: `1px solid rgba(168,85,247,0.15)` }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', margin: 0 }}>Fulfillment</p>
                              </div>
                              <div style={{ background: 'var(--panel-bg,white)' }}>
                                {[
                                  item.fulfillment_status && ['Fulfillment',  item.fulfillment_status.replace('_', ' '), item.fulfillment_status === 'in_stock' ? '#10b981' : '#f59e0b', item.fulfillment_status === 'in_stock' ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)'],
                                  item.stock_status       && ['Stock Status', item.stock_status.replace('_', ' '),       item.stock_status === 'in_stock' ? '#10b981' : '#ef4444',       item.stock_status === 'in_stock' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'],
                                  item.backorder_quantity > 0 && ['Backorder Qty', item.backorder_quantity,                  '#f59e0b', 'rgba(245,158,11,0.06)'],
                                  item.reserved_at            && ['Reserved At',   new Date(item.reserved_at).toLocaleString(), '#3b82f6', 'rgba(59,130,246,0.06)'],
                                  item.quantity_returned > 0  && ['Qty Returned',  item.quantity_returned,                   '#ef4444', 'rgba(239,68,68,0.06)'],
                                  item.refund_amount > 0      && ['Refund Amount', money(item.refund_amount),                '#ef4444', 'rgba(239,68,68,0.06)'],
                                  returnCfg                   && ['Return Status', returnCfg.label,                          returnCfg.color, `${returnCfg.color}10`],
                                ].filter(Boolean).map(([label, val, color, bg], i) => (
                                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '8px 14px', fontSize: '0.78rem', background: bg, borderTop: i > 0 ? `1px solid rgba(168,85,247,0.08)` : 'none' }}>
                                    <span style={{ color, fontWeight: 700 }}>{label}</span>
                                    <span style={{ fontWeight: 800, color: 'var(--text,#111827)', textTransform: 'capitalize' }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Service details */}
                          {isService && (item.scheduled_start_date || item.scheduled_end_date || item.estimated_hours != null || item.hourly_rate != null || item.labor_cost != null || item.material_cost != null || item.estimated_duration) && (
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(59,130,246,0.25)` }}>
                              <div style={{ padding: '8px 14px', background: 'rgba(59,130,246,0.08)', borderBottom: `1px solid rgba(59,130,246,0.15)`, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Wrench size={11} color="#3b82f6" />
                                <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', margin: 0 }}>Service Details</p>
                              </div>
                              <div style={{ background: 'var(--panel-bg,white)' }}>
                                {[
                                  (item.scheduled_start_date || item.scheduled_end_date) && ['Schedule', '#10b981', 'rgba(16,185,129,0.06)', `${item.scheduled_start_date ? new Date(item.scheduled_start_date).toLocaleDateString() : '—'}${item.scheduled_end_date ? ` → ${new Date(item.scheduled_end_date).toLocaleDateString()}` : ''}`],
                                  item.estimated_duration    && ['Duration',     '#a855f7', 'rgba(168,85,247,0.06)', item.estimated_duration],
                                  item.estimated_hours != null && ['Est. Hours', '#3b82f6', 'rgba(59,130,246,0.06)', `${parseFloat(item.estimated_hours).toFixed(1)} hrs`],
                                  item.hourly_rate != null   && ['Hourly Rate',  '#f59e0b', 'rgba(245,158,11,0.06)', `${money(item.hourly_rate)} / hr`],
                                  item.labor_cost != null    && ['Labor Cost',   '#ef4444', 'rgba(239,68,68,0.06)',  money(item.labor_cost)],
                                  item.material_cost != null && ['Material Cost','#06b6d4', 'rgba(6,182,212,0.06)',  money(item.material_cost)],
                                ].filter(Boolean).map(([label, color, bg, val], i) => (
                                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '8px 14px', fontSize: '0.78rem', background: bg, borderTop: i > 0 ? `1px solid rgba(168,85,247,0.08)` : 'none' }}>
                                    <span style={{ color, fontWeight: 700 }}>{label}</span>
                                    <span style={{ fontWeight: 800, color: 'var(--text,#111827)' }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                              {/* Completion status */}
                              <div style={{ padding: '10px 14px', borderTop: `1px solid rgba(59,130,246,0.15)`, background: 'rgba(59,130,246,0.04)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <Pill color={completionCfg.color}>{completionCfg.label}</Pill>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: completionCfg.color }}>{item.completion_percentage || 0}%</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 99, background: 'var(--border,#f3f4f6)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${item.completion_percentage || 0}%`, background: completionCfg.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Variant details */}
                          {item.variant_details && Object.keys(item.variant_details).length > 0 && (
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(168,85,247,0.2)` }}>
                              <div style={{ padding: '8px 14px', background: 'rgba(168,85,247,0.08)', borderBottom: `1px solid rgba(168,85,247,0.15)` }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', margin: 0 }}>Variant Details</p>
                              </div>
                              <div style={{ background: 'var(--panel-bg,white)' }}>
                                {Object.entries(item.variant_details).map(([key, val], i) => (
                                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '8px 14px', fontSize: '0.78rem', background: i % 2 === 0 ? 'transparent' : 'rgba(168,85,247,0.03)', borderTop: i > 0 ? `1px solid rgba(168,85,247,0.08)` : 'none' }}>
                                    <span style={{ color: '#a78bfa', fontWeight: 700, textTransform: 'capitalize' }}>{key}</span>
                                    <span style={{ fontWeight: 800, color: 'var(--text,#111827)' }}>{val || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Custom item details */}
                          {item.custom_item_details && Object.keys(item.custom_item_details).length > 0 && (
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(245,158,11,0.25)` }}>
                              <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.08)', borderBottom: `1px solid rgba(245,158,11,0.15)` }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f59e0b', margin: 0 }}>Custom Item Details</p>
                              </div>
                              <div style={{ background: 'var(--panel-bg,white)' }}>
                                {Object.entries(item.custom_item_details).map(([key, val], i) => (
                                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '8px 14px', fontSize: '0.78rem', background: i % 2 === 0 ? 'transparent' : 'rgba(245,158,11,0.03)', borderTop: i > 0 ? `1px solid rgba(245,158,11,0.08)` : 'none' }}>
                                    <span style={{ color: '#f59e0b', fontWeight: 700, textTransform: 'capitalize' }}>{String(key).replace(/_/g, ' ')}</span>
                                    <span style={{ fontWeight: 800, color: 'var(--text,#111827)' }}>{String(val) || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes / Prerequisites */}
                          {(item.notes || item.prerequisites || item.pricing_notes) && (
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(168,85,247,0.2)` }}>
                              <div style={{ padding: '8px 14px', background: 'rgba(168,85,247,0.08)', borderBottom: `1px solid rgba(168,85,247,0.15)` }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', margin: 0 }}>Notes & Info</p>
                              </div>
                              <div style={{ background: 'var(--panel-bg,white)' }}>
                                {[
                                  item.prerequisites  && ['Prerequisites', item.prerequisites,  '#3b82f6', 'rgba(59,130,246,0.06)'],
                                  item.notes          && ['Notes',          item.notes,          '#a855f7', 'rgba(168,85,247,0.06)'],
                                  item.pricing_notes  && ['Pricing Notes',  item.pricing_notes,  '#f59e0b', 'rgba(245,158,11,0.06)'],
                                ].filter(Boolean).map(([label, val, color, bg], i) => (
                                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '8px 14px', fontSize: '0.78rem', background: bg, borderTop: i > 0 ? `1px solid rgba(168,85,247,0.08)` : 'none' }}>
                                    <span style={{ color, fontWeight: 700 }}>{label}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--text,#374151)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

          {/* Order Items */}
          <Panel className="order-panel">
            {/* Financial Summary */}
            <div style={{ padding: '18px 22px', borderTop: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={TrendingUp}>Financial Summary</SectionLabel>
              <div className="od-financials-grid">
                {[
                  { label: 'Subtotal',  val: subtotal,     set: setSubtotal },
                  { label: 'Tax (16%)', val: tax,          set: setTax },
                  { label: 'Shipping',  val: shippingCost, set: setShippingCost },
                  { label: 'Discount',  val: discount,     set: setDiscount },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', marginBottom: 5 }}>{label}</p>
                    <input type="number" value={val} onChange={e => set(Number(e.target.value||0))}
                      disabled={isCancelled} style={iStyle} onFocus={fIn} onBlur={fOut} />
                  </div>
                ))}
                <div style={{ gridColumn: 'span 2' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', marginBottom: 5 }}>Order Type</p>
                  <select value={orderType} onChange={e => setOrderType(e.target.value)} disabled={isCancelled}
                    style={{ ...iStyle, appearance: 'none' }} onFocus={fIn} onBlur={fOut}>
                    {['standard','quotation','bulk','b2b'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ padding: '14px 16px', borderRadius: 12, background: purpleLt, border: `1px solid ${purpleBd}` }}>
                {[
                  { label: 'Subtotal',  value: money(order.subtotal),       kes: showKes && kesMoney(subtotalKes) },
                  order.discount > 0 && { label: 'Discount', value: `−${money(order.discount)}`, color: '#10b981' },
                  order.referral_discount > 0 && { label: 'Referral Discount', value: `−${money(order.referral_discount)}`, color: '#a855f7' },
                  order.promo_discount > 0 && { 
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        Promo Discount
                        {order.promo_code && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 9999, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                            {order.promo_code}
                          </span>
                        )}
                      </span>
                    ), 
                    value: `-${money(order.promo_discount)}`, 
                    color: '#10b981' 
                  },
                  Number(order.store_credit_deduction) > 0 && {
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        💳 Store Credit
                      </span>
                    ),
                    value:  `-${money(order.store_credit_deduction)}`,
                    color:  '#059669',
                    kes:    showKes && Number(order.store_credit_deduction_kes) > 0
                              ? kesMoney(order.store_credit_deduction_kes)
                              : null,
                  },
                  { label: 'Tax',       value: money(order.tax) },
                  { label: 'Shipping',  value: money(order.shipping_cost) },
                ].filter(Boolean).map(({ label, value, color, kes }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{label}</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: color || 'var(--text,#374151)' }}>{value}</span>
                      {kes && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{kes}</p>}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1px solid ${purpleBd}`, marginTop: 4 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text,#111827)' }}>Total</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: purple }}>{money(order.total)}</span>
                    {showKes && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>{kesMoney(totalKes)}</p>}
                    {showKes && exchangeDate && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, fontStyle: 'italic' }}>1 {displayCurrency} = {fmt(order.exchange_rate_to_kes, 6)} KES · {exchangeDate}</p>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <Btn variant="ghost" icon={<Save size={14} />} onClick={handleSaveTotals} disabled={isCancelled} size="sm">Save Totals</Btn>
                {/* ── Request Payment Button ───────────────────────────────────── */}
                {(() => {
                  // ✅ Matches backend PaymentController::initiate() guards
                  const allowedOrderStatuses = ['confirmed', 'processing', 'ready_for_pickup', 'shipped', 'delivered'];
                  const standardPaymentStatuses = ['unpaid', 'partially_paid'];
                  
                  const canStandardRequest = 
                    allowedOrderStatuses.includes(order?.status) && 
                    standardPaymentStatuses.includes(order?.payment_status);

                  // 🔑 Super admin can bypass "paid/refunded" for edge cases (force_override)
                  const isSuperAdmin = useAuthStore?.getState().user?.role === 'super_admin';
                  const canOverride = isSuperAdmin && ['paid', 'refunded'].includes(order?.payment_status);

                  if (!canStandardRequest && !canOverride) return null;

                  const balance = order?.total_kes || order?.total || 0;
                  const isFullyPaid = balance <= 0 && !canOverride;

                  return (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <Btn 
                        variant={isFullyPaid ? 'outline' : 'ghost'} 
                        icon={<Zap size={14} />} 
                        onClick={() => setShowPaymentModal(true)}
                        disabled={isFullyPaid}
                      >
                        {isFullyPaid ? 'Fully Paid' : 'Request Payment'}
                      </Btn>
                    </div>
                  );
                })()}
              </div>
            </div>
          </Panel>

          {/* ── Payment History Panel ───────────────────────────────────────── */}
          {orderPayments && (
            <Panel className="order-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionLabel icon={CreditCard}>Payment History · {orderPayments.payments?.length || 0}</SectionLabel>
                {orderPayments.balance_remaining > 0 && (
                  <Pill color="#f59e0b">Balance: {kesMoney(orderPayments.balance_remaining)}</Pill>
                )}
              </div>
              
              <div style={{ padding: '16px 22px' }}>
                {orderPayments.payments?.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
                    No payment attempts yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {orderPayments.payments.map((p, idx) => {
                      const isConfirmed = p.status === 'confirmed';
                      const isFailed = p.status === 'failed';
                      const isPending = p.status === 'pending';
                      const isCancelled = p.status === 'cancelled';
                      
                      const statusCfg = {
                        confirmed:  { color: '#10b981', label: 'Confirmed', icon: CheckCircle },
                        failed:     { color: '#ef4444', label: 'Failed',    icon: XCircle },
                        pending:    { color: '#f59e0b', label: 'Pending',   icon: Clock },
                        cancelled:  { color: '#6b7280', label: 'Cancelled', icon: AlertTriangle },
                      }[p.status] || { color: '#9ca3af', label: p.status, icon: Info };
                      
                      const StatusIcon = statusCfg.icon;
                      
                      return (
                        <div 
                          key={p.id} 
                          style={{ 
                            padding: '12px 14px', 
                            borderRadius: 10, 
                            border: `1px solid ${isConfirmed ? 'rgba(16,185,129,0.2)' : 'var(--border,#e5e7eb)'}`,
                            background: isConfirmed ? 'rgba(16,185,129,0.04)' : 'var(--panel-bg,white)',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            gap: 12,
                            flexWrap: 'wrap'
                          }}
                        >
                          {/* Left: Status + Meta */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div style={{ 
                              width: 32, height: 32, borderRadius: 8, 
                              background: `${statusCfg.color}14`, 
                              border: `1px solid ${statusCfg.color}30`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0 
                            }}>
                              <StatusIcon size={14} color={statusCfg.color} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {p.payment_number}
                                {p.is_retry && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#6b7280', background: 'var(--tag-bg,#f3f4f6)', padding: '1px 6px', borderRadius: 4 }}>Retry</span>}
                              </p>
                              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                                {p.phone_number} • {format(new Date(p.initiated_at), 'MMM d · h:mm a')}
                              </p>
                              {p.confirmed_at && (
                                <p style={{ fontSize: '0.68rem', color: statusCfg.color, margin: '2px 0 0' }}>
                                  Completed {format(new Date(p.confirmed_at), 'MMM d · h:mm a')}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {/* Center: Amounts */}
                          <div style={{ textAlign: 'center', minWidth: 120 }}>
                            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>Expected</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text,#374151)', margin: '2px 0' }}>
                              {kesMoney(p.amount_expected)}
                            </p>
                            {isConfirmed && (
                              <>
                                <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '4px 0 0' }}>Received</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', margin: 0 }}>
                                  {kesMoney(p.mpesa_amount_confirmed || p.amount_received)}
                                </p>
                              </>
                            )}
                          </div>
                          
                          {/* Right: Receipt + Status */}
                          <div style={{ textAlign: 'right', minWidth: 140 }}>
                            <Pill color={statusCfg.color}>{statusCfg.label}</Pill>
                            {isConfirmed && p.mpesa_receipt_number && (
                              <p style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700, margin: '6px 0 0', wordBreak: 'break-all' }}>
                                {p.mpesa_receipt_number}
                              </p>
                            )}
                            {isFailed && p.failure_reason && (
                              <p style={{ fontSize: '0.68rem', color: '#ef4444', margin: '6px 0 0', maxWidth: 180, wordBreak: 'break-word' }}>
                                {p.failure_reason}
                              </p>
                            )}
                            {isPending && (
                              <p style={{ fontSize: '0.68rem', color: '#f59e0b', margin: '6px 0 0' }}>
                                Awaiting customer…
                              </p>
                            )}
                            {/* Click to view full payment detail */}
                            <button 
                              onClick={() => navigate(`/admin/finance/payments/${p.id}`)}
                              style={{ 
                                fontSize: '0.7rem', color: purple, fontWeight: 600, 
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '4px 0', marginTop: 4, textDecoration: 'none'
                              }}
                            >
                              View Details →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Summary Footer */}
                <div style={{ 
                  marginTop: 16, padding: '12px 14px', borderRadius: 10, 
                  background: purpleLt, border: `1px solid ${purpleBd}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: 8
                }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>Total Confirmed</p>
                      <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10b981', margin: 0 }}>
                        {kesMoney(orderPayments.total_confirmed_kes)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>Balance Remaining</p>
                      <p style={{ fontSize: '0.9rem', fontWeight: 800, color: orderPayments.balance_remaining > 0 ? '#ef4444' : '#10b981', margin: 0 }}>
                        {kesMoney(orderPayments.balance_remaining)}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>Order Total</p>
                    <p style={{ fontSize: '0.9rem', fontWeight: 800, color: purple, margin: 0 }}>
                      {kesMoney(orderPayments.order_total_kes)}
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* Shipping & Courier */}
          <Panel className="order-panel">
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Truck}>Shipping & Delivery</SectionLabel>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div className="od-shipping-meta">
                {[
                  { label: 'Delivery Method', value: order.delivery_method?.replace(/_/g,' ') },
                  { label: 'Priority', value: <Pill color={order.priority === 'urgent' ? '#ef4444' : '#a855f7'}>{order.priority}</Pill> },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border,#f3f4f6)', background: 'var(--row-bg,rgba(249,250,251,0.5))' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 5 }}>{label}</p>
                    <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0, textTransform: 'capitalize' }}>{value}</p>
                  </div>
                ))}
                <div style={{ gridColumn: 'span 2', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border,#f3f4f6)', background: 'var(--row-bg,rgba(249,250,251,0.5))' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={11} />Shipping Address</p>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text,#374151)', margin: 0, lineHeight: 1.5 }}>{order.shipping_address}</p>
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 12, border: `1px solid ${purpleBd}`, background: purpleLt }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 12 }}>Courier Details</p>
                <div className="od-courier-grid">
                  {[
                    { label: 'Tracking Number', val: trackingNumber, set: setTrackingNumber, placeholder: 'e.g. TRK123456' },
                    { label: 'Courier Company', val: courierCompany, set: setCourierCompany, placeholder: 'e.g. DHL, Fargo' },
                    { label: 'Est. Delivery',   val: estimatedDeliveryDate, set: setEstimatedDeliveryDate, type: 'date' },
                  ].map(({ label, val, set, placeholder, type }) => (
                    <div key={label}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>{label}</p>
                      <input type={type||'text'} value={val} onChange={e => set(e.target.value)}
                        placeholder={placeholder} style={iStyle} onFocus={fIn} onBlur={fOut} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <Btn variant="outline" size="sm" onClick={handleClearCourier}>Clear</Btn>
                  <Btn variant="ghost"   size="sm" icon={<Save size={13} />} onClick={handleSaveCourier}>Save Courier</Btn>
                </div>
              </div>
            </div>
          </Panel>

          {/* Admin Notes */}
          {order.admin_notes && (
            <Panel className="order-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Shield}>Admin Notes (Internal)</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{order.admin_notes}</p>
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Customer */}
          <Panel className="order-panel">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={User}>Customer</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Customer ID', value: `#${order.customer_id}`, icon: Hash },
                { label: 'Email',       value: order.customer?.email || 'N/A', icon: ArrowUpRight },
                { label: 'Phone',       value: order.customer?.phone || 'N/A', icon: Tag },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Icon size={11} />{label}
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text,#111827)', wordBreak: 'break-all', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Order Management */}
          <Panel className="order-panel" accent>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Edit3}>Order Management</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Status</span>
                <StatusPill s={order.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Payment</span>
                <PaymentPill s={order.payment_status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Type</span>
                <Pill color={purple}>{order.order_type}</Pill>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <Btn variant="ghost"   size="sm" onClick={() => setStatusModal(true)}  disabled={isCancelled}>Update Status</Btn>
                <Btn variant="outline" size="sm" onClick={() => setPaymentModal(true)} disabled={isCancelled}>Update Payment</Btn>
              </div>
            </div>
          </Panel>

          {/* Other Details */}
          <Panel className="order-panel">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Clock}>Order Details</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Type</span>
                <Pill color={purple}>{order.order_type}</Pill>
              </div>
              {order.invoice_number && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: purpleLt, border: `1px solid ${purpleBd}` }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: purple, marginBottom: 3 }}>Proforma Invoice</p>
                  <p style={{ fontSize: '0.82rem', fontWeight: 800, color: purple, margin: 0 }}>{order.invoice_number}</p>
                </div>
              )}

              {/* Project info */}
              {order.project_name && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: purpleLt, border: `1px solid ${purpleBd}` }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: purple, marginBottom: 4 }}>Project</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 6px' }}>{order.project_name}</p>
                  {order.project_details && Object.keys(order.project_details).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4, paddingTop: 6, borderTop: `1px solid ${purpleBd}` }}>
                      {Object.entries(order.project_details).map(([key, val]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'capitalize' }}>
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text,#374151)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>
                            {String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Billing schedule */}
              {order.billing_schedule && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Billing</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text,#111827)', textTransform: 'capitalize' }}>
                    {order.billing_schedule.replace(/_/g, ' ')}
                  </span>
                </div>
              )}

              {/* Service period */}
              {(order.service_start_date || order.service_end_date) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Service Period</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text,#111827)', textAlign: 'right' }}>
                    {order.service_start_date ? format(new Date(order.service_start_date), 'MMM d, yyyy') : '—'}
                    {order.service_end_date ? ` → ${format(new Date(order.service_end_date), 'MMM d, yyyy')}` : ''}
                  </span>
                </div>
              )}
            </div>
          </Panel>

          {/* Timeline */}
          <Panel className="order-panel">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Clock}>Timeline</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {timeline.map((t, i) => (
                <div key={t.label} style={{ display: 'flex', gap: 12, marginBottom: i < timeline.length - 1 ? 12 : 0, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                    <TimelineDot color={t.color} filled={!!t.date || t.label === 'Created'} />
                    {i < timeline.length - 1 && (
                      <div style={{ width: 1, height: 20, background: 'var(--border,#e5e7eb)', marginTop: 4 }} />
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: t.date ? 'var(--text,#374151)' : '#d1d5db', margin: '0 0 2px' }}>{t.label}</p>
                    {t.date && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{format(new Date(t.date), 'MMM d · h:mm a')}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Rating */}
          {order.rating && (
            <Panel className="order-panel">
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Star}>Customer Rating</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: order.feedback ? 12 : 0 }}>
                  <Star size={28} color="#f59e0b" fill="#f59e0b" />
                  <div>
                    <p style={{ fontSize: '1.6rem', fontWeight: 900, color: '#92400e', margin: 0 }}>{order.rating}<span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#d97706' }}>/10</span></p>
                    <Pill color={order.rating >= 8 ? '#10b981' : order.rating >= 6 ? '#f59e0b' : '#ef4444'}>
                      {order.rating >= 8 ? 'Excellent' : order.rating >= 6 ? 'Good' : 'Needs Improvement'}
                    </Pill>
                  </div>
                </div>
                {order.feedback && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text,#374151)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{order.feedback}</p>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {/* Ship */}
      {shipModal && (
        <InlineModal title="Ship Order" subtitle={order.order_number} onClose={() => setShipModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Tracking Number *', key: 'tracking_number', placeholder: 'e.g. TRK123456789' },
              { label: 'Courier Company *',  key: 'courier_company',  placeholder: 'e.g. DHL, FedEx, G4S' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>{label}</p>
                <input value={shipData[key]} onChange={e => setShipData({ ...shipData, [key]: e.target.value })}
                  placeholder={placeholder} style={iStyle} onFocus={fIn} onBlur={fOut} />
              </div>
            ))}
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>Estimated Delivery Date</p>
              <input type="date" value={shipData.estimated_delivery_date}
                onChange={e => setShipData({ ...shipData, estimated_delivery_date: e.target.value })}
                min={new Date().toISOString().split('T')[0]} style={iStyle} onFocus={fIn} onBlur={fOut} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6', marginTop: 4 }}>
              <Btn variant="outline" onClick={() => setShipModal(false)}>Cancel</Btn>
              <Btn variant="primary" icon={<Truck size={15} />} onClick={handleShip}>Ship Order</Btn>
            </div>
          </div>
        </InlineModal>
      )}

      {/* Status */}
      {statusModal && (
        <InlineModal title="Update Order Status" subtitle={order.order_number} onClose={() => setStatusModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>Order Status</p>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ ...iStyle, appearance: 'none' }} onFocus={fIn} onBlur={fOut}>
                {['pending','confirmed','processing','ready_for_pickup','shipped','delivered','failed'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>Admin Notes (optional)</p>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                placeholder="Notes about this status change…" rows={3}
                style={{ ...iStyle, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
              <Btn variant="outline" onClick={() => setStatusModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleUpdateStatus}>Update Status</Btn>
            </div>
          </div>
        </InlineModal>
      )}

      {/* Payment */}
      {paymentModal && (
        <InlineModal title="Update Payment Status" subtitle={order.order_number} accentColor="#10b981" onClose={() => setPaymentModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>Payment Status</p>
              <select value={newPaymentStatus} onChange={e => setNewPaymentStatus(e.target.value)} style={{ ...iStyle, appearance: 'none' }} onFocus={fIn} onBlur={fOut}>
                {['unpaid','partially_paid','paid','failed'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>Payment Reference</p>
              <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
                placeholder="Transaction ID, M-Pesa code, etc." style={iStyle} onFocus={fIn} onBlur={fOut} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
              <Btn variant="outline" onClick={() => setPaymentModal(false)}>Cancel</Btn>
              <Btn variant="success" icon={<CreditCard size={15} />} onClick={handleUpdatePayment}>Update Payment</Btn>
            </div>
          </div>
        </InlineModal>
      )}

      {/* Restore */}
      {restoreModal && (
        <InlineModal title={`Restore Order ${order.order_number}`} accentColor="#10b981" onClose={() => setRestoreModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {order.payment_status === 'refunded' && (
              <Alert icon={AlertTriangle} color="#92400e" bg="rgba(245,158,11,0.06)" border="rgba(245,158,11,0.2)" title="This order was refunded">
                Restoring will revert payment to "Paid", clear refund amounts, deduct returned stock, and move order to "Confirmed".
              </Alert>
            )}
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5 }}>Restore Reason (optional)</p>
              <textarea value={restoreReason} onChange={e => setRestoreReason(e.target.value)}
                placeholder="Enter reason for restoring this order…" rows={3}
                style={{ ...iStyle, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
              <Btn variant="outline" onClick={() => setRestoreModal(false)}>Cancel</Btn>
              <Btn variant="success" icon={<RefreshCw size={15} />} onClick={handleRestore}>Restore Order</Btn>
            </div>
          </div>
        </InlineModal>
      )}

      {/* Return/Cancel */}
      <ReturnItemsModal
        key={`cancel-${order?.id}-${order?.status}-${order?.payment_status}`}
        isOpen={returnModal}
        onClose={() => setReturnModal(false)}
        order={order}
        onConfirmCancel={handleAdminCancel}
      />

      {editModal && (
        <CreateOrderModal
          isOpen={editModal}
          onClose={() => setEditModal(false)}
          editMode={true}
          initialData={order}
          onSuccess={async (payload) => {
            await useOrderStore.getState().adminUpdateOrder(order.id, payload);
            await fetchAdminOrder(id);
            setEditModal(false);
            toast.success('Order updated successfully');
          }}
        />
      )}
      {/* ── Request Payment Modal ───────────────────────────────────── */}
      {showPaymentModal && order && (
        <InitiatePaymentModal
          orderId={order.id}
          orderTotalKes={order.total_kes ?? (Number(order.total) * Number(order.exchange_rate_to_kes || 1))}
          orderBalanceKes={getRemainingBalanceKes()}
          onClose={(result) => {
            setShowPaymentModal(false);
            if (result?.payment_id) {
              toast.success(`Payment ${result.payment_number} initiated`);
              // Navigate to the new payment detail page
              navigate(`/admin/finance/payments/${result.payment_id}`);
            }
          }}
        />
      )}
    </AdminLayout>
  );
}