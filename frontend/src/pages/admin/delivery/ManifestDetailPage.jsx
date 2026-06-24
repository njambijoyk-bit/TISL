import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Truck, Package, User, Calendar, MapPin, Clock, ShieldAlert,
    CheckCircle, XCircle, AlertTriangle, RefreshCw, Route,
    ChevronDown, ChevronUp, Navigation, Send, Ban,
    Loader2, Printer, RotateCcw, Activity, Edit2,
    ArrowLeft, Image as ImageIcon, Star, Trash2,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import DriverTrackingModal from './DriverTrackingModal';
import deliveryAPI from '../../../api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StopProgressBar, StatusBadge, SeverityBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    StatsGrid, StatCard, DriverAvatar, StarRating,
} from './DeliveryShared';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(mins) {
    if (!mins) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── stop status icon ──────────────────────────────────────────────────────────
function StopIcon({ status }) {
    const map = {
        delivered:        { icon: CheckCircle, color: D.teal    },
        failed:           { icon: XCircle,     color: '#ef4444' },
        returned:         { icon: RotateCcw,   color: '#f59e0b' },
        out_for_delivery: { icon: Navigation,  color: D.purple  },
        pending:          { icon: Package,     color: '#94a3b8' },
    };
    const { icon: Icon, color } = map[status] ?? map.pending;
    return <Icon size={16} color={color} />;
}

// ── individual stop card ──────────────────────────────────────────────────────
function StopCard({ item, index, expanded, onToggle, onHover }) {
    const customer = item.order?.customer;
    const custName = customer
        ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()
        : item.customer_contact?.name ?? '—';

    const isTerminal = ['delivered', 'failed', 'returned'].includes(item.status);

    return (
        <div style={{
            background:   D.card,
            border:       `1px solid ${expanded ? D.purple : D.purpleBorder}`,
            borderRadius: D.radius,
            overflow:     'hidden',
            transition:   'border-color 0.2s',
        }}>
            {/* header row */}
            <div
                onClick={onToggle}
                onMouseEnter={onHover}
                style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        12,
                    padding:    'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 16px)',
                    cursor:     'pointer',
                }}
            >
                {/* stop number */}
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: D.purpleDim,
                    border: `1px solid ${D.purpleBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 700, color: D.purple,
                    flexShrink: 0,
                }}>
                    {index + 1}
                </div>

                {/* stop status icon */}
                <div style={{ flexShrink: 0 }}>
                    <StopIcon status={item.status} />
                </div>

                {/* customer + address */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text, marginBottom: 2 }}>
                        {custName}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={10} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.order?.shipping_address ?? '—'}
                        </span>
                    </div>
                </div>

                {/* right: badge + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <StatusBadge status={item.status} />
                    {expanded ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />}
                </div>
            </div>

            {/* expanded details */}
            {expanded && (
                <div style={{
                    borderTop: `1px solid ${D.purpleBorder}`,
                    padding:   'clamp(12px, 2vw, 16px)',
                    display:   'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                    gap:       14,
                }}>
                    {/* order info */}
                    <div>
                        <Label>Order</Label>
                        <Value>{item.order?.order_number ?? '—'}</Value>
                        <Label style={{ marginTop: 10 }}>Phone</Label>
                        <Value>{customer?.phone ?? item.customer_contact?.phone ?? '—'}</Value>
                        {item.estimated_arrival && (
                            <>
                                <Label style={{ marginTop: 10 }}>ETA</Label>
                                <Value>{fmtDateTime(item.estimated_arrival)}</Value>
                            </>
                        )}
                    </div>

                    {(item.delivery_latitude && item.delivery_longitude) && (
                        <div>
                            <Label>Delivery location</Label>
                            <a
                                href={`https://www.google.com/maps?q=${item.delivery_latitude},${item.delivery_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: 'none' }}
                            >
                                <iframe
                                    title="map"
                                    width="100%"
                                    height="120"
                                    style={{
                                        border: `1px solid ${D.purpleBorder}`,
                                        borderRadius: D.radiusSm,
                                        display: 'block',
                                        marginTop: 4,
                                        pointerEvents: 'none', // let the <a> handle the click
                                    }}
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(item.delivery_longitude)-0.005},${Number(item.delivery_latitude)-0.005},${Number(item.delivery_longitude)+0.005},${Number(item.delivery_latitude)+0.005}&layer=mapnik&marker=${item.delivery_latitude},${item.delivery_longitude}`}
                                />
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    fontSize: '0.72rem', color: D.purple, fontWeight: 600, marginTop: 4,
                                }}>
                                    <MapPin size={11} /> Open in Google Maps
                                </div>
                            </a>
                        </div>
                    )}

                    {/* delivery outcome */}
                    <div>
                        {item.delivered_at && (
                            <>
                                <Label>Delivered at</Label>
                                <Value style={{ color: D.teal }}>{fmtDateTime(item.delivered_at)}</Value>
                            </>
                        )}
                        {item.failed_reason && (
                            <>
                                <Label style={{ marginTop: 10 }}>Fail reason</Label>
                                <Value style={{ color: '#ef4444' }}>{item.failed_reason}</Value>
                            </>
                        )}
                        {item.delivery_notes && (() => {
                            const isSkipped = item.delivery_notes.startsWith('[SKIPPED]');
                            const noteText = isSkipped
                                ? item.delivery_notes.replace(/^\[SKIPPED\]\s*[\d\-: ]+:\s*/, '')
                                : item.delivery_notes;
                            return (
                                <>
                                    <Label style={{ marginTop: 10 }}>
                                        {isSkipped ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                <span style={{
                                                    background: 'rgba(245,158,11,0.12)',
                                                    border: '1px solid rgba(245,158,11,0.3)',
                                                    color: '#f59e0b',
                                                    fontSize: '0.65rem', fontWeight: 700,
                                                    padding: '1px 6px', borderRadius: 20,
                                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                                }}>
                                                    Skipped
                                                </span>
                                            </span>
                                        ) : 'Notes'}
                                    </Label>
                                    <Value style={{ color: isSkipped ? '#f59e0b' : undefined, fontStyle: 'italic' }}>
                                        "{noteText}"
                                    </Value>
                                </>
                            );
                        })()}
                        {item.distance_from_prev_km && (
                            <>
                                <Label style={{ marginTop: 10 }}>Leg distance</Label>
                                <Value>{item.distance_from_prev_km} km</Value>
                            </>
                        )}
                    </div>

                    {/* order items */}
                    {item.order?.items?.length > 0 && (
                        <div>
                            <Label>Order items</Label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                {item.order.items.map((oi, i) => (
                                    <div key={i} style={{ fontSize: '0.75rem', color: D.textMid, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{oi.product?.name ?? `Item ${i + 1}`}</span>
                                        <span style={{ color: D.textDim }}>×{oi.quantity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* proof of delivery */}
                    {item.proof_of_delivery_url && (
                        <div>
                            <Label>Proof of delivery</Label>
                            <a
                                href={item.proof_of_delivery_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display:      'inline-flex',
                                    alignItems:   'center',
                                    gap:          5,
                                    fontSize:     '0.75rem',
                                    color:        D.purple,
                                    fontWeight:   600,
                                    marginTop:    4,
                                    textDecoration: 'none',
                                }}
                            >
                                <ImageIcon size={13} /> View photo
                            </a>
                        </div>
                    )}

                    {/* customer rating for this stop */}
                    {item.rating && (
                        <div>
                            <Label>Customer rating</Label>
                            <div style={{ marginTop: 4 }}>
                                <StarRating value={item.rating.rating} size={13} />
                                {item.rating.comment && (
                                    <div style={{ fontSize: '0.72rem', color: D.textDim, marginTop: 4, fontStyle: 'italic' }}>
                                        "{item.rating.comment}"
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Label({ children, style = {} }) {
    return <div style={{ fontSize: '0.68rem', fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2, ...style }}>{children}</div>;
}
function Value({ children, style = {} }) {
    return <div style={{ fontSize: '0.82rem', color: D.text, fontWeight: 500, ...style }}>{children}</div>;
}

// ── activity log entry ────────────────────────────────────────────────────────
function ActivityEntry({ log }) {
    const severityColor = {
        info:     D.purple,
        warning:  '#f59e0b',
        critical: '#ef4444',
    }[log.severity] ?? D.purple;

    const hasSafetyWarning = log.action === 'driver_reassigned' && log.payload?.safety_warning;
    const hasNewOrder      = log.action === 'driver_route_optimized' && Array.isArray(log.payload?.new_order);

    const cleanPayload = Object.entries(log.payload ?? {})
        .filter(([k, v]) => v !== null && v !== undefined && k !== 'safety_warning')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('→') : v}`)
        .join(' · ');

    return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: severityColor, marginTop: 5, flexShrink: 0,
                boxShadow: `0 0 5px ${severityColor}`,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', color: D.text, fontWeight: 500 }}>
                    {log.action?.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: '0.7rem', color: D.textDim, marginTop: 2 }}>
                    {log.performer_name} · {fmtDateTime(log.created_at)}
                </div>

                {/* safety warning callout */}
                {hasSafetyWarning && (
                    <div style={{
                        marginTop: 6, padding: '7px 10px',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: D.radiusSm,
                        display: 'flex', alignItems: 'flex-start', gap: 7,
                    }}>
                        <ShieldAlert size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', marginBottom: 2 }}>
                                Safety override
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#92400e', lineHeight: 1.5 }}>
                                {log.payload.safety_warning}
                            </div>
                            {log.payload.override_reason && (
                                <div style={{ fontSize: '0.68rem', color: D.textDim, marginTop: 4 }}>
                                    Reason: <span style={{ color: D.textMid, fontWeight: 600 }}>{log.payload.override_reason}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* route optimization new_order as a readable sequence */}
                {hasNewOrder && (
                    <div style={{
                        marginTop: 4, padding: '4px 8px',
                        background: 'rgba(168,85,247,0.05)',
                        borderRadius: D.radiusSm,
                        fontSize: '0.68rem', color: D.textDim, fontFamily: 'monospace',
                    }}>
                        {cleanPayload}
                        {' · '}
                        <span style={{ color: D.purple }}>
                            order: [{log.payload.new_order.join(' → ')}]
                        </span>
                    </div>
                )}

                {/* generic payload for everything else */}
                {!hasSafetyWarning && !hasNewOrder && cleanPayload && (
                    <div style={{
                        marginTop: 4, padding: '4px 8px',
                        background: 'rgba(168,85,247,0.05)',
                        borderRadius: D.radiusSm,
                        fontSize: '0.68rem', color: D.textDim,
                        fontFamily: 'monospace', wordBreak: 'break-all',
                    }}>
                        {cleanPayload}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── reassign driver modal ─────────────────────────────────────────────────────
const OVERRIDE_PRESETS = [
    'Manager approved',
    'Customer confirmed safe',
    'Emergency delivery',
    'Incident under investigation',
    'Other',
];

function ReassignModal({ manifest, onClose, onSuccess, onHover, audio }) {
    const [drivers,       setDrivers]       = useState([]);
    const [driverId,      setDriverId]      = useState('');
    const [reason,        setReason]        = useState('');
    const [submitting,    setSubmitting]    = useState(false);
    const [error,         setError]         = useState(null);

    // override state
    const [overrideModal, setOverrideModal] = useState(null); // { warning, driver_id, driver_name }
    const [overridePreset, setOverridePreset] = useState('');
    const [overrideNote,   setOverrideNote]   = useState('');
    const isOther    = overridePreset === 'Other';
    const canOverride = overridePreset && (!isOther || overrideNote.trim());

    useEffect(() => {
        deliveryAPI.getDriverPerformance()
            .then(res => setDrivers(res.data ?? []))
            .catch(() => setDrivers([]));
    }, []);

    const doReassign = async (overrideReason = null) => {
        if (!driverId) { setError('Please select a driver.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            const payload = { driver_id: driverId, reason };
            if (overrideReason) payload.override_reason = overrideReason;
            await deliveryAPI.reassignDriver(manifest.id, payload);
            audio.playSuccess();
            onSuccess();
        } catch (e) {
            const status = e?.response?.status;
            const data   = e?.response?.data;
            if (status === 409 && data?.requires_override) {
                setOverrideModal({
                    warning:     data.warning,
                    driver_id:   data.driver_id,
                    driver_name: data.driver_name ?? 'Driver',
                });
            } else {
                setError(data?.message ?? 'Reassignment failed.');
                audio.playError();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleOverrideConfirm = () => {
        if (!canOverride) { audio.playError(); return; }
        const reason = isOther ? overrideNote.trim() : overridePreset;
        setOverrideModal(null);
        doReassign(reason);
    };

    const inputStyle = {
        width: '100%', boxSizing: 'border-box',
        background: '#f8f9fa', border: '1px solid #dee2e6',
        borderRadius: D.radiusSm, color: '#111',
        fontSize: '0.85rem', padding: '8px 10px', outline: 'none',
    };

    return (
        <>
            {/* ── main reassign modal ── */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 50,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }} onClick={onClose}>
                <div onClick={e => e.stopPropagation()} style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: D.radiusLg,
                    padding: 'clamp(20px, 4vw, 28px)',
                    width: '100%', maxWidth: 420,
                    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginBottom: 4 }}>
                        Reassign driver
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 20 }}>
                        Manifest {manifest.manifest_number}
                    </div>

                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: D.radiusSm, padding: '8px 12px',
                            color: '#dc2626', fontSize: '0.8rem', marginBottom: 14,
                        }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#444', display: 'block', marginBottom: 6 }}>
                            New driver
                        </label>
                        <select value={driverId} onChange={e => setDriverId(e.target.value)} style={inputStyle}>
                            <option value="">Select driver…</option>
                            {drivers.map(d => (
                                <option key={d.driver_id} value={d.driver_id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#444', display: 'block', marginBottom: 6 }}>
                            Reason (optional)
                        </label>
                        <input
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Driver called in sick"
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <DeliveryBtn variant="ghost" size="sm" onClick={onClose} onHover={onHover}>Cancel</DeliveryBtn>
                        <DeliveryBtn variant="primary" size="sm" onClick={() => doReassign()} onHover={onHover} disabled={submitting}>
                            {submitting
                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Reassigning…</>
                                : 'Reassign'
                            }
                        </DeliveryBtn>
                    </div>
                </div>
            </div>

            {/* ── override modal (layered on top) ── */}
            {overrideModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 16,
                }} onClick={() => setOverrideModal(null)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#ffffff',
                        border: '1px solid rgba(245,158,11,0.4)',
                        borderRadius: D.radiusLg,
                        padding: 'clamp(20px, 4vw, 28px)',
                        width: '100%', maxWidth: 460,
                        boxShadow: '0 8px 40px rgba(245,158,11,0.12)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <ShieldAlert size={22} color="#d97706" />
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#92400e' }}>
                                Driver Safety Warning
                            </div>
                        </div>

                        <div style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.6, marginBottom: 16 }}>
                            <strong style={{ color: '#111' }}>{overrideModal.driver_name}</strong> has unresolved safety incidents with one or more customers in this manifest:
                            <div style={{
                                marginTop: 10, padding: '10px 14px',
                                background: 'rgba(245,158,11,0.08)',
                                borderRadius: D.radiusSm,
                                border: '1px solid rgba(245,158,11,0.25)',
                                color: '#92400e',
                                fontSize: '0.78rem',
                            }}>
                                {overrideModal.warning}
                            </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                                Override reason (required) *
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {OVERRIDE_PRESETS.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => { setOverridePreset(p); audio.playHover(); }}
                                        style={{
                                            padding: '5px 12px',
                                            borderRadius: D.radiusSm,
                                            border: `1px solid ${overridePreset === p ? '#d97706' : '#d1d5db'}`,
                                            background: overridePreset === p ? 'rgba(245,158,11,0.12)' : '#f9fafb',
                                            color: overridePreset === p ? '#92400e' : '#374151',
                                            fontSize: '0.75rem',
                                            fontWeight: overridePreset === p ? 600 : 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isOther && (
                            <div style={{ marginBottom: 20 }}>
                                <textarea
                                    value={overrideNote}
                                    onChange={e => setOverrideNote(e.target.value)}
                                    placeholder="Explain why you're overriding this warning…"
                                    rows={2}
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        background: '#f8f9fa', border: '1px solid #dee2e6',
                                        borderRadius: D.radiusSm, color: '#111',
                                        fontSize: '0.85rem', padding: '9px 11px',
                                        outline: 'none', resize: 'vertical',
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <DeliveryBtn variant="ghost" size="sm" onClick={() => setOverrideModal(null)} onHover={onHover}>
                                Cancel
                            </DeliveryBtn>
                            <DeliveryBtn
                                variant="danger"
                                size="sm"
                                onClick={handleOverrideConfirm}
                                onHover={onHover}
                                disabled={!canOverride || submitting}
                            >
                                {submitting
                                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Reassigning…</>
                                    : 'Proceed anyway'
                                }
                            </DeliveryBtn>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ── cancel modal ──────────────────────────────────────────────────────────────
function CancelModal({ manifest, onClose, onSuccess, onHover, audio }) {
    const [reason,     setReason]     = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await deliveryAPI.cancelManifest(manifest.id, reason);
            audio.playFail();
            onSuccess();
        } catch (e) {
            setError(e?.response?.data?.message ?? 'Cancellation failed.');
            audio.playError();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: D.card,
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: D.radiusLg,
                padding: 'clamp(20px, 4vw, 28px)',
                width: '100%', maxWidth: 400,
            }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                    Cancel manifest
                </div>
                <div style={{ fontSize: '0.8rem', color: D.textDim, marginBottom: 20 }}>
                    This will cancel {manifest.manifest_number} and notify the driver.
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: D.radiusSm, padding: '8px 12px', color: '#ef4444', fontSize: '0.8rem', marginBottom: 14 }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: D.textMid, display: 'block', marginBottom: 6 }}>
                        Reason (Required)
                    </label>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="e.g. Route change, weather conditions…"
                        rows={3}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: D.card, border: `1px solid ${D.purpleBorder}`,
                            borderRadius: D.radiusSm, color: D.text,
                            fontSize: '0.85rem', padding: '8px 10px', outline: 'none',
                            resize: 'vertical',
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={onClose} onHover={onHover}>Keep it</DeliveryBtn>
                    <DeliveryBtn variant="danger" size="sm" onClick={handleSubmit} onHover={onHover} disabled={submitting}>
                        {submitting ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cancelling…</> : <><Ban size={13} /> Cancel manifest</>}
                    </DeliveryBtn>
                </div>
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ManifestDetailPage() {
    const { id }     = useParams();
    const navigate   = useNavigate();
    const audio      = useDeliveryAudio();

    const [manifest,    setManifest]    = useState(null);
    const [activityLog, setActivityLog] = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [error,       setError]       = useState(null);

    const [expandedStop,    setExpandedStop]    = useState(null);
    const [dispatching,     setDispatching]     = useState(false);
    const [showCancel,      setShowCancel]      = useState(false);
    const [showReassign,    setShowReassign]    = useState(false);
    const [actionError,     setActionError]     = useState(null);

    const [trackingModal, setTrackingModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // ── fetch ─────────────────────────────────────────────────────────────────
    const fetchManifest = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getManifest(id);
            const data = res.data ?? res;
            setManifest(data);
            setActivityLog(data.activity_logs ?? []);
        } catch {
            setError('Failed to load manifest.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => { fetchManifest(); }, [fetchManifest]);

    // ── dispatch ──────────────────────────────────────────────────────────────
    const handleDispatch = async () => {
        setDispatching(true);
        setActionError(null);
        try {
            await deliveryAPI.dispatchManifest(manifest.id);
            audio.playDispatch();
            fetchManifest(true);
        } catch (e) {
            setActionError(e?.response?.data?.message ?? 'Dispatch failed.');
            audio.playError();
        } finally {
            setDispatching(false);
        }
    };

    // ── print ─────────────────────────────────────────────────────────────────
    const handlePrint = async () => {
        audio.playDownload();
        try {
            await deliveryAPI.getManifestPrintData(manifest.id);
            // In a real implementation, open the print view or trigger PDF
            window.print();
        } catch {
            audio.playError();
        }
    };

    // ── derived ───────────────────────────────────────────────────────────────
    const items     = manifest?.items ?? [];
    const total     = items.length;
    const delivered = items.filter(i => i.status === 'delivered').length;
    const failed    = items.filter(i => i.status === 'failed').length;
    const pending   = total - delivered - failed;
    const pct       = total > 0 ? Math.round((delivered / total) * 100) : 0;

    const canDispatch = manifest?.status === 'draft' && total > 0 && manifest?.driver_id;
    const canCancel   = ['draft', 'dispatched', 'in_progress'].includes(manifest?.status);
    const canReassign = ['draft', 'dispatched'].includes(manifest?.status);

    // ── loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <GeneralLayout>
                <DeliveryPageShell audio={audio}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 10, color: D.textMid }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                        <span style={{ fontSize: '0.9rem' }}>Loading manifest…</span>
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
                        <DeliveryBtn variant="ghost" size="sm" onClick={() => fetchManifest()} onHover={audio.playHover}>
                            <RefreshCw size={13} /> Retry
                        </DeliveryBtn>
                    </div>
                </DeliveryPageShell>
            </GeneralLayout>
        );
    }

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>

                <DeliveryBreadcrumb
                    items={[
                        { label: 'Delivery',   onClick: () => navigate('/admin/delivery') },
                        { label: 'Manifests',  onClick: () => navigate('/admin/delivery/manifests') },
                        { label: manifest?.manifest_number ?? `#${id}` },
                    ]}
                    onHover={audio.playHover}
                />

                {manifest?.is_overdue && manifest?.status !== 'completed' && manifest?.status !== 'cancelled' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px', borderRadius: D.radiusSm,
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        marginBottom: 16,
                    }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#ef4444',
                            boxShadow: '0 0 0 3px rgba(239,68,68,0.2)',
                            flexShrink: 0,
                            animation: 'pulse 2s infinite',
                        }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ef4444' }}>
                            This manifest is overdue
                        </span>
                        {manifest?.scheduled_date && (
                            <span style={{ fontSize: '0.78rem', color: '#f87171', marginLeft: 'auto' }}>
                                Scheduled {fmtDate(manifest.scheduled_date)}
                            </span>
                        )}
                    </div>
                )}

                {/* page header */}
                <DeliveryPageHeader
                    title={manifest?.manifest_number ?? '—'}
                    sub={`Scheduled ${fmtDate(manifest?.scheduled_date)} · ${total} stops`}
                    actions={
                        <>
                            <DeliveryBtn variant="ghost" size="sm" onClick={() => { audio.playHover(); fetchManifest(true); }} onHover={audio.playHover} disabled={refreshing}>
                                <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                            </DeliveryBtn>
                            <DeliveryBtn variant="ghost" size="sm" onClick={handlePrint} onHover={audio.playHover}>
                                <Printer size={13} /> Print
                            </DeliveryBtn>
                            {manifest?.status === 'draft' && items.length === 0 && (
                                <DeliveryBtn
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { audio.playHover(); setShowDeleteConfirm(true); }}
                                    onHover={audio.playHover}
                                >
                                    <Trash2 size={13} /> Delete
                                </DeliveryBtn>
                            )}
                            {canReassign && (
                                <DeliveryBtn variant="secondary" size="sm" onClick={() => { audio.playHover(); setShowReassign(true); }} onHover={audio.playHover}>
                                    <Edit2 size={13} /> Reassign
                                </DeliveryBtn>
                            )}
                            {canCancel && (
                                <DeliveryBtn variant="danger" size="sm" onClick={() => { audio.playHover(); setShowCancel(true); }} onHover={audio.playHover}>
                                    <Ban size={13} /> Cancel
                                </DeliveryBtn>
                            )}
                            {canDispatch && (
                                <DeliveryBtn variant="primary" size="sm" onClick={handleDispatch} onHover={audio.playHover} disabled={dispatching}>
                                    {dispatching
                                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Dispatching…</>
                                        : <><Send size={13} /> Dispatch</>
                                    }
                                </DeliveryBtn>
                            )}
                            {manifest?.status === 'draft' && total > 0 && (
                                (() => {
                                    const allHaveLocations = items.every(i => i.delivery_latitude && i.delivery_longitude);
                                    return (
                                        <DeliveryBtn
                                            variant={allHaveLocations ? "ghost" : "secondary"}
                                            size="sm"
                                            onClick={() => { audio.playHover(); navigate(`/admin/delivery/manifests/${manifest.id}/route`); }}
                                            onHover={audio.playHover}
                                        >
                                            {allHaveLocations
                                                ? <><Edit2 size={13} /> Edit route</>
                                                : <><Route size={13} /> Plan route</>
                                            }
                                        </DeliveryBtn>
                                    );
                                })()
                            )}
                            {manifest?.status !== 'draft' && manifest?.status !== 'cancelled' && (
                                <DeliveryBtn variant="secondary" size="sm" onClick={() => setTrackingModal(true)} onHover={audio.playHover}>
                                    <Navigation size={13} /> Track Live
                                </DeliveryBtn>
                            )}
                        </>
                    }
                />

                {/* action error banner */}
                {actionError && (
                    <div style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: D.radiusSm, padding: '10px 14px', color: '#ef4444',
                        fontSize: '0.82rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <XCircle size={14} /> {actionError}
                    </div>
                )}

                {/* ── summary cards ── */}
                <StatsGrid cols={4}>
                    <StatCard
                        label="Status"
                        value={<StatusBadge status={manifest?.status} />}
                        icon={Truck}
                    />
                    <StatCard
                        label="Delivered"
                        value={delivered}
                        sub={`${pct}% complete`}
                        icon={CheckCircle}
                        accent={D.teal}
                    />
                    <StatCard
                        label="Failed"
                        value={failed}
                        sub={`${pending} pending`}
                        icon={XCircle}
                        accent={failed > 0 ? '#ef4444' : D.purple}
                    />
                    <StatCard
                        label="Distance"
                        value={manifest?.total_distance_km ? `${manifest.total_distance_km} km` : '—'}
                        sub={manifest?.actual_duration_minutes ? fmtDuration(manifest.actual_duration_minutes) : 'In progress'}
                        icon={Navigation}
                    />
                </StatsGrid>

                {/* ── manifest meta card ── */}
                <DeliveryCard style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                        gap: 'clamp(14px, 3vw, 20px)',
                    }}>
                        {/* driver */}
                        <div>
                            <Label>Driver</Label>
                            {manifest?.driver ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <DriverAvatar name={manifest.driver.name} photo={manifest.driver.profile_picture_url} size={30} />
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>{manifest.driver.name}</div>
                                        <div style={{ fontSize: '0.72rem', color: D.textDim }}>{manifest.driver.phone ?? ''}</div>
                                    </div>
                                </div>
                            ) : (
                                <Value style={{ color: '#f59e0b' }}>Unassigned</Value>
                            )}
                        </div>

                        <div>
                            <Label>Scheduled date</Label>
                            <Value style={{ marginTop: 4 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Calendar size={13} color={D.purple} />
                                    {fmtDate(manifest?.scheduled_date)}
                                </span>
                            </Value>
                        </div>

                        {manifest?.started_at && (
                            <div>
                                <Label>Started</Label>
                                <Value style={{ marginTop: 4 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Clock size={13} color={D.teal} />
                                        {fmtDateTime(manifest.started_at)}
                                    </span>
                                </Value>
                            </div>
                        )}

                        {manifest?.completed_at && (
                            <div>
                                <Label>Completed</Label>
                                <Value style={{ marginTop: 4 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <CheckCircle size={13} color={D.teal} />
                                        {fmtDateTime(manifest.completed_at)}
                                    </span>
                                </Value>
                            </div>
                        )}

                        {manifest?.notes && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <Label>Notes</Label>
                                <Value style={{ marginTop: 4 }}>{manifest.notes}</Value>
                            </div>
                        )}

                        {manifest?.is_ai_generated && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '3px 10px', borderRadius: 20,
                                    background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                                    fontSize: '0.72rem', color: D.purple, fontWeight: 600,
                                }}>
                                    ✦ AI-generated manifest
                                </span>
                            </div>
                        )}

                        {manifest?.assigner && (
                            <div>
                                <Label>Assigned by</Label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <DriverAvatar name={manifest.assigner.name} photo={manifest.assigner.profile_picture_url} size={28} />
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                                        {manifest.assigner.name}
                                    </div>
                                </div>
                            </div>
                        )}

                        {manifest?.dispatched_at && (
                            <div>
                                <Label>Dispatched</Label>
                                <Value style={{ marginTop: 4 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Send size={13} color={D.purple} />
                                        {fmtDateTime(manifest.dispatched_at)}
                                    </span>
                                </Value>
                            </div>
                        )}

                        {/* ── route status & mini preview ── */}
                        {total > 0 && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                {(() => {
                                    const locatedCount = items.filter(i => i.delivery_latitude && i.delivery_longitude).length;
                                    const allLocated = locatedCount === total;
                                    const noneLocated = locatedCount === 0;
                                    const someLocated = locatedCount > 0 && locatedCount < total;

                                    return (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '10px 14px',
                                            borderRadius: D.radius,
                                            background: allLocated ? `${D.teal}08` : someLocated ? `${D.purple}08` : 'rgba(245,158,11,0.06)',
                                            border: `1px solid ${allLocated ? `${D.teal}30` : someLocated ? D.purpleBorder : 'rgba(245,158,11,0.2)'}`,
                                        }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: allLocated ? `${D.teal}15` : someLocated ? `${D.purple}15` : 'rgba(245,158,11,0.12)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                {allLocated
                                                    ? <Route size={18} color={D.teal} />
                                                    : someLocated
                                                        ? <MapPin size={18} color={D.purple} />
                                                        : <AlertTriangle size={18} color="#f59e0b" />
                                                }
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>
                                                    {allLocated && 'All stops have delivery locations'}
                                                    {someLocated && `${locatedCount} of ${total} stops have locations`}
                                                    {noneLocated && 'No delivery locations set yet'}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: D.textDim, marginTop: 2 }}>
                                                    {allLocated && 'Route is ready for optimization and dispatch'}
                                                    {someLocated && `${total - locatedCount} stop${total - locatedCount !== 1 ? 's' : ''} still need${total - locatedCount === 1 ? 's' : ''} a location`}
                                                    {noneLocated && 'Set coordinates for each stop to plan the route'}
                                                </div>
                                            </div>
                                            {manifest?.status === 'draft' && (
                                                <DeliveryBtn
                                                    variant={allLocated ? "ghost" : "secondary"}
                                                    size="sm"
                                                    onClick={() => { audio.playHover(); navigate(`/admin/delivery/manifests/${manifest.id}/route`); }}
                                                    onHover={audio.playHover}
                                                >
                                                    {allLocated
                                                        ? <><Edit2 size={13} /> Edit route</>
                                                        : <><Route size={13} /> Plan route</>
                                                    }
                                                </DeliveryBtn>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* stop progress bar */}
                    {total > 0 && (
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${D.purpleBorder}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: '0.75rem', color: D.textMid, fontWeight: 600 }}>Stop progress</span>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: D.purple }}>{pct}%</span>
                            </div>
                            <StopProgressBar total={total} delivered={delivered} failed={failed} />
                            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: '0.72rem' }}>
                                <span style={{ color: D.teal }}>{delivered} delivered</span>
                                {failed > 0 && <span style={{ color: '#ef4444' }}>{failed} failed</span>}
                                <span style={{ color: D.textDim }}>{pending} pending</span>
                            </div>
                        </div>
                    )}
                </DeliveryCard>

                {/* ── stops ── */}
                <DeliveryDivider label={`${total} stops`} />

                {items.length === 0 ? (
                    <DeliveryCard style={{ marginBottom: 24 }}>
                        <DeliveryEmptyState
                            icon={Package}
                            title="No stops yet"
                            sub="Add orders to this manifest before dispatching."
                        />
                    </DeliveryCard>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'clamp(20px, 4vw, 32px)' }}>
                        {items.map((item, i) => (
                            <StopCard
                                key={item.id}
                                item={item}
                                index={i}
                                expanded={expandedStop === item.id}
                                onToggle={() => {
                                    audio.playHover();
                                    setExpandedStop(expandedStop === item.id ? null : item.id);
                                }}
                                onHover={audio.playHover}
                            />
                        ))}
                    </div>
                )}

                {/* ── activity log ── */}
                <DeliveryDivider label="Activity log" />

                {activityLog.length === 0 ? (
                    <DeliveryCard>
                        <div style={{ fontSize: '0.8rem', color: D.textDim, textAlign: 'center', padding: '20px 0' }}>
                            No activity recorded yet
                        </div>
                    </DeliveryCard>
                ) : (
                    <DeliveryCard style={{ marginBottom: 32 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {activityLog.map((log, i) => (
                                <div key={i}>
                                    <ActivityEntry log={log} />
                                    {i < activityLog.length - 1 && (
                                        <div style={{ marginLeft: 18, marginTop: 14, height: 1, background: D.purpleBorder }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </DeliveryCard>
                )}

                {/* ── modals ── */}
                {showCancel && (
                    <CancelModal
                        manifest={manifest}
                        onClose={() => setShowCancel(false)}
                        onSuccess={() => { setShowCancel(false); fetchManifest(true); }}
                        onHover={audio.playHover}
                        audio={audio}
                    />
                )}
                {showReassign && (
                    <ReassignModal
                        manifest={manifest}
                        onClose={() => setShowReassign(false)}
                        onSuccess={() => { setShowReassign(false); fetchManifest(true); }}
                        onHover={audio.playHover}
                        audio={audio}
                    />
                )}
                {trackingModal && (
                    <DriverTrackingModal
                        isOpen={trackingModal}
                        onClose={() => setTrackingModal(false)}
                        manifestId={manifest.id} // ✅ Pass manifestId for admin API
                        manifest={{
                            manifest_number: manifest.manifest_number,
                            driver_name: manifest.driver?.name || 'Unassigned',
                        }}
                    />
                )}
                
                {showDeleteConfirm && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 50,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 16,
                    }} onClick={() => setShowDeleteConfirm(false)}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: D.card,
                            border: `1px solid ${D.purpleBorder}`,
                            borderRadius: D.radiusLg,
                            padding: 'clamp(20px, 4vw, 28px)',
                            width: '100%', maxWidth: 400,
                        }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                                Delete manifest?
                            </div>
                            <div style={{ fontSize: '0.8rem', color: D.textDim, marginBottom: 20 }}>
                                This will permanently delete {manifest?.manifest_number}. This action cannot be undone.
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <DeliveryBtn variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} onHover={audio.playHover}>
                                    Cancel
                                </DeliveryBtn>
                                <DeliveryBtn
                                    variant="danger"
                                    size="sm"
                                    onClick={async () => {
                                        try {
                                            await deliveryAPI.deleteManifestIfEmpty(manifest.id);
                                            audio.playSuccess();
                                            navigate('/admin/delivery/manifests');
                                        } catch (e) {
                                            setActionError(e?.response?.data?.message ?? 'Delete failed.');
                                            audio.playError();
                                        }
                                    }}
                                    onHover={audio.playHover}
                                >
                                    <Trash2 size={13} /> Delete permanently
                                </DeliveryBtn>
                            </div>
                        </div>
                    </div>
                )}

                <style>{`
                    @keyframes spin  { to { transform: rotate(360deg); } }
                    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
                    select option { background: #1e1b2e; color: #e2e8f0; }
                `}</style>

            </DeliveryPageShell>
        </GeneralLayout>
    );
}
