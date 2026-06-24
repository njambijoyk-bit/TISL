import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Truck, Package, AlertTriangle, Star,
    Plus, RefreshCw, Map, BarChart2,
    CheckCircle, XCircle, Clock, TrendingUp,
    Loader2, Navigation, Share2, BrainCircuit,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatCard, StatsGrid, StatusBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
} from './DeliveryShared';

// ── constants ─────────────────────────────────────────────────────────────────
const INACTIVITY_MS   = 2 * 60 * 1000; // 2 minutes
const REFRESH_LABEL   = 'Last refreshed';

// ── custom tooltip for recharts ───────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background:   D.card,
            border:       `1px solid ${D.purpleBorder}`,
            borderRadius: D.radiusSm,
            padding:      '8px 12px',
            fontSize:     '0.78rem',
            color:        D.text,
        }}>
            {label && <div style={{ color: D.textMid, marginBottom: 4 }}>{label}</div>}
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.color || D.purple }}>
                    {p.name}: <strong>{p.value}</strong>
                </div>
            ))}
        </div>
    );
}

// ── manifest status mini-bar ──────────────────────────────────────────────────
function ManifestStatusBar({ data }) {
    const statuses = [
        { key: 'draft',       label: 'Draft',       color: '#94a3b8' },
        { key: 'dispatched',  label: 'Dispatched',  color: D.purple  },
        { key: 'in_progress', label: 'In progress', color: '#f59e0b' },
        { key: 'completed',   label: 'Completed',   color: D.teal    },
        { key: 'cancelled',   label: 'Cancelled',   color: '#ef4444' },
    ];

    const total = data?.total || 1;

    return (
        <div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                {statuses.map(s => {
                    const count = data?.[s.key] || 0;
                    const pct   = (count / total) * 100;
                    if (pct === 0) return null;
                    return (
                        <div
                            key={s.key}
                            style={{ width: `${pct}%`, background: s.color, transition: 'width 0.5s' }}
                            title={`${s.label}: ${count}`}
                        />
                    );
                })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
                {statuses.map(s => {
                    const count = data?.[s.key] || 0;
                    return (
                        <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: D.textMid }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                            {s.label}: <strong style={{ color: D.text }}>{count}</strong>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function DeliveryOverviewPage() {
    const navigate   = useNavigate();
    const audio      = useDeliveryAudio();

    const [overview,    setOverview]    = useState(null);
    const [manifStats,  setManifStats]  = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [error,       setError]       = useState(null);

    const inactivityTimer = useRef(null);
    const lastActivityRef = useRef(Date.now());

    // ── fetch data ────────────────────────────────────────────────────────────
    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const [ov, ms] = await Promise.all([
                deliveryAPI.getDeliveryOverview(),
                deliveryAPI.getManifestStatistics(),
            ]);
            setOverview(ov);
            setManifStats(ms);
            setLastRefresh(new Date());
        } catch (e) {
            setError('Failed to load delivery data.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // ── inactivity auto-refresh ───────────────────────────────────────────────
    const resetInactivityTimer = useCallback(() => {
        lastActivityRef.current = Date.now();
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = setTimeout(() => {
            fetchAll(true);
        }, INACTIVITY_MS);
    }, [fetchAll]);

    useEffect(() => {
        fetchAll();
        resetInactivityTimer();

        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }));

        return () => {
            clearTimeout(inactivityTimer.current);
            events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
        };
    }, [fetchAll, resetInactivityTimer]);

    const handleManualRefresh = () => {
        audio.playHover();
        fetchAll(true);
        resetInactivityTimer();
    };

    // ── derived data ──────────────────────────────────────────────────────────
    const manifests  = overview?.manifests  || {};
    const deliveries = overview?.deliveries || {};
    const incidents  = overview?.incidents  || {};
    const shipments  = overview?.shipments  || {};

    // failed reasons chart data
    const failedReasonsData = (deliveries.failed_reasons || []).map(r => ({
        name:  r.failed_reason || 'Unknown',
        value: r.count,
    }));

    // incidents by category chart data
    const incidentsCatData = (incidents.by_category || []).map(r => ({
        name:  r.category?.replace(/_/g, ' ') || 'Other',
        count: r.count,
    }));

    // shipment workflow pie
    const shipmentPieData = [
        { name: 'Internal',  value: Number(shipments.internal         || 0), color: D.purple },
        { name: 'Courier',   value: Number(shipments.external_courier || 0), color: '#3b82f6' },
        { name: 'In-store',  value: Number(shipments.instore          || 0), color: D.teal    },
    ].filter(d => d.value > 0);

    const timeStr = lastRefresh
        ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';

    // ── quick action shortcuts ────────────────────────────────────────────────
    const shortcuts = [
        { label: 'New manifest',       icon: Plus,       color: D.purple,  onClick: () => navigate('/admin/delivery/manifests/create') },
        { label: 'View manifests',     icon: Truck,      color: '#3b82f6', onClick: () => navigate('/admin/delivery/manifests') },
        { label: 'Driver performance', icon: Navigation, color: D.teal,    onClick: () => navigate('/admin/delivery/drivers') },
        { label: 'Incidents',          icon: AlertTriangle, color: '#f50b0b', onClick: () => navigate('/admin/delivery/incidents') },
        { label: 'Ratings',            icon: Star,       color: '#f59e0b', onClick: () => navigate('/admin/delivery/ratings') },
        { label: 'Reports',            icon: BarChart2,  color: '#94a3b8', onClick: () => navigate('/admin/delivery/reports') },
        { label: 'Transfer',           icon: Share2,     color: '#ee04ff', onClick: () => navigate('/admin/delivery/manifests/transfer') },
        { label: 'AI Insights',        icon: BrainCircuit,  color: '#ff6919', onClick: () => navigate('/admin/delivery/insights') },
    ];

    // ── loading state ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <GeneralLayout>
                <DeliveryPageShell audio={audio}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 10, color: D.textMid }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                        <span style={{ fontSize: '0.9rem' }}>Loading delivery overview...</span>
                    </div>
                </DeliveryPageShell>
            </GeneralLayout>
        );
    }

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>

                {/* breadcrumb */}
                <DeliveryBreadcrumb
                    items={[{ label: 'Delivery' }, { label: 'Overview' }]}
                    onHover={audio.playHover}
                />

                {/* page header */}
                <DeliveryPageHeader
                    title="Delivery overview"
                    sub="Live snapshot of your delivery operations"
                    actions={
                        <>
                            <span style={{ fontSize: '0.72rem', color: D.textDim, alignSelf: 'center' }}>
                                {REFRESH_LABEL}: {timeStr}
                            </span>
                            <DeliveryBtn
                                variant="ghost"
                                size="sm"
                                onClick={handleManualRefresh}
                                onHover={audio.playHover}
                                disabled={refreshing}
                            >
                                <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                                {refreshing ? 'Refreshing...' : 'Refresh'}
                            </DeliveryBtn>
                        </>
                    }
                />

                {/* error banner */}
                {error && (
                    <div style={{
                        background:   'rgba(239,68,68,0.1)',
                        border:       '1px solid rgba(239,68,68,0.3)',
                        borderRadius: D.radiusSm,
                        padding:      '10px 14px',
                        color:        '#ef4444',
                        fontSize:     '0.82rem',
                        marginBottom: 16,
                        display:      'flex',
                        alignItems:   'center',
                        gap:          8,
                    }}>
                        <XCircle size={14} /> {error}
                    </div>
                )}

                {/* ── quick actions ── */}
                <DeliveryDivider label="Quick actions" />
                <div style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                    gap:                 10,
                    marginBottom:        'clamp(20px, 4vw, 32px)',
                }}>
                    {shortcuts.map(s => (
                        <button
                            key={s.label}
                            onClick={() => { audio.playHover(); s.onClick(); }}
                            onMouseEnter={audio.playHover}
                            style={{
                                background:    D.card,
                                border:        `1px solid ${D.purpleBorder}`,
                                borderRadius:  D.radius,
                                padding:       'clamp(12px, 3vw, 16px) 10px',
                                cursor:        'pointer',
                                display:       'flex',
                                flexDirection: 'column',
                                alignItems:    'center',
                                gap:           8,
                                transition:    'box-shadow 0.2s, border-color 0.2s',
                                color:         D.text,
                            }}
                            onMouseOver={e => { e.currentTarget.style.boxShadow = D.purpleGlow; e.currentTarget.style.borderColor = s.color; }}
                            onMouseOut={e =>  { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = D.purpleBorder; }}
                        >
                            <div style={{
                                width:          36,
                                height:         36,
                                borderRadius:   '50%',
                                background:     `${s.color}18`,
                                display:        'flex',
                                alignItems:     'center',
                                justifyContent: 'center',
                            }}>
                                <s.icon size={17} color={s.color} />
                            </div>
                            <span style={{ fontSize: '0.74rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
                                {s.label}
                            </span>
                        </button>
                    ))}
                </div>

                {/* ── top KPI stat cards ── */}
                <DeliveryDivider label="Key metrics" />
                <StatsGrid cols={4}>
                    <StatCard
                        label="Total manifests"
                        value={manifests.total ?? '—'}
                        sub={`${manifests.active ?? 0} active right now`}
                        icon={Truck}
                    />
                    <StatCard
                        label="Completion rate"
                        value={manifests.completion_rate != null ? `${manifests.completion_rate}%` : '—'}
                        sub={`${manifests.completed ?? 0} completed`}
                        icon={CheckCircle}
                        accent={D.teal}
                    />
                    <StatCard
                        label="On-time delivery"
                        value={deliveries.on_time_rate != null ? `${deliveries.on_time_rate}%` : '—'}
                        sub={`${deliveries.delivered ?? 0} of ${deliveries.total ?? 0} stops`}
                        icon={TrendingUp}
                        accent={D.teal}
                    />
                    <StatCard
                        label="Open incidents"
                        value={incidents.open ?? '—'}
                        sub={`${incidents.critical ?? 0} critical`}
                        icon={AlertTriangle}
                        accent={incidents.critical > 0 ? '#ef4444' : D.purple}
                    />
                </StatsGrid>

                <StatsGrid cols={4}>
                    <StatCard
                        label="Avg distance"
                        value={manifests.avg_distance_km ? `${manifests.avg_distance_km} km` : '—'}
                        sub="per manifest"
                        icon={Map}
                    />
                    <StatCard
                        label="Avg duration"
                        value={manifests.avg_duration_mins ? `${manifests.avg_duration_mins} min` : '—'}
                        sub="per manifest"
                        icon={Clock}
                    />
                    <StatCard
                        label="Failed stops"
                        value={deliveries.failed ?? '—'}
                        sub={`${deliveries.returned ?? 0} returned`}
                        icon={XCircle}
                        accent="#ef4444"
                    />
                    <StatCard
                        label="Avg stop time"
                        value={deliveries.avg_time_per_stop ? `${deliveries.avg_time_per_stop} min` : '—'}
                        sub="time between stops"
                        icon={Package}
                    />
                </StatsGrid>

                {/* ── manifest status breakdown ── */}
                <DeliveryDivider label="Manifest status breakdown" />
                <DeliveryCard style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                    <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>
                            All-time manifests — {manifStats?.total ?? 0} total
                        </span>
                        {manifStats?.ai_generated > 0 && (
                            <span style={{
                                fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20,
                                background: D.purpleDim, color: D.purple, border: `1px solid ${D.purpleBorder}`,
                                fontWeight: 600,
                            }}>
                                ✦ {manifStats.ai_generated} AI-generated
                            </span>
                        )}
                    </div>
                    <ManifestStatusBar data={manifStats} />
                </DeliveryCard>

                {/* ── charts row ── */}
                <div style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                    gap:                 'clamp(12px, 2vw, 18px)',
                    marginBottom:        'clamp(16px, 3vw, 24px)',
                }}>
                    {/* failed reasons bar chart */}
                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                            Failed delivery reasons
                        </div>
                        {failedReasonsData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '24px 0', textAlign: 'center' }}>
                                No failed deliveries recorded
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={failedReasonsData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: D.textMid }} axisLine={false} tickLine={false} width={90} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="value" fill={D.purple} radius={[0, 4, 4, 0]} maxBarSize={18} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>

                    {/* incidents by category bar chart */}
                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                            Incidents by category
                        </div>
                        {incidentsCatData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '24px 0', textAlign: 'center' }}>
                                No incidents recorded
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={incidentsCatData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: D.textMid }} axisLine={false} tickLine={false} width={90} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={18} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>

                    {/* shipment workflow pie */}
                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                            Shipment workflows
                        </div>
                        {shipmentPieData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '24px 0', textAlign: 'center' }}>
                                No shipments recorded
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie
                                        data={shipmentPieData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="45%"
                                        outerRadius={64}
                                        innerRadius={36}
                                        paddingAngle={3}
                                    >
                                        {shipmentPieData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: '0.72rem', color: D.textMid, paddingTop: 8 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>
                </div>

                {/* ── active manifests quick glance ── */}
                <DeliveryDivider label="Active right now" />
                <ActiveManifestsGlance onHover={audio.playHover} navigate={navigate} />

                {/* spin keyframe */}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            </DeliveryPageShell>
        </GeneralLayout>
    );
}

