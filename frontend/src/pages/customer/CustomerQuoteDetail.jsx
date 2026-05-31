import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Calendar, DollarSign, CheckCircle, XCircle,
  Package, Wrench, AlertCircle, Download, MapPin, CreditCard, X,
  Truck, Clock, Info, User, UserCheck, MessageSquare, Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import TextArea from '../../components/common/TextArea';
import api from '../../api/axios';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => {
  const n = Number(v);
  return Number.isNaN(n) ? '0.00' : new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
};
const safeDate = (v) => {
  if (!v) return null;
  const d = new Date(typeof v === 'string' ? v.replace(' ', 'T') : v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const STATUS_CFG = {
  draft:     { color: '#9ca3af', label: 'Draft' },
  pending:   { color: '#f59e0b', label: 'Pending' },
  revised:   { color: '#3b82f6', label: 'Revised' },
  approved:  { color: '#10b981', label: 'Approved' },
  rejected:  { color: '#ef4444', label: 'Rejected' },
  expired:   { color: '#9ca3af', label: 'Expired' },
  converted: { color: '#a855f7', label: 'Converted' },
};

const ITEM_TYPE_MAP = {
  product:        { label: 'Product',        color: '#a855f7' },
  custom_product: { label: 'Custom Product', color: '#3b82f6' },
  service:        { label: 'Service',        color: '#10b981' },
  custom_service: { label: 'Custom Service', color: '#f59e0b' },
};

const AVAIL_MAP = {
  in_stock:     { label: 'In Stock',      color: '#10b981' },
  available:    { label: 'Available',     color: '#10b981' },
  out_of_stock: { label: 'Out of Stock',  color: '#ef4444' },
  special_order:{ label: 'Special Order', color: '#f59e0b' },
  on_request:   { label: 'On Request',    color: '#3b82f6' },
};

// ── Primitives ────────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, accent, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden mb-5" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
      {accent && <div style={{ height: 3, background: accent }} />}
      <div className="p-6">
        {title && (
          <div className="flex items-center gap-2 mb-5">
            {Icon && <Icon size={14} color="#c084fc" />}
            <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: '#c084fc' }}>{title}</p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Chip({ children, color }) {
  return (
    <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, border: `1px solid ${color}33`, color }}>
      {children}
    </span>
  );
}

