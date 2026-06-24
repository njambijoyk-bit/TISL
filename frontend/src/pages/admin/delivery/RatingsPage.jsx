import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Star, RefreshCw, Search, EyeOff, ChevronDown, ChevronUp,
    ChevronLeft, ChevronRight, Loader2, MessageSquare, Award,
    Settings, Eye, TrendingUp, TrendingDown, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatCard, StatsGrid,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    DriverAvatar, StarRating,
} from './DeliveryShared';

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ── Rating distribution bars ──────────────────────────────────────────────────
function RatingDistribution({ distribution = {}, total = 0 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[5, 4, 3, 2, 1].map(star => {
                const count = distribution[star] ?? 0;
                const pct   = total > 0 ? (count / total) * 100 : 0;
                const color = star >= 4 ? D.teal : star === 3 ? '#f59e0b' : '#ef4444';
                return (
                    <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.72rem', color: D.textDim, width: 28, textAlign: 'right', fontWeight: 600 }}>
                            {star}★
                        </span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: D.purpleBorder, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', width: `${pct}%`,
                                background: color, borderRadius: 3,
                                transition: 'width 0.5s ease',
                            }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: D.textDim, width: 24 }}>{count}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Individual rating row ─────────────────────────────────────────────────────
function RatingRow({ rating, onToggleVisibility, onHover }) {
    const customerName = rating.customer
        ? `${rating.customer.first_name ?? ''} ${rating.customer.last_name ?? ''}`.trim() || 'Anonymous'
        : 'Anonymous';

    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 0', borderBottom: `1px solid ${D.purpleBorder}`,
        }}>
            <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: D.purpleDim, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 700, color: D.purple,
            }}>
                {customerName.charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>{customerName}</span>
                    <StarRating value={rating.rating} size={11} />
                    {!rating.is_visible_to_driver && (
                        <span style={{
                            fontSize: '0.6rem', padding: '1px 6px', borderRadius: 20,
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.25)', fontWeight: 700,
                            textTransform: 'uppercase',
                        }}>Hidden</span>
                    )}
                    <span style={{ fontSize: '0.68rem', color: D.textDim, marginLeft: 'auto' }}>
                        {fmtDate(rating.created_at)}
                    </span>
                </div>
                {rating.comment && (
                    <div style={{ fontSize: '0.78rem', color: D.textMid, fontStyle: 'italic', lineHeight: 1.5 }}>
                        "{rating.comment}"
                    </div>
                )}
                {rating.order?.order_number && (
                    <div style={{ fontSize: '0.68rem', color: D.textDim, marginTop: 3 }}>
                        Order: {rating.order.order_number}
                    </div>
                )}
            </div>

            <button
                onClick={() => onToggleVisibility(rating.id)}
                onMouseEnter={onHover}
                title={rating.is_visible_to_driver ? 'Hide from driver' : 'Show to driver'}
                style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    border: `1px solid ${rating.is_visible_to_driver ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)'}`,
                    background: rating.is_visible_to_driver ? 'rgba(16,185,129,0.06)' : 'transparent',
                    color: rating.is_visible_to_driver ? '#059669' : D.textDim,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {rating.is_visible_to_driver ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
        </div>
    );
}

// ── Adjustment row ────────────────────────────────────────────────────────────
function AdjustmentRow({ adj }) {
    const isPositive = Number(adj.adjustment_value) > 0;
    const color = isPositive ? D.teal : '#ef4444';

    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 0', borderBottom: `1px solid ${D.purpleBorder}`,
        }}>
            <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {isPositive
                    ? <TrendingUp size={14} color={D.teal} />
                    : <TrendingDown size={14} color="#ef4444" />
                }
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>
                        {isPositive ? '+' : ''}{Number(adj.adjustment_value).toFixed(1)}
                    </span>
                    {adj.admin?.name && (
                        <span style={{ fontSize: '0.72rem', color: D.textDim }}>
                            by {adj.admin.name}
                        </span>
                    )}
                    <span style={{ fontSize: '0.68rem', color: D.textDim, marginLeft: 'auto' }}>
                        {fmtDateTime(adj.created_at)}
                    </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: D.textMid, lineHeight: 1.5 }}>
                    {adj.reason}
                </div>
            </div>
        </div>
    );
}

