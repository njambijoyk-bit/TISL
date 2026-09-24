// pages/admin/delivery/CreateManifestPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Truck, User, Calendar, Package, Search, Plus,
    Sparkles, ChevronRight, ChevronLeft, X, Loader2,
    CheckCircle, AlertTriangle, ArrowRight, MapPin,
    Clock, Zap, FileText, RefreshCw, ShieldAlert,
    Info, Car, Store, Handshake, ArrowLeft,
    Ban, Route,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
import AiManifestCreator from './AiManifestCreator';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatusBadge, DeliveryDivider,
    DeliveryBtn, DeliveryEmptyState, DriverAvatar,
} from './DeliveryShared';

const MODES = { CHOOSE: 'choose', MANUAL: 'manual', AI: 'ai' };
const STEPS_MANUAL = ['Details', 'Add orders'];

const DELIVERY_METHODS = [
    { value: 'internal_driver',  label: 'Internal Driver',     icon: Truck,    color: D.purple  },
    { value: 'courier',          label: 'External Courier',    icon: Car,      color: '#3b82f6' },
    { value: 'customer_pickup',  label: 'Customer Pickup',     icon: Store,    color: '#10b981' },
    { value: 'third_party',      label: 'Third-Party Partner', icon: Handshake,color: '#f59e0b' },
];

const ELIGIBLE_STATUSES = ['confirmed', 'processing', 'ready_for_pickup'];

const STATUS_LABELS = {
    pending:          'Pending',
    confirmed:        'Confirmed',
    processing:       'Processing',
    ready_for_pickup: 'Ready for pickup',
    shipped:          'Shipped',
    delivered:        'Delivered',
    failed:           'Failed',
    cancelled:        'Cancelled',
};

const INELIGIBLE_REASON = {
    pending:   'Order not yet confirmed — confirm it before adding to a manifest.',
    shipped:   'Already shipped.',
    delivered: 'Already delivered.',
    failed:    'Failed order — cannot be manifested.',
    cancelled: 'Cancelled order — cannot be manifested.',
};

function isEligible(status) {
    return ELIGIBLE_STATUSES.includes(status);
}

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function today() {
    return new Date().toISOString().split('T')[0];
}

