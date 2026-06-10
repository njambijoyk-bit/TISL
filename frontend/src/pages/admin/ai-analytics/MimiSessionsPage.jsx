import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Loader2, AlertCircle, Activity,
    Search, ChevronLeft, ChevronRight, User, Wifi,
    Shield, Clock, CheckCircle, XCircle, AlertTriangle,
    ShieldOff, List, ArrowLeft, Terminal,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import mimiAPI from '../../../api/mimiAPI';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── Helpers ────────────────────────────────────────────────────────────────────
const statusColor = s => ({
    active:           C.green,
    ended:            C.textDim,
    blocked:          C.red,
    error:            C.amber,
    success:          C.green,
    harmful:          C.red,
    rate_limited:     C.amber,
    api_error:        C.red,
    connection_error: C.amber,
}[s] ?? C.textMid);

const actorColor = a => ({ customer: C.purple, staff: C.cyan, guest: C.textMid }[a] ?? C.textMid);

function Dot({ color }) {
    return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />;
}

function Badge({ label, color }) {
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '2px 7px', borderRadius: 5,
            background: `${color}15`, border: `1px solid ${color}40`, color,
        }}>{label}</span>
    );
}

const fmtTime = iso => iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtMs   = ms  => ms != null ? `${ms}ms` : '—';
const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s ?? '—');

// ── Filter bar ─────────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, extras }) {
    const inputSt = {
        padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem',
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
        color: C.text, outline: 'none', fontFamily: 'monospace',
    };
    const selectSt = { ...inputSt, cursor: 'pointer', colorScheme: 'dark' };
    return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: '1 1 180px' }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.textDim }} />
                <input
                    value={filters.search ?? ''}
                    onChange={e => onChange('search', e.target.value)}
                    placeholder="Search…"
                    style={{ ...inputSt, paddingLeft: 28, width: '100%', boxSizing: 'border-box' }}
                />
            </div>
            <select value={filters.actor_type ?? ''} onChange={e => onChange('actor_type', e.target.value)} style={selectSt}>
                <option value="">All Actors</option>
                <option value="customer">Customer</option>
                <option value="staff">Staff</option>
                <option value="guest">Guest</option>
            </select>
            {extras}
            <input type="date" value={filters.from ?? ''} onChange={e => onChange('from', e.target.value)} style={{ ...inputSt, colorScheme: 'dark' }} />
            <input type="date" value={filters.to ?? ''} onChange={e => onChange('to', e.target.value)} style={{ ...inputSt, colorScheme: 'dark' }} />
        </div>
    );
}

// ── Pagination ─────────────────────────────────────────────────────────────────
function Pagination({ meta, onPage, onHover }) {
    if (!meta || meta.last_page <= 1) return null;
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <span style={{ fontSize: '0.68rem', color: C.textDim, fontFamily: 'monospace' }}>
                {meta.from}–{meta.to} of {meta.total}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={meta.current_page === 1} onClick={() => onPage(meta.current_page - 1)} onMouseEnter={onHover}
                    style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: meta.current_page === 1 ? 'not-allowed' : 'pointer', opacity: meta.current_page === 1 ? 0.4 : 1 }}>
                    <ChevronLeft size={12} />
                </button>
                <span style={{ fontSize: '0.68rem', color: C.textMid, fontFamily: 'monospace', padding: '4px 8px' }}>
                    {meta.current_page} / {meta.last_page}
                </span>
                <button disabled={meta.current_page === meta.last_page} onClick={() => onPage(meta.current_page + 1)} onMouseEnter={onHover}
                    style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: meta.current_page === meta.last_page ? 'not-allowed' : 'pointer', opacity: meta.current_page === meta.last_page ? 0.4 : 1 }}>
                    <ChevronRight size={12} />
                </button>
            </div>
        </div>
    );
}

