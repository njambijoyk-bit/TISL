import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Calendar, DollarSign, CheckCircle, XCircle, Clock,
  Eye, AlertCircle, TrendingUp, ArrowRightCircle, CalendarX,
  Layers, Plus, Search, X, LayoutGrid, List, ChevronRight
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import AdminPagination from '../../components/common/AdminPagination';
import useQuoteStore from '../../store/quoteStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.3)',  Icon: FileText },
  pending:   { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   Icon: Clock },
  revised:   { label: 'Revised',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)',   Icon: Clock },
  approved:  { label: 'Approved',  color: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   Icon: CheckCircle },
  rejected:  { label: 'Rejected',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    Icon: XCircle },
  expired:   { label: 'Expired',   color: '#6b7280', bg: 'rgba(107,114,128,0.1)',  border: 'rgba(107,114,128,0.3)', Icon: CalendarX },
  converted: { label: 'Converted', color: '#a855f7', bg: 'rgba(168,85,247,0.1)',   border: 'rgba(168,85,247,0.3)',  Icon: TrendingUp },
};

const TABS = [
  { id: 'all',       label: 'All',       Icon: Layers },
  { id: 'pending',   label: 'Awaiting',  Icon: Clock },
  { id: 'approved',  label: 'Approved',  Icon: CheckCircle },
  { id: 'rejected',  label: 'Rejected',  Icon: XCircle },
  { id: 'draft',     label: 'Draft',     Icon: FileText },
  { id: 'converted', label: 'Converted', Icon: ArrowRightCircle },
  { id: 'expired',   label: 'Expired',   Icon: CalendarX },
];

const formatMoney = (amount) => parseFloat(amount || 0).toFixed(2);

const shouldShowKes = (quote) =>
  quote.currency && quote.currency !== 'KES' && quote.total_kes != null;

