import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    Brain, ChevronLeft, ChevronRight, Loader2,
    RefreshCw, User, Truck, AlertTriangle, BarChart3,
    Filter, X, Calendar, Tag, ArrowRight, ArrowUpDown,
    ChevronDown, Layers, Clock, Sparkles, ShieldCheck,
    Route, Package, TrendingUp, Eye, EyeOff, GripVertical,
    SortAsc, SortDesc, Hash, Type, Zap, CheckCircle2,
} from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import deliveryAPI from '../../../../_shared/api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, DeliveryBtn, DeliveryEmptyState,
} from './DeliveryShared';

// ═══════════════════════════════════════════════════════════════
// TAB & MODULE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const TABS = [
    { key: 'driver',   label: 'Drivers',    icon: User,    color: '#3b82f6' },
    { key: 'manifest', label: 'Manifests',  icon: Truck,   color: '#10b981' },
    { key: 'incident', label: 'Incidents',  icon: AlertTriangle, color: '#f59e0b' },
    { key: 'fleet',    label: 'Fleet Overview', icon: BarChart3, color: '#8b5cf6' },
];

// Each tab can have multiple modules — we show chips to filter/sort them
const TAB_MODULES = {
    driver: [
        { key: 'driver_performance',          label: 'Performance',      icon: TrendingUp,       desc: 'Metrics, ratings, on-time delivery' },
        { key: 'driver_assignment_safety',    label: 'Safety Check',     icon: ShieldCheck,      desc: 'Risk assessment before assignment' },
    ],
    manifest: [
        { key: 'delivery_manifest_generator', label: 'Manifest Gen',     icon: Package,          desc: 'Optimal order sequencing' },
        { key: 'delivery_route_optimiser',    label: 'Route Optimiser',  icon: Route,            desc: 'Minimize travel time & distance' },
    ],
    incident: [
        { key: 'delivery_incident_analysis',  label: 'Incident Analysis', icon: AlertTriangle,   desc: 'Patterns, trends, repeat offenders' },
    ],
    fleet: [
        { key: 'driver_performance',          label: 'Performance',      icon: TrendingUp,       desc: 'All driver performance data' },
        { key: 'driver_assignment_safety',    label: 'Safety',           icon: ShieldCheck,      desc: 'Fleet-wide safety overview' },
        { key: 'delivery_incident_analysis',  label: 'Incidents',        icon: AlertTriangle,    desc: 'Platform incident patterns' },
    ],
};

const MODULE_LABELS = {
    driver_performance: 'Performance Analysis',
    driver_assignment_safety: 'Safety Assessment',
    delivery_manifest_generator: 'Manifest Generator',
    delivery_route_optimiser: 'Route Optimiser',
    delivery_incident_analysis: 'Incident Analysis',
};

const OUTPUT_TYPE_ICONS = {
    summary: { icon: Layers, color: '#6366f1' },
    insight: { icon: Sparkles, color: '#8b5cf6' },
    risk:    { icon: AlertTriangle, color: '#ef4444' },
    recommendation: { icon: CheckCircle2, color: '#10b981' },
};

const SORT_OPTIONS = [
    { key: 'newest',      label: 'Newest first',  icon: SortDesc },
    { key: 'oldest',      label: 'Oldest first',  icon: SortAsc },
    { key: 'module',      label: 'By module',     icon: Layers },
    { key: 'output_type', label: 'By output type', icon: Type },
];

const VIEW_MODES = [
    { key: 'list',   label: 'List',   icon: Layers },
    { key: 'grouped', label: 'Grouped', icon: GripVertical },
];

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function fmtDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtRelativeTime(str) {
    if (!str) return '—';
    const diff = Date.now() - new Date(str).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return fmtDateTime(str);
}

// ═══════════════════════════════════════════════════════════════
// SIMPLE MARKDOWN RENDERER
// ═══════════════════════════════════════════════════════════════