// ── Session detail overlay ─────────────────────────────────────────────────────
function SessionDetail({ sessionId, onBack, audio }) {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        mimiAPI.getSessionDetail(sessionId)
            .then(setData)
            .catch(() => { setError('Failed to load session.'); audio.playError(); })
            .finally(() => setLoading(false));
    }, [sessionId]);

    const s = data?.session;

    return (
        <div style={{ animation: 'fadeIn 200ms ease' }}>
            <button onClick={onBack} onMouseEnter={audio.playHover}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, fontSize: '0.72rem', fontFamily: 'monospace', padding: 0 }}>
                <ArrowLeft size={13} /> BACK TO SESSIONS
            </button>

            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '60px 0', justifyContent: 'center' }}>
                    <Loader2 size={18} style={{ color: C.purple, animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.8rem', color: C.textDim, fontFamily: 'monospace' }}>LOADING SESSION…</span>
                </div>
            )}

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertCircle size={15} style={{ color: C.red }} />
                    <span style={{ fontSize: '0.82rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                </div>
            )}

            {s && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Session header card */}
                    <div style={{ ...neuralCard, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                            <Terminal size={18} style={{ color: C.purple, filter: `drop-shadow(0 0 6px ${C.purple})` }} />
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>
                                    {s.actor_display_name ?? s.ip_address ?? 'Unknown Actor'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace', marginTop: 2 }}>
                                    TOKEN: {s.session_token?.slice(0, 16)}…
                                </div>
                            </div>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                <Badge label={s.actor_type} color={actorColor(s.actor_type)} />
                                <Badge label={s.status} color={statusColor(s.status)} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                            {[
                                { label: 'Customer #',   value: s.customer_number ?? '—' },
                                { label: 'Age',          value: s.customer_age ?? '—' },
                                { label: 'Tier',         value: s.customer_tier ?? '—' },
                                { label: 'IP',           value: s.ip_address ?? '—' },
                                { label: 'Messages',     value: s.message_count },
                                { label: 'Failed',       value: s.failed_count },
                                { label: 'Started',      value: fmtTime(s.started_at) },
                                { label: 'Last Active',  value: fmtTime(s.last_active_at) },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: '0.58rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{value}</div>
                                </div>
                            ))}
                        </div>

                        {s.is_blocked && (
                            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                <span style={{ fontSize: '0.72rem', color: C.red, fontFamily: 'monospace' }}>
                                    🚫 BLOCKED — {s.block_reason ?? 'No reason given'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Query log timeline */}
                    <div style={{ ...neuralCard, padding: 20 }}>
                        <p style={{ margin: '0 0 16px', fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <List size={12} style={{ color: C.cyan }} /> QUERY LOG · {data.logs?.length ?? 0} MESSAGES
                        </p>

                        {data.logs?.length === 0 && (
                            <p style={{ fontSize: '0.78rem', color: C.textDim, fontFamily: 'monospace', textAlign: 'center', padding: '20px 0' }}>No queries in this session.</p>
                        )}

                        {data.logs?.map((log, i) => (
                            <div key={log.id} style={{
                                marginBottom: 14, paddingBottom: 14,
                                borderBottom: i < data.logs.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                                animation: 'fadeSlideIn 200ms ease both',
                                animationDelay: `${i * 30}ms`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <Dot color={statusColor(log.response_status)} />
                                    <span style={{ fontSize: '0.62rem', color: C.textDim, fontFamily: 'monospace' }}>{fmtTime(log.queried_at)}</span>
                                    <Badge label={log.response_status} color={statusColor(log.response_status)} />
                                    {log.is_harmful && <Badge label={`⚠ ${log.harm_category}`} color={C.red} />}
                                    {log.is_flagged  && <Badge label="flagged" color={C.amber} />}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: C.textDim, fontFamily: 'monospace' }}>{fmtMs(log.response_time_ms)}</span>
                                </div>
                                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: `1px solid ${C.border}`, marginBottom: 6 }}>
                                    <span style={{ fontSize: '0.72rem', color: C.text, fontFamily: 'monospace', lineHeight: 1.5 }}>{log.query}</span>
                                </div>
                                {log.response && (
                                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(168,85,247,0.05)', border: `1px solid rgba(168,85,247,0.15)` }}>
                                        <span style={{ fontSize: '0.72rem', color: C.textMid, fontFamily: 'monospace', lineHeight: 1.5 }}>{truncate(log.response, 300)}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Sessions tab ───────────────────────────────────────────────────────────────
function SessionsTab({ audio, onViewSession }) {
    const [sessions, setSessions] = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [page, setPage]         = useState(1);
    const [filters, setFilters]   = useState({});

    const load = async (p = 1) => {
        setLoading(true);
        setError(null);
        try {
            const res = await mimiAPI.getSessions({ ...filters, page: p, per_page: 25 });
            setSessions(res);
        } catch {
            setError('Failed to load sessions.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); setPage(1); }, [JSON.stringify(filters)]);

    const handlePage = p => { setPage(p); load(p); };
    const handleFilter = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }));

    const thSt = { fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace', padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const tdSt = { padding: '10px 12px', fontSize: '0.75rem', color: C.text, fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' };

    return (
        <div>
            <FilterBar filters={filters} onChange={handleFilter} extras={
                <select value={filters.status ?? ''} onChange={e => handleFilter('status', e.target.value)}
                    style={{ padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', cursor: 'pointer', colorScheme: 'dark' }}>
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="ended">Ended</option>
                    <option value="blocked">Blocked</option>
                    <option value="error">Error</option>
                </select>
            } />

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertCircle size={14} style={{ color: C.red }} />
                    <span style={{ fontSize: '0.78rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 10 }}>
                    <Loader2 size={18} style={{ color: C.purple, animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.78rem', color: C.textDim, fontFamily: 'monospace' }}>LOADING SESSIONS…</span>
                </div>
            ) : (
                <div style={{ ...neuralCard, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Actor', 'Type', 'Status', 'IP', 'Messages', 'Failed', 'Started', 'Last Active', ''].map(h => (
                                        <th key={h} style={thSt}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sessions?.data?.length === 0 && (
                                    <tr><td colSpan={9} style={{ ...tdSt, textAlign: 'center', color: C.textDim, padding: '40px 0' }}>No sessions found.</td></tr>
                                )}
                                {sessions?.data?.map(s => (
                                    <tr key={s.id} style={{ transition: 'background 150ms' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; audio.playHover(); }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                        <td style={tdSt}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Dot color={actorColor(s.actor_type)} />
                                                <span style={{ fontWeight: 600 }}>{s.actor_display_name ?? '—'}</span>
                                            </div>
                                            {s.customer_number && <div style={{ fontSize: '0.6rem', color: C.textDim, marginLeft: 15 }}>#{s.customer_number}</div>}
                                        </td>
                                        <td style={tdSt}><Badge label={s.actor_type} color={actorColor(s.actor_type)} /></td>
                                        <td style={tdSt}><Badge label={s.status} color={statusColor(s.status)} /></td>
                                        <td style={{ ...tdSt, color: C.textDim }}>{s.ip_address ?? '—'}</td>
                                        <td style={{ ...tdSt, color: C.blue, fontWeight: 700, textAlign: 'center' }}>{s.message_count}</td>
                                        <td style={{ ...tdSt, color: s.failed_count > 0 ? C.amber : C.textDim, fontWeight: s.failed_count > 0 ? 700 : 400, textAlign: 'center' }}>{s.failed_count}</td>
                                        <td style={{ ...tdSt, color: C.textDim, fontSize: '0.68rem' }}>{fmtTime(s.started_at)}</td>
                                        <td style={{ ...tdSt, color: C.textDim, fontSize: '0.68rem' }}>{fmtTime(s.last_active_at)}</td>
                                        <td style={tdSt}>
                                            <button onClick={() => onViewSession(s.id)} onMouseEnter={audio.playHover}
                                                style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.cyan}40`, background: `${C.cyan}10`, color: C.cyan, fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                VIEW →
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '8px 12px' }}>
                        <Pagination meta={sessions} onPage={handlePage} onHover={audio.playHover} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Query logs tab ─────────────────────────────────────────────────────────────
function QueryLogsTab({ audio }) {
    const [logs, setLogs]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [page, setPage]       = useState(1);
    const [filters, setFilters] = useState({});
    const [expanded, setExpanded] = useState(null);

    const load = async (p = 1) => {
        setLoading(true);
        setError(null);
        try {
            const res = await mimiAPI.getQueries({ ...filters, page: p, per_page: 25 });
            setLogs(res);
        } catch {
            setError('Failed to load query logs.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); setPage(1); }, [JSON.stringify(filters)]);

    const handlePage = p => { setPage(p); load(p); };
    const handleFilter = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }));

    const thSt = { fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace', padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const tdSt = { padding: '10px 12px', fontSize: '0.75rem', color: C.text, fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' };

    return (
        <div>
            <FilterBar filters={filters} onChange={handleFilter} extras={
                <>
                    <select value={filters.response_status ?? ''} onChange={e => handleFilter('response_status', e.target.value)}
                        style={{ padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', cursor: 'pointer', colorScheme: 'dark' }}>
                        <option value="">All Statuses</option>
                        <option value="success">Success</option>
                        <option value="harmful">Harmful</option>
                        <option value="blocked">Blocked</option>
                        <option value="rate_limited">Rate Limited</option>
                        <option value="api_error">API Error</option>
                        <option value="connection_error">Connection Error</option>
                    </select>
                    <select value={filters.is_harmful ?? ''} onChange={e => handleFilter('is_harmful', e.target.value)}
                        style={{ padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', cursor: 'pointer', colorScheme: 'dark' }}>
                        <option value="">Any Harm</option>
                        <option value="1">Harmful Only</option>
                        <option value="0">Safe Only</option>
                    </select>
                </>
            } />

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertCircle size={14} style={{ color: C.red }} />
                    <span style={{ fontSize: '0.78rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 10 }}>
                    <Loader2 size={18} style={{ color: C.purple, animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.78rem', color: C.textDim, fontFamily: 'monospace' }}>LOADING QUERIES…</span>
                </div>
            ) : (
                <div style={{ ...neuralCard, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Time', 'Actor', 'Query', 'Status', 'Harm', 'Response ms', 'Flagged'].map(h => (
                                        <th key={h} style={thSt}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {logs?.data?.length === 0 && (
                                    <tr><td colSpan={7} style={{ ...tdSt, textAlign: 'center', color: C.textDim, padding: '40px 0' }}>No query logs found.</td></tr>
                                )}
                                {logs?.data?.map(log => (
                                    <>
                                        <tr key={log.id}
                                            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                            style={{ cursor: 'pointer', transition: 'background 150ms', background: expanded === log.id ? 'rgba(168,85,247,0.06)' : 'transparent' }}
                                            onMouseEnter={e => { if (expanded !== log.id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; audio.playHover(); }}
                                            onMouseLeave={e => { if (expanded !== log.id) e.currentTarget.style.background = 'transparent'; }}>
                                            <td style={{ ...tdSt, color: C.textDim, fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{fmtTime(log.queried_at)}</td>
                                            <td style={tdSt}>
                                                <Badge label={log.actor_type} color={actorColor(log.actor_type)} />
                                            </td>
                                            <td style={{ ...tdSt, maxWidth: 260 }}>
                                                <span style={{ color: C.text }}>{truncate(log.query, 80)}</span>
                                            </td>
                                            <td style={tdSt}><Badge label={log.response_status} color={statusColor(log.response_status)} /></td>
                                            <td style={tdSt}>
                                                {log.is_harmful
                                                    ? <Badge label={log.harm_category ?? 'HARMFUL'} color={C.red} />
                                                    : <span style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>—</span>}
                                            </td>
                                            <td style={{ ...tdSt, color: C.blue, fontWeight: 700 }}>{fmtMs(log.response_time_ms)}</td>
                                            <td style={tdSt}>
                                                {log.is_flagged
                                                    ? <span style={{ fontSize: '0.72rem', color: C.amber }}>⚑ YES</span>
                                                    : <span style={{ fontSize: '0.65rem', color: C.textDim }}>—</span>}
                                            </td>
                                        </tr>
                                        {expanded === log.id && (
                                            <tr key={`${log.id}-exp`}>
                                                <td colSpan={7} style={{ padding: '0 12px 14px', background: 'rgba(168,85,247,0.04)' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10 }}>
                                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: `1px solid ${C.border}` }}>
                                                            <div style={{ fontSize: '0.58rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6 }}>Query</div>
                                                            <div style={{ fontSize: '0.78rem', color: C.text, fontFamily: 'monospace', lineHeight: 1.6 }}>{log.query}</div>
                                                        </div>
                                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(168,85,247,0.05)', border: `1px solid rgba(168,85,247,0.2)` }}>
                                                            <div style={{ fontSize: '0.58rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6 }}>Response</div>
                                                            <div style={{ fontSize: '0.78rem', color: C.textMid, fontFamily: 'monospace', lineHeight: 1.6 }}>{log.response ?? '—'}</div>
                                                        </div>
                                                    </div>
                                                    {log.is_flagged && log.flagged_reason && (
                                                        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)' }}>
                                                            <span style={{ fontSize: '0.7rem', color: C.amber, fontFamily: 'monospace' }}>⚑ FLAG REASON: {log.flagged_reason}</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '8px 12px' }}>
                        <Pagination meta={logs} onPage={handlePage} onHover={audio.playHover} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function MimiSessionsPage() {
    const navigate  = useNavigate();
    const audio     = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);
    const [subTab, setSubTab]       = useState('sessions'); // 'sessions' | 'queries'
    const [viewSession, setViewSession] = useState(null);  // session id to detail

    const navTabs = [
        { label: 'OVERVIEW',  path: '/admin/ai-analytics/mimi',  active: false  },
        { label: 'SESSIONS',  path: '/admin/ai-analytics/mimi-sessions',  active: true },
        { label: 'BLOCKS',    path: '/admin/ai-analytics/mimi-eligibility',    active: false },
        { label: 'HARMFUL',   path: '/admin/ai-analytics/mimi-harmful',   active: false },
    ];

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS',   onClick: () => navigate('/admin/settings/general') },
                        { label: 'OVERVIEW',      onClick: () => navigate('/admin/ai-analytics/mimi') },
                        { label: viewSession ? 'SESSIONS' : 'SESSIONS', onClick: viewSession ? () => setViewSession(null) : undefined },
                        ...(viewSession ? [{ label: 'SESSION DETAIL' }] : []),
                    ]}
                />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
                    <Activity size={32} style={{ color: C.cyan, filter: `drop-shadow(0 0 8px ${C.cyan})`, flexShrink: 0, marginTop: 4 }} />
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.6rem', fontWeight: 800,
                            letterSpacing: '-0.02em', fontFamily: 'monospace',
                            background: `linear-gradient(135deg, ${C.cyan}, ${C.blue})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            SESSIONS & QUERIES
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                            CHAT SESSIONS · QUERY LOGS · RESPONSE ANALYTICS
                        </p>
                    </div>
                </div>
                <NeuralDivider />

                {/* Nav pills */}
                <div style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
                    {navTabs.map(tab => (
                        <button key={tab.label} onClick={() => { audio.playHover(); navigate(tab.path); }}
                            style={{
                                padding: '6px 14px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700,
                                fontFamily: 'monospace', letterSpacing: '0.08em', cursor: 'pointer',
                                border: `1px solid ${tab.active ? C.cyan + '60' : C.border}`,
                                background: tab.active ? `${C.cyan}15` : 'transparent',
                                color: tab.active ? C.cyan : C.textDim,
                                transition: 'all 150ms',
                            }}
                        >{tab.label}</button>
                    ))}
                </div>

                {/* Content */}
                {viewSession ? (
                    <SessionDetail sessionId={viewSession} onBack={() => setViewSession(null)} audio={audio} />
                ) : (
                    <>
                        {/* Sub-tabs */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                            {[
                                { key: 'sessions', label: 'Sessions',   icon: User   },
                                { key: 'queries',  label: 'Query Logs', icon: Terminal },
                            ].map(({ key, label, icon: Icon }) => (
                                <button key={key}
                                    onClick={() => { audio.playActivate(); setSubTab(key); }}
                                    onMouseEnter={audio.playHover}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '7px 16px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                                        fontFamily: 'monospace', letterSpacing: '0.06em', cursor: 'pointer',
                                        border: `1px solid ${subTab === key ? C.blue + '60' : C.border}`,
                                        background: subTab === key ? `${C.blue}15` : 'transparent',
                                        color: subTab === key ? C.blue : C.textDim,
                                        transition: 'all 150ms',
                                    }}>
                                    <Icon size={12} /> {label}
                                </button>
                            ))}
                        </div>

                        {subTab === 'sessions' && <SessionsTab audio={audio} onViewSession={id => { audio.playActivate(); setViewSession(id); }} />}
                        {subTab === 'queries'  && <QueryLogsTab audio={audio} />}
                    </>
                )}

            </NeuralPageShell>
        </GeneralLayout>
    );
}