// ── Quote Card ────────────────────────────────────────────────────────────────
function QuoteCard({ quote, onView }) {
  const cfg = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
  const StatusIcon = cfg.Icon;
  const actionRequired = quote.status === 'pending' || quote.status === 'revised';

  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(168,85,247,0.2)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      overflow: 'hidden',
      transition: 'box-shadow 200ms, transform 200ms',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Status accent bar */}
      <div style={{ height: 3, background: cfg.color, opacity: 0.7 }} />

      <div style={{ padding: '20px 24px' }}>
        {/* Top row: number + status + view */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>
              {quote.quote_number}
            </h3>
            {/* Status pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
              background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
            }}>
              <StatusIcon size={11} /> {cfg.label}
            </span>
            {quote.version > 1 && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', border: '1px solid rgba(168,85,247,0.2)', padding: '2px 7px', borderRadius: 9999 }}>
                v{quote.version}
              </span>
            )}
            {quote.is_negotiable && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 7px', borderRadius: 9999 }}>
                Negotiable
              </span>
            )}
          </div>

          <button onClick={() => onView(quote.id)} type="button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(168,85,247,0.2)', color: '#374151', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#374151'; }}
          >
            <Eye size={14} /> View
          </button>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#6b7280' }}>
            <Calendar size={13} color="#c084fc" />
            <span>{new Date(quote.valid_from).toLocaleDateString()} — {new Date(quote.valid_until).toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#6b7280' }}>
            <FileText size={13} color="#c084fc" />
            <span>{quote.items_count || 0} item{quote.items_count !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em' }}>
            {quote.currency} {formatMoney(quote.total)}
          </span>
          {shouldShowKes(quote) && (
            <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500 }}>
              ≈ KES {formatMoney(quote.total_kes)}
              {quote.exchange_rate_to_kes ? ` (1 ${quote.currency} = ${formatMoney(quote.exchange_rate_to_kes)} KES)` : ''}
            </span>
          )}
        </div>

        {quote.customer_notes && (
          <p style={{ marginTop: 10, fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
            "{quote.customer_notes}"
          </p>
        )}

        {/* Action required alert */}
        {actionRequired && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <AlertCircle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#92400e', margin: 0 }}>Action Required</p>
              <p style={{ fontSize: '0.75rem', color: '#b45309', margin: '2px 0 0' }}>Please review and respond to this quote before it expires.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quote Table ───────────────────────────────────────────────────────────────
function QuoteTable({ quotes, onView }) {
  if (!quotes.length) return null;

  return (
    <div style={{ width: '100%', overflowX: 'auto', borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 1px 8px rgba(168,85,247,0.06)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
        {/* Head */}
        <thead>
          <tr style={{ background: 'rgba(168,85,247,0.05)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
            {['Quote', 'Status', 'Validity', 'Items', 'Total', 'Action', ''].map((h, i) => (
              <th key={i} style={{
                textAlign: 'left', padding: '12px 16px', whiteSpace: 'nowrap',
                fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#a855f7',
              }}>{h}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {quotes.map((quote, idx) => {
            const cfg = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
            const StatusIcon = cfg.Icon;
            const actionRequired = quote.status === 'pending' || quote.status === 'revised';
            const isEven = idx % 2 === 0;

            return (
              <tr
                key={quote.id}
                onClick={() => onView(quote.id)}
                style={{
                  background: isEven ? 'rgba(168,85,247,0.05)' : 'rgba(168,85,247,0.015)',
                  borderBottom: '1px solid rgba(168,85,247,0.08)',
                  borderLeft: `3px solid ${cfg.color}`,
                  cursor: 'pointer', transition: 'background 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = isEven ? 'rgba(120, 85, 247, 0.09)' : 'rgba(168,85,247,0.015)'}
              >
                {/* Quote number + badges */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#a855f7' }}>
                      {quote.quote_number}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {quote.version > 1 && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', border: '1px solid rgba(168,85,247,0.2)', padding: '1px 6px', borderRadius: 9999 }}>
                          v{quote.version}
                        </span>
                      )}
                      {quote.is_negotiable && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', padding: '1px 6px', borderRadius: 9999 }}>
                          Negotiable
                        </span>
                      )}
                    </div>
                    {quote.customer_notes && (
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{quote.customer_notes}"
                      </span>
                    )}
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 700,
                    background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                  }}>
                    <StatusIcon size={10} /> {cfg.label}
                  </span>
                </td>

                {/* Validity */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280' }}>
                    <Calendar size={11} color="#c084fc" />
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {new Date(quote.valid_from).toLocaleDateString()} — {new Date(quote.valid_until).toLocaleDateString()}
                    </span>
                  </div>
                </td>

                {/* Items */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280' }}>
                    <FileText size={11} color="#c084fc" />
                    {quote.items_count || 0} item{quote.items_count !== 1 ? 's' : ''}
                  </div>
                </td>

                {/* Total */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#a855f7' }}>
                      {quote.currency} {formatMoney(quote.total)}
                    </span>
                    {shouldShowKes(quote) && (
                      <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                        ≈ KES {formatMoney(quote.total_kes)}
                      </p>
                    )}
                  </div>
                </td>

                {/* Action required */}
                <td style={{ padding: '12px 16px' }}>
                  {actionRequired ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700,
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
                    }}>
                      <AlertCircle size={10} /> Review
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>
                  )}
                </td>

                {/* View button */}
                <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onView(quote.id)}
                    type="button"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 14px', borderRadius: 9, fontSize: '0.75rem', fontWeight: 700,
                      background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                      border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(168,85,247,0.25)',
                      whiteSpace: 'nowrap', transition: 'opacity 150ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    View <ChevronRight size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const MyQuotes = () => {
  const navigate = useNavigate();
  const { quotes, loading, pagination, fetchMyQuotes, quotesView, setQuotesView } = useQuoteStore();

  const [filter, setFilter]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');


  const [currentPage, setCurrentPage] = useState(1);

  // Update fetchQuotes to use store action with pagination params
  const loadQuotes = async (page = 1) => {
    try {
      await fetchMyQuotes({ page, per_page: 10 }); // ✅ Pass pagination params
    } catch {
      toast.error('Failed to load quotes');
    }
  };

  // Add page change handler
  const handlePageChange = (page) => {
    setCurrentPage(page);
    loadQuotes(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset page when tab filter changes (NOT search — search is frontend-only)
  useEffect(() => {
    setCurrentPage(1);
    loadQuotes(1);
  }, [filter]);

  const counts = {
    all:       quotes.length,
    pending:   quotes.filter(q => q.status === 'pending' || q.status === 'revised').length,
    approved:  quotes.filter(q => q.status === 'approved').length,
    rejected:  quotes.filter(q => q.status === 'rejected').length,
    draft:     quotes.filter(q => q.status === 'draft').length,
    expired:   quotes.filter(q => q.status === 'expired').length,
    converted: quotes.filter(q => q.status === 'converted').length,
  };

  const filteredQuotes = useMemo(() => {
    let result = filter === 'all'
      ? quotes
      : quotes.filter(q => filter === 'pending' ? (q.status === 'pending' || q.status === 'revised') : q.status === filter);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(quote =>
        quote.quote_number?.toLowerCase().includes(q) ||
        quote.status?.toLowerCase().includes(q) ||
        quote.currency?.toLowerCase().includes(q) ||
        quote.customer_notes?.toLowerCase().includes(q) ||
        quote.items?.some(i =>
          i.product_name?.toLowerCase().includes(q) ||
          i.name?.toLowerCase().includes(q)
        )
      );
    }
    return result;
  }, [quotes, filter, searchQuery]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
      <Footer />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '2px solid rgba(168,85,247,0.2)', padding: '32px 24px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>Account</p>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: 0 }}>My Quotes</h1>
              <p style={{ marginTop: 6, fontSize: '0.88rem', color: '#9ca3af', fontWeight: 500 }}>
                {quotes.length} quote{quotes.length !== 1 ? 's' : ''} total
              </p>
            </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {/* View toggle */}
            <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.2)' }}>
              <button
                type="button"
                onClick={() => setQuotesView('card')}
                title="Card view"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, cursor: 'pointer', border: 'none', transition: 'all 150ms',
                  background: quotesView === 'card' ? 'rgba(168,85,247,0.12)' : 'transparent',
                  color: quotesView === 'card' ? '#a855f7' : '#c084fc',
                }}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setQuotesView('table')}
                title="Table view"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, cursor: 'pointer', border: 'none',
                  borderLeft: '1px solid rgba(168,85,247,0.2)', transition: 'all 150ms',
                  background: quotesView === 'table' ? 'rgba(168,85,247,0.12)' : 'transparent',
                  color: quotesView === 'table' ? '#a855f7' : '#c084fc',
                }}
              >
                <List size={15} />
              </button>
            </div>

            <button onClick={() => navigate('/request-quote')} type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(168,85,247,0.35)' }}>
              <Plus size={16} /> Request Quote
            </button>
          </div>
          </div>

          {/* ── Search bar ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search quotes by number, status, currency, notes…"
                style={{ width: '100%', padding: '10px 40px', borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.2)', fontSize: '0.85rem', outline: 'none', background: 'white', color: '#111827', boxSizing: 'border-box' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                onBlur={e =>  { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                  <X size={15} />
                </button>
              )}
            </div>
            {searchQuery && (
              <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#9ca3af' }}>
                {filteredQuotes.length} result{filteredQuotes.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            )}
          </div>

          {/* ── Tab bar ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {TABS.map(({ id, label, Icon }) => {
              const active = filter === id;
              const count  = counts[id] ?? 0;
              return (
                <button key={id} onClick={() => setFilter(id)} type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '12px 18px', border: 'none', cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap',
                    fontSize: '0.82rem', fontWeight: 700,
                    color: active ? '#a855f7' : '#9ca3af',
                    borderBottom: active ? '2.5px solid #a855f7' : '2.5px solid transparent',
                    transition: 'all 150ms', marginBottom: -1,
                  }}
                >
                  <Icon size={14} />
                  {label}
                  <span style={{
                    minWidth: 18, padding: '1px 5px', borderRadius: 9999, fontSize: '0.65rem', fontWeight: 800,
                    background: active ? 'rgba(168,85,247,0.12)' : '#f3f4f6',
                    color: active ? '#a855f7' : '#9ca3af',
                    transition: 'all 150ms',
                  }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
        {filteredQuotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', borderRadius: 20, border: '1px solid rgba(168,85,247,0.2)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              {searchQuery ? <Search size={28} color="#c084fc" /> : <FileText size={28} color="#c084fc" />}
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', marginBottom: 8 }}>
              {searchQuery ? 'No Results Found' : 'No quotes found'}
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#9ca3af', marginBottom: 24 }}>
              {searchQuery
                ? `Nothing matched "${searchQuery}". Try a different term.`
                : filter === 'all' ? "You don't have any quotes yet." : `No ${filter} quotes to show.`}
            </p>
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery('')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, border: '1.5px solid rgba(168,85,247,0.2)', cursor: 'pointer', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.85rem' }}>
                <X size={14} /> Clear Search
              </button>
            ) : (
              <button onClick={() => navigate('/request-quote')} type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 14px rgba(168,85,247,0.3)' }}>
                <Plus size={15} /> Request a Quote
              </button>
            )}
          </div>
        ) : (
          quotesView === 'table' ? (
            <QuoteTable
              quotes={filteredQuotes}
              onView={(id) => navigate(`/my-quotes/${id}`)}
            />
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
            {filteredQuotes.map(q => (
              <QuoteCard key={q.id} quote={q} onView={(id) => navigate(`/my-quotes/${id}`)} />
            ))}
          </div>
          )
        )}
      </div>

      {/* MyQuotes.jsx - After the quotes grid, before Footer */}
      {filteredQuotes.length > 0 && pagination?.last_page > 1 && (
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
          <AdminPagination 
            pagination={pagination} 
            onPageChange={handlePageChange} 
          />
        </div>
      )}

      {/* Optional: Show "Showing X–Y of Z" info */}
      {pagination && (
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', marginTop: 8 }}>
          Showing {(pagination.current_page - 1) * pagination.per_page + 1}–
          {Math.min(pagination.current_page * pagination.per_page, pagination.total)} of {pagination.total}
        </p>
      )}

      <Footer />
    </div>
  );
};

export default MyQuotes;