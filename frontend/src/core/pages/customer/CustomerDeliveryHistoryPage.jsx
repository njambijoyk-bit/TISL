import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Star, Flag, RefreshCw, Search, Filter,
    ChevronLeft, ChevronRight, Loader2,
    MessageSquare, AlertTriangle, Shield,
    ThumbsUp, ThumbsDown, User, Truck,
} from 'lucide-react';
import CustomerLayout from '../../../_shared/components/layout/CustomerLayout';
import deliveryAPI from '../../../_shared/api/delivery';
import toast from 'react-hot-toast';

// ── Theme tokens (inline) ─────────────────────────────────────────────────────
const D = {
    card: 'var(--color-surface, #ffffff)',
    purple: '#a855f7',
    purpleDim: 'rgba(168,85,247,0.08)',
    purpleBorder: 'rgba(168,85,247,0.15)',
    text: '#111827',
    textMid: '#6b7280',
    textDim: '#9ca3af',
    teal: '#10b981',
    radius: 14,
    radiusSm: 10,
};

const SEVERITY_COLORS = {
    low:      { bg: 'rgba(16,185,129,0.08)',  color: '#059669', label: 'Low' },
    medium:   { bg: 'rgba(245,158,11,0.08)',  color: '#d97706', label: 'Medium' },
    high:     { bg: 'rgba(239,68,68,0.08)',   color: '#dc2626', label: 'High' },
    critical: { bg: 'rgba(109,40,217,0.08)',  color: '#7c3aed', label: 'Critical' },
};

const STATUS_COLORS = {
    open:         { bg: 'rgba(239,68,68,0.08)',  color: '#dc2626', label: 'Open' },
    under_review: { bg: 'rgba(245,158,11,0.08)',  color: '#d97706', label: 'Under Review' },
    resolved:     { bg: 'rgba(16,185,129,0.08)',  color: '#059669', label: 'Resolved' },
    dismissed:    { bg: 'rgba(148,163,184,0.08)', color: '#64748b', label: 'Dismissed' },
};

const CATEGORY_LABELS = {
    misconduct:      'Misconduct',
    rude_customer:   'Rude Customer',
    security_issue:  'Security Issue',
    road_condition:  'Road Condition',
    assault:         'Assault',
    property_damage: 'Property Damage',
    other:           'Other',
};

const PER_PAGE = 10;

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Star display ──────────────────────────────────────────────────────────────
function StarDisplay({ value, size = 14 }) {
    return (
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {[1, 2, 3, 4, 5].map(n => (
                <Star
                    key={n}
                    size={size}
                    fill={n <= value ? '#f59e0b' : 'none'}
                    color={n <= value ? '#f59e0b' : '#d1d5db'}
                    strokeWidth={1.5}
                />
            ))}
        </div>
    );
}

// ── Badge components ──────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
    const cfg = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;
    return (
        <span style={{
            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color,
        }}>
            {cfg.label}
        </span>
    );
}

function StatusBadge({ status }) {
    const cfg = STATUS_COLORS[status] ?? STATUS_COLORS.open;
    return (
        <span style={{
            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color,
        }}>
            {cfg.label}
        </span>
    );
}

// ── Driver Rating Modal ───────────────────────────────────────────────────────
function DriverRatingModal({ driver, orderId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        deliveryAPI.getDriverRatingForOrder(orderId)
            .then(res => setData(res))
            .catch(() => setError('Could not load driver rating.'))
            .finally(() => setLoading(false));
    }, [orderId]);

    // Close on backdrop click
    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            onClick={handleBackdrop}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
        >
            <div style={{
                background: D.card, borderRadius: D.radius,
                border: `1px solid ${D.purpleBorder}`,
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                width: '100%', maxWidth: 340, padding: 28,
                textAlign: 'center',
            }}>
                {/* Avatar */}
                <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                }}>
                    <User size={24} color="white" />
                </div>

                <div style={{ fontSize: '0.72rem', color: D.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Driver Rating
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: D.text, marginBottom: 20 }}>
                    {driver.name}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                        <Loader2 size={22} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : error ? (
                    <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>{error}</p>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                            <StarDisplay value={Math.round(data.overall_rating ?? 0)} size={28} />
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: D.text, lineHeight: 1 }}>
                            {data.overall_rating != null ? Number(data.overall_rating).toFixed(1) : '—'}
                        </div>
                    </>
                )}

                <button
                    onClick={onClose}
                    style={{
                        marginTop: 24, width: '100%',
                        padding: '10px 0', borderRadius: D.radiusSm,
                        border: `1px solid ${D.purpleBorder}`,
                        background: D.purpleDim, color: D.purple,
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    );
}

