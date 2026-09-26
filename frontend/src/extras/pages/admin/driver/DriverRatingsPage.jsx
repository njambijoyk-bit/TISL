import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Star, TrendingUp, Award, RefreshCw, Loader2,
    ThumbsUp, MessageSquare, Calendar, Truck,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import deliveryAPI from '../../../../_shared/api/delivery';
import { useDeliveryAudio } from '../delivery/useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader,
    DeliveryCard, StatCard, StatsGrid,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    StarRating,
} from '../delivery/DeliveryShared';

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── custom tooltip ────────────────────────────────────────────────────────────
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

// ── rating row ────────────────────────────────────────────────────────────────
function RatingRow({ rating }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 0',
            borderBottom: `1px solid ${D.purpleBorder}`,
        }}>
            {/* customer initial */}
            <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: D.purpleDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700, color: D.purple,
                flexShrink: 0,
            }}>
                {(rating.customer_name ?? 'C').charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                        {rating.customer_name ?? 'Anonymous'}
                    </span>
                    <StarRating value={rating.rating} size={12} />
                    <span style={{ fontSize: '0.7rem', color: D.textDim, marginLeft: 'auto' }}>
                        {fmtDate(rating.created_at)}
                    </span>
                </div>
                {rating.comment && (
                    <div style={{ fontSize: '0.8rem', color: D.textMid, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 6 }}>
                        "{rating.comment}"
                    </div>
                )}
                {rating.manifest_number && (
                    <div style={{ fontSize: '0.72rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Truck size={10} /> {rating.manifest_number}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function DriverRatingsPage() {
    const audio = useDeliveryAudio();

    const [ratings,    setRatings]    = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState(null);
    const [summary, setSummary]       = useState({});

    const fetchRatings = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const [ratingsRes, summaryRes] = await Promise.all([
                deliveryAPI.getDriverOwnRatings(),
                deliveryAPI.getMyRatingSummary(),
            ]);
            const ratingsData = ratingsRes.ratings?.data ?? [];
            const summary = summaryRes ?? {};
            
            const normalized = ratingsData.map(r => ({
                ...r,
                customer_name: r.customer 
                    ? `${r.customer.first_name ?? ''} ${r.customer.last_name ?? ''}`.trim() 
                    : 'Anonymous',
                manifest_number: r.order?.order_number ?? null,
            }));
            
            setRatings(normalized);
            setSummary(summaryRes ?? {});
        } catch (err) {
            console.error('Driver ratings error:', err);
            setError('Failed to load ratings.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchRatings(); }, [fetchRatings]);

    const handleRefresh = () => { audio.playHover(); fetchRatings(true); };

    // Stats
    const avgRating = ratings.length > 0
        ? (ratings.reduce((s, r) => s + Number(r.rating), 0) / ratings.length).toFixed(1)
        : '0.0';
    const fiveStarCount = ratings.filter(r => r.rating >= 4.5).length;
    const withComments  = ratings.filter(r => r.comment?.trim()).length;

    // Distribution
    const dist = [5, 4, 3, 2, 1].map(stars => ({
        stars,
        count: ratings.filter(r => Math.round(r.rating) === stars).length,
    }));

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryPageHeader
                    title="My Ratings"
                    sub="Customer feedback on your deliveries"
                    actions={
                        <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                        </DeliveryBtn>
                    }
                />

                {/* KPIs */}
                <StatsGrid cols={4}>
                    <StatCard
                        label="Overall rating"
                        value={summary.overall_rating != null ? `★ ${summary.overall_rating}` : '—'}
                        sub="incl. adjustments"
                        icon={Star}
                        accent="#f59e0b"
                    />
                    <StatCard
                        label="Raw average"
                        value={summary.raw_average != null ? `★ ${Number(summary.raw_average).toFixed(2)}` : '—'}
                        sub="from customer reviews"
                        icon={TrendingUp}
                        accent={D.purple}
                    />
                    <StatCard label="5-star reviews" value={fiveStarCount} sub={`of ${ratings.length}`} icon={Award} accent={D.teal} />
                    <StatCard label="With comments" value={withComments} icon={MessageSquare} accent={D.purple} />
                </StatsGrid>

                {/* distribution + chart */}
                {ratings.length > 0 && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                        gap: 'clamp(12px, 2vw, 18px)',
                        marginBottom: 'clamp(16px, 3vw, 24px)',
                    }}>
                        <DeliveryCard>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                                Your rating distribution
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {dist.map(d => (
                                    <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: '0.78rem', color: D.textMid, width: 36, textAlign: 'right', fontWeight: 600 }}>
                                            {d.stars} ★
                                        </span>
                                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-border-tertiary)', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${Math.max((d.count / Math.max(...dist.map(x => x.count), 1)) * 100, 5)}%`,
                                                background: d.stars >= 4 ? D.teal : d.stars >= 3 ? '#f59e0b' : '#ef4444',
                                                borderRadius: 4, transition: 'width 0.5s', minWidth: d.count > 0 ? 20 : 0,
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: D.textDim, width: 30 }}>{d.count}</span>
                                    </div>
                                ))}
                            </div>
                        </DeliveryCard>

                        <DeliveryCard>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, marginBottom: 16 }}>
                                Breakdown
                            </div>
                            <ResponsiveContainer width="100%" height={140}>
                                <BarChart data={dist} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                                    <XAxis dataKey="stars" tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: D.textDim }} axisLine={false} tickLine={false} width={25} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="count" fill={D.purple} radius={[4, 4, 0, 0]} maxBarSize={28} name="Reviews" />
                                </BarChart>
                            </ResponsiveContainer>
                        </DeliveryCard>
                    </div>
                )}

                <DeliveryDivider label={ratings.length > 0 ? `${ratings.length} review${ratings.length !== 1 ? 's' : ''}` : 'Reviews'} />

                {/* list */}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 0', color: D.textDim }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading ratings…</span>
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
                ) : ratings.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState
                            icon={Star}
                            title="No ratings yet"
                            sub="Customer ratings will appear here once deliveries are completed and reviewed."
                        />
                    </DeliveryCard>
                ) : (
                    <DeliveryCard style={{ marginBottom: 32 }}>
                        {ratings.map((r, i) => (
                            <div key={r.id ?? i}>
                                <RatingRow rating={r} />
                            </div>
                        ))}
                    </DeliveryCard>
                )}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}
