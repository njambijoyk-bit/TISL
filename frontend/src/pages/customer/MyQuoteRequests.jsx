import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, X, Clock, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
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

const MyQuoteRequests = () => {
  const navigate = useNavigate();
  const {
    quoteRequests, pagination, loading, error,
    fetchMyQuoteRequests, setSearch, setStatus, setPage,
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
            <button onClick={() => navigate('/request-quote')} type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(168,85,247,0.35)', marginBottom: 4 }}>
              <Plus size={16} /> New Request
            </button>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              {filteredRequests.map(req => (
                <QuoteRequestCard key={req.id} request={req} showCustomer={false} />
              ))}
            </div>

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