// ── active manifests mini-list ────────────────────────────────────────────────
function ActiveManifestsGlance({ onHover, navigate }) {
    const [manifests, setManifests] = useState([]);
    const [loading,   setLoading]   = useState(true);

    useEffect(() => {
        deliveryAPI.getManifests({ status: 'in_progress', per_page: 5 })
            .then(res => setManifests(res.data ?? []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: D.textDim, fontSize: '0.82rem', padding: '16px 0' }}>
            <Loader2 size={14} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
            Loading active trips...
        </div>
    );

    if (manifests.length === 0) return (
        <DeliveryCard>
            <DeliveryEmptyState
                icon={Truck}
                title="No active trips"
                sub="No manifests are currently in progress"
            />
        </DeliveryCard>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {manifests.map(m => {
                const total     = m.items?.length ?? 0;
                const delivered = m.items?.filter(i => i.status === 'delivered').length ?? 0;
                const failed    = m.items?.filter(i => i.status === 'failed').length ?? 0;
                const pct       = total > 0 ? Math.round((delivered / total) * 100) : 0;

                return (
                    <DeliveryCard
                        key={m.id}
                        hoverable
                        onClick={() => navigate(`/admin/delivery/manifests/${m.id}`)}
                        style={{ padding: 'clamp(12px, 2vw, 16px)' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: '#f59e0b',
                                    boxShadow: '0 0 6px #f59e0b',
                                    flexShrink: 0,
                                    animation: 'pulse 2s ease-in-out infinite',
                                }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                                        {m.manifest_number}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: D.textDim, marginTop: 2 }}>
                                        {m.driver?.name ?? 'Unassigned'} · {total} stops
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: D.purple }}>{pct}%</div>
                                    <div style={{ fontSize: '0.68rem', color: D.textDim }}>{delivered}/{total} done</div>
                                </div>
                                <StatusBadge status="in_progress" />
                            </div>
                        </div>
                        {/* progress micro-bar */}
                        <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'var(--color-border-tertiary)', overflow: 'hidden' }}>
                            <div style={{
                                height:     '100%',
                                width:      `${pct}%`,
                                background: D.teal,
                                transition: 'width 0.5s',
                                borderRadius: 2,
                            }} />
                        </div>
                    </DeliveryCard>
                );
            })}

            <DeliveryBtn
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/delivery/manifests?status=in_progress')}
                onHover={onHover}
                style={{ alignSelf: 'flex-start' }}
            >
                View all active →
            </DeliveryBtn>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}
