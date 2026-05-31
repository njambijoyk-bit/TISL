import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, X, Clock, CheckCircle, XCircle, Eye, RefreshCw, LayoutGrid, List, ChevronRight, AlertCircle, Package, Wrench, Layers, Calendar, DollarSign, User } from 'lucide-react';
import useQuoteRequestStore from '../../store/quoteRequestStore';
import QuoteRequestCard from '../../components/quotes/QuoteRequestCard';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import EmptyState from '../../components/layout/EmptyState';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Button from '../../components/common/Button';

const STATUS_TABS = [
  { id: '',          label: 'All' },
  { id: 'pending',   label: 'Pending',      color: '#f59e0b' },
  { id: 'reviewing', label: 'Under Review',  color: '#3b82f6' },
  { id: 'quoted',    label: 'Quoted',        color: '#10b981' },
  { id: 'rejected',  label: 'Rejected',      color: '#ef4444' },
  { id: 'expired',   label: 'Expired',       color: '#9ca3af' },
];

const STATUS_GUIDE = [
  { color: '#f59e0b', label: 'Pending',      desc: 'Received and awaiting review' },
  { color: '#3b82f6', label: 'Under Review', desc: 'Team is preparing your quote' },
  { color: '#10b981', label: 'Quoted',       desc: 'A quote has been created' },
  { color: '#ef4444', label: 'Rejected',     desc: 'Unable to fulfill at this time' },
  { color: '#9ca3af', label: 'Expired',      desc: 'Expired without a response' },
];

const STATUS_CFG = {
  pending:   { color: '#f59e0b', label: 'Pending' },
  reviewing: { color: '#3b82f6', label: 'Under Review' },
  quoted:    { color: '#10b981', label: 'Quoted' },
  rejected:  { color: '#ef4444', label: 'Rejected' },
  expired:   { color: '#9ca3af', label: 'Expired' },
};

const PRIORITY_CFG = {
  low:    { color: '#9ca3af' },
  medium: { color: '#3b82f6' },
  high:   { color: '#f59e0b' },
  urgent: { color: '#ef4444' },
};

