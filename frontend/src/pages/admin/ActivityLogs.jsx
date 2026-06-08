import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, AlertTriangle, XCircle, Info, Clock, User,
  Search, RefreshCw, ChevronLeft, ChevronRight, Filter,
  FileText, Hash, Truck, Crown, Users, Plus, Pencil,
  Power, PowerOff, Trash2, UserPlus, Calendar, Package,
  Gavel, Gift, Archive, Tag, Zap,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import api from '../../api/axios';
import ordersAPI from '../../api/orders';
import shippingAPI from '../../api/shipping';
import customerTiersAPI from '../../api/customerTiers';
import { format } from 'date-fns';

// ── Design tokens ─────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ── Severity config (shared across tabs that use it) ──────────────────────────
const SEVERITY = {
  success: { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  icon: CheckCircle,   label: 'Success'  },
  info:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  icon: Info,          label: 'Info'     },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)',  icon: AlertTriangle, label: 'Warning'  },
  danger:  { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',   icon: XCircle,       label: 'Danger'   },
};

// ── Shipping action config ────────────────────────────────────────────────────
const SHIPPING_ACTION_CFG = {
  CREATED:     { icon: Plus,     color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  UPDATED:     { icon: Pencil,   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  ACTIVATED:   { icon: Power,    color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  DEACTIVATED: { icon: PowerOff, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  DELETED:     { icon: Trash2,   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
};

// ── Tier action config ────────────────────────────────────────────────────────
const TIER_ACTION_CFG = {
  CREATED:     { icon: UserPlus, bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
  UPDATED:     { icon: Pencil,   bg: 'rgba(99,102,241,0.12)', color: '#4f46e5' },
  ACTIVATED:   { icon: Power,    bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
  DEACTIVATED: { icon: PowerOff, bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
  DELETED:     { icon: Trash2,   bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
};

// ── Referral action config ────────────────────────────────────────────────────
const REFERRAL_ACTION_CFG = {
  CREATED:         { icon: UserPlus,  bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  UPDATED:         { icon: Pencil,    bg: 'rgba(99,102,241,0.12)',  color: '#4f46e5' },
  ACTIVATED:       { icon: Power,     bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  PAUSED:          { icon: PowerOff,  bg: 'rgba(245,158,11,0.12)',  color: '#b45309' },
  ARCHIVED:        { icon: Archive,   bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  DELETED:         { icon: XCircle,   bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  USED:            { icon: Tag,       bg: 'rgba(8,145,178,0.12)',   color: '#0e7490' },
  REVERSED:        { icon: RefreshCw, bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  CANCELLED:       { icon: XCircle,   bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  RESTORED:        { icon: RefreshCw, bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  REWARD_PAID:     { icon: Zap,       bg: 'rgba(234,179,8,0.12)',   color: '#b45309' },
  REWARD_REVERSED: { icon: RefreshCw, bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
};

const DEFAULT_CFG = { icon: RefreshCw, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtKes = (n) =>
  Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
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

// ── Severity pill filter row (reused across tabs) ─────────────────────────────
function SeverityFilters({ severity, setSeverity }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[{ value: '', label: 'All' }, ...Object.entries(SEVERITY).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))].map(opt => (
        <button key={opt.value} onClick={() => setSeverity(opt.value)} style={{
          padding: '5px 12px', borderRadius: 9999, border: '1.5px solid', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
          borderColor: severity === opt.value ? (opt.color || purple) : 'var(--border, #e5e7eb)',
          background:  severity === opt.value ? (opt.color ? `${opt.color}15` : purpleLt) : 'transparent',
          color:       severity === opt.value ? (opt.color || purple) : '#9ca3af',
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

// ── Severity icon + badge (reused in rows) ────────────────────────────────────
function SeverityCell({ sev }) {
  const cfg = SEVERITY[sev] || SEVERITY.info;
  const Icon = cfg.icon;
  return (
    <>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={13} color={cfg.color} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, padding: '3px 8px', borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'inline-block' }}>
        {cfg.label}
      </span>
    </>
  );
}

// ── Actor cell ────────────────────────────────────────────────────────────────
function ActorCell({ name }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <User size={11} color={purple} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text, #374151)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {name || 'System'}
      </span>
    </div>
  );
}

// ── Timestamp cell ────────────────────────────────────────────────────────────
function TimeCell({ ts }) {
  return (
    <div>
      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', margin: 0 }}>
        {format(new Date(ts), 'MMM d, yyyy')}
      </p>
      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
        {format(new Date(ts), 'h:mm a')}
      </p>
    </div>
  );
}

// ── Refresh button ────────────────────────────────────────────────────────────
function RefreshBtn({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${purpleBd}`, background: purpleLt, color: purple, fontSize: '0.78rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
      <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} /> Refresh
    </button>
  );
}

// ── Table header row ──────────────────────────────────────────────────────────
function TableHead({ cols, gridCols }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border, #f3f4f6)', background: 'var(--panel-bg-secondary, #fafafa)' }}>
      {cols.map((h, i) => (
        <p key={i} style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', margin: 0 }}>{h}</p>
      ))}
    </div>
  );
}

// ── Pagination bar ────────────────────────────────────────────────────────────
function PaginationBar({ meta, page, setPage, loading }) {
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
        Showing {meta.from}–{meta.to} of {meta.total} entries
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border, #e5e7eb)', background: 'transparent', color: page === 1 ? '#d1d5db' : '#6b7280', cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}>
          <ChevronLeft size={14} /> Prev
        </button>
        {Array.from({ length: Math.min(5, meta.last_page) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, meta.last_page - 4)) + i;
          return (
            <button key={p} onClick={() => setPage(p)} disabled={loading}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', minWidth: 34, transition: 'all 0.15s',
                borderColor: p === page ? purple : 'var(--border, #e5e7eb)',
                background:  p === page ? purpleLt : 'transparent',
                color:       p === page ? purple : '#6b7280',
              }}>
              {p}
            </button>
          );
        })}
        <button onClick={() => setPage(p => Math.min(meta.last_page, p + 1))} disabled={page === meta.last_page || loading}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border, #e5e7eb)', background: 'transparent', color: page === meta.last_page ? '#d1d5db' : '#6b7280', cursor: page === meta.last_page ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Empty / loading / error states ────────────────────────────────────────────
function StateDisplay({ loading, error, empty, onRetry }) {
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${purpleBd}`, borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Loading logs…
    </div>
  );
  if (error) return (
    <div style={{ padding: '32px', textAlign: 'center' }}>
      <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
      <button onClick={onRetry} style={{ padding: '8px 18px', borderRadius: 9, border: `1.5px solid ${purpleBd}`, background: purpleLt, color: purple, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
        Try again
      </button>
    </div>
  );
  if (empty) return (
    <div style={{ padding: '48px', textAlign: 'center' }}>
      <Clock size={32} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
      <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No logs found.</p>
    </div>
  );
  return null;
}

// ── Metadata expander (reused in order/booking/hamper/auction rows) ───────────
function MetadataExpander({ id, metadata, expanded, onToggle }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  const isExpanded = expanded[id];
  return (
    <>
      <div style={{ padding: '0 18px 10px', paddingLeft: 62 }}>
        <button onClick={() => onToggle(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: purple, fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
          <Info size={11} /> {isExpanded ? 'Hide details' : 'Show details'}
        </button>
      </div>
      {isExpanded && (
        <div style={{ margin: '0 18px 12px', marginLeft: 62, padding: '10px 12px', borderRadius: 8, background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
          {Object.entries(metadata).map(([key, val]) => (
            <div key={key} style={{ fontSize: '0.72rem' }}>
              <span style={{ color: '#9ca3af', fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}: </span>
              <span style={{ color: purple, fontWeight: 700 }}>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  ORDER LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function OrderLogsTab() {
  const navigate = useNavigate();
  const [logs,     setLogs]     = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [severity, setSeverity] = useState('');
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, per_page: 30 };
      if (severity) params.severity = severity;
      const data = await ordersAPI.getAllOrderActivity(params);
      setLogs(data.data || []);
      setMeta(data);
    } catch { setError('Failed to load order activity logs.'); }
    finally  { setLoading(false); }
  }, [page, severity]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [severity]);

  const filtered = search
    ? logs.filter(l =>
        l.order?.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.description.toLowerCase().includes(search.toLowerCase()) ||
        (l.performed_by || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const GRID = '32px 120px 180px 1fr 140px 140px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order #, action, user…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <SeverityFilters severity={severity} setSeverity={setSeverity} />
          <RefreshBtn onClick={fetchLogs} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <TableHead cols={['', 'Severity', 'Order', 'Action / Description', 'Performed by', 'Timestamp']} gridCols={GRID} />
        <StateDisplay loading={loading} error={error} empty={!loading && !error && filtered.length === 0} onRetry={fetchLogs} />
        {!loading && !error && filtered.map((log, i) => (
          <div key={log.id} className="al-row" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => log.order?.id && navigate(`/admin/orders/${log.order.id}`)}>
              <SeverityCell sev={log.severity} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Hash size={11} color="#9ca3af" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: purple }}>
                  {log.order?.order_number || `Order ${log.order_id}`}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text, #111827)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.description}
                </p>
              </div>
              <ActorCell name={log.performed_by} />
              <TimeCell ts={log.created_at} />
            </div>
            <MetadataExpander id={log.id} metadata={log.metadata} expanded={expanded} onToggle={toggleExpand} />
          </div>
        ))}
        <PaginationBar meta={meta} page={page} setPage={setPage} loading={loading} />
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  BOOKING LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function BookingLogsTab() {
  const navigate = useNavigate();
  const [logs,     setLogs]     = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [severity, setSeverity] = useState('');
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, per_page: 30 };
      if (severity) params.severity = severity;
      if (search)   params.search   = search;
      const res = await api.get('/admin/bookings/activity', { params });
      setLogs(res.data.data || []);
      setMeta(res.data);
    } catch { setError('Failed to load booking activity logs.'); }
    finally  { setLoading(false); }
  }, [page, severity, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [severity]);

  const GRID = '32px 120px 180px 1fr 140px 140px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search booking #, action, description…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <SeverityFilters severity={severity} setSeverity={setSeverity} />
          <RefreshBtn onClick={fetchLogs} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <TableHead cols={['', 'Severity', 'Booking', 'Action / Description', 'Performed by', 'Timestamp']} gridCols={GRID} />
        <StateDisplay loading={loading} error={error} empty={!loading && !error && logs.length === 0} onRetry={fetchLogs} />
        {!loading && !error && logs.map((log, i) => (
          <div key={log.id} className="al-row" style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => log.booking_id && navigate(`/admin/bookings/${log.booking_id}`)}>
              <SeverityCell sev={log.severity} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Hash size={11} color="#9ca3af" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: purple }}>
                  {log.booking?.booking_number || `Booking ${log.booking_id}`}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text, #111827)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(log.action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.description}
                </p>
              </div>
              <ActorCell name={log.performed_by?.name} />
              <TimeCell ts={log.created_at} />
            </div>
            <MetadataExpander id={log.id} metadata={log.metadata} expanded={expanded} onToggle={toggleExpand} />
          </div>
        ))}
        <PaginationBar meta={meta} page={page} setPage={setPage} loading={loading} />
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  HAMPER LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function HamperLogsTab() {
  const navigate = useNavigate();
  const [logs,     setLogs]     = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [severity, setSeverity] = useState('');
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, per_page: 30 };
      if (severity) params.severity = severity;
      if (search)   params.search   = search;
      const res = await api.get('/admin/hampers/activity', { params });
      setLogs(res.data.data || []);
      setMeta(res.data);
    } catch { setError('Failed to load hamper activity logs.'); }
    finally  { setLoading(false); }
  }, [page, severity, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [severity]);

  const GRID = '32px 120px 180px 1fr 140px 140px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hamper name, action, description…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <SeverityFilters severity={severity} setSeverity={setSeverity} />
          <RefreshBtn onClick={fetchLogs} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <TableHead cols={['', 'Severity', 'Hamper', 'Action / Description', 'Performed by', 'Timestamp']} gridCols={GRID} />
        <StateDisplay loading={loading} error={error} empty={!loading && !error && logs.length === 0} onRetry={fetchLogs} />
        {!loading && !error && logs.map((log, i) => {
          // hamper_order logs have a badge
          const isOrderLog = !!log.hamper_order_id;
          return (
            <div key={log.id} className="al-row" style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => log.hamper_id && navigate(`/admin/hampers/${log.hamper_id}`)}>
                <SeverityCell sev={log.severity} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 700, color: purple, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.hamper?.name || `Hamper #${log.hamper_id}`}
                  </p>
                  {isOrderLog && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, background: 'rgba(234,88,12,0.08)', color: '#ea580c', padding: '1px 6px', borderRadius: 4 }}>
                      ORDER LOG
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text, #111827)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(log.action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.description}
                  </p>
                </div>
                <ActorCell name={log.performed_by} />
                <TimeCell ts={log.created_at} />
              </div>
              <MetadataExpander id={log.id} metadata={log.metadata} expanded={expanded} onToggle={toggleExpand} />
            </div>
          );
        })}
        <PaginationBar meta={meta} page={page} setPage={setPage} loading={loading} />
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  AUCTION LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function AuctionLogsTab() {
  const navigate = useNavigate();
  const [logs,     setLogs]     = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [severity, setSeverity] = useState('');
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, per_page: 30 };
      if (severity) params.severity = severity;
      if (search)   params.search   = search;
      const res = await api.get('/admin/auction-orders/activity', { params });
      setLogs(res.data.data || []);
      setMeta(res.data);
    } catch { setError('Failed to load auction activity logs.'); }
    finally  { setLoading(false); }
  }, [page, severity, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [severity]);

  const GRID = '32px 120px 200px 1fr 140px 140px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order #, action, description…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <SeverityFilters severity={severity} setSeverity={setSeverity} />
          <RefreshBtn onClick={fetchLogs} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <TableHead cols={['', 'Severity', 'Auction Order', 'Action / Description', 'Performed by', 'Timestamp']} gridCols={GRID} />
        <StateDisplay loading={loading} error={error} empty={!loading && !error && logs.length === 0} onRetry={fetchLogs} />
        {!loading && !error && logs.map((log, i) => (
          <div key={log.id} className="al-row" style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => log.auction_order_id && navigate(`/admin/auction-orders/${log.auction_order_id}`)}>
              <SeverityCell sev={log.severity} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Hash size={11} color="#9ca3af" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: purple }}>
                    {log.auction_order?.order_number || `Order #${log.auction_order_id}`}
                  </span>
                </div>
                {log.auction_order?.auction?.product?.name && (
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.auction_order.auction.product.name}
                  </p>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text, #111827)', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(log.action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.description}
                </p>
              </div>
              <ActorCell name={log.performed_by} />  
              <TimeCell ts={log.created_at} />
            </div>
            <MetadataExpander id={log.id} metadata={log.metadata} expanded={expanded} onToggle={toggleExpand} />
          </div>
        ))}
        <PaginationBar meta={meta} page={page} setPage={setPage} loading={loading} />
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  REFERRAL LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function ReferralLogsTab() {
  const [logs,    setLogs]    = useState([]);
  const [pagMeta, setPagMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  const loadLogs = useCallback(async (page = 1) => {
    try {
      setLoading(page === 1);
      setError('');
      const res = await api.get('/admin/referrals/activity', {
        params: { per_page: 20, page, ...(search ? { search } : {}) },
      });
      const { data, current_page, last_page, total } = res.data;
      if (page === 1) setLogs(data);
      else setLogs(prev => [...prev, ...data]);
      setPagMeta({ current_page, last_page, total });
    } catch {
      setError('Failed to load referral activity logs.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { loadLogs(1); }, [loadLogs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      {/* Filter bar */}
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, user, action…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <RefreshBtn onClick={() => loadLogs(1)} loading={loading} />
        </div>
      </Panel>

      {/* Log list */}
      <Panel>
        {error && <StateDisplay error={error} onRetry={() => loadLogs(1)} />}
        {!error && loading && logs.length === 0 && <StateDisplay loading />}
        {!error && !loading && logs.length === 0 && <StateDisplay empty />}

        {logs.map((a, i) => {
          const meta   = REFERRAL_ACTION_CFG[a.action] ?? DEFAULT_CFG;
          const Icon   = meta.icon;
          const isLast = i === logs.length - 1;
          const isPromo = a.entity_type === 'promo_code';

          // Actor type badge color
          const actorTypeColor = a.actor_type === 'admin'
            ? '#7c3aed'
            : a.actor_type === 'customer'
            ? '#0e7490'
            : '#9ca3af';

          return (
            <div key={a.id} style={{
              display: 'flex', gap: 14, padding: '12px 18px',
              borderBottom: isLast ? 'none' : '1px solid var(--border, #f3f4f6)',
            }}
              className="al-row"
            >
              {/* Icon */}
              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginTop: 2, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={13} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Main line */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text, #111827)' }}>
                    {a.actor?.name ?? 'System'}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: meta.color, textTransform: 'lowercase' }}>
                    {(a.action || '').replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                    {isPromo ? 'promo' : 'referral'} code
                  </span>
                  {a.metadata?.code && (
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: purpleDk, background: purpleLt, padding: '1px 6px', borderRadius: 5, border: `1px solid ${purpleBd}` }}>
                      {a.metadata.code}
                    </span>
                  )}
                  {a.metadata?.name && (
                    <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>
                      — {a.metadata.name}
                    </span>
                  )}
                </div>

                {/* Field changes */}
                {a.metadata?.changes?.length > 0 && (
                  <ul style={{ margin: '4px 0', paddingLeft: 16, fontSize: '0.72rem', color: '#6b7280' }}>
                    {a.metadata.changes.map((c, j) => (
                      <li key={j}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{c.field}</span>:{' '}
                        <span style={{ color: '#dc2626' }}>{String(c.old ?? '—')}</span>
                        {' → '}
                        <span style={{ color: '#16a34a' }}>{String(c.new ?? '—')}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Amount */}
                {a.amount > 0 && (
                  <p style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, margin: '2px 0' }}>
                    {fmtKes(a.amount)}
                  </p>
                )}

                {/* Order ref */}
                {a.order_id && a.metadata?.order_number && (
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>
                    Order: <span style={{ color: purpleDk, fontWeight: 600 }}>{a.metadata.order_number}</span>
                  </p>
                )}

                {/* Timestamp + actor type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>
                    {new Date(a.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {a.actor_type && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: actorTypeColor }}>
                      · {a.actor_type}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Load more */}
        {pagMeta && pagMeta.current_page < pagMeta.last_page && (
          <button onClick={() => loadLogs(pagMeta.current_page + 1)} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '12px', fontSize: '0.78rem', fontWeight: 700, color: purpleDk, background: purpleLt, border: 'none', borderTop: `1px solid var(--border, #f3f4f6)`, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            {loading ? 'Loading…' : `Load more (${pagMeta.total - logs.length} remaining)`}
          </button>
        )}
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  SHIPPING LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function ShippingLogsTab() {
  const [activity, setActivity] = useState([]);
  const [options,  setOptions]  = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [page,     setPage]     = useState(1);

  const ACTIONS = ['CREATED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED', 'DELETED'];

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [actRes, optRes] = await Promise.all([
        shippingAPI.getActivity({ per_page: 30, page, ...(action ? { action } : {}) }),
        shippingAPI.getOptions(),
      ]);
      setActivity(actRes.data || []);
      setMeta(actRes);
      setOptions(optRes);
    } catch { setError('Failed to load shipping logs.'); }
    finally  { setLoading(false); }
  }, [page, action]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [action]);

  const resolveName = (item) =>
    options.find(o => o.id === item.shipping_option_id)?.name
    ?? item.shipping_option?.name
    ?? item.metadata?.name
    ?? `Option #${item.shipping_option_id}`;

  const filtered = search
    ? activity.filter(a =>
        resolveName(a).toLowerCase().includes(search.toLowerCase()) ||
        a.action.toLowerCase().includes(search.toLowerCase()) ||
        (a.actor?.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : activity;

  const GRID = '36px 120px 1fr 1fr 160px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search option name, action, user…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['', ...ACTIONS].map(a => {
              const cfg = a ? (SHIPPING_ACTION_CFG[a] ?? DEFAULT_CFG) : null;
              return (
                <button key={a} onClick={() => setAction(a)} style={{
                  padding: '5px 12px', borderRadius: 9999, border: '1.5px solid', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: action === a ? (cfg?.color || purple) : 'var(--border, #e5e7eb)',
                  background:  action === a ? (cfg ? `${cfg.color}18` : purpleLt) : 'transparent',
                  color:       action === a ? (cfg?.color || purple) : '#9ca3af',
                }}>{a || 'All'}</button>
              );
            })}
          </div>
          <RefreshBtn onClick={fetchAll} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <TableHead cols={['', 'Action', 'Option', 'Changes', 'Actor / Time']} gridCols={GRID} />
        <StateDisplay loading={loading} error={error} empty={!loading && !error && filtered.length === 0} onRetry={fetchAll} />
        {!loading && !error && filtered.map((item, i) => {
          const cfg = SHIPPING_ACTION_CFG[item.action] ?? DEFAULT_CFG;
          const ActionIcon = cfg.icon;
          const name = resolveName(item);
          const actorName = item.actor_user_id === null ? 'System' : item.actor?.name || `User #${item.actor_user_id}`;
          const changes = item.metadata?.changes;
          return (
            <div key={item.id} className="al-row" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', alignItems: 'start' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: cfg.bg, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <ActionIcon size={13} color={cfg.color} />
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, padding: '3px 8px', borderRadius: 6, background: cfg.bg, display: 'inline-block', marginTop: 4, width: 'fit-content' }}>
                  {item.action}
                </span>
                <div style={{ minWidth: 0, paddingTop: 2 }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{name}</p>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>ID #{item.shipping_option_id}</p>
                </div>
                <div style={{ paddingTop: 2 }}>
                  {changes?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 14, fontSize: '0.72rem', color: '#6b7280' }}>
                      {changes.map((c, j) => (
                        <li key={j}>
                          <span style={{ color: '#374151', fontWeight: 600 }}>{c.field}</span>:{' '}
                          <span style={{ color: '#dc2626' }}>{String(c.old ?? '—')}</span>{' → '}
                          <span style={{ color: '#16a34a' }}>{String(c.new ?? '—')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <span style={{ fontSize: '0.72rem', color: '#d1d5db' }}>—</span>}
                </div>
                <div style={{ paddingTop: 2 }}>
                  <ActorCell name={actorName} />
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '4px 0 0' }}>{formatDate(item.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <PaginationBar meta={meta} page={page} setPage={setPage} loading={loading} />
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  CUSTOMER TIER LOGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function TierLogsTab() {
  const [activity, setActivity] = useState([]);
  const [tiers,    setTiers]    = useState([]);
  const [types,    setTypes]    = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [entity,   setEntity]   = useState('');
  const [page,     setPage]     = useState(1);

  const ACTIONS = ['CREATED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED', 'DELETED'];

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [actRes, tierRes, typeRes] = await Promise.all([
        customerTiersAPI.getActivity({ per_page: 30, page, ...(action ? { action } : {}), ...(entity ? { entity_type: entity } : {}) }),
        customerTiersAPI.getTiers(),
        customerTiersAPI.getTypes(),
      ]);
      setActivity(actRes.data || []);
      setMeta(actRes);
      setTiers(tierRes);
      setTypes(typeRes);
    } catch { setError('Failed to load tier/type logs.'); }
    finally  { setLoading(false); }
  }, [page, action, entity]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [action, entity]);

  const resolveName = (a) => {
    const name = a.entity_type === 'tier'
      ? tiers.find(t => t.id === a.entity_id)?.name
      : types.find(t => t.id === a.entity_id)?.name;
    return name ?? a.metadata?.name ?? `#${a.entity_id}`;
  };

  const filtered = search
    ? activity.filter(a =>
        resolveName(a).toLowerCase().includes(search.toLowerCase()) ||
        a.action.toLowerCase().includes(search.toLowerCase()) ||
        (a.actor?.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : activity;

  const GRID = '36px 100px 100px 1fr 1fr 160px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease both' }}>
      <Panel>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tier/type name, action, user…"
              style={{ ...iStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} onFocus={fIn} onBlur={fOut} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ v: '', l: 'All' }, { v: 'tier', l: 'Tiers' }, { v: 'type_discount', l: 'Types' }].map(opt => (
              <button key={opt.v} onClick={() => setEntity(opt.v)} style={{
                padding: '5px 12px', borderRadius: 9999, border: '1.5px solid', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                borderColor: entity === opt.v ? purple : 'var(--border, #e5e7eb)',
                background:  entity === opt.v ? purpleLt : 'transparent',
                color:       entity === opt.v ? purple : '#9ca3af',
              }}>{opt.l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['', ...ACTIONS].map(a => {
              const cfg = a ? (TIER_ACTION_CFG[a] ?? DEFAULT_CFG) : null;
              return (
                <button key={a} onClick={() => setAction(a)} style={{
                  padding: '5px 12px', borderRadius: 9999, border: '1.5px solid', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: action === a ? (cfg?.color || purple) : 'var(--border, #e5e7eb)',
                  background:  action === a ? (cfg ? `${cfg.color}18` : purpleLt) : 'transparent',
                  color:       action === a ? (cfg?.color || purple) : '#9ca3af',
                }}>{a || 'All'}</button>
              );
            })}
          </div>
          <RefreshBtn onClick={fetchAll} loading={loading} />
        </div>
      </Panel>

      <Panel>
        <TableHead cols={['', 'Action', 'Type', 'Name', 'Changes', 'Actor / Time']} gridCols={GRID} />
        <StateDisplay loading={loading} error={error} empty={!loading && !error && filtered.length === 0} onRetry={fetchAll} />
        {!loading && !error && filtered.map((a, i) => {
          const cfg = TIER_ACTION_CFG[a.action] ?? DEFAULT_CFG;
          const ActionIcon = cfg.icon;
          const name = resolveName(a);
          const isTier = a.entity_type === 'tier';
          return (
            <div key={a.id} className="al-row" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', alignItems: 'start' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: cfg.bg, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <ActionIcon size={13} color={cfg.color} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cfg.color, padding: '3px 8px', borderRadius: 6, background: cfg.bg, display: 'inline-block', marginTop: 4, width: 'fit-content' }}>
                  {a.action}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, display: 'inline-block', marginTop: 4, width: 'fit-content', background: isTier ? 'rgba(168,85,247,0.1)' : 'rgba(99,102,241,0.1)', color: isTier ? '#7c3aed' : '#4f46e5' }}>
                  {isTier ? 'Tier' : 'Type'}
                </span>
                <div style={{ paddingTop: 2 }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{name}</p>
                  {a.metadata?.slug && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{a.metadata.slug}</p>}
                </div>
                <div style={{ paddingTop: 2 }}>
                  {a.metadata?.changes?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 14, fontSize: '0.72rem', color: '#6b7280' }}>
                      {a.metadata.changes.map((c, j) => (
                        <li key={j}>
                          <span style={{ color: '#374151', fontWeight: 600 }}>{c.field}</span>:{' '}
                          <span style={{ color: '#dc2626' }}>{String(c.old ?? '—')}</span>{' → '}
                          <span style={{ color: '#16a34a' }}>{String(c.new ?? '—')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <span style={{ fontSize: '0.72rem', color: '#d1d5db' }}>—</span>}
                </div>
                <div style={{ paddingTop: 2 }}>
                  <ActorCell name={a.actor?.name ?? 'System'} />
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '4px 0 0' }}>{formatDate(a.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <PaginationBar meta={meta} page={page} setPage={setPage} loading={loading} />
      </Panel>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'orders',    label: 'Orders',    icon: FileText  },
  { id: 'bookings',  label: 'Bookings',  icon: Calendar  },
  { id: 'hampers',   label: 'Hampers',   icon: Package   },
  { id: 'auctions',  label: 'Auctions',  icon: Gavel     },
  { id: 'referrals', label: 'Referrals', icon: Gift      },
  { id: 'shipping',  label: 'Shipping',  icon: Truck     },
  { id: 'tiers',     label: 'Tiers',     icon: Crown     },
];

export default function ActivityLogs() {
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <AdminLayout>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        .al-row { transition: background 0.12s; }
        .al-row:hover { background: rgba(168,85,247,0.03) !important; }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.25s ease both' }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, marginBottom: 4 }}>
          System
        </p>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 900, color: '#a855f7', letterSpacing: '-0.03em', margin: '0 0 4px' }}>
          Activity Logs
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
          Track all actions taken across orders, bookings, hampers, auctions, referrals, shipping, and customer tiers.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border, #f3f4f6)', flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: '10px 10px 0 0',
                border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 700,
                background: active ? 'var(--panel-bg, white)' : 'transparent',
                color: active ? purple : '#9ca3af',
                borderTop: active ? `2px solid ${purple}` : '2px solid transparent',
                borderLeft: active ? '1px solid var(--border, #f3f4f6)' : '1px solid transparent',
                borderRight: active ? '1px solid var(--border, #f3f4f6)' : '1px solid transparent',
                marginBottom: active ? '-1px' : 0,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={13} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'orders'    && <OrderLogsTab />}
      {activeTab === 'bookings'  && <BookingLogsTab />}
      {activeTab === 'hampers'   && <HamperLogsTab />}
      {activeTab === 'auctions'  && <AuctionLogsTab />}
      {activeTab === 'referrals' && <ReferralLogsTab />}
      {activeTab === 'shipping'  && <ShippingLogsTab />}
      {activeTab === 'tiers'     && <TierLogsTab />}
    </AdminLayout>
  );
}