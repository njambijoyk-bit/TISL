import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit2,
  Send,
  Trash2,
  FileText,
  User,
  Calendar,
  Clock,
  Building,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Package,
  Wrench,
  Tag,
  TrendingDown,
  TrendingUp,
  Info,
  AlertCircle,
  CheckCircle,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  Percent,
  FileCheck,
  ClipboardList,
  CreditCard,
  Truck,
  ShieldCheck,
  AlertTriangle,
  ChevronLeft,
  Layers,
  Hash,
  Activity,
  Shield,
} from 'lucide-react';
import AdminLayout from '../layout/AdminLayout';
import LoadingSpinner from '../layout/LoadingSpinner';
import QuoteStatusBadge from '../admin/QuoteStatusBadge';
import useQuoteStore from '../../store/quoteStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>{children}</p>
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

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'var(--panel-bg,white)',
    border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}`,
    borderRadius: 16, overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md', fullWidth }) => {
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
    <button onClick={onClick} disabled={disabled} type="button" style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 10, fontSize: fs,
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s, transform 0.1s',
      width: fullWidth ? '100%' : undefined,
      justifyContent: fullWidth ? 'center' : undefined,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const TimelineDot = ({ color, filled }) => (
  <div style={{
    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
    background: filled ? color : 'transparent',
    border: `2px solid ${color}`,
    boxShadow: filled ? `0 0 0 3px ${color}20` : 'none',
  }} />
);

const StatCell = ({ label, value, accent, mono }) => (
  <div style={{ padding: '10px 12px', borderRadius: 10, background: accent ? purpleLt : 'var(--row-bg,rgba(249,250,251,0.7))', border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}` }}>
    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
    <p style={{ fontSize: mono ? '0.8rem' : '0.88rem', fontWeight: 800, color: accent ? purple : 'var(--text,#111827)', margin: 0, fontFamily: mono ? 'monospace' : undefined }}>{value}</p>
  </div>
);

