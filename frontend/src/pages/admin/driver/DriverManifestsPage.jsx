import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Truck, Navigation, CheckCircle, XCircle, Clock,
    Calendar, MapPin, Loader2, RefreshCw, Package,
    Play, AlertTriangle,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from '../delivery/useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader,
    DeliveryCard, StopProgressBar, StatusBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    StatCard, StatsGrid,
} from '../delivery/DeliveryShared';

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── manifest card for driver ────────────────────────────────────────────────────
function DriverManifestCard({ manifest, onClick, onHover }) {
    const items     = manifest.items ?? [];
    const total     = items.length;
    const delivered = items.filter(i => i.status === 'delivered').length;
    const failed    = items.filter(i => i.status === 'failed').length;
    const isActive  = manifest.status === 'in_progress';

    return (
        <DeliveryCard
            hoverable
            onClick={onClick}
            style={{
                padding: 'clamp(14px, 3vw, 18px)',
                borderColor: isActive ? D.purple : D.purpleBorder,
                boxShadow: isActive ? D.purpleGlow : 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: D.radiusSm,
                        background: isActive ? D.purpleDim : D.purpleDim,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Truck size={18} color={D.purple} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: D.text, marginBottom: 2 }}>
                            {manifest.manifest_number}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Calendar size={11} />
                            {fmtDate(manifest.scheduled_date)}
                            {manifest.total_distance_km > 0 && (
                                <>
                                    <span>·</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <MapPin size={11} /> {manifest.total_distance_km} km
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {isActive && (
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#f59e0b',
                            boxShadow: '0 0 6px #f59e0b',
                            animation: 'pulse 2s ease-in-out infinite',
                        }} />
                    )}
                    <StatusBadge status={manifest.status} />
                </div>
            </div>

            {total > 0 && (
                <div style={{ paddingTop: 10, borderTop: `1px solid ${D.purpleBorder}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.75rem', color: D.textMid, fontWeight: 600 }}>
                            {total} stops
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: D.purple }}>
                            {total > 0 ? Math.round((delivered / total) * 100) : 0}%
                        </span>
                    </div>
                    <StopProgressBar total={total} delivered={delivered} failed={failed} />
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.7rem', color: D.textDim }}>
                        <span style={{ color: D.teal }}>{delivered} delivered</span>
                        {failed > 0 && <span style={{ color: '#ef4444' }}>{failed} failed</span>}
                        <span>{total - delivered - failed} pending</span>
                    </div>
                </div>
            )}

            {isActive && (
                <div style={{
                    marginTop: 12, padding: '8px 12px', borderRadius: D.radiusSm,
                    background: 'rgba(168,85,247,0.08)', border: `1px solid ${D.purpleBorder}`,
                    fontSize: '0.78rem', color: D.purple, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <Play size={13} /> Tap to continue this trip
                </div>
            )}
        </DeliveryCard>
    );
}

// ── main page ────────────────────────────────────────────────────────────────────
export default function DriverManifestsPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [manifests,  setManifests]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState(null);

    const fetchManifests = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getMyManifests();
            setManifests(res.data ?? res ?? []);
        } catch {
            setError('Failed to load your manifests.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchManifests(); }, [fetchManifests]);

    const handleRefresh = () => { audio.playHover(); fetchManifests(true); };

    // Split by status
    const activeManifests    = manifests.filter(m => ['dispatched', 'in_progress'].includes(m.status));
    const upcomingManifests  = manifests.filter(m => m.status === 'draft');
    const completedManifests = manifests.filter(m => ['completed', 'cancelled'].includes(m.status));

    // Quick stats
    const totalCompleted = completedManifests.filter(m => m.status === 'completed').length;
    const totalDelivered = manifests.reduce((s, m) => s + (m.items?.filter(i => i.status === 'delivered').length ?? 0), 0);
    const totalStops     = manifests.reduce((s, m) => s + (m.items?.length ?? 0), 0);

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryPageHeader
                    title="My Manifests"
                    sub="Your assigned delivery runs"
                    actions={
                        <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                        </DeliveryBtn>
                    }
                />

                {/* KPIs */}
                <StatsGrid cols={3}>
                    <StatCard label="Active" value={activeManifests.length} icon={Navigation} accent={activeManifests.length > 0 ? '#f59e0b' : D.purple} />
                    <StatCard label="Completed" value={totalCompleted} icon={CheckCircle} accent={D.teal} />
                    <StatCard label="Stops done" value={totalDelivered} sub={`of ${totalStops}`} icon={Package} accent={D.purple} />
                </StatsGrid>

                {/* Active / In Progress */}
                {activeManifests.length > 0 && (
                    <>
                        <DeliveryDivider label={`${activeManifests.length} active`} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                            {activeManifests.map(m => (
                                <DriverManifestCard
                                    key={m.id}
                                    manifest={m}
                                    onHover={audio.playHover}
                                    onClick={() => { audio.playHover(); navigate(`/driver/manifests/${m.id}`); }}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* Upcoming */}
                {upcomingManifests.length > 0 && (
                    <>
                        <DeliveryDivider label={`${upcomingManifests.length} upcoming`} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                            {upcomingManifests.map(m => (
                                <DriverManifestCard
                                    key={m.id}
                                    manifest={m}
                                    onHover={audio.playHover}
                                    onClick={() => { audio.playHover(); navigate(`/driver/manifests/${m.id}`); }}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* Completed */}
                <DeliveryDivider label="History" />
                {completedManifests.length === 0 && !loading && upcomingManifests.length === 0 && activeManifests.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState
                            icon={Truck}
                            title="No manifests assigned"
                            sub="Your delivery runs will appear here once assigned."
                        />
                    </DeliveryCard>
                ) : completedManifests.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {completedManifests.map(m => (
                            <DriverManifestCard
                                key={m.id}
                                manifest={m}
                                onHover={audio.playHover}
                                onClick={() => { audio.playHover(); navigate(`/driver/manifests/${m.id}`); }}
                            />
                        ))}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: D.textDim, textAlign: 'center', padding: '16px 0' }}>
                        No completed runs yet
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 0', color: D.textDim }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading manifests…</span>
                    </div>
                )}

                {error && !loading && (
                    <DeliveryCard>
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#ef4444', fontSize: '0.9rem' }}>
                            {error}
                            <br /><br />
                            <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover}>
                                <RefreshCw size={13} /> Retry
                            </DeliveryBtn>
                        </div>
                    </DeliveryCard>
                )}

                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                `}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}
