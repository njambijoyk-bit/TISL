import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare, Loader2, AlertCircle, Activity,
    ShieldOff, Zap, CheckCircle, XCircle, Clock,
    TrendingUp, Users, AlertTriangle, Shield,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import mimiAPI from '../../../api/mimiAPI';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function MiniBarChart({ data, color }) {
    if (!data?.length) return null;
    const max = Math.max(...data.map(d => d.total), 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
            {data.slice(-20).map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{
                        width: '100%',
                        height: `${Math.max(4, (d.total / max) * 56)}px`,
                        background: color,
                        borderRadius: 3,
                        opacity: 0.7 + (i / data.length) * 0.3,
                        boxShadow: `0 0 4px ${color}60`,
                        transition: 'height 300ms ease',
                    }} />
                </div>
            ))}
        </div>
    );
}

// ── Age band bar ───────────────────────────────────────────────────────────────
function AgeBand({ label, value, total, color }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.7rem', color: C.textMid, fontFamily: 'monospace' }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color, fontFamily: 'monospace', fontWeight: 700 }}>{value} <span style={{ color: C.textDim }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${pct}%`,
                    background: color,
                    boxShadow: `0 0 6px ${color}`,
                    borderRadius: 2,
                    transition: 'width 600ms ease',
                }} />
            </div>
        </div>
    );
}

// ── KPI card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon: Icon, sub }) {
    return (
        <div style={{ ...neuralCard, padding: '16px 20px', border: `1px solid ${color}25` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace' }}>{label}</span>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}12`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} style={{ color }} />
                </div>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, color, lineHeight: 1, fontFamily: 'monospace' }}>{value ?? '—'}</div>
            {sub && <p style={{ margin: '6px 0 0', fontSize: '0.68rem', color: C.textDim, fontFamily: 'monospace' }}>{sub}</p>}
        </div>
    );
}

