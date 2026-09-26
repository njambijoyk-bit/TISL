import { useState } from 'react';
import {
    X, User, Package, FileText, ShieldAlert,
    CheckCircle, XCircle, AlertTriangle, Clock,
    MapPin, CreditCard, Truck, ChevronDown, ChevronUp,
    Image as ImageIcon, Star, Building2, Phone, Mail,
    Hash, Tag, Award, TrendingUp, Receipt,
} from 'lucide-react';
import { D, StatusBadge } from './DeliveryShared';

// ─── colour tokens (white-mode UI + terminal) ─────────────────────────────────
const M = {
    bg:          '#ffffff',
    surface:     '#f8fafc',
    border:      '#e2e8f0',
    borderStrong:'#cbd5e1',
    text:        '#0f172a',
    textMid:     '#475569',
    textDim:     '#94a3b8',
    accent:      D.purple,
    teal:        D.teal,
    red:         '#ef4444',
    amber:       '#f59e0b',
    green:       '#22c55e',
    radius:      D.radius,
    radiusSm:    D.radiusSm,
    radiusLg:    D.radiusLg,

    // terminal
    termBg:      '#0a0a0a',
    termBorder:  '#1a1a1a',
    termDate:    '#ffffff',
    termRoute:   '#22c55e',
    termDots:    '#2a2a2a',
    termValue:   '#f59e0b',
    termDim:     '#4a4a4a',
    termHeader:  '#1e1e1e',
};

