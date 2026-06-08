import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Puzzle, Loader2,
    Brain, ShoppingCart, FolderKanban, Calendar, BarChart3,
    Users, Package, Zap, AlertCircle, Activity,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── Module icon map ───────────────────────────────────────────────────────────
const MODULE_ICONS = {
    orders:    { icon: ShoppingCart, color: '#a855f7' },
    projects:  { icon: FolderKanban, color: '#3b82f6' },
    bookings:  { icon: Calendar,     color: '#10b981' },
    reports:   { icon: BarChart3,    color: '#f59e0b' },
    customers: { icon: Users,        color: '#06b6d4' },
    inventory: { icon: Package,      color: '#8b5cf6' },
    work:      { icon: Zap,          color: '#ec4899' },
};

const getModuleMeta = (key) =>
    MODULE_ICONS[key] ?? { icon: Brain, color: '#6b7280' };

// ── Neural toggle switch ──────────────────────────────────────────────────────
function NeuralToggle({ checked, onChange, loading, color }) {
    const activeColor = color || C.purple;
    return (
        <button
            onClick={onChange}
            disabled={loading}
            onMouseEnter={e => {
                if (!loading) e.currentTarget.style.boxShadow = `0 0 10px ${activeColor}50`;
            }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            style={{
                position: 'relative',
                width: 44, height: 24,
                borderRadius: 12,
                border: `1px solid ${checked ? `${activeColor}60` : C.border}`,
                background: checked ? `${activeColor}30` : 'rgba(255,255,255,0.04)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 220ms ease',
                flexShrink: 0,
                opacity: loading ? 0.6 : 1,
                padding: 0,
            }}
        >
            {/* Track glow when on */}
            {checked && (
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: 12,
                    background: `${activeColor}15`,
                    boxShadow: `inset 0 0 8px ${activeColor}30`,
                }} />
            )}
            <span style={{
                position: 'absolute',
                top: 3,
                left: checked ? 22 : 3,
                width: 16, height: 16,
                borderRadius: '50%',
                background: checked ? activeColor : 'rgba(148,163,184,0.6)',
                boxShadow: checked ? `0 0 8px ${activeColor}` : 'none',
                transition: 'all 220ms ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {loading && (
                    <Loader2 size={9} style={{ color: '#fff', animation: 'spin 0.8s linear infinite' }} />
                )}
            </span>
        </button>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AiModulesPage() {
    const navigate   = useNavigate();
    const audio      = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);

    const [modules,  setModules]  = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [toggling, setToggling] = useState(null);
    const [error,    setError]    = useState(null);
    const [flashId,  setFlashId]  = useState(null);

    const load = async () => {
        try {
            const data = await aiAnalyticsAPI.getModules();
            setModules(data);
        } catch {
            setError('Failed to load modules.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleToggle = async (mod) => {
        setToggling(mod.id);
        try {
            const res = await aiAnalyticsAPI.toggleModule(mod.id);
            setModules(prev =>
                prev.map(m => m.id === mod.id ? { ...m, is_enabled: res.is_enabled } : m)
            );
            setFlashId(mod.id);
            res.is_enabled ? audio.playActivate() : audio.playDelete();
            setTimeout(() => setFlashId(null), 1200);
        } catch {
            setError('Failed to toggle module.');
            audio.playError();
        } finally {
            setToggling(null);
        }
    };

    const enabledCount  = modules.filter(m => m.is_enabled).length;
    const disabledCount = modules.length - enabledCount;

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS',    onClick: () => navigate('/admin/settings/general') },
                        { label: 'AI ANALYTICS',  onClick: () => navigate('/admin/ai-analytics') },
                        { label: 'MODULES' },
                    ]}
                />

                {/* ── Page header ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
                    <Puzzle size={32} style={{ color: C.blue, filter: `drop-shadow(0 0 8px ${C.blue})`, flexShrink: 0, marginTop: 4 }} />
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.6rem', fontWeight: 800,
                            letterSpacing: '-0.02em', fontFamily: 'monospace',
                            background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            ANALYTICS MODULES
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                            ENABLE · DISABLE · CONTROL TOKEN SPEND PER MODULE
                        </p>
                    </div>
                </div>
                <NeuralDivider />

                {/* ── Summary stat strip ── */}
                {!loading && modules.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '24px 0' }}>
                        {[
                            { label: 'Total Modules', value: modules.length,  color: C.blue   },
                            { label: 'Enabled',       value: enabledCount,    color: C.green  },
                            { label: 'Disabled',      value: disabledCount,   color: C.textDim },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ ...neuralCard, padding: '14px 18px', border: `1px solid ${color}25` }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace' }}>{label}</span>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
                                </div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1, fontFamily: 'monospace' }}>{value}</div>
                            </div>
                        ))}
                    </div>
                )}

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

                {/* ── Loading ── */}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
                        <Loader2 size={20} style={{ color: C.blue, animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '0.82rem', color: C.textDim, fontFamily: 'monospace', letterSpacing: '0.08em' }}>LOADING MODULES…</span>
                    </div>

                ) : modules.length === 0 ? (
                    <div style={{ ...neuralCard, padding: 48, textAlign: 'center' }}>
                        <Puzzle size={36} style={{ color: C.textDim, margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: C.textDim, margin: 0, fontFamily: 'monospace' }}>
                            NO MODULES FOUND — SEED THE <code style={{ color: C.cyan }}>ai_analytics_modules</code> TABLE TO GET STARTED.
                        </p>
                    </div>

                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {modules.map((mod, idx) => {
                            const { icon: Icon, color } = getModuleMeta(mod.key);
                            const isToggling = toggling === mod.id;
                            const isFlashing = flashId === mod.id;

                            return (
                                <div
                                    key={mod.id}
                                    style={{
                                        ...neuralCard,
                                        padding: '18px 20px',
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        animation: isFlashing
                                            ? 'flashBorder 1.2s ease'
                                            : `fadeSlideIn 0.25s ease both`,
                                        animationDelay: isFlashing ? '0ms' : `${idx * 40}ms`,
                                        transition: 'border-color 200ms, box-shadow 200ms',
                                        borderColor: mod.is_enabled ? `${color}35` : C.border,
                                        boxShadow: mod.is_enabled ? `0 0 16px ${color}12` : 'none',
                                    }}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        width: 42, height: 42, borderRadius: 11,
                                        background: `${color}12`,
                                        border: `1px solid ${color}30`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0,
                                        boxShadow: mod.is_enabled ? `0 0 12px ${color}25` : 'none',
                                    }}>
                                        <Icon size={18} style={{ color, filter: mod.is_enabled ? `drop-shadow(0 0 4px ${color})` : 'none' }} />
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
                                                {mod.label}
                                            </span>
                                            {/* Tech key badge */}
                                            <span style={{
                                                fontSize: '0.58rem', fontFamily: 'monospace', fontWeight: 700,
                                                padding: '2px 7px', borderRadius: 4,
                                                background: `${color}10`,
                                                border: `1px solid ${color}25`,
                                                color: color,
                                                letterSpacing: '0.08em',
                                            }}>
                                                {mod.key.toUpperCase()}
                                            </span>
                                        </div>
                                        {mod.description && (
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, lineHeight: 1.5 }}>
                                                {mod.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Status pill */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '4px 11px', borderRadius: 20,
                                        background: mod.is_enabled ? `${color}10` : 'rgba(71,85,105,0.15)',
                                        border: `1px solid ${mod.is_enabled ? `${color}25` : C.border}`,
                                        flexShrink: 0,
                                    }}>
                                        <div style={{
                                            width: 5, height: 5, borderRadius: '50%',
                                            background: mod.is_enabled ? color : C.textDim,
                                            boxShadow: mod.is_enabled ? `0 0 4px ${color}` : 'none',
                                            animation: mod.is_enabled ? 'pulse 2s ease-in-out infinite' : 'none',
                                        }} />
                                        <span style={{
                                            fontSize: '0.63rem', fontWeight: 700,
                                            color: mod.is_enabled ? color : C.textDim,
                                            letterSpacing: '0.08em', textTransform: 'uppercase',
                                            fontFamily: 'monospace',
                                        }}>
                                            {mod.is_enabled ? 'ON' : 'OFF'}
                                        </span>
                                    </div>

                                    {/* Toggle */}
                                    <NeuralToggle
                                        checked={mod.is_enabled}
                                        onChange={() => { handleToggle(mod); audio.playHover(); }}
                                        loading={isToggling}
                                        color={color}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Footer ── */}
                {!loading && modules.length > 0 && (
                    <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: '0.65rem', color: C.textDim }}>
                            <Activity size={11} style={{ color: C.blue }} />
                            {modules.length} MODULE{modules.length !== 1 ? 'S' : ''} · {enabledCount} ENABLED
                        </div>
                        <p style={{ margin: 0, fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>
                            DISABLED MODULES SKIP AI CALLS — ZERO TOKENS CONSUMED
                        </p>
                    </div>
                )}

            </NeuralPageShell>
        </GeneralLayout>
    );
}