import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    X, Map, List, Radio, Navigation, Phone,
    ChevronUp, ChevronDown, SkipForward, Loader2,
    CheckCircle, XCircle, Package, AlertTriangle,
    MapPin, Clock, Zap, RefreshCw, Sparkles,
} from 'lucide-react';
import deliveryAPI from '../../../api/delivery';
import { D, StatusBadge, DeliveryBtn } from '../delivery/DeliveryShared';

// ── constants ─────────────────────────────────────────────────────────────────
const TABS = [
    { key: 'map',   label: 'Map',        Icon: Map   },
    { key: 'stops', label: 'Stops',      Icon: List  },
    { key: 'trail', label: 'Ping Trail', Icon: Radio },
];

const STATUS_COLOR = {
    delivered:        '#14b8a6',
    failed:           '#ef4444',
    returned:         '#f59e0b',
    out_for_delivery: '#a855f7',
    pending:          '#64748b',
};

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtSpeed(kmh) {
    if (kmh == null) return '—';
    return `${Number(kmh).toFixed(1)} km/h`;
}

// ── build a self-contained Leaflet HTML page to inject as iframe srcDoc ───────
// Draws route polyline with km labels between stops, and leg distance badges.
function buildLeafletHtml({ items, driverPos, pings, showTrail = false }) {
    const allPoints = [];
    if (driverPos?.lat && driverPos?.lng) allPoints.push([driverPos.lat, driverPos.lng]);
    items.forEach(i => {
        if (i.delivery_latitude && i.delivery_longitude)
            allPoints.push([Number(i.delivery_latitude), Number(i.delivery_longitude)]);
    });
    if (showTrail) {
        pings.forEach(p => { if (p.lat && p.lng) allPoints.push([p.lat, p.lng]); });
    }

    const centerLat = allPoints.length > 0
        ? allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length
        : -4.0435;
    const centerLng = allPoints.length > 0
        ? allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length
        : 39.6682;

    // Build stop markers JS
    const stopMarkersJs = items
        .filter(i => i.delivery_latitude && i.delivery_longitude)
        .map((item, idx) => {
            const color    = STATUS_COLOR[item.status] ?? '#64748b';
            const label    = idx + 1;
            const custName = (item.customer_name ?? 'Stop').replace(/'/g, "\\'");
            const addr     = (item.shipping_address ?? '').replace(/'/g, "\\'");
            const dist     = item.distance_from_prev_km != null
                ? `${Number(item.distance_from_prev_km).toFixed(1)} km from prev`
                : '';
            return `
L.marker([${Number(item.delivery_latitude)}, ${Number(item.delivery_longitude)}], {
    icon: L.divIcon({
        className: '',
        html: \`<div style="
            width:28px;height:28px;border-radius:50%;
            background:${color};border:2px solid white;
            display:flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:700;color:white;
            box-shadow:0 2px 6px rgba(0,0,0,0.35);
        ">${label}</div>\`,
        iconSize:[28,28],iconAnchor:[14,14],
    })
}).addTo(map).bindPopup('<b>Stop ${label}: ${custName}</b><br/>${addr}${dist ? '<br/><i>' + dist + '</i>' : ''}');`;
        }).join('\n');

    // Route polyline between stops in order (only stops with coords)
    const routeCoords = items
        .filter(i => i.delivery_latitude && i.delivery_longitude)
        .map(i => [Number(i.delivery_latitude), Number(i.delivery_longitude)]);

    // Build route polyline + midpoint km labels between consecutive stops
    const routePolylineJs = routeCoords.length > 1 ? `
var routeCoords = [${routeCoords.map(c => `[${c[0]},${c[1]}]`).join(',')}];
L.polyline(routeCoords, {
    color: '#a855f7',
    weight: 3,
    opacity: 0.75,
    dashArray: '8,5',
}).addTo(map);` : '';

    // Midpoint km labels between consecutive stops
    const filteredItems = items.filter(i => i.delivery_latitude && i.delivery_longitude);
    const legLabelsJs = filteredItems.length > 1
        ? filteredItems.slice(1).map((item, idx) => {
            if (item.distance_from_prev_km == null) return '';
            const prev = filteredItems[idx];
            const midLat = (Number(prev.delivery_latitude)  + Number(item.delivery_latitude))  / 2;
            const midLng = (Number(prev.delivery_longitude) + Number(item.delivery_longitude)) / 2;
            const km = Number(item.distance_from_prev_km).toFixed(1);
            return `
L.marker([${midLat}, ${midLng}], {
    icon: L.divIcon({
        className: '',
        html: \`<div style="
            background: rgba(15,14,26,0.85);
            border: 1px solid rgba(168,85,247,0.5);
            color: #a855f7;
            font-size: 9px;
            font-weight: 700;
            padding: 2px 5px;
            border-radius: 6px;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        ">${km} km</div>\`,
        iconAnchor: [20, 10],
    })
}).addTo(map);`;
        }).join('\n')
        : '';

    // Driver marker
    const driverMarkerJs = (driverPos?.lat && driverPos?.lng) ? `
L.marker([${driverPos.lat}, ${driverPos.lng}], {
    icon: L.divIcon({
        className: '',
        html: \`<div style="
            width:36px;height:36px;border-radius:50%;
            background:#a855f7;border:3px solid white;
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 0 0 4px rgba(168,85,247,0.3),0 2px 8px rgba(0,0,0,0.4);
        ">
            <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
        </div>\`,
        iconSize:[36,36],iconAnchor:[18,18],
    })
}).addTo(map).bindPopup('<b>Your position</b>');` : '';

    // Ping trail
    const pingPoints = showTrail && pings.length > 0
        ? pings.filter(p => p.lat && p.lng).map(p => `[${p.lat},${p.lng}]`).join(',')
        : '';
    const trailJs = pingPoints ? `
var trailCoords = [${pingPoints}];
L.polyline(trailCoords, { color:'#a855f7', weight:2, opacity:0.45, dashArray:'4,4' }).addTo(map);
trailCoords.forEach(function(c,i){
    if(i % 5 === 0){
        L.circleMarker(c, {radius:3,color:'#a855f7',fillColor:'#a855f7',fillOpacity:0.8,weight:1}).addTo(map);
    }
});` : '';

    const fitBoundsJs = allPoints.length > 1
        ? `map.fitBounds([${allPoints.map(p => `[${p[0]},${p[1]}]`).join(',')}], {padding:[40,40]});`
        : `map.setView([${centerLat},${centerLng}], 13);`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  html,body,#map { width:100%;height:100%;background:#1a1a2e; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl:true, attributionControl:false });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(map);
${routePolylineJs}
${legLabelsJs}
${stopMarkersJs}
${driverMarkerJs}
${trailJs}
${fitBoundsJs}
<\/script>
</body>
</html>`;
}

// ── skip modal ────────────────────────────────────────────────────────────────
function SkipModal({ item, manifestId, onClose, onSuccess }) {
    const [reason,     setReason]     = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);

    const PRESETS = [
        'Customer not home — will retry later',
        'Road blocked — coming back',
        'Wrong address — need to confirm',
        'Customer asked to defer',
    ];

    const handleSkip = async () => {
        if (!reason.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            await deliveryAPI.skipStop(manifestId, item.id, reason.trim());
            onSuccess();
        } catch (e) {
            setError(e?.response?.data?.message ?? 'Failed to skip stop.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 70,
                background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: D.card,
                    width: '100%', maxWidth: 480,
                    borderRadius: '20px 20px 0 0',
                    padding: '20px 20px 32px',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: D.text }}>Skip stop</div>
                        <div style={{ fontSize: '0.72rem', color: D.textDim, marginTop: 2 }}>
                            Stop will move to end of route
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.textDim, cursor: 'pointer', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {PRESETS.map(p => (
                        <button
                            key={p}
                            onClick={() => setReason(p)}
                            style={{
                                textAlign: 'left', padding: '9px 12px',
                                borderRadius: D.radiusSm,
                                border: `1px solid ${reason === p ? D.purple : D.purpleBorder}`,
                                background: reason === p ? D.purpleDim : 'transparent',
                                color: reason === p ? D.purple : D.textMid,
                                fontSize: '0.8rem', fontWeight: reason === p ? 600 : 400,
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            {p}
                        </button>
                    ))}
                </div>

                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Or type a custom reason…"
                    rows={2}
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        background: '#0f0e1a', border: `1px solid ${D.purpleBorder}`,
                        borderRadius: D.radiusSm, color: D.text,
                        fontSize: '0.85rem', padding: '9px 11px', outline: 'none',
                        resize: 'none', fontFamily: 'inherit', marginBottom: 12,
                    }}
                />

                {error && (
                    <div style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: 10 }}>{error}</div>
                )}

                <DeliveryBtn
                    variant="danger"
                    size="md"
                    onClick={handleSkip}
                    disabled={!reason.trim() || submitting}
                    style={{ width: '100%', justifyContent: 'center' }}
                >
                    {submitting
                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Skipping…</>
                        : <><SkipForward size={14} /> Skip — come back later</>
                    }
                </DeliveryBtn>
            </div>
        </div>
    );
}

// ── tab: map ──────────────────────────────────────────────────────────────────
// useMemo on the html string so the iframe only reloads when data actually changes.
function MapTab({ items, driverPos, pings }) {
    // Stable cache keys — only rebuild html when coords/status actually change
    const itemsKey = items
        .map(i => `${i.id}:${i.delivery_latitude}:${i.delivery_longitude}:${i.status}:${i.distance_from_prev_km}`)
        .join('|');
    const driverKey = driverPos ? `${driverPos.lat},${driverPos.lng}` : 'none';
    const pingsKey  = pings.length;

    const html = useMemo(
        () => buildLeafletHtml({ items, driverPos, pings, showTrail: true }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [itemsKey, driverKey, pingsKey],
    );

    const hasCoords = items.some(i => i.delivery_latitude && i.delivery_longitude);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* legend */}
            <div style={{
                display: 'flex', gap: 12, padding: '8px 16px',
                borderBottom: `1px solid ${D.purpleBorder}`,
                flexWrap: 'wrap', flexShrink: 0, alignItems: 'center',
            }}>
                {[
                    { color: D.purple,  label: 'You' },
                    { color: '#14b8a6', label: 'Delivered' },
                    { color: '#64748b', label: 'Pending' },
                    { color: '#ef4444', label: 'Failed' },
                ].map(({ color, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: D.textDim }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                        {label}
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: D.textDim }}>
                    <div style={{ width: 16, height: 2, background: D.purple, borderRadius: 1, borderTop: '1px dashed rgba(168,85,247,0.6)' }} />
                    Route
                </div>
                {pings.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: D.textDim }}>
                        <div style={{ width: 16, height: 2, background: 'rgba(168,85,247,0.4)', borderRadius: 1 }} />
                        Trail
                    </div>
                )}
            </div>

            {!hasCoords ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: D.textDim }}>
                    <AlertTriangle size={20} color="#f59e0b" />
                    <span style={{ fontSize: '0.82rem' }}>No coordinates set for any stop</span>
                </div>
            ) : (
                <iframe
                    srcDoc={html}
                    title="route-map"
                    style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }}
                    sandbox="allow-scripts"
                />
            )}
        </div>
    );
}

// ── tab: stops list ───────────────────────────────────────────────────────────
function StopsTab({ items, manifestId, manifest, onRouteOptimized, onRefresh, onHover }) {
    const [reordering,   setReordering]   = useState(false);
    const [optimizing,   setOptimizing]   = useState(false);
    const [optimizeError, setOptimizeError] = useState(null);
    const [skipTarget,   setSkipTarget]   = useState(null);

    const pending  = items.filter(i => !['delivered', 'failed', 'returned'].includes(i.status));
    const terminal = items.filter(i =>  ['delivered', 'failed', 'returned'].includes(i.status));

    const canOptimize = ['dispatched', 'in_progress'].includes(manifest?.status) && pending.length > 1;

    const handleOptimize = async () => {
        setOptimizing(true);
        setOptimizeError(null);
        try {
            // Try to get current GPS position to pass as start
            const coords = await new Promise((resolve) => {
                if (!navigator.geolocation) return resolve(null);
                navigator.geolocation.getCurrentPosition(
                    pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    ()  => resolve(null),
                    { enableHighAccuracy: true, timeout: 5000 },
                );
            });

            const res = await deliveryAPI.driverOptimizeRoute(manifestId, coords);

            // Update route in-place from API response — no full refetch needed
            // res.items is the new ordered list in the same shape as getDriverRoute
            if (res?.items) {
                onRouteOptimized(res.items);
            } else {
                onRefresh();
            }
        } catch (e) {
            setOptimizeError(e?.response?.data?.message ?? 'Optimization failed. Try again.');
        } finally {
            setOptimizing(false);
        }
    };

    const moveStop = async (item, direction) => {
        const idx      = pending.findIndex(i => i.id === item.id);
        const newPending = [...pending];
        const swapIdx  = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= newPending.length) return;

        [newPending[idx], newPending[swapIdx]] = [newPending[swapIdx], newPending[idx]];

        const orderedIds = [...newPending, ...terminal].map(i => i.id);
        setReordering(true);
        try {
            await deliveryAPI.reorderStops(manifestId, orderedIds);
            onRefresh();
        } catch {
            // silent — UI snaps back on refresh
        } finally {
            setReordering(false);
        }
    };

    const iconFor = (status) => {
        if (status === 'delivered') return <CheckCircle size={14} color="#14b8a6" />;
        if (status === 'failed')    return <XCircle     size={14} color="#ef4444" />;
        if (status === 'returned')  return <XCircle     size={14} color="#f59e0b" />;
        return <Package size={14} color="#64748b" />;
    };

    return (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {/* optimize banner */}
            {canOptimize && (
                <div style={{
                    margin: '10px 16px 0',
                    padding: '10px 14px',
                    borderRadius: D.radiusSm,
                    background: 'rgba(168,85,247,0.07)',
                    border: `1px solid ${D.purpleBorder}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    flexShrink: 0,
                }}>
                    <Sparkles size={15} color={D.purple} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.78rem', color: D.textMid, lineHeight: 1.4 }}>
                        Optimise the remaining {pending.length} stops by shortest distance from your current position.
                    </span>
                    <button
                        onClick={() => { onHover?.(); handleOptimize(); }}
                        disabled={optimizing}
                        style={{
                            flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '7px 12px', borderRadius: D.radiusSm, border: 'none',
                            background: optimizing ? D.purpleDim : `linear-gradient(135deg, ${D.purple}, #7c3aed)`,
                            color: 'white', fontSize: '0.78rem', fontWeight: 700,
                            cursor: optimizing ? 'not-allowed' : 'pointer',
                            opacity: optimizing ? 0.7 : 1,
                            transition: 'all 0.2s',
                        }}
                    >
                        {optimizing
                            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Optimising…</>
                            : <><Sparkles size={13} /> Optimise</>
                        }
                    </button>
                </div>
            )}

            {/* optimize error */}
            {optimizeError && (
                <div style={{
                    margin: '8px 16px 0',
                    padding: '8px 12px', borderRadius: D.radiusSm,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444', fontSize: '0.78rem',
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                }}>
                    <AlertTriangle size={13} /> {optimizeError}
                </div>
            )}

            {/* stop list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reordering && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: D.purple, padding: '4px 0' }}>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving new order…
                    </div>
                )}

                {/* pending stops */}
                {pending.map((item, idx) => (
                    <div key={item.id}>
                        {/* leg distance badge between stops */}
                        {idx > 0 && item.distance_from_prev_km != null && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '3px 0 3px 12px',
                            }}>
                                <div style={{ width: 1, height: 14, background: D.purpleBorder, flexShrink: 0 }} />
                                <span style={{
                                    fontSize: '0.68rem', color: D.purple, fontWeight: 600,
                                    background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: 20, padding: '1px 7px',
                                }}>
                                    {Number(item.distance_from_prev_km).toFixed(1)} km
                                </span>
                            </div>
                        )}

                        <div
                            style={{
                                background: D.card,
                                border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radius,
                                padding: '12px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                transition: 'border-color 0.15s',
                            }}
                        >
                            {/* stop number */}
                            <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem', fontWeight: 700, color: D.purple,
                            }}>
                                {idx + 1}
                            </div>

                            {/* info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.83rem', fontWeight: 600, color: D.text, marginBottom: 2 }}>
                                    {item.customer_name ?? '—'}
                                </div>
                                <div style={{
                                    fontSize: '0.7rem', color: D.textDim,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    <MapPin size={9} />
                                    {item.shipping_address ?? '—'}
                                </div>
                                {item.customer_phone && (
                                    <a
                                        href={`tel:${item.customer_phone}`}
                                        style={{ fontSize: '0.7rem', color: D.purple, display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, textDecoration: 'none' }}
                                    >
                                        <Phone size={9} /> {item.customer_phone}
                                    </a>
                                )}
                                {item.estimated_arrival && (
                                    <div style={{ fontSize: '0.68rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                                        <Clock size={9} /> ETA {fmtTime(item.estimated_arrival)}
                                    </div>
                                )}
                            </div>

                            {/* actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                                {/* up/down */}
                                <div style={{ display: 'flex', gap: 2 }}>
                                    <button
                                        onClick={() => { onHover?.(); moveStop(item, 'up'); }}
                                        disabled={idx === 0 || reordering}
                                        style={{
                                            background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                                            borderRadius: D.radiusSm, padding: '4px 6px',
                                            color: idx === 0 ? D.purpleBorder : D.purple,
                                            cursor: idx === 0 ? 'default' : 'pointer',
                                            display: 'flex', alignItems: 'center',
                                            opacity: idx === 0 ? 0.4 : 1,
                                        }}
                                    >
                                        <ChevronUp size={13} />
                                    </button>
                                    <button
                                        onClick={() => { onHover?.(); moveStop(item, 'down'); }}
                                        disabled={idx === pending.length - 1 || reordering}
                                        style={{
                                            background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                                            borderRadius: D.radiusSm, padding: '4px 6px',
                                            color: idx === pending.length - 1 ? D.purpleBorder : D.purple,
                                            cursor: idx === pending.length - 1 ? 'default' : 'pointer',
                                            display: 'flex', alignItems: 'center',
                                            opacity: idx === pending.length - 1 ? 0.4 : 1,
                                        }}
                                    >
                                        <ChevronDown size={13} />
                                    </button>
                                </div>
                                {/* skip */}
                                <button
                                    onClick={() => { onHover?.(); setSkipTarget(item); }}
                                    style={{
                                        background: 'rgba(245,158,11,0.08)',
                                        border: '1px solid rgba(245,158,11,0.25)',
                                        borderRadius: D.radiusSm, padding: '4px 7px',
                                        color: '#f59e0b', fontSize: '0.68rem', fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <SkipForward size={11} /> Skip
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {pending.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: D.textDim, fontSize: '0.82rem' }}>
                        All stops completed
                    </div>
                )}

                {/* terminal stops */}
                {terminal.length > 0 && (
                    <>
                        <div style={{
                            fontSize: '0.68rem', fontWeight: 700, color: D.textDim,
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            padding: '6px 0 2px',
                        }}>
                            Completed
                        </div>
                        {terminal.map(item => (
                            <div
                                key={item.id}
                                style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radius,
                                    padding: '10px 14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    opacity: 0.55,
                                }}
                            >
                                {iconFor(item.status)}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: D.text }}>{item.customer_name ?? '—'}</div>
                                    <div style={{ fontSize: '0.68rem', color: D.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.shipping_address ?? '—'}
                                    </div>
                                </div>
                                <StatusBadge status={item.status} />
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* skip modal */}
            {skipTarget && (
                <SkipModal
                    item={skipTarget}
                    manifestId={manifestId}
                    onClose={() => setSkipTarget(null)}
                    onSuccess={() => { setSkipTarget(null); onRefresh(); }}
                />
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── tab: ping trail ───────────────────────────────────────────────────────────
function TrailTab({ pings, driverPos, items, loading }) {
    const itemsKey = items.map(i => `${i.id}:${i.delivery_latitude}:${i.delivery_longitude}:${i.status}:${i.distance_from_prev_km}`).join('|');
    const driverKey = driverPos ? `${driverPos.lat},${driverPos.lng}` : 'none';
    const pingsKey  = pings.length;

    const html = useMemo(
        () => buildLeafletHtml({ items, driverPos, pings, showTrail: true }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [itemsKey, driverKey, pingsKey],
    );

    const recent = [...pings].reverse().slice(0, 30);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <iframe
                srcDoc={html}
                title="trail-map"
                style={{ height: 220, border: 'none', width: '100%', flexShrink: 0 }}
                sandbox="allow-scripts"
            />

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : recent.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: D.textDim, fontSize: '0.8rem' }}>
                        No pings recorded yet
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                            Last {recent.length} pings
                        </div>
                        {recent.map((ping, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 10px', borderRadius: D.radiusSm,
                                    background: i === 0 ? D.purpleDim : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${i === 0 ? D.purpleBorder : 'rgba(255,255,255,0.04)'}`,
                                }}
                            >
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: i === 0 ? D.purple : '#334155',
                                    flexShrink: 0,
                                    boxShadow: i === 0 ? `0 0 6px ${D.purple}` : 'none',
                                }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.72rem', color: D.text, fontFamily: 'monospace' }}>
                                        {Number(ping.lat).toFixed(5)}, {Number(ping.lng).toFixed(5)}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: D.textDim, marginTop: 1 }}>
                                        {fmtTime(ping.time)}
                                    </div>
                                </div>
                                {ping.speed != null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', color: D.textMid, flexShrink: 0 }}>
                                        <Zap size={10} color={D.purple} />
                                        {fmtSpeed(ping.speed)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── main component ────────────────────────────────────────────────────────────
/**
 * DriverRouteSheet
 *
 * Props:
 *   manifest         — the manifest object { id, manifest_number, status }
 *   onClose          — called when sheet is dismissed
 *   onHover          — optional audio.playHover callback
 *   onManifestUpdate — optional: called with new items[] after optimize so parent
 *                      can update its own stop list without a full refetch
 */
export default function DriverRouteSheet({ manifest, onClose, onHover, onManifestUpdate }) {
    const [tab,          setTab]          = useState('map');
    const [routeData,    setRouteData]    = useState(null);
    const [pings,        setPings]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [pingsLoading, setPingsLoading] = useState(true);
    const [error,        setError]        = useState(null);
    const [visible,      setVisible]      = useState(false);

    // animate in
    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 280);
    };

    const fetchRoute = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await deliveryAPI.getDriverRoute(manifest.id);
            setRouteData(res);
        } catch {
            setError('Failed to load route.');
        } finally {
            setLoading(false);
        }
    }, [manifest.id]);

    const fetchPings = useCallback(async () => {
        setPingsLoading(true);
        try {
            const res = await deliveryAPI.getMyPings(manifest.id);
            setPings(res?.data ?? []);
        } catch {
            setPings([]);
        } finally {
            setPingsLoading(false);
        }
    }, [manifest.id]);

    useEffect(() => {
        fetchRoute();
        fetchPings();
    }, [fetchRoute, fetchPings]);

    // auto-refresh pings every 30s when in_progress
    useEffect(() => {
        if (manifest.status !== 'in_progress') return;
        const interval = setInterval(fetchPings, 30000);
        return () => clearInterval(interval);
    }, [manifest.status, fetchPings]);

    const items     = routeData?.items ?? [];
    const driverPos = routeData?.driver_position ?? null;

    // Called by StopsTab after a successful optimize — updates local route state
    // in-place and also notifies parent (DetailPage) to update its own items list.
    const handleRouteOptimized = useCallback((newItems) => {
        setRouteData(prev => prev ? { ...prev, items: newItems } : prev);
        onManifestUpdate?.(newItems);
    }, [onManifestUpdate]);

    return (
        <>
            {/* backdrop */}
            <div
                onClick={handleClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: `rgba(0,0,0,${visible ? 0.55 : 0})`,
                    transition: 'background 0.28s ease',
                    backdropFilter: 'blur(2px)',
                }}
            />

            {/* sheet */}
            <div style={{
                position:      'fixed',
                bottom: 0, left: 0, right: 0,
                zIndex:        61,
                height:        '92vh',
                maxWidth:      640,
                margin:        '0 auto',
                background:    D.bg ?? '#0f0e1a',
                borderRadius:  '20px 20px 0 0',
                boxShadow:     '0 -8px 48px rgba(0,0,0,0.45)',
                display:       'flex',
                flexDirection: 'column',
                transform:     visible ? 'translateY(0)' : 'translateY(100%)',
                transition:    'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
                overflow:      'hidden',
            }}>
                {/* drag handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                </div>

                {/* header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 16px 10px',
                    borderBottom: `1px solid ${D.purpleBorder}`,
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: D.text }}>
                            Route — {manifest.manifest_number}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: D.textDim, marginTop: 2 }}>
                            {items.length} stops
                            {driverPos && (
                                <span style={{ color: D.purple, marginLeft: 8 }}>● Live position</span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={() => { onHover?.(); fetchRoute(); fetchPings(); }}
                            style={{
                                background: D.purpleDim, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, padding: '6px 8px',
                                color: D.purple, cursor: 'pointer',
                                display: 'flex', alignItems: 'center',
                            }}
                        >
                            <RefreshCw size={13} />
                        </button>
                        <button
                            onClick={handleClose}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, padding: '6px 8px',
                                color: D.textDim, cursor: 'pointer',
                                display: 'flex', alignItems: 'center',
                            }}
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* tabs */}
                <div style={{
                    display: 'flex', gap: 0,
                    borderBottom: `1px solid ${D.purpleBorder}`,
                    flexShrink: 0,
                }}>
                    {TABS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            onClick={() => { onHover?.(); setTab(key); }}
                            style={{
                                flex: 1, padding: '11px 8px',
                                background: tab === key ? D.purpleDim : 'transparent',
                                border: 'none',
                                borderBottom: `2px solid ${tab === key ? D.purple : 'transparent'}`,
                                color: tab === key ? D.purple : D.textDim,
                                fontSize: '0.78rem', fontWeight: tab === key ? 700 : 500,
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                transition: 'all 0.15s',
                            }}
                        >
                            <Icon size={13} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* body */}
                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: D.textMid }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading route…</span>
                    </div>
                ) : error ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#ef4444', fontSize: '0.85rem' }}>
                        <AlertTriangle size={20} />
                        {error}
                        <DeliveryBtn variant="ghost" size="sm" onClick={() => { fetchRoute(); fetchPings(); }} onHover={onHover}>
                            <RefreshCw size={12} /> Retry
                        </DeliveryBtn>
                    </div>
                ) : (
                    <>
                        {tab === 'map'   && <MapTab   items={items} driverPos={driverPos} pings={pings} />}
                        {tab === 'stops' && (
                            <StopsTab
                                items={items}
                                manifestId={manifest.id}
                                manifest={manifest}
                                onRouteOptimized={handleRouteOptimized}
                                onRefresh={() => { fetchRoute(); fetchPings(); }}
                                onHover={onHover}
                            />
                        )}
                        {tab === 'trail' && <TrailTab items={items} driverPos={driverPos} pings={pings} loading={pingsLoading} />}
                    </>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}