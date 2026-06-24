import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Truck, Navigation, CheckCircle, XCircle, Package, Info,
    MapPin, Clock, Phone, Camera, Loader2, Play, Square, Route,
    ChevronDown, ChevronUp, AlertTriangle, Send, Image as ImageIcon,
    RotateCcw, RefreshCw, ArrowLeft, Star, MessageSquare, Flag,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import DriverRouteSheet from './DriverRouteSheet';
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
function fmtDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── stop status icon ────────────────────────────────────────────────────────────
function StopIcon({ status }) {
    const map = {
        delivered:        { icon: CheckCircle, color: D.teal    },
        failed:           { icon: XCircle,     color: '#ef4444' },
        out_for_delivery: { icon: Navigation,  color: D.purple  },
        pending:          { icon: Package,     color: '#94a3b8' },
    };
    const { icon: Icon, color } = map[status] ?? map.pending;
    return <Icon size={18} color={color} />;
}

function StopDetailModal({ item, onClose }) {
    const customer = item.order?.customer;
    const custName = customer
        ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()
        : 'Customer';
    const phone   = customer?.phone ?? '—';
    const address = item.order?.shipping_address ?? '—';
    const order   = item.order;

    const STATUS_COLOR = {
        delivered:        '#14b8a6',
        failed:           '#ef4444',
        out_for_delivery: '#7F77DD',
        pending:          '#94a3b8',
        returned:         '#f59e0b',
    };

    const PAYMENT_COLOR = {
        paid:        '#14b8a6',
        unpaid:      '#ef4444',
        overpayment: '#f59e0b',
        partial:     '#f59e0b',
    };

    const STOCK_COLOR = {
        reserved:     '#14b8a6',
        backorder:    '#f59e0b',
        out_of_stock: '#ef4444',
    };

    const paymentColor = PAYMENT_COLOR[order?.payment_status] ?? '#94a3b8';
    const statusColor  = STATUS_COLOR[item.status] ?? '#94a3b8';

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 60,
                background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#ffffff',
                    width: '100%', maxWidth: 540,
                    borderRadius: '20px 20px 0 0',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
                    maxHeight: '88vh',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <div style={{ height: 4, background: statusColor, flexShrink: 0 }} />

                {/* header */}
                <div style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                    background: '#ffffff',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: `${statusColor}18`,
                            border: `1px solid ${statusColor}50`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Package size={16} color={statusColor} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
                                Stop #{item.sort_order}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                                {order?.order_number ?? '—'}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: '1px solid #e5e7eb',
                            borderRadius: 8, width: 30, height: 30,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#6b7280', fontSize: '1rem',
                        }}
                    >✕</button>
                </div>

                {/* scrollable body */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '16px 18px 32px', background: '#ffffff' }}>

                    {/* ── Customer ── */}
                    <SectionLabel>Customer</SectionLabel>
                    <InfoBlock rows={[
                        { label: 'Name',    value: custName },
                        { label: 'Phone',   value: phone, href: `tel:${phone}` },
                        { label: 'Address', value: address },
                        customer?.tier && {
                            label: 'Tier',
                            value: (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '2px 9px', borderRadius: 20,
                                    background: '#ede9fe', border: '1px solid #c4b5fd',
                                    fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6',
                                    textTransform: 'capitalize',
                                }}>
                                    {customer.tier}
                                </span>
                            ),
                        },
                    ].filter(Boolean)} />

                    {/* ── Stop Status ── */}
                    <SectionLabel>Stop Status</SectionLabel>
                    <InfoBlock rows={[
                        {
                            label: 'Status',
                            value: (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '2px 9px', borderRadius: 20,
                                    background: `${statusColor}15`, border: `1px solid ${statusColor}50`,
                                    fontSize: '0.75rem', fontWeight: 700, color: statusColor,
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                                    {item.status_label ?? item.status}
                                </span>
                            ),
                        },
                        item.delivered_at && { label: 'Delivered at', value: fmtDateTime(item.delivered_at) },
                        item.distance_from_prev_km && {
                            label: 'Distance',
                            value: `${item.distance_from_prev_km} km from prev stop`,
                        },
                        item.delivery_notes && {
                            label: 'Notes',
                            value: (
                                <span style={{ fontStyle: 'italic', color: '#6b7280' }}>
                                    "{item.delivery_notes}"
                                </span>
                            ),
                        },
                        item.failed_reason && {
                            label: 'Fail reason',
                            value: (
                                <span style={{ color: '#ef4444', textTransform: 'capitalize' }}>
                                    {item.failed_reason.replace(/_/g, ' ')}
                                </span>
                            ),
                        },
                    ].filter(Boolean)} />

                    {/* ── Order Summary ── */}
                    <SectionLabel>Order Summary</SectionLabel>
                    <div style={{
                        background: '#f9fafb', border: '1px solid #e5e7eb',
                        borderRadius: 8, padding: '12px',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                    }}>
                        {[
                            {
                                label: 'Order total',
                                value: `${order?.currency ?? 'KES'} ${parseFloat(order?.total ?? 0).toLocaleString()}`,
                                accent: true,
                            },
                            {
                                label: 'Payment',
                                value: (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 8px', borderRadius: 20,
                                        background: `${paymentColor}15`, border: `1px solid ${paymentColor}50`,
                                        fontSize: '0.72rem', fontWeight: 700, color: paymentColor,
                                    }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: paymentColor }} />
                                        {order?.payment_status_label ?? '—'}
                                    </span>
                                ),
                            },
                            {
                                label: 'Subtotal',
                                value: `${order?.currency ?? 'KES'} ${parseFloat(order?.subtotal ?? 0).toLocaleString()}`,
                            },
                            {
                                label: 'Discount',
                                value: parseFloat(order?.discount ?? 0) > 0
                                    ? `− ${order?.currency ?? 'KES'} ${parseFloat(order.discount).toLocaleString()}`
                                    : '—',
                            },
                            {
                                label: 'Tax',
                                value: `${order?.currency ?? 'KES'} ${parseFloat(order?.tax ?? 0).toLocaleString()}`,
                            },
                            {
                                label: 'Shipping',
                                value: parseFloat(order?.shipping_cost ?? 0) === 0
                                    ? 'Free'
                                    : `${order?.currency ?? 'KES'} ${parseFloat(order.shipping_cost).toLocaleString()}`,
                            },
                            {
                                label: 'Pay method',
                                value: order?.payment_method?.replace(/_/g, ' ') ?? '—',
                                capitalize: true,
                            },
                            {
                                label: 'Priority',
                                value: order?.priority ?? '—',
                                capitalize: true,
                            },
                        ].map(({ label, value, accent, capitalize }, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{
                                    fontSize: '0.68rem', color: '#6b7280',
                                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                                }}>
                                    {label}
                                </span>
                                <span style={{
                                    fontSize: '0.82rem', fontWeight: 600,
                                    color: accent ? '#7F77DD' : '#111827',
                                    textTransform: capitalize ? 'capitalize' : undefined,
                                }}>
                                    {value}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* ── Items ── */}
                    <SectionLabel>Items to Deliver ({(order?.items ?? []).length})</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(order?.items ?? []).map(oi => {
                            const stockColor = STOCK_COLOR[oi.stock_status] ?? '#94a3b8';
                            return (
                                <div key={oi.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 8,
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                }}>
                                    {oi.product_image ? (
                                        <img
                                            src={oi.product_image.startsWith('http') ? oi.product_image : `${import.meta.env.VITE_API_URL ?? ''}${oi.product_image}`}
                                            alt={oi.product_name}
                                            style={{
                                                width: 42, height: 42, borderRadius: 8,
                                                objectFit: 'cover', flexShrink: 0,
                                                border: '1px solid #e5e7eb',
                                            }}
                                            onError={e => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: 42, height: 42, borderRadius: 8,
                                            background: '#f3f4f6', border: '1px solid #e5e7eb',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            <Package size={18} color="#9ca3af" />
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', marginBottom: 1 }}>
                                            {oi.product_name}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>
                                            SKU: {oi.product_sku ?? '—'} · {oi.brand_name ?? '—'}
                                        </div>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '1px 7px', borderRadius: 20,
                                            background: `${stockColor}15`, border: `1px solid ${stockColor}50`,
                                            fontSize: '0.68rem', fontWeight: 700, color: stockColor,
                                            textTransform: 'capitalize',
                                        }}>
                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: stockColor }} />
                                            {oi.stock_status?.replace(/_/g, ' ') ?? oi.fulfillment_status}
                                        </span>
                                    </div>
                                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                        <span style={{
                                            fontSize: '0.8rem', fontWeight: 700, color: '#7F77DD',
                                            background: '#ede9fe', border: '1px solid #c4b5fd',
                                            borderRadius: 20, padding: '2px 10px',
                                        }}>
                                            ×{parseFloat(oi.quantity)}
                                        </span>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
                                            {order?.currency ?? 'KES'} {parseFloat(oi.line_total_after_discount ?? oi.line_total ?? 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* items total row */}
                        {(order?.items ?? []).length > 0 && (
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 12px', borderRadius: 8,
                                background: '#ffffff', border: '1px solid #e5e7eb',
                            }}>
                                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                                    {(order?.items ?? []).length} item{(order?.items ?? []).length !== 1 ? 's' : ''} · order total
                                </span>
                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827' }}>
                                    {order?.currency ?? 'KES'} {parseFloat(order?.total ?? 0).toLocaleString()}
                                </span>
                            </div>
                        )}

                        {(order?.items ?? []).length === 0 && (
                            <div style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', padding: '8px 0' }}>
                                No items found.
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
}

// ── tiny helpers ────────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
    return (
        <div style={{
            fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: '#7F77DD',
            margin: '18px 0 8px',
        }}>
            {children}
        </div>
    );
}

