import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Calendar, Package, Wrench, MapPin,
  DollarSign, Clock, Paperclip, AlertCircle, CheckCircle,
  XCircle, UserCheck, MessageCircle, Download, Edit2, Mail,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ClarificationResponseModal from '../../components/quotes/ClarificationResponseModal';
import EditQuoteRequestModal from '../../components/quotes/request-wizard/EditQuoteRequestModal';
import useQuoteRequestStore from '../../store/quoteRequestStore';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown size';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const STATUS_CFG = {
  pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  label: 'Pending' },
  reviewing: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  label: 'Under Review' },
  quoted:    { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  label: 'Quoted' },
  rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   label: 'Rejected' },
  expired:   { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', label: 'Expired' },
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, accentColor }) {
  return (
    <div 
      style={{ 
        borderRadius: 16, 
        border: '1.5px solid rgba(168, 85, 247, 0.35)', 
        boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.1), 0 2px 12px rgba(168, 85, 247, 0.08)',
        overflow: 'hidden',
        transition: 'box-shadow 200ms ease, border-color 200ms ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.7)';
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.2), 0 4px 20px rgba(168, 85, 247, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.35)';
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.1), 0 2px 12px rgba(168, 85, 247, 0.08)';
      }}
    >
      {/* Remove the accentColor top bar if you want pure glow: */}
      {accentColor && <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />}

      <div style={{ padding: '22px 24px' }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            {Icon && <Icon size={16} color="#c084fc" />}
            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em', margin: 0 }}>{title}</p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, icon: Icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid rgba(168, 85, 247, 0.25)', boxShadow: 'inset 0 -1px 0 rgba(168, 85, 247, 0.15)'  }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
        {Icon && <Icon size={13} />} {label}
      </span>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c084fc', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── Alert box ─────────────────────────────────────────────────────────────────