// ─── tiny helpers ─────────────────────────────────────────────────────────────
function fmt(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMoney(amount, currency = 'KES') {
    if (amount == null) return '—';
    const n = parseFloat(amount);
    if (isNaN(n)) return '—';
    return `${currency} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function dotPad(left, right, total = 52) {
    const dots = Math.max(4, total - left.length - String(right).length);
    return '.'.repeat(dots);
}

// ─── shared label/value ───────────────────────────────────────────────────────
function FL({ label, value, accent }) {
    return (
        <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: M.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
                {label}
            </div>
            <div style={{ fontSize: '0.83rem', color: accent ?? M.text, fontWeight: 500, wordBreak: 'break-word' }}>
                {value ?? '—'}
            </div>
        </div>
    );
}

// ─── tier badge ───────────────────────────────────────────────────────────────
function TierBadge({ tier }) {
    const map = {
        platinum: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.35)', color: '#7c3aed' },
        gold:     { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', color: '#b45309' },
        silver:   { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.35)', color: '#475569' },
        bronze:   { bg: 'rgba(180,83,9,0.1)',   border: 'rgba(180,83,9,0.35)',   color: '#92400e' },
    };
    const s = map[tier] ?? map.silver;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
            textTransform: 'capitalize',
        }}>
            <Award size={10} /> {tier ?? 'standard'}
        </span>
    );
}

// ─── payment status badge ─────────────────────────────────────────────────────
function PayBadge({ status }) {
    const map = {
        paid:        { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  color: '#15803d' },
        unpaid:      { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  color: '#dc2626' },
        overpayment: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#b45309' },
        partial:     { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#b45309' },
    };
    const s = map[status] ?? map.unpaid;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 9px', borderRadius: 20,
            fontSize: '0.7rem', fontWeight: 700,
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
            textTransform: 'capitalize',
        }}>
            {status?.replace('_', ' ') ?? '—'}
        </span>
    );
}

// ─── fulfillment chip ─────────────────────────────────────────────────────────
function FulfilChip({ status }) {
    const map = {
        in_stock:  { color: '#15803d', bg: 'rgba(34,197,94,0.08)'  },
        backorder: { color: '#b45309', bg: 'rgba(245,158,11,0.08)' },
        out_of_stock: { color: '#dc2626', bg: 'rgba(239,68,68,0.08)' },
    };
    const s = map[status] ?? { color: M.textDim, bg: M.surface };
    return (
        <span style={{
            fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px',
            borderRadius: 20, background: s.bg, color: s.color,
            textTransform: 'capitalize',
        }}>
            {status?.replace('_', ' ') ?? '—'}
        </span>
    );
}

// ─── section divider ─────────────────────────────────────────────────────────
function SectionHead({ label }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '20px 0 12px',
        }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: M.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {label}
            </span>
            <div style={{ flex: 1, height: 1, background: M.border }} />
        </div>
    );
}

// ─── TAB 1 : Customer & Order ─────────────────────────────────────────────────
function TabCustomer({ item }) {
    const order    = item.order ?? {};
    const customer = order.customer ?? {};
    const currency = order.currency ?? 'KES';
    const [itemsOpen, setItemsOpen] = useState(false);

    const custName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || '—';

    return (
        <div>
            {/* ── customer card ── */}
            <div style={{
                background: M.surface,
                border: `1px solid ${M.border}`,
                borderRadius: M.radius,
                padding: '16px',
                marginBottom: 16,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    {/* avatar */}
                    <div style={{
                        width: 46, height: 46, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${M.accent}22, ${M.teal}22)`,
                        border: `2px solid ${M.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', fontWeight: 700, color: M.accent,
                        flexShrink: 0, overflow: 'hidden',
                    }}>
                        {customer.profile_image_url
                            ? <img src={customer.profile_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (custName[0] ?? '?')
                        }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: M.text }}>{custName}</div>
                        <div style={{ fontSize: '0.75rem', color: M.textMid, marginTop: 2 }}>{customer.customer_number ?? '—'}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                            <TierBadge tier={customer.tier} />
                            {customer.customer_type && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                                    background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)', color: '#0369a1',
                                    textTransform: 'capitalize',
                                }}>
                                    <Building2 size={9} /> {customer.customer_type}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px 20px' }}>
                    <FL label="Phone" value={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Phone size={11} color={M.accent} /> {customer.phone ?? '—'}
                        </span>
                    } />
                    <FL label="Email" value={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Mail size={11} color={M.accent} /> {customer.email ?? '—'}
                        </span>
                    } />
                    {customer.company_name && <FL label="Company" value={customer.company_name} />}
                    {customer.alternate_phone && <FL label="Alt Phone" value={customer.alternate_phone} />}
                    <FL label="Total orders" value={customer.total_orders ?? '—'} />
                    <FL label="Total spent" value={fmtMoney(customer.total_spent, 'KES')} accent={M.accent} />
                    <FL label="Store credit" value={fmtMoney(customer.store_credit, 'KES')} />
                    <FL label="Loyalty points" value={customer.loyalty_points?.toLocaleString() ?? '—'} />
                    {customer.has_credit_account && (
                        <FL label="Credit available" value={fmtMoney(customer.available_credit, 'KES')} accent={M.teal} />
                    )}
                </div>

                {/* tier benefits */}
                {customer.tier_benefits && (
                    <div style={{
                        marginTop: 12, padding: '8px 12px',
                        background: 'rgba(168,85,247,0.04)',
                        border: '1px solid rgba(168,85,247,0.15)',
                        borderRadius: M.radiusSm,
                        display: 'flex', gap: 16, flexWrap: 'wrap',
                    }}>
                        <span style={{ fontSize: '0.72rem', color: M.textMid }}>
                            <span style={{ fontWeight: 700, color: M.accent }}>{customer.tier_benefits.discount}%</span> tier discount
                        </span>
                        <span style={{ fontSize: '0.72rem', color: M.textMid }}>
                            <span style={{ fontWeight: 700, color: M.accent }}>{customer.tier_benefits.loyalty_points_multiplier}×</span> points
                        </span>
                        {customer.tier_benefits.priority_support && (
                            <span style={{ fontSize: '0.72rem', color: M.teal, fontWeight: 600 }}>✓ Priority support</span>
                        )}
                        {customer.tier_benefits.free_shipping_threshold === 0 && (
                            <span style={{ fontSize: '0.72rem', color: M.teal, fontWeight: 600 }}>✓ Free shipping</span>
                        )}
                    </div>
                )}
            </div>

            {/* ── order card ── */}
            <div style={{
                background: M.surface,
                border: `1px solid ${M.border}`,
                borderRadius: M.radius,
                padding: '16px',
            }}>
                {/* order header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: M.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                            Order
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: M.text, fontFamily: 'monospace' }}>
                            {order.order_number ?? '—'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <StatusBadge status={order.status} />
                        <PayBadge status={order.payment_status} />
                    </div>
                </div>

                {/* financials */}
                <div style={{
                    background: M.bg,
                    border: `1px solid ${M.border}`,
                    borderRadius: M.radiusSm,
                    overflow: 'hidden',
                    marginBottom: 14,
                }}>
                    {[
                        { label: 'Subtotal',     value: fmtMoney(order.subtotal_kes, 'KES') },
                        { label: 'Tax',          value: fmtMoney(order.tax, 'KES') },
                        { label: 'Discount',     value: order.discount > 0 ? `- ${fmtMoney(order.discount, 'KES')}` : '—', accent: M.green },
                        { label: 'Store credit', value: order.store_credit_deduction > 0 ? `- ${fmtMoney(order.store_credit_deduction_kes, 'KES')}` : '—', accent: M.teal },
                        { label: 'Shipping',     value: fmtMoney(order.shipping_cost, 'KES') },
                    ].map(({ label, value, accent }, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '7px 12px',
                            borderBottom: i < 4 ? `1px solid ${M.border}` : 'none',
                        }}>
                            <span style={{ fontSize: '0.78rem', color: M.textMid }}>{label}</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: accent ?? M.text }}>{value}</span>
                        </div>
                    ))}
                    {/* total row */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px',
                        background: `${M.accent}08`,
                        borderTop: `2px solid ${M.accent}22`,
                    }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: M.text }}>Total ({order.currency ?? 'KES'})</span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: M.accent }}>
                            {fmtMoney(order.total, order.currency)}
                        </span>
                    </div>
                    {order.currency !== 'KES' && (
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 12px',
                            background: M.surface,
                        }}>
                            <span style={{ fontSize: '0.72rem', color: M.textDim }}>KES equivalent</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: M.textMid }}>
                                {fmtMoney(order.total_kes, 'KES')}
                            </span>
                        </div>
                    )}
                </div>

                {/* order meta grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 20px', marginBottom: 14 }}>
                    <FL label="Payment method" value={order.payment_method?.replace(/_/g, ' ')} />
                    <FL label="Shipping method" value={order.shipping_method_name ?? order.delivery_method?.replace(/_/g, ' ')} />
                    <FL label="Priority" value={order.priority} />
                    <FL label="Courier" value={order.courier_company} />
                    <FL label="Shipping address" value={order.shipping_address} />
                    {order.confirmed_at && <FL label="Confirmed" value={fmt(order.confirmed_at)} />}
                    {order.shipped_at   && <FL label="Shipped"   value={fmt(order.shipped_at)}   />}
                    {order.delivered_at && <FL label="Delivered" value={fmt(order.delivered_at)} accent={M.teal} />}
                </div>

                {/* order items expandable */}
                {order.items?.length > 0 && (
                    <>
                        <button
                            onClick={() => setItemsOpen(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                width: '100%', background: 'none', border: `1px solid ${M.border}`,
                                borderRadius: M.radiusSm, padding: '8px 12px',
                                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: M.text,
                                textAlign: 'left',
                            }}
                        >
                            <Package size={13} color={M.accent} />
                            {order.items.length} order item{order.items.length !== 1 ? 's' : ''}
                            <span style={{ marginLeft: 'auto', color: M.textDim }}>
                                {itemsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </span>
                        </button>

                        {itemsOpen && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {order.items.map((oi, i) => (
                                    <div key={i} style={{
                                        display: 'flex', gap: 10, alignItems: 'flex-start',
                                        padding: '10px 12px',
                                        background: M.bg,
                                        border: `1px solid ${M.border}`,
                                        borderRadius: M.radiusSm,
                                    }}>
                                        {/* product image */}
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                                            background: M.surface, border: `1px solid ${M.border}`,
                                            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {oi.product_image
                                                ? <img
                                                    src={oi.product_image.startsWith('http') ? oi.product_image : `http://localhost:8000${oi.product_image}`}
                                                    alt=""
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={e => { e.target.style.display = 'none'; }}
                                                  />
                                                : <Package size={16} color={M.textDim} />
                                            }
                                        </div>

                                        {/* details */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: M.text, marginBottom: 2 }}>
                                                {oi.product_name}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: M.textDim, marginBottom: 4 }}>
                                                SKU: {oi.product_sku} · {oi.brand_name}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <FulfilChip status={oi.fulfillment_status} />
                                                <span style={{ fontSize: '0.68rem', color: M.textDim }}>
                                                    stock: <span style={{ fontWeight: 600, color: oi.stock_status === 'out_of_stock' ? M.red : M.textMid }}>
                                                        {oi.stock_status?.replace('_', ' ')}
                                                    </span>
                                                </span>
                                                {oi.is_backorder && (
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: M.amber }}>BACKORDER</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* price col */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: '0.72rem', color: M.textDim }}>
                                                ×{parseFloat(oi.quantity).toFixed(0)}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: M.text, marginTop: 2 }}>
                                                {fmtMoney(oi.line_total_after_discount, order.currency)}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: M.textDim, marginTop: 1 }}>
                                                @ {fmtMoney(oi.unit_price, order.currency)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* customer / admin notes */}
                {(order.customer_notes || order.admin_notes) && (
                    <>
                        <SectionHead label="Notes" />
                        {order.customer_notes && (
                            <div style={{ fontSize: '0.78rem', color: M.textMid, fontStyle: 'italic', marginBottom: 8 }}>
                                "{order.customer_notes}"
                            </div>
                        )}
                        {order.admin_notes && (
                            <pre style={{
                                margin: 0, padding: '10px 12px',
                                background: M.surface, border: `1px solid ${M.border}`,
                                borderRadius: M.radiusSm,
                                fontSize: '0.72rem', color: M.textMid,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                fontFamily: 'monospace', lineHeight: 1.6,
                                maxHeight: 140, overflowY: 'auto',
                            }}>
                                {order.admin_notes}
                            </pre>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── TAB 2 : Manifest Stop ────────────────────────────────────────────────────
function TabManifest({ item, manifest }) {
    const [lightbox, setLightbox] = useState(false);
    const order = item.order ?? {};

    // parse SKIPPED notes
    const parseNote = (note) => {
        if (!note) return null;
        const isSkipped = note.startsWith('[SKIPPED]');
        const match = isSkipped ? note.match(/^\[SKIPPED\]\s*([\d\-]+ [\d:]+):\s*(.+)$/) : null;
        return {
            isSkipped,
            timestamp: match?.[1] ?? null,
            text: match?.[2] ?? (isSkipped ? note.replace(/^\[SKIPPED\]\s*/, '') : note),
        };
    };
    const parsedNote = parseNote(item.delivery_notes);

    // curated terminal rows — key / value pairs from manifest item (no deep nested order)
    const terminalRows = [
        { key: 'delivery_item_id',    value: item.id },
        { key: 'manifest_id',         value: item.manifest_id },
        { key: 'order_id',            value: item.order_id },
        { key: 'status',              value: item.status },
        { key: 'sort_order',          value: item.sort_order },
        { key: 'distance_from_prev',  value: item.distance_from_prev_km ? `${item.distance_from_prev_km} km` : 'null' },
        { key: 'delivery_lat',        value: item.delivery_latitude ?? 'null' },
        { key: 'delivery_lng',        value: item.delivery_longitude ?? 'null' },
        { key: 'arrival_lat',         value: item.arrival_latitude ?? 'null' },
        { key: 'arrival_lng',         value: item.arrival_longitude ?? 'null' },
        { key: 'estimated_arrival',   value: item.estimated_arrival ?? 'null' },
        { key: 'attempted_at',        value: item.attempted_at ?? 'null' },
        { key: 'delivered_at',        value: item.delivered_at ?? 'null' },
        { key: 'returned_at',         value: item.returned_at ?? 'null' },
        { key: 'failed_reason',       value: item.failed_reason ?? 'null' },
        { key: 'proof_of_delivery',   value: item.proof_of_delivery ?? 'null' },
        { key: 'is_on_time',          value: item.is_on_time === null ? 'null' : String(item.is_on_time) },
        { key: 'minutes_late',        value: item.minutes_late ?? 'null' },
        { key: 'time_from_prev_mins', value: item.time_from_prev_minutes ?? 'null' },
        { key: 'created_at',          value: item.created_at ?? 'null' },
        { key: 'updated_at',          value: item.updated_at ?? 'null' },
    ];

    const termDate = new Date(item.updated_at ?? item.created_at).toISOString().slice(0, 10);

    return (
        <div>
            {/* ── stop meta ── */}
            <div style={{
                background: M.surface, border: `1px solid ${M.border}`,
                borderRadius: M.radius, padding: 16, marginBottom: 14,
            }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: `${M.accent}15`, border: `1px solid ${M.accent}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.78rem', fontWeight: 800, color: M.accent, flexShrink: 0,
                    }}>
                        {item.sort_order ?? '?'}
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: M.text }}>
                        Stop #{item.sort_order}
                    </span>
                    <StatusBadge status={item.status} />
                    {item.failed_reason && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: M.red,
                        }}>
                            <XCircle size={10} /> {item.failed_reason.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 20px' }}>
                    <FL label="Distance from prev" value={item.distance_from_prev_km ? `${item.distance_from_prev_km} km` : '—'} />
                    <FL label="Estimated arrival"  value={fmt(item.estimated_arrival)} />
                    <FL label="Attempted at"       value={fmt(item.attempted_at)} />
                    <FL label="Delivered at"       value={fmt(item.delivered_at)} accent={item.delivered_at ? M.teal : undefined} />
                    <FL label="Created"            value={fmt(item.created_at)} />
                    <FL label="Last updated"       value={fmt(item.updated_at)} />
                    <FL label="Returned at"        value={fmt(item.returned_at)} accent={M.amber} />
                    {item.is_on_time !== null && (
                        <FL label="On time" value={item.is_on_time ? '✓ Yes' : '✗ No'} accent={item.is_on_time ? M.teal : M.red} />
                    )}
                    {item.minutes_late && (
                        <FL label="Minutes late" value={`${item.minutes_late} min`} accent={M.amber} />
                    )}
                </div>
            </div>

            {/* ── delivery notes ── */}
            {parsedNote && (
                <div style={{
                    background: parsedNote.isSkipped ? 'rgba(245,158,11,0.05)' : M.surface,
                    border: `1px solid ${parsedNote.isSkipped ? 'rgba(245,158,11,0.25)' : M.border}`,
                    borderRadius: M.radius, padding: 14, marginBottom: 14,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <AlertTriangle size={13} color={parsedNote.isSkipped ? M.amber : M.textDim} />
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em',
                            color: parsedNote.isSkipped ? M.amber : M.textDim,
                        }}>
                            {parsedNote.isSkipped ? 'Skipped — driver note' : 'Delivery note'}
                        </span>
                        {parsedNote.timestamp && (
                            <span style={{ fontSize: '0.68rem', color: M.textDim, marginLeft: 'auto' }}>{parsedNote.timestamp}</span>
                        )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.83rem', color: parsedNote.isSkipped ? '#92400e' : M.textMid, fontStyle: 'italic', lineHeight: 1.5 }}>
                        "{parsedNote.text}"
                    </p>
                </div>
            )}

            {/* ── proof of delivery ── */}
            {item.proof_of_delivery_url ? (
                <div style={{
                    background: M.surface, border: `1px solid ${M.border}`,
                    borderRadius: M.radius, padding: 14, marginBottom: 14,
                }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: M.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                        Proof of Delivery
                    </div>
                    <img
                        src={item.proof_of_delivery_url}
                        alt="Proof of delivery"
                        onClick={() => setLightbox(true)}
                        style={{
                            width: '100%', maxHeight: 180, objectFit: 'cover',
                            borderRadius: M.radiusSm, cursor: 'zoom-in',
                            border: `1px solid ${M.border}`,
                        }}
                        onError={e => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                    <div style={{ display: 'none', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: M.textDim, marginTop: 6 }}>
                        <ImageIcon size={13} />
                        <a href={item.proof_of_delivery_url} target="_blank" rel="noopener noreferrer" style={{ color: M.accent }}>
                            View photo
                        </a>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: M.textDim, marginTop: 6 }}>Click to enlarge</div>
                </div>
            ) : (
                <div style={{
                    background: M.surface, border: `1px dashed ${M.border}`,
                    borderRadius: M.radius, padding: '12px 14px', marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <ImageIcon size={14} color={M.textDim} />
                    <span style={{ fontSize: '0.78rem', color: M.textDim }}>No proof of delivery</span>
                </div>
            )}

            {/* ── TERMINAL PANEL ── */}
            <div style={{
                background: M.termBg,
                border: `1px solid ${M.termBorder}`,
                borderRadius: M.radius,
                overflow: 'hidden',
                marginBottom: 14,
                fontFamily: "'Courier New', Courier, monospace",
            }}>
                {/* terminal title bar */}
                <div style={{
                    background: M.termHeader,
                    padding: '8px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: `1px solid ${M.termBorder}`,
                }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {['#ff5f57','#febc2e','#28c840'].map((c, i) => (
                            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                        ))}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#555', marginLeft: 8, fontFamily: 'monospace' }}>
                        delivery_item:{item.id} · manifest:{manifest?.manifest_number} · stop:{item.sort_order}
                    </span>
                </div>

                {/* terminal body */}
                <div style={{ padding: '10px 0', maxHeight: 320, overflowY: 'auto' }}>
                    {terminalRows.map(({ key, value }, i) => {
                        const isNull = value === 'null';
                        const dots = dotPad(key, String(value));
                        return (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'baseline',
                                padding: '2px 14px',
                                fontSize: '0.74rem', lineHeight: 1.7,
                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                            }}>
                                {/* date */}
                                <span style={{ color: M.termDate, marginRight: 14, flexShrink: 0, opacity: 0.7 }}>
                                    {termDate}
                                </span>
                                {/* key */}
                                <span style={{ color: M.termRoute, flexShrink: 0, minWidth: 170 }}>
                                    {key}
                                </span>
                                {/* dots */}
                                <span style={{
                                    flex: 1, color: M.termDots,
                                    overflow: 'hidden', whiteSpace: 'nowrap',
                                    margin: '0 6px',
                                }}>
                                    {'.'.repeat(60)}
                                </span>
                                {/* value */}
                                <span style={{
                                    color: isNull ? M.termDim : M.termValue,
                                    flexShrink: 0,
                                    fontStyle: isNull ? 'italic' : 'normal',
                                }}>
                                    {String(value)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* lightbox */}
            {lightbox && (
                <div
                    onClick={() => setLightbox(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 200,
                        background: 'rgba(0,0,0,0.92)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 24, cursor: 'zoom-out',
                    }}
                >
                    <img
                        src={item.proof_of_delivery_url}
                        alt="POD"
                        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: M.radius, boxShadow: '0 8px 60px rgba(0,0,0,0.6)' }}
                        onClick={e => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setLightbox(false)}
                        style={{
                            position: 'absolute', top: 20, right: 20,
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '50%', width: 36, height: 36,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#fff',
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── TAB 3 : Incidents ────────────────────────────────────────────────────────
function TabIncidents({ item, manifest }) {
    // customer incidents — filed against driver, scoped to this stop
    const customerIncidents = (item.incidents ?? []).filter(i => i.reporter_role === 'customer');
    // driver incidents — filed against customer, manifest-level (no stop scope)
    const driverIncidents   = (manifest?.incidents ?? []).filter(i => i.reporter_role === 'driver');

    const severityStyle = {
        low:      { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#15803d', dot: '#22c55e' },
        medium:   { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#b45309', dot: '#f59e0b' },
        high:     { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  color: '#dc2626', dot: '#ef4444' },
        critical: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',   color: '#7f1d1d', dot: '#ef4444' },
    };

    const IncidentCard = ({ inc }) => {
        const s = severityStyle[inc.severity] ?? severityStyle.medium;
        const byDriver = inc.reporter_role === 'driver';

        return (
            <div style={{
                background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: M.radius, padding: 14,
            }}>
                {/* header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: s.dot,
                        marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${s.dot}`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* category + badges */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: M.text }}>
                                {inc.category_label ?? inc.category?.replace(/_/g, ' ') ?? 'Incident'}
                            </span>
                            <span style={{
                                padding: '1px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                                background: s.bg, border: `1px solid ${s.border}`, color: s.color,
                                textTransform: 'uppercase',
                            }}>
                                {inc.severity_label ?? inc.severity}
                            </span>
                            <span style={{
                                padding: '1px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600,
                                background: inc.status === 'resolved'
                                    ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
                                border: `1px solid ${inc.status === 'resolved'
                                    ? 'rgba(34,197,94,0.3)' : 'rgba(148,163,184,0.3)'}`,
                                color: inc.status === 'resolved' ? '#15803d' : M.textMid,
                                textTransform: 'capitalize',
                            }}>
                                {inc.status_label ?? inc.status?.replace(/_/g, ' ')}
                            </span>
                        </div>

                        {/* reporter line */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: M.textDim }}>
                                {byDriver ? '🚗 Driver filed against customer' : '👤 Customer filed against driver'}
                            </span>
                            {inc.created_at && (
                                <span style={{ fontSize: '0.68rem', color: M.textDim }}>· {fmt(inc.created_at)}</span>
                            )}
                        </div>

                        {/* reporter / accused names if available */}
                        {(inc.reporter || inc.accused) && (
                            <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                                {inc.reporter && (
                                    <span style={{ fontSize: '0.7rem', color: M.textMid }}>
                                        <span style={{ fontWeight: 700, color: M.text }}>By: </span>
                                        {inc.reporter.name}
                                    </span>
                                )}
                                {inc.accused && (
                                    <span style={{ fontSize: '0.7rem', color: M.textMid }}>
                                        <span style={{ fontWeight: 700, color: M.text }}>Against: </span>
                                        {inc.accused.name}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* description */}
                {inc.description && (
                    <p style={{
                        margin: '0 0 8px 18px', fontSize: '0.8rem',
                        color: M.textMid, lineHeight: 1.6,
                    }}>
                        {inc.description}
                    </p>
                )}

                {/* redacted notice */}
                {inc.is_redacted && (
                    <div style={{
                        marginLeft: 18, marginBottom: 8,
                        padding: '5px 10px', borderRadius: M.radiusSm,
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                        fontSize: '0.7rem', color: '#dc2626', fontWeight: 600,
                    }}>
                        ⚠ Description redacted
                    </div>
                )}

                {/* visibility flags */}
                <div style={{ display: 'flex', gap: 8, marginLeft: 18, marginBottom: inc.resolution_notes ? 10 : 0, flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        background: inc.driver_can_see ? 'rgba(168,85,247,0.1)' : 'rgba(148,163,184,0.08)',
                        border: `1px solid ${inc.driver_can_see ? 'rgba(168,85,247,0.3)' : 'rgba(148,163,184,0.2)'}`,
                        color: inc.driver_can_see ? M.accent : M.textDim,
                    }}>
                        {inc.driver_can_see ? '✓ Driver visible' : '✗ Driver hidden'}
                    </span>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        background: inc.customer_can_see ? 'rgba(14,165,233,0.1)' : 'rgba(148,163,184,0.08)',
                        border: `1px solid ${inc.customer_can_see ? 'rgba(14,165,233,0.3)' : 'rgba(148,163,184,0.2)'}`,
                        color: inc.customer_can_see ? '#0369a1' : M.textDim,
                    }}>
                        {inc.customer_can_see ? '✓ Customer visible' : '✗ Customer hidden'}
                    </span>
                </div>

                {/* resolution notes */}
                {inc.resolution_notes && (
                    <div style={{
                        marginTop: 10, marginLeft: 18, padding: '8px 12px',
                        background: 'rgba(255,255,255,0.5)', borderRadius: M.radiusSm,
                        fontSize: '0.75rem', color: M.textMid,
                    }}>
                        <span style={{ fontWeight: 700, color: M.text }}>Resolution: </span>
                        {inc.resolution_notes}
                    </div>
                )}
            </div>
        );
    };

    const hasAny = customerIncidents.length > 0 || driverIncidents.length > 0;

    if (!hasAny) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
            }}>
                <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                    <CheckCircle size={22} color={M.teal} />
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: M.text, marginBottom: 6 }}>No incidents</div>
                <div style={{ fontSize: '0.78rem', color: M.textDim, maxWidth: 260 }}>
                    No incidents reported for this stop.
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── customer complaints ── */}
            {customerIncidents.length > 0 && (
                <div>
                    <SectionHead label={`Customer complaints · ${customerIncidents.length}`} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {customerIncidents.map((inc, i) => <IncidentCard key={inc.id ?? i} inc={inc} />)}
                    </div>
                </div>
            )}

            {/* ── driver complaints ── */}
            {driverIncidents.length > 0 && (
                <div>
                    <SectionHead label={`Driver complaints · ${driverIncidents.length}`} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {driverIncidents.map((inc, i) => <IncidentCard key={inc.id ?? i} inc={inc} />)}
                    </div>
                </div>
            )}

        </div>
    );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
