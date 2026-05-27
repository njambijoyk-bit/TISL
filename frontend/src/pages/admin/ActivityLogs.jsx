import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, AlertTriangle, XCircle, Info, Clock, User,
  Search, RefreshCw, ChevronLeft, ChevronRight, Filter,
  FileText, Hash,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import ordersAPI from '../../api/orders';
import { format } from 'date-fns';

// ── Design tokens ─────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ── Severity config ───────────────────────────────────────────────────────────
const SEVERITY = {
  success: { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  icon: CheckCircle,   label: 'Success'  },
  info:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  icon: Info,          label: 'Info'     },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)',  icon: AlertTriangle, label: 'Warning'  },
  danger:  { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',   icon: XCircle,       label: 'Danger'   },
};

// ── Shared atoms ──────────────────────────────────────────────────────────────
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--panel-bg, white)',
    border: '1px solid var(--border, #f3f4f6)',
    borderRadius: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    overflow: 'hidden',
    ...style,
  }}>
    {children}
  </div>
);

const iStyle = {
  padding: '8px 12px', borderRadius: 9,
  border: '1.5px solid var(--border, #e5e7eb)',
  fontSize: '0.82rem', outline: 'none',
  color: 'var(--text, #111827)', background: 'var(--input-bg, white)',
  fontWeight: 500,
};
const fIn  = e => { e.currentTarget.style.borderColor = purple; e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)'; e.currentTarget.style.boxShadow = 'none'; };

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'orders', label: 'Order Logs', icon: FileText, available: true  },
  // future tabs go here — uncomment and wire up when ready
  // { id: 'payments',   label: 'Payment Logs',   icon: CreditCard, available: false },
  // { id: 'customers',  label: 'Customer Logs',  icon: User,       available: false },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function ActivityLogs() {
  const navigate = useNavigate();

  const [activeTab,  setActiveTab]  = useState('orders');
  const [logs,       setLogs]       = useState([]);
  const [meta,       setMeta]       = useState(null);   // pagination meta
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // filters
  const [search,     setSearch]     = useState('');
  const [severity,   setSeverity]   = useState('');
  const [page,       setPage]       = useState(1);
  const perPage = 30;

  // expanded metadata rows
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, per_page: perPage };
      if (severity) params.severity = severity;
      if (search)   params.performed_by = search; // backend 'like' filter

      const data = await ordersAPI.getAllOrderActivity(params);
      setLogs(data.data || []);
      setMeta(data);
    } catch (e) {
      setError('Failed to load activity logs.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, severity, perPage]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // reset page on filter change
  useEffect(() => { setPage(1); }, [severity]);

  // client-side search filter (order number / action / description)
  const filtered = search
    ? logs.filter(l =>
        l.order?.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.description.toLowerCase().includes(search.toLowerCase()) ||
        l.performed_by.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <AdminLayout>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        .al-row { transition: background 0.12s; }
        .al-row:hover { background: rgba(168,85,247,0.03) !important; }
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.25s ease both' }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, marginBottom: 4 }}>
          System
        </p>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 900, color: 'var(--text, #111827)', letterSpacing: '-0.03em', margin: '0 0 4px' }}>
          Activity Logs
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
          Track all actions taken across orders, by whom and when.
        </p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border, #f3f4f6)', paddingBottom: 0 }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => tab.available && setActiveTab(tab.id)}
              disabled={!tab.available}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: '10px 10px 0 0',
                border: 'none', cursor: tab.available ? 'pointer' : 'not-allowed',
                fontSize: '0.82rem', fontWeight: 700,
                background: active ? 'var(--panel-bg, white)' : 'transparent',
                color: active ? purple : '#9ca3af',
                borderTop: active ? `2px solid ${purple}` : '2px solid transparent',
                borderLeft: active ? '1px solid var(--border, #f3f4f6)' : '1px solid transparent',
                borderRight: active ? '1px solid var(--border, #f3f4f6)' : '1px solid transparent',
                marginBottom: active ? '-1px' : 0,
                opacity: tab.available ? 1 : 0.4,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {tab.label}
              {!tab.available && (
                <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4, background: '#f3f4f6', color: '#9ca3af', fontWeight: 700 }}>
                  SOON
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Order Logs tab ───────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>

          {/* Filter bar */}
          <Panel>
            <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />

              {/* Search */}
              <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search order #, action, user…"
                  style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }}
                  onFocus={fIn} onBlur={fOut}
                />
              </div>

              {/* Severity pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ value: '', label: 'All' }, ...Object.entries(SEVERITY).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSeverity(opt.value)}
                    style={{
                      padding: '5px 12px', borderRadius: 9999, border: '1.5px solid',
                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.15s',
                      borderColor: severity === opt.value ? (opt.color || purple) : 'var(--border, #e5e7eb)',
                      background:  severity === opt.value ? (opt.color ? `${opt.color}15` : purpleLt) : 'transparent',
                      color:       severity === opt.value ? (opt.color || purple) : '#9ca3af',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button onClick={fetchLogs} disabled={loading}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${purpleBd}`, background: purpleLt, color: purple, fontSize: '0.78rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
                <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
                Refresh
              </button>
            </div>
          </Panel>

          {/* Log list */}
          <Panel>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 120px 180px 1fr 140px 140px', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border, #f3f4f6)', background: 'var(--panel-bg-secondary, #fafafa)' }}>
              {['', 'Severity', 'Order', 'Action / Description', 'Performed by', 'Timestamp'].map((h, i) => (
                <p key={i} style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: 0 }}>{h}</p>
              ))}
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
                <div style={{ width: 18, height: 18, border: `2px solid ${purpleBd}`, borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Loading logs…
              </div>
            ) : error ? (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
                <button onClick={fetchLogs} style={{ padding: '8px 18px', borderRadius: 9, border: `1.5px solid ${purpleBd}`, background: purpleLt, color: purple, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center' }}>
                <Clock size={32} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No activity logs found.</p>
              </div>
            ) : (
              filtered.map((log, i) => {
                const cfg = SEVERITY[log.severity] || SEVERITY.info;
                const SeverityIcon = cfg.icon;
                const isExpanded = expanded[log.id];
                const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

                return (
                  <div key={log.id} className="al-row" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '32px 120px 180px 1fr 140px 140px', gap: 12, padding: '12px 18px', alignItems: 'center', cursor: 'pointer' }}
                      onClick={() => log.order?.id && navigate(`/admin/orders/${log.order.id}`)}
                    >
                      {/* Severity icon */}
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <SeverityIcon size={13} color={cfg.color} />
                      </div>

                      {/* Severity label */}
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, padding: '3px 8px', borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'inline-block' }}>
                        {cfg.label}
                      </span>

                      {/* Order # */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Hash size={11} color="#9ca3af" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: purple }}>
                          {log.order?.order_number || `Order ${log.order_id}`}
                        </span>
                      </div>

                      {/* Action + description */}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text, #111827)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.description}
                        </p>
                      </div>

                      {/* Performed by */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={11} color={purple} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text, #374151)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.performed_by}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <div>
                        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', margin: 0 }}>
                          {format(new Date(log.created_at), 'MMM d, yyyy')}
                        </p>
                        <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
                          {format(new Date(log.created_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>

                    {/* Metadata expander */}
                    {hasMetadata && (
                      <>
                        <div style={{ padding: '0 18px 10px', paddingLeft: 62 }}>
                          <button
                            onClick={() => toggleExpand(log.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: purple, fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                          >
                            <Info size={11} />
                            {isExpanded ? 'Hide details' : 'Show details'}
                          </button>
                        </div>
                        {isExpanded && (
                          <div style={{ margin: '0 18px 12px', marginLeft: 62, padding: '10px 12px', borderRadius: 8, background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
                            {Object.entries(log.metadata).map(([key, val]) => (
                              <div key={key} style={{ fontSize: '0.72rem' }}>
                                <span style={{ color: '#9ca3af', fontWeight: 600, textTransform: 'capitalize' }}>
                                  {key.replace(/_/g, ' ')}:{' '}
                                </span>
                                <span style={{ color: purple, fontWeight: 700 }}>
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}

            {/* Pagination */}
            {meta && meta.last_page > 1 && (
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                  Showing {meta.from}–{meta.to} of {meta.total} entries
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border, #e5e7eb)', background: 'transparent', color: page === 1 ? '#d1d5db' : '#6b7280', cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, meta.last_page) }, (_, i) => {
                    const p = Math.max(1, Math.min(page - 2, meta.last_page - 4)) + i;
                    return (
                      <button key={p} onClick={() => setPage(p)} disabled={loading}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', minWidth: 34, transition: 'all 0.15s',
                          borderColor: p === page ? purple : 'var(--border, #e5e7eb)',
                          background:  p === page ? purpleLt : 'transparent',
                          color:       p === page ? purple : '#6b7280',
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                    disabled={page === meta.last_page || loading}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border, #e5e7eb)', background: 'transparent', color: page === meta.last_page ? '#d1d5db' : '#6b7280', cursor: page === meta.last_page ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </AdminLayout>
  );
}