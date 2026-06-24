import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Navigation, Star, TrendingUp, CheckCircle, XCircle,
    Clock, Truck, Search, RefreshCw, ChevronLeft, ChevronRight,
    Loader2, Users, Award, AlertTriangle, BarChart2, Phone,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatCard, StatsGrid, StatusBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    DriverAvatar, StarRating,
} from './DeliveryShared';

const PER_PAGE = 12;

// ── driver row card ───────────────────────────────────────────────────────────
function DriverRow({ driver, onClick, onHover }) {
    const onTimeRate = driver.on_time_rate ?? 0;
    const avgRating  = driver.overall_rating ?? 0;
    const totalStops = driver.total_stops ?? 0;
    const delivered  = driver.delivered_stops ?? 0;
    const failed     = driver.failed_stops ?? 0;

    return (
        <DeliveryCard
            hoverable
            onClick={onClick}
            style={{ padding: 'clamp(12px, 2vw, 16px)' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                {/* left: avatar + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <DriverAvatar name={driver.name} photo={driver.profile_picture_url} size={40} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: D.text, marginBottom: 2 }}>
                            {driver.name}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {driver.phone && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Phone size={11} color={D.textDim} />
                                    {driver.phone}
                                </span>
                            )}
                            {driver.total_manifests != null && (
                                <>
                                    <span>·</span>
                                    <span>{driver.total_manifests} total manifests</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* center: mini stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 24px)', flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: D.purple }}>
                            {driver.completed_manifests ?? 0}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Runs</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: onTimeRate >= 80 ? D.teal : '#f59e0b' }}>
                            {onTimeRate}%
                        </div>
                        <div style={{ fontSize: '0.65rem', color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>On time</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <StarRating value={avgRating} size={11} />
                        <div style={{ fontSize: '0.65rem', color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>Rating</div>
                    </div>
                </div>

                {/* right: status + incidents */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {driver.critical_incidents > 0 && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            fontSize: '0.7rem', fontWeight: 700, color: '#ef4444',
                            background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 12,
                        }}>
                            <AlertTriangle size={10} />
                            {driver.critical_incidents}
                        </span>
                    )}
                    {driver.open_incidents > 0 && driver.critical_incidents === 0 && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b',
                            background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 12,
                        }}>
                            <AlertTriangle size={10} />
                            {driver.open_incidents}
                        </span>
                    )}
                    <StatusBadge
                        status={driver.is_active !== false ? 'delivered' : 'failed'}
                        style={{
                            background: driver.is_active !== false ? 'rgba(20,184,166,0.12)' : 'rgba(239,68,68,0.12)',
                            color: driver.is_active !== false ? D.teal : '#ef4444',
                            borderColor: driver.is_active !== false ? 'rgba(20,184,166,0.3)' : 'rgba(239,68,68,0.3)',
                        }}
                    >
                        {driver.is_active !== false ? 'Active' : 'Inactive'}
                    </StatusBadge>
                </div>
            </div>

            {/* mini progress: delivered vs failed stops */}
            {totalStops > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${D.purpleBorder}` }}>
                    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                        {delivered > 0 && (
                            <div style={{
                                width: `${(delivered / totalStops) * 100}%`,
                                background: D.teal, borderRadius: 2,
                            }} />
                        )}
                        {failed > 0 && (
                            <div style={{
                                width: `${(failed / totalStops) * 100}%`,
                                background: '#ef4444', borderRadius: 2,
                            }} />
                        )}
                        {totalStops - delivered - failed > 0 && (
                            <div style={{
                                width: `${((totalStops - delivered - failed) / totalStops) * 100}%`,
                                background: D.textDim, borderRadius: 2, opacity: 0.3,
                            }} />
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.68rem', color: D.textDim }}>
                        <span style={{ color: D.teal }}>{delivered} delivered</span>
                        <span style={{ color: '#ef4444' }}>{failed} failed</span>
                        <span>{totalStops - delivered - failed} pending</span>
                        <span style={{ marginLeft: 'auto' }}>{driver.total_distance_km ?? 0} km total</span>
                    </div>
                </div>
            )}
        </DeliveryCard>
    );
}

// ── pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, onPage, onHover }) {
    if (!meta || meta.last_page <= 1) return null;
    const { current_page, last_page, from, to, total } = meta;

    const pages = [];
    let start = Math.max(1, current_page - 2);
    let end   = Math.min(last_page, current_page + 2);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${D.purpleBorder}` }}>
            <span style={{ fontSize: '0.75rem', color: D.textDim }}>
                {from}–{to} of {total} drivers
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={btnStyle(false, current_page === 1)} disabled={current_page === 1} onClick={() => { onHover(); onPage(current_page - 1); }}>
                    <ChevronLeft size={14} />
                </button>
                {pages.map((p, i) =>
                    typeof p === 'number' ? (
                        <button key={p} style={btnStyle(p === current_page, false)} onClick={() => { onHover(); onPage(p); }}>{p}</button>
                    ) : (
                        <span key={p + i} style={{ padding: '5px 4px', color: D.textDim, fontSize: '0.78rem' }}>…</span>
                    )
                )}
                <button style={btnStyle(false, current_page === last_page)} disabled={current_page === last_page} onClick={() => { onHover(); onPage(current_page + 1); }}>
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function DriversPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [drivers,   setDrivers]   = useState([]);
    const [meta,      setMeta]      = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,     setError]     = useState(null);
    const [search,    setSearch]    = useState('');
    const [page,      setPage]      = useState(1);

    const searchTimer = useRef(null);

    const fetchDrivers = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getDriverPerformance();
            // The API returns { data: [...drivers] }
            let data = res.data ?? res ?? [];

            if (search.trim()) {
                const q = search.toLowerCase();
                data = data.filter(d => d.name?.toLowerCase().includes(q) || d.phone?.includes(q));
            }

            const total = data.length;
            const from  = (page - 1) * PER_PAGE;
            const to    = Math.min(from + PER_PAGE, total);
            const paginated = data.slice(from, to);

            setDrivers(paginated);
            setMeta({
                current_page: page,
                last_page:    Math.ceil(total / PER_PAGE) || 1,
                from:         total > 0 ? from + 1 : 0,
                to, total,
            });
        } catch (err) {
            console.error('Failed to load drivers:', err);
            setError('Failed to load drivers. Please try again.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [search, page]);

    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setPage(1); fetchDrivers(); }, search ? 300 : 0);
        return () => clearTimeout(searchTimer.current);
    }, [search]);

    useEffect(() => { fetchDrivers(); }, [page]);

    const handleRefresh = () => { audio.playHover(); fetchDrivers(true); };

    // Aggregate stats from ALL drivers (not just paginated)
    const allDriversData = useCallback(async () => {
        try {
            const res = await deliveryAPI.getDriverPerformance();
            return res.data ?? res ?? [];
        } catch {
            return [];
        }
    }, []);

    const [allDrivers, setAllDrivers] = useState([]);

    useEffect(() => {
        let mounted = true;
        allDriversData().then(data => { if (mounted) setAllDrivers(data); });
        return () => { mounted = false; };
    }, [allDriversData]);

    const activeCount    = allDrivers.filter(d => d.is_active !== false).length;
    const avgOnTime      = allDrivers.length > 0
        ? Math.round(allDrivers.reduce((s, d) => s + (d.on_time_rate ?? 0), 0) / allDrivers.length)
        : 0;
    const totalRuns      = allDrivers.reduce((s, d) => s + (d.completed_manifests ?? 0), 0);
    const totalDrivers   = allDrivers.length;

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[{ label: 'Delivery', onClick: () => navigate('/admin/delivery') }, { label: 'Drivers' }]}
                    onHover={audio.playHover}
                />

                <DeliveryPageHeader
                    title="Drivers"
                    sub="Performance overview for every delivery driver"
                    actions={
                        <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                            Refresh
                        </DeliveryBtn>
                    }
                />

                {/* KPIs */}
                <StatsGrid cols={4}>
                    <StatCard label="Total drivers" value={totalDrivers || '—'} icon={Users} accent={D.purple} />
                    <StatCard label="Active now" value={activeCount} sub={`${totalDrivers > 0 ? Math.round((activeCount / totalDrivers) * 100) : 0}% of fleet`} icon={Navigation} accent={D.teal} />
                    <StatCard label="Avg on-time" value={`${avgOnTime}%`} icon={TrendingUp} accent={avgOnTime >= 80 ? D.teal : '#f59e0b'} />
                    <StatCard label="Total runs" value={totalRuns} icon={Truck} accent={D.purple} />
                </StatsGrid>

                {/* search */}
                <div style={{ position: 'relative', maxWidth: 360, marginBottom: 18 }}>
                    <Search size={13} color={D.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search drivers by name or phone…"
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: D.card, border: `1px solid ${D.purpleBorder}`,
                            borderRadius: D.radiusSm, color: D.text,
                            fontSize: '0.85rem', padding: '9px 11px 9px 30px', outline: 'none',
                        }}
                    />
                </div>

                <DeliveryDivider label={meta ? `${meta.total} driver${meta.total !== 1 ? 's' : ''}` : 'Drivers'} />

                {/* list */}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 0', color: D.textDim }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading drivers…</span>
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
                ) : drivers.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState
                            icon={Users}
                            title={search ? 'No drivers match your search' : 'No drivers yet'}
                            sub={search ? 'Try a different search term.' : 'Add drivers to see them here.'}
                            action={search ? (
                                <DeliveryBtn variant="ghost" size="sm" onClick={() => setSearch('')} onHover={audio.playHover}>Clear search</DeliveryBtn>
                            ) : null}
                        />
                    </DeliveryCard>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {drivers.map(d => (
                            <DriverRow
                                key={d.driver_id}
                                driver={d}
                                onHover={audio.playHover}
                                onClick={() => { audio.playHover(); navigate(`/admin/delivery/drivers/${d.driver_id}`); }}
                            />
                        ))}
                    </div>
                )}

                {!loading && !error && <Pagination meta={meta} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onHover={audio.playHover} />}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}