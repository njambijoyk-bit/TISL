import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Package,
  Wrench,
  MapPin,
  DollarSign,
  Clock,
  Paperclip,
  UserCheck,
  XCircle,
  MessageCircle,
  AlertCircle,
  CheckCircle,
  Download,
  ChevronLeft,
  Tag,
  Hash,
  Mail,
  Phone,
  Building,
  Shield,
  TrendingUp,
  RefreshCw,
  Star,
  Zap,
  Save,
  Edit3,
  Activity,
} from 'lucide-react';
import useQuoteRequestStore from '../../store/quoteRequestStore';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import AssignModal from '../../components/quotes/AssignModal';
import RejectModal from '../../components/quotes/RejectModal';
import ClarificationModal from '../../components/quotes/ClarificationModal';
import QuoteCreate from '../../components/quotes/QuoteCreate';
import { quotesAPI } from '../../api/quotes';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Tiny shared atoms ────────────────────────────────────────────────────────
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

const Panel = ({ children, style = {}, accent = false, className }) => (
  <div className={className} style={{
    background: 'var(--panel-bg, white)',
    border: `1px solid ${accent ? purpleBd : 'var(--border, #f3f4f6)'}`,
    borderRadius: 16, overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md', style: extraStyle = {} }) => {
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
      width: extraStyle.fullWidth ? '100%' : undefined,
      justifyContent: extraStyle.fullWidth ? 'center' : undefined,
      ...extraStyle,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const AlertBanner = ({ icon: Icon, color, bg, border, title, children }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 18px', borderRadius: 12,
    background: bg, border: `1px solid ${border}`,
    borderLeft: `4px solid ${color}`,
  }}>
    {Icon && <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 2 }} />}
    <div>
      {title && <p style={{ fontSize: '0.82rem', fontWeight: 700, color, margin: '0 0 4px' }}>{title}</p>}
      <div style={{ fontSize: '0.82rem', color, opacity: 0.9 }}>{children}</div>
    </div>
  </div>
);

const TimelineDot = ({ color, filled }) => (
  <div style={{
    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
    background: filled ? color : 'transparent',
    border: `2px solid ${color}`,
    boxShadow: filled ? `0 0 0 3px ${color}20` : 'none',
  }} />
);

// ─── Status/Priority color maps ───────────────────────────────────────────────
const statusColors = {
  pending:   '#f59e0b',
  reviewing: '#3b82f6',
  quoted:    '#10b981',
  rejected:  '#ef4444',
  expired:   '#6b7280',
};
const priorityColors = {
  low:    '#9ca3af',
  medium: '#3b82f6',
  high:   '#f59e0b',
  urgent: '#ef4444',
};

const StatusPill   = ({ s }) => <Pill color={statusColors[s]   || '#9ca3af'}>{s?.replace(/_/g, ' ')}</Pill>;
const PriorityPill = ({ p }) => <Pill color={priorityColors[p] || '#9ca3af'}>{p}</Pill>;

