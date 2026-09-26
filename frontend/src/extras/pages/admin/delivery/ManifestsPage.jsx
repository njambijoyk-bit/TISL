import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Truck, Plus, Search, RefreshCw, Filter,
    Calendar, User, ChevronLeft, ChevronRight, XCircle,
    Loader2, FileText, X, RotateCcw, PackageX, ChevronDown, ChevronUp, ArrowRightLeft,
} from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import deliveryAPI from '../../../../_shared/api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StopProgressBar, StatusBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
} from './DeliveryShared';

// ── constants ─────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
    { value: '',            label: 'All statuses' },
    { value: 'draft',       label: 'Draft'        },
    { value: 'dispatched',  label: 'Dispatched'   },
    { value: 'in_progress', label: 'In progress'  },
    { value: 'completed',   label: 'Completed'    },
    { value: 'cancelled',   label: 'Cancelled'    },
];

const PER_PAGE = 15;

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, onClear, onHover, hasActive }) {
    const inputStyle = {
        background:   D.card,
        border:       `1px solid ${D.purpleBorder}`,
        borderRadius: D.radiusSm,
        color:        D.text,
        fontSize:     '0.82rem',
        padding:      '7px 10px',
        outline:      'none',
        width:        '100%',
    };

    return (
        <div style={{
            display:   'flex',
            flexWrap:  'wrap',
            gap:       10,
            marginBottom: 18,
            alignItems: 'flex-end',
        }}>
            {/* search */}
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
                <Search size={13} color={D.textDim} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                    value={filters.search}
                    onChange={e => onChange('search', e.target.value)}
                    placeholder="Search manifest # or driver…"
                    style={{ ...inputStyle, paddingLeft: 28 }}
                />
            </div>

            {/* status */}
            <div style={{ flex: '0 1 160px', minWidth: 140 }}>
                <select
                    value={filters.status}
                    onChange={e => onChange('status', e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                >
                    {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>

            <div style={{ flex: '0 1 180px', minWidth: 150 }}>
                <select
                    value={filters.delivery_method || ''}
                    onChange={e => onChange('delivery_method', e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                >
                    <option value="">All methods</option>
                    <option value="internal_driver">Internal Driver</option>
                    <option value="courier">External Courier</option>
                    <option value="customer_pickup">Customer Pickup</option>
                    <option value="third_party">Third-Party</option>
                </select>
            </div>

            {/* date */}
            <div style={{ flex: '0 1 150px', minWidth: 130 }}>
                <input
                    type="date"
                    value={filters.date}
                    onChange={e => onChange('date', e.target.value)}
                    style={inputStyle}
                />
            </div>

            {/* clear */}
            {hasActive && (
                <DeliveryBtn
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    onHover={onHover}
                    style={{ flexShrink: 0 }}
                >
                    <X size={12} /> Clear
                </DeliveryBtn>
            )}
        </div>
    );
}

// ── manifest row card ─────────────────────────────────────────────────────────
function ManifestRow({ manifest, onClick, onHover }) {
    const items     = manifest.items ?? [];
    const total     = items.length;
    const delivered = items.filter(i => i.status === 'delivered').length;
    const failed    = items.filter(i => i.status === 'failed').length;
    const returned  = items.filter(i => i.status === 'returned').length;

    return (
        <DeliveryCard
            hoverable
            onClick={onClick}
            style={{ padding: 'clamp(12px, 2vw, 16px)' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                {/* left: number + driver */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: D.radiusSm,
                        background: D.purpleDim,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Truck size={18} color={D.purple} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: D.text, marginBottom: 2 }}>
                            {manifest.manifest_number}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <User size={11} color={D.textDim} />
                                {manifest.driver?.name ?? 'Unassigned'}
                            </span>
                            <span>·</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Calendar size={11} color={D.textDim} />
                                {fmtDate(manifest.scheduled_date)}
                            </span>
                            {total > 0 && (
                                <>
                                    <span>·</span>
                                    <span>{total} stops</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* right: status */}
                <StatusBadge status={manifest.status} />
            </div>

            {/* stop progress bar */}
            {total > 0 && (
                <div style={{ marginTop: 12 }}>
                    <StopProgressBar total={total} delivered={delivered} failed={failed} />
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.7rem', color: D.textDim }}>
                        <span style={{ color: D.teal }}>{delivered} delivered</span>
                        {failed > 0 && <span style={{ color: '#ef4444' }}>{failed} failed</span>}
                        {returned > 0 && <span style={{ color: '#f59e0b' }}>{returned} returned</span>}
                        <span>{total - delivered - failed - returned} pending</span>
                        {manifest.total_distance_km > 0 && (
                            <span style={{ marginLeft: 'auto' }}>{manifest.total_distance_km} km</span>
                        )}
                    </div>
                </div>
            )}
        </DeliveryCard>
    );
}

// ── pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, onPage, onHover }) {
    if (!meta || meta.last_page <= 1) return null;

    const { current_page, last_page, from, to, total } = meta;

    const pages = [];
    let start = Math.max(1, current_page - 2);
    let end   = Math.min(last_page, current_page + 2);
    if (start > 1)          pages.push('..start');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < last_page)    pages.push('..end');

    const btnStyle = (active, disabled) => ({
        padding:      '5px 10px',
        borderRadius: D.radiusSm,
        border:       `1px solid ${active ? D.purple : D.purpleBorder}`,
        background:   active ? D.purpleDim : 'transparent',
        color:        active ? D.purple : D.textMid,
        cursor:       disabled ? 'default' : 'pointer',
        fontSize:     '0.78rem',
        fontWeight:   active ? 700 : 400,
        opacity:      disabled ? 0.4 : 1,
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${D.purpleBorder}` }}>
            <span style={{ fontSize: '0.75rem', color: D.textDim }}>
                {from}–{to} of {total} manifests
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                    style={btnStyle(false, current_page === 1)}
                    disabled={current_page === 1}
                    onClick={() => { onHover(); onPage(current_page - 1); }}
                >
                    <ChevronLeft size={14} />
                </button>

                {pages.map((p, i) =>
                    typeof p === 'number' ? (
                        <button
                            key={p}
                            style={btnStyle(p === current_page, false)}
                            onClick={() => { onHover(); onPage(p); }}
                        >
                            {p}
                        </button>
                    ) : (
                        <span key={p + i} style={{ padding: '5px 4px', color: D.textDim, fontSize: '0.78rem' }}>…</span>
                    )
                )}

                <button
                    style={btnStyle(false, current_page === last_page)}
                    disabled={current_page === last_page}
                    onClick={() => { onHover(); onPage(current_page + 1); }}
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ── returned items panel ──────────────────────────────────────────────────────
function ReturnedItemsPanel({ onHover, navigate, audio }) {
    const [open,         setOpen]         = useState(false);
    const [items,        setItems]        = useState([]);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState(null);
    const [drafts,       setDrafts]       = useState([]);
    const [transferring, setTransferring] = useState(null); // item id being transferred
    const [pickerItem,   setPickerItem]   = useState(null); // item id showing draft picker

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await deliveryAPI.getReturnedItems();
            setItems(res.data ?? []);
        } catch {
            setError('Failed to load returned items.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    const loadDrafts = async () => {
        try {
            const res = await deliveryAPI.getManifests({ status: 'draft', per_page: 50 });
            setDrafts(res.data ?? []);
        } catch { /* silent — user will see empty picker */ }
    };

    const handleToggle = () => {
        onHover();
        if (!open) { load(); loadDrafts(); }
        setOpen(o => !o);
    };

    const handleTransfer = async (itemId, manifestId) => {
        setTransferring(itemId);
        try {
            await deliveryAPI.transferManifestItems({
                item_ids: [itemId],
                destination_manifest_id: manifestId,
            });
            audio.playHover();
            setPickerItem(null);
            setItems(prev => prev.filter(i => i.id !== itemId));
        } catch {
            audio.playError();
        } finally {
            setTransferring(null);
        }
    };

    const panelStyle = {
        background:   D.card,
        border:       `1px solid ${D.purpleBorder}`,
        borderRadius: D.radiusLg,
        overflow:     'hidden',
        marginTop:    16,
    };

    const headerStyle = {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 16px',
        cursor:         'pointer',
        userSelect:     'none',
    };

    const rowStyle = {
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '10px 16px',
        borderTop:    `1px solid ${D.purpleBorder}`,
        flexWrap:     'wrap',
    };

    const badgeStyle = {
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        padding:      '2px 8px',
        borderRadius: 20,
        fontSize:     '0.7rem',
        fontWeight:   600,
        background:   'rgba(245,158,11,0.12)',
        color:        '#f59e0b',
        border:       '1px solid rgba(245,158,11,0.25)',
        whiteSpace:   'nowrap',
    };

    return (
        <div style={panelStyle}>
            <div style={headerStyle} onClick={handleToggle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RotateCcw size={14} color="#f59e0b" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                        Returned items
                    </span>
                    {items.length > 0 && (
                        <span style={{ ...badgeStyle, background: 'rgba(245,158,11,0.15)' }}>
                            {items.length}
                        </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: D.textDim }}>
                        — awaiting reassignment
                    </span>
                </div>
                {open ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />}
            </div>

            {open && (
                <>
                    {loading && (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: D.textDim, fontSize: '0.82rem', display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <Loader2 size={14} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                            Loading…
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: '16px', color: '#ef4444', fontSize: '0.82rem', borderTop: `1px solid ${D.purpleBorder}` }}>
                            {error}
                        </div>
                    )}
                    {!loading && !error && items.length === 0 && (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: D.textDim, fontSize: '0.82rem', borderTop: `1px solid ${D.purpleBorder}` }}>
                            No returned items — all clear.
                        </div>
                    )}
                    {!loading && items.map(item => (
                        <div key={item.id} style={rowStyle}>
                            <PackageX size={14} color="#f59e0b" style={{ flexShrink: 0 }} />

                            {/* order + customer */}
                            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>
                                    {item.order_number}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: D.textDim }}>
                                    {item.customer_name || '—'}
                                    {item.customer_phone && <> · {item.customer_phone}</>}
                                </div>
                                {item.returned_at && (
                                    <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: 2 }}>
                                        returned {new Date(item.returned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    </div>
                                )}
                            </div>

                            {/* failed reason */}
                            {item.failed_reason && (
                                <div style={{ flex: '1 1 140px', fontSize: '0.72rem', color: D.textDim, fontStyle: 'italic', minWidth: 0 }}>
                                    "{item.failed_reason}"
                                </div>
                            )}

                            {/* source manifest */}
                            <div
                                style={{ fontSize: '0.72rem', color: D.purple, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                onClick={() => { onHover(); navigate(`/admin/delivery/manifests/${item.manifest_id}`); }}
                            >
                                {item.manifest_number}
                            </div>

                            {/* transfer action */}
                            {pickerItem === item.id ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: '1 1 auto' }}>
                                    <div style={{ flex: 1, minWidth: 180 }}>
                                        {drafts.length === 0 ? (
                                            <div style={{ fontSize: '0.75rem', color: D.textDim, padding: '6px 0' }}>
                                                No draft manifests available
                                            </div>
                                        ) : (
                                            <div style={{
                                                background:   D.card,
                                                border:       `1px solid ${D.purpleBorder}`,
                                                borderRadius: D.radiusSm,
                                                overflow:     'hidden',
                                                maxHeight:    180,
                                                overflowY:    'auto',
                                            }}>
                                                {drafts.map(d => {
                                                    const stopCount = d.items?.length ?? 0;
                                                    const statusColor = {
                                                        draft:       '#94a3b8',
                                                        dispatched:  '#a855f7',
                                                        in_progress: '#f59e0b',
                                                        completed:   '#22c55e',
                                                        cancelled:   '#ef4444',
                                                    }[d.status] ?? '#94a3b8';

                                                    return (
                                                        <div
                                                            key={d.id}
                                                            onClick={() => handleTransfer(item.id, d.id)}
                                                            style={{
                                                                padding:      '8px 12px',
                                                                cursor:       'pointer',
                                                                borderBottom: `1px solid ${D.purpleBorder}`,
                                                                display:      'flex',
                                                                alignItems:   'center',
                                                                gap:          10,
                                                                transition:   'background 0.1s',
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = D.purpleDim}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: D.text }}>
                                                                    {d.manifest_number}
                                                                </div>
                                                                <div style={{ fontSize: '0.68rem', color: D.textDim, marginTop: 1 }}>
                                                                    {d.driver?.name ?? 'Unassigned'}
                                                                    {stopCount > 0 && <> · {stopCount} stop{stopCount !== 1 ? 's' : ''}</>}
                                                                    {d.scheduled_date && <> · {fmtDate(d.scheduled_date)}</>}
                                                                </div>
                                                            </div>
                                                            <span style={{
                                                                fontSize:     '0.62rem',
                                                                fontWeight:   700,
                                                                color:        statusColor,
                                                                textTransform:'uppercase',
                                                                letterSpacing:'0.05em',
                                                                flexShrink:   0,
                                                            }}>
                                                                {d.status?.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <DeliveryBtn variant="ghost" size="sm" onClick={() => setPickerItem(null)} onHover={onHover}>
                                        <X size={11} />
                                    </DeliveryBtn>
                                </div>
                            ) : (
                                <DeliveryBtn
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { onHover(); setPickerItem(item.id); }}
                                    onHover={onHover}
                                    disabled={transferring === item.id}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {transferring === item.id
                                        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                        : <ArrowRightLeft size={11} />
                                    }
                                    Transfer
                                </DeliveryBtn>
                            )}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

// ── failed items panel ────────────────────────────────────────────────────────
function FailedItemsPanel({ onHover, navigate, audio }) {
    const [open,         setOpen]         = useState(false);
    const [items,        setItems]        = useState([]);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState(null);
    const [drafts,       setDrafts]       = useState([]);
    const [transferring, setTransferring] = useState(null);
    const [pickerItem,   setPickerItem]   = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await deliveryAPI.getFailedItems();
            setItems(res.data ?? []);
        } catch {
            setError('Failed to load failed items.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    const loadDrafts = async () => {
        try {
            const res = await deliveryAPI.getManifests({ status: 'draft', per_page: 50 });
            setDrafts(res.data ?? []);
        } catch { /* silent */ }
    };

    const handleToggle = () => {
        onHover();
        if (!open) { load(); loadDrafts(); }
        setOpen(o => !o);
    };

    const handleTransfer = async (itemId, manifestId) => {
        setTransferring(itemId);
        try {
            await deliveryAPI.transferManifestItems({
                item_ids: [itemId],
                destination_manifest_id: manifestId,
            });
            audio.playHover();
            setPickerItem(null);
            setItems(prev => prev.filter(i => i.id !== itemId));
        } catch {
            audio.playError();
        } finally {
            setTransferring(null);
        }
    };

    const panelStyle = {
        background:   D.card,
        border:       `1px solid rgba(239,68,68,0.25)`,
        borderRadius: D.radiusLg,
        overflow:     'hidden',
        marginTop:    16,
    };

    const headerStyle = {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 16px',
        cursor:         'pointer',
        userSelect:     'none',
    };

    const rowStyle = {
        display:   'flex',
        alignItems:'center',
        gap:       12,
        padding:   '10px 16px',
        borderTop: `1px solid rgba(239,68,68,0.15)`,
        flexWrap:  'wrap',
    };

    const badgeStyle = {
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        padding:      '2px 8px',
        borderRadius: 20,
        fontSize:     '0.7rem',
        fontWeight:   600,
        background:   'rgba(239,68,68,0.12)',
        color:        '#ef4444',
        border:       '1px solid rgba(239,68,68,0.25)',
        whiteSpace:   'nowrap',
    };

    return (
        <div style={panelStyle}>
            <div style={headerStyle} onClick={handleToggle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <XCircle size={14} color="#ef4444" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                        Failed items
                    </span>
                    {items.length > 0 && (
                        <span style={badgeStyle}>{items.length}</span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: D.textDim }}>
                        — awaiting retry or reassignment
                    </span>
                </div>
                {open ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />}
            </div>

            {open && (
                <>
                    {loading && (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: D.textDim, fontSize: '0.82rem', display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <Loader2 size={14} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                            Loading…
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: '16px', color: '#ef4444', fontSize: '0.82rem', borderTop: `1px solid rgba(239,68,68,0.15)` }}>
                            {error}
                        </div>
                    )}
                    {!loading && !error && items.length === 0 && (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: D.textDim, fontSize: '0.82rem', borderTop: `1px solid rgba(239,68,68,0.15)` }}>
                            No failed items — all clear.
                        </div>
                    )}
                    {!loading && items.map(item => (
                        <div key={item.id} style={rowStyle}>
                            <PackageX size={14} color="#ef4444" style={{ flexShrink: 0 }} />

                            {/* order + customer */}
                            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>
                                    {item.order_number}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: D.textDim }}>
                                    {item.customer_name || '—'}
                                    {item.customer_phone && <> · {item.customer_phone}</>}
                                </div>
                                {item.attempted_at && (
                                    <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: 2 }}>
                                        failed {new Date(item.attempted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    </div>
                                )}
                            </div>

                            {/* failed reason */}
                            {item.failed_reason && (
                                <div style={{ flex: '1 1 140px', fontSize: '0.72rem', color: D.textDim, fontStyle: 'italic', minWidth: 0 }}>
                                    "{item.failed_reason}"
                                </div>
                            )}

                            {/* source manifest */}
                            <div
                                style={{ fontSize: '0.72rem', color: D.purple, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                onClick={() => { onHover(); navigate(`/admin/delivery/manifests/${item.manifest_id}`); }}
                            >
                                {item.manifest_number}
                            </div>

                            {/* transfer action */}
                            {pickerItem === item.id ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: '1 1 auto' }}>
                                    <div style={{ flex: 1, minWidth: 180 }}>
                                        {drafts.length === 0 ? (
                                            <div style={{ fontSize: '0.75rem', color: D.textDim, padding: '6px 0' }}>
                                                No draft manifests available
                                            </div>
                                        ) : (
                                            <div style={{
                                                background:   D.card,
                                                border:       `1px solid ${D.purpleBorder}`,
                                                borderRadius: D.radiusSm,
                                                overflow:     'hidden',
                                                maxHeight:    180,
                                                overflowY:    'auto',
                                            }}>
                                                {drafts.map(d => {
                                                    const stopCount = d.items?.length ?? 0;
                                                    const statusColor = {
                                                        draft:       '#94a3b8',
                                                        dispatched:  '#a855f7',
                                                        in_progress: '#f59e0b',
                                                        completed:   '#22c55e',
                                                        cancelled:   '#ef4444',
                                                    }[d.status] ?? '#94a3b8';

                                                    return (
                                                        <div
                                                            key={d.id}
                                                            onClick={() => handleTransfer(item.id, d.id)}
                                                            style={{
                                                                padding:      '8px 12px',
                                                                cursor:       'pointer',
                                                                borderBottom: `1px solid ${D.purpleBorder}`,
                                                                display:      'flex',
                                                                alignItems:   'center',
                                                                gap:          10,
                                                                transition:   'background 0.1s',
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = D.purpleDim}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: D.text }}>
                                                                    {d.manifest_number}
                                                                </div>
                                                                <div style={{ fontSize: '0.68rem', color: D.textDim, marginTop: 1 }}>
                                                                    {d.driver?.name ?? 'Unassigned'}
                                                                    {stopCount > 0 && <> · {stopCount} stop{stopCount !== 1 ? 's' : ''}</>}
                                                                    {d.scheduled_date && <> · {fmtDate(d.scheduled_date)}</>}
                                                                </div>
                                                            </div>
                                                            <span style={{
                                                                fontSize:      '0.62rem',
                                                                fontWeight:    700,
                                                                color:         statusColor,
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.05em',
                                                                flexShrink:    0,
                                                            }}>
                                                                {d.status?.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <DeliveryBtn variant="ghost" size="sm" onClick={() => setPickerItem(null)} onHover={onHover}>
                                        <X size={11} />
                                    </DeliveryBtn>
                                </div>
                            ) : (
                                <DeliveryBtn
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { onHover(); setPickerItem(item.id); }}
                                    onHover={onHover}
                                    disabled={transferring === item.id}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {transferring === item.id
                                        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                        : <ArrowRightLeft size={11} />
                                    }
                                    Transfer
                                </DeliveryBtn>
                            )}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ManifestsPage() {
    const navigate        = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const audio           = useDeliveryAudio();

    const initialStatus = searchParams.get('status') ?? '';

    const [manifests,  setManifests]  = useState([]);
    const [meta,       setMeta]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState(null);

    const [filters, setFilters] = useState({
        search: '',
        status: initialStatus,
        date:   '',
    });
    const [page, setPage] = useState(1);

    const searchTimer = useRef(null);
    const hasActiveFilters = filters.search || filters.status || filters.date;

    // ── fetch ─────────────────────────────────────────────────────────────────
    const fetchManifests = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);

        try {
            const params = {
                page,
                per_page: PER_PAGE,
                ...(filters.status && { status: filters.status }),
                ...(filters.date   && { date:   filters.date   }),
                ...(filters.search && { search: filters.search }),
            };
            const res = await deliveryAPI.getManifests(params);
            setManifests(res.data ?? []);
            setMeta(res.meta ?? null);
        } catch {
            setError('Failed to load manifests.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filters, page, audio]);

    // debounce search
    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setPage(1);
            fetchManifests();
        }, filters.search ? 350 : 0);
        return () => clearTimeout(searchTimer.current);
    }, [filters]);

    useEffect(() => {
        fetchManifests();
    }, [page]);

    const handleFilterChange = (key, value) => {
        setFilters(f => ({ ...f, [key]: value }));
        if (key !== 'search') setPage(1);
    };

    const handleClearFilters = () => {
        setFilters({ search: '', status: '', date: '' });
        setPage(1);
    };

    const handleRefresh = () => {
        audio.playHover();
        fetchManifests(true);
    };

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[
                        { label: 'Delivery', onClick: () => navigate('/admin/delivery') },
                        { label: 'Manifests' },
                    ]}
                    onHover={audio.playHover}
                />

                <DeliveryPageHeader
                    title="Manifests"
                    sub="All delivery runs — create, dispatch, and track"
                    actions={
                        <>
                            <DeliveryBtn
                                variant="ghost"
                                size="sm"
                                onClick={handleRefresh}
                                onHover={audio.playHover}
                                disabled={refreshing}
                            >
                                <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                                Refresh
                            </DeliveryBtn>
                            <DeliveryBtn
                                variant="primary"
                                size="sm"
                                onClick={() => { audio.playHover(); navigate('/admin/delivery/manifests/create'); }}
                                onHover={audio.playHover}
                            >
                                <Plus size={14} /> New manifest
                            </DeliveryBtn>
                        </>
                    }
                />

                {/* filters */}
                <FilterBar
                    filters={filters}
                    onChange={handleFilterChange}
                    onClear={handleClearFilters}
                    onHover={audio.playHover}
                    hasActive={hasActiveFilters}
                />

                {/* active filter chips */}
                {hasActiveFilters && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {filters.status && (
                            <FilterChip label={`Status: ${filters.status.replace(/_/g, ' ')}`} onRemove={() => handleFilterChange('status', '')} />
                        )}
                        {filters.date && (
                            <FilterChip label={`Date: ${fmtDate(filters.date)}`} onRemove={() => handleFilterChange('date', '')} />
                        )}
                        {filters.search && (
                            <FilterChip label={`"${filters.search}"`} onRemove={() => handleFilterChange('search', '')} />
                        )}
                    </div>
                )}

                <DeliveryDivider />

                {/* returned items */}
                <ReturnedItemsPanel
                    onHover={audio.playHover}
                    navigate={navigate}
                    audio={audio}
                />

                {/* failed items */}
                <FailedItemsPanel
                    onHover={audio.playHover}
                    navigate={navigate}
                    audio={audio}
                />

                <DeliveryDivider label={
                    meta ? `${meta.total} manifest${meta.total !== 1 ? 's' : ''}` : 'Manifests'
                } />

                {/* list */}
                {loading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState message={error} onRetry={handleRefresh} onHover={audio.playHover} />
                ) : manifests.length === 0 ? (
                    <EmptyState hasFilters={hasActiveFilters} onClear={handleClearFilters} onHover={audio.playHover} navigate={navigate} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {manifests.map(m => (
                            <ManifestRow
                                key={m.id}
                                manifest={m}
                                onHover={audio.playHover}
                                onClick={() => {
                                    audio.playHover();
                                    navigate(`/admin/delivery/manifests/${m.id}`);
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* pagination */}
                {!loading && !error && (
                    <Pagination
                        meta={meta}
                        onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        onHover={audio.playHover}
                    />
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

// ── small sub-components ──────────────────────────────────────────────────────

function FilterChip({ label, onRemove }) {
    return (
        <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          5,
            padding:      '3px 8px',
            borderRadius: 20,
            background:   D.purpleDim,
            border:       `1px solid ${D.purpleBorder}`,
            fontSize:     '0.72rem',
            color:        D.purple,
            fontWeight:   600,
        }}>
            {label}
            <button
                onClick={onRemove}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.purple, padding: 0, lineHeight: 1, display: 'flex' }}
            >
                <X size={11} />
            </button>
        </span>
    );
}

function LoadingState() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{
                    background:   D.card,
                    border:       `1px solid ${D.purpleBorder}`,
                    borderRadius: D.radiusLg,
                    padding:      16,
                    opacity:      1 - i * 0.12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: D.radiusSm, background: D.purpleDim }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ height: 14, width: '40%', background: D.purpleDim, borderRadius: 4, marginBottom: 8 }} />
                            <div style={{ height: 11, width: '60%', background: D.purpleDim, borderRadius: 4 }} />
                        </div>
                        <div style={{ height: 22, width: 80, background: D.purpleDim, borderRadius: 20 }} />
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, color: D.textDim, fontSize: '0.82rem', paddingTop: 8 }}>
                <Loader2 size={14} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                Loading manifests…
            </div>
        </div>
    );
}

function ErrorState({ message, onRetry, onHover }) {
    return (
        <DeliveryCard>
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <div style={{ fontSize: '0.9rem', color: '#ef4444', marginBottom: 12 }}>{message}</div>
                <DeliveryBtn variant="ghost" size="sm" onClick={onRetry} onHover={onHover}>
                    <RefreshCw size={13} /> Try again
                </DeliveryBtn>
            </div>
        </DeliveryCard>
    );
}

function EmptyState({ hasFilters, onClear, onHover, navigate }) {
    return (
        <DeliveryCard>
            <DeliveryEmptyState
                icon={hasFilters ? Filter : FileText}
                title={hasFilters ? 'No manifests match your filters' : 'No manifests yet'}
                sub={hasFilters ? 'Try adjusting or clearing your filters.' : 'Create your first manifest to start assigning deliveries to drivers.'}
                action={
                    hasFilters ? (
                        <DeliveryBtn variant="ghost" size="sm" onClick={onClear} onHover={onHover}>
                            <X size={12} /> Clear filters
                        </DeliveryBtn>
                    ) : (
                        <DeliveryBtn variant="primary" size="sm" onClick={() => navigate('/admin/delivery/manifests/create')} onHover={onHover}>
                            <Plus size={14} /> Create manifest
                        </DeliveryBtn>
                    )
                }
            />
        </DeliveryCard>
    );
}