function InfoBlock({ rows }) {
    return (
        <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#ffffff' }}>
            {rows.map(({ label, value, href }, i) => (
                <div key={label} style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: 12, padding: '9px 12px',
                    borderBottom: i < rows.length - 1 ? '1px solid #e5e7eb' : 'none',
                    background: '#ffffff',
                }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', flexShrink: 0, marginTop: 2 }}>
                        {label}
                    </span>
                    {href ? (
                        <a href={href} style={{ fontSize: '0.82rem', fontWeight: 600, color: '#7F77DD', textAlign: 'right', wordBreak: 'break-word', textDecoration: 'none' }}>
                            {value}
                        </a>
                    ) : (
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', textAlign: 'right', wordBreak: 'break-word' }}>
                            {value}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── proof of delivery upload preview ────────────────────────────────────────────
function ProofPreview({ file, onClear }) {
    const [preview, setPreview] = useState(null);
    useEffect(() => {
        if (!file) { setPreview(null); return; }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    if (!preview) return null;
    return (
        <div style={{ position: 'relative', marginTop: 10 }}>
            <img
                src={preview}
                alt="Proof preview"
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: D.radiusSm, border: `1px solid ${D.purpleBorder}` }}
            />
            <button
                onClick={onClear}
                style={{
                    position: 'absolute', top: 6, right: 6,
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    border: 'none', borderRadius: '50%', width: 24, height: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '0.7rem',
                }}
            >
                ✕
            </button>
        </div>
    );
}

// ── stop action card ────────────────────────────────────────────────────────────
function StopActionCard({ item, index, isNext, onUpdate, onHover, submitting }) {
    const [expanded, setExpanded] = useState(false);
    const [notes, setNotes]       = useState('');
    const [reason, setReason]     = useState('');
    const [photo, setPhoto]       = useState(null);
    const [mode, setMode]         = useState(null); // 'deliver' | 'fail' | null
    const [showDetail, setShowDetail] = useState(false);

    const customer = item.order?.customer;
    const custName = customer
        ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()
        : item.customer_contact?.name ?? 'Customer';
    const phone    = customer?.phone ?? item.customer_contact?.phone ?? '';
    const address  = item.order?.shipping_address ?? item.address ?? '—';

    const isTerminal = ['delivered', 'failed', 'returned'].includes(item.status);

    const handleSubmit = (status) => {
        const data = { status, delivery_notes: notes || undefined };
        if (status === 'failed' && reason) data.failed_reason = reason;
        if (photo) data.proof_of_delivery = photo;
        onUpdate(item.id, data);
    };

    return (
        <div style={{
            background:   D.card,
            border:       `1px solid ${isNext && !isTerminal ? D.purple : D.purpleBorder}`,
            borderRadius: D.radius,
            overflow:     'hidden',
            opacity:      isTerminal ? 0.7 : 1,
            transition:   'border-color 0.2s',
            boxShadow:    isNext && !isTerminal ? D.purpleGlow : 'none',
        }}>
            {/* header */}
            <div
                onClick={() => !isTerminal && setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 'clamp(12px, 2vw, 16px)',
                    cursor: isTerminal ? 'default' : 'pointer',
                    flexWrap: 'wrap',
                }}
            >
                {/* stop number */}
                <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: isTerminal
                        ? item.status === 'delivered' ? 'rgba(20,184,166,0.15)' : 'rgba(239,68,68,0.15)'
                        : isNext ? D.purpleDim : D.purpleDim,
                    border: `1px solid ${isTerminal
                        ? item.status === 'delivered' ? D.teal : '#ef4444'
                        : isNext ? D.purple : D.purpleBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.78rem', fontWeight: 700,
                    color: isTerminal
                        ? item.status === 'delivered' ? D.teal : '#ef4444'
                        : D.purple,
                    flexShrink: 0,
                }}>
                    {isTerminal ? <StopIcon status={item.status} /> : index + 1}
                </div>

                {/* customer info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: D.text, marginBottom: 2 }}>
                        {custName}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={10} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
                    </div>
                    {/* quick navigate button — always visible */}
                        {item.delivery_latitude && item.delivery_longitude && (
                            <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${item.delivery_latitude},${item.delivery_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    marginTop: 5, padding: '3px 8px', borderRadius: 20,
                                    background: `${D.purple}18`, border: `1px solid ${D.purpleBorder}`,
                                    fontSize: '0.7rem', color: D.purple, fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            >
                                <Navigation size={10} /> Navigate
                            </a>
                        )}
                    {phone && (
                        <div style={{ fontSize: '0.72rem', color: D.purple, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={10} /> {phone}
                        </div>
                    )}
                </div>

                {/* status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <StatusBadge status={item.status} />
                    {!isTerminal && (
                        expanded ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />
                    )}
                </div>
                <button
                    onClick={e => { e.stopPropagation(); setShowDetail(true); }}
                    style={{
                        background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                        borderRadius: D.radiusSm, width: 28, height: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    <Info size={13} color={D.purple} />
                </button>
            </div>

            {/* action panel */}
            {!isTerminal && expanded && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: 'clamp(14px, 3vw, 18px)' }}>
                    {/* location preview */}
                    {item.delivery_latitude && item.delivery_longitude ? (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                Delivery location
                            </div>
                            <iframe
                                title="stop-map"
                                width="100%"
                                height="140"
                                style={{
                                    border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radiusSm,
                                    display: 'block',
                                }}
                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(item.delivery_longitude)-0.005},${Number(item.delivery_latitude)-0.005},${Number(item.delivery_longitude)+0.005},${Number(item.delivery_latitude)+0.005}&layer=mapnik&marker=${item.delivery_latitude},${item.delivery_longitude}`}
                            />
                            <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${item.delivery_latitude},${item.delivery_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    fontSize: '0.75rem', color: D.purple, fontWeight: 600,
                                    marginTop: 6, textDecoration: 'none',
                                }}
                            >
                                <Navigation size={12} /> Open in Google Maps for directions
                            </a>
                        </div>
                    ) : (
                        <div style={{
                            marginBottom: 16, padding: '8px 10px', borderRadius: D.radiusSm,
                            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                            fontSize: '0.75rem', color: '#f59e0b',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <AlertTriangle size={12} /> No coordinates set for this stop
                        </div>
                    )}
                    {/* mode toggles */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                        <button
                            onClick={() => { onHover(); setMode('deliver'); }}
                            style={{
                                flex: 1, padding: '12px', borderRadius: D.radiusSm,
                                border: `1px solid ${mode === 'deliver' ? D.teal : D.purpleBorder}`,
                                background: mode === 'deliver' ? 'rgba(20,184,166,0.12)' : D.card,
                                color: mode === 'deliver' ? D.teal : D.textMid,
                                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                transition: 'all 0.15s',
                            }}
                        >
                            <CheckCircle size={20} />
                            Mark delivered
                        </button>
                        <button
                            onClick={() => { onHover(); setMode('fail'); }}
                            style={{
                                flex: 1, padding: '12px', borderRadius: D.radiusSm,
                                border: `1px solid ${mode === 'fail' ? '#ef4444' : D.purpleBorder}`,
                                background: mode === 'fail' ? 'rgba(239,68,68,0.12)' : D.card,
                                color: mode === 'fail' ? '#ef4444' : D.textMid,
                                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                transition: 'all 0.15s',
                            }}
                        >
                            <XCircle size={20} />
                            Mark failed
                        </button>
                    </div>

                    {/* deliver form */}
                    {mode === 'deliver' && (
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: D.textMid, display: 'block', marginBottom: 6 }}>
                                Notes (optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="e.g. Left with neighbour, handed to reception…"
                                rows={2}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: D.card, border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radiusSm, color: D.text,
                                    fontSize: '0.85rem', padding: '8px 10px', outline: 'none',
                                    resize: 'vertical', marginBottom: 10,
                                }}
                            />

                            {/* photo upload */}
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 12px', borderRadius: D.radiusSm,
                                border: `1px dashed ${D.purpleBorder}`,
                                color: D.purple, fontSize: '0.8rem', fontWeight: 600,
                                cursor: 'pointer', marginBottom: 10,
                            }}>
                                <Camera size={15} />
                                {photo ? 'Change photo' : 'Add proof of delivery photo'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={e => setPhoto(e.target.files[0])}
                                    style={{ display: 'none' }}
                                />
                            </label>
                            <ProofPreview file={photo} onClear={() => setPhoto(null)} />

                            <DeliveryBtn
                                variant="primary"
                                size="md"
                                onClick={() => handleSubmit('delivered')}
                                onHover={onHover}
                                disabled={submitting}
                                style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                            >
                                {submitting
                                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                                    : <><CheckCircle size={14} /> Confirm delivery</>
                                }
                            </DeliveryBtn>
                        </div>
                    )}

                    {/* fail form */}
                    {mode === 'fail' && (
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: D.textMid, display: 'block', marginBottom: 6 }}>
                                Reason *
                            </label>
                            <select
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: D.card, border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radiusSm, color: D.text,
                                    fontSize: '0.85rem', padding: '8px 10px', outline: 'none',
                                    marginBottom: 10, cursor: 'pointer',
                                }}
                            >
                                <option value="">Select a reason…</option>
                                <option value="customer_not_home">Customer not home</option>
                                <option value="wrong_address">Wrong address</option>
                                <option value="access_issue">Access issue</option>
                                <option value="customer_refused">Customer refused</option>
                                <option value="damaged_goods">Damaged goods</option>
                                <option value="other">Other</option>
                            </select>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Additional details…"
                                rows={2}
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: D.card, border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radiusSm, color: D.text,
                                    fontSize: '0.85rem', padding: '8px 10px', outline: 'none',
                                    resize: 'vertical', marginBottom: 10,
                                }}
                            />
                            <DeliveryBtn
                                variant="danger"
                                size="md"
                                onClick={() => handleSubmit('failed')}
                                onHover={onHover}
                                disabled={submitting || !reason}
                                style={{ width: '100%', marginTop: 4, justifyContent: 'center' }}
                            >
                                {submitting
                                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                                    : <><XCircle size={14} /> Confirm failed</>
                                }
                            </DeliveryBtn>
                        </div>
                    )}
                </div>
            )}

            {/* delivered info */}
            {item.status === 'delivered' && item.delivered_at && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: '10px 16px', fontSize: '0.75rem', color: D.teal }}>
                    <CheckCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Delivered at {fmtDateTime(item.delivered_at)}
                    {item.delivery_notes && (
                        <div style={{ color: D.textDim, marginTop: 4, fontStyle: 'italic' }}>
                            "{item.delivery_notes}"
                        </div>
                    )}
                </div>
            )}

            {/* failed info */}
            {item.status === 'failed' && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: '10px 16px', fontSize: '0.75rem', color: '#ef4444' }}>
                    <XCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {item.failed_reason ? item.failed_reason.replace(/_/g, ' ') : 'Failed'}
                </div>
            )}
            {showDetail && (
                <StopDetailModal item={item} onClose={() => setShowDetail(false)} />
            )}
        </div>
    );
}