function AlertBox({ type, title, body, action }) {
  const cfg = {
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: AlertCircle, iconColor: '#f59e0b', titleColor: '#92400e', bodyColor: '#b45309' },
    danger:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: XCircle,     iconColor: '#ef4444', titleColor: '#991b1b', bodyColor: '#b91c1c' },
    success: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', icon: CheckCircle, iconColor: '#10b981', titleColor: '#065f46', bodyColor: '#047857' },
    info:    { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', icon: AlertCircle, iconColor: '#3b82f6', titleColor: '#1e40af', bodyColor: '#1d4ed8' },
  }[type] || {};
  const Icon = cfg.icon;
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <Icon size={16} color={cfg.iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <p style={{ fontSize: '0.82rem', fontWeight: 800, color: cfg.titleColor, margin: 0 }}>{title}</p>
        {body && <p style={{ fontSize: '0.78rem', color: cfg.bodyColor, margin: '4px 0 0' }}>{body}</p>}
        {action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const MyQuoteRequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const { currentQuoteRequest, loadingCurrent, error, fetchQuoteRequestById, respondToClarification, updateQuoteRequestWithFiles } = useQuoteRequestStore();

  useEffect(() => { if (id) fetchQuoteRequestById(id); }, [id]);

  const handleClarificationSubmit = async (response) => {
    await respondToClarification(id, response);
    setShowClarificationModal(false);
    await fetchQuoteRequestById(id);
  };

  const handleEditSave = async (data, newFiles, removedPaths) => {
    await updateQuoteRequestWithFiles(id, data, newFiles, removedPaths);
    setShowEditModal(false);
    await fetchQuoteRequestById(id);
  };

  const handleDownloadAttachment = async (index, fileName) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/customer/quote-requests/${id}/attachments/${index}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch { alert('Failed to download. Please try again.'); }
  };

  if (loadingCurrent) return (
    <div style={{ minHeight: '100vh'}}>
      <Header />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><LoadingSpinner size="lg" /></div>
    </div>
  );

  if (error || !currentQuoteRequest) return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <div style={{ maxWidth: 700, margin: '48px auto', padding: '0 24px', textAlign: 'center' }}>
        <p style={{ color: '#9ca3af', marginBottom: 20 }}>{error || 'Quote request not found'}</p>
        <button onClick={() => navigate('/my-quote-requests')} type="button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', color: '#374151', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
          <ArrowLeft size={15} /> Back to Requests
        </button>
      </div>
    </div>
  );

  const request = currentQuoteRequest;
  const cfg = STATUS_CFG[request.status] || { color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', label: request.status };

  const handleDownloadPDF = () => {
  const toastId = toast?.loading?.('Generating PDF...') || null;

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W  = pdf.internal.pageSize.getWidth();
    const H  = pdf.internal.pageSize.getHeight();
    const M  = 15;
    const CW = W - M * 2;
    let y = M;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const rgb = (hex) => {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r
        ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
        : { r: 168, g: 85, b: 247 };
    };

    // opacity wrapper — sets GState, runs draw fn, resets
    const withOpacity = (op, fn) => {
      pdf.setGState(pdf.GState({ opacity: op }));
      fn();
      pdf.setGState(pdf.GState({ opacity: 1 }));
    };

    const need = (h) => {
      if (y + h > H - M) { pdf.addPage(); y = M; }
    };

    const hline = (colorHex = '#e5e7eb', lw = 0.3) => {
      const { r, g, b } = rgb(colorHex);
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(lw);
      pdf.line(M, y, W - M, y);
    };

    const sectionHeading = (text) => {
      need(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(124, 58, 237);
      pdf.text(text, M, y);
      y += 5;
      hline('#a855f7', 0.25);
      y += 6;
    };

    // pill with light tinted bg + colored border + text
    const pill = (x, py, label, colorHex) => {
      const { r, g, b } = rgb(colorHex);
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

    // small chip — white bg + colored border + text
    const chip = (x, cy, label, colorHex) => {
      const { r, g, b } = rgb(colorHex);
      pdf.setFontSize(6);
      const tw = pdf.getTextWidth(label);
      const cw = tw + 8;
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(x, cy - 3.5, cw, 5, 2, 2, 'FD');
      pdf.setTextColor(r, g, b);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x + 4, cy);
      return cw + 3;
    };

    // label + value stacked
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

    // ── STATUS CONFIG ────────────────────────────────────────────────────────
    const STATUS_COLORS = {
      pending:              '#f59e0b',
      submitted:            '#f59e0b',
      under_review:         '#3b82f6',
      quoted:               '#10b981',
      accepted:             '#10b981',
      rejected:             '#ef4444',
      cancelled:            '#6b7280',
      requires_clarification: '#f97316',
    };

    const statusColor = STATUS_COLORS[request.status] || '#9ca3af';
    const statusLabel = (request.status || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // ══════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════
    pdf.setFillColor(168, 85, 247);
    pdf.rect(0, 0, W, 3, 'F');

    y = M + 5;

    // Request number
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(28, 28, 28);
    pdf.text(request.request_number, M, y);
    y += 7;

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(124, 58, 237);
    const titleLines = pdf.splitTextToSize(request.request_title || 'Quote Request', CW);
    pdf.text(titleLines, M, y);
    y += titleLines.length * 6 + 4;

    // Status pill + submitted date on same line
    let px = M;
    px += pill(px, y, statusLabel, statusColor);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Submitted: ${formatDate(request.created_at)}`, px + 4, y);

    y += 10;
    hline();
    y += 8;

    // ══════════════════════════════════════════════════
    // ASSIGNED HANDLER
    // ══════════════════════════════════════════════════
    if (request.assigned_to) {
      sectionHeading('Assigned Handler');

      const handlerName = request.assigned_to.name ||
        `${request.assigned_to.first_name || ''} ${request.assigned_to.last_name || ''}`.trim() ||
        'Team Member';

      const cardH = 24;
      need(cardH);

      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, cardH, 4, 4, 'FD');

      // Avatar circle
      withOpacity(0.1, () => {
        pdf.setFillColor(168, 85, 247);
        pdf.circle(M + 14, y + 12, 8, 'F');
      });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(168, 85, 247);
      const initials = handlerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      pdf.text(initials, M + 14, y + 14, { align: 'center' });

      // Name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(handlerName, M + 28, y + 10);

      // Email
      if (request.assigned_to.email) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(124, 58, 237);
        pdf.text(request.assigned_to.email, M + 28, y + 17);
      }

      // Assigned date
      if (request.assigned_at) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Assigned: ${formatDate(request.assigned_at)}`, M + CW - 8, y + 10, { align: 'right' });
      }

      y += cardH + 8;
    }

    // ══════════════════════════════════════════════════
    // CLARIFICATION
    // ══════════════════════════════════════════════════
    if (request.clarification_notes) {
      sectionHeading('Clarification');

      const isWarning  = !!request.requires_clarification;
      const alertColor = isWarning ? '#f59e0b' : '#3b82f6';
      const { r: ar, g: ag, b: ab } = rgb(alertColor);

      const noteLines  = pdf.splitTextToSize(request.clarification_notes, CW - 18);
      const cardH      = noteLines.length * 4.5 + 18;
      need(cardH);

      withOpacity(0.07, () => {
        pdf.setFillColor(ar, ag, ab);
        pdf.roundedRect(M, y, CW, cardH, 4, 4, 'F');
      });
      pdf.setDrawColor(ar, ag, ab);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(M, y, CW, cardH, 4, 4, 'S');

      // Left accent bar
      pdf.setFillColor(ar, ag, ab);
      pdf.roundedRect(M, y, 3, cardH, 2, 2, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(ar, ag, ab);
      pdf.text(isWarning ? 'Clarification Required' : 'Clarification Note', M + 8, y + 7);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(55, 65, 81);
      pdf.text(noteLines, M + 8, y + 13);

      y += cardH + 6;

      // Responses
      if (request.clarification_response?.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(16, 185, 129);
        pdf.text(`Your Response${request.clarification_response.length > 1 ? 's' : ''}`, M, y);
        y += 6;

        request.clarification_response.forEach((resp) => {
          const respLines = pdf.splitTextToSize(resp.response || '', CW - 12);
          const rH = respLines.length * 4.5 + 14;
          need(rH);

          withOpacity(0.06, () => {
            pdf.setFillColor(16, 185, 129);
            pdf.roundedRect(M, y, CW, rH, 3, 3, 'F');
          });
          pdf.setDrawColor(16, 185, 129);
          pdf.setLineWidth(0.3);
          pdf.roundedRect(M, y, CW, rH, 3, 3, 'S');

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(17, 24, 39);
          pdf.text(respLines, M + 6, y + 8);

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6);
          pdf.setTextColor(107, 114, 128);
          pdf.text(formatDate(resp.responded_at), M + 6, y + rH - 4);

          y += rH + 5;
        });
      }

      y += 4;
    }

    // ══════════════════════════════════════════════════
    // DESCRIPTION
    // ══════════════════════════════════════════════════
    sectionHeading('Description');

    const descLines = pdf.splitTextToSize(request.request_description || 'No description provided.', CW);
    need(descLines.length * 5 + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(55, 65, 81);
    pdf.text(descLines, M, y);
    y += descLines.length * 5 + 10;

    // ══════════════════════════════════════════════════
    // REQUESTED ITEMS
    // ══════════════════════════════════════════════════
    sectionHeading(`Requested Items  ·  ${request.requested_items?.length || 0}`);

    (request.requested_items || []).forEach((item, idx) => {
      const isService  = item.item_type === 'service' || item.item_type === 'custom_service';
      const typeColor  = isService ? '#10b981' : '#a855f7';
      const { r: ir, g: ig, b: ib } = rgb(typeColor);

      // Compute dynamic card height
      const nameLines = pdf.splitTextToSize(item.description || `Item ${idx + 1}`, CW - 30);
      const hasSpecs  = !!(item.specifications);
      const hasNotes  = !!(item.notes);
      const specLines = hasSpecs ? pdf.splitTextToSize(`Specs: ${item.specifications}`, CW - 12) : [];
      const noteLines = hasNotes ? pdf.splitTextToSize(`Notes: ${item.notes}`, CW - 12) : [];

      const cardH = 8                                        // top pad
        + nameLines.length * 5 + 2                          // name
        + 6                                                  // type chip row
        + 8                                                  // meta chips row
        + (hasSpecs ? specLines.length * 4 + 4 : 0)
        + (hasNotes ? noteLines.length * 4 + 4 : 0)
        + 8;                                                 // bottom pad

      need(cardH);
      const cardTop = y;

      // Card
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, cardH, 4, 4, 'FD');

      // Left accent bar
      pdf.setFillColor(ir, ig, ib);
      pdf.roundedRect(M, y, 3, cardH, 2, 2, 'F');

      // Type icon
      withOpacity(0.12, () => {
        pdf.setFillColor(ir, ig, ib);
        pdf.roundedRect(M + 7, y + 5, 9, 9, 2, 2, 'F');
      });
      pdf.setFillColor(ir, ig, ib);
      pdf.roundedRect(M + 7, y + 5, 9, 9, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(isService ? 'S' : 'P', M + 11.5, y + 11, { align: 'center' });

      // Item name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(nameLines, M + 20, y + 8);

      // Budget badge — top right
      if (item.budget_per_unit) {
        const budgetText = `Budget: KES ${parseFloat(item.budget_per_unit).toLocaleString()}/${item.unit_of_measure || 'unit'}`;
        pdf.setFontSize(6.5);
        const bw = pdf.getTextWidth(budgetText) + 10;
        withOpacity(0.1, () => {
          pdf.setFillColor(168, 85, 247);
          pdf.roundedRect(M + CW - bw - 4, y + 4, bw, 6.5, 2, 2, 'F');
        });
        pdf.setDrawColor(168, 85, 247);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(M + CW - bw - 4, y + 4, bw, 6.5, 2, 2, 'S');
        pdf.setTextColor(124, 58, 237);
        pdf.setFont('helvetica', 'bold');
        pdf.text(budgetText, M + CW - bw, y + 9);
      }

      let innerY = y + 8 + nameLines.length * 5 + 2;

      // Type chip row
      let cx = M + 20;
      cx += chip(cx, innerY, item.item_type.replace(/_/g, ' '), typeColor);
      if (item.quantity) cx += chip(cx, innerY, `Qty: ${item.quantity}`, '#6b7280');
      if (item.unit_of_measure) cx += chip(cx, innerY, item.unit_of_measure, '#6b7280');
      innerY += 8;

      // Meta row — lead time, hours, etc.
      let mx = M + 20;
      if (item.lead_time) mx += chip(mx, innerY, `Lead: ${item.lead_time}`, '#f59e0b');
      if (isService && item.estimated_hours != null) mx += chip(mx, innerY, `${item.estimated_hours}h est.`, '#3b82f6');
      if (item.lead_time || (isService && item.estimated_hours != null)) innerY += 8;

      // Specs
      if (hasSpecs) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(107, 114, 128);
        pdf.text(specLines, M + 6, innerY);
        innerY += specLines.length * 4 + 4;
      }

      // Notes
      if (hasNotes) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(107, 114, 128);
        pdf.text(noteLines, M + 6, innerY);
        innerY += noteLines.length * 4 + 4;
      }

      y = cardTop + cardH + 5;
    });

    y += 4;

    // ══════════════════════════════════════════════════
    // REQUEST DETAILS
    // ══════════════════════════════════════════════════
    sectionHeading('Request Details');

    if (request.budget_range)      kv('Budget Range',      request.budget_range);
    if (request.timeline_needed)   kv('Timeline Needed',   request.timeline_needed);
    if (request.delivery_location) kv('Delivery Location', request.delivery_location);
    if (request.customer_notes)    kv('Customer Notes',    request.customer_notes);

    y += 4;

    // ══════════════════════════════════════════════════
    // TIMELINE
    // ══════════════════════════════════════════════════
    sectionHeading('Timeline');

    [
      { label: 'Submitted', val: request.created_at,  color: '#a855f7' },
      { label: 'Quoted',    val: request.quoted_at,   color: '#10b981' },
      { label: 'Expires',   val: request.expires_at,  color: '#f59e0b' },
    ].filter(t => t.val).forEach((ev, i, arr) => {
      need(16);
      const { r, g, b } = rgb(ev.color);

      pdf.setFillColor(r, g, b);
      pdf.circle(M + 4, y + 3, 2.5, 'F');

      if (i < arr.length - 1) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.5);
        pdf.line(M + 4, y + 5.5, M + 4, y + 16);
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text(ev.label, M + 12, y + 2);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(17, 24, 39);
      pdf.text(formatDate(ev.val), M + 12, y + 8);

      y += 16;
    });

    // ══════════════════════════════════════════════════
    // ATTACHMENTS
    // ══════════════════════════════════════════════════
    if (request.attachments?.length > 0) {
      y += 4;
      sectionHeading(`Attachments  ·  ${request.attachments.length}`);

      request.attachments.forEach((file) => {
        need(12);

        // File card
        pdf.setFillColor(249, 250, 251);
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(M, y - 3, CW, 11, 3, 3, 'FD');

        // File icon — simple coloured square instead of emoji (emoji breaks in jsPDF)
        pdf.setFillColor(168, 85, 247);
        pdf.roundedRect(M + 4, y - 1, 7, 7, 1, 1, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(5);
        pdf.text('FILE', M + 7.5, y + 3.5, { align: 'center' });

        // File name
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(17, 24, 39);
        const maxNameW = CW - 40;
        const nameText = pdf.splitTextToSize(file.name || 'Attachment', maxNameW)[0]; // one line only
        pdf.text(nameText, M + 15, y + 3.5);

        // File size
        if (file.size) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6.5);
          pdf.setTextColor(107, 114, 128);
          pdf.text(formatFileSize(file.size), M + CW - 4, y + 3.5, { align: 'right' });
        }

        y += 14;
      });
    }

    // ══════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════
    y += 8;
    need(18);

    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.line(M, y, W - M, y);
    y += 7;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(124, 58, 237);
    pdf.text('Quote Request Summary', W / 2, y, { align: 'center' });

    y += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(107, 114, 128);
    pdf.text(
      `Generated on ${format(new Date(), 'MMMM d, yyyy')} · ${request.request_number}`,
      W / 2, y, { align: 'center' }
    );

    pdf.save(`QuoteRequest-${request.request_number}.pdf`);
    toast?.success?.('PDF downloaded!', { id: toastId });

  } catch (err) {
    console.error('PDF generation failed:', err);
    toast?.error?.('Failed to generate PDF', { id: toastId });
  }
};

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />

      <style>{`
        .request-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 24px;
          align-items: start;
        }

        @media (max-width: 1024px) {
          .request-grid {
            grid-template-columns: 1fr;
          }

          .request-grid > div:last-child {
            margin-top: 16px;
          }
        }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid #f3f4f6', padding: '28px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Back */}
          <button onClick={() => navigate('/my-quote-requests')} type="button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', marginBottom: 20, transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}
          >
            <ArrowLeft size={13} /> Back to Requests
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>
                {request.request_number}
              </p>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c084fc', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
                {request.request_title}
              </h1>
              {/* Status pill */}
              <div style={{ marginTop: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 800, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 5px ${cfg.color}` }} />
                  {request.status_label || cfg.label}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              {/* ── Download PDF Button ───────────────────────────────────────────── */}
              <button 
                onClick={handleDownloadPDF} 
                type="button"
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, 
                  border: '1.5px solid rgba(168, 85, 247, 0.4)', background: 'transparent', color: '#a855f7', 
                  fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                  boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.1), 0 2px 10px rgba(168, 85, 247, 0.08)',
                  transition: 'all 150ms ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.8)';
                  e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.25), 0 4px 18px rgba(168, 85, 247, 0.2)';
                  e.currentTarget.style.background = 'rgba(168,85,247,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
                  e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.1), 0 2px 10px rgba(168, 85, 247, 0.08)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Download size={14} /> Download PDF
              </button>

              {/* ── Edit Button (only if pending) ────────────────────────────────── */}
              {request.status === 'pending' && (
                <button onClick={() => setShowEditModal(true)} type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <Edit2 size={14} /> Edit Request
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div className="request-grid">

          {/* ── LEFT ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5 min-w-0">

            {/* Assignment */}
            {request.assigned_to && (
              <Section title="Assigned Handler" icon={UserCheck} accentColor="#a855f7">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', border: '2px solid rgba(168,85,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UserCheck size={20} color="#a855f7" />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>
                      {request.assigned_to.name || `${request.assigned_to.first_name || ''} ${request.assigned_to.last_name || ''}`.trim() || 'Team member'}
                    </p>
                    {request.assigned_to.email && (
                      <a href={`mailto:${request.assigned_to.email}`}
                        style={{ fontSize: '0.8rem', color: '#a855f7', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Mail size={12} /> {request.assigned_to.email}
                      </a>
                    )}
                    {request.assigned_at && (
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '4px 0 0' }}>Assigned {formatDate(request.assigned_at)}</p>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6', margin: '14px 0 0' }}>
                  Your request is being handled by this team member.
                </p>
              </Section>
            )}

            {/* Clarification alerts */}
            {request.clarification_notes && (
              <Section title="Clarification" icon={MessageCircle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <AlertBox
                    type={request.requires_clarification ? 'warning' : 'info'}
                    title={request.requires_clarification ? 'We need more information' : 'Clarification was requested'}
                    body={request.clarification_notes}
                    action={request.requires_clarification && (
                      <button onClick={() => setShowClarificationModal(true)} type="button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', background: '#f59e0b', color: 'white', fontWeight: 800, fontSize: '0.78rem' }}>
                        <MessageCircle size={13} /> Respond to Clarification
                      </button>
                    )}
                  />

                  {request.clarification_response?.length > 0 && (
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Your Response{request.clarification_response.length > 1 ? 's' : ''}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {request.clarification_response.map((resp, i) => (
                          <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <p style={{ fontSize: '0.83rem', whiteSpace: 'pre-line', margin: 0 }}>{resp.response}</p>
                            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '6px 0 0' }}>{formatDate(resp.responded_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Rejection */}
            {request.status === 'rejected' && request.rejection_reason && (
              <AlertBox type="danger" title="Request Rejected" body={request.rejection_reason} />
            )}

            {/* Quote ready */}
            {request.quote_id && (
              <AlertBox type="success" title="Your Quote is Ready!"
                body="We've prepared a quote for your request. Click below to review it."
                action={
                  <button onClick={() => navigate(`/my-quotes/${request.quote_id}`)} type="button"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', background: '#10b981', color: 'white', fontWeight: 800, fontSize: '0.78rem' }}>
                    <CheckCircle size={13} /> View Quote
                  </button>
                }
              />
            )}

            {/* Description */}
            <Section title="Description" icon={FileText}>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.8, whiteSpace: 'pre-line', margin: 0 }}>
                {request.request_description}
              </p>
            </Section>

            {/* Requested Items */}
            {request.requested_items?.length > 0 && (
              <Section title={`Requested Items (${request.requested_items.length})`} icon={Package}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {request.requested_items.map((item, idx) => {
                    const isService = item.item_type === 'service' || item.item_type === 'custom_service';
                    const Icon = isService ? Wrench : Package;
                    return (
                      <div 
                          key={idx} 
                          style={{ 
                            padding: '14px 16px', 
                            borderRadius: 12, 
                            border: '1.5px solid rgba(168, 85, 247, 0.4)', 
                            boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.15), 0 4px 20px rgba(168, 85, 247, 0.12)', 
                            display: 'flex', 
                            gap: 14,
                            transition: 'box-shadow 200ms ease, border-color 200ms ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.8)';
                            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.25), 0 6px 28px rgba(168, 85, 247, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
                            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.15), 0 4px 20px rgba(168, 85, 247, 0.12)';
                          }}
                        >
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: isService ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={16} color={isService ? '#3b82f6' : '#a855f7'} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                              <p style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>{item.description}</p>
                              <span style={{ display: 'inline-block', marginTop: 4, fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 9999, background: isService ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)', color: isService ? '#3b82f6' : '#a855f7' }}>
                                {item.item_type.replace('_', ' ')}
                              </span>
                            </div>
                            {item.quantity && (
                              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3b82f6', flexShrink: 0 }}>×{item.quantity}</span>
                            )}
                          </div>

                          {/* Meta chips */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {item.unit_of_measure && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'white', border: '1px solid #e5e7eb', color: '#6b7280' }}>
                                Unit: {item.unit_of_measure}
                              </span>
                            )}
                            {item.lead_time && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'white', border: '1px solid #e5e7eb', color: '#6b7280' }}>
                                Lead: {item.lead_time}
                              </span>
                            )}
                            {isService && item.estimated_hours != null && item.estimated_hours !== '' && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'white', border: '1px solid #e5e7eb', color: '#6b7280' }}>
                                Est. {item.estimated_hours}h
                              </span>
                            )}
                            {item.budget_per_unit && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', color: '#a855f7' }}>
                                KES {parseFloat(item.budget_per_unit).toLocaleString()} / {item.unit_of_measure || 'unit'}
                              </span>
                            )}
                          </div>

                          {item.specifications && (
                            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '8px 0 0' }}><strong>Specs:</strong> {item.specifications}</p>
                          )}
                          {item.notes && (
                            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '4px 0 0' }}><strong>Notes:</strong> {item.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Request details */}
            <Section title="Request Details" icon={FileText}>
              {request.budget_range && <InfoRow label="Budget Range" value={request.budget_range} icon={DollarSign} />}
              {request.timeline_needed && <InfoRow label="Timeline" value={request.timeline_needed} icon={Clock} />}
              {request.delivery_location && <InfoRow label="Delivery Location" value={request.delivery_location} icon={MapPin} />}
              {request.customer_notes && (
                <div>
                  <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Notes</p>
                  <p style={{ fontSize: '0.82rem', margin: 0, lineHeight: 1.6 }}>{request.customer_notes}</p>
                </div>
              )}
            </Section>

            {/* Timeline */}
            <Section title="Timeline" icon={Calendar}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { label: 'Submitted', val: request.created_at },
                  { label: 'Quoted', val: request.quoted_at },
                  { label: 'Expires', val: request.expires_at },
                ].filter(t => t.val).map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid rgba(168, 85, 247, 0.25)', boxShadow: 'inset 0 -1px 0 rgba(168, 85, 247, 0.15)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c084fc', flexShrink: 0, marginTop: 5 }} />
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{label}</p>
                      <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '3px 0 0', fontWeight: 600 }}>{formatDate(val)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Attachments */}
            {request.attachments?.length > 0 && (
              <Section title={`Attachments (${request.attachments.length})`} icon={Paperclip}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {request.attachments.map((file, i) => (
                    <button key={i} onClick={() => handleDownloadAttachment(i, file.name)} type="button"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #f3f4f6', background: '#fafafa', cursor: 'pointer', transition: 'all 150ms', textAlign: 'left', width: '100%' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#f3f4f6'; e.currentTarget.style.background = '#fafafa'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                        <FileText size={15} color="#c084fc" style={{ flexShrink: 0 }} />
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', margin: 0, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                            {file.name}
                          </p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <Download size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>

      {showClarificationModal && (
        <ClarificationResponseModal
          onClose={() => setShowClarificationModal(false)}
          onSubmit={handleClarificationSubmit}
          clarificationNotes={request.clarification_notes}
        />
      )}
      {showEditModal && (
        <EditQuoteRequestModal
          quoteRequest={request}
          onClose={() => setShowEditModal(false)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
};

export default MyQuoteRequestDetail;