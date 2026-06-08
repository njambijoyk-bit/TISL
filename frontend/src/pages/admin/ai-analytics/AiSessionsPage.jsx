import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, ChevronRight, Loader2, AlertCircle,
  CheckCircle, XCircle, Clock, Brain, Zap, Activity,
  Filter, RefreshCw, ChevronLeft, ChevronRight as ChevronRightIcon,
  User, Hash,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';

// ── Design tokens ─────────────────────────────────────────────────────────────
const P  = '#a855f7';
const PL = 'rgba(168,85,247,0.08)';
const PB = 'rgba(168,85,247,0.18)';

const card = {
  background: 'var(--bg-secondary, #ffffff)',
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  success: { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', Icon: CheckCircle, label: 'Success' },
  failed:  { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  Icon: XCircle,     label: 'Failed'  },
  pending: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', Icon: Clock,       label: 'Pending' },
};

// ── Provider colors ───────────────────────────────────────────────────────────
const PROVIDER_COLOR = {
  anthropic: '#a855f7',
  gemini:    '#3b82f6',
  openai:    '#10b981',
  mistral:   '#f59e0b',
  cohere:    '#06b6d4',
};

// ── Breadcrumb ────────────────────────────────────────────────────────────────
const Breadcrumb = ({ items }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', marginBottom: 24, color: 'var(--text-secondary, #6b7280)' }}>
    {items.map((item, i) => (
      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.onClick ? (
          <button onClick={item.onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: P, fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', padding: 0 }}>
            {item.label}
          </button>
        ) : (
          <span style={{ color: 'var(--text-primary, #111827)', fontWeight: 600 }}>{item.label}</span>
        )}
        {i < items.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-secondary, #6b7280)' }} />}
      </span>
    ))}
  </div>
);

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color }) => (
  <div style={{ ...card, padding: '14px 18px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={13} style={{ color }} />
      </div>
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary, #111827)', lineHeight: 1 }}>{value}</div>
  </div>
);

// ── Filter pill ───────────────────────────────────────────────────────────────
const FilterPill = ({ label, active, onClick, color = P }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 13px',
      borderRadius: 20,
      border: `1px solid ${active ? color : 'var(--border, #e5e7eb)'}`,
      background: active ? `${color}10` : 'transparent',
      color: active ? color : 'var(--text-secondary, #6b7280)',
      fontSize: '0.75rem',
      fontWeight: active ? 700 : 500,
      cursor: 'pointer',
      fontFamily: 'inherit',
      transition: 'all 150ms',
    }}
  >
    {label}
  </button>
);

// ── Format helpers ────────────────────────────────────────────────────────────
const fmtCost   = (n) => `$${Number(n ?? 0).toFixed(4)}`;
const fmtTokens = (n) => Number(n ?? 0).toLocaleString();
const fmtMs     = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtDate   = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AiSessionsPage() {
  const navigate = useNavigate();

  const [sessions,  setSessions]  = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [statsLoad, setStatsLoad] = useState(true);
  const [error,     setError]     = useState(null);
  const [expanded,  setExpanded]  = useState(null); // session id with expanded error

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [page,         setPage]         = useState(1);
  const [pagination,   setPagination]   = useState(null);

  // ── Load sessions ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiAnalyticsAPI.getSessions({
        status:     filterStatus || undefined,
        module_key: filterModule || undefined,
        page,
        per_page: 20,
      });
      setSessions(res.data ?? res);
      if (res.meta) setPagination(res.meta);
    } catch {
      setError('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterModule, page]);

  useEffect(() => { load(); }, [load]);

  // ── Load stats ────────────────────────────────────────────────────────────
  useEffect(() => {
    aiAnalyticsAPI.getSessionStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoad(false));
  }, []);

  // ── Unique module keys from stats ──────────────────────────────────────────
  const moduleKeys = stats?.by_module?.map(m => m.module_key) ?? [];

  // ── Reset page when filters change ────────────────────────────────────────
  const applyStatus = (s) => { setFilterStatus(s); setPage(1); };
  const applyModule = (m) => { setFilterModule(m); setPage(1); };

  return (
    <GeneralLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>

        <Breadcrumb items={[
          { label: 'Settings',     onClick: () => navigate('/admin/settings/general') },
          { label: 'AI Analytics', onClick: () => navigate('/admin/ai-analytics') },
          { label: 'Session Logs' },
        ]} />

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 50, height: 50, borderRadius: 13, background: PL, border: `1.5px solid ${PB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardList size={22} color={P} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #111827)', margin: '0 0 4px', letterSpacing: '-0.025em' }}>
                Session Logs
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
                Full accountability trail — who ran what, which key, tokens used and cost
              </p>
            </div>
          </div>

          <button
            onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', background: 'transparent', color: 'var(--text-secondary, #6b7280)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, transition: 'all 150ms', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P; e.currentTarget.style.color = P; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)'; e.currentTarget.style.color = 'var(--text-secondary, #6b7280)'; }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* ── Stat strip ── */}
        {!statsLoad && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Sessions" value={Number(stats.total_sessions ?? 0).toLocaleString()} icon={Activity}      color={P} />
            <StatCard label="Total Cost"     value={fmtCost(stats.total_cost)}                          icon={Zap}           color="#10b981" />
            <StatCard label="Total Tokens"   value={fmtTokens(stats.total_tokens)}                      icon={Brain}         color="#3b82f6" />
            <StatCard label="Success"        value={Number(stats.success_rate ?? 0).toLocaleString()}   icon={CheckCircle}   color="#10b981" />
            <StatCard label="Failed"         value={Number(stats.failed ?? 0).toLocaleString()}         icon={AlertCircle}   color="#ef4444" />
          </div>
        )}

        {/* ── Filters ── */}
        <div style={{ ...card, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary, #9ca3af)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>
            <Filter size={12} />
            Filter
          </div>

          {/* Status filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterPill label="All"     active={filterStatus === ''}        onClick={() => applyStatus('')}        />
            <FilterPill label="Success" active={filterStatus === 'success'} onClick={() => applyStatus('success')} color="#10b981" />
            <FilterPill label="Failed"  active={filterStatus === 'failed'}  onClick={() => applyStatus('failed')}  color="#ef4444" />
          </div>

          {/* Divider */}
          {moduleKeys.length > 0 && <div style={{ width: 1, height: 20, background: 'var(--border, #e5e7eb)' }} />}

          {/* Module filters */}
          {moduleKeys.map(k => (
            <FilterPill
              key={k}
              label={k}
              active={filterModule === k}
              onClick={() => applyModule(filterModule === k ? '' : k)}
              color="#3b82f6"
            />
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 20 }}>
            <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', color: '#991b1b' }}>{error}</span>
          </div>
        )}

        {/* ── Sessions table ── */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
            <Loader2 size={20} style={{ color: P, animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #9ca3af)' }}>Loading sessions…</span>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ ...card, padding: 56, textAlign: 'center' }}>
            <ClipboardList size={36} style={{ color: '#d1d5db', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9ca3af)', margin: '0 0 4px' }}>No sessions found</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #c4b5fd)', margin: 0 }}>
              {filterStatus || filterModule ? 'Try adjusting your filters' : 'Sessions will appear here once AI modules run'}
            </p>
          </div>
        ) : (
          <div style={{ ...card, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 80px 80px 90px 80px', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border, #e5e7eb)', background: 'var(--bg-tertiary, #f9fafb)' }}>
              {['Status', 'Module / Admin', 'Model', 'Tokens', 'Cost', 'Time', 'Duration'].map(h => (
                <span key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {sessions.map((s, idx) => {
              const st  = STATUS[s.status] ?? STATUS.pending;
              const pc  = PROVIDER_COLOR[s.key?.provider] ?? '#9ca3af';
              const isErr = s.status === 'failed' && s.error_message;
              const totalTokens = (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0);

              return (
                <div key={s.id}>
                  <div
                    onClick={() => isErr && setExpanded(expanded === s.id ? null : s.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 1fr 100px 80px 80px 90px 80px',
                      gap: 12,
                      padding: '13px 18px',
                      borderBottom: '1px solid var(--border, #f3f4f6)',
                      cursor: isErr ? 'pointer' : 'default',
                      transition: 'background 120ms',
                      animation: `fadeSlideIn 0.2s ease both`,
                      animationDelay: `${idx * 25}ms`,
                    }}
                    onMouseEnter={e => { if (isErr) e.currentTarget.style.background = 'rgba(239,68,68,0.02)'; else e.currentTarget.style.background = 'var(--bg-tertiary, #f9fafb)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}` }}>
                        <st.Icon size={10} style={{ color: st.color }} />
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: st.color, letterSpacing: '0.05em' }}>{st.label}</span>
                      </div>
                    </div>

                    {/* Module / Admin */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${pc}12`, border: `1px solid ${pc}25`, color: pc }}>
                          {s.module_key}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={10} style={{ color: 'var(--text-secondary, #9ca3af)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.admin?.name ?? `#${s.admin_id}`}
                        </span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #9ca3af)', flexShrink: 0 }}>
                          · {fmtDate(s.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Model */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #6b7280)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.model_used ? s.model_used.split('-').slice(0, 2).join('-') : '—'}
                      </span>
                    </div>

                    {/* Tokens */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #374151)' }}>
                        {totalTokens > 0 ? fmtTokens(totalTokens) : '—'}
                      </span>
                    </div>

                    {/* Cost */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: totalTokens > 0 ? '#10b981' : 'var(--text-secondary, #9ca3af)' }}>
                        {totalTokens > 0 ? fmtCost(s.cost_estimate) : '—'}
                      </span>
                    </div>

                    {/* Timestamp */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #9ca3af)' }}>
                        {fmtDate(s.created_at)}
                      </span>
                    </div>

                    {/* Response time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} style={{ color: 'var(--text-secondary, #9ca3af)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6b7280)' }}>
                        {s.response_time_ms ? fmtMs(s.response_time_ms) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded error row */}
                  {expanded === s.id && s.error_message && (
                    <div style={{ padding: '10px 18px 14px', background: 'rgba(239,68,68,0.03)', borderBottom: '1px solid var(--border, #f3f4f6)', borderLeft: '3px solid #ef4444' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Error</p>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#991b1b', fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all' }}>
                        {s.error_message}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {pagination && pagination.last_page > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #9ca3af)' }}>
              Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, pagination.total)} of {pagination.total.toLocaleString()} sessions
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', background: 'transparent', color: page === 1 ? 'var(--text-secondary, #d1d5db)' : 'var(--text-primary, #374151)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}
              >
                <ChevronLeft size={13} /> Prev
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                const pg = Math.max(1, Math.min(pagination.last_page - 4, page - 2)) + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${pg === page ? P : 'var(--border, #e5e7eb)'}`, background: pg === page ? PL : 'transparent', color: pg === page ? P : 'var(--text-primary, #374151)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: pg === page ? 700 : 500 }}
                  >
                    {pg}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(pagination.last_page, p + 1))}
                disabled={page === pagination.last_page}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', background: 'transparent', color: page === pagination.last_page ? 'var(--text-secondary, #d1d5db)' : 'var(--text-primary, #374151)', cursor: page === pagination.last_page ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}
              >
                Next <ChevronRightIcon size={13} />
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {!loading && sessions.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hash size={11} style={{ color: 'var(--text-secondary, #9ca3af)' }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #9ca3af)' }}>
              Click a failed row to expand the error message
            </span>
          </div>
        )}

      </div>
    </GeneralLayout>
  );
}