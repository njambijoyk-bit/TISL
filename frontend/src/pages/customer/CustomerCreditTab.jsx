import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, TrendingDown, TrendingUp, RefreshCw, Percent, Ban,
  FileText, Calendar, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, ChevronDown, X,
} from 'lucide-react';
import { customerCreditAPI } from '../../api/customerCredit';

// ── Style atoms (matches Profile.jsx light theme) ─────────────────────────────

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: '0.82rem',
  border: '1.5px solid #e5e7eb', color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box', background: 'white',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; };

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  padding: 20,
};

const sectionTitle = {
  fontSize: '0.875rem', fontWeight: 700, color: '#111827',
  display: 'flex', alignItems: 'center', gap: 8,
  margin: '0 0 16px', paddingBottom: 12,
  borderBottom: '1px solid #f3f4f6',
};

const labelStyle = {
  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#9ca3af', display: 'block', marginBottom: 4,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', {
  style: 'currency', currency: 'KES', minimumFractionDigits: 0,
});

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

// ── Pill badge ────────────────────────────────────────────────────────────────

function Pill({ children, color = '#7c3aed', bg = 'rgba(124,58,237,0.08)', ring = 'rgba(124,58,237,0.2)' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`,
    }}>
      {children}
    </span>
  );
}

// ── Status colour maps ────────────────────────────────────────────────────────

const INVOICE_STATUS = {
  draft:   { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', ring: 'rgba(107,114,128,0.2)' },
  sent:    { color: '#1d4ed8', bg: 'rgba(59,130,246,0.08)',  ring: 'rgba(59,130,246,0.2)'  },
  paid:    { color: '#065f46', bg: 'rgba(16,185,129,0.08)',  ring: 'rgba(16,185,129,0.2)'  },
  overdue: { color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   ring: 'rgba(239,68,68,0.2)'   },
  void:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', ring: 'rgba(156,163,175,0.2)' },
};

const SCHEDULE_STATUS = {
  active:    { color: '#065f46', bg: 'rgba(16,185,129,0.08)',  ring: 'rgba(16,185,129,0.2)'  },
  completed: { color: '#1d4ed8', bg: 'rgba(59,130,246,0.08)',  ring: 'rgba(59,130,246,0.2)'  },
  defaulted: { color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   ring: 'rgba(239,68,68,0.2)'   },
  cancelled: { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', ring: 'rgba(156,163,175,0.2)' },
};

const ITEM_STATUS = {
  pending: { color: '#b45309', bg: 'rgba(245,158,11,0.08)',  ring: 'rgba(245,158,11,0.2)'  },
  paid:    { color: '#065f46', bg: 'rgba(16,185,129,0.08)',  ring: 'rgba(16,185,129,0.2)'  },
  overdue: { color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   ring: 'rgba(239,68,68,0.2)'   },
  waived:  { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', ring: 'rgba(107,114,128,0.2)' },
};

const TX_TYPE_ICON = {
  purchase:   <TrendingUp   size={12} />,
  payment:    <TrendingDown size={12} />,
  adjustment: <RefreshCw    size={12} />,
  write_off:  <Ban          size={12} />,
  interest:   <Percent      size={12} />,
};

const TX_DIR_COLOR = { debit: '#dc2626', credit: '#059669' };

// ── Pagination strip ──────────────────────────────────────────────────────────

function Pagination({ meta, onPage }) {
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderTop: '1px solid #f3f4f6',
      background: '#fafafa',
    }}>
      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
        Page {meta.current_page} of {meta.last_page}
      </p>
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { icon: <ChevronLeft size={13} />, p: meta.current_page - 1, disabled: meta.current_page <= 1 },
          { icon: <ChevronRight size={13} />, p: meta.current_page + 1, disabled: meta.current_page >= meta.last_page },
        ].map(({ icon, p, disabled }, i) => (
          <button key={i} onClick={() => !disabled && onPage(p)} disabled={disabled} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid #e5e7eb', background: 'none',
            color: '#6366f1', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1,
          }}>{icon}</button>
        ))}
      </div>
    </div>
  );
}

// ── Summary sub-tab ───────────────────────────────────────────────────────────

function SummaryTab({ summary }) {
  if (!summary) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={22} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  const { credit_limit, credit_used, credit_available, utilization_pct, interest_rate, currency, is_overdue } = summary;
  const pct = Math.min(Number(utilization_pct), 100);
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Overdue warning banner */}
      {is_overdue && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: '0.82rem', color: '#b91c1c',
        }}>
          <AlertTriangle size={15} />
          <span>You have overdue payments. Please contact support or check your invoices/schedules.</span>
        </div>
      )}

      {/* Main balance card */}
      <div style={card}>
        <p style={sectionTitle}><CreditCard size={14} style={{ color: '#6366f1' }} /> Credit Account</p>

        {/* Big number */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Outstanding balance
          </p>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.03em' }}>
            {fmt(credit_used)}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '2px 0 0' }}>
            of {fmt(credit_limit)} credit limit
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ height: 8, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 4,
              background: barColor, transition: 'width 0.8s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
            <span style={{ color: '#9ca3af' }}>{pct.toFixed(1)}% used</span>
            <span style={{ color: pct >= 100 ? '#ef4444' : '#059669', fontWeight: 600 }}>
              {fmt(credit_available)} available
            </span>
          </div>
        </div>

        {/* Row stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Credit limit',    value: fmt(credit_limit),     color: '#374151' },
            { label: 'Amount used',     value: fmt(credit_used),      color: pct >= 100 ? '#ef4444' : '#374151' },
            { label: 'Available',       value: fmt(credit_available), color: credit_available <= 0 ? '#ef4444' : '#059669' },
            { label: 'Interest rate',   value: `${interest_rate}%`,   color: '#6366f1' },
            { label: 'Currency',        value: currency?.code ?? 'KES', color: '#374151' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 10px', borderRadius: 8, background: '#f9fafb',
              fontSize: '0.8rem',
            }}>
              <span style={{ color: '#6b7280' }}>{label}</span>
              <span style={{ color, fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info note */}
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: '#f0f9ff', border: '1px solid #bae6fd',
        fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5,
      }}>
        💡 To make payments or discuss your credit account, please contact our team directly.
        Your statement and invoices are available in the tabs above.
      </div>
    </div>
  );
}

// ── Statement sub-tab ─────────────────────────────────────────────────────────

function StatementTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [filters, setFilters] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 20 };
      if (filters.from) params.from = filters.from;
      if (filters.to)   params.to   = filters.to;
      setData(await customerCreditAPI.getStatement(params));
    } catch {}
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.data ?? [];
  const meta = { current_page: data?.current_page ?? 1, last_page: data?.last_page ?? 1, total: data?.total ?? 0 };

  return (
    <div>
      {/* Date filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={filters.from} onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1); }}
            style={{ ...inputStyle, width: 'auto' }} onFocus={inputFocus} onBlur={inputBlur} />
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>to</span>
          <input type="date" value={filters.to} onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1); }}
            style={{ ...inputStyle, width: 'auto' }} onFocus={inputFocus} onBlur={inputBlur} />
        </div>
        {(filters.from || filters.to) && (
          <button onClick={() => { setFilters({ from: '', to: '' }); setPage(1); }} style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem',
            color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                {['Date', 'Type', 'Note', 'Balance before', 'Amount', 'Balance after'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: '#9ca3af', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                      {[70, 80, 140, 90, 80, 90].map((w, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: 11, width: w, borderRadius: 6, background: '#f3f4f6' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <FileText size={28} style={{ color: '#e5e7eb', margin: '0 auto 10px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No transactions yet</p>
                      </td>
                    </tr>
                  )
                  : rows.map((tx, i) => {
                      const isCredit = tx.direction === 'credit';
                      return (
                        <tr key={tx.id} style={{
                          borderBottom: i === rows.length - 1 ? 'none' : '1px solid #f9fafb',
                          transition: 'background 120ms',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '11px 14px', fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                            {fmtDate(tx.created_at)}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>
                              {TX_TYPE_ICON[tx.type]} {tx.type?.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.75rem', color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.note ?? '—'}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.78rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmt(tx.balance_before)}
                          </td>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: TX_DIR_COLOR[tx.direction], fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {isCredit ? '−' : '+'}{fmt(tx.amount)}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmt(tx.balance_after)}
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
        <Pagination meta={!loading && rows.length > 0 ? meta : null} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Schedules sub-tab ─────────────────────────────────────────────────────────

function SchedulesTab() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    setLoading(true);
    customerCreditAPI.getSchedules({ per_page: 50 })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const schedules = data?.data ?? [];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={22} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (schedules.length === 0) return (
    <div style={{ ...card, textAlign: 'center', padding: '48px 24px', border: '1.5px dashed #e5e7eb', background: 'transparent' }}>
      <Calendar size={28} style={{ color: '#e5e7eb', margin: '0 auto 8px', display: 'block' }} />
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No installment schedules</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {schedules.map(sched => {
        const ss = SCHEDULE_STATUS[sched.status] ?? SCHEDULE_STATUS.active;
        const items = sched.items ?? [];
        const paid = items.filter(i => i.status === 'paid').length;
        const isOpen = expanded[sched.id];

        return (
          <div key={sched.id} style={card}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                    {fmt(sched.total_amount)} — {sched.installments} installments ({sched.frequency})
                  </p>
                  <Pill color={ss.color} bg={ss.bg} ring={ss.ring}>{sched.status}</Pill>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                  <span>Started {fmtDate(sched.started_at)}</span>
                  {sched.next_due_date && <span style={{ color: sched.status === 'active' ? '#b45309' : '#9ca3af', fontWeight: 600 }}>Next due {fmtDate(sched.next_due_date)}</span>}
                  <span>{paid}/{items.length} paid</span>
                </div>
                {/* Progress bar */}
                {items.length > 0 && (
                  <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: '#f3f4f6', overflow: 'hidden', maxWidth: 300 }}>
                    <div style={{ height: '100%', width: `${(paid / items.length) * 100}%`, background: '#10b981', borderRadius: 2, transition: 'width 0.5s ease' }} />
                  </div>
                )}
              </div>
              <button onClick={() => toggle(sched.id)} style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7, border: '1px solid #e5e7eb', background: 'none',
                color: '#6366f1', cursor: 'pointer', flexShrink: 0,
              }}>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
              </button>
            </div>

            {/* Installment items */}
            {isOpen && (
              <div style={{ marginTop: 14, borderTop: '1px solid #f3f4f6', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {items.map(item => {
                  const is = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending;
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 8, background: '#fafafa',
                      border: '1px solid #f3f4f6', gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', minWidth: 18 }}>#{item.installment_number}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{fmt(item.amount)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Due {fmtDate(item.due_date)}</span>
                        {item.paid_at && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Paid {fmtDate(item.paid_at)}</span>}
                        <Pill color={is.color} bg={is.bg} ring={is.ring}>{item.status}</Pill>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Invoices sub-tab ──────────────────────────────────────────────────────────

function InvoicesTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await customerCreditAPI.getInvoices({ page, per_page: 15 })); }
    catch {} finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const invoices = data?.data ?? [];
  const meta = { current_page: data?.current_page ?? 1, last_page: data?.last_page ?? 1 };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={22} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (invoices.length === 0) return (
    <div style={{ ...card, textAlign: 'center', padding: '48px 24px', border: '1.5px dashed #e5e7eb', background: 'transparent' }}>
      <FileText size={28} style={{ color: '#e5e7eb', margin: '0 auto 8px', display: 'block' }} />
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No invoices yet</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {invoices.map(inv => {
        const is = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft;
        return (
          <div key={inv.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Invoice number + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#6366f1', margin: 0, fontFamily: 'monospace' }}>
                    {inv.invoice_number}
                  </p>
                  <Pill color={is.color} bg={is.bg} ring={is.ring}>{inv.status}</Pill>
                  {inv.is_overdue && (
                    <Pill color="#b91c1c" bg="rgba(239,68,68,0.08)" ring="rgba(239,68,68,0.2)">
                      <AlertTriangle size={9} /> Overdue
                    </Pill>
                  )}
                </div>

                {/* Dates row */}
                <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: '#9ca3af', flexWrap: 'wrap', marginBottom: 10 }}>
                  <span>Issued {fmtDate(inv.created_at)}</span>
                  {inv.due_date && (
                    <span style={{ color: inv.is_overdue ? '#b91c1c' : '#9ca3af', fontWeight: inv.is_overdue ? 700 : 400 }}>
                      Due {fmtDate(inv.due_date)}
                    </span>
                  )}
                  {inv.sent_at && <span>Sent {fmtDate(inv.sent_at)}</span>}
                  {inv.paid_at && <span style={{ color: '#059669', fontWeight: 600 }}>Paid {fmtDate(inv.paid_at)}</span>}
                </div>

                {/* Line items */}
                {(inv.items ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {inv.items.slice(0, 4).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#6b7280' }}>{item.description}</span>
                        <span style={{ color: '#111827', fontWeight: 600 }}>{fmt(item.amount)}</span>
                      </div>
                    ))}
                    {inv.items.length > 4 && (
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>
                        +{inv.items.length - 4} more items
                      </p>
                    )}
                    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#9ca3af' }}>Total</span>
                      <span style={{ fontWeight: 800, color: '#111827' }}>{fmt(inv.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}

// ── Main CustomerCreditTab ────────────────────────────────────────────────────

export default function CustomerCreditTab({ customer }) {
  const [tab,        setTab]        = useState('summary');
  const [summary,    setSummary]    = useState(null);
  const [sumLoading, setSumLoading] = useState(true);

  useEffect(() => {
    setSumLoading(true);
    customerCreditAPI.getSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setSumLoading(false));
  }, []);

  // Customer doesn't have credit account enabled
  if (customer && !customer.has_credit_account) return (
    <div style={{
      ...card, textAlign: 'center', padding: '60px 24px',
      border: '1.5px dashed #e5e7eb', background: 'transparent',
    }}>
      <CreditCard size={32} style={{ color: '#e5e7eb', margin: '0 auto 12px', display: 'block' }} />
      <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#6b7280', margin: '0 0 6px' }}>
        No credit account
      </p>
      <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
        You don't have a credit account set up yet. Contact us to learn more.
      </p>
    </div>
  );

  const SUB_TABS = [
    { key: 'summary',   label: 'Overview'  },
    { key: 'statement', label: 'Statement' },
    { key: 'schedules', label: 'Schedules' },
    { key: 'invoices',  label: 'Invoices'  },
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 20,
        borderBottom: '2px solid #f3f4f6',
      }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', fontSize: '0.78rem',
            fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? '#6366f1' : '#9ca3af',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: `2px solid ${tab === t.key ? '#6366f1' : 'transparent'}`,
            marginBottom: -2, transition: 'color 150ms',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'summary'   && <SummaryTab summary={sumLoading ? null : summary} />}
      {tab === 'statement' && <StatementTab />}
      {tab === 'schedules' && <SchedulesTab />}
      {tab === 'invoices'  && <InvoicesTab />}
    </div>
  );
}