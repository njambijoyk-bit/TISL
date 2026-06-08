import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Brain, Key, Puzzle, ClipboardList,
    CheckCircle, AlertCircle, Zap, Activity, ChevronRight,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

const PROVIDERS = {
    anthropic: '#a855f7',
    gemini:    '#3b82f6',
    openai:    '#10b981',
    mistral:   '#f59e0b',
    cohere:    '#06b6d4',
};

const NAV_CARDS = [
    { key: 'keys',     label: 'API KEY MANAGEMENT',   description: 'Add, activate and manage provider keys across Anthropic, Gemini and OpenAI', icon: Key,         color: '#a855f7', to: '/admin/ai-analytics/keys'    },
    { key: 'modules',  label: 'ANALYTICS MODULES',    description: 'Enable or disable AI analytics per module — projects, bookings, work and more', icon: Puzzle,      color: '#3b82f6', to: '/admin/ai-analytics/modules' },
    { key: 'sessions', label: 'SESSION LOGS',         description: 'Full accountability trail — who ran what, which key, tokens used and cost',     icon: ClipboardList, color: '#10b981', to: '/admin/ai-analytics/sessions' },
];

export default function AiAnalyticsSettings() {
    const navigate   = useNavigate();
    const audio      = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);

    const [stats,     setStats]     = useState(null);
    const [modules,   setModules]   = useState([]);
    const [activeKey, setActiveKey] = useState(null);
    const [loading,   setLoading]   = useState(true);

    useEffect(() => {
        Promise.all([
            aiAnalyticsAPI.getSessionStats().catch(() => null),
            aiAnalyticsAPI.getModules().catch(() => []),
            aiAnalyticsAPI.getKeys().catch(() => []),
        ]).then(([statsRes, modulesRes, keysRes]) => {
            setStats(statsRes);
            setModules(modulesRes);
            setActiveKey(keysRes.find(k => k.is_active) ?? null);
        }).finally(() => setLoading(false));
    }, []);

    const fmtCost = (n) => `$${Number(n ?? 0).toFixed(4)}`;
    const fmtNum  = (n) => Number(n ?? 0).toLocaleString();

    const providerColor = activeKey ? (PROVIDERS[activeKey.provider] ?? C.cyan) : C.red;

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS', onClick: () => navigate('/admin/settings/general') },
                        { label: 'AI ANALYTICS' },
                    ]}
                />

                {/* ── Page header ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
                    <Brain size={32} style={{ color: C.purple, filter: `drop-shadow(0 0 8px ${C.purple})`, flexShrink: 0, marginTop: 4 }} />
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.6rem', fontWeight: 800,
                            letterSpacing: '-0.02em', fontFamily: 'monospace',
                            background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            AI ANALYTICS
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                            NEURAL INTELLIGENCE CONTROL CENTER
                        </p>
                    </div>
                </div>
                <NeuralDivider />

                {/* ── Active key banner ── */}
                <div style={{
                    ...neuralCard,
                    margin: '24px 0',
                    padding: '14px 20px',
                    border: `1px solid ${activeKey ? `${providerColor}40` : 'rgba(239,68,68,0.3)'}`,
                    background: activeKey ? `${providerColor}08` : 'rgba(239,68,68,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: activeKey ? `0 0 20px ${providerColor}20` : 'none',
                }}>
                    {activeKey
                        ? <CheckCircle size={18} style={{ color: providerColor, flexShrink: 0, filter: `drop-shadow(0 0 6px ${providerColor})` }} />
                        : <AlertCircle size={18} style={{ color: C.red, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: activeKey ? providerColor : C.red, fontFamily: 'monospace' }}>
                            {activeKey
                                ? `▸ ACTIVE: ${activeKey.label.toUpperCase()} (${activeKey.provider.toUpperCase()})`
                                : '▸ NO ACTIVE AI KEY CONFIGURED'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: C.textDim, fontFamily: 'monospace' }}>
                            {activeKey
                                ? `LAST USED: ${activeKey.last_used_at ? new Date(activeKey.last_used_at).toLocaleDateString() : 'NEVER'}`
                                : 'GO TO API KEY MANAGEMENT TO ADD AND ACTIVATE A KEY'}
                        </p>
                    </div>
                    {/* Active pulse dot */}
                    {activeKey && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: providerColor, boxShadow: `0 0 8px ${providerColor}`, animation: 'pulse 2s ease-in-out infinite', flexShrink: 0 }} />
                    )}
                    <button
                        onClick={() => { navigate('/admin/ai-analytics/keys'); audio.playHover(); }}
                        onMouseEnter={audio.playHover}
                        style={{
                            padding: '6px 14px', borderRadius: 8,
                            border: `1px solid ${providerColor}50`,
                            background: `${providerColor}12`,
                            color: providerColor, fontSize: '0.72rem', fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0,
                            letterSpacing: '0.06em',
                        }}
                    >
                        MANAGE
                    </button>
                </div>

                {/* ── Stat strip ── */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                        {[
                            { label: 'Total Sessions', value: fmtNum(stats.total_sessions),  icon: Activity,    color: C.purple },
                            { label: 'Total Cost',     value: fmtCost(stats.total_cost),      icon: Zap,         color: C.green  },
                            { label: 'Total Tokens',   value: fmtNum(stats.total_tokens),     icon: Brain,       color: C.blue   },
                            { label: 'Failed',         value: fmtNum(stats.failed),           icon: AlertCircle, color: C.red    },
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

                {/* ── Module status strip ── */}
                {modules.length > 0 && (
                    <div style={{ ...neuralCard, marginBottom: 24, padding: '16px 20px' }}>
                        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 12px', fontFamily: 'monospace' }}>
                            MODULE STATUS
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {modules.map(mod => (
                                <div key={mod.key} style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '4px 11px', borderRadius: 20,
                                    fontSize: '0.68rem', fontWeight: 700, fontFamily: 'monospace',
                                    background: mod.is_enabled ? 'rgba(16,185,129,0.08)' : 'rgba(71,85,105,0.15)',
                                    border: `1px solid ${mod.is_enabled ? 'rgba(16,185,129,0.25)' : C.border}`,
                                    color: mod.is_enabled ? C.green : C.textDim,
                                    letterSpacing: '0.06em',
                                }}>
                                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: mod.is_enabled ? C.green : C.textDim, boxShadow: mod.is_enabled ? `0 0 4px ${C.green}` : 'none' }} />
                                    {mod.key.toUpperCase()}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Nav cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    {NAV_CARDS.map(({ key, label, description, icon: Icon, color, to }) => (
                        <button
                            key={key}
                            onClick={() => { navigate(to); audio.playHover(); }}
                            onMouseEnter={e => {
                                audio.playHover();
                                e.currentTarget.style.borderColor = color;
                                e.currentTarget.style.boxShadow = `0 0 24px ${color}25, inset 0 0 24px ${color}05`;
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = C.border;
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                            style={{
                                ...neuralCard,
                                textAlign: 'left', cursor: 'pointer',
                                fontFamily: 'inherit', padding: 20,
                                display: 'flex', flexDirection: 'column', gap: 14,
                                transition: 'all 200ms', position: 'relative', overflow: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={18} style={{ color }} />
                                </div>
                                <ChevronRight size={16} style={{ color: C.textDim }} />
                            </div>
                            <div>
                                <p style={{ margin: '0 0 5px', fontSize: '0.78rem', fontWeight: 800, color, fontFamily: 'monospace', letterSpacing: '0.08em' }}>{label}</p>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, lineHeight: 1.55 }}>{description}</p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* ── Footer ── */}
                <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: '0.65rem', color: C.textDim }}>
                    <Activity size={11} style={{ color: C.blue }} />
                    {modules.length} MODULE{modules.length !== 1 ? 'S' : ''} · {modules.filter(m => m.is_enabled).length} ENABLED
                </div>

            </NeuralPageShell>
        </GeneralLayout>
    );
}