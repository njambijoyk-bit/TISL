import { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Navigation, Clock, MapPin, Zap, Loader2,
    CheckCircle, XCircle, AlertTriangle, Package,
    RefreshCw, Target,
} from 'lucide-react';
import deliveryAPI from '../../../api/delivery'; 

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
}
function fmtDateTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Derive one of 5 states (customer mode only — admin always shows full map)
// ─────────────────────────────────────────────────────────────────────────────
function deriveState(tracking, shipment) {
    const yourStatus = tracking?.your_status ?? shipment?.your_status;
    if (yourStatus === 'delivered') return 'delivered';
    if (yourStatus === 'failed')    return 'failed';

    const yourStop    = tracking?.your_stop_number    ?? shipment?.your_stop_number;
    const currentStop = tracking?.current_stop_number ?? null;

    if (yourStop != null && currentStop != null) {
        const stopsAway = yourStop - currentStop;
        if (stopsAway <= 0)  return 'approaching';
        if (stopsAway === 1) return 'next_up';
        return 'en_route';
    }
    return 'en_route';
}

// ─────────────────────────────────────────────────────────────────────────────
// Status colour map (shared between map markers and legend)
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
    delivered:        '#14b8a6',
    failed:           '#ef4444',
    returned:         '#f59e0b',
    out_for_delivery: '#a855f7',
    pending:          '#64748b',
};

