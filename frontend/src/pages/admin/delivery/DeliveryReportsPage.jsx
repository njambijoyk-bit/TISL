import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart2, Download, RefreshCw, FileText, TrendingUp,
    Truck, AlertTriangle, Star, Calendar, Loader2, ChevronDown,
    CheckCircle, XCircle, Clock, Package, MapPin,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatCard, StatsGrid, StatusBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
} from './DeliveryShared';

// ── custom tooltip ───────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: D.card, border: `1px solid ${D.purpleBorder}`,
            borderRadius: D.radiusSm, padding: '8px 12px',
            fontSize: '0.78rem', color: D.text,
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

// ── date helpers ─────────────────────────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().split('T')[0]; }
function weekAgoISO() {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
}
function monthAgoISO() {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
}
function DriverAvatar({ name, photo, size = 32 }) {
    if (photo) {
        return (
            <img
                src={photo}
                alt={name}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
        );
    }
    const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: D.purpleDim,
            border: `1px solid ${D.purpleBorder}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700,
            color: D.purple, flexShrink: 0,
        }}>
            {initials}
        </div>
    );
}
const PIE_COLORS = [D.purple, '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#94a3b8'];

// ── PDF export helper ────────────────────────────────────────────────────────────
function generateDeliveryPDF({ overview, manifStats, reportTitle, dateRange }) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(168, 85, 247);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Delivery Report', 14, 14);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(reportTitle, 14, 21);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}  |  Range: ${dateRange || 'All time'}`, 14, 26);

    let y = 36;

    // ── Summary KPIs ──
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Executive Summary', 14, y);
    y += 2;

    const manifests  = overview?.manifests  || {};
    const deliveries = overview?.deliveries || {};
    const incidents  = overview?.incidents  || {};

    const kpiData = [
        ['Total Manifests', String(manifests.total ?? 0)],
        ['Completion Rate', `${manifests.completion_rate ?? 0}%`],
        ['On-Time Delivery', `${deliveries.on_time_rate ?? 0}%`],
        ['Open Incidents', String(incidents.open ?? 0)],
        ['Total Delivered', String(deliveries.delivered ?? 0)],
        ['Total Failed', String(deliveries.failed ?? 0)],
        ['Avg Distance', manifests.avg_distance_km ? `${manifests.avg_distance_km} km` : '—'],
        ['Avg Duration', manifests.avg_duration_mins ? `${manifests.avg_duration_mins} min` : '—'],
    ];

    doc.autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: kpiData,
        theme: 'striped',
        headStyles: { fillColor: [168, 85, 247], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: 60 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
        margin: { left: 14, right: 14 },
        styles: { cellPadding: 2, fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── Manifest Status Breakdown ──
    if (manifStats) {
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Manifest Status Breakdown', 14, y);
        y += 2;

        const statusRows = [
            ['Draft',       String(manifStats.draft ?? 0)],
            ['Dispatched',  String(manifStats.dispatched ?? 0)],
            ['In Progress', String(manifStats.in_progress ?? 0)],
            ['Completed',   String(manifStats.completed ?? 0)],
            ['Cancelled',   String(manifStats.cancelled ?? 0)],
        ];
        if (manifStats.ai_generated > 0) {
            statusRows.push(['AI-Generated', String(manifStats.ai_generated)]);
        }

        doc.autoTable({
            startY: y,
            head: [['Status', 'Count']],
            body: statusRows,
            theme: 'striped',
            headStyles: { fillColor: [168, 85, 247], textColor: 255, fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: 60 },
            margin: { left: 14, right: 14 },
            styles: { cellPadding: 2, fontSize: 9 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Failed Delivery Reasons ──
    const failedReasons = (deliveries.failed_reasons || []);
    if (failedReasons.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Failed Delivery Reasons', 14, y);
        y += 2;

        doc.autoTable({
            startY: y,
            head: [['Reason', 'Count']],
            body: failedReasons.map(r => [r.failed_reason || 'Unknown', String(r.count)]),
            theme: 'striped',
            headStyles: { fillColor: [239, 68, 68], textColor: 255, fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: 60 },
            margin: { left: 14, right: 14 },
            styles: { cellPadding: 2, fontSize: 9 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Incidents by Category ──
    const incidentsCat = (incidents.by_category || []);
    if (incidentsCat.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Incidents by Category', 14, y);
        y += 2;

        doc.autoTable({
            startY: y,
            head: [['Category', 'Count']],
            body: incidentsCat.map(r => [(r.category || 'Other').replace(/_/g, ' '), String(r.count)]),
            theme: 'striped',
            headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: 60 },
            margin: { left: 14, right: 14 },
            styles: { cellPadding: 2, fontSize: 9 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Shipment Workflows ──
    const shipments = overview?.shipments || {};
    const shipRows = [
        ['Internal',  String(shipments.internal ?? 0)],
        ['Courier',   String(shipments.external_courier ?? 0)],
        ['In-store',  String(shipments.instore ?? 0)],
    ].filter(r => r[1] !== '0');
    if (shipRows.length > 0) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Shipment Workflows', 14, y);
        y += 2;

        doc.autoTable({
            startY: y,
            head: [['Workflow Type', 'Count']],
            body: shipRows,
            theme: 'striped',
            headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: 60 },
            margin: { left: 14, right: 14 },
            styles: { cellPadding: 2, fontSize: 9 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Footer ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${totalPages}`, pageW - 30, doc.internal.pageSize.getHeight() - 8);
    }

    doc.save(`delivery-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ── report section component ─────────────────────────────────────────────────────
function ReportSection({ title, icon: Icon, children }) {
    return (
        <div style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
            <DeliveryDivider label={title} />
            {children}
        </div>
    );
}

// ── main page ────────────────────────────────────────────────────────────────────
export default function DeliveryReportsPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [overview,    setOverview]    = useState(null);
    const [manifStats,  setManifStats]  = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error,       setError]       = useState(null);

    const [dateRange, setDateRange]     = useState('all'); // all | week | month | custom
    const [fromDate,  setFromDate]      = useState(weekAgoISO());
    const [toDate,    setToDate]        = useState(todayISO());

    // Fetch data
    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const [ov, ms] = await Promise.all([
                deliveryAPI.getDeliveryOverview(),
                deliveryAPI.getManifestStatistics(),
            ]);
            setOverview(ov);
            setManifStats(ms);
        } catch {
            setError('Failed to load report data.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleDownload = () => {
        audio.playDownload();
        setDownloading(true);
        try {
            const rangeLabel = dateRange === 'week' ? 'Last 7 days'
                             : dateRange === 'month' ? 'Last 30 days'
                             : dateRange === 'custom' ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}`
                             : 'All time';
            generateDeliveryPDF({ overview, manifStats, reportTitle: 'Delivery Operations Report', dateRange: rangeLabel });
        } catch (e) {
            console.error('PDF generation failed:', e);
        } finally {
            setDownloading(false);
        }
    };

    const handleRefresh = () => { audio.playHover(); fetchAll(true); };

    // Derived
    const manifests  = overview?.manifests  || {};
    const deliveries = overview?.deliveries || {};
    const incidents  = overview?.incidents  || {};
    const shipments  = overview?.shipments  || {};

    const failedReasonsData = (deliveries.failed_reasons || []).map(r => ({
        name: r.failed_reason || 'Unknown', value: r.count,
    }));
    const incidentsCatData = (incidents.by_category || []).map(r => ({
        name: (r.category || 'Other').replace(/_/g, ' '), count: r.count,
    }));
    const shipmentPieData = [
        { name: 'Internal', value: Number(shipments.internal || 0), color: D.purple },
        { name: 'Courier',  value: Number(shipments.external_courier || 0), color: '#3b82f6' },
        { name: 'In-store', value: Number(shipments.instore || 0), color: D.teal },
    ].filter(d => d.value > 0);

    // Manifest status bar data
    const statusBarData = [
        { key: 'draft',       label: 'Draft',       color: '#94a3b8', count: manifStats?.draft ?? 0 },
        { key: 'dispatched',  label: 'Dispatched',  color: D.purple,  count: manifStats?.dispatched ?? 0 },
        { key: 'in_progress', label: 'In progress', color: '#f59e0b', count: manifStats?.in_progress ?? 0 },
        { key: 'completed',   label: 'Completed',   color: D.teal,    count: manifStats?.completed ?? 0 },
        { key: 'cancelled',   label: 'Cancelled',   color: '#ef4444', count: manifStats?.cancelled ?? 0 },
    ];
    const manifTotal = manifStats?.total || 1;

    // Driver performance table data
    const [driverPerf, setDriverPerf] = useState([]);
    useEffect(() => {
        deliveryAPI.getDriverPerformance()
            .then(res => setDriverPerf(res.data ?? res ?? []))
            .catch(() => setDriverPerf([]));
    }, []);

    if (loading) {
        return (
            <GeneralLayout>
                <DeliveryPageShell audio={audio}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 10, color: D.textMid }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                        <span style={{ fontSize: '0.9rem' }}>Loading report data…</span>
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </DeliveryPageShell>
            </GeneralLayout>
        );
    }

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[{ label: 'Delivery', onClick: () => navigate('/admin/delivery') }, { label: 'Reports' }]}
                    onHover={audio.playHover}
                />

                <DeliveryPageHeader
                    title="Delivery Reports"
                    sub="Comprehensive analytics and exportable summaries"
                    actions={
                        <>
                            <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                                <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                                Refresh
                            </DeliveryBtn>
                            <DeliveryBtn variant="primary" size="sm" onClick={handleDownload} onHover={audio.playHover} disabled={downloading}>
                                {downloading
                                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                                    : <><Download size={13} /> Export PDF</>
                                }
                            </DeliveryBtn>
                        </>
                    }
                />

                {error && (
                    <div style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: D.radiusSm, padding: '10px 14px', color: '#ef4444',
                        fontSize: '0.82rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <XCircle size={14} /> {error}
                    </div>
                )}

                {/* ── KPI Summary ── */}
                <DeliveryDivider label="Executive summary" />
                <StatsGrid cols={4}>
                    <StatCard label="Total manifests" value={manifests.total ?? '—'} sub={`${manifests.active ?? 0} active`} icon={Truck} />
                    <StatCard label="Completion rate" value={`${manifests.completion_rate ?? 0}%`} icon={CheckCircle} accent={D.teal} />
                    <StatCard label="On-time delivery" value={`${deliveries.on_time_rate ?? 0}%`} sub={`${deliveries.delivered ?? 0} of ${deliveries.total ?? 0}`} icon={TrendingUp} accent={D.teal} />
                    <StatCard label="Open incidents" value={incidents.open ?? '—'} sub={`${incidents.critical ?? 0} critical`} icon={AlertTriangle} accent={incidents.critical > 0 ? '#ef4444' : D.purple} />
                </StatsGrid>

                <StatsGrid cols={4}>
                    <StatCard label="Avg distance" value={manifests.avg_distance_km ? `${manifests.avg_distance_km} km` : '—'} sub="per manifest" icon={MapPin} />
                    <StatCard label="Avg duration" value={manifests.avg_duration_mins ? `${manifests.avg_duration_mins} min` : '—'} sub="per manifest" icon={Clock} />
                    <StatCard label="Failed stops" value={deliveries.failed ?? '—'} sub={`${deliveries.returned ?? 0} returned`} icon={XCircle} accent="#ef4444" />
                    <StatCard label="Avg stop time" value={deliveries.avg_time_per_stop ? `${deliveries.avg_time_per_stop} min` : '—'} sub="between stops" icon={Package} />
                </StatsGrid>

                {/* ── Manifest Status + Shipment Workflows ── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                    gap: 'clamp(12px, 2vw, 18px)',
                    marginBottom: 'clamp(16px, 3vw, 24px)',
                }}>
                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                            Manifest status breakdown — {manifStats?.total ?? 0} total
                        </div>
                        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1, marginBottom: 12 }}>
                            {statusBarData.map(s => {
                                const pct = (s.count / manifTotal) * 100;
                                if (pct === 0) return null;
                                return <div key={s.key} style={{ width: `${pct}%`, background: s.color, transition: 'width 0.5s' }} title={`${s.label}: ${s.count}`} />;
                            })}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                            {statusBarData.map(s => (
                                <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: D.textMid }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                                    {s.label}: <strong style={{ color: D.text }}>{s.count}</strong>
                                </span>
                            ))}
                        </div>
                        {manifStats?.ai_generated > 0 && (
                            <div style={{
                                marginTop: 12, padding: '6px 10px', borderRadius: D.radiusSm,
                                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600,
                            }}>
                                ✦ {manifStats.ai_generated} manifests were AI-generated
                            </div>
                        )}
                    </DeliveryCard>

                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                            Shipment workflows
                        </div>
                        {shipmentPieData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '24px 0', textAlign: 'center' }}>
                                No shipment data
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie data={shipmentPieData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={64} innerRadius={36} paddingAngle={3}>
                                        {shipmentPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.72rem', color: D.textMid, paddingTop: 8 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>
                </div>

                {/* ── Charts Row ── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                    gap: 'clamp(12px, 2vw, 18px)',
                    marginBottom: 'clamp(16px, 3vw, 24px)',
                }}>
                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>Failed delivery reasons</div>
                        {failedReasonsData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '24px 0', textAlign: 'center' }}>No failed deliveries</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={failedReasonsData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                                    <XAxis type="number" tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: D.textMid }} axisLine={false} tickLine={false} width={90} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={18} name="Count" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>

                    <DeliveryCard>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>Incidents by category</div>
                        {incidentsCatData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '24px 0', textAlign: 'center' }}>No incidents</div>
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
                </div>

                {/* ── Driver Performance Table ── */}
                <DeliveryDivider label="Driver performance" />
                <DeliveryCard style={{ marginBottom: 32 }}>
                    {driverPerf.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: D.textDim, textAlign: 'center', padding: '24px 0' }}>
                            No driver data available
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${D.purpleBorder}` }}>
                                        {['Driver', 'Runs', 'Delivered', 'Failed', 'On-time %', 'Avg Rating', 'Distance'].map(h => (
                                            <th key={h} style={{
                                                textAlign: 'left', padding: '8px 10px',
                                                color: D.textDim, fontWeight: 600,
                                                fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {driverPerf.map((d, i) => (
                                        <tr
                                            key={d.driver_id}
                                            style={{
                                                borderBottom: i < driverPerf.length - 1 ? `1px solid ${D.purpleBorder}` : 'none',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onClick={() => { audio.playHover(); navigate(`/admin/delivery/drivers/${d.driver_id}`); }}
                                            onMouseEnter={e => { e.currentTarget.style.background = D.purpleDim; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <td style={{ padding: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <DriverAvatar name={d.name} photo={d.profile_picture_url} size={28} />
                                                    <span style={{ fontWeight: 600, color: D.text }}>{d.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px', color: D.text }}>{d.completed_manifests ?? 0}</td>
                                            <td style={{ padding: '10px', color: D.teal }}>{d.total_delivered ?? 0}</td>
                                            <td style={{ padding: '10px', color: '#ef4444' }}>{d.total_failed ?? 0}</td>
                                            <td style={{ padding: '10px', color: (d.on_time_rate ?? 0) >= 80 ? D.teal : '#f59e0b', fontWeight: 600 }}>
                                                {d.on_time_rate ?? 0}%
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <span style={{ color: '#f59e0b' }}>
                                                    {'★'.repeat(Math.round(d.avg_rating ?? 0))}
                                                    <span style={{ color: 'var(--color-border-secondary)' }}>
                                                        {'★'.repeat(5 - Math.round(d.avg_rating ?? 0))}
                                                    </span>
                                                </span>
                                                <span style={{ color: D.textDim, marginLeft: 4, fontSize: '0.72rem' }}>
                                                    {(d.avg_rating ?? 0).toFixed(1)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px', color: D.textDim }}>{d.total_distance_km ?? 0} km</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </DeliveryCard>

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}
