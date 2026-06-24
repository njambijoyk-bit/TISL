import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    MapContainer, TileLayer, Marker, Popup, Polyline, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
    MapPin, GripVertical, Zap, Save, AlertTriangle,
    ChevronUp, ChevronDown, Navigation, Loader2,
    Search, X, MousePointer,
} from 'lucide-react';
import deliveryAPI from '../../../api/delivery';
import { D, DeliveryCard, DeliveryBtn } from './DeliveryShared';

// ── Fix Leaflet default icon paths ────────────────────────────────────────────
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

// ── Numbered marker icon ──────────────────────────────────────────────────────
function createNumberedIcon(number, color = D.purple) {
    return L.divIcon({
        className: 'delivery-numbered-marker',
        html: `<div style="
            width:28px;height:28px;border-radius:50%;
            background:${color};color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;font-weight:700;
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);
        ">${number}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
    });
}

// ── Auto-fit map bounds ───────────────────────────────────────────────────────
function MapBoundsFitter({ items, startLat, startLng }) {
    const map = useMap();
    useEffect(() => {
        const coords = [];
        if (startLat != null && startLng != null) coords.push([startLat, startLng]);
        items.forEach(i => {
            if (i.delivery_latitude && i.delivery_longitude)
                coords.push([i.delivery_latitude, i.delivery_longitude]);
        });
        if (coords.length > 1) {
            map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 16 });
        } else if (coords.length === 1) {
            map.setView(coords[0], 14);
        }
    }, [items, startLat, startLng, map]);
    return null;
}

// ── Map click handler ─────────────────────────────────────────────────────────
function MapClickHandler({ selectedItemId, onMapClick }) {
    const map = useMap();
    useEffect(() => {
        const handler = (e) => {
            if (selectedItemId) onMapClick(e.latlng.lat, e.latlng.lng);
        };
        map.on('click', handler);
        return () => map.off('click', handler);
    }, [map, selectedItemId, onMapClick]);
    return null;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0f0d1a',
    border: `1px solid ${D.purpleBorder}`,
    borderRadius: D.radiusSm,
    color: D.text,
    fontSize: '0.78rem',
    padding: '6px 9px',
    outline: 'none',
};

const labelStyle = {
    fontSize: '0.67rem', fontWeight: 600,
    color: D.textDim, textTransform: 'uppercase',
    letterSpacing: '0.06em', display: 'block', marginBottom: 3,
};

// ── Format datetime-local ─────────────────────────────────────────────────────
function fmtDateTimeLocal(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Nominatim geocoding ───────────────────────────────────────────────────────
async function geocodeAddress(query) {
    if (!query || query.length < 3) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    return data.map(r => ({
        display_name: r.display_name,
        short_name: r.display_name.split(',')[0].trim(),
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
    }));
}

// ── Place search ──────────────────────────────────────────────────────────────
function PlaceSearch({ onSelect, onHover, placeholder = 'Search address or place…' }) {
    const [query, setQuery]     = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen]       = useState(false);
    const timerRef              = useRef(null);
    const wrapRef               = useRef(null);

    useEffect(() => {
        clearTimeout(timerRef.current);
        if (query.length < 3) { setResults([]); setOpen(false); return; }
        timerRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await geocodeAddress(query);
                setResults(res);
                setOpen(res.length > 0);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 400);
        return () => clearTimeout(timerRef.current);
    }, [query]);

    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const clear = () => { setQuery(''); setResults([]); setOpen(false); };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
                <Search size={12} color={D.textDim} style={{
                    position: 'absolute', left: 8, top: '50%',
                    transform: 'translateY(-50%)', pointerEvents: 'none',
                }} />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { if (results.length) setOpen(true); }}
                    placeholder={placeholder}
                    style={{ ...inputStyle, paddingLeft: 26, paddingRight: 28 }}
                />
                {loading && (
                    <Loader2 size={12} color={D.purple} style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: 'translateY(-50%)',
                        animation: 'spin 1s linear infinite',
                    }} />
                )}
                {query && !loading && (
                    <button onClick={clear} style={{
                        position: 'absolute', right: 6, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        cursor: 'pointer', color: D.textDim,
                        display: 'flex', padding: 2,
                    }}>
                        <X size={12} />
                    </button>
                )}
            </div>

            {open && results.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0, right: 0,
                    zIndex: 9999,
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: D.radiusSm,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    maxHeight: 220,
                    overflowY: 'auto',
                }}>
                    {results.map((r, i) => (
                        <div
                            key={i}
                            onClick={() => {
                                onSelect(r.lat, r.lon, r.display_name);
                                setQuery(r.short_name);
                                setOpen(false);
                                onHover?.();
                            }}
                            onMouseEnter={onHover}
                            style={{
                                padding: '9px 12px',
                                cursor: 'pointer',
                                borderTop: i > 0 ? '1px solid #e5e7eb' : 'none',
                                transition: 'background 0.1s',
                                background: '#ffffff',
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseOut={e => e.currentTarget.style.background = '#ffffff'}
                        >
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827' }}>
                                {r.short_name}
                            </div>
                            <div style={{
                                fontSize: '0.68rem', color: '#6b7280',
                                marginTop: 2, lineHeight: 1.35,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                                {r.display_name}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Single stop row ───────────────────────────────────────────────────────────
function StopListItem({
    item, index, total,
    isDragging,
    onDragStart, onDragOver, onDrop,
    onMoveUp, onMoveDown,
    onLatChange, onLngChange, onEtaChange,
    onMapFocus, onPinOnMap, onSearchSelect,
    onHover,
}) {
    const hasLocation = !!(item.delivery_latitude && item.delivery_longitude);

    const [latInput, setLatInput] = useState(String(item.delivery_latitude ?? ''));
    const [lngInput, setLngInput] = useState(String(item.delivery_longitude ?? ''));

    useEffect(() => {
        setLatInput(item.delivery_latitude != null ? String(item.delivery_latitude) : '');
    }, [item.delivery_latitude]);

    useEffect(() => {
        setLngInput(item.delivery_longitude != null ? String(item.delivery_longitude) : '');
    }, [item.delivery_longitude]);

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            style={{
                background: isDragging ? `${D.purple}12` : D.card,
                border: `1px solid ${isDragging ? D.purple : D.purpleBorder}`,
                borderRadius: D.radius,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'grab',
                opacity: isDragging ? 0.65 : 1,
                transition: 'all 0.15s',
            }}
        >
            <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4, paddingTop: 2, flexShrink: 0,
            }}>
                <GripVertical size={14} color={D.textDim} />
                <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: hasLocation ? D.purple : '#ef4444',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.68rem', fontWeight: 700,
                }}>
                    {index + 1}
                </div>
                <button onClick={onMoveUp} disabled={index === 0} style={{
                    background: 'none', border: 'none', padding: 1,
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                    opacity: index === 0 ? 0.25 : 1,
                }}>
                    <ChevronUp size={12} color={D.textDim} />
                </button>
                <button onClick={onMoveDown} disabled={index === total - 1} style={{
                    background: 'none', border: 'none', padding: 1,
                    cursor: index === total - 1 ? 'not-allowed' : 'pointer',
                    opacity: index === total - 1 ? 0.25 : 1,
                }}>
                    <ChevronDown size={12} color={D.textDim} />
                </button>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: D.text }}>
                        {item.order_number}
                    </span>
                    <span style={{ fontSize: '0.71rem', color: D.textDim }}>
                        {item.customer_name}
                    </span>
                    {!hasLocation && (
                        <span style={{
                            fontSize: '0.63rem', fontWeight: 600, color: '#ef4444',
                            background: 'rgba(239,68,68,0.12)',
                            padding: '2px 6px', borderRadius: 4,
                        }}>
                            No location
                        </span>
                    )}
                </div>

                <div style={{
                    fontSize: '0.7rem', color: D.textDim,
                    marginBottom: 8, lineHeight: 1.4,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {item.shipping_address || 'No address on record'}
                </div>

                <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Search place</label>
                    <PlaceSearch
                        onSelect={(lat, lng, name) => {
                            setLatInput(String(lat));
                            setLngInput(String(lng));
                            onLatChange(lat);
                            onLngChange(lng);
                            onSearchSelect?.(lat, lng);
                        }}
                        onHover={onHover}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                        <label style={labelStyle}>Latitude</label>
                        <input
                            type="number"
                            step="0.0000001"
                            value={latInput}
                            onChange={e => setLatInput(e.target.value)}
                            onBlur={e => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v >= -90 && v <= 90) onLatChange(v);
                                else setLatInput(item.delivery_latitude != null ? String(item.delivery_latitude) : '');
                            }}
                            placeholder="-1.2921"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Longitude</label>
                        <input
                            type="number"
                            step="0.0000001"
                            value={lngInput}
                            onChange={e => setLngInput(e.target.value)}
                            onBlur={e => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v >= -180 && v <= 180) onLngChange(v);
                                else setLngInput(item.delivery_longitude != null ? String(item.delivery_longitude) : '');
                            }}
                            placeholder="36.8219"
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Est. arrival</label>
                    <input
                        type="datetime-local"
                        value={fmtDateTimeLocal(item.estimated_arrival)}
                        onChange={e => onEtaChange(e.target.value || null)}
                        style={inputStyle}
                    />
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {hasLocation && (
                        <button
                            onClick={onMapFocus}
                            onMouseEnter={onHover}
                            style={{
                                background: 'none', border: 'none',
                                cursor: 'pointer', color: D.purple,
                                fontSize: '0.71rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: 0,
                            }}
                        >
                            <Navigation size={11} /> Focus on map
                        </button>
                    )}
                    <button
                        onClick={onPinOnMap}
                        onMouseEnter={onHover}
                        style={{
                            background: 'none', border: 'none',
                            cursor: 'pointer', color: '#f59e0b',
                            fontSize: '0.71rem', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: 0,
                        }}
                    >
                        <MousePointer size={11} /> Pin on map
                    </button>
                </div>
            </div>
        </div>
    );
}

/// ── Main ──────────────────────────────────────────────────────────────────────
export default function RoutePlanner({
    manifestId,
    onSave,
    onBack,
    audio,
}) {
    const [items, setItems]           = useState([]);
    const [manifest, setManifest]     = useState(null);
    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [error, setError]           = useState(null);
    const [dragIndex, setDragIndex]   = useState(null);
    const [mapCenter, setMapCenter]   = useState([-1.2921, 36.8219]);
    const [selectedItemId, setSelectedItemId] = useState(null);
    const mapRef = useRef(null);

    // ── Load: fetch route plan; if empty, build from manifest items ───────────
    useEffect(() => {
        setLoading(true);
        setItems([]);
        setError(null);

        (async () => {
            try {
                // 1. Try to get existing route plan
                let routeData = null;
                try {
                    const res = await deliveryAPI.getRoutePlan(manifestId);
                    routeData = res.data ?? res;
                } catch (routeErr) {
                    // 404 or no route plan yet — that's fine, we'll build from manifest
                    if (routeErr.response?.status !== 404) {
                        console.warn('Route plan fetch failed:', routeErr);
                    }
                }

                // 2. If we have route items, use them
                if (routeData?.items?.length > 0) {
                    setManifest(routeData);
                    setItems(routeData.items);
                    if (routeData.start_latitude && routeData.start_longitude)
                        setMapCenter([routeData.start_latitude, routeData.start_longitude]);
                    setLoading(false);
                    return;
                }

                // 3. No route plan yet — fetch manifest and build items from delivery/manifest items
                const manifestRes = await deliveryAPI.getManifest(manifestId);
                const manifestData = manifestRes.data ?? manifestRes;
                setManifest(manifestData);

                const manifestItems = manifestData.items ?? [];
                if (manifestItems.length === 0) {
                    setError('This manifest has no orders. Add orders before planning the route.');
                    setLoading(false);
                    return;
                }

                // Build route items from manifest items, preserving any existing lat/lng if present
                const builtItems = manifestItems.map((it, idx) => ({
                    id: it.id,                          // manifest_item / delivery_item id
                    order_id: it.order_id,
                    order_number: it.order?.order_number ?? it.order_number ?? `Order ${it.order_id}`,
                    customer_name: it.order?.customer
                        ? `${it.order.customer.first_name ?? ''} ${it.order.customer.last_name ?? ''}`.trim()
                        : it.customer_contact?.name ?? '—',
                    shipping_address: it.order?.shipping_address ?? it.shipping_address ?? '',
                    delivery_latitude: it.delivery_latitude ?? it.order?.delivery_latitude ?? null,
                    delivery_longitude: it.delivery_longitude ?? it.order?.delivery_longitude ?? null,
                    estimated_arrival: it.estimated_arrival ?? null,
                    sort_order: idx + 1,
                    status: it.status ?? 'pending',
                }));

                setItems(builtItems);

                // Set map center from first item with coords, or manifest start, or default
                const firstWithLoc = builtItems.find(i => i.delivery_latitude && i.delivery_longitude);
                if (firstWithLoc) {
                    setMapCenter([firstWithLoc.delivery_latitude, firstWithLoc.delivery_longitude]);
                } else if (manifestData.start_latitude && manifestData.start_longitude) {
                    setMapCenter([manifestData.start_latitude, manifestData.start_longitude]);
                }

            } catch (e) {
                console.error('Failed to load route data:', e);
                setError('Failed to load route plan. Please try again.');
            } finally {
                setLoading(false);
            }
        })();
    }, [manifestId]);

    // ── Drag & drop ───────────────────────────────────────────────────────────
    const handleDragStart = (index) => setDragIndex(index);
    const handleDragOver  = (e) => e.preventDefault();
    const handleDrop = (dropIndex) => {
        if (dragIndex === null || dragIndex === dropIndex) return;
        const next = [...items];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(dropIndex, 0, moved);
        setItems(next.map((it, i) => ({ ...it, sort_order: i + 1 })));
        setDragIndex(null);
        audio.playHover();
    };

    const moveItem = (from, to) => {
        if (to < 0 || to >= items.length) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setItems(next.map((it, i) => ({ ...it, sort_order: i + 1 })));
        audio.playHover();
    };

    // ── Location updates ──────────────────────────────────────────────────────
    const updateLocation = useCallback((itemId, lat, lng) => {
        setItems(prev => prev.map(it =>
            it.id === itemId ? { ...it, delivery_latitude: lat, delivery_longitude: lng } : it
        ));
    }, []);

    const updateEta = (itemId, eta) =>
        setItems(prev => prev.map(it =>
            it.id === itemId ? { ...it, estimated_arrival: eta } : it
        ));

    // ── Map click: place selected stop ────────────────────────────────────────
    const handleMapClick = useCallback((lat, lng) => {
        if (!selectedItemId) return;
        updateLocation(selectedItemId, lat, lng);
        if (mapRef.current) mapRef.current.setView([lat, lng], mapRef.current.getZoom());
        setSelectedItemId(null);
    }, [selectedItemId, updateLocation]);

    // ── Focus map on item ─────────────────────────────────────────────────────
    const focusOnItem = (item) => {
        if (item.delivery_latitude && item.delivery_longitude && mapRef.current) {
            mapRef.current.setView([item.delivery_latitude, item.delivery_longitude], 16);
        }
    };

    // ── Optimize ──────────────────────────────────────────────────────────────
    const handleOptimize = async () => {
        setOptimizing(true);
        setError(null);
        try {
            const res = await deliveryAPI.optimizeRoute(manifestId);
            const data = res.data ?? res;
            if (data.items) { setItems(data.items); audio.playSuccess(); }
        } catch {
            setError('Route optimization failed.');
            audio.playError();
        } finally {
            setOptimizing(false);
        }
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        const missing = items.filter(i => !i.delivery_latitude || !i.delivery_longitude);
        if (missing.length > 0) {
            setError(`${missing.length} stop(s) missing location. Set coordinates for all stops before saving.`);
            audio.playError();
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await deliveryAPI.saveRoutePlan(manifestId, {
                items: items.map(i => ({
                    id: i.id,
                    sort_order: i.sort_order,
                    delivery_latitude: i.delivery_latitude,
                    delivery_longitude: i.delivery_longitude,
                    estimated_arrival: i.estimated_arrival,
                })),
            });
            audio.playSuccess();
            onSave();
        } catch {
            setError('Failed to save route plan.');
            audio.playError();
        } finally {
            setSaving(false);
        }
    };

    // ── Polyline ──────────────────────────────────────────────────────────────
    const polylinePositions = useMemo(() => {
        const pts = [];
        if (manifest?.start_latitude && manifest?.start_longitude)
            pts.push([manifest.start_latitude, manifest.start_longitude]);
        items.forEach(i => {
            if (i.delivery_latitude && i.delivery_longitude)
                pts.push([i.delivery_latitude, i.delivery_longitude]);
        });
        return pts;
    }, [items, manifest]);

    const unlocatedCount = items.filter(i => !i.delivery_latitude || !i.delivery_longitude).length;
    const selectedItem   = items.find(i => i.id === selectedItemId);

    if (loading) {
        return (
            <DeliveryCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
                    <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '0.85rem', color: D.textDim }}>Loading route plan…</span>
                </div>
            </DeliveryCard>
        );
    }

    return (
        <div>
            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: D.radiusSm, padding: '10px 14px', color: '#ef4444',
                    fontSize: '0.82rem', marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {unlocatedCount > 0 && !selectedItemId && (
                <div style={{
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: D.radiusSm, padding: '10px 14px', color: '#f59e0b',
                    fontSize: '0.82rem', marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <MapPin size={14} />
                    {unlocatedCount} stop{unlocatedCount !== 1 ? 's' : ''} missing location.
                    Use "Search place", enter coordinates, or click "Pin on map" next to each stop.
                </div>
            )}

            <div style={{ display: 'flex', gap: 16, height: '70vh', minHeight: 500 }}>

                <div style={{
                    flex: 1.6, position: 'relative',
                    borderRadius: D.radiusLg, overflow: 'hidden',
                    border: `1px solid ${D.purpleBorder}`,
                }}>
                    <MapContainer
                        center={mapCenter}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        ref={mapRef}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapBoundsFitter
                            items={items}
                            startLat={manifest?.start_latitude}
                            startLng={manifest?.start_longitude}
                        />
                        <MapClickHandler
                            selectedItemId={selectedItemId}
                            onMapClick={handleMapClick}
                        />

                        {manifest?.start_latitude && manifest?.start_longitude && (
                            <Marker
                                position={[manifest.start_latitude, manifest.start_longitude]}
                                icon={L.divIcon({
                                    className: 'delivery-start-marker',
                                    html: `<div style="
                                        width:20px;height:20px;border-radius:50%;
                                        background:#10b981;border:3px solid #fff;
                                        box-shadow:0 2px 6px rgba(0,0,0,0.3);
                                    "></div>`,
                                    iconSize: [20, 20],
                                    iconAnchor: [10, 10],
                                })}
                            >
                                <Popup>Start point</Popup>
                            </Marker>
                        )}

                        {items.map((item, idx) =>
                            item.delivery_latitude && item.delivery_longitude ? (
                                <Marker
                                    key={item.id}
                                    position={[item.delivery_latitude, item.delivery_longitude]}
                                    icon={createNumberedIcon(
                                        idx + 1,
                                        selectedItemId === item.id ? '#f59e0b' : D.purple
                                    )}
                                    draggable
                                    eventHandlers={{
                                        dragend: (e) => {
                                            const { lat, lng } = e.target.getLatLng();
                                            updateLocation(item.id, lat, lng);
                                        },
                                        click: () => {
                                            setSelectedItemId(item.id);
                                            audio.playHover();
                                        },
                                    }}
                                >
                                    <Popup>
                                        <div style={{ fontSize: '0.8rem' }}>
                                            <strong>Stop #{idx + 1}</strong><br />
                                            {item.order_number} · {item.customer_name}<br />
                                            <span style={{ color: '#888' }}>
                                                {item.delivery_latitude != null ? parseFloat(item.delivery_latitude).toFixed(5) : '—'},
                                                {item.delivery_longitude != null ? parseFloat(item.delivery_longitude).toFixed(5) : '—'}
                                            </span>
                                        </div>
                                    </Popup>
                                </Marker>
                            ) : null
                        )}

                        {polylinePositions.length > 1 && (
                            <Polyline
                                positions={polylinePositions}
                                pathOptions={{ color: D.purple, weight: 3, opacity: 0.7, dashArray: '8, 6' }}
                            />
                        )}
                    </MapContainer>

                    {selectedItemId && (
                        <div style={{
                            position: 'absolute', top: 12, left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 1000,
                            background: '#f59e0b',
                            color: '#000',
                            borderRadius: 24,
                            padding: '8px 16px',
                            fontSize: '0.8rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                            cursor: 'default',
                            whiteSpace: 'nowrap',
                        }}>
                            <MousePointer size={14} />
                            Click anywhere to pin stop #{items.findIndex(i => i.id === selectedItemId) + 1}
                            {selectedItem && ` — ${selectedItem.order_number}`}
                            <button
                                onClick={() => setSelectedItemId(null)}
                                style={{
                                    background: 'rgba(0,0,0,0.15)', border: 'none',
                                    borderRadius: '50%', width: 20, height: 20,
                                    cursor: 'pointer', color: '#000',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    padding: 0, marginLeft: 4,
                                }}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}
                </div>

                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    gap: 10, minWidth: 300, maxWidth: 420,
                }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <DeliveryBtn
                            variant="secondary" size="sm"
                            onClick={handleOptimize}
                            onHover={audio.playHover}
                            disabled={optimizing}
                        >
                            {optimizing
                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Optimizing…</>
                                : <><Zap size={13} /> Auto-optimize</>
                            }
                        </DeliveryBtn>
                        <DeliveryBtn
                            variant="primary" size="sm"
                            onClick={handleSave}
                            onHover={audio.playHover}
                            disabled={saving}
                        >
                            {saving
                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                : <><Save size={13} /> Save route</>
                            }
                        </DeliveryBtn>
                    </div>

                    <div style={{
                        flex: 1, overflowY: 'auto',
                        display: 'flex', flexDirection: 'column', gap: 8,
                        paddingRight: 2,
                    }}>
                        <div style={{
                            fontSize: '0.68rem', fontWeight: 700,
                            color: D.textDim, textTransform: 'uppercase',
                            letterSpacing: '0.07em', paddingBottom: 4,
                        }}>
                            {items.length} stop{items.length !== 1 ? 's' : ''}
                        </div>

                        {items.map((item, idx) => (
                            <StopListItem
                                key={item.id}
                                item={item}
                                index={idx}
                                total={items.length}
                                isDragging={dragIndex === idx}
                                onDragStart={() => handleDragStart(idx)}
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(idx)}
                                onMoveUp={() => moveItem(idx, idx - 1)}
                                onMoveDown={() => moveItem(idx, idx + 1)}
                                onLatChange={lat => updateLocation(item.id, lat, item.delivery_longitude)}
                                onLngChange={lng => updateLocation(item.id, item.delivery_latitude, lng)}
                                onEtaChange={eta => updateEta(item.id, eta)}
                                onMapFocus={() => focusOnItem(item)}
                                onPinOnMap={() => {
                                    setSelectedItemId(item.id);
                                    audio.playHover();
                                }}
                                onSearchSelect={(lat, lng) => {
                                    if (mapRef.current) mapRef.current.setView([lat, lng], 16);
                                }}
                                onHover={audio.playHover}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 20 }}>
                <DeliveryBtn variant="ghost" size="sm" onClick={onBack} onHover={audio.playHover}>
                    Back
                </DeliveryBtn>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .delivery-numbered-marker { background: transparent !important; border: none !important; }
                .delivery-start-marker    { background: transparent !important; border: none !important; }
            `}</style>
        </div>
    );
}