// ─── Priority / type colours ──────────────────────────────────────────────────
const priorityColor = { low: '#9ca3af', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

const itemTypeIcon = (type) => {
  if (type === 'product' || type === 'custom_product') return <Package size={16} />;
  if (type === 'service' || type === 'custom_service') return <Wrench size={16} />;
  if (type === 'fee') return <Tag size={16} />;
  return <FileText size={16} />;
};

const itemTypeLabel = (type) => ({
  product: 'Product', service: 'Service',
  custom_product: 'Custom Product', custom_service: 'Custom Service',
  fee: 'Fee', custom: 'Custom Item',
}[type] || type);

const availabilityConfig = {
  in_stock:     { label: 'In Stock',     color: '#10b981' },
  available:    { label: 'Available',    color: '#10b981' },
  out_of_stock: { label: 'Out of Stock', color: '#ef4444' },
  special_order:{ label: 'Special Order',color: '#3b82f6' },
  on_request:   { label: 'On Request',   color: '#f59e0b' },
};

// ─── Main component ───────────────────────────────────────────────────────────
const QuoteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentQuote: quote, loadingCurrent, fetchQuoteById, sendToCustomer, deleteQuote } = useQuoteStore();

  const [sending,       setSending]       = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => { fetchQuoteById(id); }, [id, fetchQuoteById]);

  const toggleItem = (i) => setExpandedItems(p => ({ ...p, [i]: !p[i] }));

  const handleSend = async () => {
    if (!window.confirm('Send this quote to the customer? They will receive an email notification.')) return;
    setSending(true);
    try { await sendToCustomer(id); toast.success('Quote sent to customer'); await fetchQuoteById(id); }
    catch { toast.error('Failed to send quote'); }
    finally { setSending(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this quote? This cannot be undone.')) return;
    setDeleting(true);
    try { await deleteQuote(id); toast.success('Quote deleted'); navigate('/admin/quotes'); }
    catch { toast.error('Failed to delete quote'); }
    finally { setDeleting(false); }
  };

  const getCustomerDisplayName = (c, q) => {
    if (!c) return q?.customer_name || (q?.customer_id ? `Customer #${q.customer_id}` : 'N/A');
    if (c.name) return c.name;
    const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (c.user?.name) return c.user.name;
    if (c.company_name) return c.company_name;
    if (c.email) return c.email;
    return q?.customer_name || 'N/A';
  };

const handleExportPDF = async () => {
  try {
    const doc    = new jsPDF({ unit: 'pt', format: 'a4' });
    const W      = doc.internal.pageSize.getWidth();
    const purple = [168, 85, 247];
    const dark   = [17, 24, 39];
    const gray   = [107, 114, 128];
    const light  = [243, 244, 246];

    // ── Decide whether to show discount/markup column ─────────────────
    const hasItemDiscount = items.some(i => parseFloat(i.discount_amount || 0) > 0.01);
    const hasItemMarkup   = items.some(i => {
      const lt = parseFloat(i.line_total || 0);
      const la = parseFloat(i.line_total_after_discount || lt);
      return la > lt + 0.01;
    });
    const showAdjCol = hasItemDiscount || hasItemMarkup;

    // ── Header band ───────────────────────────────────────────────────
    doc.setFillColor(...purple);
    doc.rect(0, 0, W, 70, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24); doc.setFont('helvetica', 'bold');
    doc.text('QUOTE', 40, 46);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(quote.quote_number, W - 40, 38, { align: 'right' });
    doc.setFontSize(8);
    doc.text(`Generated ${format(new Date(), 'MMMM d, yyyy')}`, W - 40, 54, { align: 'right' });

    let y = 96;

    // ── Two-column meta block ─────────────────────────────────────────
    const metaLeft  = 40;
    const metaRight = W / 2 + 10;
    const labelW    = 110;

    const validFrom  = quote.valid_from  ? format(new Date(quote.valid_from),  'MMM d, yyyy') : '—';
    const validUntil = quote.valid_until ? format(new Date(quote.valid_until), 'MMM d, yyyy') : '—';

    const metaLeftRows = [
      ['Quote Number', quote.quote_number],
      ['Date',         format(new Date(quote.created_at), 'MMMM d, yyyy')],
      ['Valid From',   validFrom],
      ['Valid Until',  validUntil],
    ];

    const metaRightRows = [
      ['Customer', customerDisplayName],
      ['Company',  customer.company_name || '—'],
      ['Email',    customer.email        || '—'],
      ['Phone',    customer.phone        || '—'],
      ['Address',  (quote.shipping_address || '—').substring(0, 40)],
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
    const COL = showAdjCol ? {
      name:      40,
      uom:       270,
      qty:       330,
      unitPrice: 375,
      adj:       455,
      total:     W - 40,
    } : {
      name:      40,
      uom:       300,
      qty:       365,
      unitPrice: 415,
      total:     W - 40,
    };

    // Table header
    doc.setFillColor(...light);
    doc.rect(40, y, W - 80, 22, 'F');
    doc.setTextColor(...purple);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('ITEM',       COL.name      + 4, y + 15);
    doc.text('UNIT',       COL.uom       + 4, y + 15);
    doc.text('QTY',        COL.qty       + 4, y + 15);
    doc.text('UNIT PRICE', COL.unitPrice + 4, y + 15);
    if (showAdjCol) {
      doc.text(hasItemMarkup && !hasItemDiscount ? 'MARKUP' : 'DISCOUNT', COL.adj + 4, y + 15);
    }
    doc.text('TOTAL', COL.total, y + 15, { align: 'right' });
    y += 22;

    // Table rows
    doc.setFontSize(8.5);
    items.forEach((item, i) => {
      const nameText  = item.description || item.product_name || item.service_name || 'Item';
      const nameLines = doc.splitTextToSize(nameText, COL.uom - COL.name - 8);
      const rowH      = Math.max(20, nameLines.length * 13 + 8);

      if (y + rowH > 780) { doc.addPage(); y = 40; }

      const bg = i % 2 === 0 ? [255, 255, 255] : [250, 248, 255];
      doc.setFillColor(...bg);
      doc.rect(40, y, W - 80, rowH, 'F');

      const midY = y + rowH / 2 + 4;

      doc.setTextColor(...dark); doc.setFont('helvetica', 'normal');
      doc.text(nameLines, COL.name + 4, y + 13);

      doc.setTextColor(...gray);
      doc.text(item.unit_of_measure || 'each', COL.uom + 4, midY);

      doc.setTextColor(...dark);
      doc.text(String(parseFloat(item.quantity || 0)), COL.qty + 4, midY);
      doc.text(fmt(item.unit_price), COL.unitPrice + 4, midY);

      if (showAdjCol) {
        const discAmt   = parseFloat(item.discount_amount || 0);
        const lineTotal = parseFloat(item.line_total || 0);
        const lineAfter = parseFloat(item.line_total_after_discount || lineTotal);
        const isMarkup  = lineAfter > lineTotal + 0.01;

        if (discAmt > 0.01) {
          doc.setTextColor(16, 185, 129);
          doc.text(`-${fmt(discAmt)}`, COL.adj + 4, midY);
        } else if (isMarkup) {
          doc.setTextColor(249, 115, 22);
          doc.text(`+${fmt(lineAfter - lineTotal)}`, COL.adj + 4, midY);
        } else {
          doc.setTextColor(...gray);
          doc.text('—', COL.adj + 4, midY);
        }
      }

      doc.setTextColor(...dark); doc.setFont('helvetica', 'bold');
      doc.text(fmt(item.line_total_after_discount || item.line_total), COL.total, midY, { align: 'right' });

      y += rowH;
    });

    // Currency legend
    y += 6;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...gray);
    doc.text(`* All amounts in ${cs} (${displayCurrency})`, 44, y);
    y += 20;

    // ── Totals block ──────────────────────────────────────────────────
    const totalsX = W - 230;
    const totalsW = 190;

    if (totals) {
      const totalRows = [
        ['Subtotal',        fmt(totals.originalTotal)],
        ...(totals.itemDiscounts > 0     ? [['Item Discounts',  `-${fmt(totals.itemDiscounts)}`]]  : []),
        ...(totals.itemIncreases > 0     ? [['Item Increases',  `+${fmt(totals.itemIncreases)}`]]  : []),
        ...(totals.quoteDiscount > 0     ? [['Quote Discount',  `-${fmt(totals.quoteDiscount)}`]]  : []),
        ...(totals.tax > 0               ? [['Tax (VAT)',        fmt(totals.tax)]]                  : []),
        ...(totals.shipping > 0          ? [['Shipping',         fmt(totals.shipping)]]             : []),
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

      y += 4;
      doc.setFillColor(...purple);
      doc.rect(totalsX - 10, y, totalsW + 10, 28, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('TOTAL', totalsX, y + 19);
      doc.text(`${cs} ${fmt(totals.total)}`, totalsX + totalsW, y + 19, { align: 'right' });
      y += 44;
    }

    // ── Terms block ───────────────────────────────────────────────────
    if (quote.terms_and_conditions || quote.payment_terms || quote.delivery_terms) {
      if (y > 680) { doc.addPage(); y = 40; }

      doc.setDrawColor(...purple);
      doc.setLineWidth(0.5);
      doc.line(40, y, W - 40, y);
      y += 14;

      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...purple);
      doc.text('TERMS & CONDITIONS', 40, y);
      y += 14;

      [
        quote.terms_and_conditions && ['General Terms',   quote.terms_and_conditions],
        quote.payment_terms        && ['Payment Terms',   quote.payment_terms],
        quote.delivery_terms       && ['Delivery Terms',  quote.delivery_terms],
      ].filter(Boolean).forEach(([label, val]) => {
        if (y > 760) { doc.addPage(); y = 40; }
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
        doc.text(`${label}:`, 40, y);
        y += 12;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray);
        const lines = doc.splitTextToSize(val, W - 80);
        doc.text(lines, 40, y);
        y += lines.length * 11 + 8;
      });
    }

    // ── Customer notes ────────────────────────────────────────────────
    if (quote.customer_notes) {
      if (y > 730) { doc.addPage(); y = 40; }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
      doc.text('Notes:', 40, y);
      y += 12;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray);
      const noteLines = doc.splitTextToSize(quote.customer_notes, W - 80);
      doc.text(noteLines, 40, y);
      y += noteLines.length * 11 + 8;
    }

    // ── Footer ────────────────────────────────────────────────────────
    doc.setDrawColor(...purple);
    doc.setLineWidth(1);
    doc.line(40, y, W - 40, y);
    y += 14;
    doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business.', W / 2, y, { align: 'center' });

    doc.save(`${quote.quote_number}.pdf`);
    toast.success('Quote exported');
  } catch (e) {
    console.error(e);
    toast.error('Failed to export PDF');
  }
};

  const calculateTotals = () => {
    if (!quote?.items) return null;
    let originalTotal = 0, itemDiscounts = 0, itemIncreases = 0;
    quote.items.forEach(item => {
      originalTotal += parseFloat(item.line_total || 0);
      const d = parseFloat(item.discount_amount || 0);
      if (d > 0) itemDiscounts += d;
      else if (d < 0) itemIncreases += Math.abs(d);
    });
    const netItemAdjustment   = itemDiscounts - itemIncreases;
    const subtotalAfterItems  = originalTotal - netItemAdjustment;
    const quoteDiscount       = parseFloat(quote.discount || 0);
    const subtotalAfterAll    = subtotalAfterItems - quoteDiscount;
    const tax                 = parseFloat(quote.tax || 0);
    const shipping            = parseFloat(quote.shipping_cost || 0);
    const total               = subtotalAfterAll + tax + shipping;
    const totalSavings        = netItemAdjustment + quoteDiscount;
    return { originalTotal, itemDiscounts, itemIncreases, netItemAdjustment, subtotalAfterItems, quoteDiscount, subtotalAfterAll, tax, shipping, total, totalSavings };
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loadingCurrent) return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <LoadingSpinner size="lg" />
      </div>
    </AdminLayout>
  );

  if (!quote) return (
    <AdminLayout>
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <FileText size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#9ca3af', marginBottom: 20 }}>Quote not found</p>
        <Btn onClick={() => navigate('/admin/quotes')} variant="ghost" icon={<ChevronLeft size={16} />}>Back to Quotes</Btn>
      </div>
    </AdminLayout>
  );

  const customer    = quote.customer || {};
  const items       = quote.items || [];
  const totals      = calculateTotals();
  const displayCurrency   = quote?.currency || 'KES';
  const exchangeRateToKes = Number(quote?.exchange_rate_to_kes || 0);
  const exchangeDate      = quote?.converted_currency_at || null;
  const showKes           = displayCurrency !== 'KES' && exchangeRateToKes > 0;
  const canEdit = ['draft', 'pending'].includes(quote.status);
  const canSend = quote.status === 'draft' && items.length > 0;
  const customerDisplayName = getCustomerDisplayName(customer, quote);

  const csMap = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
  const cs = csMap[displayCurrency] || displayCurrency;
  const fmt = (n, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));
  const money = (v, d = 2) => `${cs} ${fmt(v, d)}`;
  const kesMoney = (v) => `KSh ${fmt(v)}`;

  return (
    <AdminLayout>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .qd-panel { animation: fadeUp 0.3s ease both; }
        .qd-panel:nth-child(1){animation-delay:0.03s}
        .qd-panel:nth-child(2){animation-delay:0.07s}
        .qd-panel:nth-child(3){animation-delay:0.11s}
        .qd-panel:nth-child(4){animation-delay:0.15s}
        .qd-panel:nth-child(5){animation-delay:0.19s}

        .qd-main-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 20px;
          align-items: start;
        }
        .qd-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .qd-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .qd-title {
          font-size: 1.6rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          margin: 0;
          color: #a855f7;
        }
        .qd-pills {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .qd-stat-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .qd-stat-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .qd-customer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        @media (max-width: 900px) { .qd-main-grid { grid-template-columns: 1fr; } }
        @media (max-width: 640px) {
          .qd-header { flex-direction: column; }
          .qd-header-actions { width: 100%; }
          .qd-header-actions > * { flex: 1 1 calc(50% - 4px); justify-content: center; }
          .qd-title { font-size: 1.25rem; }
          .qd-customer-grid { grid-template-columns: 1fr; }
          .qd-stat-grid-2 { grid-template-columns: 1fr; }
          .qd-stat-grid-3 { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 400px) {
          .qd-header-actions > * { flex: 1 1 100%; }
          .qd-stat-grid-3 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px 40px' }}>

        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="qd-header">
          <div>
            <button onClick={() => navigate('/admin/quotes')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, padding: 0, marginBottom: 10 }}>
              <ChevronLeft size={14} /> Back to Quotes
            </button>
            <div className="qd-pills">
              <h1 className="qd-title">{quote.quote_number}</h1>
              <QuoteStatusBadge status={quote.status} />
              {quote.priority && <Pill color={priorityColor[quote.priority] || '#9ca3af'}>{quote.priority} priority</Pill>}
              {quote.quote_type && <Pill color="#6b7280">{quote.quote_type === 'mixed' ? 'Mixed' : quote.quote_type === 'product' ? 'Products' : 'Services'}</Pill>}
              {quote.version && <Pill color="#9ca3af">v{quote.version}</Pill>}
              {quote.is_negotiable && <Pill color="#3b82f6">Negotiable</Pill>}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 6 }}>
              Created {format(new Date(quote.created_at), 'MMMM d, yyyy · h:mm a')}
            </p>
          </div>

          <div className="qd-header-actions">
            <Btn variant="outline" size="sm" icon={<Printer size={14} />} onClick={() => window.print()}>Print</Btn>
            
            <Btn variant="outline" size="sm" icon={<Download size={14} />} onClick={handleExportPDF}>
              Export PDF
            </Btn>
            {canSend && <Btn variant="success" size="sm" icon={<Send size={14} />} onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : 'Send to Customer'}</Btn>}
            {canEdit && <Btn variant="ghost" size="sm" icon={<Edit2 size={14} />} onClick={() => navigate(`/admin/quotes/${id}/edit`)}>Edit</Btn>}
            <Btn variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Btn>
          </div>
        </div>

        {/* ── Main grid ────────────────────────────────────────────── */}
        <div className="qd-main-grid">

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Customer */}
            <Panel className="qd-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={User}>Customer Information</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px' }}>
                <div className="qd-customer-grid">
                  {[
                    { label: 'Name',    value: customerDisplayName,    icon: User },
                    customer.company_name && { label: 'Company', value: customer.company_name, icon: Building },
                    customer.email       && { label: 'Email',   value: customer.email,        icon: Mail },
                    customer.phone       && { label: 'Phone',   value: customer.phone,        icon: Phone },
                  ].filter(Boolean).map(({ label, value, icon: Icon }) => (
                    <div key={label}>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon size={10} />{label}
                      </p>
                      <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0, wordBreak: 'break-all' }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* Items */}
            <Panel className="qd-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Package}>Quote Items · {items.length}</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((item, index) => {
                  const isExpanded        = expandedItems[index];
                  const originalPrice     = parseFloat(item.original_price || 0);
                  const unitPrice         = parseFloat(item.unit_price || 0);
                  const discountAmount    = parseFloat(item.discount_amount || 0);
                  const quantity          = parseFloat(item.quantity || 1);
                  const lineTotal         = parseFloat(item.line_total || 0);
                  const lineAfterDiscount = parseFloat(item.line_total_after_discount || 0);
                  const hasDiscount       = discountAmount !== 0;
                  const discPct           = originalPrice > 0 ? ((discountAmount / (originalPrice * quantity)) * 100).toFixed(1) : 0;
                  const isService         = item.item_type === 'service' || item.item_type === 'custom_service';

                  return (
                    <div key={index} style={{ borderRadius: 12, border: '1px solid var(--border,#f3f4f6)', overflow: 'hidden', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => !isExpanded && (e.currentTarget.style.borderColor = purpleBd)}
                      onMouseLeave={e => !isExpanded && (e.currentTarget.style.borderColor = 'var(--border,#f3f4f6)')}
                    >
                      {/* Card header */}
                      <div style={{ padding: '14px 16px', background: 'var(--row-bg,rgba(249,250,251,0.6))' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: isService ? 'rgba(59,130,246,0.08)' : purpleLt, border: `1px solid ${isService ? 'rgba(59,130,246,0.2)' : purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isService ? '#3b82f6' : purple }}>
                            {itemTypeIcon(item.item_type)}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                              <div>
                                <p style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 5px', wordBreak: 'break-word' }}>
                                  {item.description || item.product_name || item.service_name || 'Unnamed Item'}
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  <Pill color={isService ? '#3b82f6' : purple}>{itemTypeLabel(item.item_type)}</Pill>
                                  {item.is_custom_item      && <Pill color="#f59e0b">Custom</Pill>}
                                  {item.is_bulk_pricing     && <Pill color="#3b82f6">Bulk Pricing</Pill>}
                                  {item.is_negotiated_price && <Pill color="#8b5cf6">Negotiated</Pill>}
                                  {item.brand_name          && <Pill color="#6b7280">{item.brand_name}</Pill>}
                                  {item.product_sku         && <Pill color="#9ca3af">SKU: {item.product_sku}</Pill>}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text,#111827)', margin: 0 }}>{money(lineAfterDiscount)}</p>
                                  {hasDiscount && (
                                    <p style={{ fontSize: '0.72rem', margin: '3px 0 0' }}>
                                      <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>{money(lineTotal)}</span>
                                      <span style={{ marginLeft: 6, fontWeight: 700, color: discountAmount > 0 ? '#10b981' : '#ef4444' }}>
                                        {discountAmount > 0 ? `${Math.abs(discPct)}% off` : `${Math.abs(discPct)}% markup`}
                                      </span>
                                    </p>
                                  )}
                                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>{quantity} × {money(unitPrice)}</p>
                                  {showKes && (
                                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>{kesMoney(lineAfterDiscount * exchangeRateToKes)}</p>
                                  )}
                                </div>
                                <button onClick={() => toggleItem(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{ padding: '16px', borderTop: `1px solid ${purpleBd}`, background: purpleLt, display: 'flex', flexDirection: 'column', gap: 12 }}>

                          {/* Pricing grid */}
                          <div>
                            <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 8 }}>Pricing Details</p>
                            <div className="qd-stat-grid-3">
                              <StatCell label="Original Price" value={money(originalPrice)} />
                              <StatCell label="Unit Price"     value={money(unitPrice)} />
                              <StatCell label="Quantity"       value={`${quantity} ${item.unit_of_measure || 'unit'}`} />
                              {hasDiscount && <StatCell label={discountAmount > 0 ? 'Discount' : 'Markup'} value={`${money(Math.abs(discountAmount))} (${Math.abs(discPct)}%)`} accent />}
                              <StatCell label="Line Total"    value={money(lineTotal)} />
                              <StatCell label="After Discount" value={money(lineAfterDiscount)} accent />
                            </div>
                            {item.pricing_notes && (
                              <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 8, fontStyle: 'italic' }}>Note: {item.pricing_notes}</p>
                            )}
                          </div>

                          {/* Service details */}
                          {isService && (item.estimated_hours || item.hourly_rate || item.labor_cost || item.material_cost || item.estimated_duration || item.requires_site_visit != null) && (
                            <div>
                              <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', marginBottom: 8 }}>Service Details</p>
                              <div className="qd-stat-grid-3">
                                {item.estimated_hours    && <StatCell label="Est. Hours"     value={`${item.estimated_hours}h`} />}
                                {item.hourly_rate        && <StatCell label="Hourly Rate"    value={money(item.hourly_rate)} />}
                                {item.labor_cost         && <StatCell label="Labor Cost"     value={money(item.labor_cost)} />}
                                {item.material_cost      && <StatCell label="Material Cost"  value={money(item.material_cost)} />}
                                {item.estimated_duration && <StatCell label="Duration"       value={item.estimated_duration} />}
                                {item.requires_site_visit != null && <StatCell label="Site Visit" value={item.requires_site_visit ? 'Required' : 'Not Required'} />}
                              </div>
                              {(item.scheduled_start_date || item.scheduled_end_date) && (
                                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                  <p style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 700, margin: '0 0 3px' }}>Scheduled Period</p>
                                  <p style={{ fontSize: '0.82rem', color: '#1d4ed8', fontWeight: 600, margin: 0 }}>
                                    {item.scheduled_start_date && format(new Date(item.scheduled_start_date), 'MMM d, yyyy')}
                                    {item.scheduled_start_date && item.scheduled_end_date && ' – '}
                                    {item.scheduled_end_date && format(new Date(item.scheduled_end_date), 'MMM d, yyyy')}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Availability & lead time */}
                          {(item.availability_status || item.lead_time) && (
                            <div className="qd-stat-grid-2">
                              {item.availability_status && (() => {
                                const cfg = availabilityConfig[item.availability_status] || availabilityConfig.available;
                                return (
                                  <div>
                                    <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', marginBottom: 6 }}>Availability</p>
                                    <Pill color={cfg.color}>{cfg.label}</Pill>
                                  </div>
                                );
                              })()}
                              {item.lead_time && (
                                <div>
                                  <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', marginBottom: 6 }}>Lead Time</p>
                                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0 }}>{item.lead_time}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Prerequisites */}
                          {item.prerequisites && (
                            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderLeft: '3px solid #f59e0b', display: 'flex', gap: 8 }}>
                              <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                              <div>
                                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', margin: '0 0 3px' }}>Prerequisites</p>
                                <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0 }}>{item.prerequisites}</p>
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {item.notes && (
                            <p style={{ fontSize: '0.78rem', color: '#6b7280', fontStyle: 'italic', margin: 0 }}>Note: {item.notes}</p>
                          )}

                          {/* Tax status */}
                          <div>
                            {item.is_taxable
                              ? <Pill color="#10b981"><CheckCircle size={10} style={{ marginRight: 2 }} />Taxable</Pill>
                              : <Pill color="#9ca3af"><Info size={10} style={{ marginRight: 2 }} />Non-Taxable</Pill>
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Terms */}
            {(quote.terms_and_conditions || quote.payment_terms || quote.delivery_terms) && (
              <Panel className="qd-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={FileCheck}>Terms & Conditions</SectionLabel>
                </div>
                <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    quote.terms_and_conditions && { icon: FileCheck, label: 'General Terms',    value: quote.terms_and_conditions },
                    quote.payment_terms        && { icon: CreditCard, label: 'Payment Terms',   value: quote.payment_terms },
                    quote.delivery_terms       && { icon: Truck,      label: 'Delivery Terms',  value: quote.delivery_terms },
                  ].filter(Boolean).map(({ icon: Icon, label, value }) => (
                    <div key={label}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon size={11} />{label}
                      </p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{value}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Addresses */}
            {(quote.shipping_address || quote.billing_address) && (
              <Panel className="qd-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={MapPin}>Addresses</SectionLabel>
                </div>
                <div style={{ padding: '16px 22px' }}>
                  <div className="qd-customer-grid">
                    {quote.shipping_address && (
                      <div>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Truck size={11} />Shipping
                        </p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', whiteSpace: 'pre-wrap', margin: 0 }}>{quote.shipping_address}</p>
                      </div>
                    )}
                    {(quote.billing_address && !quote.billing_same_as_shipping) && (
                      <div>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <CreditCard size={11} />Billing
                        </p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', whiteSpace: 'pre-wrap', margin: 0 }}>{quote.billing_address}</p>
                      </div>
                    )}
                    {quote.billing_same_as_shipping && (
                      <div>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <CreditCard size={11} />Billing
                        </p>
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>Same as shipping address</p>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            )}

            {/* Notes */}
            {(quote.customer_notes || quote.admin_notes) && (
              <Panel className="qd-panel">
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={ClipboardList}>Notes</SectionLabel>
                </div>
                <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {quote.customer_notes && (
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8 }}>Customer Notes</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>{quote.customer_notes}</p>
                    </div>
                  )}
                  {quote.admin_notes && (
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ShieldCheck size={11} />Admin Notes (Internal)
                      </p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0, padding: '10px 14px', background: purpleLt, borderRadius: 10, border: `1px solid ${purpleBd}` }}>
                        {quote.admin_notes}
                      </p>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>

          {/* RIGHT COLUMN ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Financial summary */}
            {totals && (
              <Panel className="qd-panel" accent>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={DollarSign}>Financial Summary</SectionLabel>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Subtotal (Original)',           value: money(totals.originalTotal),       show: true },
                    { label: 'Item Discounts',                value: `-${money(totals.itemDiscounts)}`,  show: totals.itemDiscounts > 0, color: '#10b981', icon: TrendingDown },
                    { label: 'Item Increases',                value: `+${money(totals.itemIncreases)}`,  show: totals.itemIncreases > 0, color: '#ef4444', icon: TrendingUp },
                    { label: 'After Item Adjustments',        value: money(totals.subtotalAfterItems),   show: totals.itemDiscounts > 0 || totals.itemIncreases > 0, divider: true },
                    { label: 'Quote Discount',                value: `-${money(totals.quoteDiscount)}`,  show: totals.quoteDiscount > 0, color: purple, icon: Percent },
                    { label: 'After All Discounts',           value: money(totals.subtotalAfterAll),     show: totals.quoteDiscount > 0, divider: true },
                    { label: 'Tax (VAT)',                     value: `+${money(totals.tax)}`,            show: totals.tax > 0 },
                    { label: 'Shipping',                      value: `+${money(totals.shipping)}`,       show: totals.shipping > 0 },
                  ].filter(r => r.show).map(({ label, value, color, icon: Icon, divider }, i) => (
                    <div key={label} style={{ paddingTop: divider ? 8 : 0, borderTop: divider ? '1px solid var(--border,#f3f4f6)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {Icon && <Icon size={12} color={color} />}{label}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'var(--text,#111827)' }}>{value}</span>
                      </div>
                    </div>
                  ))}

                  {/* Savings banner */}
                  {totals.totalSavings !== 0 && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, margin: '4px 0', background: totals.totalSavings > 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${totals.totalSavings > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: totals.totalSavings > 0 ? '#065f46' : '#b91c1c' }}>
                          {totals.totalSavings > 0 ? 'Total Savings' : 'Additional Cost'}
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 900, color: totals.totalSavings > 0 ? '#10b981' : '#ef4444' }}>
                          {totals.totalSavings > 0 ? '-' : '+'}{money(Math.abs(totals.totalSavings))}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Grand total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 4, borderTop: '2px solid var(--border,#e5e7eb)' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text,#111827)' }}>Total</span>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '1.2rem', fontWeight: 900, color: purple, margin: 0 }}>{money(totals.total)}</p>
                      {showKes && <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic', margin: '2px 0 0' }}>{kesMoney(totals.total * exchangeRateToKes)}</p>}
                    </div>
                  </div>

                  {/* Exchange rate note */}
                  {showKes && (
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontStyle: 'italic', textAlign: 'right', margin: '2px 0 0' }}>
                      1 {displayCurrency} = {fmt(exchangeRateToKes, 4)} KES{exchangeDate ? ` · ${format(new Date(exchangeDate), 'MMM d, yyyy')}` : ''}
                    </p>
                  )}

                  {/* Pricing type */}
                  {quote.pricing_type && quote.pricing_type !== 'standard' && (
                    <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4, textAlign: 'right' }}>
                      Pricing type: <span style={{ fontWeight: 700, color: purple }}>{quote.pricing_type}</span>
                    </p>
                  )}
                </div>
              </Panel>
            )}

            {/* Timeline */}
            <Panel className="qd-panel">
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Clock}>Timeline</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px' }}>
                {[
                  { label: 'Created',          date: quote.created_at,          color: '#9ca3af', filled: true },
                  { label: 'Sent to Customer', date: quote.sent_at,             color: '#3b82f6' },
                  { label: 'Viewed',           date: quote.viewed_at,           color: '#10b981' },
                  quote.valid_from && quote.valid_until
                    ? { label: 'Valid Period', date: null, color: '#f59e0b', display: `${format(new Date(quote.valid_from), 'MMM d')} – ${format(new Date(quote.valid_until), 'MMM d, yyyy')}` }
                    : null,
                  quote.service_start_date
                    ? { label: 'Service Period', date: null, color: purple, display: `${format(new Date(quote.service_start_date), 'MMM d, yyyy')}${quote.service_end_date ? ` – ${format(new Date(quote.service_end_date), 'MMM d, yyyy')}` : ''}` }
                    : null,
                ].filter(t => t && (t.date || t.display)).map((t, i, arr) => (
                  <div key={t.label} style={{ display: 'flex', gap: 12, marginBottom: i < arr.length - 1 ? 12 : 0, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                      <TimelineDot color={t.color} filled={!!(t.date || t.display)} />
                      {i < arr.length - 1 && <div style={{ width: 1, height: 20, background: 'var(--border,#e5e7eb)', marginTop: 4 }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: t.date || t.display ? 'var(--text,#374151)' : '#d1d5db', margin: '0 0 2px' }}>{t.label}</p>
                      {(t.date || t.display) && (
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
                          {t.display || format(new Date(t.date), 'MMM d, yyyy · h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Assignment */}
            <Panel className="qd-panel">
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={User}>Assignment</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Created By', value: quote.creator?.name || quote.created_by_name || 'Unknown' },
                  (quote.assigned_to || quote.assigned_to_name) && { label: 'Assigned To', value: quote.assigned_to?.name || quote.assigned_to_name, sub: quote.assigned_to?.email },
                ].filter(Boolean).map(({ label, value, sub }) => (
                  <div key={label} style={{ paddingBottom: 10, borderBottom: '1px solid var(--border,#f9fafb)' }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', margin: '0 0 4px' }}>{label}</p>
                    <p style={{ fontSize: '0.88rem', fontWeight: 700, color: purple, margin: 0 }}>{value}</p>
                    {sub && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>{sub}</p>}
                  </div>
                ))}
              </div>
            </Panel>

            {/* Billing */}
            {quote.billing_schedule && (
              <Panel className="qd-panel">
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={CreditCard}>Billing</SectionLabel>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Schedule', value: quote.billing_schedule?.replace('_', ' ') },
                    { label: 'Currency', value: quote.currency || 'KES' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text,#111827)', textTransform: 'capitalize' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Related request */}
            {quote.quote_request && (
              <Panel className="qd-panel">
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                  <SectionLabel icon={FileText}>Related Request</SectionLabel>
                </div>
                <div style={{ padding: '14px 18px' }}>
                  <Btn variant="ghost" fullWidth icon={<FileText size={14} />} onClick={() => navigate(`/admin/quote-requests/${quote.quote_request.id}`)}>
                    View Request #{quote.quote_request.request_number}
                  </Btn>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default QuoteDetail;