// ─── Main component ───────────────────────────────────────────────────────────
const QuoteRequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    currentQuoteRequest,
    loadingCurrent,
    error,
    fetchAdminQuoteRequestById,
    assignQuoteRequest,
    rejectQuoteRequest,
    requestClarification,
    updatePriority,
    addAdminNotes,
  } = useQuoteRequestStore();

  const [showAssignModal,        setShowAssignModal]        = useState(false);
  const [showRejectModal,        setShowRejectModal]        = useState(false);
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [showQuoteCreateModal,   setShowQuoteCreateModal]   = useState(false);
  const [enrichedItems,          setEnrichedItems]          = useState([]);

  useEffect(() => { fetchAdminQuoteRequestById(id); }, [id]);

  useEffect(() => {
    if (currentQuoteRequest?.requested_items) {
      enrichItemsWithPricing(currentQuoteRequest.requested_items);
    }
  }, [currentQuoteRequest]);

  const enrichItemsWithPricing = async (items) => {
    const enriched = await Promise.all(items.map(async (item) => {
      let unitPrice = 0;
      if (item.product_id) {
        try {
          const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/products/${item.product_id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
          if (r.ok) { const d = await r.json(); unitPrice = parseFloat(d.product?.price || 0); }
        } catch {}
      } else if (item.service_id) {
        try {
          const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/services/${item.service_id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
          if (r.ok) { const d = await r.json(); unitPrice = parseFloat(d.service?.base_price || d.service?.hourly_rate || d.service?.daily_rate || 0); }
        } catch {}
      } else if (item.item_type === 'custom_product' || item.item_type === 'custom_service') {
        unitPrice = parseFloat(item.budget_per_unit || 0);
      }
      return { ...item, unit_price: unitPrice };
    }));
    setEnrichedItems(enriched);
  };

  const handleCreateQuote = async (quoteData) => {
    try {
      const response = await quotesAPI.createQuote(quoteData);
      toast.success('Quote created successfully!');
      setShowQuoteCreateModal(false);
      navigate(`/admin/quotes/${response.quote.id}`);
    } catch (error) {
      toast.error('Failed to create quote');
      throw error;
    }
  };

  const formatDate = (d) => d ? format(new Date(d), 'MMMM d, yyyy · h:mm a') : 'N/A';
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handlePriorityChange = async (newPriority) => {
    try { await updatePriority(id, newPriority); fetchAdminQuoteRequestById(id); }
    catch { toast.error('Failed to update priority'); }
  };

  const handleAssign = async (adminId) => {
    try { await assignQuoteRequest(id, adminId); setShowAssignModal(false); fetchAdminQuoteRequestById(id); }
    catch { toast.error('Failed to assign request'); }
  };

  const handleReject = async (reason) => {
    try { await rejectQuoteRequest(id, reason); setShowRejectModal(false); fetchAdminQuoteRequestById(id); }
    catch { toast.error('Failed to reject request'); }
  };

  const handleClarification = async (notes) => {
    try { await requestClarification(id, notes); setShowClarificationModal(false); fetchAdminQuoteRequestById(id); }
    catch { toast.error('Failed to request clarification'); }
  };

  const handleDownloadAttachment = async (index, fileName) => {
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/admin/quote-requests/${id}/attachments/${index}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: fileName });
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch { toast.error('Failed to download file'); }
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loadingCurrent) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: `3px solid ${purpleBd}`, borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Loading request…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error || !currentQuoteRequest) return (
    <div style={{ textAlign: 'center', padding: '80px 24px' }}>
      <FileText size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
      <p style={{ color: '#9ca3af', marginBottom: 20 }}>Quote request not found</p>
      <Btn onClick={() => navigate('/admin/quote-requests')} variant="ghost" icon={<ChevronLeft size={16} />}>Back to Requests</Btn>
    </div>
  );

  const request = currentQuoteRequest;
  const canAct  = request.status !== 'rejected' && !request.quote_id;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px 40px' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        .qr-panel { animation: fadeUp 0.3s ease both; }
        .qr-panel:nth-child(1) { animation-delay: 0.03s; }
        .qr-panel:nth-child(2) { animation-delay: 0.07s; }
        .qr-panel:nth-child(3) { animation-delay: 0.11s; }
        .qr-panel:nth-child(4) { animation-delay: 0.15s; }

        .qr-main-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 20px;
          align-items: start;
        }
        .qr-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .qr-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .qr-title {
          font-size: 1.6rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          margin: 0;
          color: #a855f7;
        }
        .qr-pills {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .qr-items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .qr-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        @media (max-width: 900px) {
          .qr-main-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .qr-header { flex-direction: column; }
          .qr-header-actions { width: 100%; }
          .qr-header-actions > * { flex: 1 1 calc(50% - 4px); justify-content: center; }
          .qr-title { font-size: 1.25rem; }
          .qr-meta-grid { grid-template-columns: 1fr; }
          .qr-items-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 400px) {
          .qr-header-actions > * { flex: 1 1 100%; }
        }
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="qr-header">
        <div>
          <button
            onClick={() => navigate('/admin/quote-requests')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, padding: 0, marginBottom: 10 }}
          >
            <ChevronLeft size={14} /> Back to Requests
          </button>
          <div className="qr-pills">
            <h1 className="qr-title">{request.request_number}</h1>
            <StatusPill   s={request.status} />
            <PriorityPill p={request.priority} />
          </div>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 6, marginBottom: 0 }}>
            {request.request_title}
            {request.request_type && <span style={{ marginLeft: 8, color: purple, fontWeight: 700 }}>· {request.request_type}</span>}
          </p>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 4 }}>
            Submitted {format(new Date(request.created_at), 'MMMM d, yyyy · h:mm a')}
          </p>
        </div>

        <div className="qr-header-actions">
          {canAct && (
            <>
              {(request.status === 'pending' || request.status === 'reviewing') && (
                <Btn variant="success" icon={<FileText size={15} />} onClick={() => setShowQuoteCreateModal(true)}>Convert to Quote</Btn>
              )}
              <Btn variant="primary"  icon={<UserCheck size={15} />} onClick={() => setShowAssignModal(true)}>Assign</Btn>
              <Btn variant="ghost"    icon={<MessageCircle size={15} />} onClick={() => setShowClarificationModal(true)}>Clarify</Btn>
              <Btn variant="danger"   icon={<XCircle size={15} />} onClick={() => setShowRejectModal(true)}>Reject</Btn>
            </>
          )}
          {request.quote_id && (
            <Btn variant="success" icon={<CheckCircle size={15} />} onClick={() => navigate(`/admin/quotes/${request.quote_id}`)}>View Quote</Btn>
          )}
        </div>
      </div>

      {/* ── Alert banners ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {request.status === 'rejected' && request.rejection_reason && (
          <AlertBanner icon={XCircle} color="#b91c1c" bg="rgba(239,68,68,0.06)" border="rgba(239,68,68,0.25)" title="Request Rejected">
            {request.rejection_reason}
          </AlertBanner>
        )}
        {request.requires_clarification && request.clarification_notes && (
          <AlertBanner icon={AlertCircle} color="#92400e" bg="rgba(245,158,11,0.06)" border="rgba(245,158,11,0.25)" title="Clarification Requested — Awaiting Response">
            {request.clarification_notes}
          </AlertBanner>
        )}
        {!request.requires_clarification && request.clarification_notes && request.clarification_response?.length > 0 && (
          <AlertBanner icon={CheckCircle} color="#065f46" bg="rgba(16,185,129,0.06)" border="rgba(16,185,129,0.25)" title="Customer Responded to Clarification">
            {request.clarification_response.at(-1)?.response}
          </AlertBanner>
        )}
        {request.customer_notes && (
          <AlertBanner icon={FileText} color="#1d4ed8" bg="rgba(59,130,246,0.06)" border="rgba(59,130,246,0.2)" title="Customer Notes">
            {request.customer_notes}
          </AlertBanner>
        )}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="qr-main-grid">

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Description */}
          <Panel className="qr-panel">
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={FileText}>Description</SectionLabel>
            </div>
            <div style={{ padding: '16px 22px' }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text,#374151)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                {request.request_description}
              </p>
            </div>
          </Panel>

          {/* Requested Items */}
          {request.requested_items?.length > 0 && (
            <Panel className="qr-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Package}>Requested Items · {request.requested_items.length}</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {request.requested_items.map((item, idx) => {
                  const isService = item.item_type === 'service' || item.item_type === 'custom_service';
                  const Icon = isService ? Wrench : Package;
                  return (
                    <div key={idx} style={{
                      padding: '14px 16px', borderRadius: 12,
                      border: '1px solid var(--border,#f3f4f6)',
                      background: 'var(--row-bg,rgba(249,250,251,0.6))',
                      transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = purpleBd}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border,#f3f4f6)'}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        {/* Icon */}
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: isService ? 'rgba(59,130,246,0.08)' : purpleLt, border: `1px solid ${isService ? 'rgba(59,130,246,0.2)' : purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={20} color={isService ? '#3b82f6' : purple} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Title row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 5px', wordBreak: 'break-word' }}>{item.description}</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                <Pill color={isService ? '#3b82f6' : purple}>{item.item_type.replace('_', ' ')}</Pill>
                                {item.lead_time         && <Pill color="#6b7280">Lead: {item.lead_time || item.custom_details?.lead_time}</Pill>}
                                {item.estimated_hours != null && <Pill color="#6b7280">{item.estimated_hours}h</Pill>}
                                {(item.unit_of_measure || item.custom_details?.unit_of_measure) && <Pill color="#6b7280">Unit: {item.unit_of_measure || item.custom_details?.unit_of_measure}</Pill>}
                              </div>
                            </div>
                            {item.quantity && (
                              <span style={{ fontSize: '0.88rem', fontWeight: 900, color: purple, whiteSpace: 'nowrap', flexShrink: 0 }}>×{item.quantity}</span>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="qr-items-grid">
                            {[
                              item.budget_per_unit && ['Budget/Unit', `KSh ${parseFloat(item.budget_per_unit).toLocaleString()}`],
                              item.specifications  && ['Specs', item.specifications],
                            ].filter(Boolean).map(([k, v]) => (
                              <div key={k} style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--panel-bg,white)', border: '1px solid var(--border,#f3f4f6)' }}>
                                <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 2px' }}>{k}</p>
                                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text,#111827)', margin: 0, wordBreak: 'break-word' }}>{v}</p>
                              </div>
                            ))}
                          </div>

                          {item.notes && (
                            <p style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic', margin: '8px 0 0' }}>Note: {item.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Additional Details */}
          <Panel className="qr-panel">
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Activity}>Additional Details</SectionLabel>
            </div>
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                request.delivery_location && { icon: MapPin,     label: 'Delivery / Service Location', value: request.delivery_location },
                request.budget_range      && { icon: DollarSign, label: 'Budget Range',                value: request.budget_range },
                request.timeline_needed   && { icon: Clock,      label: 'Timeline Needed',             value: request.timeline_needed },
              ].filter(Boolean).map(({ icon: Icon, label, value }) => (
                <div key={label} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border,#f3f4f6)', background: 'var(--row-bg,rgba(249,250,251,0.5))' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon size={11} />{label}
                  </p>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text,#374151)', margin: 0 }}>{value}</p>
                </div>
              ))}

              {/* Attachments */}
              {request.attachments?.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Paperclip size={11} />Attachments · {request.attachments.length}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {request.attachments.map((file, idx) => (
                      <button key={idx} onClick={() => handleDownloadAttachment(idx, file.name)} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 10,
                        border: `1px solid ${purpleBd}`, background: purpleLt,
                        cursor: 'pointer', transition: 'opacity 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <FileText size={16} color={purple} />
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: purple, margin: 0 }}>{file.name}</p>
                            <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <Download size={15} color={purple} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Admin Notes */}
          {request.admin_notes && (
            <Panel className="qr-panel">
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Shield}>Admin Notes (Internal)</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text,#374151)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{request.admin_notes}</p>
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Convert to Quote CTA */}
          {(request.status === 'pending' || request.status === 'reviewing') && (
            <Panel className="qr-panel" accent>
              <div style={{ padding: '18px 20px' }}>
                <Btn variant="success" icon={<FileText size={15} />} onClick={() => setShowQuoteCreateModal(true)} style={{ fullWidth: true, width: '100%', justifyContent: 'center', marginBottom: 10 }}>
                  Convert to Quote
                </Btn>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                  Opens a form pre-filled with all items and details.
                </p>
              </div>
            </Panel>
          )}

          {/* Customer */}
          {request.customer && (
            <Panel className="qr-panel">
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={User}>Customer</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Name',    value: `${request.customer.first_name} ${request.customer.last_name}`, icon: User },
                  { label: 'Email',   value: request.customer.email,        icon: Mail },
                  request.customer.phone        && { label: 'Phone',   value: request.customer.phone,        icon: Phone },
                  request.customer.company_name && { label: 'Company', value: request.customer.company_name, icon: Building },
                ].filter(Boolean).map(({ label, value, icon: Icon }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <Icon size={11} />{label}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text,#111827)', wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Assignment */}
          {request.assigned_to && (
            <Panel className="qr-panel">
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={UserCheck}>Assignment</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Assigned To</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: purple, textAlign: 'right', maxWidth: '60%' }}>
                    {request.assigned_to.name ||
                      `${request.assigned_to.first_name || ''} ${request.assigned_to.last_name || ''}`.trim() ||
                      'Unknown admin'}
                  </span>
                </div>
                {request.assigned_to.email && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Email</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{request.assigned_to.email}</span>
                  </div>
                )}
                {request.assigned_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Assigned</span>
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', textAlign: 'right' }}>{format(new Date(request.assigned_at), 'MMM d · h:mm a')}</span>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Status & Priority */}
          <Panel className="qr-panel" accent>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Activity}>Status & Priority</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Status</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusPill s={request.status} />
                  <select
                    value={request.status}
                    onChange={e => {
                      if (window.confirm(`Change status to "${e.target.value}"?`)) {
                        fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/admin/quote-requests/${id}/status`, {
                          method: 'PUT',
                          headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: e.target.value }),
                        }).then(() => fetchAdminQuoteRequestById(id)).catch(() => toast.error('Failed'));
                      }
                    }}
                    style={{ fontSize: '0.72rem', padding: '3px 6px', borderRadius: 7, border: `1px solid ${purpleBd}`, background: purpleLt, color: purple, fontWeight: 700, cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="pending">Pending</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="quoted">Quoted</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Priority</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PriorityPill p={request.priority} />
                  <select
                    value={request.priority}
                    onChange={e => handlePriorityChange(e.target.value)}
                    style={{ fontSize: '0.72rem', padding: '3px 6px', borderRadius: 7, border: `1px solid ${purpleBd}`, background: purpleLt, color: purple, fontWeight: 700, cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {request.request_type && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Type</span>
                  <Pill color={purple}>{request.request_type}</Pill>
                </div>
              )}

              {/* Actions */}
              {canAct && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border,#f3f4f6)' }}>
                  <Btn variant="ghost"   size="sm" icon={<UserCheck size={14} />}     onClick={() => setShowAssignModal(true)}        style={{ width: '100%', justifyContent: 'center' }}>Assign Request</Btn>
                  <Btn variant="outline" size="sm" icon={<MessageCircle size={14} />} onClick={() => setShowClarificationModal(true)} style={{ width: '100%', justifyContent: 'center' }}>Request Clarification</Btn>
                  <Btn variant="danger"  size="sm" icon={<XCircle size={14} />}       onClick={() => setShowRejectModal(true)}        style={{ width: '100%', justifyContent: 'center' }}>Reject Request</Btn>
                </div>
              )}
              {request.quote_id && (
                <Btn variant="success" size="sm" icon={<CheckCircle size={14} />} onClick={() => navigate(`/admin/quotes/${request.quote_id}`)} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                  View Quote
                </Btn>
              )}
            </div>
          </Panel>

          {/* Admin Notes (editable) */}
          <Panel className="qr-panel">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Shield}>Admin Notes</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {request.admin_notes ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text,#374151)', lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{request.admin_notes}</p>
              ) : (
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic', margin: '0 0 12px' }}>No admin notes yet</p>
              )}
              <Btn variant="ghost" size="sm" icon={<Edit3 size={13} />}
                onClick={() => {
                  const notes = prompt('Enter admin notes:', request.admin_notes || '');
                  if (notes !== null) addAdminNotes(id, notes).then(() => fetchAdminQuoteRequestById(id));
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {request.admin_notes ? 'Update Notes' : 'Add Notes'}
              </Btn>
            </div>
          </Panel>

          {/* Timeline */}
          <Panel className="qr-panel">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Clock}>Timeline</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {[
                { label: 'Created',  date: request.created_at,  color: '#9ca3af', filled: true },
                { label: 'Quoted',   date: request.quoted_at,   color: '#10b981' },
                { label: 'Expires',  date: request.expires_at,  color: '#f59e0b' },
                { label: 'Rejected', date: request.rejected_at, color: '#ef4444' },
              ].filter(t => t.date || t.label === 'Created').map((t, i, arr) => (
                <div key={t.label} style={{ display: 'flex', gap: 12, marginBottom: i < arr.length - 1 ? 12 : 0, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                    <TimelineDot color={t.color} filled={!!t.date} />
                    {i < arr.length - 1 && <div style={{ width: 1, height: 20, background: 'var(--border,#e5e7eb)', marginTop: 4 }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: t.date ? 'var(--text,#374151)' : '#d1d5db', margin: '0 0 2px' }}>{t.label}</p>
                    {t.date && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{format(new Date(t.date), 'MMM d · h:mm a')}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showAssignModal        && <AssignModal        onClose={() => setShowAssignModal(false)}        onAssign={handleAssign} />}
      {showRejectModal        && <RejectModal        onClose={() => setShowRejectModal(false)}        onReject={handleReject} />}
      {showClarificationModal && <ClarificationModal onClose={() => setShowClarificationModal(false)} onRequest={handleClarification} />}

      {showQuoteCreateModal && (
        <QuoteCreate
          isOpen={showQuoteCreateModal}
          onClose={() => setShowQuoteCreateModal(false)}
          onSuccess={handleCreateQuote}
          prefilledData={{
            id: request.id,
            customer_id: request.customer_id,
            request_type: request.request_type,
            priority: request.priority,
            customer_notes: request.customer_notes,
            admin_notes: request.admin_notes,
            request_number: request.request_number,
            assigned_to: request.assigned_to,
            delivery_location: request.delivery_location,
            items: enrichedItems.length > 0 ? enrichedItems : request.requested_items || [],
          }}
        />
      )}
    </div>
  );
};

export default QuoteRequestDetail;