const TYPE_MAP = {
  product:  { label: 'Product',           Icon: Package },
  service:  { label: 'Service',           Icon: Wrench },
  mixed:    { label: 'Product & Service', Icon: Layers },
  not_sure: { label: 'Not Sure',          Icon: AlertCircle },
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

// ── Quote Request Table ───────────────────────────────────────────────────────
function QuoteRequestTable({ requests, showCustomer = false }) {
  if (!requests.length) return null;

  return (
    <div style={{ width: '100%', overflowX: 'auto', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 1px 8px rgba(168,85,247,0.06)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
        {/* Head */}
        <thead>
          <tr style={{ background: 'rgba(168,85,247,0.05)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
            {['Request', 'Status', 'Type', 'Priority', 'Date', 'Budget / Timeline', 'Flags', ''].map((h, i) => (
              <th key={i} style={{
                textAlign: 'left', padding: '12px 16px', whiteSpace: 'nowrap',
                fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#a855f7',
              }}>{h}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {requests.map((req, idx) => {
            const statusCfg   = STATUS_CFG[req.status]     || { color: '#9ca3af', label: req.status };
            const priorityCfg = req.priority ? PRIORITY_CFG[req.priority] : null;
            const typeCfg     = TYPE_MAP[req.request_type] || { label: req.request_type, Icon: FileText };
            const TypeIcon    = typeCfg.Icon;
            const isEven      = idx % 2 === 0;

            return (
              <tr
                key={req.id}
                style={{
                  background: isEven ? 'rgba(168,85,247,0.05)' : 'rgba(168,85,247,0.015)',
                  borderBottom: '1px solid rgba(168,85,247,0.08)',
                  borderLeft: `3px solid ${statusCfg.color}`,
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = isEven ? 'rgba(120, 85, 247, 0.09)' : 'rgba(168,85,247,0.015)'}
              >
                {/* Request number + title + customer */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#9ca3af' }}>{req.request_number}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#a855f7', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.request_title}
                    </span>
                    {showCustomer && req.customer && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#9ca3af' }}>
                        <User size={10} /> {req.customer.first_name} {req.customer.last_name}
                      </div>
                    )}
                    {req.request_description && (
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.request_description}
                      </span>
                    )}
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 700,
                    background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}44`, color: statusCfg.color,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusCfg.color }} />
                    {req.status_label || statusCfg.label}
                  </span>
                </td>

                {/* Type */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280' }}>
                    <TypeIcon size={12} color="#c084fc" /> {typeCfg.label}
                  </div>
                  {req.requested_items?.length > 0 && (
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0' }}>
                      {req.requested_items.length} item{req.requested_items.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </td>

                {/* Priority */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  {priorityCfg ? (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                      background: `${priorityCfg.color}14`, border: `1px solid ${priorityCfg.color}33`, color: priorityCfg.color,
                    }}>
                      {req.priority_label || req.priority}
                    </span>
                  ) : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>}
                </td>

                {/* Date */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280' }}>
                    <Calendar size={11} color="#c084fc" />
                    {formatDate(req.created_at)}
                  </div>
                </td>

                {/* Budget / Timeline */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {req.budget_range ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#6b7280' }}>
                        <DollarSign size={11} color="#c084fc" /> {req.budget_range}
                      </div>
                    ) : null}
                    {req.timeline_needed ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#6b7280' }}>
                        <Clock size={11} color="#c084fc" /> {req.timeline_needed}
                      </div>
                    ) : null}
                    {!req.budget_range && !req.timeline_needed && (
                      <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>
                    )}
                  </div>
                </td>

                {/* Flags */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {req.requires_clarification && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700,
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
                        whiteSpace: 'nowrap',
                      }}>
                        <AlertCircle size={9} /> Clarification
                      </span>
                    )}
                    {req.quote_id && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700,
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981',
                        whiteSpace: 'nowrap',
                      }}>
                        <CheckCircle size={9} /> Quote Ready
                      </span>
                    )}
                    {req.status === 'rejected' && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444',
                        whiteSpace: 'nowrap',
                      }}>
                        <XCircle size={9} /> Rejected
                      </span>
                    )}
                    {!req.requires_clarification && !req.quote_id && req.status !== 'rejected' && (
                      <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <a
                      href={`/my-quote-requests/${req.id}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '6px 14px', borderRadius: 9, fontSize: '0.75rem', fontWeight: 700,
                        background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                        border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(168,85,247,0.25)',
                        whiteSpace: 'nowrap', textDecoration: 'none',
                      }}
                    >
                      View <ChevronRight size={12} />
                    </a>
                    {req.quote_id && (
                      <a
                        href={showCustomer ? `/admin/quotes/${req.quote_id}` : `/my-quotes/${req.quote_id}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 9, fontSize: '0.72rem', fontWeight: 700,
                          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981',
                          whiteSpace: 'nowrap', textDecoration: 'none',
                        }}
                      >
                        Quote <ChevronRight size={11} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MyQuoteRequests = () => {
  const navigate = useNavigate();
  const {
    quoteRequests, pagination, loading, error,
    fetchMyQuoteRequests, setSearch, setStatus, setPage,
    quoteRequestsView, setQuoteRequestsView,
  } = useQuoteRequestStore();

  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { fetchMyQuoteRequests(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchTerm);
    setPage(1);
    fetchMyQuoteRequests();
  };

  const handleClear = () => {
    setSearchTerm(''); setStatusFilter('');
    setSearch(''); setStatus(null);
    setPage(1);
    fetchMyQuoteRequests();
  };

  const handleStatusTab = (s) => {
    setStatusFilter(s);
    setStatus(s || null);
    fetchMyQuoteRequests();
  };

  const handlePageChange = (page) => {
    setPage(page);
    fetchMyQuoteRequests();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasFilters = searchTerm || statusFilter;

  const filteredRequests = quoteRequests.filter(req => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.trim().toLowerCase();
    return (
      req.id?.toString().includes(q) ||
      req.status?.toLowerCase().includes(q) ||
      req.notes?.toLowerCase().includes(q) ||
      req.reference_number?.toLowerCase().includes(q) ||
      req.items?.some(i =>
        i.product_name?.toLowerCase().includes(q) ||
        i.name?.toLowerCase().includes(q)
      )
    );
  });

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '2px solid rgba(168,85,247,0.2)', padding: '32px 24px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>Account</p>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#c084fc', letterSpacing: '-0.02em', margin: 0 }}>Quote Requests</h1>
              <p style={{ marginTop: 6, fontSize: '0.88rem', color: '#9ca3af', fontWeight: 500 }}>
                {pagination?.total ?? quoteRequests.length} request{(pagination?.total ?? quoteRequests.length) !== 1 ? 's' : ''} total
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {/* View toggle */}
              <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.2)' }}>
                <button
                  type="button"
                  onClick={() => setQuoteRequestsView('card')}
                  title="Card view"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, cursor: 'pointer', border: 'none', transition: 'all 150ms',
                    background: quoteRequestsView === 'card' ? 'rgba(168,85,247,0.12)' : 'transparent',
                    color: quoteRequestsView === 'card' ? '#a855f7' : '#c084fc',
                  }}
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteRequestsView('table')}
                  title="Table view"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, cursor: 'pointer', border: 'none',
                    borderLeft: '1px solid rgba(168,85,247,0.2)', transition: 'all 150ms',
                    background: quoteRequestsView === 'table' ? 'rgba(168,85,247,0.12)' : 'transparent',
                    color: quoteRequestsView === 'table' ? '#a855f7' : '#c084fc',
                  }}
                >
                  <List size={15} />
                </button>
              </div>

              <button onClick={() => navigate('/request-quote')} type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(168,85,247,0.35)' }}>
                <Plus size={16} /> New Request
              </button>
            </div>
          </div>

          {/* ── Search bar ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search by ID, product name, status, or notes…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '10px 40px', borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.2)', fontSize: '0.85rem', outline: 'none', background: 'white', color: '#111827', boxSizing: 'border-box' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                onBlur={e =>  { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                  <X size={15} />
                </button>
              )}
            </div>
            {searchTerm && (
              <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#9ca3af' }}>
                {filteredRequests.length} result{filteredRequests.length !== 1 ? 's' : ''} for "{searchTerm}"
              </p>
            )}
          </div>

          {/* ── Status tabs ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {STATUS_TABS.map(({ id, label, color }) => {
              const active = statusFilter === id;
              return (
                <button key={id} onClick={() => handleStatusTab(id)} type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '11px 16px', border: 'none', cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap',
                    fontSize: '0.82rem', fontWeight: 700,
                    color: active ? (color || '#a855f7') : '#9ca3af',
                    borderBottom: active ? `2.5px solid ${color || '#a855f7'}` : '2.5px solid transparent',
                    transition: 'all 150ms', marginBottom: 20,
                  }}
                >
                  {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? color : '#d1d5db', flexShrink: 0 }} />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#991b1b', fontSize: '0.85rem', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <LoadingSpinner size="lg" />
          </div>

        ) : filteredRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', borderRadius: 20, border: '1px solid rgba(168,85,247,0.2)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              {searchTerm ? <Search size={28} color="#c084fc" /> : <FileText size={28} color="#c084fc" />}
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', marginBottom: 8 }}>
              {searchTerm ? 'No Results Found' : 'No quote requests yet'}
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#9ca3af', marginBottom: 24 }}>
              {searchTerm
                ? `Nothing matched "${searchTerm}". Try a different term.`
                : hasFilters ? 'Try adjusting your filters' : 'Start by requesting a custom quote for your needs'}
            </p>
            {searchTerm ? (
              <button type="button" onClick={() => setSearchTerm('')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, border: '1.5px solid rgba(168,85,247,0.2)', cursor: 'pointer', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.85rem' }}>
                <X size={14} /> Clear Search
              </button>
            ) : !hasFilters && (
              <button onClick={() => navigate('/request-quote')} type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(168,85,247,0.3)' }}>
                <Plus size={15} /> Request a Quote
              </button>
            )}
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 16, fontWeight: 500 }}>
              Showing {filteredRequests.length} of {pagination?.total ?? quoteRequests.length}
              {pagination?.current_page > 1 ? ` · Page ${pagination.current_page} of ${pagination.last_page}` : ''}
            </p>

            {quoteRequestsView === 'table' ? (
              <QuoteRequestTable requests={filteredRequests} showCustomer={false} />
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              {filteredRequests.map(req => (
                <QuoteRequestCard key={req.id} request={req} showCustomer={false} />
              ))}
            </div>
            )}

            {/* Pagination */}
            {pagination?.last_page > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 32 }}>
                <button onClick={() => handlePageChange(pagination.current_page - 1)} disabled={pagination.current_page === 1} type="button"
                  style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: pagination.current_page === 1 ? 'not-allowed' : 'pointer', opacity: pagination.current_page === 1 ? 0.4 : 1 }}>
                  Previous
                </button>
                {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                  let p = pagination.last_page <= 5 ? i + 1
                    : pagination.current_page <= 3 ? i + 1
                    : pagination.current_page >= pagination.last_page - 2 ? pagination.last_page - 4 + i
                    : pagination.current_page - 2 + i;
                  const active = p === pagination.current_page;
                  return (
                    <button key={p} onClick={() => handlePageChange(p)} type="button"
                      style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${active ? '#a855f7' : 'rgba(168,85,247,0.2)'}`, background: active ? '#a855f7' : 'white', color: active ? 'white' : '#374151', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', boxShadow: active ? '0 0 0 3px rgba(168,85,247,0.15)' : 'none' }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => handlePageChange(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page} type="button"
                  style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: pagination.current_page === pagination.last_page ? 'not-allowed' : 'pointer', opacity: pagination.current_page === pagination.last_page ? 0.4 : 1 }}>
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Status Guide ────────────────────────────────────────────────── */}
        <div style={{ marginTop: 48, background: 'white', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', padding: '24px 28px' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 16 }}>Status Guide</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {STATUS_GUIDE.map(({ color, label, desc }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', margin: 0 }}>{label}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '3px 0 0' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default MyQuoteRequests;