// ── Date range picker ──────────────────────────────────────────────────────────
function DateRange({ from, to, onChange }) {
    const inputStyle = {
        padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem',
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
        color: C.text, outline: 'none', fontFamily: 'monospace',
        colorScheme: 'dark',
    };
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>FROM</span>
            <input type="date" value={from} onChange={e => onChange('from', e.target.value)} style={inputStyle} />
            <span style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>TO</span>
            <input type="date" value={to} onChange={e => onChange('to', e.target.value)} style={inputStyle} />
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function MimiOverviewPage() {
    const navigate  = useNavigate();
    const audio     = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const [from, setFrom] = useState(d30);
    const [to,   setTo]   = useState(today);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await mimiAPI.getReports({ from, to });
            setData(res);
        } catch {
            setError('Failed to load Mimi analytics.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [from, to]);

    const handleDateChange = (key, val) => {
        if (key === 'from') setFrom(val);
        else setTo(val);
    };

    const t = data?.totals;
    const ageD = data?.age_distribution;
    const ageTotal = ageD
        ? Object.values(ageD).reduce((a, b) => a + (b ?? 0), 0)
        : 0;

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS',   onClick: () => navigate('/admin/settings/general') },
                        { label: 'MIMI OVERVIEW' },
                    ]}
                />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <MessageSquare size={32} style={{ color: C.purple, filter: `drop-shadow(0 0 8px ${C.purple})`, flexShrink: 0, marginTop: 4 }} />
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: '1.6rem', fontWeight: 800,
                                letterSpacing: '-0.02em', fontFamily: 'monospace',
                                background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`,
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>
                                MIMI ANALYTICS
                            </h1>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                                CHAT SESSIONS · QUERY LOGS · HARM SIGNALS · DEMOGRAPHICS
                            </p>
                        </div>
                    </div>
                    <DateRange from={from} to={to} onChange={handleDateChange} />
                </div>
                <NeuralDivider />
                {/* Info note */}
                <div style={{
                    margin: '16px 0 8px',
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.06)',
                    border: `1px solid rgba(59,130,246,0.25)`,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                }}>
                    <AlertCircle size={14} style={{ color: C.blue, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: '0.72rem', color: C.textMid, fontFamily: 'monospace', lineHeight: 1.7 }}>
                        <span style={{ color: C.text, fontWeight: 700 }}>MIMI CHATBOT</span> is the public-facing customer chatbot powered by{' '}
                        <span style={{ color: C.cyan, fontWeight: 700 }}>Google Gemini</span> — chosen for its cost-efficiency at scale.
                        Its API key is <span style={{ color: C.amber }}>hardcoded in the <code style={{ fontSize: '0.68rem' }}>.env</code> file</span> and
                        is <strong style={{ color: C.text }}>not</strong> managed through the Analytics Keys page.{' '}
                        <span style={{ color: C.textDim }}>
                            The <span style={{ color: C.purple, fontWeight: 700 }}>AI Analytics module</span> is a separate,
                            admin-only system that supports multiple providers (Anthropic, Gemini, OpenAI, Mistral, Cohere)
                            with keys managed via the Analytics Keys page. These are two distinct systems that do not overlap. Ever!
                        </span>
                    </div>
                </div>

                {/* Nav pills */}
                <div style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
                    {[
                        { label: 'OVERVIEW',  path: '/admin/ai-analytics/mimi',  active: true  },
                        { label: 'SESSIONS',  path: '/admin/ai-analytics/mimi-sessions',  active: false },
                        { label: 'BLOCKS',    path: '/admin/ai-analytics/mimi-eligibility',    active: false },
                        { label: 'HARMFUL',   path: '/admin/ai-analytics/mimi-harmful',   active: false },
                    ].map(tab => (
                        <button key={tab.label} onClick={() => { audio.playHover(); navigate(tab.path); }}
                            style={{
                                padding: '6px 14px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700,
                                fontFamily: 'monospace', letterSpacing: '0.08em', cursor: 'pointer',
                                border: `1px solid ${tab.active ? C.purple + '60' : C.border}`,
                                background: tab.active ? `${C.purple}15` : 'transparent',
                                color: tab.active ? C.purple : C.textDim,
                                transition: 'all 150ms',
                            }}
                        >{tab.label}</button>
                    ))}
                </div>

                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 20, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <AlertCircle size={15} style={{ color: C.red, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                    </div>
                )}

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
                        <Loader2 size={20} style={{ color: C.purple, animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '0.82rem', color: C.textDim, fontFamily: 'monospace', letterSpacing: '0.08em' }}>LOADING ANALYTICS…</span>
                    </div>
                ) : data && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* KPI strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                            <KpiCard label="Total Queries"    value={t?.total_queries}    color={C.blue}   icon={MessageSquare} />
                            <KpiCard label="Successful"       value={t?.successful}        color={C.green}  icon={CheckCircle}   />
                            <KpiCard label="Harmful"          value={t?.harmful}           color={C.red}    icon={ShieldOff}     />
                            <KpiCard label="Flagged"          value={t?.flagged}           color={C.amber}  icon={AlertTriangle} />
                            <KpiCard label="Rate Limited"     value={t?.rate_limited}      color={C.cyan}   icon={Zap}           sub="Gemini quota hits" />
                            <KpiCard label="API Errors"       value={t?.api_errors}        color={C.red}    icon={XCircle}       />
                            <KpiCard label="Blocked Queries"  value={t?.blocked}           color={C.purple} icon={Shield}        />
                            <KpiCard label="Avg Response"     value={t?.avg_response_ms ? `${Math.round(t.avg_response_ms)}ms` : '—'} color={C.blue} icon={Clock} />
                        </div>

                        {/* Sessions + Actor type row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                            {/* Sessions summary */}
                            <div style={{ ...neuralCard, padding: 20 }}>
                                <p style={{ margin: '0 0 14px', fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Activity size={12} style={{ color: C.blue }} /> SESSION STATS
                                </p>
                                {[
                                    { label: 'Total Sessions',    value: data.session_stats?.total_sessions,    color: C.blue   },
                                    { label: 'Customer',          value: data.session_stats?.customer_sessions, color: C.purple },
                                    { label: 'Staff',             value: data.session_stats?.staff_sessions,   color: C.cyan   },
                                    { label: 'Guest',             value: data.session_stats?.guest_sessions,   color: C.textMid},
                                    { label: 'Blocked Sessions',  value: data.session_stats?.blocked_sessions, color: C.red    },
                                    { label: 'Avg msgs/session',  value: data.session_stats?.avg_messages_per_session ? Math.round(data.session_stats.avg_messages_per_session) : '—', color: C.green },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                                        <span style={{ fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace' }}>{label}</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color, fontFamily: 'monospace' }}>{value ?? '—'}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Actor type breakdown */}
                            <div style={{ ...neuralCard, padding: 20 }}>
                                <p style={{ margin: '0 0 14px', fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Users size={12} style={{ color: C.cyan }} /> QUERIES BY ACTOR TYPE
                                </p>
                                {data.by_actor_type?.map(row => {
                                    const color = row.actor_type === 'customer' ? C.purple : row.actor_type === 'staff' ? C.cyan : C.textMid;
                                    const pct   = t?.total_queries > 0 ? Math.round((row.total / t.total_queries) * 100) : 0;
                                    return (
                                        <div key={row.actor_type} style={{ marginBottom: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                                <span style={{ fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', textTransform: 'uppercase' }}>{row.actor_type}</span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color, fontFamily: 'monospace' }}>{row.total} <span style={{ color: C.textDim }}>({pct}%)</span></span>
                                            </div>
                                            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}`, borderRadius: 3, transition: 'width 600ms ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Harm categories */}
                                {data.harm_categories?.length > 0 && (
                                    <>
                                        <p style={{ margin: '18px 0 10px', fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <ShieldOff size={12} style={{ color: C.red }} /> TOP HARM CATEGORIES
                                        </p>
                                        {data.harm_categories.map(row => (
                                            <div key={row.harm_category} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                                                <span style={{ fontSize: '0.72rem', color: C.textMid, fontFamily: 'monospace' }}>{row.harm_category}</span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: C.red, fontFamily: 'monospace' }}>{row.total}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Queries per day chart */}
                        {data.queries_per_day?.length > 0 && (
                            <div style={{ ...neuralCard, padding: 20 }}>
                                <p style={{ margin: '0 0 16px', fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <TrendingUp size={12} style={{ color: C.blue }} /> QUERIES PER DAY
                                </p>
                                <MiniBarChart data={data.queries_per_day} color={C.blue} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                                    <span style={{ fontSize: '0.62rem', color: C.textDim, fontFamily: 'monospace' }}>{data.queries_per_day[0]?.date}</span>
                                    <span style={{ fontSize: '0.62rem', color: C.textDim, fontFamily: 'monospace' }}>{data.queries_per_day[data.queries_per_day.length - 1]?.date}</span>
                                </div>
                            </div>
                        )}

                        {/* Age distribution */}
                        {ageD && ageTotal > 0 && (
                            <div style={{ ...neuralCard, padding: 20 }}>
                                <p style={{ margin: '0 0 16px', fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Users size={12} style={{ color: C.purple }} /> CUSTOMER AGE DISTRIBUTION · {ageTotal} SESSIONS
                                </p>
                                {[
                                    { label: 'Under 18',  key: 'under_18',  color: C.cyan   },
                                    { label: '18 – 24',   key: 'age_18_24', color: C.blue   },
                                    { label: '25 – 34',   key: 'age_25_34', color: C.purple },
                                    { label: '35 – 44',   key: 'age_35_44', color: C.green  },
                                    { label: '45 – 54',   key: 'age_45_54', color: C.amber  },
                                    { label: '55+',       key: 'age_55_plus',color: C.red   },
                                ].map(b => (
                                    <AgeBand key={b.key} label={b.label} value={ageD[b.key] ?? 0} total={ageTotal} color={b.color} />
                                ))}
                            </div>
                        )}

                        {/* Active blocks */}
                        {data.active_blocks?.length > 0 && (
                            <div style={{ ...neuralCard, padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Shield size={12} style={{ color: C.red }} /> ACTIVE BLOCKS
                                    </p>
                                    <button onClick={() => navigate('/admin/mimi/blocks')} onMouseEnter={audio.playHover}
                                        style={{ fontSize: '0.65rem', color: C.cyan, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', textDecoration: 'underline' }}>
                                        VIEW ALL →
                                    </button>
                                </div>
                                {data.active_blocks.map(b => (
                                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, boxShadow: `0 0 6px ${C.red}`, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: C.text }}>
                                                {b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : b.user?.name ?? b.ip_address ?? '—'}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: C.textDim, marginLeft: 8, fontFamily: 'monospace', textTransform: 'uppercase' }}>{b.actor_type}</span>
                                        </div>
                                        <span style={{ fontSize: '0.68rem', color: C.red, fontFamily: 'monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {b.reason ?? 'No reason given'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                    </div>
                )}

            </NeuralPageShell>
        </GeneralLayout>
    );
}