// ── Rating Card ───────────────────────────────────────────────────────────────
function RatingCard({ rating, onDriverClick }) {
    return (
        <div style={{
            background: D.card, border: `1px solid ${D.purpleBorder}`,
            borderRadius: D.radius, padding: 'clamp(12px, 2vw, 16px)',
            transition: 'box-shadow 0.2s',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #fbbf24, #d97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <Star size={18} color="white" fill="white" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <StarDisplay value={rating.rating} />
                        <span style={{ fontSize: '0.7rem', color: D.textDim, marginLeft: 'auto' }}>
                            {fmtDate(rating.created_at)}
                        </span>
                    </div>

                    {rating.comment && (
                        <p style={{ fontSize: '0.82rem', color: D.textMid, fontStyle: 'italic', margin: '0 0 8px', lineHeight: 1.5 }}>
                            "{rating.comment}"
                        </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {rating.driver && (
                            <button
                                onClick={() => onDriverClick(rating.driver, rating.order_id)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '3px 10px', borderRadius: 20,
                                    background: D.purpleDim, border: 'none',
                                    fontSize: '0.72rem', color: D.purple, fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                <User size={12} />
                                {rating.driver.name}
                            </button>
                        )}
                        {rating.order?.order_number && (
                            <span style={{ fontSize: '0.72rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Truck size={11} /> {rating.order.order_number}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Incident Card ─────────────────────────────────────────────────────────────
function IncidentCard({ incident }) {
    const catLabel = CATEGORY_LABELS[incident.category] ?? incident.category;
    const [expanded, setExpanded] = useState(false);

    return (
        <div style={{
            background: D.card, border: `1px solid ${expanded ? 'rgba(239,68,68,0.3)' : D.purpleBorder}`,
            borderRadius: D.radius, overflow: 'hidden',
            transition: 'border-color 0.2s',
        }}>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 16px)',
                    cursor: 'pointer', flexWrap: 'wrap',
                }}
            >
                <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: SEVERITY_COLORS[incident.severity]?.color ?? '#94a3b8',
                    boxShadow: `0 0 6px ${SEVERITY_COLORS[incident.severity]?.color ?? '#94a3b8'}`,
                    flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text, marginBottom: 2 }}>
                        #{incident.id}
                        <span style={{ fontSize: '0.72rem', color: D.textDim, fontWeight: 500, marginLeft: 8, textTransform: 'capitalize' }}>
                            {catLabel}
                        </span>
                    </div>
                    {incident.filed_by_me === false && (
                        <span style={{
                            fontSize: '0.65rem', padding: '1px 7px', borderRadius: 20, marginLeft: 8,
                            background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontWeight: 700,
                        }}>
                            Filed against you
                        </span>
                    )}
                    <div style={{ fontSize: '0.73rem', color: D.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(() => {
                            const text = incident.is_redacted
                                ? (incident.redacted_description ?? '')
                                : (incident.visible_description ?? incident.description ?? '');
                            return text.substring(0, 80) + (text.length > 80 ? '…' : '');
                        })()}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <SeverityBadge severity={incident.severity} />
                    <StatusBadge status={incident.status} />
                    {expanded ? <ChevronLeft size={14} style={{ transform: 'rotate(-90deg)' }} color={D.textDim} /> : <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} color={D.textDim} />}
                </div>
            </div>

            {expanded && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: 'clamp(12px, 2vw, 16px)' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                        gap: 14,
                    }}>
                        <div>
                            <Label>Category</Label>
                            <Value>{catLabel}</Value>
                        </div>
                        <div>
                            <Label>Severity</Label>
                            <SeverityBadge severity={incident.severity} />
                        </div>
                        <div>
                            <Label>Status</Label>
                            <StatusBadge status={incident.status} />
                        </div>
                        <div>
                            <Label>Reported against</Label>
                            <Value>{incident.filed_by_me === false ? 'You' : (incident.accused?.name ?? '—')}</Value>
                        </div>
                        {incident.filed_by_me !== false && incident.manifest?.manifest_number && (
                            <div>
                                <Label>Manifest</Label>
                                <Value>{incident.manifest.manifest_number}</Value>
                            </div>
                        )}
                        <div>
                            <Label>Created</Label>
                            <Value>{fmtDate(incident.created_at)}</Value>
                        </div>
                        {incident.resolved_at && (
                            <div>
                                <Label>Resolved</Label>
                                <Value style={{ color: D.teal }}>{fmtDate(incident.resolved_at)}</Value>
                            </div>
                        )}
                    </div>
                    <div>
                        <Label>Description</Label>
                        <div style={{
                            padding: '10px 12px', borderRadius: D.radiusSm, marginTop: 4,
                            background: 'rgba(168,85,247,0.07)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            boxShadow: '0 0 10px rgba(168,85,247,0.2)',
                            fontSize: '0.82rem', color: D.purple, lineHeight: 1.5,
                        }}>
                            <Value>
                                {incident.is_redacted
                                    ? (incident.redacted_description ?? '—')
                                    : (incident.visible_description ?? incident.description ?? '—')
                                }
                            </Value>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Label({ children }) {
    return <div style={{ fontSize: '0.68rem', fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{children}</div>;
}
function Value({ children, style = {} }) {
    return <div style={{ fontSize: '0.82rem', color: D.text, fontWeight: 500, ...style }}>{children}</div>;
}

// ── Pagination ──────────────────────────────────────────────────────────────────
function Pagination({ meta, onPage }) {
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
            <span style={{ fontSize: '0.75rem', color: D.textDim }}>{from}–{to} of {total}</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={btnStyle(false, current_page === 1)} disabled={current_page === 1} onClick={() => onPage(current_page - 1)}>
                    <ChevronLeft size={14} />
                </button>
                {pages.map((p, i) =>
                    typeof p === 'number' ? (
                        <button key={p} style={btnStyle(p === current_page, false)} onClick={() => onPage(p)}>{p}</button>
                    ) : (
                        <span key={p + i} style={{ padding: '5px 4px', color: D.textDim, fontSize: '0.78rem' }}>…</span>
                    )
                )}
                <button style={btnStyle(false, current_page === last_page)} disabled={current_page === last_page} onClick={() => onPage(current_page + 1)}>
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerDeliveryHistoryPage() {
    const [activeTab, setActiveTab] = useState('ratings'); // 'ratings' | 'incidents'
    
    const [ratings, setRatings] = useState([]);
    const [ratingMeta, setRatingMeta] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [incidentMeta, setIncidentMeta] = useState(null);
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    
    const [search, setSearch] = useState('');
    const [driverFilter, setDriverFilter] = useState('');
    const [ratingPage, setRatingPage] = useState(1);
    const [incidentPage, setIncidentPage] = useState(1);
    const [driverModal, setDriverModal] = useState(null); // { id, name, orderId }
    
    const searchTimer = useRef(null);

    // Extract unique driver names from ratings for filter dropdown
    const driverOptions = useCallback(() => {
        const map = new Map();
        ratings.forEach(r => {
            if (r.driver?.id && r.driver?.name) {
                map.set(r.driver.id, r.driver.name);
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [ratings]);

    const fetchRatings = useCallback(async (silent = false, page = 1) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getMyDriverRatings({ page, per_page: PER_PAGE });
            const data = res.ratings?.data ?? [];
            const meta = res.ratings ?? null;
            
            // Normalize
            const normalized = data.map(r => ({
                ...r,
                customer_name: r.customer 
                    ? `${r.customer.first_name ?? ''} ${r.customer.last_name ?? ''}`.trim() 
                    : 'Anonymous',
            }));
            
            setRatings(normalized);
            setRatingMeta(meta ? {
                current_page: meta.current_page,
                last_page: meta.last_page,
                from: meta.from,
                to: meta.to,
                total: meta.total,
            } : null);
        } catch (err) {
            console.error('Ratings fetch error:', err);
            setError('Failed to load ratings.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const fetchIncidents = useCallback(async (silent = false, page = 1) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getMyIncidents({ page, per_page: PER_PAGE });
            const data = res.data?.data ?? res.data ?? [];
            const meta = res.data ?? null;
            
            setIncidents(Array.isArray(data) ? data : []);
            setIncidentMeta(meta && meta.current_page ? {
                current_page: meta.current_page,
                last_page: meta.last_page,
                from: meta.from,
                to: meta.to,
                total: meta.total,
            } : null);
        } catch (err) {
            console.error('Incidents fetch error:', err);
            setError('Failed to load incidents.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchRatings(false, ratingPage);
        fetchIncidents(false, incidentPage);
    }, []);

    // Re-fetch on page change
    useEffect(() => {
        if (activeTab === 'ratings') fetchRatings(false, ratingPage);
    }, [ratingPage]);

    useEffect(() => {
        if (activeTab === 'incidents') fetchIncidents(false, incidentPage);
    }, [incidentPage]);

    // Search debounce
    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            // Client-side filtering only — API doesn't support search on these endpoints
            // If you want server-side, add search params to the API calls above
        }, 350);
        return () => clearTimeout(searchTimer.current);
    }, [search, driverFilter]);

    const handleRefresh = () => {
        if (activeTab === 'ratings') fetchRatings(true, ratingPage);
        else fetchIncidents(true, incidentPage);
    };

    // Filter displayed items
    const filteredRatings = ratings.filter(r => {
        const matchesSearch = !search || 
            r.comment?.toLowerCase().includes(search.toLowerCase()) ||
            r.driver?.name?.toLowerCase().includes(search.toLowerCase()) ||
            r.order?.order_number?.toLowerCase().includes(search.toLowerCase());
        const matchesDriver = !driverFilter || r.driver?.id === Number(driverFilter);
        return matchesSearch && matchesDriver;
    });

    const filteredIncidents = incidents.filter(i => {
        const matchesSearch = !search ||
            i.description?.toLowerCase().includes(search.toLowerCase()) ||
            i.accused?.name?.toLowerCase().includes(search.toLowerCase()) ||
            i.category?.toLowerCase().includes(search.toLowerCase());
        const matchesDriver = !driverFilter || i.accused?.id === Number(driverFilter);
        return matchesSearch && matchesDriver;
    });

    const currentItems = activeTab === 'ratings' ? filteredRatings : filteredIncidents;
    const currentMeta = activeTab === 'ratings' ? ratingMeta : incidentMeta;

    return (
        <CustomerLayout>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px, 3vw, 32px) clamp(12px, 3vw, 24px)' }}>
                
                {/* Header */}
                <div style={{ marginBottom: 24 }}>
                    <h1 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.7rem)', fontWeight: 800, color: D.text, margin: '0 0 6px' }}>
                        My Delivery History
                    </h1>
                    <p style={{ fontSize: '0.9rem', color: D.textMid, margin: 0 }}>
                        All your ratings and incident reports in one place.
                    </p>
                </div>

                {/* Tab Switcher */}
                <div style={{
                    display: 'flex', gap: 4, marginBottom: 24,
                    background: 'rgba(168,85,247,0.06)', borderRadius: 12,
                    padding: 4,
                }}>
                    {[
                        { key: 'ratings', label: 'My Ratings', icon: Star, count: ratingMeta?.total ?? ratings.length },
                        { key: 'incidents', label: 'My Incidents', icon: Flag, count: incidentMeta?.total ?? incidents.length },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                padding: '10px 16px', borderRadius: 10, border: 'none',
                                background: activeTab === tab.key ? 'white' : 'transparent',
                                color: activeTab === tab.key ? D.purple : D.textMid,
                                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                boxShadow: activeTab === tab.key ? '0 2px 8px rgba(168,85,247,0.12)' : 'none',
                                transition: 'all 0.2s',
                            }}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                            <span style={{
                                fontSize: '0.7rem', padding: '1px 7px', borderRadius: 20,
                                background: activeTab === tab.key ? D.purpleDim : 'rgba(0,0,0,0.05)',
                                color: activeTab === tab.key ? D.purple : D.textDim,
                                fontWeight: 700,
                            }}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'flex-end' }}>
                    <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 180 }}>
                        <Search size={13} color={D.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={`Search ${activeTab}…`}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, color: D.text,
                                fontSize: '0.85rem', padding: '9px 11px 9px 30px', outline: 'none',
                            }}
                        />
                    </div>
                    
                    {/* Driver filter — only show if we have multiple drivers */}
                    {driverOptions().length > 1 && (
                        <div style={{ flex: '0 1 180px', minWidth: 140 }}>
                            <select
                                value={driverFilter}
                                onChange={e => setDriverFilter(e.target.value)}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: D.card, border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radiusSm, color: D.text,
                                    fontSize: '0.82rem', padding: '9px 10px', outline: 'none', cursor: 'pointer',
                                }}
                            >
                                <option value="">All drivers</option>
                                {driverOptions().map(([id, name]) => (
                                    <option key={id} value={id}>{name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '9px 14px', borderRadius: D.radiusSm,
                            border: `1px solid ${D.purpleBorder}`, background: 'transparent',
                            color: D.textMid, fontSize: '0.82rem', fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                        Refresh
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '60px 0', color: D.textDim }}>
                        <Loader2 size={20} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.9rem' }}>Loading…</span>
                    </div>
                ) : error ? (
                    <div style={{
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: D.radius, padding: '24px 16px', textAlign: 'center',
                    }}>
                        <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: '0 0 12px' }}>{error}</p>
                        <button onClick={handleRefresh} style={{
                            padding: '8px 16px', borderRadius: D.radiusSm,
                            border: '1px solid #ef4444', background: 'transparent',
                            color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                        }}>
                            <RefreshCw size={13} /> Retry
                        </button>
                    </div>
                ) : currentItems.length === 0 ? (
                    <div style={{
                        background: D.card, border: `1px solid ${D.purpleBorder}`,
                        borderRadius: D.radius, padding: '48px 24px', textAlign: 'center',
                    }}>
                        {activeTab === 'ratings' ? (
                            <>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: D.purpleDim, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 16px',
                                }}>
                                    <Star size={24} color={D.purple} />
                                </div>
                                <p style={{ fontSize: '1rem', fontWeight: 700, color: D.text, margin: '0 0 6px' }}>No ratings yet</p>
                                <p style={{ fontSize: '0.85rem', color: D.textMid, margin: 0 }}>
                                    You haven't rated any deliveries yet. Ratings appear after you complete the rating flow from your order tracking page.
                                </p>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: 'rgba(16,185,129,0.08)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 16px',
                                }}>
                                    <Shield size={24} color={D.teal} />
                                </div>
                                <p style={{ fontSize: '1rem', fontWeight: 700, color: D.text, margin: '0 0 6px' }}>No incidents reported</p>
                                <p style={{ fontSize: '0.85rem', color: D.textMid, margin: 0 }}>
                                    You haven't filed any incident reports. That's great news!
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {activeTab === 'ratings' 
                            ? filteredRatings.map(r => (
                                <RatingCard
                                    key={r.id}
                                    rating={r}
                                    onDriverClick={(driver, orderId) => setDriverModal({ ...driver, orderId })}
                                />
                            ))
                            : filteredIncidents.map(i => <IncidentCard key={i.id} incident={i} />)
                        }
                    </div>
                )}

                {/* Pagination */}
                {!loading && !error && currentMeta && (
                    <Pagination 
                        meta={currentMeta} 
                        onPage={p => {
                            if (activeTab === 'ratings') setRatingPage(p);
                            else setIncidentPage(p);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} 
                    />
                )}

                {driverModal && (
                    <DriverRatingModal
                        driver={driverModal}
                        orderId={driverModal.orderId}
                        onClose={() => setDriverModal(null)}
                    />
                )}

                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    select option { background: white; color: #111827; }
                `}</style>
            </div>
        </CustomerLayout>
    );
}