const field = {
    label: { fontSize: '0.78rem', fontWeight: 600, color: D.textMid, display: 'block', marginBottom: 6 },
    input: { width: '100%', boxSizing: 'border-box', background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, color: D.text, fontSize: '0.85rem', padding: '9px 11px', outline: 'none' },
    error: { fontSize: '0.72rem', color: '#ef4444', marginTop: 4 },
};

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ steps, current }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
            {steps.map((s, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: done ? D.teal : active ? D.purple : D.purpleDim,
                                border: `2px solid ${done ? D.teal : active ? D.purple : D.purpleBorder}`,
                                fontSize: '0.72rem', fontWeight: 700,
                                color: done || active ? '#fff' : D.textDim,
                                transition: 'all 0.3s',
                            }}>
                                {done ? <CheckCircle size={13} /> : i + 1}
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 500, color: active ? D.text : done ? D.textMid : D.textDim, whiteSpace: 'nowrap' }}>{s}</span>
                        </div>
                        {i < steps.length - 1 && (
                            <div style={{ flex: 1, height: 1, background: done ? D.teal : D.purpleBorder, margin: '0 12px', transition: 'background 0.3s' }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Mode chooser ──────────────────────────────────────────────────────────────
function ModeChooser({ onChoose, onHover }) {
    const options = [
        { mode: MODES.MANUAL, icon: FileText, color: D.purple, title: 'Manual manifest', desc: 'Pick a driver, set a date, add orders, then plan the route on a dedicated page.' },
        { mode: MODES.AI,     icon: Sparkles, color: '#f59e0b', title: 'AI generate',    desc: 'Describe your delivery run and let AI suggest the optimal manifest with stops pre-organised.' },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 'clamp(12px, 3vw, 20px)', marginTop: 8 }}>
            {options.map(o => (
                <button key={o.mode}
                    onClick={() => { onHover(); onChoose(o.mode); }}
                    onMouseEnter={onHover}
                    style={{ background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusLg, padding: 'clamp(20px, 4vw, 28px)', cursor: 'pointer', textAlign: 'left', transition: 'box-shadow 0.2s, border-color 0.2s', color: D.text, display: 'flex', flexDirection: 'column', gap: 14 }}
                    onMouseOver={e => { e.currentTarget.style.boxShadow = D.purpleGlow; e.currentTarget.style.borderColor = o.color; }}
                    onMouseOut={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = D.purpleBorder; }}
                >
                    <div style={{ width: 44, height: 44, borderRadius: D.radius, background: `${o.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <o.icon size={22} color={o.color} />
                    </div>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>{o.title}</div>
                        <div style={{ fontSize: '0.8rem', color: D.textDim, lineHeight: 1.5 }}>{o.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: o.color, fontWeight: 600, marginTop: 4 }}>
                        Choose this <ChevronRight size={14} />
                    </div>
                </button>
            ))}
        </div>
    );
}

// ── Delivery method picker ────────────────────────────────────────────────────
function DeliveryMethodPicker({ value, onChange, onHover }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
            {DELIVERY_METHODS.map(m => {
                const selected = value === m.value;
                const Icon = m.icon;
                return (
                    <button key={m.value} onClick={() => onChange(m.value)} onMouseEnter={onHover}
                        style={{ background: selected ? `${m.color}15` : D.card, border: `2px solid ${selected ? m.color : D.purpleBorder}`, borderRadius: D.radius, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 8, color: D.text }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon size={18} color={m.color} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: selected ? m.color : D.text }}>{m.label}</span>
                        </div>
                        {selected && <div style={{ fontSize: '0.68rem', color: m.color, fontWeight: 600 }}>Selected</div>}
                    </button>
                );
            })}
        </div>
    );
}

// ── Driver picker ─────────────────────────────────────────────────────────────
function DriverPicker({ value, onChange, onHover, selectedOrderIds, onWarning }) {
    const [drivers, setDrivers]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [warnings, setWarnings] = useState({});

    useEffect(() => {
        deliveryAPI.getActiveDrivers()
            .then(res => {
                const list = res.data ?? [];
                setDrivers(list);
                if (selectedOrderIds?.length > 0) checkSafetyForDrivers(list, selectedOrderIds);
            })
            .catch(() => setDrivers([]))
            .finally(() => setLoading(false));
    }, [selectedOrderIds]);

    const checkSafetyForDrivers = async (driverList, orderIds) => {
        const safetyMap = {};
        for (const d of driverList) {
            try {
                const res = await deliveryAPI.checkDriverSafety(d.driver_id, orderIds);
                if (res.warning) safetyMap[d.driver_id] = res.warning;
            } catch (e) {
                if (e.response?.status === 409) safetyMap[d.driver_id] = e.response.data.warning;
            }
        }
        setWarnings(safetyMap);
        if (Object.keys(safetyMap).length > 0 && onWarning) onWarning(safetyMap);
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: D.textDim, padding: '10px 0' }}>
            <Loader2 size={14} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} /> Loading drivers…
        </div>
    );

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 10 }}>
            {drivers.map(d => {
                const selected = value === d.driver_id;
                const warning  = warnings[d.driver_id];
                return (
                    <button key={d.driver_id}
                        onClick={() => onChange(selected ? null : d.driver_id)}
                        onMouseEnter={onHover}
                        style={{ background: selected ? D.purpleDim : warning ? 'rgba(239,68,68,0.08)' : D.card, border: `2px solid ${selected ? D.purple : warning ? '#ef4444' : D.purpleBorder}`, borderRadius: D.radius, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10, color: D.text, position: 'relative' }}>
                        <DriverAvatar name={d.name} size={30} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                            <div style={{ fontSize: '0.68rem', color: D.textDim }}>{d.completed_manifests ?? 0} runs{d.active_manifests > 0 && ` · ${d.active_manifests} active`}</div>
                        </div>
                        {warning  && <ShieldAlert  size={16} color="#ef4444" title={warning} style={{ flexShrink: 0 }} />}
                        {selected && <CheckCircle  size={14} color={D.purple} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                    </button>
                );
            })}
            {drivers.length === 0 && (
                <div style={{ gridColumn: '1/-1', fontSize: '0.8rem', color: D.textDim, padding: '12px 0' }}>No active drivers found.</div>
            )}
        </div>
    );
}

// ── Safety warning modal ──────────────────────────────────────────────────────
function SafetyWarningModal({ warning, driverName, onOverride, onCancel, onHover, audio }) {
    const [reason, setReason] = useState('');
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
            <div onClick={e => e.stopPropagation()} style={{ background: D.card, border: '1px solid rgba(239,68,68,0.3)', borderRadius: D.radiusLg, padding: 'clamp(20px, 4vw, 28px)', width: '100%', maxWidth: 440 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <ShieldAlert size={24} color="#ef4444" />
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ef4444' }}>Driver Safety Warning</div>
                </div>
                <div style={{ fontSize: '0.82rem', color: D.textMid, lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>{driverName}</strong> has unresolved safety incidents with one or more customers in this manifest:
                    <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: D.radiusSm, border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.78rem' }}>{warning}</div>
                </div>
                <div style={{ marginBottom: 20 }}>
                    <label style={{ ...field.label, color: '#ef4444' }}>Override reason (required) *</label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why you're overriding this warning…" rows={2} style={{ ...field.input, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={onCancel} onHover={onHover}>Choose different driver</DeliveryBtn>
                    <DeliveryBtn variant="danger" size="sm" onClick={() => { if (!reason.trim()) { audio.playError(); return; } audio.playHover(); onOverride(reason); }} onHover={onHover} disabled={!reason.trim()}>Override & assign</DeliveryBtn>
                </div>
            </div>
        </div>
    );
}

// ── Ineligibility reason helper ───────────────────────────────────────────────
// Returns a human-readable reason string for display in the order list.
// eligibilityMap: { [orderId]: { reason, manifest_number, manifest_status } }
function getIneligibleReason(order, eligibilityMap) {
    const info = eligibilityMap[order.id];

    if (info?.reason === 'in_manifest') {
        const mnf = info.manifest_number ?? 'another manifest';
        const st  = info.manifest_status ? ` (${info.manifest_status})` : '';
        return `Already in ${mnf}${st} — remove it from that manifest first.`;
    }

    // Fall back to status-based reasons
    return INELIGIBLE_REASON[order.status] ?? `Status "${order.status}" not accepted.`;
}

// ── Order selector ────────────────────────────────────────────────────────────
function OrderSelector({ selected, onToggle, onHover, deliveryMethod }) {
    const [query, setQuery]         = useState('');
    const [orders, setOrders]       = useState([]);
    const [loading, setLoading]     = useState(false);
    const [checking, setChecking]   = useState(false);
    // eligibilityMap: { [orderId]: { eligible, reason, manifest_number, manifest_status, manifest_id } }
    const [eligibilityMap, setEligibilityMap] = useState({});
    const searchTimer = useRef(null);
    const eligTimer   = useRef(null);

    const search = useCallback(async (q) => {
        if (!q.trim()) { setOrders([]); setEligibilityMap({}); return; }
        setLoading(true);
        try {
            const res = await import('../../../api/axios').then(m =>
                m.default.get('/admin/orders', {
                    params: {
                        search: q,
                        status_not_in: 'shipped,delivered,failed,cancelled',
                        per_page: 20,
                    },
                })
            );
            const results = res.data?.data ?? [];
            setOrders(results);

            // Kick off eligibility check for the returned orders
            if (results.length > 0) {
                checkEligibility(results.map(o => o.id));
            } else {
                setEligibilityMap({});
            }
        } catch { setOrders([]); setEligibilityMap({}); }
        finally { setLoading(false); }
    }, []);

    const checkEligibility = useCallback(async (orderIds) => {
        if (!orderIds.length) return;
        setChecking(true);
        try {
            const res = await deliveryAPI.checkOrderEligibility(orderIds);
            const map = {};
            (res.data ?? []).forEach(item => {
                map[item.order_id] = item;
            });
            setEligibilityMap(map);
        } catch {
            // non-fatal — eligibility map just stays empty, status-based fallback applies
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => search(query), 350);
        return () => clearTimeout(searchTimer.current);
    }, [query, search]);

    const isSelected = (id) => selected.some(o => o.id === id);

    // An order is truly eligible if:
    //  1. its status passes the basic check, AND
    //  2. the eligibility endpoint says it's not in another manifest
    const isOrderEligible = (order) => {
        if (!isEligible(order.status)) return false;
        const info = eligibilityMap[order.id];
        // If we have eligibility info, trust it; if still loading, optimistically allow
        if (info) return info.eligible;
        return true;
    };

    const eligibleResults   = orders.filter(o => isOrderEligible(o));
    const ineligibleResults = orders.filter(o => !isOrderEligible(o));

    const [showAll, setShowAll] = useState(false);

    // Selected orders that are no longer eligible (status changed or now in a manifest)
    const ineligibleSelected = selected.filter(o => {
        if (!isEligible(o.status)) return true;
        const info = eligibilityMap[o.id];
        if (info && !info.eligible) return true;
        return false;
    });

    return (
        <div>
            <div style={{
                padding: '10px 14px', marginBottom: 14,
                background: `${D.purple}0d`,
                border: `1px solid ${D.purpleBorder}`,
                borderRadius: D.radiusSm,
                fontSize: '0.78rem', color: D.textMid, lineHeight: 1.6,
            }}>
                <div style={{ fontWeight: 600, color: D.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Info size={13} color={D.purple} /> Which orders can be added?
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                    {ELIGIBLE_STATUSES.map(s => (
                        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle size={11} color="#10b981" />
                            <span style={{ color: '#10b981', fontWeight: 600 }}>{STATUS_LABELS[s]}</span>
                        </span>
                    ))}
                    <span style={{ color: D.textDim }}>— Pending, shipped, cancelled, and orders already in a manifest cannot be added.</span>
                </div>
            </div>

            <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={13} color={D.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by order # or customer name…"
                    style={{ ...field.input, paddingLeft: 30 }}
                />
                {(loading || checking) && (
                    <Loader2 size={13} color={D.purple} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite' }} />
                )}
            </div>

            {orders.length > 0 && (
                <div style={{ border: `1px solid ${D.purpleBorder}`, borderRadius: D.radius, overflow: 'hidden', marginBottom: 16 }}>

                    {eligibleResults.map((o, i) => {
                        const sel = isSelected(o.id);
                        return (
                            <div key={o.id}
                                onClick={() => onToggle(o)}
                                onMouseEnter={onHover}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 14px', cursor: 'pointer',
                                    background: sel ? D.purpleDim : 'transparent',
                                    borderTop: i > 0 ? `1px solid ${D.purpleBorder}` : 'none',
                                    transition: 'background 0.15s',
                                }}
                            >
                                <div style={{
                                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                    border: `2px solid ${sel ? D.purple : D.purpleBorder}`,
                                    background: sel ? D.purple : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {sel && <CheckCircle size={11} color="#fff" />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.83rem', fontWeight: 600, color: D.text }}>{o.order_number}</div>
                                    <div style={{ fontSize: '0.72rem', color: D.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {o.customer?.first_name} {o.customer?.last_name}
                                        {o.shipping_address ? ` · ${o.shipping_address}` : ''}
                                    </div>
                                </div>
                                <StatusBadge status={o.status} />
                            </div>
                        );
                    })}

                    {ineligibleResults.length > 0 && (
                        <>
                            <div
                                onClick={() => setShowAll(v => !v)}
                                style={{
                                    padding: '8px 14px', cursor: 'pointer',
                                    borderTop: `1px solid ${D.purpleBorder}`,
                                    background: 'rgba(239,68,68,0.04)',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    fontSize: '0.72rem', color: '#ef4444', fontWeight: 600,
                                }}
                            >
                                <Ban size={12} />
                                {ineligibleResults.length} order{ineligibleResults.length !== 1 ? 's' : ''} can't be added
                                <span style={{ marginLeft: 'auto', color: D.textDim, fontWeight: 400 }}>
                                    {showAll ? 'Hide' : 'Show why'}
                                </span>
                            </div>

                            {showAll && ineligibleResults.map((o, i) => {
                                const reason = getIneligibleReason(o, eligibilityMap);
                                const isManifest = eligibilityMap[o.id]?.reason === 'in_manifest';
                                return (
                                    <div key={o.id} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 12,
                                        padding: '10px 14px', opacity: 0.75,
                                        borderTop: `1px solid ${D.purpleBorder}`,
                                        background: isManifest ? 'rgba(245,158,11,0.04)' : 'rgba(239,68,68,0.03)',
                                        cursor: 'not-allowed',
                                    }}>
                                        <div style={{
                                            width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                                            border: `2px solid ${isManifest ? '#f59e0b40' : '#ef444440'}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Ban size={10} color={isManifest ? '#f59e0b' : '#ef4444'} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.83rem', fontWeight: 600, color: D.textMid }}>{o.order_number}</div>
                                            <div style={{ fontSize: '0.7rem', color: isManifest ? '#f59e0b' : '#ef4444', marginTop: 2, lineHeight: 1.4 }}>
                                                {reason}
                                            </div>
                                        </div>
                                        <StatusBadge status={o.status} />
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {query && !loading && orders.length === 0 && (
                <div style={{ fontSize: '0.78rem', color: D.textDim, padding: '8px 0 16px' }}>
                    No matching orders found.
                </div>
            )}

            {ineligibleSelected.length > 0 && (
                <div style={{
                    marginBottom: 12,
                    padding: '10px 14px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: D.radiusSm,
                    fontSize: '0.78rem', color: '#ef4444',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={13} />
                        {ineligibleSelected.length} selected order{ineligibleSelected.length !== 1 ? 's' : ''} will be rejected by the backend:
                    </div>
                    {ineligibleSelected.map(o => (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontWeight: 600 }}>{o.order_number}</span>
                            <span style={{ opacity: 0.8 }}>— {getIneligibleReason(o, eligibilityMap)}</span>
                            <button
                                onClick={() => onToggle(o)}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 2 }}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {selected.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: D.purple, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        {selected.length} order{selected.length !== 1 ? 's' : ''} added
                        {ineligibleSelected.length > 0 && (
                            <span style={{ color: '#ef4444', marginLeft: 6 }}>
                                ({ineligibleSelected.length} ineligible)
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selected.map(o => {
                            const eligible = isOrderEligible(o);
                            return (
                                <div key={o.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px',
                                    background: eligible ? D.purpleDim : 'rgba(239,68,68,0.08)',
                                    border: `1px solid ${eligible ? D.purpleBorder : 'rgba(239,68,68,0.3)'}`,
                                    borderRadius: D.radiusSm,
                                }}>
                                    {eligible
                                        ? <Package size={13} color={D.purple} />
                                        : <AlertTriangle size={13} color="#ef4444" />
                                    }
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: eligible ? D.text : '#ef4444', flex: 1 }}>
                                        {o.order_number}
                                    </span>
                                    <StatusBadge status={o.status} />
                                    <span style={{ fontSize: '0.72rem', color: D.textDim }}>
                                        {o.customer?.first_name} {o.customer?.last_name}
                                    </span>
                                    <button
                                        onClick={e => { e.stopPropagation(); onToggle(o); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, display: 'flex', padding: 2 }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Manual flow ───────────────────────────────────────────────────────────────
function ManualFlow({ onBack, onSuccess, audio }) {
    const navigate = useNavigate();
    const [step, setStep]             = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors]         = useState({});
    const [apiError, setApiError]     = useState(null);

    const [form, setForm] = useState({
        driver_id: null, scheduled_date: today(), notes: '',
        delivery_method: 'internal_driver', override_reason: '',
    });

    const [selectedOrders, setSelectedOrders] = useState([]);
    const [showSafetyModal, setShowSafetyModal] = useState(false);
    const [safetyInfo, setSafetyInfo]           = useState(null);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isInternalDriver = form.delivery_method === 'internal_driver';

    const eligibleSelected = selectedOrders.filter(o => isEligible(o.status));

    const validateStep = (s) => {
        const e = {};
        if (s === 0) {
            if (!form.scheduled_date) e.scheduled_date = 'Choose a scheduled date.';
            if (isInternalDriver && !form.driver_id) e.driver_id = 'Select a driver.';
        }
        if (s === 1) {
            if (eligibleSelected.length === 0)
                e.orders = 'Add at least one eligible order (confirmed, processing, or ready for pickup).';
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleNext = () => {
        if (!validateStep(step)) { audio.playError(); return; }
        audio.playHover();
        setStep(s => s + 1);
    };
    const handleBack = () => { audio.playHover(); setStep(s => s - 1); };

    const handleCreateManifest = async () => {
        if (!validateStep(0) || !validateStep(1)) { audio.playError(); return; }
        setSubmitting(true);
        setApiError(null);
        const payload = {
            scheduled_date: form.scheduled_date,
            notes: form.notes || undefined,
            order_ids: eligibleSelected.map(o => o.id),
            delivery_method: form.delivery_method,
            ...(isInternalDriver && form.driver_id && { driver_id: form.driver_id }),
        };
        try {
            const res = await deliveryAPI.createManifest(payload);
            const manifest = res.data ?? res;

            // Warn if some orders were skipped (already in another manifest)
            if (res.skipped_count > 0) {
                const skippedNums = (res.skipped_orders ?? [])
                    .map(s => s.manifest_number ? `(${s.manifest_number})` : '')
                    .filter(Boolean)
                    .join(', ');
                console.warn(`${res.skipped_count} order(s) were skipped — already in another manifest. ${skippedNums}`);
            }

            audio.playSuccess();
            onSuccess(manifest.id);
        } catch (e) {
            const status = e.response?.status;
            const data   = e.response?.data;
            if (status === 409 && data?.requires_override) {
                setSafetyInfo({ warning: data.warning, driverId: data.driver_id, driverName: data.driver_name });
                setShowSafetyModal(true);
            } else {
                setApiError(data?.message || 'Failed to create manifest.');
                if (data?.errors) setErrors(data.errors);
                audio.playError();
            }
        } finally { setSubmitting(false); }
    };

    const handleOverride = async (reason) => {
        setForm(f => ({ ...f, override_reason: reason }));
        setShowSafetyModal(false);
        setSubmitting(true);
        try {
            const payload = {
                scheduled_date: form.scheduled_date,
                notes: form.notes || undefined,
                order_ids: eligibleSelected.map(o => o.id),
                delivery_method: form.delivery_method,
                override_reason: reason,
                ...(isInternalDriver && form.driver_id && { driver_id: form.driver_id }),
            };
            const res = await deliveryAPI.createManifest(payload);
            const manifest = res.data ?? res;
            audio.playSuccess();
            onSuccess(manifest.id);
        } catch (e) {
            const data = e.response?.data;
            setApiError(data?.message || 'Failed to create manifest with override.');
            audio.playError();
        } finally { setSubmitting(false); }
    };

    const selectedOrderIds = selectedOrders.map(o => o.id);

    return (
        <div>
            <StepIndicator steps={STEPS_MANUAL} current={step} />

            {apiError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: D.radiusSm, padding: '10px 14px', color: '#ef4444', fontSize: '0.82rem', marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{apiError}</div>
                    {Object.entries(errors).filter(([k]) => k !== 'general').map(([k, v]) => (
                        <div key={k} style={{ fontSize: '0.75rem', marginLeft: 8 }}>• {k}: {Array.isArray(v) ? v[0] : v}</div>
                    ))}
                </div>
            )}

            {/* ── Step 0: Details ── */}
            {step === 0 && (
                <DeliveryCard>
                    <div style={{ marginBottom: 20 }}>
                        <label style={field.label}>Delivery method *</label>
                        <DeliveryMethodPicker value={form.delivery_method} onChange={v => set('delivery_method', v)} onHover={audio.playHover} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                        <label style={field.label}>Scheduled date *</label>
                        <input type="date" value={form.scheduled_date} min={today()} onChange={e => set('scheduled_date', e.target.value)} style={{ ...field.input, maxWidth: 200 }} />
                        {errors.scheduled_date && <div style={field.error}>{errors.scheduled_date}</div>}
                    </div>
                    <div style={{ marginBottom: 20 }}>
                        <label style={field.label}>Notes (optional)</label>
                        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any special instructions for this run…" rows={2} style={{ ...field.input, resize: 'vertical' }} />
                    </div>
                    {isInternalDriver && (
                        <>
                            <DeliveryDivider label="Assign driver *" />
                            <DriverPicker
                                value={form.driver_id}
                                onChange={v => { set('driver_id', v); setErrors(e => ({ ...e, driver_id: undefined })); }}
                                onHover={audio.playHover}
                                selectedOrderIds={selectedOrderIds}
                            />
                            {errors.driver_id && <div style={{ ...field.error, marginTop: 8 }}>{errors.driver_id}</div>}
                        </>
                    )}
                    {!isInternalDriver && (
                        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: D.radiusSm, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Info size={14} color="#3b82f6" />
                            <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}>
                                {form.delivery_method === 'courier'          && 'An external courier will handle this delivery. No internal driver needed.'}
                                {form.delivery_method === 'customer_pickup'  && 'Customer will collect from your location. No driver assignment needed.'}
                                {form.delivery_method === 'third_party'      && 'A third-party delivery partner will handle fulfillment.'}
                            </span>
                        </div>
                    )}
                </DeliveryCard>
            )}

            {/* ── Step 1: Add orders ── */}
            {step === 1 && (
                <DeliveryCard>
                    <OrderSelector
                        selected={selectedOrders}
                        onToggle={o => {
                            audio.playHover();
                            setSelectedOrders(prev =>
                                prev.some(x => x.id === o.id)
                                    ? prev.filter(x => x.id !== o.id)
                                    : [...prev, o]
                            );
                        }}
                        onHover={audio.playHover}
                        deliveryMethod={form.delivery_method}
                    />
                    {errors.orders && <div style={{ ...field.error, marginTop: 8 }}>{errors.orders}</div>}
                </DeliveryCard>
            )}

            {/* Footer nav */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                <DeliveryBtn variant="ghost" size="sm" onClick={step === 0 ? onBack : handleBack} onHover={audio.playHover}>
                    <ChevronLeft size={14} /> {step === 0 ? 'Change mode' : 'Back'}
                </DeliveryBtn>

                {step === 0 && <DeliveryBtn variant="primary" size="md" onClick={handleNext} onHover={audio.playHover}>Next <ChevronRight size={14} /></DeliveryBtn>}
                {step === 1 && (
                    <DeliveryBtn variant="primary" size="md" onClick={handleCreateManifest} onHover={audio.playHover} disabled={submitting || eligibleSelected.length === 0}>
                        {submitting
                            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</>
                            : <><CheckCircle size={14} /> Create manifest ({eligibleSelected.length})</>
                        }
                    </DeliveryBtn>
                )}
            </div>

            {showSafetyModal && safetyInfo && (
                <SafetyWarningModal
                    warning={safetyInfo.warning}
                    driverName={safetyInfo.driverName}
                    onOverride={handleOverride}
                    onCancel={() => { setShowSafetyModal(false); setForm(f => ({ ...f, driver_id: null })); }}
                    onHover={audio.playHover}
                    audio={audio}
                />
            )}
        </div>
    );
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ manifestId, onView, onPlanRoute, onCreateAnother, onHover }) {
    return (
        <div style={{ textAlign: 'center', padding: 'clamp(40px, 8vw, 64px) 16px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(20,184,166,0.15)', border: `2px solid ${D.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={30} color={D.teal} />
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: D.text, marginBottom: 8 }}>Manifest created!</div>
            <div style={{ fontSize: '0.82rem', color: D.textDim, marginBottom: 28, maxWidth: 340, margin: '0 auto 28px' }}>
                The manifest and its orders are saved. You can plan the delivery route now or come back later.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <DeliveryBtn variant="ghost" size="md" onClick={onCreateAnother} onHover={onHover}><Plus size={14} /> Create another</DeliveryBtn>
                <DeliveryBtn variant="secondary" size="md" onClick={onView} onHover={onHover}>View manifest</DeliveryBtn>
                <DeliveryBtn variant="primary" size="md" onClick={onPlanRoute} onHover={onHover}><Route size={14} /> Plan route</DeliveryBtn>
            </div>
        </div>
    );
}

// ── Page root ─────────────────────────────────────────────────────────────────
export default function CreateManifestPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();
    const [mode, setMode]           = useState(MODES.CHOOSE);
    const [createdId, setCreatedId] = useState(null);

    const handleSuccess = (id) => { setCreatedId(id); setMode('done'); };

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[
                        { label: 'Delivery',  onClick: () => navigate('/admin/delivery') },
                        { label: 'Manifests', onClick: () => navigate('/admin/delivery/manifests') },
                        { label: 'New manifest' },
                    ]}
                    onHover={audio.playHover}
                />
                <DeliveryPageHeader
                    title="New manifest"
                    sub={
                        mode === MODES.MANUAL ? 'Manual — pick a driver, add orders, then plan route separately' :
                        mode === MODES.AI     ? 'AI generate — describe your run and let AI build it' :
                        mode === 'done'       ? 'Manifest saved' :
                        'Choose how you want to create this manifest'
                    }
                />

                {mode === MODES.CHOOSE && <ModeChooser onChoose={setMode} onHover={audio.playHover} />}
                {mode === MODES.MANUAL && <ManualFlow onBack={() => { audio.playHover(); setMode(MODES.CHOOSE); }} onSuccess={handleSuccess} audio={audio} />}
                {mode === MODES.AI && <AiManifestCreator onBack={() => { audio.playHover(); setMode(MODES.CHOOSE); }} onSuccess={handleSuccess} audio={audio} />}
                {mode === 'done' && (
                    <DeliveryCard>
                        <SuccessScreen
                            manifestId={createdId}
                            onView={() => navigate(`/admin/delivery/manifests/${createdId}`)}
                            onPlanRoute={() => navigate(`/admin/delivery/manifests/${createdId}/route`)}
                            onCreateAnother={() => { setCreatedId(null); setMode(MODES.CHOOSE); }}
                            onHover={audio.playHover}
                        />
                    </DeliveryCard>
                )}

                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
                    select option { background: #1e1b2e; color: #e2e8f0; }
                `}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}