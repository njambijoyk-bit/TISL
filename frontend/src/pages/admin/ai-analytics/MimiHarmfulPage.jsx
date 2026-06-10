import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ShieldOff, Loader2, AlertCircle, AlertTriangle,
    ChevronLeft, ChevronRight, Flag, X, CheckCircle,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import mimiAPI from '../../../api/mimiAPI';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── Helpers ────────────────────────────────────────────────────────────────────
const actorColor = a => ({ customer: C.purple, staff: C.cyan, guest: C.textMid }[a] ?? C.textMid);

const harmColor = cat => ({
    HACKING:        C.cyan,
    SEXUAL_CONTENT: C.red,
    VIOLENCE:       C.red,
    HATE_SPEECH:    C.amber,
    FRAUD:          C.amber,
    DRUGS:          C.purple,
    HARASSMENT:     C.red,
    DANGEROUS_CONTENT: C.amber,
}[cat] ?? C.red);

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
const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s ?? '—');

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

// ── Flag modal ─────────────────────────────────────────────────────────────────
function FlagModal({ log, onClose, onSuccess, audio }) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState(null);

    const handle = async () => {
        if (!reason.trim()) { setError('A reason is required.'); return; }
        setSaving(true);
        setError(null);
        try {
            await mimiAPI.flagQuery(log.id, reason);
            audio.playSuccess();
            onSuccess();
        } catch {
            setError('Failed to flag query.');
            audio.playError();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 150ms ease',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                ...neuralCard, width: '100%', maxWidth: 440, padding: 26, margin: 16,
                border: `1px solid rgba(245,158,11,0.4)`,
                animation: 'fadeSlideIn 200ms ease',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Flag size={16} style={{ color: C.amber, filter: `drop-shadow(0 0 5px ${C.amber})` }} />
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>FLAG QUERY</span>
                    </div>
                    <button onClick={onClose} onMouseEnter={audio.playHover}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, display: 'flex', padding: 4 }}>
                        <X size={15} />
                    </button>
                </div>

                {/* Query preview */}
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, marginBottom: 16 }}>
                    <div style={{ fontSize: '0.58rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Query Preview</div>
                    <div style={{ fontSize: '0.78rem', color: C.textMid, fontFamily: 'monospace', lineHeight: 1.5 }}>{truncate(log.query, 160)}</div>
                </div>

                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, marginBottom: 12, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <AlertCircle size={12} style={{ color: C.red }} />
                        <span style={{ fontSize: '0.72rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                    </div>
                )}

                <label style={{ fontSize: '0.65rem', fontWeight: 700, color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                    Flag Reason
                </label>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Why is this query being flagged for review?"
                    rows={3}
                    maxLength={300}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.5 }}
                />
                <div style={{ fontSize: '0.6rem', color: C.textDim, fontFamily: 'monospace', textAlign: 'right', marginTop: 4 }}>{reason.length}/300</div>

                <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} onMouseEnter={audio.playHover}
                        style={{ padding: '7px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}>
                        CANCEL
                    </button>
                    <button onClick={handle} disabled={saving} onMouseEnter={audio.playHover}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '7px 18px', borderRadius: 8,
                            border: `1px solid rgba(245,158,11,0.5)`,
                            background: 'rgba(245,158,11,0.1)', color: C.amber,
                            fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700,
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                        }}>
                        {saving ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Flag size={12} />}
                        {saving ? 'FLAGGING…' : 'CONFIRM FLAG'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Shared query row (expandable) ──────────────────────────────────────────────
function QueryRow({ log, expanded, onToggle, onFlag, onUnflag, showHarmBadge, audio }) {
    return (
        <>
            <tr
                onClick={onToggle}
                style={{ cursor: 'pointer', transition: 'background 150ms', background: expanded ? 'rgba(239,68,68,0.04)' : 'transparent' }}
                onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; audio.playHover(); }}
                onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}>

                <td style={{ padding: '10px 12px', fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                    {fmtTime(log.queried_at)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '0.75rem', fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' }}>
                    <Badge label={log.actor_type} color={actorColor(log.actor_type)} />
                </td>
                <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: C.text, fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, maxWidth: 280, verticalAlign: 'middle' }}>
                    {truncate(log.query, 90)}
                </td>
                {showHarmBadge && (
                    <td style={{ padding: '10px 12px', fontSize: '0.75rem', fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' }}>
                        {log.harm_category
                            ? <Badge label={log.harm_category} color={harmColor(log.harm_category)} />
                            : <span style={{ fontSize: '0.65rem', color: C.textDim }}>GEMINI BLOCK</span>}
                    </td>
                )}
                <td style={{ padding: '10px 12px', fontSize: '0.7rem', color: C.blue, fontFamily: 'monospace', fontWeight: 700, borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' }}>
                    {log.response_time_ms != null ? `${log.response_time_ms}ms` : '—'}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '0.75rem', fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {log.is_flagged ? (
                            <button
                                onClick={e => { e.stopPropagation(); onUnflag(log); }}
                                onMouseEnter={e => { e.stopPropagation(); audio.playHover(); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, border: `1px solid rgba(245,158,11,0.4)`, background: 'rgba(245,158,11,0.1)', color: C.amber, fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <CheckCircle size={11} /> UNFLAG
                            </button>
                        ) : (
                            <button
                                onClick={e => { e.stopPropagation(); onFlag(log); }}
                                onMouseEnter={e => { e.stopPropagation(); audio.playHover(); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, border: `1px solid rgba(245,158,11,0.3)`, background: 'transparent', color: C.textDim, fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <Flag size={11} /> FLAG
                            </button>
                        )}
                    </div>
                </td>
            </tr>

            {expanded && (
                <tr>
                    <td colSpan={showHarmBadge ? 6 : 5} style={{ padding: '0 12px 14px', background: 'rgba(239,68,68,0.03)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10 }}>
                            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: '0.58rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6 }}>Query</div>
                                <div style={{ fontSize: '0.78rem', color: C.text, fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-word' }}>{log.query}</div>
                            </div>
                            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(168,85,247,0.05)', border: `1px solid rgba(168,85,247,0.2)` }}>
                                <div style={{ fontSize: '0.58rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6 }}>Response</div>
                                <div style={{ fontSize: '0.78rem', color: C.textMid, fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-word' }}>{log.response ?? <span style={{ color: C.textDim }}>No response captured</span>}</div>
                            </div>
                        </div>
                        {log.is_flagged && log.flagged_reason && (
                            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)' }}>
                                <span style={{ fontSize: '0.7rem', color: C.amber, fontFamily: 'monospace' }}>⚑ FLAG REASON: {log.flagged_reason}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Session ID', value: log.session_id },
                                { label: 'Query len', value: log.query_length },
                                { label: 'Response len', value: log.response_length ?? '—' },
                                { label: 'HTTP status', value: log.http_status_code ?? '—' },
                            ].map(({ label, value }) => (
                                <span key={label} style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>
                                    {label}: <span style={{ color: C.textMid, fontWeight: 700 }}>{value}</span>
                                </span>
                            ))}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Harmful tab ────────────────────────────────────────────────────────────────
function HarmfulTab({ audio }) {
    const [logs, setLogs]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [page, setPage]       = useState(1);
    const [filters, setFilters] = useState({ is_harmful: '1' });
    const [expanded, setExpanded]     = useState(null);
    const [flagTarget, setFlagTarget] = useState(null);

    const load = async (p = 1) => {
        setLoading(true); setError(null);
        try {
            const res = await mimiAPI.getQueries({ ...filters, page: p, per_page: 25 });
            setLogs(res);
        } catch {
            setError('Failed to load harmful queries.');
            audio.playError();
        } finally {
            setLoading(false); }
    };

    useEffect(() => { load(1); setPage(1); }, [JSON.stringify(filters)]);

    const handleFilter = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }));
    const handlePage   = p => { setPage(p); load(p); };

    const handleUnflag = async (log) => {
        try { await mimiAPI.unflagQuery(log.id); audio.playSuccess(); load(page); }
        catch { audio.playError(); }
    };

    const thSt = { fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace', padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const selectSt = { padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', cursor: 'pointer', colorScheme: 'dark' };

    return (
        <div>
            {/* Category legend */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {['HACKING', 'SEXUAL_CONTENT', 'VIOLENCE', 'HATE_SPEECH', 'FRAUD', 'DRUGS', 'HARASSMENT'].map(cat => (
                    <span key={cat} style={{
                        fontSize: '0.58rem', fontWeight: 700, fontFamily: 'monospace',
                        padding: '2px 8px', borderRadius: 5,
                        background: `${harmColor(cat)}10`, border: `1px solid ${harmColor(cat)}30`, color: harmColor(cat),
                        cursor: 'pointer',
                    }}
                    onClick={() => handleFilter('response_status', undefined)}>
                        {cat}
                    </span>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <select value={filters.actor_type ?? ''} onChange={e => handleFilter('actor_type', e.target.value)} style={selectSt}>
                    <option value="">All Actors</option>
                    <option value="customer">Customer</option>
                    <option value="staff">Staff</option>
                    <option value="guest">Guest</option>
                </select>
                <div style={{ position: 'relative', flex: '1 1 180px' }}>
                    <input
                        value={filters.search ?? ''}
                        onChange={e => handleFilter('search', e.target.value)}
                        placeholder="Search query text…"
                        style={{ ...selectSt, paddingLeft: 10, width: '100%', boxSizing: 'border-box', cursor: 'text' }}
                    />
                </div>
                <input type="date" value={filters.from ?? ''} onChange={e => handleFilter('from', e.target.value)} style={{ ...selectSt, cursor: 'text', colorScheme: 'dark' }} />
                <input type="date" value={filters.to ?? ''}   onChange={e => handleFilter('to',   e.target.value)} style={{ ...selectSt, cursor: 'text', colorScheme: 'dark' }} />
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertCircle size={14} style={{ color: C.red }} />
                    <span style={{ fontSize: '0.78rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 10 }}>
                    <Loader2 size={18} style={{ color: C.red, animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.78rem', color: C.textDim, fontFamily: 'monospace' }}>LOADING HARMFUL QUERIES…</span>
                </div>
            ) : (
                <div style={{ ...neuralCard, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Time', 'Actor', 'Query', 'Harm Category', 'Resp ms', 'Actions'].map(h => (
                                        <th key={h} style={thSt}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {logs?.data?.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: '60px 0', textAlign: 'center', color: C.textDim, fontFamily: 'monospace', fontSize: '0.82rem' }}>
                                        <ShieldOff size={28} style={{ color: C.textDim, display: 'block', margin: '0 auto 10px' }} />
                                        No harmful queries found.
                                    </td></tr>
                                )}
                                {logs?.data?.map(log => (
                                    <QueryRow
                                        key={log.id}
                                        log={log}
                                        expanded={expanded === log.id}
                                        onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
                                        onFlag={setFlagTarget}
                                        onUnflag={handleUnflag}
                                        showHarmBadge
                                        audio={audio}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '8px 12px' }}>
                        <Pagination meta={logs} onPage={handlePage} onHover={audio.playHover} />
                    </div>
                </div>
            )}

            {flagTarget && (
                <FlagModal log={flagTarget} onClose={() => setFlagTarget(null)} onSuccess={() => { setFlagTarget(null); load(page); }} audio={audio} />
            )}
        </div>
    );
}

// ── Flagged tab ────────────────────────────────────────────────────────────────
function FlaggedTab({ audio }) {
    const [logs, setLogs]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [page, setPage]       = useState(1);
    const [filters, setFilters] = useState({ is_flagged: '1' });
    const [expanded, setExpanded]     = useState(null);
    const [flagTarget, setFlagTarget] = useState(null);

    const load = async (p = 1) => {
        setLoading(true); setError(null);
        try {
            const res = await mimiAPI.getQueries({ ...filters, page: p, per_page: 25 });
            setLogs(res);
        } catch {
            setError('Failed to load flagged queries.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); setPage(1); }, [JSON.stringify(filters)]);

    const handleFilter = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined, is_flagged: '1' }));
    const handlePage   = p => { setPage(p); load(p); };

    const handleUnflag = async (log) => {
        try { await mimiAPI.unflagQuery(log.id); audio.playSuccess(); load(page); }
        catch { audio.playError(); }
    };

    const thSt = { fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace', padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const selectSt = { padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', cursor: 'pointer', colorScheme: 'dark' };

    return (
        <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <select value={filters.actor_type ?? ''} onChange={e => handleFilter('actor_type', e.target.value)} style={selectSt}>
                    <option value="">All Actors</option>
                    <option value="customer">Customer</option>
                    <option value="staff">Staff</option>
                    <option value="guest">Guest</option>
                </select>
                <input
                    value={filters.search ?? ''}
                    onChange={e => handleFilter('search', e.target.value)}
                    placeholder="Search query text…"
                    style={{ ...selectSt, flex: '1 1 180px', cursor: 'text' }}
                />
                <input type="date" value={filters.from ?? ''} onChange={e => handleFilter('from', e.target.value)} style={{ ...selectSt, cursor: 'text', colorScheme: 'dark' }} />
                <input type="date" value={filters.to ?? ''}   onChange={e => handleFilter('to',   e.target.value)} style={{ ...selectSt, cursor: 'text', colorScheme: 'dark' }} />
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertCircle size={14} style={{ color: C.red }} />
                    <span style={{ fontSize: '0.78rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 10 }}>
                    <Loader2 size={18} style={{ color: C.amber, animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.78rem', color: C.textDim, fontFamily: 'monospace' }}>LOADING FLAGGED QUERIES…</span>
                </div>
            ) : (
                <div style={{ ...neuralCard, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Time', 'Actor', 'Query', 'Resp ms', 'Actions'].map(h => (
                                        <th key={h} style={thSt}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {logs?.data?.length === 0 && (
                                    <tr><td colSpan={5} style={{ padding: '60px 0', textAlign: 'center', color: C.textDim, fontFamily: 'monospace', fontSize: '0.82rem' }}>
                                        <AlertTriangle size={28} style={{ color: C.textDim, display: 'block', margin: '0 auto 10px' }} />
                                        No flagged queries.
                                    </td></tr>
                                )}
                                {logs?.data?.map(log => (
                                    <QueryRow
                                        key={log.id}
                                        log={log}
                                        expanded={expanded === log.id}
                                        onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
                                        onFlag={setFlagTarget}
                                        onUnflag={handleUnflag}
                                        showHarmBadge={false}
                                        audio={audio}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '8px 12px' }}>
                        <Pagination meta={logs} onPage={handlePage} onHover={audio.playHover} />
                    </div>
                </div>
            )}

            {flagTarget && (
                <FlagModal log={flagTarget} onClose={() => setFlagTarget(null)} onSuccess={() => { setFlagTarget(null); load(page); }} audio={audio} />
            )}
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function MimiHarmfulPage() {
    const navigate  = useNavigate();
    const audio     = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);
    const [subTab, setSubTab]       = useState('harmful'); // 'harmful' | 'flagged'

    const navTabs = [
        { label: 'OVERVIEW',  path: '/admin/ai-analytics/mimi',  active: false  },
        { label: 'SESSIONS',  path: '/admin/ai-analytics/mimi-sessions',  active: false },
        { label: 'BLOCKS',    path: '/admin/ai-analytics/mimi-eligibility',    active: false },
        { label: 'HARMFUL',   path: '/admin/ai-analytics/mimi-harmful',   active: true },
    ];

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS',   onClick: () => navigate('/admin/settings/general') },
                        { label: 'OVERVIEW',      onClick: () => navigate('/admin/ai-analytics/mimi') },
                        { label: 'MIMI HARMFUL' },
                    ]}
                />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
                    <ShieldOff size={32} style={{ color: C.red, filter: `drop-shadow(0 0 8px ${C.red})`, flexShrink: 0, marginTop: 4 }} />
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.6rem', fontWeight: 800,
                            letterSpacing: '-0.02em', fontFamily: 'monospace',
                            background: `linear-gradient(135deg, ${C.red}, ${C.amber})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            HARMFUL &amp; FLAGGED
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                            HARMFUL QUERIES · FLAGGED FOR REVIEW · HARM CATEGORIES
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
                                border: `1px solid ${tab.active ? C.red + '60' : C.border}`,
                                background: tab.active ? `${C.red}15` : 'transparent',
                                color: tab.active ? C.red : C.textDim,
                                transition: 'all 150ms',
                            }}
                        >{tab.label}</button>
                    ))}
                </div>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                    {[
                        { key: 'harmful', label: 'Harmful Queries', icon: ShieldOff,     color: C.red   },
                        { key: 'flagged', label: 'Flagged Queries',  icon: AlertTriangle, color: C.amber },
                    ].map(({ key, label, icon: Icon, color }) => (
                        <button key={key}
                            onClick={() => { audio.playActivate(); setSubTab(key); }}
                            onMouseEnter={audio.playHover}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '7px 16px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                                fontFamily: 'monospace', letterSpacing: '0.06em', cursor: 'pointer',
                                border: `1px solid ${subTab === key ? color + '60' : C.border}`,
                                background: subTab === key ? `${color}15` : 'transparent',
                                color: subTab === key ? color : C.textDim,
                                transition: 'all 150ms',
                            }}>
                            <Icon size={12} /> {label}
                        </button>
                    ))}
                </div>

                {subTab === 'harmful' && <HarmfulTab audio={audio} />}
                {subTab === 'flagged' && <FlaggedTab audio={audio} />}

            </NeuralPageShell>
        </GeneralLayout>
    );
}