// ─────────────────────────────────────────────────────────────────────────────
// Map builder — two modes:
//   Admin  : stops[] with full manifest items (all stops, colours, route line)
//   Customer: deliveryCoords + stopNumber (single highlighted stop)
// ─────────────────────────────────────────────────────────────────────────────
function buildMapHtml({ pings, stops = [], deliveryCoords, stopNumber }) {
    const trail   = [...pings].reverse();  // oldest → newest
    const current = pings[0] ?? null;      // latest ping

    // Collect all points for fitBounds
    const allPoints = [];
    if (current) allPoints.push([current.lat, current.lng]);
    stops.forEach(s => { if (s.lat && s.lng) allPoints.push([s.lat, s.lng]); });
    if (deliveryCoords?.lat) allPoints.push([deliveryCoords.lat, deliveryCoords.lng]);

    const centerLat = allPoints.length > 0
        ? allPoints.reduce((sum, p) => sum + p[0], 0) / allPoints.length
        : (current?.lat ?? -4.0435);
    const centerLng = allPoints.length > 0
        ? allPoints.reduce((sum, p) => sum + p[1], 0) / allPoints.length
        : (current?.lng ?? 39.6682);

    // ── GPS trail (purple, driver path) ──────────────────────────────────────
    const trailJs = trail.length > 1
        ? `L.polyline([${trail.map(p => `[${p.lat},${p.lng}]`).join(',')}],{color:'#a855f7',weight:3,opacity:0.65,dashArray:'6,4'}).addTo(map);`
        : '';

    // ── Driver truck marker ───────────────────────────────────────────────────
    const truckJs = current ? `
L.marker([${current.lat},${current.lng}],{icon:L.divIcon({className:'',html:\`
<div style="position:relative;display:flex;align-items:center;justify-content:center;">
  <div style="position:absolute;width:44px;height:44px;background:rgba(168,85,247,0.25);border-radius:50%;animation:pulse 2s infinite;"></div>
  <div style="width:34px;height:34px;background:linear-gradient(135deg,#a855f7,#7c3aed);border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(168,85,247,0.5);font-size:17px;z-index:10;">🚚</div>
</div>\`,iconSize:[44,44],iconAnchor:[22,22]})})
.addTo(map).bindPopup('<b>Driver</b><br/>Speed: ${current.speed ?? 0} km/h<br/>${current.time ? 'Last ping: ' + new Date('${current.time}').toLocaleTimeString() : ''}');`
    : '';

    // ── ADMIN MODE: all stops connected in sort_order with coloured markers ──
    const isAdminMode = stops.length > 0;

    // Route polyline between stops in sort_order (solid line between stop centres)
    const stopsWithCoords = stops.filter(s => s.lat && s.lng);
    const routeLineJs = stopsWithCoords.length > 1
        ? `L.polyline([${stopsWithCoords.map(s => `[${s.lat},${s.lng}]`).join(',')}],{color:'#6366f1',weight:2.5,opacity:0.6}).addTo(map);`
        : '';

    // Stop number markers coloured by status
    const stopMarkersJs = stopsWithCoords.map((s) => {
        const color = STATUS_COLOR[s.status] ?? '#64748b';
        const label = s.sort_order ?? '?';
        const name  = (s.customer_name ?? 'Stop').replace(/'/g, "\\'");
        const addr  = (s.shipping_address ?? '').replace(/'/g, "\\'");
        const statusLabel = (s.status ?? 'pending').replace(/_/g, ' ');
        return `
L.marker([${s.lat},${s.lng}],{icon:L.divIcon({className:'',html:\`
<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid white;
  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;
  box-shadow:0 2px 8px rgba(0,0,0,0.35);">${label}</div>\`,
iconSize:[28,28],iconAnchor:[14,14]})})
.addTo(map).bindPopup('<b>Stop ${label}: ${name}</b><br/>${addr}<br/><i style="color:${color}">${statusLabel}</i>');`;
    }).join('\n');

    // Dashed line from driver to next pending stop
    const nextPending = stopsWithCoords.find(s => !['delivered','failed','returned'].includes(s.status));
    const driverToNextJs = (current && nextPending)
        ? `L.polyline([[${current.lat},${current.lng}],[${nextPending.lat},${nextPending.lng}]],{color:'#a855f7',weight:2,opacity:0.5,dashArray:'5,5'}).addTo(map);`
        : '';

    // ── CUSTOMER MODE: single delivery address pin ────────────────────────────
    const stopLabel = stopNumber ? `Stop #${stopNumber}` : 'Your Stop';
    const customerPinJs = (!isAdminMode && deliveryCoords?.lat && deliveryCoords?.lng) ? `
${current ? `L.polyline([[${current.lat},${current.lng}],[${deliveryCoords.lat},${deliveryCoords.lng}]],{color:'#14b8a6',weight:2,opacity:0.5,dashArray:'6,5'}).addTo(map);` : ''}
L.marker([${deliveryCoords.lat},${deliveryCoords.lng}],{icon:L.divIcon({className:'',html:\`
<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
  <div style="position:absolute;width:52px;height:52px;background:rgba(20,184,166,0.18);border-radius:50%;top:-10px;left:-10px;animation:destPulse 2.5s infinite;"></div>
  <div style="width:36px;height:36px;background:linear-gradient(135deg,#14b8a6,#0d9488);border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(20,184,166,0.55);font-size:18px;z-index:10;">📍</div>
  <div style="margin-top:4px;background:rgba(13,148,136,0.9);color:white;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${stopLabel}</div>
</div>\`,iconSize:[36,48],iconAnchor:[18,48]})}
).addTo(map).bindPopup('<b>${stopLabel}</b><br/>Your delivery address');`
    : '';

    // ── fitBounds or setView ──────────────────────────────────────────────────
    const fitJs = allPoints.length > 1
        ? `map.fitBounds([${allPoints.map(p => `[${p[0]},${p[1]}]`).join(',')}],{padding:[50,50]});`
        : `map.setView([${centerLat},${centerLng}],${allPoints.length === 1 ? 15 : 13});`;

    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}html,body,#map{width:100%;height:100%;background:#1a1a2e;}
@keyframes pulse{0%{transform:scale(0.8);opacity:0.8;}100%{transform:scale(2.2);opacity:0;}}
@keyframes destPulse{0%{transform:scale(0.9);opacity:0.6;}50%{transform:scale(1.4);opacity:0.2;}100%{transform:scale(0.9);opacity:0.6;}}
</style></head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
${routeLineJs}
${trailJs}
${stopMarkersJs}
${driverToNextJs}
${truckJs}
${customerPinJs}
${fitJs}
<\/script></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// State cards (customer — no map)
// ─────────────────────────────────────────────────────────────────────────────
function DeliveredCard({ shipment, tracking }) {
    const notes = tracking?.delivery_notes   ?? shipment?.delivery_notes;
    const proof = tracking?.proof_of_delivery_url ?? shipment?.proof_of_delivery_url;
    const delAt = tracking?.delivered_at     ?? shipment?.delivered_at;
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(20,184,166,0.12)', border: '2px solid rgba(20,184,166,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 0 0 8px rgba(20,184,166,0.06)' }}>
                <CheckCircle size={32} color="#14b8a6" />
            </div>
            <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14b8a6', margin: '0 0 4px' }}>Order Delivered!</p>
            {delAt && <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 20px' }}>{fmtDateTime(delAt)}</p>}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, maxWidth: 400, width: '100%' }}>
                <MapPin size={13} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    Live tracking is unavailable — your order has already been delivered.
                </p>
            </div>
            {notes && (
                <div style={{ width: '100%', maxWidth: 400, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#a855f7', margin: '0 0 6px' }}>Delivery Notes</p>
                    <p style={{ fontSize: '0.82rem', color: '#e2e8f0', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>"{notes}"</p>
                </div>
            )}
            {proof && (
                <div style={{ width: '100%', maxWidth: 400 }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', margin: '0 0 8px' }}>Proof of Delivery</p>
                    <img src={proof} alt="Proof of delivery" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(168,85,247,0.2)', objectFit: 'cover', maxHeight: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                </div>
            )}
        </div>
    );
}

function FailedCard({ shipment, tracking }) {
    const reason = tracking?.failed_reason ?? shipment?.failed_reason;
    const pretty = reason ? reason.replace(/_/g, ' ') : null;
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 0 0 8px rgba(239,68,68,0.05)' }}>
                <XCircle size={32} color="#ef4444" />
            </div>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', margin: '0 0 4px' }}>Delivery Attempt Failed</p>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 20px', textAlign: 'center', maxWidth: 320 }}>Live tracking is unavailable for this delivery.</p>
            {pretty && (
                <div style={{ width: '100%', maxWidth: 400, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#ef4444', margin: '0 0 4px' }}>Reason</p>
                    <p style={{ fontSize: '0.85rem', color: '#fca5a5', margin: 0, textTransform: 'capitalize' }}>{pretty}</p>
                </div>
            )}
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', maxWidth: 400, width: '100%' }}>
                <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: '0.75rem', color: '#fbbf24', margin: 0, lineHeight: 1.5 }}>Please contact us to arrange re-delivery.</p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin map legend
// ─────────────────────────────────────────────────────────────────────────────
function AdminLegend({ stops }) {
    const counts = stops.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
    }, {});

    const items = [
        { color: '#a855f7', label: 'Driver' },
        { color: '#6366f1', label: 'Route order' },
        { color: '#a855f7', label: 'GPS trail', dashed: true },
        ...Object.entries(counts).map(([status, count]) => ({
            color: STATUS_COLOR[status] ?? '#64748b',
            label: `${status.replace(/_/g, ' ')} (${count})`,
        })),
    ];

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', padding: '7px 14px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
            {items.map(({ color, label, dashed }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#94a3b8' }}>
                    {dashed
                        ? <div style={{ width: 16, height: 2, borderTop: `2px dashed ${color}` }} />
                        : <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    }
                    <span style={{ textTransform: 'capitalize' }}>{label}</span>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live map view (customer states: en_route / next_up / approaching)
// ─────────────────────────────────────────────────────────────────────────────
function LiveMapView({ state, pings, tracking, shipment }) {
    const current    = pings[0] ?? null;
    const speedKmh   = current?.speed ?? 0;
    const lastPing   = current?.time  ?? null;

    const yourStop    = tracking?.your_stop_number    ?? shipment?.your_stop_number;
    const totalStops  = tracking?.total_stops         ?? null;
    const currentStop = tracking?.current_stop_number ?? null;
    const stopsAway   = (yourStop != null && currentStop != null) ? yourStop - currentStop : null;
    const eta         = tracking?.estimated_arrival   ?? null;

    const yourStopLat = shipment?.your_stop_lat ?? tracking?.route_preview?.find(s => s.is_yours)?.lat ?? null;
    const yourStopLng = shipment?.your_stop_lng ?? tracking?.route_preview?.find(s => s.is_yours)?.lng ?? null;
    const deliveryCoords = (yourStopLat && yourStopLng) ? { lat: yourStopLat, lng: yourStopLng } : null;

    const pingKey = `${pings.length}:${current?.lat}:${current?.lng}:${yourStopLat}:${yourStopLng}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const mapHtml = pingKey && buildMapHtml({ pings, deliveryCoords, stopNumber: yourStop });

    const bannerCfg = {
        approaching: { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.25)', icon: <Navigation size={16} color="#a855f7" />, title: 'Driver is heading to you now', sub: 'Your stop is next on the route' },
        next_up:     { color: '#14b8a6', bg: 'rgba(20,184,166,0.1)',  border: 'rgba(20,184,166,0.25)',  icon: <Target size={16} color="#14b8a6" />,    title: "You're next!", sub: 'Driver is 1 stop away from you' },
        en_route:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)',   icon: <Package size={16} color="#3b82f6" />,   title: stopsAway != null ? `${stopsAway} stop${stopsAway !== 1 ? 's' : ''} away` : 'Driver en route', sub: (yourStop != null && totalStops != null) ? `Your stop is #${yourStop} of ${totalStops} on this route` : 'Tracking your driver…' },
    }[state] ?? { color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', icon: <Navigation size={16} color="#a855f7" />, title: 'Driver en route', sub: '' };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: bannerCfg.bg, borderBottom: `1px solid ${bannerCfg.border}`, flexShrink: 0 }}>
                {bannerCfg.icon}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: bannerCfg.color, margin: 0 }}>{bannerCfg.title}</p>
                    {bannerCfg.sub && <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '1px 0 0' }}>{bannerCfg.sub}</p>}
                </div>
                {eta && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: `${bannerCfg.color}18`, border: `1px solid ${bannerCfg.border}`, borderRadius: 20, padding: '3px 9px', fontSize: '0.72rem', fontWeight: 700, color: bannerCfg.color }}>
                        <Clock size={10} /> ETA {fmtTime(eta)}
                    </div>
                )}
            </div>

            {/* map */}
            {(current || deliveryCoords) ? (
                <iframe srcDoc={mapHtml} title="driver-map" style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }} sandbox="allow-scripts" />
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#64748b' }}>
                    <MapPin size={32} color="#334155" />
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>No GPS data yet</p>
                    <p style={{ fontSize: '0.72rem', color: '#475569', margin: 0 }}>Driver may not have started the trip</p>
                </div>
            )}

            {/* stats strip */}
            {current && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    {[
                        { Icon: Zap,    label: 'Speed',      value: `${speedKmh} km/h`,                     color: '#a855f7' },
                        { Icon: MapPin, label: 'Stops Away', value: stopsAway != null ? stopsAway : '—',    color: '#14b8a6' },
                        { Icon: Clock,  label: 'Last Ping',  value: lastPing ? fmtTime(lastPing) : '—',     color: '#3b82f6' },
                    ].map(({ Icon, label, value, color }) => (
                        <div key={label} style={{ padding: '10px 14px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', marginBottom: 3 }}>
                                <Icon size={10} color={color} /> {label}
                            </div>
                            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{value}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin full-route map view
// ─────────────────────────────────────────────────────────────────────────────
function AdminMapView({ pings, manifestItems }) {
    const current   = pings[0] ?? null;
    const speedKmh  = current?.speed ?? 0;
    const lastPing  = current?.time  ?? null;

    // Build stops array in sort_order for the map
    const stops = [...manifestItems]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(item => ({
            lat:              item.delivery_latitude  ? Number(item.delivery_latitude)  : null,
            lng:              item.delivery_longitude ? Number(item.delivery_longitude) : null,
            sort_order:       item.sort_order,
            status:           item.status,
            customer_name:    item.order?.customer
                ? `${item.order.customer.first_name ?? ''} ${item.order.customer.last_name ?? ''}`.trim()
                : item.customer_name ?? null,
            shipping_address: item.order?.shipping_address ?? item.shipping_address ?? null,
        }));

    const stopsWithCoords = stops.filter(s => s.lat && s.lng);

    const pingKey = `${pings.length}:${current?.lat}:${current?.lng}:${stopsWithCoords.length}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const mapHtml = buildMapHtml({ pings, stops });

    const delivered = stops.filter(s => s.status === 'delivered').length;
    const failed    = stops.filter(s => s.status === 'failed').length;
    const pending   = stops.filter(s => !['delivered','failed','returned'].includes(s.status)).length;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* legend */}
            <AdminLegend stops={stops} />

            {/* progress strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 14px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#14b8a6', fontWeight: 600 }}>
                    <CheckCircle size={11} /> {delivered} delivered
                </div>
                {failed > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                        <XCircle size={11} /> {failed} failed
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#94a3b8' }}>
                    <Package size={11} /> {pending} pending
                </div>
                {current && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#a855f7', fontWeight: 600 }}>
                        <Zap size={10} /> {speedKmh} km/h · Last ping {fmtTime(lastPing)}
                    </div>
                )}
            </div>

            {/* map */}
            {(stopsWithCoords.length > 0 || current) ? (
                <iframe srcDoc={mapHtml} title="admin-route-map" style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }} sandbox="allow-scripts" />
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#64748b' }}>
                    <MapPin size={32} color="#334155" />
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>No stop coordinates set</p>
                    <p style={{ fontSize: '0.72rem', color: '#475569', margin: 0 }}>Set delivery locations in Route Planning first</p>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main modal
// Props:
//   Admin   → manifestId + manifest (no orderId, no shipment)
//   Customer → orderId + shipment (no manifestId, no stops needed)
// ─────────────────────────────────────────────────────────────────────────────
export default function DriverTrackingModal({
    isOpen, onClose,
    // admin
    manifestId,
    // customer
    orderId, shipment: shipmentProp,
    // shared
    manifest,
}) {
    const isAdminMode = !!manifestId && !orderId;

    const [pings,          setPings]          = useState([]);
    const [tracking,       setTracking]       = useState(null);
    const [manifestItems,  setManifestItems]  = useState([]);
    const [loading,        setLoading]        = useState(true);
    const [visible,        setVisible]        = useState(false);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (isOpen) requestAnimationFrame(() => setVisible(true));
    }, [isOpen]);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 220);
    };

    const fetchAll = useCallback(async () => {
        try {
            if (isAdminMode) {
                // Admin: fetch pings + full manifest items in parallel
                const [pingsRes, manifestRes] = await Promise.allSettled([
                    deliveryAPI.getManifestPings(manifestId),
                    deliveryAPI.getManifest(manifestId),
                ]);

                if (pingsRes.status === 'fulfilled') {
                    const payload = pingsRes.value?.data;
                    setPings(Array.isArray(payload) ? payload : (payload?.data ?? []));
                }
                if (manifestRes.status === 'fulfilled') {
                    const data = manifestRes.value?.data ?? manifestRes.value;
                    setManifestItems(data?.items ?? []);
                }
            } else {
                // Customer: fetch pings + tracking context in parallel
                const [pingsRes, trackingRes] = await Promise.allSettled([
                    deliveryAPI.getOrderPings(orderId),
                    deliveryAPI.getOrderTracking(orderId),
                ]);

                if (pingsRes.status === 'fulfilled') {
                    const payload = pingsRes.value?.data;
                    setPings(Array.isArray(payload) ? payload : (payload?.data ?? []));
                }
                if (trackingRes.status === 'fulfilled') {
                    setTracking(trackingRes.value?.data ?? trackingRes.value);
                }
            }
        } catch {
            // silent — UI degrades gracefully
        } finally {
            setLoading(false);
        }
    }, [isAdminMode, manifestId, orderId]);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        setPings([]);
        setTracking(null);
        setManifestItems([]);
        fetchAll();

        intervalRef.current = setInterval(fetchAll, 15000);
        return () => clearInterval(intervalRef.current);
    }, [isOpen, fetchAll]);

    // Stop polling once customer delivery is terminal
    useEffect(() => {
        if (!isAdminMode) {
            const state = deriveState(tracking, shipmentProp);
            if (state === 'delivered' || state === 'failed') clearInterval(intervalRef.current);
        }
    }, [tracking, shipmentProp, isAdminMode]);

    if (!isOpen) return null;

    const customerState = !isAdminMode ? deriveState(tracking, shipmentProp) : null;
    const driverName    = manifest?.driver_name ?? manifest?.driver?.name ?? shipmentProp?.driver_name ?? 'Our Driver';
    const title         = isAdminMode
        ? `Live Route — ${manifest?.manifest_number ?? `Manifest #${manifestId}`}`
        : customerState === 'delivered' ? 'Delivery Complete'
        : customerState === 'failed'    ? 'Delivery Failed'
        : 'Live Tracking';

    return (
        <div
            onClick={handleClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: `rgba(0,0,0,${visible ? 0.65 : 0})`,
                backdropFilter: 'blur(3px)',
                transition: 'background 0.22s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#0f0e1a',
                    width: '100%', maxWidth: isAdminMode ? 860 : 680,
                    height: '88vh', maxHeight: isAdminMode ? 800 : 720,
                    borderRadius: 20,
                    border: '1px solid rgba(168,85,247,0.2)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(16px)',
                    opacity:   visible ? 1 : 0,
                    transition: 'transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.22s ease',
                }}
            >
                {/* header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.12)', flexShrink: 0, background: 'rgba(168,85,247,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Navigation size={17} color="#a855f7" />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{title}</p>
                            <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '1px 0 0' }}>
                                {driverName}
                                {(isAdminMode || (customerState !== 'delivered' && customerState !== 'failed')) && (
                                    <span style={{ color: '#a855f7', marginLeft: 8 }}>● Live</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(isAdminMode || (customerState !== 'delivered' && customerState !== 'failed')) && (
                            <button onClick={fetchAll} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.08)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Refresh">
                                <RefreshCw size={13} />
                            </button>
                        )}
                        <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* body */}
                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#64748b' }}>
                        <Loader2 size={20} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading tracking…</span>
                    </div>
                ) : isAdminMode ? (
                    <AdminMapView pings={pings} manifestItems={manifestItems} />
                ) : customerState === 'delivered' ? (
                    <DeliveredCard shipment={shipmentProp} tracking={tracking} />
                ) : customerState === 'failed' ? (
                    <FailedCard shipment={shipmentProp} tracking={tracking} />
                ) : (
                    <LiveMapView state={customerState} pings={pings} tracking={tracking} shipment={shipmentProp} />
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}