// ── Adjust rating modal ───────────────────────────────────────────────────────
function AdjustRatingModal({ driver, onClose, onSubmit }) {
    const [value,   setValue]   = useState(0);
    const [reason,  setReason]  = useState('');
    const [loading, setLoading] = useState(false);

    const canSubmit = reason.trim().length >= 5 && value !== 0 && !loading;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setLoading(true);
        await onSubmit(driver.driver_id, value, reason.trim());
        setLoading(false);
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: 'white', borderRadius: 20, width: '100%', maxWidth: 420,
                boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
            }}>
                <div style={{ height: 4, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />
                <div style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#111827' }}>
                        Adjust Rating
                    </h3>
                    <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af' }}>
                        {driver.driver_name} · Current overall:{' '}
                        <strong style={{ color: '#111827' }}>{driver.overall_rating ?? 'N/A'}</strong>
                    </p>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#c084fc', marginBottom: 8 }}>
                            Adjustment value
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                            <button
                                onClick={() => setValue(v => Math.max(-4, parseFloat((v - 0.5).toFixed(1))))}
                                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 18, color: '#ef4444' }}
                            >−</button>
                            <span style={{ fontSize: 24, fontWeight: 800, color: value > 0 ? '#059669' : value < 0 ? '#ef4444' : '#111827', minWidth: 60, textAlign: 'center' }}>
                                {value > 0 ? '+' : ''}{value.toFixed(1)}
                            </span>
                            <button
                                onClick={() => setValue(v => Math.min(4, parseFloat((v + 0.5).toFixed(1))))}
                                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 18, color: '#059669' }}
                            >+</button>
                        </div>
                        <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', margin: '8px 0 0' }}>Range: −4.0 to +4.0</p>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#c084fc', marginBottom: 6 }}>
                            Reason <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Why are you adjusting this rating?"
                            rows={3}
                            style={{
                                width: '100%', resize: 'vertical', boxSizing: 'border-box',
                                border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12,
                                padding: '10px 12px', fontSize: 13, color: '#111827',
                                outline: 'none', fontFamily: 'inherit',
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={onClose} style={{
                            flex: 1, padding: '10px 16px', borderRadius: 12,
                            border: '1px solid #e5e7eb', background: 'transparent',
                            fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
                        }}>Cancel</button>
                        <button onClick={handleSubmit} disabled={!canSubmit} style={{
                            flex: 2, padding: '10px 16px', borderRadius: 12, border: 'none',
                            background: canSubmit ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.2)',
                            color: canSubmit ? 'white' : '#a855f7',
                            fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
                        }}>
                            {loading ? 'Applying…' : 'Apply adjustment'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Driver rating card ────────────────────────────────────────────────────────
function DriverRatingCard({ driver, onHover, onAdjust, onToggleVisibility }) {
    const [expanded,    setExpanded]    = useState(false);
    const [data,        setData]        = useState(null);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState(null);
    const [ratingsPage, setRatingsPage] = useState(1);
    const [activeTab,   setActiveTab]   = useState('ratings');
    const RATINGS_PER_PAGE = 5;

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await deliveryAPI.getDriverRatings(driver.driver_id);
            setData({
                breakdown:   res.breakdown   ?? {},
                ratings:     res.ratings?.data ?? res.ratings ?? [],
                adjustments: res.adjustments  ?? [],
            });
        } catch {
            setError('Failed to load driver ratings.');
        } finally {
            setLoading(false);
        }
    }, [driver.driver_id]);

    const handleToggle = () => {
        onHover();
        if (!expanded && !data) loadData();
        setExpanded(e => !e);
    };

    const handleToggleVisibility = async (ratingId) => {
        await onToggleVisibility(ratingId);
        setData(prev => prev ? {
            ...prev,
            ratings: prev.ratings.map(r =>
                r.id === ratingId ? { ...r, is_visible_to_driver: !r.is_visible_to_driver } : r
            ),
        } : prev);
    };

    const overall      = data?.breakdown?.overall_rating;
    const rawAvg       = data?.breakdown?.raw_average ?? null;
    const totalRatings = data?.breakdown?.total_ratings ?? 0;
    const adjSum       = data?.breakdown?.total_adjustment ?? null;

    const allRatings   = data?.ratings ?? [];
    const totalPages   = Math.ceil(allRatings.length / RATINGS_PER_PAGE);
    const pagedRatings = allRatings.slice((ratingsPage - 1) * RATINGS_PER_PAGE, ratingsPage * RATINGS_PER_PAGE);
    const adjustments  = data?.adjustments ?? [];

    const overallColor = overall >= 4 ? D.teal : overall >= 3 ? '#f59e0b' : overall ? '#ef4444' : D.textDim;

    return (
        <div style={{
            background: D.card,
            border: `1px solid ${expanded ? D.purple : D.purpleBorder}`,
            borderRadius: D.radius,
            overflow: 'hidden',
            transition: 'border-color 0.2s',
        }}>
            {/* Collapsed header */}
            <div
                onClick={handleToggle}
                onMouseEnter={onHover}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 'clamp(12px, 2vw, 16px)',
                    cursor: 'pointer', flexWrap: 'wrap',
                }}
            >
                <DriverAvatar name={driver.name} size={38} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: D.text, marginBottom: 2 }}>
                        {driver.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: D.textDim }}>
                        {totalRatings} review{totalRatings !== 1 ? 's' : ''}
                        {adjustments.length > 0 && ` · ${adjustments.length} adjustment${adjustments.length !== 1 ? 's' : ''}`}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {overall != null ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 12px', borderRadius: 20,
                            background: `${overallColor}14`,
                            border: `1px solid ${overallColor}40`,
                        }}>
                            <Star size={12} color={overallColor} fill={overallColor} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: overallColor }}>{overall}</span>
                            <span style={{ fontSize: '0.65rem', color: D.textDim }}>overall</span>
                        </div>
                    ) : (
                        <span style={{ fontSize: '0.72rem', color: D.textDim, padding: '4px 10px' }}>No ratings yet</span>
                    )}

                    {rawAvg != null && (
                        <div style={{
                            padding: '4px 10px', borderRadius: 20,
                            background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                            fontSize: '0.72rem', color: D.textMid, fontWeight: 600,
                        }}>
                            ★ {Number(rawAvg).toFixed(1)} raw
                        </div>
                    )}

                    {adjSum != null && adjSum !== 0 && (
                        <div style={{
                            padding: '4px 10px', borderRadius: 20,
                            background: adjSum > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${adjSum > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                            fontSize: '0.72rem', fontWeight: 700,
                            color: adjSum > 0 ? D.teal : '#ef4444',
                        }}>
                            {adjSum > 0 ? '+' : ''}{Number(adjSum).toFixed(1)} adj
                        </div>
                    )}

                    {expanded ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />}
                </div>
            </div>

            {/* Expanded body */}
            {expanded && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: 'clamp(12px, 2vw, 16px)' }}>
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0', color: D.textDim }}>
                            <Loader2 size={16} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '0.82rem' }}>Loading…</span>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '16px 0', color: '#ef4444', fontSize: '0.82rem' }}>
                            {error}
                            <button onClick={loadData} style={{ marginLeft: 8, background: 'none', border: 'none', color: D.purple, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Distribution + summary */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                                gap: 16, marginBottom: 20,
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.06em', marginBottom: 10 }}>
                                        Distribution
                                    </div>
                                    <RatingDistribution
                                        distribution={data?.breakdown?.distribution ?? {}}
                                        total={data?.breakdown?.total_ratings ?? 0}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {[
                                            { label: 'Raw average',    value: rawAvg != null ? `★ ${Number(rawAvg).toFixed(2)}` : '—' },
                                            { label: 'Total reviews',  value: data?.breakdown?.total_ratings ?? 0 },
                                            { label: 'Adj. total',     value: adjSum != null ? `${adjSum > 0 ? '+' : ''}${Number(adjSum).toFixed(2)}` : '—' },
                                            { label: 'Overall rating', value: overall != null ? `★ ${overall}` : '—', highlight: true },
                                        ].map(s => (
                                            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.72rem', color: D.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
                                                <span style={{ fontSize: s.highlight ? '0.9rem' : '0.82rem', fontWeight: s.highlight ? 800 : 600, color: s.highlight ? overallColor : D.text }}>
                                                    {s.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <DeliveryBtn
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => onAdjust({ driver_id: driver.driver_id, driver_name: driver.name, overall_rating: overall })}
                                        onHover={onHover}
                                        style={{ alignSelf: 'flex-start' }}
                                    >
                                        <Settings size={12} /> Adjust rating
                                    </DeliveryBtn>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div style={{ display: 'flex', marginBottom: 16, borderBottom: `1px solid ${D.purpleBorder}` }}>
                                {[
                                    { key: 'ratings',     label: `Ratings (${allRatings.length})` },
                                    { key: 'adjustments', label: `Adjustments (${adjustments.length})` },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => { onHover(); setActiveTab(tab.key); }}
                                        style={{
                                            padding: '8px 16px',
                                            background: 'none', border: 'none',
                                            borderBottom: `2px solid ${activeTab === tab.key ? D.purple : 'transparent'}`,
                                            color: activeTab === tab.key ? D.purple : D.textDim,
                                            fontSize: '0.78rem', fontWeight: activeTab === tab.key ? 700 : 500,
                                            cursor: 'pointer', marginBottom: -1,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Ratings tab */}
                            {activeTab === 'ratings' && (
                                allRatings.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '0.82rem', color: D.textDim }}>
                                        No ratings yet.
                                    </div>
                                ) : (
                                    <>
                                        {pagedRatings.map(r => (
                                            <RatingRow
                                                key={r.id}
                                                rating={r}
                                                onHover={onHover}
                                                onToggleVisibility={handleToggleVisibility}
                                            />
                                        ))}
                                        {totalPages > 1 && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                                                <span style={{ fontSize: '0.72rem', color: D.textDim }}>
                                                    Page {ratingsPage} of {totalPages}
                                                </span>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button
                                                        onClick={() => setRatingsPage(p => Math.max(1, p - 1))}
                                                        disabled={ratingsPage === 1}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: D.radiusSm,
                                                            border: `1px solid ${D.purpleBorder}`, background: 'transparent',
                                                            color: D.textMid, cursor: ratingsPage === 1 ? 'default' : 'pointer',
                                                            opacity: ratingsPage === 1 ? 0.4 : 1,
                                                        }}
                                                    ><ChevronLeft size={13} /></button>
                                                    <button
                                                        onClick={() => setRatingsPage(p => Math.min(totalPages, p + 1))}
                                                        disabled={ratingsPage === totalPages}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: D.radiusSm,
                                                            border: `1px solid ${D.purpleBorder}`, background: 'transparent',
                                                            color: D.textMid, cursor: ratingsPage === totalPages ? 'default' : 'pointer',
                                                            opacity: ratingsPage === totalPages ? 0.4 : 1,
                                                        }}
                                                    ><ChevronRight size={13} /></button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )
                            )}

                            {/* Adjustments tab */}
                            {activeTab === 'adjustments' && (
                                adjustments.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '0.82rem', color: D.textDim }}>
                                        No adjustments made yet.
                                    </div>
                                ) : (
                                    adjustments.map((adj, i) => (
                                        <AdjustmentRow key={adj.id ?? i} adj={adj} />
                                    ))
                                )
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RatingsPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [drivers,     setDrivers]     = useState([]);
    const [kpis,        setKpis]        = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [error,       setError]       = useState(null);
    const [search,      setSearch]      = useState('');
    const [adjustModal, setAdjustModal] = useState(null);

    const fetchDrivers = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getDriverPerformance();
            setDrivers(res.data ?? res ?? []);
        } catch {
            setError('Failed to load drivers.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const fetchKpis = useCallback(async () => {
        try {
            const res = await deliveryAPI.getFleetRatingKpis();
            setKpis(res);
        } catch {
            // non-fatal — cards still show —
        }
    }, []);

    useEffect(() => {
        fetchDrivers();
        fetchKpis();
    }, [fetchDrivers, fetchKpis]);

    const handleAdjust = async (driverId, adjustmentValue, reason) => {
        try {
            await deliveryAPI.adjustDriverRating(driverId, { adjustment_value: adjustmentValue, reason });
            audio.playSuccess();
            setAdjustModal(null);
            toast.success('Rating adjusted.');
            fetchKpis(); // refresh KPIs after adjustment
        } catch (err) {
            audio.playError();
            toast.error(err?.response?.data?.message || 'Failed to adjust rating.');
        }
    };

    const handleToggleVisibility = async (ratingId) => {
        try {
            await deliveryAPI.toggleRatingVisibility(ratingId);
            audio.playSuccess();
            toast.success('Visibility updated.');
        } catch {
            audio.playError();
            toast.error('Failed to update visibility.');
        }
    };

    const handleRefresh = () => {
        audio.playHover();
        fetchDrivers(true);
        fetchKpis();
    };

    const filteredDrivers = search.trim()
        ? drivers.filter(d => d.name?.toLowerCase().includes(search.toLowerCase()))
        : drivers;

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[{ label: 'Delivery', onClick: () => navigate('/admin/delivery') }, { label: 'Ratings' }]}
                    onHover={audio.playHover}
                />

                <DeliveryPageHeader
                    title="Ratings"
                    sub="Driver performance ratings and admin adjustments"
                    actions={
                        <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                            Refresh
                        </DeliveryBtn>
                    }
                />

                {/* KPIs */}
                <StatsGrid cols={4}>
                    <StatCard label="Fleet avg"     value={kpis?.fleet_avg    ? `★ ${kpis.fleet_avg}`  : '—'} icon={Star}         accent="#f59e0b" />
                    <StatCard label="Total reviews" value={kpis?.total_reviews ?? '—'}                         icon={MessageSquare} accent={D.purple} />
                    <StatCard label="Drivers rated" value={kpis?.drivers_rated ?? '—'}                         icon={Users}         accent={D.teal}   />
                    <StatCard label="Total drivers" value={kpis?.total_drivers ?? '—'}                         icon={Award}         accent={D.purple} />
                </StatsGrid>

                {/* Search */}
                <div style={{ position: 'relative', maxWidth: 320, marginBottom: 18 }}>
                    <Search size={13} color={D.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search driver…"
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: D.card, border: `1px solid ${D.purpleBorder}`,
                            borderRadius: D.radiusSm, color: D.text,
                            fontSize: '0.85rem', padding: '9px 11px 9px 30px', outline: 'none',
                        }}
                    />
                </div>

                <DeliveryDivider label={`${filteredDrivers.length} driver${filteredDrivers.length !== 1 ? 's' : ''}`} />

                {/* Driver list */}
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
                ) : filteredDrivers.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState
                            icon={search ? Search : Users}
                            title={search ? 'No drivers match' : 'No drivers found'}
                            sub={search ? 'Try a different name.' : 'No drivers in the system yet.'}
                            action={search
                                ? <DeliveryBtn variant="ghost" size="sm" onClick={() => setSearch('')} onHover={audio.playHover}>Clear</DeliveryBtn>
                                : null
                            }
                        />
                    </DeliveryCard>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filteredDrivers.map(driver => (
                            <DriverRatingCard
                                key={driver.driver_id}
                                driver={driver}
                                onHover={audio.playHover}
                                onAdjust={setAdjustModal}
                                onToggleVisibility={handleToggleVisibility}
                            />
                        ))}
                    </div>
                )}

                {adjustModal && (
                    <AdjustRatingModal
                        driver={adjustModal}
                        onClose={() => setAdjustModal(null)}
                        onSubmit={handleAdjust}
                    />
                )}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}