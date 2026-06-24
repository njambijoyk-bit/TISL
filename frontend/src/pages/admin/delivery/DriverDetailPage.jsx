import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Navigation, Star, TrendingUp, CheckCircle, XCircle,
    Clock, Truck, Calendar, ArrowLeft, Phone, Mail,
    Loader2, Award, AlertTriangle, MapPin, BarChart2,
    RefreshCw, Package, Route, Shield, ChevronRight,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatCard, StatsGrid, StatusBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    DriverAvatar, StarRating, StopProgressBar,
} from './DeliveryShared';

// ── custom tooltip for recharts ───────────────────────────────────────────────
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

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SimpleMarkdown({ text }) {
    if (!text) return null;
    
    const lines = text.split('\n');
    
    return (
        <div style={{ fontSize: '0.82rem', color: D.textMid, lineHeight: 1.8 }}>
            {lines.map((line, i) => {
                // Empty line → spacer
                if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
                
                // Heading ## or ###
                if (line.startsWith('### ')) return (
                    <div key={i} style={{ fontWeight: 700, color: D.text, fontSize: '0.85rem', marginTop: 12, marginBottom: 4 }}>
                        {renderInline(line.replace(/^###\s*/, ''))}
                    </div>
                );
                if (line.startsWith('## ')) return (
                    <div key={i} style={{ fontWeight: 700, color: D.text, fontSize: '0.9rem', marginTop: 14, marginBottom: 4 }}>
                        {renderInline(line.replace(/^##\s*/, ''))}
                    </div>
                );
                
                // Bullet
                if (line.match(/^[-*]\s/)) return (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: 8 }}>
                        <span style={{ color: D.purple, flexShrink: 0 }}>•</span>
                        <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
                    </div>
                );
                
                // Normal paragraph
                return <div key={i} style={{ marginBottom: 4 }}>{renderInline(line)}</div>;
            })}
        </div>
    );
}

function renderInline(text) {
    // Split on **bold** and *italic*
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} style={{ color: D.text, fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*'))
            return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
    });
}

// ── manifest mini-row for driver detail ───────────────────────────────────────
function ManifestMiniRow({ manifest, onClick, onHover }) {
    const items     = manifest.items ?? [];
    const total     = items.length;
    const delivered = items.filter(i => i.status === 'delivered').length;
    const failed    = items.filter(i => i.status === 'failed').length;

    return (
        <DeliveryCard hoverable onClick={onClick} style={{ padding: 'clamp(10px, 2vw, 14px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: D.radiusSm,
                        background: D.purpleDim,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Truck size={15} color={D.purple} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>{manifest.manifest_number}</div>
                        <div style={{ fontSize: '0.72rem', color: D.textDim }}>
                            {fmtDate(manifest.scheduled_date)} · {total} stops · {manifest.status}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {manifest.total_distance_km > 0 && (
                        <span style={{ fontSize: '0.72rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <MapPin size={10} /> {manifest.total_distance_km} km
                        </span>
                    )}
                    <StatusBadge status={manifest.status} />
                </div>
            </div>
            {total > 0 && (
                <div style={{ marginTop: 10 }}>
                    <StopProgressBar total={total} delivered={delivered} failed={failed} />
                </div>
            )}
        </DeliveryCard>
    );
}

// ── rating row ────────────────────────────────────────────────────────────────
function RatingRow({ rating }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '10px 0',
            borderBottom: `1px solid ${D.purpleBorder}`,
        }}>
            <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: D.purpleDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: D.purple,
                flexShrink: 0,
            }}>
                {(rating.customer_name ?? 'C').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>{rating.customer_name ?? 'Anonymous'}</span>
                    <StarRating value={rating.rating} size={11} />
                </div>
                {rating.comment && (
                    <div style={{ fontSize: '0.78rem', color: D.textMid, marginTop: 4, fontStyle: 'italic' }}>
                        "{rating.comment}"
                    </div>
                )}
                <div style={{ fontSize: '0.68rem', color: D.textDim, marginTop: 4 }}>
                    {fmtDate(rating.created_at)} · {rating.order?.order_number ?? rating.manifest_number ?? ''}
                </div>
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function DriverDetailPage() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [driver,     setDriver]     = useState(null);
    const [manifests,  setManifests]  = useState([]);
    const [ratings,    setRatings]    = useState([]);
    const [ratingBreakdown, setRatingBreakdown] = useState(null);
    const [adjustments, setAdjustments] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState(null);

    const [aiInsight,   setAiInsight]   = useState(null);
    const [aiLoading,   setAiLoading]   = useState(false);

    const handleLoadAI = async () => {
        setAiLoading(true);
        try {
            const res = await deliveryAPI.getDriverDetailWithAI(id);
            setAiInsight(res.ai_insight ?? null);
        } catch {
            // silently fail
        } finally {
            setAiLoading(false);
        }
    };

    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            // Fetch driver detail from stats endpoint
            const [detailRes, ratingsRes] = await Promise.all([
                deliveryAPI.getDriverDetail(id),
                deliveryAPI.getDriverRatings(id),
            ]);

            // Driver detail: { driver: {...}, rating: {...}, ai_insight: '...' }
            setDriver(detailRes.driver ?? detailRes);
            setAiInsight(detailRes.ai_insight ?? null);

            // Rating breakdown
            setRatingBreakdown(ratingsRes.breakdown ?? null);
            setAdjustments(ratingsRes.adjustments ?? []);

            // Individual ratings (paginated)
            const ratingsRaw = ratingsRes.ratings?.data ?? ratingsRes.ratings ?? [];
            setRatings(Array.isArray(ratingsRaw) ? ratingsRaw : []);

            // Fetch recent manifests for this driver
            const manifestsRes = await deliveryAPI.getManifests({ driver_id: id, per_page: 10 });
            setManifests(manifestsRes.data ?? manifestsRes ?? []);
        } catch (err) {
            console.error('Failed to load driver details:', err);
            setError('Failed to load driver details. Please try again.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Build weekly chart data from manifests
    const weeklyData = useCallback(() => {
        if (!manifests?.length) return [];
        // Group by week or use last 7 manifests
        return manifests.slice(0, 7).map((m, i) => {
            const items = m.items ?? [];
            return {
                day: m.scheduled_date
                    ? new Date(m.scheduled_date).toLocaleDateString('en-GB', { weekday: 'short' })
                    : `M${i + 1}`,
                deliveries: items.filter(x => x.status === 'delivered').length,
                distance: m.total_distance_km ?? 0,
                stops: items.length,
            };
        }).reverse();
    }, [manifests]);

    const chartData = weeklyData();

    // Rating distribution for pie chart
    const ratingDistribution = ratingBreakdown?.distribution
        ? Object.entries(ratingBreakdown.distribution).map(([key, value]) => ({
            name: `${key} ★`,
            value: value,
        }))
        : [];

    const PIE_COLORS = [D.purple, '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'];

    const onTimeRate = driver?.on_time_rate ?? 0;
    const avgRating  = ratingBreakdown?.overall_rating ?? driver?.overall_rating ?? 0;
    const rawAvg     = ratingBreakdown?.raw_average ?? 0;
    const totalRatings = ratingBreakdown?.total_ratings ?? ratings.length;

    if (loading) {
        return (
            <GeneralLayout>
                <DeliveryPageShell audio={audio}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 10, color: D.textMid }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                        <span style={{ fontSize: '0.9rem' }}>Loading driver…</span>
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </DeliveryPageShell>
            </GeneralLayout>
        );
    }

    if (error) {
        return (
            <GeneralLayout>
                <DeliveryPageShell audio={audio}>
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#ef4444', fontSize: '0.9rem' }}>
                        {error}
                        <br /><br />
                        <DeliveryBtn variant="ghost" size="sm" onClick={() => fetchAll()} onHover={audio.playHover}>
                            <RefreshCw size={13} /> Retry
                        </DeliveryBtn>
                    </div>
                </DeliveryPageShell>
            </GeneralLayout>
        );
    }

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[
                        { label: 'Delivery', onClick: () => navigate('/admin/delivery') },
                        { label: 'Drivers',  onClick: () => navigate('/admin/delivery/drivers') },
                        { label: driver?.name ?? `Driver #${id}` },
                    ]}
                    onHover={audio.playHover}
                />

                {/* header */}
                <DeliveryPageHeader
                    title={driver?.name ?? 'Driver'}
                    sub={driver?.is_active !== false ? 'Active driver' : 'Inactive driver'}
                    actions={
                        <DeliveryBtn variant="ghost" size="sm" onClick={() => { audio.playHover(); fetchAll(true); }} onHover={audio.playHover} disabled={refreshing}>
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                        </DeliveryBtn>
                    }
                />

                {/* driver profile card */}
                <DeliveryCard style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(14px, 3vw, 24px)', flexWrap: 'wrap' }}>
                        <DriverAvatar name={driver?.name} photo={driver?.profile_picture_url} size={60} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 'clamp(1.1rem, 3vw, 1.4rem)', fontWeight: 700, color: D.text, marginBottom: 6 }}>
                                {driver?.name}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '0.78rem', color: D.textDim }}>
                                {driver?.phone && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Phone size={11} color={D.purple} /> {driver.phone}
                                    </span>
                                )}
                                {driver?.email && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Mail size={11} color={D.purple} /> {driver.email}
                                    </span>
                                )}
                                {driver?.vehicle_type && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Truck size={11} color={D.purple} /> {driver.vehicle_type}
                                    </span>
                                )}
                                {driver?.license_plate && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <AlertTriangle size={11} color={D.purple} /> {driver.license_plate}
                                    </span>
                                )}
                            </div>
                        </div>
                        <StatusBadge
                            status={driver?.is_active !== false ? 'delivered' : 'failed'}
                            style={{
                                background: driver?.is_active !== false ? 'rgba(20,184,166,0.12)' : 'rgba(239,68,68,0.12)',
                                color: driver?.is_active !== false ? D.teal : '#ef4444',
                                borderColor: driver?.is_active !== false ? 'rgba(20,184,166,0.3)' : 'rgba(239,68,68,0.3)',
                            }}
                        >
                            {driver?.is_active !== false ? 'Active' : 'Inactive'}
                        </StatusBadge>
                    </div>
                </DeliveryCard>

                {/* KPIs Row 1 */}
                <StatsGrid cols={4}>
                    <StatCard label="Overall Rating" value={<StarRating value={avgRating} size={13} />} sub={`${totalRatings} reviews`} icon={Star} accent="#f59e0b" />
                    <StatCard label="Raw Average" value={rawAvg ? rawAvg.toFixed(1) : '—'} icon={Award} accent={D.purple} />
                    <StatCard label="On-time Rate" value={`${onTimeRate}%`} sub={`target: 90%`} icon={TrendingUp} accent={onTimeRate >= 80 ? D.teal : '#f59e0b'} />
                    <StatCard label="Total Distance" value={`${driver?.total_distance_km ?? 0} km`} icon={Route} accent={D.purple} />
                </StatsGrid>

                {/* KPIs Row 2 */}
                <StatsGrid cols={4}>
                    <StatCard label="Completed Runs" value={driver?.completed_manifests ?? 0} icon={CheckCircle} accent={D.teal} />
                    <StatCard label="Total Stops" value={driver?.total_stops ?? 0} icon={Package} accent={D.purple} />
                    <StatCard label="Delivered" value={driver?.delivered_stops ?? 0} icon={Package} accent={D.teal} />
                    <StatCard label="Failed" value={driver?.failed_stops ?? 0} icon={XCircle} accent={driver?.failed_stops > 0 ? '#ef4444' : D.purple} />
                </StatsGrid>

                {/* KPIs Row 3 */}
                <StatsGrid cols={4}>
                    <StatCard label="Avg Duration" value={driver?.avg_duration_mins ? `${Math.round(driver.avg_duration_mins)} min` : '—'} icon={Clock} accent={D.purple} />
                    <StatCard label="Open Incidents" value={driver?.open_incidents ?? 0} icon={AlertTriangle} accent={driver?.open_incidents > 0 ? '#ef4444' : D.teal} />
                    <StatCard label="Critical Incidents" value={driver?.critical_incidents ?? 0} icon={Shield} accent={driver?.critical_incidents > 0 ? '#ef4444' : D.teal} />
                    <StatCard label="Total Pings" value={driver?.total_pings ?? 0} icon={MapPin} accent={D.purple} />
                </StatsGrid>

                <DeliveryDivider label="AI Insight" />
                <DeliveryCard style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                    {(() => {
                        const insightText = typeof aiInsight === 'string' 
                            ? aiInsight 
                            : aiInsight?.content ?? null;
                        
                        return insightText ? (
                            <>
                                <SimpleMarkdown text={insightText} />
                                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <DeliveryBtn 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => navigate(`/admin/delivery/insights/driver/${id}`)}
                                        onHover={audio.playHover}
                                    >
                                        View History
                                    </DeliveryBtn>
                                    <DeliveryBtn 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={handleLoadAI} 
                                        onHover={audio.playHover} 
                                        disabled={aiLoading}
                                    >
                                        {aiLoading
                                            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analysing…</>
                                            : <><RefreshCw size={13} /> Re-run</>
                                        }
                                    </DeliveryBtn>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '0.78rem', color: D.textDim }}>
                                    AI analysis runs on demand to avoid unnecessary API usage.
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <DeliveryBtn 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => navigate(`/admin/delivery/insights/driver/${id}`)}
                                        onHover={audio.playHover}
                                    >
                                        View History
                                    </DeliveryBtn>
                                    <DeliveryBtn 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={handleLoadAI} 
                                        onHover={audio.playHover} 
                                        disabled={aiLoading}
                                    >
                                        {aiLoading
                                            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analysing…</>
                                            : <><BarChart2 size={13} /> Run AI Insight</>
                                        }
                                    </DeliveryBtn>
                                </div>
                            </div>
                        );
                    })()}
                </DeliveryCard>

                {/* Charts Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(16px, 3vw, 24px)', marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                    {/* Weekly activity bar chart */}
                    <DeliveryCard>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: D.text, marginBottom: 12 }}>Weekly Activity</div>
                        {chartData.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, textAlign: 'center', padding: '24px 0' }}>
                                No recent activity
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={chartData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="deliveries" fill={D.purple} radius={[4, 4, 0, 0]} maxBarSize={28} name="Deliveries" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>

                    {/* Rating distribution pie chart */}
                    <DeliveryCard>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: D.text, marginBottom: 12 }}>Rating Distribution</div>
                        {ratingDistribution.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: D.textDim, textAlign: 'center', padding: '24px 0' }}>
                                No ratings yet
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={ratingDistribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {ratingDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </DeliveryCard>
                </div>

                {/* recent manifests */}
                <DeliveryDivider label="Recent Manifests" />
                {manifests.length === 0 ? (
                    <DeliveryCard style={{ marginBottom: 24 }}>
                        <DeliveryEmptyState icon={Truck} title="No manifests yet" sub="This driver has not been assigned any delivery runs." />
                    </DeliveryCard>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'clamp(20px, 4vw, 32px)' }}>
                        {manifests.map(m => (
                            <ManifestMiniRow
                                key={m.id}
                                manifest={m}
                                onHover={audio.playHover}
                                onClick={() => { audio.playHover(); navigate(`/admin/delivery/manifests/${m.id}`); }}
                            />
                        ))}
                    </div>
                )}

                {/* ratings */}
                <DeliveryDivider label={`Ratings (${ratings.length})`} />
                <DeliveryCard style={{ marginBottom: 32 }}>
                    {ratings.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: D.textDim, textAlign: 'center', padding: '24px 0' }}>
                            No ratings received yet
                        </div>
                    ) : (
                        <div>
                            {ratings.map((r, i) => (
                                <RatingRow key={r.id ?? i} rating={r} />
                            ))}
                        </div>
                    )}
                </DeliveryCard>

                {/* Adjustments */}
                {adjustments.length > 0 && (
                    <>
                        <DeliveryDivider label={`Adjustments (${adjustments.length})`} />
                        <DeliveryCard style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {adjustments.map((adj, i) => (
                                    <div key={adj.id ?? i} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 0',
                                        borderBottom: `1px solid ${D.purpleBorder}`,
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>
                                                {adj.adjustment_value > 0 ? '+' : ''}{adj.adjustment_value} points
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: D.textDim }}>{adj.reason}</div>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: D.textDim, textAlign: 'right' }}>
                                            <div>{fmtDate(adj.created_at)}</div>
                                            <div>by {adj.admin?.name ?? 'Admin'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </DeliveryCard>
                    </>
                )}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}