function renderInline(text) {
    const parts = text.split(/(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} style={{ color: D.text, fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*'))
            return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
    });
}

function SimpleMarkdown({ text }) {
    if (!text) return null;
    const lines = text.split('\\n');
    return (
        <div style={{ fontSize: '0.82rem', color: D.textMid, lineHeight: 1.8 }}>
            {lines.map((line, i) => {
                if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
                if (line.startsWith('### ')) return (
                    <div key={i} style={{ fontWeight: 700, color: D.text, fontSize: '0.88rem', marginTop: 10, marginBottom: 4 }}>
                        {renderInline(line.replace(/^###\\s*/, ''))}
                    </div>
                );
                if (line.startsWith('## ')) return (
                    <div key={i} style={{ fontWeight: 700, color: D.text, fontSize: '0.95rem', marginTop: 12, marginBottom: 4 }}>
                        {renderInline(line.replace(/^##\\s*/, ''))}
                    </div>
                );
                if (line.match(/^[-*]\\s/)) return (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: 8 }}>
                        <span style={{ color: D.purple, flexShrink: 0 }}>•</span>
                        <span>{renderInline(line.replace(/^[-*]\\s/, ''))}</span>
                    </div>
                );
                if (line.match(/^\\d+\\.\\s/)) return (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: 8 }}>
                        <span style={{ color: D.purple, flexShrink: 0, fontWeight: 600, minWidth: 18 }}>
                            {line.match(/^\\d+/)[0]}.
                        </span>
                        <span>{renderInline(line.replace(/^\\d+\\.\\s/, ''))}</span>
                    </div>
                );
                return <div key={i} style={{ marginBottom: 4 }}>{renderInline(line)}</div>;
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MODULE CHIP BAR (within each tab)
// ═══════════════════════════════════════════════════════════════

function ModuleChipBar({ tabKey, selectedModules, onToggle, onSelectAll, onClearAll, audio }) {
    const modules = TAB_MODULES[tabKey] || [];
    if (modules.length <= 1) return null;

    const allSelected = selectedModules.length === modules.length;
    const someSelected = selectedModules.length > 0 && !allSelected;

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                flexWrap: 'wrap',
            }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Modules
                </span>
                <div style={{ flex: 1, height: 1, background: D.purpleBorder, opacity: 0.5 }} />
                <button
                    onClick={() => { audio.playHover(); allSelected ? onClearAll() : onSelectAll(); }}
                    style={{
                        fontSize: '0.7rem', color: D.purple, background: 'none', border: 'none',
                        cursor: 'pointer', fontWeight: 500,
                    }}
                    onMouseEnter={audio.playHover}
                >
                    {allSelected ? 'Clear all' : 'Select all'}
                </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {modules.map(mod => {
                    const isSelected = selectedModules.includes(mod.key);
                    const Icon = mod.icon;
                    return (
                        <button
                            key={mod.key}
                            onClick={() => { audio.playHover(); onToggle(mod.key); }}
                            onMouseEnter={audio.playHover}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: D.radiusSm,
                                border: `1.5px solid ${isSelected ? mod.color : D.purpleBorder}`,
                                background: isSelected ? `${mod.color}15` : 'transparent',
                                color: isSelected ? mod.color : D.textDim,
                                fontSize: '0.78rem', fontWeight: isSelected ? 600 : 400,
                                cursor: 'pointer', transition: 'all 0.15s',
                                position: 'relative',
                            }}
                        >
                            <Icon size={13} />
                            {mod.label}
                            {isSelected && (
                                <span style={{
                                    width: 14, height: 14, borderRadius: '50%',
                                    background: mod.color, color: '#fff',
                                    fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700,
                                }}>✓</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SORT & VIEW CONTROLS
// ═══════════════════════════════════════════════════════════════

function SortViewBar({ sortBy, onSortChange, viewMode, onViewModeChange, resultCount, audio }) {
    const [showSortMenu, setShowSortMenu] = useState(false);
    const currentSort = SORT_OPTIONS.find(s => s.key === sortBy) || SORT_OPTIONS[0];
    const SortIcon = currentSort.icon;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10, marginBottom: 16, padding: '10px 14px',
            background: D.purpleDim, borderRadius: D.radiusSm,
            border: `1px solid ${D.purpleBorder}`,
        }}>
            <span style={{ fontSize: '0.78rem', color: D.textDim, fontWeight: 500 }}>
                {resultCount} insight{resultCount !== 1 ? 's' : ''}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Sort dropdown */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => { audio.playHover(); setShowSortMenu(v => !v); }}
                        onMouseEnter={audio.playHover}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: D.radiusSm,
                            border: `1px solid ${D.purpleBorder}`,
                            background: 'transparent', color: D.textMid,
                            fontSize: '0.75rem', cursor: 'pointer',
                        }}
                    >
                        <ArrowUpDown size={12} />
                        <SortIcon size={12} />
                        {currentSort.label}
                        <ChevronDown size={11} />
                    </button>
                    {showSortMenu && (
                        <>
                            <div
                                style={{
                                    position: 'fixed', inset: 0, zIndex: 40,
                                }}
                                onClick={() => setShowSortMenu(false)}
                            />
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                                background: D.cardBg || '#fff',
                                border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                                minWidth: 180, overflow: 'hidden',
                            }}>
                                {SORT_OPTIONS.map(opt => {
                                    const OIcon = opt.icon;
                                    const active = opt.key === sortBy;
                                    return (
                                        <button
                                            key={opt.key}
                                            onClick={() => { audio.playHover(); onSortChange(opt.key); setShowSortMenu(false); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                width: '100%', padding: '8px 12px',
                                                border: 'none', background: active ? D.purpleDim : 'transparent',
                                                color: active ? D.purple : D.textMid,
                                                fontSize: '0.78rem', cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                            onMouseEnter={audio.playHover}
                                        >
                                            <OIcon size={13} />
                                            {opt.label}
                                            {active && <span style={{ marginLeft: 'auto', color: D.purple }}>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* View mode toggle */}
                <div style={{
                    display: 'flex', borderRadius: D.radiusSm,
                    border: `1px solid ${D.purpleBorder}`, overflow: 'hidden',
                }}>
                    {VIEW_MODES.map(vm => {
                        const VMIcon = vm.icon;
                        const active = vm.key === viewMode;
                        return (
                            <button
                                key={vm.key}
                                onClick={() => { audio.playHover(); onViewModeChange(vm.key); }}
                                onMouseEnter={audio.playHover}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '5px 10px', border: 'none',
                                    background: active ? D.purpleDim : 'transparent',
                                    color: active ? D.purple : D.textDim,
                                    fontSize: '0.72rem', cursor: 'pointer',
                                }}
                                title={vm.label}
                            >
                                <VMIcon size={12} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// INSIGHT CARD
// ═══════════════════════════════════════════════════════════════

function InsightCard({ insight, entityType, onEntityClick, onHover, compact = false }) {
    const session = insight.session ?? {};
    const moduleKey = session.module_key;
    const moduleLabel = MODULE_LABELS[moduleKey] ?? moduleKey ?? 'Analysis';
    const moduleInfo = Object.values(TAB_MODULES).flat().find(m => m.key === moduleKey);
    const moduleColor = moduleInfo?.color || D.purple;
    const moduleIcon = moduleInfo?.icon || Brain;
    const ModIcon = moduleIcon;

    const createdAt = fmtDateTime(session.created_at ?? insight.created_at);
    const relativeAt = fmtRelativeTime(session.created_at ?? insight.created_at);
    const content = insight.content ?? '';
    const [expanded, setExpanded] = useState(false);

    const entityName = insight.entity_name
        ?? (insight.entity_type === 'driver' ? `Driver #${insight.entity_id}`
        : insight.entity_type === 'manifest' ? `Manifest #${insight.entity_id}`
        : insight.entity_type === 'incident' ? `Incident #${insight.entity_id}`
        : `Entity #${insight.entity_id}`);

    const isLong = content.length > 400;
    const outType = insight.output_type ?? 'insight';
    const outMeta = OUTPUT_TYPE_ICONS[outType] || OUTPUT_TYPE_ICONS.insight;
    const OutIcon = outMeta.icon;

    return (
        <DeliveryCard style={{ marginBottom: 10, transition: 'all 0.2s' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                gap: 12, marginBottom: 12, flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: D.radiusSm,
                        background: `${moduleColor}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <ModIcon size={16} color={moduleColor} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                            {moduleLabel}
                        </div>
                        <div style={{
                            fontSize: '0.72rem', color: D.textDim, display: 'flex',
                            alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2,
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Clock size={10} /> {relativeAt}
                            </span>
                            {insight.entity_id && entityType !== 'fleet' && (
                                <span
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        cursor: onEntityClick ? 'pointer' : 'default',
                                        color: onEntityClick ? D.purple : D.textDim,
                                    }}
                                    onClick={() => onEntityClick?.(insight.entity_id)}
                                    onMouseEnter={onEntityClick ? onHover : undefined}
                                >
                                    <Tag size={10} /> {entityName}
                                </span>
                            )}
                            {session.model_used && (
                                <span style={{ color: D.textDim, opacity: 0.7 }}>
                                    · {session.model_used}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Output type badge */}
                    <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                        padding: '3px 8px', borderRadius: 12,
                        background: `${outMeta.color}15`, color: outMeta.color,
                        border: `1px solid ${outMeta.color}30`,
                    }}>
                        <OutIcon size={10} />
                        {outType}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div style={{
                maxHeight: expanded ? 'none' : 280,
                overflow: 'hidden',
                position: 'relative',
                maskImage: expanded ? 'none' : 'linear-gradient(to bottom, black 80%, transparent 100%)',
                WebkitMaskImage: expanded ? 'none' : 'linear-gradient(to bottom, black 80%, transparent 100%)',
            }}>
                <SimpleMarkdown text={content} />
            </div>

            {/* Expand / Collapse */}
            {isLong && (
                <DeliveryBtn
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(!expanded)}
                    onHover={onHover}
                    style={{ marginTop: 8, fontSize: '0.72rem' }}
                >
                    {expanded ? 'Show less' : 'Read more'}
                    <ArrowRight size={11} style={{
                        transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)',
                        transition: 'transform 0.2s',
                    }} />
                </DeliveryBtn>
            )}
        </DeliveryCard>
    );
}

// ═══════════════════════════════════════════════════════════════
// GROUPED MODULE SECTION
// ═══════════════════════════════════════════════════════════════

function GroupedInsights({ insights, entityType, onEntityClick, onHover, selectedModules, audio }) {
    // Group by module key
    const grouped = useMemo(() => {
        const g = {};
        insights.forEach(ins => {
            const mk = ins.session?.module_key || 'unknown';
            if (!g[mk]) g[mk] = [];
            g[mk].push(ins);
        });
        return g;
    }, [insights]);

    const moduleKeys = Object.keys(grouped).sort((a, b) => {
        const orderA = selectedModules.indexOf(a);
        const orderB = selectedModules.indexOf(b);
        if (orderA !== -1 && orderB !== -1) return orderA - orderB;
        if (orderA !== -1) return -1;
        if (orderB !== -1) return 1;
        return a.localeCompare(b);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {moduleKeys.map(mk => {
                const modInfo = Object.values(TAB_MODULES).flat().find(m => m.key === mk);
                const label = MODULE_LABELS[mk] || mk;
                const color = modInfo?.color || D.purple;
                const MIcon = modInfo?.icon || Brain;
                const items = grouped[mk];

                return (
                    <div key={mk}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            marginBottom: 10, paddingBottom: 8,
                            borderBottom: `2px solid ${color}30`,
                        }}>
                            <MIcon size={16} color={color} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>
                                {label}
                            </span>
                            <span style={{
                                fontSize: '0.7rem', color: D.textDim,
                                background: `${color}15`, padding: '2px 8px',
                                borderRadius: 10, marginLeft: 'auto',
                            }}>
                                {items.length}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {items.map(insight => (
                                <InsightCard
                                    key={insight.id}
                                    insight={insight}
                                    entityType={entityType}
                                    onEntityClick={entityType === 'fleet' ? onEntityClick : null}
                                    onHover={onHover}
                                    compact
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════

function Pagination({ meta, onPage, onHover }) {
    if (!meta || meta.last_page <= 1) return null;
    const { current_page, last_page, from, to, total } = meta;

    const pages = [];
    let start = Math.max(1, current_page - 2);
    let end = Math.min(last_page, current_page + 2);
    if (start > 1) pages.push('..start');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < last_page) pages.push('..end');

    const btnStyle = (active, disabled) => ({
        padding: '5px 10px', borderRadius: D.radiusSm,
        border: `1px solid ${active ? D.purple : D.purpleBorder}`,
        background: active ? D.purpleDim : 'transparent',
        color: active ? D.purple : D.textMid,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '0.78rem', fontWeight: active ? 700 : 400,
        opacity: disabled ? 0.4 : 1,
    });

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10, marginTop: 20, paddingTop: 16,
            borderTop: `1px solid ${D.purpleBorder}`,
        }}>
            <span style={{ fontSize: '0.75rem', color: D.textDim }}>
                {from}–{to} of {total} insights
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                    style={btnStyle(false, current_page === 1)}
                    disabled={current_page === 1}
                    onClick={() => { onHover(); onPage(current_page - 1); }}
                >
                    <ChevronLeft size={14} />
                </button>
                {pages.map((p, i) =>
                    typeof p === 'number' ? (
                        <button
                            key={p}
                            style={btnStyle(p === current_page, false)}
                            onClick={() => { onHover(); onPage(p); }}
                        >
                            {p}
                        </button>
                    ) : (
                        <span key={p + i} style={{ padding: '5px 4px', color: D.textDim, fontSize: '0.78rem' }}>…</span>
                    )
                )}
                <button
                    style={btnStyle(false, current_page === last_page)}
                    disabled={current_page === last_page}
                    onClick={() => { onHover(); onPage(current_page + 1); }}
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function DeliveryInsightsPage() {
    const navigate = useNavigate();
    const { entityType: urlEntityType, entityId: urlEntityId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const audio = useDeliveryAudio();

    const [activeTab, setActiveTab] = useState(urlEntityType ?? 'fleet');
    const [insights, setInsights] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);

    // ── Module filter state (per tab, persisted in URL) ──
    const defaultModulesForTab = (tab) => TAB_MODULES[tab]?.map(m => m.key) || [];
    const [selectedModules, setSelectedModules] = useState(() => {
        const fromUrl = searchParams.get('modules');
        if (fromUrl) return fromUrl.split(',').filter(Boolean);
        return defaultModulesForTab(urlEntityType ?? 'fleet');
    });

    // ── Sort & view state ──
    const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
    const [viewMode, setViewMode] = useState(searchParams.get('view') || 'list');

    // Sync tab from URL
    useEffect(() => {
        if (urlEntityType && TABS.find(t => t.key === urlEntityType)) {
            setActiveTab(urlEntityType);
        }
    }, [urlEntityType]);

    // Reset module selection when tab changes
    useEffect(() => {
        const tabModules = defaultModulesForTab(activeTab);
        setSelectedModules(tabModules);
        setPage(1);
    }, [activeTab]);

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams();
        const tabDefaults = defaultModulesForTab(activeTab);
        const hasAll = selectedModules.length === tabDefaults.length &&
            selectedModules.every(m => tabDefaults.includes(m));
        if (!hasAll && selectedModules.length > 0) {
            params.set('modules', selectedModules.join(','));
        }
        if (sortBy !== 'newest') params.set('sort', sortBy);
        if (viewMode !== 'list') params.set('view', viewMode);
        setSearchParams(params, { replace: true });
    }, [selectedModules, sortBy, viewMode, activeTab]);

    // ── Sort & filter insights client-side ──
    const processedInsights = useMemo(() => {
        let data = [...insights];

        // Filter by selected modules
        if (selectedModules.length > 0) {
            data = data.filter(ins => selectedModules.includes(ins.session?.module_key));
        }

        // Sort
        switch (sortBy) {
            case 'newest':
                data.sort((a, b) => new Date(b.session?.created_at || b.created_at) - new Date(a.session?.created_at || a.created_at));
                break;
            case 'oldest':
                data.sort((a, b) => new Date(a.session?.created_at || a.created_at) - new Date(b.session?.created_at || b.created_at));
                break;
            case 'module':
                data.sort((a, b) => (a.session?.module_key || '').localeCompare(b.session?.module_key || ''));
                break;
            case 'output_type':
                data.sort((a, b) => (a.output_type || '').localeCompare(b.output_type || ''));
                break;
        }

        return data;
    }, [insights, selectedModules, sortBy]);

    const fetchInsights = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);

        try {
            const res = await deliveryAPI.getDeliveryInsights(
                activeTab,
                activeTab === 'fleet' ? null : urlEntityId,
                { page, per_page: 20 } // fetch more since we filter client-side
            );
            setInsights(res.insights?.data ?? res.data ?? []);
            setMeta(res.insights ?? res.meta ?? null);
        } catch (err) {
            console.error('Failed to load insights:', err);
            setError('Failed to load AI insights. Please try again.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab, urlEntityId, page]);

    useEffect(() => {
        setPage(1);
        fetchInsights();
    }, [activeTab, urlEntityId]);

    useEffect(() => { fetchInsights(); }, [page]);

    // ── Module filter handlers ──
    const toggleModule = (modKey) => {
        setSelectedModules(prev => {
            const has = prev.includes(modKey);
            if (has) {
                // Don't allow deselecting the last one
                if (prev.length === 1) return prev;
                return prev.filter(m => m !== modKey);
            }
            return [...prev, modKey];
        });
    };

    const selectAllModules = () => {
        setSelectedModules(defaultModulesForTab(activeTab));
    };

    const clearAllModules = () => {
        // Keep at least one
        const defaults = defaultModulesForTab(activeTab);
        setSelectedModules(defaults.slice(0, 1));
    };

    // ── Tab change ──
    const handleTabChange = (tabKey) => {
        audio.playHover();
        setActiveTab(tabKey);
        if (tabKey === 'fleet') {
            navigate('/admin/delivery/insights');
        } else if (urlEntityId) {
            navigate(`/admin/delivery/insights/${tabKey}/${urlEntityId}`);
        } else {
            navigate(`/admin/delivery/insights/${tabKey}`);
        }
    };

    const handleEntityClick = (id) => {
        const path = activeTab === 'driver' ? `/admin/delivery/drivers/${id}`
            : activeTab === 'manifest' ? `/admin/delivery/manifests/${id}`
            : activeTab === 'incident' ? `/admin/delivery/incidents/${id}`
            : '#';
        navigate(path);
    };

    const handleRefresh = () => {
        audio.playHover();
        fetchInsights(true);
    };

    // Breadcrumb
    const breadcrumbItems = [{ label: 'Delivery', onClick: () => navigate('/admin/delivery') }];
    if (urlEntityType && urlEntityId) {
        const label = urlEntityType === 'driver' ? 'Drivers'
            : urlEntityType === 'manifest' ? 'Manifests'
            : 'Incidents';
        breadcrumbItems.push({
            label,
            onClick: () => navigate(`/admin/delivery/${urlEntityType}s`)
        });
        breadcrumbItems.push({ label: `#${urlEntityId}` });
    }
    breadcrumbItems.push({ label: 'AI Insights' });

    const tabInfo = TABS.find(t => t.key === activeTab);

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb items={breadcrumbItems} onHover={audio.playHover} />

                <DeliveryPageHeader
                    title="Delivery AI Insights"
                    sub="AI-generated analysis for logistics operations"
                    actions={
                        <DeliveryBtn
                            variant="ghost"
                            size="sm"
                            onClick={handleRefresh}
                            onHover={audio.playHover}
                            disabled={refreshing}
                        >
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                            Refresh
                        </DeliveryBtn>
                    }
                />

                {/* ═══════════════════════════════════════════
                    TABS
                ═══════════════════════════════════════════ */}
                <div style={{
                    display: 'flex', gap: 4,
                    marginBottom: 'clamp(16px, 3vw, 20px)',
                    borderBottom: `1px solid ${D.purpleBorder}`,
                    paddingBottom: 1,
                    overflowX: 'auto',
                }}>
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleTabChange(tab.key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: `${D.radiusSm} ${D.radiusSm} 0 0`,
                                    border: 'none', borderBottom: `2px solid ${isActive ? tab.color : 'transparent'}`,
                                    background: isActive ? `${tab.color}12` : 'transparent',
                                    color: isActive ? tab.color : D.textDim,
                                    fontSize: '0.82rem', fontWeight: isActive ? 600 : 400,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    marginBottom: -1, whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={audio.playHover}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* ═══════════════════════════════════════════
                    MODULE FILTER CHIPS
                ═══════════════════════════════════════════ */}
                <ModuleChipBar
                    tabKey={activeTab}
                    selectedModules={selectedModules}
                    onToggle={toggleModule}
                    onSelectAll={selectAllModules}
                    onClearAll={clearAllModules}
                    audio={audio}
                />

                {/* ═══════════════════════════════════════════
                    ENTITY FILTER INDICATOR
                ═══════════════════════════════════════════ */}
                {urlEntityId && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: D.radiusSm,
                        background: `${tabInfo?.color || D.purple}10`,
                        border: `1px solid ${tabInfo?.color || D.purple}30`,
                        marginBottom: 16, fontSize: '0.78rem', color: tabInfo?.color || D.purple,
                    }}>
                        <Filter size={12} />
                        Showing insights for {activeTab} #{urlEntityId}
                        <button
                            onClick={() => navigate(`/admin/delivery/insights/${activeTab}`)}
                            style={{
                                marginLeft: 'auto', display: 'flex', alignItems: 'center',
                                background: 'none', border: 'none', color: tabInfo?.color || D.purple,
                                cursor: 'pointer', fontSize: '0.72rem', gap: 4,
                            }}
                        >
                            <X size={12} /> Clear filter
                        </button>
                    </div>
                )}

                {/* ═══════════════════════════════════════════
                    SORT & VIEW BAR
                ═══════════════════════════════════════════ */}
                {!loading && !error && processedInsights.length > 0 && (
                    <SortViewBar
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        resultCount={processedInsights.length}
                        audio={audio}
                    />
                )}

                {/* ═══════════════════════════════════════════
                    CONTENT
                ═══════════════════════════════════════════ */}
                {loading ? (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 10, padding: '40px 0', color: D.textDim,
                    }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading insights…</span>
                    </div>
                ) : error ? (
                    <DeliveryCard>
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#ef4444', fontSize: '0.9rem' }}>
                            {error}
                            <br /><br />
                            <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover}>
                                <RefreshCw size={13} /> Retry
                            </DeliveryBtn>
                        </div>
                    </DeliveryCard>
                ) : processedInsights.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState
                            icon={Brain}
                            title="No insights match your filters"
                            sub={insights.length > 0
                                ? `You have ${insights.length} total insight${insights.length !== 1 ? 's' : ''}, but none match the selected modules. Try adjusting your filters above.`
                                : `No AI analysis has been generated for ${activeTab === 'fleet' ? 'the fleet' : 'this ' + activeTab}. Run an analysis from the relevant page to see results here.`
                            }
                            action={activeTab === 'driver' && !urlEntityId ? (
                                <DeliveryBtn
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => navigate('/admin/delivery/drivers')}
                                    onHover={audio.playHover}
                                >
                                    Browse Drivers
                                </DeliveryBtn>
                            ) : null}
                        />
                    </DeliveryCard>
                ) : viewMode === 'grouped' ? (
                    <>
                        <GroupedInsights
                            insights={processedInsights}
                            entityType={activeTab}
                            onEntityClick={activeTab === 'fleet' ? handleEntityClick : null}
                            onHover={audio.playHover}
                            selectedModules={selectedModules}
                            audio={audio}
                        />
                        <Pagination
                            meta={meta}
                            onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            onHover={audio.playHover}
                        />
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {processedInsights.map(insight => (
                                <InsightCard
                                    key={insight.id}
                                    insight={insight}
                                    entityType={activeTab}
                                    onEntityClick={activeTab === 'fleet' ? handleEntityClick : null}
                                    onHover={audio.playHover}
                                />
                            ))}
                        </div>
                        <Pagination
                            meta={meta}
                            onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            onHover={audio.playHover}
                        />
                    </>
                )}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}