const TABS = [
    { id: 'customer', label: 'Customer & Order', icon: User    },
    { id: 'manifest', label: 'Stop Details',     icon: Truck   },
    { id: 'incidents',label: 'Incidents',        icon: ShieldAlert },
];

export default function ManifestItemModal({ item, manifest, onClose, audio }) {
    const [activeTab, setActiveTab] = useState('customer');

    const incidentCount = item?.incidents?.length ?? 0;
    const order = item?.order ?? {};
    const customer = order.customer ?? {};
    const custName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || '—';

    // close on Escape
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'clamp(12px, 3vw, 24px)',
                backdropFilter: 'blur(3px)',
            }}
            onClick={onClose}
            onKeyDown={handleKeyDown}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: M.bg,
                    border: `1px solid ${M.border}`,
                    borderRadius: M.radiusLg,
                    width: '100%',
                    maxWidth: 620,
                    maxHeight: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
                    overflow: 'hidden',
                }}
            >
                {/* ── modal header ── */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${M.border}`,
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    background: M.surface,
                }}>
                    {/* stop badge */}
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: `${M.accent}15`, border: `1px solid ${M.accent}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.85rem', fontWeight: 800, color: M.accent,
                        flexShrink: 0,
                    }}>
                        {item.sort_order ?? '?'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: M.text }}>{custName}</span>
                            <StatusBadge status={item.status} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: M.textDim, marginTop: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Hash size={10} /> {order.order_number ?? '—'}
                            </span>
                            {item.distance_from_prev_km && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <MapPin size={10} /> {item.distance_from_prev_km} km from prev
                                </span>
                            )}
                            {item.failed_reason && (
                                <span style={{ color: M.red, fontWeight: 600 }}>
                                    ✗ {item.failed_reason.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* close */}
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: `1px solid ${M.border}`,
                            borderRadius: 8, width: 30, height: 30,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: M.textDim, flexShrink: 0,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = M.surface; e.currentTarget.style.color = M.text; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = M.textDim; }}
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* ── tabs ── */}
                <div style={{
                    display: 'flex', borderBottom: `1px solid ${M.border}`,
                    background: M.surface, padding: '0 20px',
                    gap: 2,
                }}>
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); audio?.playHover?.(); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '11px 14px',
                                    background: 'none', border: 'none',
                                    borderBottom: `2px solid ${active ? M.accent : 'transparent'}`,
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    fontWeight: active ? 700 : 500,
                                    color: active ? M.accent : M.textMid,
                                    transition: 'all 0.15s',
                                    whiteSpace: 'nowrap',
                                    marginBottom: -1,
                                }}
                                onMouseEnter={e => { if (!active) e.currentTarget.style.color = M.text; }}
                                onMouseLeave={e => { if (!active) e.currentTarget.style.color = M.textMid; }}
                            >
                                <Icon size={13} />
                                {tab.label}
                                {tab.id === 'incidents' && incidentCount > 0 && (
                                    <span style={{
                                        background: M.red, color: '#fff',
                                        borderRadius: 20, fontSize: '0.62rem', fontWeight: 800,
                                        padding: '1px 6px', lineHeight: 1.4,
                                    }}>
                                        {incidentCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── tab content ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
                    {activeTab === 'customer'  && <TabCustomer  item={item} />}
                    {activeTab === 'manifest'  && <TabManifest  item={item} manifest={manifest} />}
                    {activeTab === 'incidents' && <TabIncidents item={item} />}
                </div>
            </div>
        </div>
    );
}