// ── GPS ping simulator ──────────────────────────────────────────────────────────
function GpsPingPanel({ manifestId, isActive, audio }) {
    const [pinging, setPinging] = useState(false);
    const [lastPing, setLastPing] = useState(null);
    const intervalRef = useRef(null);

    const sendPing = useCallback(async () => {
        if (!manifestId || !isActive) return;
        setPinging(true);
        try {
            // Get real GPS position or fallback
            const getPosition = () => new Promise((resolve) => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => resolve({ lat: null, lng: null }), // Fallback on error/deny
                        { enableHighAccuracy: true, timeout: 5000 }
                    );
                } else {
                    resolve({ lat: null, lng: null });
                }
            });

            const coords = await getPosition();

            // ✅ FIX 1: Skip ping if geolocation failed or was denied by the user
            if (!coords.lat || !coords.lng) return;

            // ✅ FIX 2: Explicitly map 'lat'/'lng' to 'latitude'/'longitude' 
            // to satisfy backend validation rules
            await deliveryAPI.pingLocation({
                manifest_id: manifestId,
                latitude: coords.lat,
                longitude: coords.lng,
                timestamp: new Date().toISOString(),
            });
            
            setLastPing(new Date());
        } catch {
            // silent fail — driver shouldn't be interrupted
        } finally {
            setPinging(false);
        }
    }, [manifestId, isActive]);

    // Auto-ping every 30s when active
    useEffect(() => {
        if (isActive) {
            sendPing();
            intervalRef.current = setInterval(sendPing, 30000);
            return () => clearInterval(intervalRef.current);
        } else {
            clearInterval(intervalRef.current);
        }
    }, [isActive, sendPing]);

    if (!isActive) return null;

    return (
        <div style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 40, display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', borderRadius: D.radiusLg,
            background: D.card, border: `1px solid ${D.purpleBorder}`,
            boxShadow: D.purpleGlow, maxWidth: '90vw',
        }}>
            <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: pinging ? '#f59e0b' : D.teal,
                boxShadow: `0 0 6px ${pinging ? '#f59e0b' : D.teal}`,
            }} />
            <span style={{ fontSize: '0.75rem', color: D.textMid, whiteSpace: 'nowrap' }}>
                GPS {pinging ? 'syncing…' : lastPing ? `last ping ${lastPing.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'active'}
            </span>
            <button
                onClick={sendPing}
                style={{
                    background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                    borderRadius: D.radiusSm, padding: '4px 10px',
                    color: D.purple, fontSize: '0.72rem', fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                }}
            >
                Ping now
            </button>
        </div>
    );
}

const INCIDENT_CATEGORIES = [
    { value: 'road_condition',   label: 'Road Condition'   },
    { value: 'security_issue',   label: 'Security Issue'   },
    { value: 'misconduct',       label: 'Misconduct'       },
    { value: 'rude_customer',    label: 'Rude Customer'    },
    { value: 'assault',          label: 'Assault'          },
    { value: 'property_damage',  label: 'Property Damage'  },
    { value: 'other',            label: 'Other'            },
];

const INCIDENT_SEVERITIES = [
    { value: 'low',      label: 'Low'      },
    { value: 'medium',   label: 'Medium'   },
    { value: 'high',     label: 'High'     },
    { value: 'critical', label: 'Critical' },
];

// Categories that require a customer to be selected
const CUSTOMER_CATEGORIES = ['misconduct', 'rude_customer', 'assault', 'property_damage'];

function ReportIncidentModal({ manifest, onClose, onSuccess }) {
    const [category,        setCategory]        = useState('');
    const [severity,        setSeverity]        = useState('medium');
    const [description,     setDescription]     = useState('');
    const [reportedAgainst, setReportedAgainst] = useState('');
    const [submitting,      setSubmitting]      = useState(false);
    const [error,           setError]           = useState(null);

    const requiresCustomer = CUSTOMER_CATEGORIES.includes(category);

    // Extract unique customers from manifest items
    const customers = (manifest?.items ?? []).reduce((acc, item) => {
        const c = item.order?.customer;
        if (c?.user_id) {
            const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Customer';
            if (!acc.find(x => x.user_id === c.user_id)) {
                acc.push({ user_id: c.user_id, name });
            }
        }
        return acc;
    }, []);

    // Reset customer selection when switching to non-customer category
    useEffect(() => {
        if (!requiresCustomer) setReportedAgainst('');
    }, [category, requiresCustomer]);

    const canSubmit = category && severity && description.trim().length >= 20
        && (!requiresCustomer || reportedAgainst);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await deliveryAPI.fileDriverIncident({
                manifest_id:      manifest.id,
                category,
                severity,
                description:      description.trim(),
                reported_against: reportedAgainst || undefined,
            });
            onSuccess();
        } catch (e) {
            setError(e?.response?.data?.message ?? 'Failed to submit incident.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 50,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                padding: '0',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: D.card, width: '100%', maxWidth: 540,
                    
                    borderRadius: '20px 20px 0 0',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                    overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                }}
            >
                {/* top bar */}
                <div style={{ height: 4, background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />

                {/* header */}
                <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${D.purpleBorder}`, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(239,68,68,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Flag size={16} color="#ef4444" />
                            </div>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: D.text }}>Report Incident</div>
                                <div style={{ fontSize: '0.72rem', color: D.textDim }}>{manifest?.manifest_number}</div>
                            </div>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: D.textDim, fontSize: '1.2rem', lineHeight: 1, padding: 4,
                        }}>✕</button>
                    </div>
                </div>

                {/* body */}
                <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>

                    {/* category */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                            Incident type <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                            {INCIDENT_CATEGORIES.map(c => (
                                <button
                                    key={c.value}
                                    onClick={() => setCategory(c.value)}
                                    style={{
                                        padding: '8px 10px', borderRadius: D.radiusSm, cursor: 'pointer',
                                        border: `1px solid ${category === c.value ? '#ef4444' : D.purpleBorder}`,
                                        background: category === c.value ? 'rgba(239,68,68,0.08)' : 'transparent',
                                        color: category === c.value ? '#ef4444' : D.textMid,
                                        fontSize: '0.78rem', fontWeight: category === c.value ? 700 : 500,
                                        textAlign: 'left', transition: 'all 0.15s',
                                    }}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* customer selector — only for customer-related categories */}
                    {requiresCustomer && (
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                                Customer involved <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            {customers.length === 0 ? (
                                <div style={{ fontSize: '0.8rem', color: D.textDim, fontStyle: 'italic' }}>
                                    No customers found in this manifest.
                                </div>
                            ) : (
                                <select
                                    value={reportedAgainst}
                                    onChange={e => setReportedAgainst(e.target.value)}
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        background: D.card, border: `1px solid ${D.purpleBorder}`,
                                        borderRadius: D.radiusSm, color: D.text,
                                        fontSize: '0.85rem', padding: '9px 10px', outline: 'none', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Select customer…</option>
                                    {customers.map(c => (
                                        <option key={c.user_id} value={c.user_id}>{c.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    {/* severity */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                            Severity <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {INCIDENT_SEVERITIES.map(s => {
                                const colors = {
                                    low:      '#059669',
                                    medium:   '#d97706',
                                    high:     '#dc2626',
                                    critical: '#7c3aed',
                                };
                                const active = severity === s.value;
                                const color  = colors[s.value];
                                return (
                                    <button
                                        key={s.value}
                                        onClick={() => setSeverity(s.value)}
                                        style={{
                                            flex: 1, padding: '8px 4px', borderRadius: D.radiusSm, cursor: 'pointer',
                                            border: `1px solid ${active ? color : D.purpleBorder}`,
                                            background: active ? `${color}18` : 'transparent',
                                            color: active ? color : D.textMid,
                                            fontSize: '0.75rem', fontWeight: active ? 700 : 500,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {s.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* description */}
                    <div style={{ marginBottom: 6 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                            Description <span style={{ color: '#ef4444' }}>*</span>
                            <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: description.length < 20 ? '#ef4444' : D.teal }}>
                                ({description.length}/20 min)
                            </span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe what happened in detail…"
                            rows={4}
                            style={{
                                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, color: D.text,
                                fontSize: '0.85rem', padding: '9px 10px', outline: 'none',
                                fontFamily: 'inherit',
                            }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: D.radiusSm,
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                            color: '#ef4444', fontSize: '0.8rem',
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* footer */}
                <div style={{ padding: '12px 20px 20px', borderTop: `1px solid ${D.purpleBorder}`, flexShrink: 0 }}>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit || submitting}
                        style={{
                            width: '100%', padding: '13px', borderRadius: D.radiusSm, border: 'none',
                            background: canSubmit && !submitting
                                ? 'linear-gradient(135deg,#ef4444,#f97316)'
                                : 'rgba(239,68,68,0.2)',
                            color: canSubmit && !submitting ? 'white' : '#ef4444',
                            fontSize: '0.9rem', fontWeight: 700,
                            cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            transition: 'all 0.2s',
                        }}
                    >
                        {submitting
                            ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                            : <><Flag size={15} /> Submit incident report</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── main page ────────────────────────────────────────────────────────────────────
export default function DriverManifestDetailPage() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [manifest,    setManifest]    = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [error,       setError]       = useState(null);
    const [starting,    setStarting]    = useState(false);
    const [submittingId, setSubmittingId] = useState(null);
    const [actionError, setActionError] = useState(null);

    const [showRouteSheet, setShowRouteSheet] = useState(false);
    const [showIncidentModal, setShowIncidentModal] = useState(false);

    const fetchManifest = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getMyManifest(id);
            setManifest(res.data ?? res);
        } catch {
            setError('Failed to load manifest.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => { fetchManifest(); }, [fetchManifest]);

    const handleStartTrip = async () => {
        setStarting(true);
        setActionError(null);
        try {
            const getPosition = () => new Promise((resolve) => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => resolve({}),
                        { enableHighAccuracy: true, timeout: 5000 }
                    );
                } else resolve({});
            });
            const coords = await getPosition();
            await deliveryAPI.startTrip(manifest.id, coords);
            audio.playSuccess();
            fetchManifest(true);
        } catch (e) {
            setActionError(e?.response?.data?.message ?? 'Failed to start trip.');
            audio.playError();
        } finally {
            setStarting(false);
        }
    };

    const handleUpdateStop = async (itemId, data) => {
        setSubmittingId(itemId);
        setActionError(null);
        try {
            await deliveryAPI.updateStop(itemId, data);
            audio.playSuccess();
            fetchManifest(true);
        } catch (e) {
            setActionError(e?.response?.data?.message ?? 'Update failed.');
            audio.playError();
        } finally {
            setSubmittingId(null);
        }
    };

    // Derived
    const items     = manifest?.items ?? [];
    const total     = items.length;
    const delivered = items.filter(i => i.status === 'delivered').length;
    const failed    = items.filter(i => i.status === 'failed').length;
    const pct       = total > 0 ? Math.round((delivered / total) * 100) : 0;
    const isInProgress = manifest?.status === 'in_progress';
    const canStart  = manifest?.status === 'dispatched';
    const nextPendingIndex = items.findIndex(i => !['delivered', 'failed', 'returned'].includes(i.status));

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

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <button
                        onClick={() => { audio.playHover(); navigate('/driver/manifests'); }}
                        style={{
                            background: 'none', border: `1px solid ${D.purpleBorder}`,
                            borderRadius: D.radiusSm, padding: '6px 10px',
                            color: D.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <div>
                        <h1 style={{ fontSize: 'clamp(1.1rem, 3.5vw, 1.4rem)', fontWeight: 700, color: D.text, margin: 0 }}>
                            {manifest?.manifest_number}
                        </h1>
                        <p style={{ fontSize: '0.8rem', color: D.textDim, margin: '2px 0 0' }}>
                            {fmtDate(manifest?.scheduled_date)} · {total} stops
                        </p>
                    </div>
                    <button
                        onClick={() => { audio.playHover(); setShowIncidentModal(true); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', borderRadius: D.radiusSm,
                            border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.08)',
                            color: '#ef4444', fontSize: '0.78rem', fontWeight: 600,
                            cursor: 'pointer', flexShrink: 0,
                        }}
                    >
                        <Flag size={13} /> Report
                    </button>
                    <button
                        onClick={() => { audio.playHover(); setShowRouteSheet(true); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', borderRadius: D.radiusSm,
                            border: `1px solid ${D.purpleBorder}`,
                            background: D.purpleDim,
                            color: D.purple, fontSize: '0.78rem', fontWeight: 600,
                            cursor: 'pointer', flexShrink: 0,
                        }}
                    >
                        <Route size={13} /> Route
                    </button>
                </div>

                {/* action error */}
                {actionError && (
                    <div style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: D.radiusSm, padding: '10px 14px', color: '#ef4444',
                        fontSize: '0.82rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <AlertTriangle size={14} /> {actionError}
                    </div>
                )}

                {/* progress summary */}
                <DeliveryCard style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <StatusBadge status={manifest?.status} />
                            {isInProgress && (
                                <span style={{ fontSize: '0.75rem', color: D.purple, fontWeight: 600 }}>
                                    {delivered + failed}/{total} completed
                                </span>
                            )}
                        </div>
                        <span style={{ fontSize: 'clamp(1.2rem, 3vw, 1.6rem)', fontWeight: 700, color: D.purple }}>
                            {pct}%
                        </span>
                    </div>
                    <StopProgressBar total={total} delivered={delivered} failed={failed} />
                    {canStart && (
                        <DeliveryBtn
                            variant="primary"
                            size="md"
                            onClick={handleStartTrip}
                            onHover={audio.playHover}
                            disabled={starting}
                            style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                        >
                            {starting
                                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Starting…</>
                                : <><Play size={16} /> Start trip</>
                            }
                        </DeliveryBtn>
                    )}
                </DeliveryCard>

                {/* stops */}
                <DeliveryDivider label={`${total} stops`} />
                {items.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState icon={Package} title="No stops" sub="This manifest has no stops assigned." />
                    </DeliveryCard>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 'clamp(80px, 10vw, 120px)' }}>
                        {items.map((item, i) => (
                            <StopActionCard
                                key={item.id}
                                item={item}
                                index={i}
                                isNext={i === nextPendingIndex}
                                onUpdate={handleUpdateStop}
                                onHover={audio.playHover}
                                submitting={submittingId === item.id}
                            />
                        ))}
                    </div>
                )}

                {/* floating GPS ping panel */}
                <GpsPingPanel manifestId={manifest?.id} isActive={isInProgress} audio={audio} />

                {showRouteSheet && (
                    <DriverRouteSheet
                        manifest={manifest}
                        onClose={() => setShowRouteSheet(false)}
                        onHover={audio.playHover}
                        onManifestUpdate={(newItems) => {
                            setManifest(prev => prev ? { ...prev, items: newItems } : prev);
                        }}
                    />
                )}

                {showIncidentModal && (
                    <ReportIncidentModal
                        manifest={manifest}
                        onClose={() => setShowIncidentModal(false)}
                        onSuccess={() => {
                            setShowIncidentModal(false);
                            audio.playSuccess();
                        }}
                    />
                )}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}