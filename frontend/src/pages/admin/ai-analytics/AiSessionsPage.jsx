import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList, ChevronLeft, ChevronRight as ChevronRightIcon,
    Loader2, AlertCircle, CheckCircle, XCircle, Clock,
    Brain, Zap, Activity, Filter, RefreshCw, User, Hash,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
    success: { color: C.green,  bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  Icon: CheckCircle, label: 'SUCCESS' },
    failed:  { color: C.red,    bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   Icon: XCircle,     label: 'FAILED'  },
    pending: { color: C.amber,  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  Icon: Clock,       label: 'PENDING' },
};

// ── Provider colors ───────────────────────────────────────────────────────────
const PROVIDER_COLOR = {
    anthropic: C.purple,
    gemini:    C.blue,
    openai:    C.green,
    mistral:   C.amber,
    cohere:    C.cyan,
};

// ── Format helpers ────────────────────────────────────────────────────────────
const fmtCost   = (n) => `$${Number(n ?? 0).toFixed(4)}`;
const fmtTokens = (n) => Number(n ?? 0).toLocaleString();
const fmtMs     = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtDate   = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ── Neural filter pill ────────────────────────────────────────────────────────
const FilterPill = ({ label, active, onClick, color, onHover }) => (
    <button
        onClick={onClick}
        onMouseEnter={onHover}
        style={{
            padding: '4px 12px', borderRadius: 20,
            border: `1px solid ${active ? (color ?? C.purple) : C.border}`,
            background: active ? `${color ?? C.purple}15` : 'transparent',
            color: active ? (color ?? C.purple) : C.textDim,
            fontSize: '0.68rem', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'monospace',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            transition: 'all 150ms',
            boxShadow: active ? `0 0 8px ${(color ?? C.purple)}30` : 'none',
        }}
    >
        {label}
    </button>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AiSessionsPage() {
    const navigate    = useNavigate();
    const audio       = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);

    const [sessions,  setSessions]  = useState([]);
    const [stats,     setStats]     = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [statsLoad, setStatsLoad] = useState(true);
    const [error,     setError]     = useState(null);
    const [expanded,  setExpanded]  = useState(null);

    const [filterStatus, setFilterStatus] = useState('');
    const [filterModule, setFilterModule] = useState('');
    const [page,         setPage]         = useState(1);
    const [pagination,   setPagination]   = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
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
            audio.playError();
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterModule, page]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        aiAnalyticsAPI.getSessionStats()
            .then(setStats).catch(() => {})
            .finally(() => setStatsLoad(false));
    }, []);

    const moduleKeys = stats?.by_module?.map(m => m.module_key) ?? [];
    const applyStatus = (s) => { setFilterStatus(s); setPage(1); audio.playHover(); };
    const applyModule = (m) => { setFilterModule(m); setPage(1); audio.playHover(); };

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS',    onClick: () => navigate('/admin/settings/general') },
                        { label: 'AI ANALYTICS',  onClick: () => navigate('/admin/ai-analytics') },
                        { label: 'SESSION LOGS' },
                    ]}
                />

                {/* ── Page header ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <ClipboardList size={32} style={{ color: C.green, filter: `drop-shadow(0 0 8px ${C.green})`, flexShrink: 0, marginTop: 4 }} />
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: '1.6rem', fontWeight: 800,
                                letterSpacing: '-0.02em', fontFamily: 'monospace',
                                background: `linear-gradient(135deg, ${C.green}, ${C.cyan})`,
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>
                                SESSION LOGS
                            </h1>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                                FULL ACCOUNTABILITY TRAIL — TOKENS · COST · ADMIN
                            </p>
                        </div>
                    </div>

                    {/* Refresh button */}
                    <button
                        onClick={() => { load(); audio.playHover(); }}
                        onMouseEnter={e => {
                            audio.playHover();
                            e.currentTarget.style.borderColor = C.cyan;
                            e.currentTarget.style.color = C.cyan;
                            e.currentTarget.style.boxShadow = `0 0 12px ${C.cyan}30`;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = C.border;
                            e.currentTarget.style.color = C.textDim;
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 14px', borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            background: 'rgba(0,0,0,0.2)',
                            color: C.textDim, cursor: 'pointer',
                            fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700,
                            letterSpacing: '0.06em', flexShrink: 0,
                            transition: 'all 150ms', backdropFilter: 'blur(8px)',
                        }}
                    >
                        <RefreshCw size={13} />
                        REFRESH
                    </button>
                </div>
                <NeuralDivider />

                {/* ── Stat strip ── */}
                {!statsLoad && stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, margin: '24px 0' }}>
                        {[
                            { label: 'Total Sessions', value: Number(stats.total_sessions ?? 0).toLocaleString(), icon: Activity,    color: C.purple },
                            { label: 'Total Cost',     value: fmtCost(stats.total_cost),                          icon: Zap,         color: C.green  },
                            { label: 'Total Tokens',   value: fmtTokens(stats.total_tokens),                      icon: Brain,       color: C.blue   },
                            { label: 'Success',        value: Number(stats.success_rate ?? 0).toLocaleString(),   icon: CheckCircle, color: C.green  },
                            { label: 'Failed',         value: Number(stats.failed ?? 0).toLocaleString(),         icon: AlertCircle, color: C.red    },
                        ].map(({ label, value, icon: Icon, color }) => (
                            <div key={label} style={{ ...neuralCard, padding: '14px 18px', border: `1px solid ${color}25` }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace' }}>{label}</span>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon size={13} style={{ color }} />
                                    </div>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.text, lineHeight: 1, fontFamily: 'monospace' }}>{value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Filters ── */}
                <div style={{
                    ...neuralCard,
                    padding: '12px 18px', marginBottom: 20,
                    display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.textDim, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', marginRight: 4 }}>
                        <Filter size={11} style={{ color: C.blue }} />
                        FILTER
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <FilterPill label="ALL"     active={filterStatus === ''}        onClick={() => applyStatus('')}        onHover={audio.playHover} />
                        <FilterPill label="SUCCESS" active={filterStatus === 'success'} onClick={() => applyStatus('success')} onHover={audio.playHover} color={C.green} />
                        <FilterPill label="FAILED"  active={filterStatus === 'failed'}  onClick={() => applyStatus('failed')}  onHover={audio.playHover} color={C.red}   />
                    </div>

                    {moduleKeys.length > 0 && (
                        <div style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />
                    )}

                    {moduleKeys.map(k => (
                        <FilterPill
                            key={k}
                            label={k}
                            active={filterModule === k}
                            onClick={() => applyModule(filterModule === k ? '' : k)}
                            onHover={audio.playHover}
                            color={C.blue}
                        />
                    ))}
                </div>

                {/* ── Error banner ── */}
                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                        background: 'rgba(239,68,68,0.06)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        boxShadow: '0 0 16px rgba(239,68,68,0.1)',
                    }}>
                        <AlertCircle size={15} style={{ color: C.red, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                    </div>
                )}

                {/* ── Sessions table ── */}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
                        <Loader2 size={20} style={{ color: C.green, animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '0.82rem', color: C.textDim, fontFamily: 'monospace', letterSpacing: '0.08em' }}>LOADING SESSIONS…</span>
                    </div>

                ) : sessions.length === 0 ? (
                    <div style={{ ...neuralCard, padding: 56, textAlign: 'center' }}>
                        <ClipboardList size={36} style={{ color: C.textDim, margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: C.textDim, margin: '0 0 4px', fontFamily: 'monospace' }}>NO SESSIONS FOUND</p>
                        <p style={{ fontSize: '0.72rem', color: C.textDim, margin: 0, fontFamily: 'monospace' }}>
                            {filterStatus || filterModule ? 'TRY ADJUSTING YOUR FILTERS' : 'SESSIONS WILL APPEAR HERE ONCE AI MODULES RUN'}
                        </p>
                    </div>

                ) : (
                    <div style={{ ...neuralCard, overflow: 'hidden' }}>
                        {/* Table header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '95px 1fr 110px 80px 80px 110px 80px',
                            gap: 12, padding: '10px 18px',
                            borderBottom: `1px solid ${C.border}`,
                            background: 'rgba(59,130,246,0.04)',
                        }}>
                            {['STATUS', 'MODULE / ADMIN', 'MODEL', 'TOKENS', 'COST', 'TIME', 'DURATION'].map(h => (
                                <span key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'monospace' }}>{h}</span>
                            ))}
                        </div>

                        {/* Rows */}
                        {sessions.map((s, idx) => {
                            const st  = STATUS[s.status] ?? STATUS.pending;
                            const pc  = PROVIDER_COLOR[s.key?.provider] ?? C.textDim;
                            const isErr = s.status === 'failed' && s.error_message;
                            const totalTokens = (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0);

                            return (
                                <div key={s.id}>
                                    <div
                                        onClick={() => { if (isErr) { setExpanded(expanded === s.id ? null : s.id); audio.playHover(); } }}
                                        onMouseEnter={e => {
                                            audio.playHover();
                                            e.currentTarget.style.background = isErr
                                                ? 'rgba(239,68,68,0.04)'
                                                : 'rgba(59,130,246,0.04)';
                                        }}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '95px 1fr 110px 80px 80px 110px 80px',
                                            gap: 12, padding: '13px 18px',
                                            borderBottom: `1px solid ${C.border}`,
                                            cursor: isErr ? 'pointer' : 'default',
                                            transition: 'background 120ms',
                                            animation: `fadeSlideIn 0.2s ease both`,
                                            animationDelay: `${idx * 25}ms`,
                                        }}
                                    >
                                        {/* Status */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                padding: '3px 8px', borderRadius: 20,
                                                background: st.bg, border: `1px solid ${st.border}`,
                                                boxShadow: `0 0 6px ${st.color}20`,
                                            }}>
                                                <st.Icon size={9} style={{ color: st.color }} />
                                                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: st.color, letterSpacing: '0.06em', fontFamily: 'monospace' }}>{st.label}</span>
                                            </div>
                                        </div>

                                        {/* Module / Admin */}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                <span style={{
                                                    fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
                                                    padding: '1px 6px', borderRadius: 4,
                                                    background: `${pc}12`, border: `1px solid ${pc}25`, color: pc,
                                                }}>
                                                    {s.module_key}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <User size={9} style={{ color: C.textDim, flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.7rem', color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {s.admin?.name ?? `#${s.admin_id}`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Model */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.66rem', color: C.textMid, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {s.model_used ? s.model_used.split('-').slice(0, 2).join('-') : '—'}
                                            </span>
                                        </div>

                                        {/* Tokens */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: totalTokens > 0 ? C.text : C.textDim, fontFamily: 'monospace' }}>
                                                {totalTokens > 0 ? fmtTokens(totalTokens) : '—'}
                                            </span>
                                        </div>

                                        {/* Cost */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: totalTokens > 0 ? C.green : C.textDim, fontFamily: 'monospace' }}>
                                                {totalTokens > 0 ? fmtCost(s.cost_estimate) : '—'}
                                            </span>
                                        </div>

                                        {/* Timestamp */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>
                                                {fmtDate(s.created_at)}
                                            </span>
                                        </div>

                                        {/* Duration */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={9} style={{ color: C.textDim, flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.7rem', color: C.textMid, fontFamily: 'monospace' }}>
                                                {s.response_time_ms ? fmtMs(s.response_time_ms) : '—'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded error row */}
                                    {expanded === s.id && s.error_message && (
                                        <div style={{
                                            padding: '10px 18px 14px',
                                            background: 'rgba(239,68,68,0.04)',
                                            borderBottom: `1px solid ${C.border}`,
                                            borderLeft: `3px solid ${C.red}`,
                                            boxShadow: `inset 0 0 20px rgba(239,68,68,0.05)`,
                                            animation: 'fadeSlideIn 0.2s ease both',
                                        }}>
                                            <p style={{ margin: '0 0 5px', fontSize: '0.62rem', fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                                                ▸ ERROR
                                            </p>
                                            <p style={{ margin: 0, fontSize: '0.76rem', color: C.red, fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all', opacity: 0.85 }}>
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
                        <span style={{ fontSize: '0.68rem', color: C.textDim, fontFamily: 'monospace' }}>
                            SHOWING {((page - 1) * 20) + 1}–{Math.min(page * 20, pagination.total)} OF {pagination.total.toLocaleString()} SESSIONS
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={() => { setPage(p => Math.max(1, p - 1)); audio.playHover(); }}
                                disabled={page === 1}
                                onMouseEnter={audio.playHover}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '6px 12px', borderRadius: 8,
                                    border: `1px solid ${C.border}`,
                                    background: 'transparent',
                                    color: page === 1 ? C.textDim : C.text,
                                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                                    fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700,
                                    opacity: page === 1 ? 0.4 : 1,
                                }}
                            >
                                <ChevronLeft size={12} /> PREV
                            </button>

                            {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                                const pg = Math.max(1, Math.min(pagination.last_page - 4, page - 2)) + i;
                                return (
                                    <button
                                        key={pg}
                                        onClick={() => { setPage(pg); audio.playHover(); }}
                                        onMouseEnter={audio.playHover}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            border: `1px solid ${pg === page ? C.purple : C.border}`,
                                            background: pg === page ? `${C.purple}15` : 'transparent',
                                            color: pg === page ? C.purple : C.textMid,
                                            cursor: 'pointer', fontFamily: 'monospace',
                                            fontSize: '0.72rem', fontWeight: 700,
                                            boxShadow: pg === page ? `0 0 8px ${C.purple}30` : 'none',
                                        }}
                                    >
                                        {pg}
                                    </button>
                                );
                            })}

                            <button
                                onClick={() => { setPage(p => Math.min(pagination.last_page, p + 1)); audio.playHover(); }}
                                disabled={page === pagination.last_page}
                                onMouseEnter={audio.playHover}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '6px 12px', borderRadius: 8,
                                    border: `1px solid ${C.border}`,
                                    background: 'transparent',
                                    color: page === pagination.last_page ? C.textDim : C.text,
                                    cursor: page === pagination.last_page ? 'not-allowed' : 'pointer',
                                    fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700,
                                    opacity: page === pagination.last_page ? 0.4 : 1,
                                }}
                            >
                                NEXT <ChevronRightIcon size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: '0.65rem', color: C.textDim }}>
                    <Activity size={11} style={{ color: C.green }} />
                    {sessions.length} SESSION{sessions.length !== 1 ? 'S' : ''} LOADED
                    <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
                    <Hash size={10} style={{ color: C.textDim }} />
                    CLICK A FAILED ROW TO EXPAND ERROR
                </div>

            </NeuralPageShell>
        </GeneralLayout>
    );
}