function AlertBox({ type, title, body, children }) {
  const C = {
    info:    { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)', ic: '#3b82f6', tc: '#1e40af', bc: '#1d4ed8', Icon: AlertCircle },
    warning: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.35)', ic: '#f59e0b', tc: '#92400e', bc: '#b45309', Icon: AlertCircle },
    danger:  { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.3)',   ic: '#ef4444', tc: '#991b1b', bc: '#b91c1c', Icon: XCircle },
    success: { bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.3)',  ic: '#10b981', tc: '#065f46', bc: '#047857', Icon: CheckCircle },
  }[type] || {};

  // Default to orange glow if type is missing or explicitly warning
  const border = C.border || 'rgba(245,158,11,0.35)';
  const bg = C.bg || 'rgba(245,158,11,0.08)';
  const ic = C.ic || '#f59e0b';
  const Icon = C.Icon || AlertCircle;

  return (
    <div 
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        background: bg,
        border: `1.5px solid ${border}`,
        boxShadow: `0 0 0 1px rgba(245,158,11,0.15), 0 4px 20px rgba(245,158,11,0.1)`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        transition: 'box-shadow 200ms ease, border-color 200ms ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 1px rgba(245,158,11,0.25), 0 6px 24px rgba(245,158,11,0.15)`;
        e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 1px rgba(245,158,11,0.15), 0 4px 20px rgba(245,158,11,0.1)`;
        e.currentTarget.style.borderColor = border;
      }}
    >
      <Icon size={15} color={ic} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 800, color: C.tc || '#92400e', margin: 0 }}>{title}</p>
        {body && <p style={{ fontSize: '0.78rem', color: C.bc || '#b45309', margin: '4px 0 0' }}>{body}</p>}
        {children && <div style={{ marginTop: 10 }}>{children}</div>}
      </div>
    </div>
  );
}

function GhostBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-none bg-transparent text-secondary text-sm font-bold transition-colors hover:border-purple-400 hover:text-purple-500 disabled:opacity-40">
      {children}
    </button>
  );
}

function PurpleBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-extrabold transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
      {children}
    </button>
  );
}

function TintBtn({ onClick, disabled, color, children }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{ background: `${color}14`, border: `1px solid ${color}33`, color }}>
      {children}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const CustomerQuoteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [customerNotesDraft, setCustomerNotesDraft] = useState('');
  const [itemView, setItemView] = useState('minimal');
  const [deliveryDraft, setDeliveryDraft] = useState({ shipping_address: '', billing_same_as_shipping: true, billing_address: '' });

  useEffect(() => { fetchQuoteDetail(); }, [id]);

  const fetchQuoteDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/customer/quotes/${id}`);
      const q = res.data;
      setQuote(q);
      setCustomerNotesDraft(q.customer_notes || '');
      setDeliveryDraft({ shipping_address: q.shipping_address || '', billing_same_as_shipping: q.billing_same_as_shipping ?? true, billing_address: q.billing_address || '' });
    } catch { toast.error('Failed to load quote details'); navigate('/my-quotes'); }
    finally { setLoading(false); }
  };

  const saveCustomerEdits = async (payload) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/customer/quotes/${quote.id}/customer-update`, payload);
      toast.success(res.data?.message || 'Updated');
      const q = res.data.quote; setQuote(q);
      setCustomerNotesDraft(q.customer_notes || '');
      setDeliveryDraft({ shipping_address: q.shipping_address || '', billing_same_as_shipping: q.billing_same_as_shipping ?? true, billing_address: q.billing_address || '' });
      setEditingNotes(false); setEditingDelivery(false);
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to update'); }
    finally { setActionLoading(false); }
  };

  const handleAccept = async () => {
    if (!window.confirm('Accept this quote? This action cannot be undone.')) return;
    setActionLoading(true);
    try { await api.post(`/customer/quotes/${id}/accept`); toast.success('Quote accepted!'); fetchQuoteDetail(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to accept quote'); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) { toast.error('Please provide a rejection reason'); return; }
    setActionLoading(true);
    try { await api.post(`/customer/quotes/${id}/reject`, { rejection_reason: rejectionReason }); toast.success('Quote rejected'); setShowRejectModal(false); fetchQuoteDetail(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to reject quote'); }
    finally { setActionLoading(false); }
  };

  const handleTrash = async () => {
    if (!window.confirm('Move this quote to trash?')) return;
    setActionLoading(true);
    try { await api.delete(`/customer/quotes/${quote.id}`); toast.success('Moved to trash'); navigate('/my-quotes'); }
    catch (err) { toast.error(err?.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  const handleRequestRevision = async () => {
    setActionLoading(true);
    try { const res = await api.post(`/customer/quotes/${quote.id}/request-revision`); toast.success(res.data?.message || 'Revision requested'); if (res.data?.quote) setQuote(res.data.quote); }
    catch (err) { toast.error(err?.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  const handleProceed = async () => {
    setActionLoading(true);
    try {
      const res = await api.post(`/customer/quotes/${quote.id}/convert-to-order`);
      const orderId = res.data?.order_id;
      if (!orderId) { toast.error('Conversion succeeded but no order ID returned'); return; }
      toast.success('Converted to order'); navigate(`/orders/${orderId}`);
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to convert'); }
    finally { setActionLoading(false); }
  };

  const handleDownloadPDF = async () => {
  const toastId = toast.loading('Generating Quote PDF...');
  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const M = 15;
    const CW = W - M * 2;
    let y = M;

    // ── Helpers ──────────────────────────────────────────────────────────
    const hexToRgb = (hex) => {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r
        ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
        : { r: 168, g: 85, b: 247 };
    };

    // opacity wrapper — GState wraps the draw call, not just the color setter
    const withOpacity = (op, fn) => {
      pdf.setGState(pdf.GState({ opacity: op }));
      fn();
      pdf.setGState(pdf.GState({ opacity: 1 }));
    };

    const need = (h) => { if (y + h > H - M) { pdf.addPage(); y = M; } };

    const hline = (op = 1) => {
      withOpacity(op, () => {
        pdf.setDrawColor(168, 85, 247);
        pdf.setLineWidth(0.3);
        pdf.line(M, y, W - M, y);
      });
      y += 7;
    };

    const sectionTitle = (text) => {
      need(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(124, 58, 237);
      pdf.text(text, M, y);
      y += 5;
      withOpacity(0.3, () => {
        pdf.setDrawColor(168, 85, 247);
        pdf.setLineWidth(0.25);
        pdf.line(M, y, W - M, y);
      });
      y += 6;
    };

    const kv = (label, value) => {
      need(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text(label, M, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(17, 24, 39);
      const lines = pdf.splitTextToSize(String(value || '—'), CW - 5);
      pdf.text(lines, M, y + 5);
      y += 5 + lines.length * 4.5 + 4;
    };

    const pill = (x, py, label, colorHex) => {
      const { r, g, b } = hexToRgb(colorHex);
      pdf.setFontSize(7);
      const tw = pdf.getTextWidth(label);
      const pw = tw + 14;
      withOpacity(0.12, () => {
        pdf.setFillColor(r, g, b);
        pdf.roundedRect(x, py - 4.5, pw, 6, 3, 3, 'F');
      });
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(x, py - 4.5, pw, 6, 3, 3, 'S');
      pdf.setFillColor(r, g, b);
      pdf.circle(x + 4, py - 1.5, 1.2, 'F');
      pdf.setTextColor(r, g, b);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x + 8, py);
      return pw + 3;
    };

    const pdfFmt = (v, d = 2) =>
      Number.isNaN(Number(v)) ? '0.00' : Number(v).toFixed(d).replace(/\d(?=(\d{3})+\.)/g, '$&,');

    const pdfDate = (v) =>
      v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';

    // ── HEADER ───────────────────────────────────────────────────────────
    pdf.setFillColor(168, 85, 247);
    pdf.rect(0, 0, W, 3, 'F');
    y = M + 5;

    // Quote number
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(28, 28, 28);
    pdf.text(quote.quote_number || 'QUOTE', M, y);

    // Total — right
    pdf.setFontSize(15);
    pdf.setTextColor(124, 58, 237);
    pdf.text(`${quote.currency || 'KES'} ${pdfFmt(quote.total)}`, W - M, y, { align: 'right' });

    y += 6;

    // Version + date
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Version v${quote.version || 1}  ·  Generated ${pdfDate(new Date())}`, M, y);

    // KES equivalent if foreign currency
    if (quote.total_kes && quote.currency !== 'KES') {
      pdf.setFontSize(8);
      pdf.text(`KES ${pdfFmt(quote.total_kes)}`, W - M, y, { align: 'right' });
    }

    y += 8;

    // Status pill
    const st = STATUS_CFG[quote.status] || STATUS_CFG.draft;
    let px = M;
    px += pill(px, y, st.label, st.color);
    if (quote.currency !== 'KES' && quote.exchange_rate_to_kes) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(
        `1 ${quote.currency} = ${pdfFmt(quote.exchange_rate_to_kes, 4)} KES  ·  as of ${pdfDate(quote.converted_at || quote.created_at)}`,
        px + 4, y
      );
    }

    y += 10;
    hline(0.25);

    // ── PREPARED BY / ASSIGNED TO ────────────────────────────────────────
    sectionTitle('Team');

    const personCard = (label, name, email, assignedAt) => {
      need(24);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text(label, M, y);
      y += 5;

      const cardH = 20;
      // card border only — no fill so text is always readable
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, cardH, 4, 4, 'FD');

      // Avatar circle
      withOpacity(0.1, () => {
        pdf.setFillColor(168, 85, 247);
        pdf.circle(M + 13, y + 10, 7, 'F');
      });
      const initials = (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(124, 58, 237);
      pdf.text(initials, M + 13, y + 12, { align: 'center' });

      // Name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(name || '—', M + 26, y + 9);

      // Email
      if (email) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(124, 58, 237);
        pdf.text(email, M + 26, y + 15);
      }

      // Date
      if (assignedAt) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(pdfDate(assignedAt), W - M - 6, y + 9, { align: 'right' });
      }

      y += cardH + 6;
    };

    if (quote.creator) {
      const creatorName = quote.creator.name ||
        `${quote.creator.first_name || ''} ${quote.creator.last_name || ''}`.trim();
      personCard('Prepared By', creatorName, quote.creator.email, quote.created_at);
    }

    if (quote.assigned_to_name || quote.assigned_to) {
      const assignedName = quote.assigned_to_name || quote.assigned_to?.name ||
        `${quote.assigned_to?.first_name || ''} ${quote.assigned_to?.last_name || ''}`.trim();
      const assignedEmail = quote.assigned_to?.email;
      personCard('Assigned To', assignedName, assignedEmail, quote.assigned_at);
    }

    // Customer notes
    if (quote.customer_notes) {
      need(20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text('Customer Notes', M, y);
      y += 5;

      const notes = pdf.splitTextToSize(quote.customer_notes, CW - 12);
      const notesH = notes.length * 4.5 + 14;
      need(notesH);

      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, notesH, 4, 4, 'FD');

      // purple left accent
      pdf.setFillColor(168, 85, 247);
      pdf.roundedRect(M, y, 3, notesH, 2, 2, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(55, 65, 81);
      pdf.text(notes, M + 8, y + 8);
      y += notesH + 8;
    }

    hline(0.2);

    // ── QUOTE ITEMS ──────────────────────────────────────────────────────
    sectionTitle(`Quote Items  ·  ${(quote.items || []).length}`);

    (quote.items || []).forEach((item, idx) => {
      const isService = item.item_type?.includes('service');
      const isFee     = item.item_type === 'fee';
      const typeColor = isService ? '#10b981' : isFee ? '#ec4899' : '#a855f7';
      const { r: ir, g: ig, b: ib } = hexToRgb(typeColor);

      const qty       = parseFloat(item.quantity    || 1);
      const unitPrice = parseFloat(item.unit_price  || 0);
      const discAmt   = parseFloat(item.discount_amount || 0);
      const lineTotal = parseFloat(item.line_total  || qty * unitPrice);
      const lineAfter = parseFloat(item.line_total_after_discount || lineTotal);

      const hasDiscount = discAmt >  0.01;
      const hasMarkup   = discAmt < -0.01;

      // original unit price derived from line_total / qty
      const origUnitPrice = qty > 0 ? lineTotal / qty : unitPrice;

      const nameLines  = pdf.splitTextToSize(item.product_name || item.service_name || `Item ${idx + 1}`, CW - 30);
      const hasSchedule = !!(item.scheduled_start_date);
      const hasVariants = item.variant_details && Object.keys(item.variant_details).filter(k => item.variant_details[k]).length > 0;
      const hasLead     = !!(item.lead_time);
      const hasPricing  = !!(item.pricing_notes);

      const cardH = 8                                     // top pad
        + nameLines.length * 5 + 2                       // name
        + 14                                             // grid header + values
        + (hasDiscount || hasMarkup ? 7 : 0)             // orig price row
        + (hasSchedule ? 7 : 0)
        + (hasLead     ? 7 : 0)
        + (hasVariants ? 12 : 0)
        + (hasPricing  ? 7 : 0)
        + 8;                                             // bottom pad

      need(cardH);
      const cardTop = y;

      // Card — white bg, light border
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, cardH, 4, 4, 'FD');

      // Left accent bar
      pdf.setFillColor(ir, ig, ib);
      pdf.roundedRect(M, y, 3, cardH, 2, 2, 'F');

      // Type icon square
      pdf.setFillColor(ir, ig, ib);
      pdf.roundedRect(M + 7, y + 5, 9, 9, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(isService ? 'S' : isFee ? 'F' : 'P', M + 11.5, y + 11, { align: 'center' });

      // Item name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(nameLines, M + 20, y + 8);

      // Item type chip
      pdf.setFontSize(6);
      pdf.setTextColor(ir, ig, ib);
      pdf.text((item.item_type || '').replace(/_/g, ' ').toUpperCase(), M + 20, y + 8 + nameLines.length * 5 + 1);

      // ── Pricing grid ──────────────────────────────────────────────────
      const gTop = y + 8 + nameLines.length * 5 + 6;

      // header band
      pdf.setFillColor(248, 246, 255);
      pdf.rect(M + 4, gTop, CW - 8, 6, 'F');

      // 5 columns: Unit Price | Qty | Subtotal | Discount/Markup/— | Total
      const C = [
        M + 6,          // Unit Price
        M + CW * 0.22,  // Qty
        M + CW * 0.37,  // Subtotal
        M + CW * 0.58,  // Discount / Markup / —
        M + CW - 5,     // Total (right-align)
      ];

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);
      pdf.setTextColor(107, 114, 128);
      pdf.text('Unit Price',    C[0], gTop + 4);
      pdf.text('Qty',           C[1], gTop + 4);
      pdf.text('Subtotal',      C[2], gTop + 4);
      pdf.text(
        hasDiscount ? 'Discount' : hasMarkup ? 'Markup' : '—',
        C[3], gTop + 4
      );
      pdf.text('Total', C[4], gTop + 4, { align: 'right' });

      // Values row
      const vY = gTop + 11;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(17, 24, 39);
      pdf.text(pdfFmt(unitPrice), C[0], vY);
      pdf.text(String(qty),       C[1], vY);

      // Subtotal — strikethrough when adjusted
      if (hasDiscount || hasMarkup) {
        pdf.setTextColor(156, 163, 175);
        pdf.text(pdfFmt(lineTotal), C[2], vY);
      } else {
        pdf.setTextColor(17, 24, 39);
        pdf.text(pdfFmt(lineTotal), C[2], vY);
      }

      // Discount / Markup
      if (hasDiscount) {
        pdf.setTextColor(16, 185, 129);
        pdf.text(`-${pdfFmt(discAmt)}`, C[3], vY);
      } else if (hasMarkup) {
        pdf.setTextColor(249, 115, 22);
        pdf.text(`+${pdfFmt(Math.abs(discAmt))}`, C[3], vY);
      } else {
        pdf.setTextColor(156, 163, 175);
        pdf.text('—', C[3], vY);
      }

      // Total
      pdf.setTextColor(124, 58, 237);
      pdf.setFontSize(8.5);
      pdf.text(pdfFmt(lineAfter), C[4], vY, { align: 'right' });

      // Unit of measure + original unit price
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.setTextColor(156, 163, 175);
      if (item.unit_of_measure) {
        pdf.text(`per ${item.unit_of_measure}`, C[0], vY + 5);
      }

      let innerY = vY + 7;

      // Original unit price (when adjusted)
      if (hasDiscount || hasMarkup) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(156, 163, 175);
        pdf.text('orig:', C[0], innerY);
        const origText  = pdfFmt(origUnitPrice);
        const origTextX = C[0] + pdf.getTextWidth('orig: ');
        pdf.text(origText, origTextX, innerY);
        innerY += 6;
      }

      // Divider before extra details
      if (hasSchedule || hasLead || hasVariants || hasPricing) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.2);
        pdf.line(M + 4, innerY - 1, M + CW - 4, innerY - 1);
      }

      // Schedule
      if (hasSchedule) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        const schedText = `Schedule: ${pdfDate(item.scheduled_start_date)}${item.scheduled_end_date ? ' -> ' + pdfDate(item.scheduled_end_date) : ''}`;
        pdf.text(schedText, M + 6, innerY + 4);
        innerY += 7;
      }

      // Lead time
      if (hasLead) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Lead time: ${item.lead_time}`, M + 6, innerY + 4);
        innerY += 7;
      }

      // Pricing notes
      if (hasPricing) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Note: ${item.pricing_notes}`, M + 6, innerY + 4);
        innerY += 7;
      }

      // Variants
      if (hasVariants) {
        const vKeys = Object.keys(item.variant_details).filter(k => item.variant_details[k]);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6);
        pdf.setTextColor(168, 85, 247);
        pdf.text('Variants:', M + 6, innerY + 4);
        const vTxt = vKeys.map(k => `${k}: ${item.variant_details[k]}`).join('  ·  ');
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(17, 24, 39);
        pdf.text(pdf.splitTextToSize(vTxt, CW - 30)[0], M + 26, innerY + 4);
        innerY += 7;
      }

      y = cardTop + cardH + 5;
    });

    y += 4;
    hline(0.2);

    // ── PRICING SUMMARY ──────────────────────────────────────────────────
    sectionTitle('Pricing Summary');

    const summaryRows = [
      { label: 'Subtotal',                              value: `${quote.currency || 'KES'} ${pdfFmt(quote.subtotal)}` },
      quote.discount > 0 && { label: 'Discount',        value: `-${pdfFmt(quote.discount)}`,   color: '#10b981' },
      quote.tax > 0      && { label: 'Tax (16%)',        value: pdfFmt(quote.tax) },
      quote.shipping_cost > 0 && { label: 'Shipping',   value: pdfFmt(quote.shipping_cost) },
      { label: 'Total', value: `${quote.currency || 'KES'} ${pdfFmt(quote.total)}`, bold: true },
    ].filter(Boolean);

    const showKes = !!(quote.total_kes && quote.currency !== 'KES');
    const sumH = summaryRows.length * 9 + (showKes ? 18 : 0) + (quote.billing_schedule ? 10 : 0) + 12;
    need(sumH);

    pdf.setFillColor(249, 250, 251);
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(M, y, CW, sumH, 4, 4, 'FD');

    let sY = y + 7;
    summaryRows.forEach((row, i) => {
      const isLast = i === summaryRows.length - 1;
      if (isLast) {
        withOpacity(0.07, () => {
          pdf.setFillColor(168, 85, 247);
          pdf.rect(M, sY - 5, CW, 10, 'F');
        });
      }
      pdf.setFont('helvetica', isLast ? 'bold' : 'normal');
      pdf.setFontSize(isLast ? 10 : 8.5);

      if (row.color) {
        const { r, g, b } = hexToRgb(row.color);
        pdf.setTextColor(r, g, b);
      } else if (isLast) {
        pdf.setTextColor(124, 58, 237);
      } else {
        pdf.setTextColor(107, 114, 128);
      }
      pdf.text(row.label, M + 8, sY);
      pdf.setFont('helvetica', 'bold');
      pdf.text(row.value, W - M - 8, sY, { align: 'right' });

      if (!isLast) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.2);
        pdf.line(M + 8, sY + 3, W - M - 8, sY + 3);
      }
      sY += 9;
    });

    // KES equivalent
    if (showKes) {
      pdf.setDrawColor(168, 85, 247);
      pdf.setLineDashPattern([2, 2], 0);
      pdf.line(M + 8, sY + 1, W - M - 8, sY + 1);
      pdf.setLineDashPattern([], 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(124, 58, 237);
      pdf.text(`KES Equivalent: ${pdfFmt(quote.total_kes)}`, M + 8, sY + 7);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(
        `1 ${quote.currency} = ${pdfFmt(quote.exchange_rate_to_kes, 6)} KES  ·  as of ${pdfDate(quote.converted_at || quote.created_at)}`,
        M + 8, sY + 13
      );
      sY += 16;
    }

    // Billing schedule
    if (quote.billing_schedule) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(124, 58, 237);
      pdf.text(`Billing: ${quote.billing_schedule.replace(/_/g, ' ')}`, M + 8, sY + 5);
    }

    y += sumH + 10;
    hline(0.2);

    // ── DELIVERY & VALIDITY ──────────────────────────────────────────────
    sectionTitle('Delivery & Validity');

    // Shipping address — plain, no background
    kv('Shipping Address', quote.shipping_address || 'Not provided');

    // Validity dates — plain list, no card background
    const validityDates = [
      quote.valid_from        && { label: 'Valid From',    value: pdfDate(quote.valid_from) },
      quote.valid_until       && { label: 'Valid Until',   value: pdfDate(quote.valid_until) },
      quote.service_start_date && { label: 'Service Start',value: pdfDate(quote.service_start_date) },
      quote.service_end_date   && { label: 'Service End',  value: pdfDate(quote.service_end_date) },
    ].filter(Boolean);

    validityDates.forEach(d => kv(d.label, d.value));

    y += 4;

    // ── TERMS & CONDITIONS ───────────────────────────────────────────────
    if (quote.terms_and_conditions || quote.payment_terms) {
      hline(0.2);
      sectionTitle('Terms & Conditions');

      if (quote.payment_terms) {
        kv('Payment Terms', quote.payment_terms);
      }

      if (quote.terms_and_conditions) {
        const tLines = pdf.splitTextToSize(quote.terms_and_conditions, CW);
        need(tLines.length * 4 + 10);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(tLines, M, y);
        y += tLines.length * 4 + 10;
      }
    }

    // ── FOOTER ───────────────────────────────────────────────────────────
    y += 8;
    need(18);

    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.line(M, y, W - M, y);
    y += 7;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(124, 58, 237);
    pdf.text('Thank you for your business!', W / 2, y, { align: 'center' });

    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(107, 114, 128);
    pdf.text(
      `Generated on ${format(new Date(), 'MMMM d, yyyy')} · ${quote.quote_number}`,
      W / 2, y, { align: 'center' }
    );

    pdf.save(`Quote-${quote.quote_number || 'Detail'}.pdf`);
    toast.success('PDF downloaded!', { id: toastId });

  } catch (e) {
    console.error(e);
    toast.error('Failed to generate PDF', { id: toastId });
  }
};

  if (loading) return (
    <div style={{ minHeight: '100vh' }}>
      <Header /><div style={{ display: 'flex', justifyContent: 'center', padding: '96px 24px' }}><LoadingSpinner size="lg" /></div><Footer />
    </div>
  );
  if (!quote) return (
    <div style={{ minHeight: '100vh' }}>
      <Header /><div style={{ display: 'flex', justifyContent: 'center', padding: '80px 24px' }}><p style={{ color: '#9ca3af' }}>Quote not found</p></div><Footer />
    </div>
  );

  const cc = quote.currency || 'KES';
  const isNonKes = cc !== 'KES';
  const showKes = isNonKes && quote.total_kes != null && quote.subtotal_kes != null;
  const statusCfg = STATUS_CFG[quote.status] || STATUS_CFG.draft;
  const canAct = quote.status === 'pending' || quote.status === 'revised';
  const isFinalized = quote.status === 'approved' || quote.status === 'rejected';
  const isConverted = quote.status === 'converted';
  const canTrash = quote.status === 'draft' || quote.status === 'pending';

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '2px solid rgba(168,85,247,0.15)', padding: '28px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Back button */}
          <button
            onClick={() => navigate('/my-quotes')}
            type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', marginBottom: 24, borderRadius: 10,
              border: '1px solid rgba(168,85,247,0.2)', background: 'transparent',
              color: '#c084fc', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#c084fc'; }}
          >
            <ArrowLeft size={12} /> Back to My Quotes
          </button>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>

            {/* Left: number + badges */}
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#c084fc', marginBottom: 6 }}>Quote</p>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: 'var(--text-primary, #111827)' }}>
                {quote.quote_number}
              </h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
                {/* Status pill */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '4px 12px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 800,
                  background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}44`, color: statusCfg.color,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusCfg.color, boxShadow: `0 0 5px ${statusCfg.color}` }} />
                  {statusCfg.label}
                </span>
                {/* Version */}
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 9999,
                  background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7',
                }}>
                  v{quote.version || 1}
                </span>
                {/* Quote type */}
                {quote.quote_type && (
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 9999,
                    background: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.2)', color: '#6b7280',
                  }}>
                    {quote.quote_type === 'mixed' ? 'Product & Service' : quote.quote_type}
                  </span>
                )}
                {quote.is_negotiable && <Chip color="#3b82f6">Negotiable</Chip>}
              </div>
            </div>

            {/* Right: total */}
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 4 }}>Total</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#a855f7', margin: 0 }}>
                {cc} {fmt(quote.total)}
              </p>
              {showKes && (
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 4 }}>≈ KES {fmt(quote.total_kes)}</p>
              )}
            </div>
          </div>

          {/* Actions row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 16, borderTop: '1px solid rgba(168,85,247,0.12)' }}>
            <button
              onClick={handleDownloadPDF}
              disabled={actionLoading}
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                border: '1.5px solid rgba(168,85,247,0.35)', background: 'transparent',
                color: '#a855f7', fontSize: '0.82rem', fontWeight: 700, transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(168,85,247,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <Download size={14} /> Download PDF
            </button>
            {canAct && (
              <>
                <PurpleBtn onClick={handleAccept} disabled={actionLoading}><CheckCircle size={14} /> Accept Quote</PurpleBtn>
                <TintBtn onClick={() => setShowRejectModal(true)} disabled={actionLoading} color="#ef4444"><XCircle size={14} /> Reject Quote</TintBtn>
              </>
            )}
            {isFinalized && (
              <>
                {quote.status === 'approved' && <PurpleBtn onClick={handleProceed} disabled={actionLoading}>Proceed to Order</PurpleBtn>}
                {quote.status === 'rejected' && <TintBtn onClick={handleRequestRevision} disabled={actionLoading} color="#3b82f6">Request Revision</TintBtn>}
              </>
            )}
            {isConverted && <TintBtn onClick={() => navigate(`/orders/${quote.converted_to_order_id}`)} color="#10b981">View Order</TintBtn>}
            {canTrash && <TintBtn onClick={handleTrash} disabled={actionLoading} color="#ef4444"><Trash2 size={14} /> Move to Trash</TintBtn>}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 64px' }}>
        {canAct && (
          <div style={{ marginBottom: 20 }}>
            <AlertBox type="info" title="Action Required"
              body={`Review this quote and accept or reject it before ${new Date(quote.valid_until).toLocaleDateString()}.`} />
          </div>
        )}
        {quote.status === 'rejected' && quote.rejection_reason && (
          <div style={{ marginBottom: 20 }}>
            <AlertBox type="danger" title="Rejection Reason" body={quote.rejection_reason} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>

          {/* ── LEFT ──────────────────────────────────────────────────────── */}
          <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
            {/* Team */}
            {(quote.creator || quote.assigned_to || quote.assigned_to_name) && (
              <Section title="Team" icon={UserCheck} accent="#a855f7">
                <div className="flex flex-col gap-4">
                  {quote.creator && (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(168,85,247,0.1)', border: '2px solid rgba(168,85,247,0.2)' }}>
                        <User size={15} color="#a855f7" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold">Prepared by</p>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{quote.creator.name || `${quote.creator.first_name} ${quote.creator.last_name}`}</p>
                        {quote.creator.email && <a href={`mailto:${quote.creator.email}`} className="text-xs font-semibold" style={{ color: '#a855f7' }}>{quote.creator.email}</a>}
                      </div>
                    </div>
                  )}
                  {(quote.assigned_to || quote.assigned_to_name) && (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.1)', border: '2px solid rgba(59,130,246,0.2)' }}>
                        <UserCheck size={15} color="#3b82f6" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold">Assigned to</p>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{quote.assigned_to?.name || quote.assigned_to_name}</p>
                        {quote.assigned_to?.email && <a href={`mailto:${quote.assigned_to.email}`} className="text-xs font-semibold" style={{ color: '#3b82f6' }}>{quote.assigned_to.email}</a>}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Your Notes */}
            <Section title="Your Notes" icon={MessageSquare}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <p className="text-xs text-gray-400 dark:text-gray-500">Add delivery preferences, timing, or special instructions.</p>
                {!editingNotes ? (
                  <button onClick={() => setEditingNotes(true)} type="button"
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors flex-shrink-0">
                    {quote.customer_notes?.trim() ? 'Edit' : 'Add Note'}
                  </button>
                ) : (
                  <div className="flex gap-2 flex-shrink-0">
                    <GhostBtn onClick={() => { setEditingNotes(false); setCustomerNotesDraft(quote.customer_notes || ''); }} disabled={actionLoading}>Cancel</GhostBtn>
                    <PurpleBtn onClick={() => saveCustomerEdits({ customer_notes: customerNotesDraft })} disabled={actionLoading}>Save</PurpleBtn>
                  </div>
                )}
              </div>
              {!editingNotes
                ? <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{quote.customer_notes?.trim() || <span className="italic text-gray-400 dark:text-gray-500">No notes yet.</span>}</p>
                : <TextArea label="" value={customerNotesDraft} onChange={e => setCustomerNotesDraft(e.target.value)} rows={5} placeholder="Add delivery preferences, timing, or special instructions..." />
              }
            </Section>

            {/* Quote Items */}
            <Section title="Quote Items" icon={Package}>
              {/* View toggle */}
              {quote.items?.length > 0 && (
                <div className="flex items-center gap-2 mb-4 p-1 rounded-xl w-fit" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  {['minimal', 'detailed'].map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setItemView(mode)}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize"
                      style={itemView === mode ? {
                        background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                        color: 'white',
                        boxShadow: '0 2px 8px rgba(168,85,247,0.35)',
                      } : { color: '#a78bfa' }}>
                      {mode}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-4">
                {quote.items?.map((item, idx) => {
                  const typeCfg = ITEM_TYPE_MAP[item.item_type] || { label: item.item_type, color: '#9ca3af' };
                  const availCfg = item.availability_status ? AVAIL_MAP[item.availability_status] : null;
                  const isService = item.item_type === 'service' || item.item_type === 'custom_service';
                  const ItemIcon = isService ? Wrench : Package;

                  return (
                    <div key={idx} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                      <div className="p-4">

                        {/* Item header — always visible */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${typeCfg.color}18` }}>
                            <ItemIcon size={16} color={typeCfg.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">{item.product_name || item.service_name || item.description}</h3>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <Chip color={typeCfg.color}>{typeCfg.label}</Chip>
                              {availCfg && <Chip color={availCfg.color}>{availCfg.label}</Chip>}
                              {item.product_sku && <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold">SKU: {item.product_sku}</span>}
                              {item.brand_name && <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold">{item.brand_name}</span>}
                              {item.is_negotiated_price && <Chip color="#3b82f6">Negotiated</Chip>}
                              {item.is_bulk_pricing && <Chip color="#a855f7">Bulk Pricing</Chip>}
                              {item.is_taxable && <Chip color="#10b981">Taxable</Chip>}
                              {item.requires_site_visit && <Chip color="#f59e0b">Site Visit Required</Chip>}
                            </div>
                          </div>
                        </div>

                        {item.description && item.description !== item.product_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">{item.description}</p>
                        )}

                        {/* ── MINIMAL VIEW ── */}
                        {itemView === 'minimal' && (
                          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                            <div className="grid text-xs font-extrabold uppercase tracking-wider px-4 py-2.5"
                              style={{ borderBottom: '1px solid rgba(168,85,247,0.2)', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'rgba(168,85,247,0.08)', color: '#c084fc' }}>
                              <span>Unit Price</span>
                              <span className="text-center">Quantity</span>
                              <span className="text-center">
                                {parseFloat(item.unit_price || 0) > parseFloat(item.original_price || 0) && parseFloat(item.original_price || 0) > 0 ? 'Markup' : 'Discount'}
                              </span>
                              <span className="text-right">Total</span>
                            </div>
                            <div className="grid items-center px-4 py-3 bg-white dark:bg-gray-800 text-xs"
                              style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                              <div>
                                <p className="font-extrabold text-gray-800 dark:text-gray-200">{cc} {fmt(item.unit_price || 0)}</p>
                                {item.original_price && parseFloat(item.unit_price) < parseFloat(item.original_price) && (
                                  <p className="text-gray-400 dark:text-gray-500 line-through mt-0.5">{cc} {fmt(item.original_price)}</p>
                                )}
                                {item.unit_of_measure && <p className="text-gray-400 dark:text-gray-500 mt-0.5">per {item.unit_of_measure}</p>}
                              </div>
                              <div className="text-center">
                                <p className="font-extrabold text-gray-800 dark:text-gray-200">{fmt(item.quantity)}</p>
                              </div>
                              <div className="text-center">
                                {(() => {
                                  const orig = parseFloat(item.original_price || 0);
                                  const unit = parseFloat(item.unit_price || 0);
                                  const discAmt = parseFloat(item.discount_amount || 0);
                                  const qty = parseFloat(item.quantity || 1);
                                  if (unit > orig && orig > 0) {
                                    const pct = ((unit - orig) / orig * 100).toFixed(1);
                                    return <><p className="font-extrabold" style={{ color: '#f97316' }}>+{cc} {fmt((unit - orig) * qty)}</p><p className="mt-0.5" style={{ color: '#f97316' }}>{pct}% up</p></>;
                                  }
                                  if (discAmt > 0.001 && orig > 0) {
                                    const pct = ((orig - unit) / orig * 100).toFixed(1);
                                    return <><p className="font-extrabold" style={{ color: '#10b981' }}>-{cc} {fmt(discAmt)}</p><p className="mt-0.5" style={{ color: '#10b981' }}>{pct}% off</p></>;
                                  }
                                  return <p className="text-gray-300 dark:text-gray-600">—</p>;
                                })()}
                              </div>
                              <div className="text-right">
                                <p className="font-extrabold text-sm" style={{ color: '#a855f7' }}>
                                  {cc} {fmt(item.line_total_after_discount ?? (parseFloat(item.unit_price || 0) * parseFloat(item.quantity || 0)))}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── DETAILED VIEW ── */}
                        {itemView === 'detailed' && (
                          <>
                            {/* Pricing breakdown */}
                            <div className="rounded-xl overflow-hidden mt-3" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                              <div className="grid text-xs font-extrabold uppercase tracking-wider px-4 py-2.5"
                                style={{ borderBottom: '1px solid rgba(168,85,247,0.2)', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'rgba(168,85,247,0.08)', color: '#c084fc' }}>
                                <span>Unit Price</span>
                                <span className="text-center">Quantity</span>
                                <span className="text-center">
                                  {parseFloat(item.unit_price || 0) > parseFloat(item.original_price || 0) && parseFloat(item.original_price || 0) > 0 ? 'Markup' : 'Discount'}
                                </span>
                                <span className="text-right">Total</span>
                              </div>
                              <div className="grid items-center px-4 py-3 bg-white dark:bg-gray-800 text-xs"
                                style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                                <div>
                                  <p className="font-extrabold text-gray-800 dark:text-gray-200">{cc} {fmt(item.unit_price || 0)}</p>
                                  {item.original_price && parseFloat(item.unit_price) < parseFloat(item.original_price) && (
                                    <p className="text-gray-400 dark:text-gray-500 line-through mt-0.5">{cc} {fmt(item.original_price)}</p>
                                  )}
                                  {item.unit_of_measure && <p className="text-gray-400 dark:text-gray-500 mt-0.5">per {item.unit_of_measure}</p>}
                                </div>
                                <div className="text-center">
                                  <p className="font-extrabold text-gray-800 dark:text-gray-200">{fmt(item.quantity)}</p>
                                  {item.unit_of_measure && <p className="text-gray-400 dark:text-gray-500 mt-0.5">{item.unit_of_measure}</p>}
                                </div>
                                <div className="text-center">
                                  {(() => {
                                    const orig = parseFloat(item.original_price || 0);
                                    const unit = parseFloat(item.unit_price || 0);
                                    const discAmt = parseFloat(item.discount_amount || 0);
                                    const qty = parseFloat(item.quantity || 1);
                                    if (unit > orig && orig > 0) {
                                      const pct = ((unit - orig) / orig * 100).toFixed(1);
                                      return <><p className="font-extrabold" style={{ color: '#f97316' }}>+{cc} {fmt((unit - orig) * qty)}</p><p className="mt-0.5" style={{ color: '#f97316' }}>{pct}% up</p></>;
                                    }
                                    if (discAmt > 0.001 && orig > 0) {
                                      const pct = ((orig - unit) / orig * 100).toFixed(1);
                                      return <><p className="font-extrabold" style={{ color: '#10b981' }}>-{cc} {fmt(discAmt)}</p><p className="mt-0.5" style={{ color: '#10b981' }}>{pct}% off</p></>;
                                    }
                                    return <p className="text-gray-300 dark:text-gray-600">—</p>;
                                  })()}
                                </div>
                                <div className="text-right">
                                  <p className="font-extrabold text-sm" style={{ color: '#a855f7' }}>
                                    {cc} {fmt(item.line_total_after_discount ?? (parseFloat(item.unit_price || 0) * parseFloat(item.quantity || 0)))}
                                  </p>
                                  {parseFloat(item.discount_amount || 0) > 0.001 && (
                                    <p className="text-gray-400 dark:text-gray-500 line-through mt-0.5">{cc} {fmt(parseFloat(item.original_price || 0) * parseFloat(item.quantity || 1))}</p>
                                  )}
                                </div>
                              </div>
                              {(() => {
                                const disc = parseFloat(item.discount_amount || 0);
                                const orig = parseFloat(item.original_price || 0);
                                const unit = parseFloat(item.unit_price || 0);
                                const qty  = parseFloat(item.quantity || 1);
                                if (disc > 0.001 && orig > 0) {
                                  const pct = ((orig - unit) / orig * 100).toFixed(1);
                                  return (
                                    <div className="px-4 py-2 flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20" style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Customer saves on this item</span>
                                      <Chip color="#10b981">Save {cc} {fmt(disc)} · {pct}% off</Chip>
                                    </div>
                                  );
                                }
                                if (unit > orig && orig > 0) {
                                  const markupAmt = (unit - orig) * qty;
                                  const pct = ((unit - orig) / orig * 100).toFixed(1);
                                  return (
                                    <div className="px-4 py-2 flex items-center justify-between bg-orange-50 dark:bg-orange-900/20" style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                                      <span className="text-xs font-bold text-orange-700 dark:text-orange-400">Price includes a markup</span>
                                      <Chip color="#f97316">+{cc} {fmt(markupAmt)} · {pct}% up</Chip>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* Service details */}
                            {(item.scheduled_start_date || item.scheduled_end_date || item.material_cost != null || item.labor_cost != null || item.estimated_hours != null || item.hourly_rate != null || item.estimated_duration) && (
                              <div className="rounded-xl overflow-hidden mt-3" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                                  <Clock size={12} color="#c084fc" />
                                  <p className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>Service Details</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800">
                                  {[
                                    (item.scheduled_start_date || item.scheduled_end_date) && ['Schedule', '#10b981', 'rgba(16,185,129,0.06)', `${safeDate(item.scheduled_start_date)?.toLocaleDateString() || '—'}${item.scheduled_end_date ? ` -> ${safeDate(item.scheduled_end_date)?.toLocaleDateString()}` : ''}`],
                                    item.estimated_duration    && ['Duration',     '#a855f7', 'rgba(168,85,247,0.06)', item.estimated_duration],
                                    item.estimated_hours != null && ['Est. Hours', '#3b82f6', 'rgba(59,130,246,0.06)', `${parseFloat(item.estimated_hours).toFixed(1)} hrs`],
                                    item.hourly_rate != null   && ['Hourly Rate',  '#f59e0b', 'rgba(245,158,11,0.06)', `${cc} ${fmt(item.hourly_rate)} / hr`],
                                    item.labor_cost != null    && ['Labor Cost',   '#ef4444', 'rgba(239,68,68,0.06)',  `${cc} ${fmt(item.labor_cost)}`],
                                    item.material_cost != null && ['Material Cost','#06b6d4', 'rgba(6,182,212,0.06)',  `${cc} ${fmt(item.material_cost)}`],
                                  ].filter(Boolean).map(([label, color, bg, val], i) => (
                                    <div key={label} className="grid px-4 py-2.5 text-xs items-start"
                                      style={{ gridTemplateColumns: '140px 1fr', background: bg, borderTop: i > 0 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                                      <span className="font-semibold mt-0.5" style={{ color }}>{label}</span>
                                      <span className="font-bold text-gray-800 dark:text-gray-200">{val}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Variant details */}
                            {item.variant_details && Object.keys(item.variant_details).length > 0 && (
                              <div className="rounded-xl overflow-hidden mt-3" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                                  <p className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>Variant Details</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800">
                                  {Object.entries(item.variant_details).map(([key, val], i) => (
                                    <div key={key} className="grid px-4 py-2.5 text-xs"
                                      style={{ gridTemplateColumns: '140px 1fr', background: i % 2 === 0 ? 'transparent' : 'rgba(168,85,247,0.03)' }}>
                                      <span className="font-semibold capitalize" style={{ color: '#a78bfa' }}>{key}</span>
                                      <span className="font-bold text-gray-800 dark:text-gray-200">{val || '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Additional info */}
                            {(item.lead_time || item.notes || item.prerequisites) && (
                              <div className="rounded-xl overflow-hidden mt-3" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                                <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                                  <p className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>Additional Info</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800">
                                  {[
                                    item.lead_time     && ['Lead Time',     item.lead_time,     '#f59e0b', 'rgba(245,158,11,0.06)'],
                                    item.prerequisites && ['Prerequisites', item.prerequisites, '#3b82f6', 'rgba(59,130,246,0.06)'],
                                    item.notes         && ['Note',          item.notes,         '#a855f7', 'rgba(168,85,247,0.06)'],
                                  ].filter(Boolean).map(([label, val, color, bg], i) => (
                                    <div key={label} className="grid px-4 py-2.5 text-xs items-start"
                                      style={{ gridTemplateColumns: '140px 1fr', background: bg, borderTop: i > 0 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                                      <span className="font-semibold mt-0.5" style={{ color }}>{label}</span>
                                      <span className="font-bold text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{val}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <div className="lg:col-span-1 w-full lg:sticky lg:top-6 h-fit">
            {/* Pricing Summary */}
            <div className="rounded-2xl overflow-hidden" style={{
              border: '1.5px solid rgba(168, 85, 247, 0.25)',
              boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.08), 0 4px 20px rgba(168, 85, 247, 0.06)',
              transition: 'box-shadow 200ms ease'
            }}>
              <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" 
                      style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.15)' }}>
                    <DollarSign size={16} color="#a855f7" />
                  </div>
                  <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: '#c084fc' }}>Pricing Summary</p>
                </div>

                {/* Rows */}
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{cc} {fmt(quote.subtotal)}</span>
                  </div>

                  {quote.discount > 0 && (
                    <>
                      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.25), transparent)' }} />
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">
                          Quote Discount {quote.discount_percentage > 0 && `(${quote.discount_percentage}%)`}
                        </span>
                        <span className="font-semibold" style={{ color: '#10b981' }}>-{cc} {fmt(quote.discount)}</span>
                      </div>
                    </>
                  )}

                  {quote.tax > 0 && (
                    <>
                      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.25), transparent)' }} />
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Tax</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{cc} {fmt(quote.tax)}</span>
                      </div>
                    </>
                  )}

                  {quote.shipping_cost > 0 && (
                    <>
                      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.25), transparent)' }} />
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Shipping</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{cc} {fmt(quote.shipping_cost)}</span>
                      </div>
                    </>
                  )}

                  {/* Total - Highlighted Box */}
                  <div className="mt-4 rounded-xl" style={{ 
                    padding: '18px 22px', // ← Vertical 18px, Horizontal 22px (adjust as needed)
                    background: 'rgba(168, 85, 247, 0.04)', 
                    border: '1px solid rgba(168, 85, 247, 0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)'
                  }}>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-gray-900 dark:text-white">Total</span>
                      <div className="text-right">
                        <p className="font-extrabold text-lg" style={{ color: '#a855f7' }}>{cc} {fmt(quote.total)}</p>
                        {showKes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">KES {fmt(quote.total_kes)}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Exchange Rate Info */}
                  {showKes && quote.exchange_rate_to_kes && (
                    <div className="flex items-start gap-1.5 pt-2 text-xs text-gray-400 dark:text-gray-500">
                      <Info size={11} color="#a855f7" className="flex-shrink-0 mt-0.5" />
                      <span>
                        1 {cc} = {fmt(quote.exchange_rate_to_kes, 6)} KES
                        {quote.converted_currency_at && ` (${new Date(String(quote.converted_currency_at).replace(' ', 'T')).toLocaleDateString()})`}
                      </span>
                    </div>
                  )}

                  {/* Billing Schedule */}
                  {quote.billing_schedule && (
                    <div className="flex items-center gap-1.5 pt-2 mt-1 text-xs text-gray-500 dark:text-gray-400" 
                        style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                      <CreditCard size={11} /> 
                      Billing: <span className="font-bold text-gray-700 dark:text-gray-300">{quote.billing_schedule.replace('_', ' ')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery Info */}
            <Section title="Delivery Info" icon={MapPin}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <span />
                {!editingDelivery ? (
                  <button onClick={() => setEditingDelivery(true)} type="button"
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors flex-shrink-0">
                    {(quote.shipping_address || quote.billing_address) ? 'Edit' : 'Add Delivery Info'}
                  </button>
                ) : (
                  <div className="flex gap-2 flex-shrink-0">
                    <GhostBtn onClick={() => { setEditingDelivery(false); setDeliveryDraft({ shipping_address: quote.shipping_address || '', billing_same_as_shipping: quote.billing_same_as_shipping ?? true, billing_address: quote.billing_address || '' }); }} disabled={actionLoading}>Cancel</GhostBtn>
                    <PurpleBtn onClick={() => saveCustomerEdits(deliveryDraft)} disabled={actionLoading}>Save</PurpleBtn>
                  </div>
                )}
              </div>
              {!editingDelivery ? (
                (!quote.shipping_address && !quote.billing_address)
                  ? <p className="text-sm text-gray-400 dark:text-gray-500 italic">Not provided yet.</p>
                  : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#c084fc' }}><Truck size={11} color="#c084fc" /> Shipping</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{quote.shipping_address?.trim() || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#c084fc' }}><CreditCard size={11} color="#c084fc" /> Billing</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{quote.billing_same_as_shipping ? 'Same as shipping' : (quote.billing_address?.trim() || '—')}</p>
                      </div>
                    </div>
                  )
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">Shipping Address</label>
                    <TextArea label="" value={deliveryDraft.shipping_address} onChange={e => setDeliveryDraft(p => ({ ...p, shipping_address: e.target.value }))} rows={4} placeholder="Enter shipping address..." />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="accent-purple-500" checked={!!deliveryDraft.billing_same_as_shipping}
                      onChange={e => setDeliveryDraft(p => ({ ...p, billing_same_as_shipping: e.target.checked, billing_address: e.target.checked ? '' : p.billing_address }))} />
                    Billing same as shipping
                  </label>
                  {!deliveryDraft.billing_same_as_shipping && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5">Billing Address</label>
                      <TextArea label="" value={deliveryDraft.billing_address} onChange={e => setDeliveryDraft(p => ({ ...p, billing_address: e.target.value }))} rows={4} placeholder="Enter billing address..." />
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Validity */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5" style={{ border: '1.5px solid rgba(168,85,247,0.25)', boxShadow: '0 0 0 1px rgba(168,85,247,0.08), 0 4px 16px rgba(168,85,247,0.06)' }}>
              <p className="text-xs font-extrabold uppercase tracking-widest mb-4 flex items-center gap-1.5" style={{ color: '#c084fc' }}>
                <Calendar size={12} color="#c084fc" /> Validity
              </p>
              
              {/* Changed gap-0 to gap-4 for clean spacing without lines */}
              <div className="flex flex-col gap-4">
                {[
                  { label: 'Valid From',    val: quote.valid_from },
                  { label: 'Valid Until',   val: quote.valid_until },
                  { label: 'Service Start', val: quote.service_start_date },
                  { label: 'Service End',   val: quote.service_end_date },
                ].filter(t => t.val).map(({ label, val }) => (
                  <div key={label} className="flex items-start gap-3">
                    {/* Added subtle purple glow to the dot */}
                    <span style={{ 
                      width: 7, 
                      height: 7, 
                      borderRadius: '50%', 
                      background: '#a855f7', 
                      flexShrink: 0, 
                      marginTop: 5, 
                      boxShadow: '0 0 4px rgba(168,85,247,0.4)' 
                    }} />
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold">{label}</p>
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-0.5">{new Date(val).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Terms */}
            {(quote.terms_and_conditions || quote.payment_terms || quote.delivery_terms) && (
              <Section title="Terms & Conditions" icon={FileText}>
                <div className="flex flex-col gap-4 text-sm">
                  {quote.terms_and_conditions && <div><p className="text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: '#c084fc' }}>General Terms</p><p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">{quote.terms_and_conditions}</p></div>}
                  {quote.payment_terms && <div><p className="text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: '#c084fc' }}>Payment Terms</p><p className="text-gray-600 dark:text-gray-400">{quote.payment_terms}</p></div>}
                  {quote.delivery_terms && <div><p className="text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: '#c084fc' }}>Delivery Terms</p><p className="text-gray-600 dark:text-gray-400">{quote.delivery_terms}</p></div>}
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.6)' }}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'var(--panel-bg, white)' }}>

          {/* Header */}
          <div className="px-6 py-5 flex items-center gap-4" style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <XCircle size={20} color="white" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Reject Quote</h3>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>Your feedback helps us improve</p>
            </div>
            <button onClick={() => { setShowRejectModal(false); setRejectionReason(''); }} type="button"
              className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer' }}>
              <X size={15} color="white" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 bg-white dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Let us know why you're rejecting this quote. This is shared with our team and helps us send you a better offer.
            </p>

            {/* Quick reason chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['Price too high', 'Need different specs', 'Found better offer', 'Timeline doesn\'t work', 'Other'].map(reason => (
                <button key={reason} type="button"
                  onClick={() => setRejectionReason(prev => prev ? `${prev}, ${reason}` : reason)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: rejectionReason.includes(reason) ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${rejectionReason.includes(reason) ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)'}`,
                    color: '#ef4444',
                  }}>
                  {reason}
                </button>
              ))}
            </div>

            <TextArea
              label="Rejection Reason"
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g., Price is too high, need different specifications..."
              rows={4}
              required
            />

            {/* Footer */}
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowRejectModal(false); setRejectionReason(''); }} disabled={actionLoading} type="button"
                className="px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                style={{ background: 'transparent', border: '1.5px solid rgba(239,68,68,0.2)', color: '#9ca3af' }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={actionLoading || !rejectionReason.trim()} type="button"
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-extrabold transition-opacity disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>
                {actionLoading ? 'Rejecting…' : 'Reject Quote'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

      <Footer />
    </div>
  );
};

export default CustomerQuoteDetail;