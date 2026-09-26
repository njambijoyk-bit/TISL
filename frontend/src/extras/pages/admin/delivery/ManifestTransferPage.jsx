import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, Package, RefreshCw, Loader2, CheckSquare,
    Square, AlertTriangle, CheckCircle, XCircle, Shuffle,
    ChevronDown, Trash2, ArrowLeftRight, ShieldAlert,
    ExternalLink, FileText, RotateCcw, ChevronRight,
} from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import deliveryAPI from '../../../../_shared/api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatusBadge, DeliveryDivider, DeliveryBtn,
    DeliveryEmptyState,
} from './DeliveryShared';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function customerName(item) {
    const c = item.order?.customer;
    if (c) return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—';
    return item.order?.order_number ?? `Item #${item.id}`;
}

function statusColor(s) {
    return { delivered: D.teal, failed: '#ef4444', returned: '#f59e0b', out_for_delivery: D.purple }[s] ?? D.textDim;
}

// statuses allowed in source panel (left)
// completed is allowed but only returned items within are selectable
const TRANSFERABLE_STATUSES = ['draft', 'cancelled', 'completed'];

const OVERRIDE_PRESETS = [
    'Manager approved',
    'Customer confirmed safe',
    'Emergency delivery',
    'Incident under investigation',
    'Other',
];

// ── SelectableItem row ────────────────────────────────────────────────────────
function SelectableItem({ item, selected, onToggle, sourceManifestStatus }) {
    // Items from completed manifests are only selectable if they are 'returned'
    const fromCompleted = sourceManifestStatus === 'completed';
    const disabled = fromCompleted && item.status !== 'returned';

    const disabledReason = disabled ? 'Only returned items can be transferred from a completed manifest' : null;

    return (
        <div
            onClick={() => !disabled && onToggle(item.id)}
            title={disabledReason ?? undefined}
            style={{
                display:        'flex',
                alignItems:     'center',
                gap:            10,
                padding:        '9px 12px',
                borderRadius:   D.radiusSm,
                background:     selected
                    ? 'rgba(168,85,247,0.10)'
                    : disabled
                        ? 'rgba(255,255,255,0.02)'
                        : 'transparent',
                border:         `1px solid ${selected ? D.purple : disabled ? 'transparent' : 'transparent'}`,
                cursor:         disabled ? 'not-allowed' : 'pointer',
                transition:     'all 0.15s',
                opacity:        disabled ? 0.38 : 1,
            }}
        >
            <div style={{ flexShrink: 0, color: selected ? D.purple : D.textDim }}>
                {disabled
                    ? <Square size={15} style={{ opacity: 0.3 }} />
                    : selected
                        ? <CheckSquare size={15} />
                        : <Square size={15} />
                }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {customerName(item)}
                </div>
                <div style={{ fontSize: '0.7rem', color: D.textDim }}>
                    {item.order?.order_number ?? '—'} · <span style={{ color: statusColor(item.status) }}>{item.status}</span>
                </div>
            </div>
            <StatusBadge status={item.status} />
        </div>
    );
}

// ── ReadonlyItem row (destination preview) ────────────────────────────────────
function ReadonlyItem({ item }) {
    return (
        <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          10,
            padding:      '8px 12px',
            borderRadius: D.radiusSm,
            background:   'rgba(168,85,247,0.04)',
            border:       `1px solid ${D.purpleBorder}`,
        }}>
            <Package size={13} color={D.textDim} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: D.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {customerName(item)}
                </div>
                <div style={{ fontSize: '0.7rem', color: D.textDim }}>
                    {item.order?.order_number ?? '—'}
                </div>
            </div>
            <StatusBadge status={item.status} />
        </div>
    );
}

// ── manifest dropdown ─────────────────────────────────────────────────────────
function ManifestSelect({ label, manifests, value, onChange, placeholder, loading }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                {label}
            </label>
            <div style={{ position: 'relative' }}>
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={loading}
                    style={{
                        width:          '100%',
                        appearance:     'none',
                        background:     D.card,
                        border:         `1px solid ${value ? D.purple : D.purpleBorder}`,
                        borderRadius:   D.radiusSm,
                        color:          value ? D.text : D.textDim,
                        fontSize:       '0.85rem',
                        padding:        '9px 32px 9px 12px',
                        outline:        'none',
                        cursor:         loading ? 'wait' : 'pointer',
                        transition:     'border-color 0.15s',
                    }}
                >
                    <option value="">{loading ? 'Loading…' : placeholder}</option>
                    {manifests.map(m => (
                        <option key={m.id} value={m.id}>
                            {m.manifest_number} · {m.status} · {m.items?.length ?? 0} stops
                            {m.scheduled_date ? ` · ${fmtDate(m.scheduled_date)}` : ''}
                        </option>
                    ))}
                </select>
                <ChevronDown size={14} color={D.textDim} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
        </div>
    );
}

// ── panel shell ───────────────────────────────────────────────────────────────
function Panel({ title, sub, children, accent }) {
    return (
        <div style={{
            flex:         1,
            minWidth:     0,
            background:   D.card,
            border:       `1px solid ${accent ?? D.purpleBorder}`,
            borderRadius: D.radiusLg,
            padding:      'clamp(16px, 3vw, 24px)',
            display:      'flex',
            flexDirection: 'column',
            gap:          0,
        }}>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: D.text }}>{title}</div>
                {sub && <div style={{ fontSize: '0.75rem', color: D.textDim, marginTop: 2 }}>{sub}</div>}
            </div>
            {children}
        </div>
    );
}

// ── empty state inside panel ──────────────────────────────────────────────────
function PanelEmpty({ text }) {
    return (
        <div style={{ textAlign: 'center', padding: '28px 0', color: D.textDim, fontSize: '0.8rem' }}>
            {text}
        </div>
    );
}

// ── success / empty manifest modal ────────────────────────────────────────────
function EmptySourceModal({ manifestNumber, onDelete, onStay, deleting }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }}>
            <div style={{
                background:   D.card,
                border:       `1px solid ${D.purpleBorder}`,
                borderRadius: D.radiusLg,
                padding:      'clamp(20px, 4vw, 28px)',
                width:        '100%',
                maxWidth:     400,
                boxShadow:    D.purpleGlow,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <AlertTriangle size={18} color="#f59e0b" />
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: D.text }}>
                        Source manifest is now empty
                    </div>
                </div>
                <div style={{ fontSize: '0.82rem', color: D.textDim, marginBottom: 22, lineHeight: 1.5 }}>
                    <strong style={{ color: D.text }}>{manifestNumber}</strong> has no items left after the transfer.
                    Do you want to delete it?
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={onStay} disabled={deleting}>
                        Keep it
                    </DeliveryBtn>
                    <DeliveryBtn variant="danger" size="sm" onClick={onDelete} disabled={deleting}>
                        {deleting
                            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                            : <><Trash2 size={13} /> Delete manifest</>
                        }
                    </DeliveryBtn>
                </div>
            </div>
        </div>
    );
}

// ── Override modal ────────────────────────────────────────────────────────────
function OverrideModal({ warning, driverName, onConfirm, onCancel, audio }) {
    const [preset, setPreset] = useState('');
    const [note, setNote]     = useState('');

    const isOther   = preset === 'Other';
    const canSubmit = preset && (!isOther || note.trim());

    const handleConfirm = () => {
        if (!canSubmit) { audio.playError(); return; }
        const reason = isOther ? note.trim() : preset;
        audio.playHover();
        onConfirm(reason);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }} onClick={onCancel}>
            <div onClick={e => e.stopPropagation()} style={{
                background: D.card,
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: D.radiusLg,
                padding: 'clamp(20px, 4vw, 28px)',
                width: '100%',
                maxWidth: 460,
                boxShadow: '0 0 40px rgba(245,158,11,0.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <ShieldAlert size={24} color="#f59e0b" />
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
                        Driver Safety Warning
                    </div>
                </div>
                <div style={{ fontSize: '0.82rem', color: D.textMid, lineHeight: 1.6, marginBottom: 16 }}>
                    <strong style={{ color: D.text }}>{driverName}</strong> has unresolved safety incidents with one or more customers in this transfer:
                    <div style={{
                        marginTop: 10, padding: '10px 14px',
                        background: 'rgba(245,158,11,0.08)',
                        borderRadius: D.radiusSm,
                        border: '1px solid rgba(245,158,11,0.15)',
                        color: '#f59e0b',
                        fontSize: '0.78rem',
                    }}>
                        {warning}
                    </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                        Override reason (required) *
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {OVERRIDE_PRESETS.map(p => (
                            <button
                                key={p}
                                onClick={() => { setPreset(p); audio.playHover(); }}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: D.radiusSm,
                                    border: `1px solid ${preset === p ? '#f59e0b' : D.purpleBorder}`,
                                    background: preset === p ? 'rgba(245,158,11,0.15)' : D.card,
                                    color: preset === p ? '#f59e0b' : D.textMid,
                                    fontSize: '0.75rem',
                                    fontWeight: preset === p ? 600 : 500,
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
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Explain why you're overriding this warning…"
                            rows={2}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                background: D.card,
                                border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm,
                                color: D.text,
                                fontSize: '0.85rem',
                                padding: '9px 11px',
                                outline: 'none',
                                resize: 'vertical',
                            }}
                        />
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={onCancel} onHover={audio.playHover}>
                        Cancel
                    </DeliveryBtn>
                    <DeliveryBtn
                        variant="danger"
                        size="sm"
                        onClick={handleConfirm}
                        onHover={audio.playHover}
                        disabled={!canSubmit}
                    >
                        Proceed anyway
                    </DeliveryBtn>
                </div>
            </div>
        </div>
    );
}

// ── Manifest link chip ────────────────────────────────────────────────────────
function ManifestLinkChip({ manifest, label, navigate, onHover }) {
    if (!manifest) return null;
    return (
        <button
            onClick={() => { onHover(); navigate(`/admin/delivery/manifests/${manifest.id}`); }}
            onMouseEnter={onHover}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: 'rgba(168,85,247,0.06)',
                border: `1px solid ${D.purpleBorder}`,
                borderRadius: D.radiusSm,
                cursor: 'pointer',
                color: D.text,
                fontSize: '0.8rem',
                textAlign: 'left',
                transition: 'all 0.15s',
                flex: 1,
                minWidth: 0,
            }}
            onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(168,85,247,0.12)';
                e.currentTarget.style.borderColor = D.purple;
            }}
            onMouseOut={e => {
                e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
                e.currentTarget.style.borderColor = D.purpleBorder;
            }}
        >
            <FileText size={14} color={D.purple} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {manifest.manifest_number}
                </div>
                <div style={{ fontSize: '0.72rem', color: D.textDim, marginTop: 1 }}>
                    {label} · {manifest.status} · {manifest.items?.length ?? 0} stops
                    {manifest.scheduled_date ? ` · ${fmtDate(manifest.scheduled_date)}` : ''}
                </div>
            </div>
            <ExternalLink size={13} color={D.purple} style={{ flexShrink: 0, opacity: 0.7 }} />
        </button>
    );
}

// ── Returned items section ────────────────────────────────────────────────────
// Groups returned items by manifest and renders a card per manifest
// with a "Load into source" shortcut.
function ReturnedItemsSection({ returnedItems, loadingReturned, onLoad, audio }) {
    const [expanded, setExpanded] = useState(true);

    if (loadingReturned) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '14px 16px',
                background: D.card,
                border: `1px solid ${D.purpleBorder}`,
                borderRadius: D.radiusLg,
                marginBottom: 20,
                color: D.textDim,
                fontSize: '0.82rem',
            }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                Checking for returned items…
            </div>
        );
    }

    if (!returnedItems || returnedItems.length === 0) return null;

    // Group by manifest_id
    const byManifest = returnedItems.reduce((acc, item) => {
        const key = item.manifest_id;
        if (!acc[key]) {
            acc[key] = {
                manifest_id:     item.manifest_id,
                manifest_number: item.manifest_number,
                manifest_date:   item.manifest_date,
                driver_name:     item.driver_name,
                items:           [],
            };
        }
        acc[key].items.push(item);
        return acc;
    }, {});

    const groups = Object.values(byManifest);

    return (
        <div style={{ marginBottom: 24 }}>
            {/* Section header */}
            <button
                onClick={() => { setExpanded(e => !e); audio.playHover(); }}
                style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            8,
                    marginBottom:   expanded ? 10 : 0,
                    background:     'transparent',
                    border:         'none',
                    cursor:         'pointer',
                    padding:        0,
                    width:          '100%',
                    textAlign:      'left',
                }}
            >
                <RotateCcw size={13} color="#f59e0b" />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Returned items awaiting reassignment
                </span>
                <span style={{
                    fontSize:     '0.68rem',
                    fontWeight:   700,
                    color:        '#f59e0b',
                    background:   'rgba(245,158,11,0.15)',
                    border:       '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '999px',
                    padding:      '1px 7px',
                    marginLeft:   2,
                }}>
                    {returnedItems.length}
                </span>
                <ChevronRight
                    size={13}
                    color={D.textDim}
                    style={{
                        marginLeft: 'auto',
                        transition: 'transform 0.2s',
                        transform:  expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                />
            </button>

            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {groups.map(group => (
                        <ReturnedManifestCard
                            key={group.manifest_id}
                            group={group}
                            onLoad={onLoad}
                            audio={audio}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Single returned-manifest card ─────────────────────────────────────────────
function ReturnedManifestCard({ group, onLoad, audio }) {
    const [open, setOpen] = useState(false);

    return (
        <div style={{
            background:   D.card,
            border:       '1px solid rgba(245,158,11,0.25)',
            borderRadius: D.radiusLg,
            overflow:     'hidden',
        }}>
            {/* Card header row */}
            <div style={{
                display:        'flex',
                alignItems:     'center',
                gap:            10,
                padding:        '10px 14px',
                cursor:         'pointer',
            }}
                onClick={() => { setOpen(o => !o); audio.playHover(); }}
            >
                <RotateCcw size={13} color="#f59e0b" style={{ flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, color: D.text }}>
                        {group.manifest_number}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: D.textDim, marginTop: 1 }}>
                        {group.driver_name ? `${group.driver_name} · ` : ''}
                        {group.manifest_date ? fmtDate(group.manifest_date) : ''}
                    </div>
                </div>

                {/* item count badge */}
                <span style={{
                    fontSize:     '0.7rem',
                    fontWeight:   700,
                    color:        '#f59e0b',
                    background:   'rgba(245,158,11,0.12)',
                    border:       '1px solid rgba(245,158,11,0.25)',
                    borderRadius: '999px',
                    padding:      '2px 8px',
                    whiteSpace:   'nowrap',
                    flexShrink:   0,
                }}>
                    {group.items.length} returned
                </span>

                {/* Load shortcut */}
                <DeliveryBtn
                    variant="primary"
                    size="sm"
                    onClick={e => {
                        e.stopPropagation();
                        audio.playHover();
                        onLoad(group.manifest_id, group.items.map(i => i.id));
                    }}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                    <ArrowRight size={11} /> Load
                </DeliveryBtn>

                <ChevronRight
                    size={13}
                    color={D.textDim}
                    style={{
                        flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform:  open ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                />
            </div>

            {/* Expanded item list */}
            {open && (
                <div style={{
                    borderTop:    '1px solid rgba(245,158,11,0.15)',
                    padding:      '8px 14px',
                    display:      'flex',
                    flexDirection: 'column',
                    gap:          4,
                }}>
                    {group.items.map(item => (
                        <div key={item.id} style={{
                            display:      'flex',
                            alignItems:   'center',
                            gap:          8,
                            padding:      '6px 8px',
                            borderRadius: D.radiusSm,
                            background:   'rgba(245,158,11,0.05)',
                            border:       '1px solid rgba(245,158,11,0.12)',
                        }}>
                            <RotateCcw size={11} color="#f59e0b" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: D.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.customer_name || '—'}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: D.textDim }}>
                                    {item.order_number ?? '—'}
                                    {item.failed_reason ? ` · ${item.failed_reason}` : ''}
                                </div>
                            </div>
                            {item.returned_at && (
                                <span style={{ fontSize: '0.65rem', color: D.textDim, flexShrink: 0 }}>
                                    {fmtDate(item.returned_at)}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ManifestTransferPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    // all manifests
    const [allManifests, setAllManifests] = useState([]);
    const [loadingManifests, setLoadingManifests] = useState(true);

    // returned items (from completed manifests)
    const [returnedItems, setReturnedItems]       = useState([]);
    const [loadingReturned, setLoadingReturned]   = useState(true);

    // panel state
    const [sourceId,       setSourceId]       = useState('');
    const [destId,         setDestId]         = useState('');
    const [sourceManifest, setSourceManifest] = useState(null);
    const [destManifest,   setDestManifest]   = useState(null);
    const [loadingSource,  setLoadingSource]  = useState(false);
    const [loadingDest,    setLoadingDest]    = useState(false);

    // selection
    const [selected, setSelected] = useState(new Set());

    // transfer state
    const [transferring,     setTransferring]     = useState(false);
    const [transferError,    setTransferError]     = useState(null);
    const [transferSuccess,  setTransferSuccess]   = useState(null);

    // override modal state
    const [overrideModal,    setOverrideModal]     = useState(null);

    // pre-flight safety warning
    const [preflightWarning, setPreflightWarning] = useState(null);

    // post-transfer empty-source modal
    const [emptySourceModal, setEmptySourceModal] = useState(null);
    const [deleting,         setDeleting]         = useState(false);

    // ── load manifest list ────────────────────────────────────────────────────
    const fetchManifestList = useCallback(async () => {
        setLoadingManifests(true);
        try {
            const res  = await deliveryAPI.getManifests({ per_page: 200 });
            const data = res.data ?? res;
            const list = Array.isArray(data) ? data : (data.data ?? []);
            setAllManifests(list);
        } catch {
            setAllManifests([]);
        } finally {
            setLoadingManifests(false);
        }
    }, []);

    // ── load returned items ───────────────────────────────────────────────────
    const fetchReturnedItems = useCallback(async () => {
        setLoadingReturned(true);
        try {
            const res = await deliveryAPI.getReturnedItems();
            setReturnedItems(res.data ?? []);
        } catch {
            setReturnedItems([]);
        } finally {
            setLoadingReturned(false);
        }
    }, []);

    useEffect(() => {
        fetchManifestList();
        fetchReturnedItems();
    }, [fetchManifestList, fetchReturnedItems]);

    // ── fetch source manifest detail ──────────────────────────────────────────
    useEffect(() => {
        if (!sourceId) { setSourceManifest(null); setSelected(new Set()); return; }
        setLoadingSource(true);
        setSelected(new Set());
        setTransferError(null);
        setPreflightWarning(null);
        deliveryAPI.getManifest(sourceId)
            .then(res => setSourceManifest(res.data ?? res))
            .catch(() => setSourceManifest(null))
            .finally(() => setLoadingSource(false));
    }, [sourceId]);

    // ── fetch destination manifest detail ─────────────────────────────────────
    useEffect(() => {
        if (!destId) { setDestManifest(null); setPreflightWarning(null); return; }
        setLoadingDest(true);
        setTransferError(null);
        setPreflightWarning(null);
        deliveryAPI.getManifest(destId)
            .then(res => setDestManifest(res.data ?? res))
            .catch(() => setDestManifest(null))
            .finally(() => setLoadingDest(false));
    }, [destId]);

    // ── pre-flight safety check ───────────────────────────────────────────────
    useEffect(() => {
        if (
            !destManifest?.driver_id
            || selected.size === 0
            || overrideModal
            || destManifest?.delivery_method !== 'internal_driver'
        ) {
            setPreflightWarning(null);
            return;
        }

        const orderIds = (sourceManifest?.items ?? [])
            .filter(i => selected.has(i.id))
            .map(i => i.order_id);

        if (orderIds.length === 0) { setPreflightWarning(null); return; }

        let cancelled = false;
        deliveryAPI.checkDriverSafety(destManifest.driver_id, orderIds)
            .then(res => {
                if (cancelled) return;
                setPreflightWarning(res.warning ? {
                    warning:     res.warning,
                    driver_id:   destManifest.driver_id,
                    driver_name: destManifest.driver?.name ?? 'Driver',
                } : null);
            })
            .catch(e => {
                if (cancelled) return;
                if (e.response?.status === 409) {
                    setPreflightWarning({
                        warning:     e.response.data.warning,
                        driver_id:   e.response.data.driver_id,
                        driver_name: e.response.data.driver_name ?? 'Driver',
                    });
                } else {
                    setPreflightWarning(null);
                }
            });

        return () => { cancelled = true; };
    }, [destManifest, selected, sourceManifest, overrideModal]);

    // ── selection helpers ─────────────────────────────────────────────────────
    const toggleItem = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
        audio.playHover();
    };

    const toggleAll = () => {
        // For completed manifests, only select returned items
        const sourceItems = sourceManifest?.items ?? [];
        const fromCompleted = sourceManifest?.status === 'completed';
        const selectableItems = fromCompleted
            ? sourceItems.filter(i => i.status === 'returned')
            : sourceItems;

        if (selected.size === selectableItems.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(selectableItems.map(i => i.id)));
        }
        audio.playHover();
    };

    // ── load a returned-items group into source panel ─────────────────────────
    // Called from the returned items section "Load" button
    const handleLoadReturned = useCallback((manifestId, itemIds) => {
        setSourceId(String(manifestId));
        setTransferError(null);
        setTransferSuccess(null);
        // Pre-select the returned item IDs after manifest loads
        // We store them temporarily and apply once sourceManifest is ready
        setPendingSelection(new Set(itemIds.map(String)));
    }, []);

    // pending selection to apply after source manifest loads
    const [pendingSelection, setPendingSelection] = useState(null);

    useEffect(() => {
        if (!pendingSelection || !sourceManifest) return;
        // Map the pending IDs (which are delivery_item ids) against loaded items
        const validIds = new Set(
            (sourceManifest.items ?? [])
                .filter(i => pendingSelection.has(String(i.id)))
                .map(i => i.id)
        );
        setSelected(validIds);
        setPendingSelection(null);
    }, [sourceManifest, pendingSelection]);

    // ── transfer ──────────────────────────────────────────────────────────────
    const handleTransfer = async (overrideReason = null) => {
        if (selected.size === 0 || !destId || !sourceId || sourceId === destId) return;

        if (preflightWarning && !overrideReason && !overrideModal) {
            setOverrideModal(preflightWarning);
            return;
        }

        setTransferring(true);
        setTransferError(null);
        setTransferSuccess(null);

        try {
            const payload = {
                item_ids:                [...selected],
                destination_manifest_id: Number(destId),
            };
            if (overrideReason) payload.override_reason = overrideReason;

            const res = await deliveryAPI.transferManifestItems(payload);
            audio.playSuccess();
            setTransferSuccess(res.message ?? `${selected.size} item(s) transferred.`);
            setOverrideModal(null);
            setPreflightWarning(null);

            // check if source is now empty (only relevant for draft/cancelled)
            const updatedSources = res.sources ?? [];
            const srcAfter = updatedSources.find(m => String(m.id) === String(sourceId));
            const srcEmpty = srcAfter && (srcAfter.items?.length === 0);

            setDestManifest(res.destination ?? destManifest);

            if (srcEmpty && sourceManifest?.status !== 'completed') {
                setEmptySourceModal({
                    manifestId:     srcAfter.id,
                    manifestNumber: srcAfter.manifest_number,
                });
                setSourceManifest(srcAfter);
                setSelected(new Set());
            } else {
                setSourceManifest(srcAfter ?? sourceManifest);
                setSelected(new Set());
            }

            // Refresh both lists so the returned items section updates
            fetchManifestList();
            fetchReturnedItems();

        } catch (e) {
            const status = e.response?.status;
            const data   = e.response?.data;

            if (status === 409 && data?.requires_override) {
                setOverrideModal({
                    warning:     data.warning,
                    driver_id:   data.driver_id,
                    driver_name: data.driver_name ?? 'Driver',
                });
            } else {
                setTransferError(data?.message ?? 'Transfer failed. Please try again.');
                audio.playError();
            }
        } finally {
            setTransferring(false);
        }
    };

    // ── delete empty source ───────────────────────────────────────────────────
    const handleDeleteEmpty = async () => {
        if (!emptySourceModal) return;
        setDeleting(true);
        try {
            await deliveryAPI.deleteManifestIfEmpty(emptySourceModal.manifestId);
            audio.playFail();
            setEmptySourceModal(null);
            setSourceId('');
            setSourceManifest(null);
            navigate(`/admin/delivery/manifests/${destId}`);
        } catch {
            setEmptySourceModal(null);
            audio.playError();
        } finally {
            setDeleting(false);
        }
    };

    // ── derived ───────────────────────────────────────────────────────────────

    // Build the set of manifest IDs that have returned items (for filtering completed ones)
    const returnedManifestIds = new Set(returnedItems.map(i => String(i.manifest_id)));

    // Source list: draft + cancelled always; completed only if they have returned items
    const sourceManifests = allManifests.filter(m => {
        if (m.status === 'draft' || m.status === 'cancelled') return true;
        if (m.status === 'completed') return returnedManifestIds.has(String(m.id));
        return false;
    });

    const destManifests = allManifests.filter(m => m.status === 'draft');

    const sourceItems   = sourceManifest?.items ?? [];
    const destItems     = destManifest?.items ?? [];
    const fromCompleted = sourceManifest?.status === 'completed';

    // For "select all", only count selectable items
    const selectableItems = fromCompleted
        ? sourceItems.filter(i => i.status === 'returned')
        : sourceItems;

    const allSelected  = selectableItems.length > 0 && selected.size === selectableItems.length;
    const someSelected = selected.size > 0;

    const canTransfer      = someSelected && destId && sourceId && sourceId !== destId && !transferring;
    const sameManifestError = sourceId && destId && sourceId === destId;
    const hasAnySelection  = sourceId || destId;
    const activeSource     = sourceManifest;
    const activeDest       = destManifest;

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>

                <DeliveryBreadcrumb
                    items={[
                        { label: 'Delivery',  onClick: () => navigate('/admin/delivery') },
                        { label: 'Manifests', onClick: () => navigate('/admin/delivery/manifests') },
                        { label: 'Transfer items' },
                    ]}
                    onHover={audio.playHover}
                />

                <DeliveryPageHeader
                    title="Transfer items"
                    sub="Move stops between manifests — or reassign returned items to a new run"
                    actions={
                        <DeliveryBtn
                            variant="ghost"
                            size="sm"
                            onClick={() => { audio.playHover(); fetchManifestList(); fetchReturnedItems(); }}
                            onHover={audio.playHover}
                            disabled={loadingManifests}
                        >
                            <RefreshCw size={13} style={loadingManifests ? { animation: 'spin 1s linear infinite' } : {}} />
                        </DeliveryBtn>
                    }
                />

                {/* ── returned items section ── */}
                <ReturnedItemsSection
                    returnedItems={returnedItems}
                    loadingReturned={loadingReturned}
                    onLoad={handleLoadReturned}
                    audio={audio}
                />

                {/* ── success banner ── */}
                {transferSuccess && !emptySourceModal && (
                    <div style={{
                        background:   'rgba(20,184,166,0.1)',
                        border:       '1px solid rgba(20,184,166,0.3)',
                        borderRadius: D.radiusSm,
                        padding:      '10px 14px',
                        color:        D.teal,
                        fontSize:     '0.82rem',
                        marginBottom: 16,
                        display:      'flex',
                        alignItems:   'center',
                        gap:          8,
                    }}>
                        <CheckCircle size={14} /> {transferSuccess}
                    </div>
                )}

                {/* ── error banner ── */}
                {(transferError || sameManifestError) && (
                    <div style={{
                        background:   'rgba(239,68,68,0.1)',
                        border:       '1px solid rgba(239,68,68,0.3)',
                        borderRadius: D.radiusSm,
                        padding:      '10px 14px',
                        color:        '#ef4444',
                        fontSize:     '0.82rem',
                        marginBottom: 16,
                        display:      'flex',
                        alignItems:   'center',
                        gap:          8,
                    }}>
                        <XCircle size={14} />
                        {sameManifestError ? 'Source and destination cannot be the same manifest.' : transferError}
                    </div>
                )}

                {/* ── two-panel layout ── */}
                <div style={{
                    display:    'flex',
                    gap:        'clamp(12px, 2vw, 20px)',
                    alignItems: 'flex-start',
                    flexWrap:   'wrap',
                }}>

                    {/* ── LEFT: source panel ── */}
                    <Panel
                        title="Move from"
                        sub={fromCompleted
                            ? 'Completed manifest — only returned items are transferable'
                            : 'Draft or cancelled manifests'
                        }
                        accent={someSelected ? D.purple : fromCompleted ? 'rgba(245,158,11,0.3)' : D.purpleBorder}
                    >
                        <ManifestSelect
                            label="Source manifest"
                            manifests={sourceManifests}
                            value={sourceId}
                            onChange={v => { setSourceId(v); setTransferError(null); setTransferSuccess(null); }}
                            placeholder="Select source manifest…"
                            loading={loadingManifests}
                        />

                        {/* completed manifest notice */}
                        {fromCompleted && (
                            <div style={{
                                display:      'flex',
                                alignItems:   'center',
                                gap:          7,
                                padding:      '7px 11px',
                                marginBottom: 10,
                                borderRadius: D.radiusSm,
                                background:   'rgba(245,158,11,0.07)',
                                border:       '1px solid rgba(245,158,11,0.2)',
                                fontSize:     '0.73rem',
                                color:        '#f59e0b',
                            }}>
                                <RotateCcw size={11} style={{ flexShrink: 0 }} />
                                Only <strong style={{ margin: '0 2px' }}>returned</strong> items can be moved from a completed manifest.
                                Other stops are locked.
                            </div>
                        )}

                        {/* select all row */}
                        {selectableItems.length > 0 && (
                            <div
                                onClick={toggleAll}
                                style={{
                                    display:      'flex',
                                    alignItems:   'center',
                                    gap:          8,
                                    padding:      '6px 12px',
                                    marginBottom: 6,
                                    cursor:       'pointer',
                                    borderRadius: D.radiusSm,
                                    background:   allSelected ? 'rgba(168,85,247,0.07)' : 'transparent',
                                }}
                            >
                                <div style={{ color: allSelected ? D.purple : D.textDim }}>
                                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: D.textMid }}>
                                    {allSelected
                                        ? 'Deselect all'
                                        : `Select all${fromCompleted ? ' returned' : ''} (${selectableItems.length})`
                                    }
                                </span>
                                {someSelected && !allSelected && (
                                    <span style={{ fontSize: '0.72rem', color: D.purple, marginLeft: 'auto' }}>
                                        {selected.size} selected
                                    </span>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {loadingSource ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', color: D.textDim }}>
                                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                                </div>
                            ) : !sourceId ? (
                                <PanelEmpty text="Select a source manifest above." />
                            ) : sourceItems.length === 0 ? (
                                <PanelEmpty text="This manifest has no items." />
                            ) : (
                                sourceItems.map(item => (
                                    <SelectableItem
                                        key={item.id}
                                        item={item}
                                        selected={selected.has(item.id)}
                                        onToggle={toggleItem}
                                        sourceManifestStatus={sourceManifest?.status}
                                    />
                                ))
                            )}
                        </div>
                    </Panel>

                    {/* ── MIDDLE: transfer button ── */}
                    <div style={{
                        display:        'flex',
                        flexDirection:  'column',
                        alignItems:     'center',
                        justifyContent: 'center',
                        gap:            10,
                        paddingTop:     'clamp(56px, 8vw, 80px)',
                        flexShrink:     0,
                    }}>
                        {someSelected && (
                            <div style={{
                                background:   'rgba(168,85,247,0.15)',
                                border:       `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm,
                                padding:      '3px 10px',
                                fontSize:     '0.72rem',
                                fontWeight:   700,
                                color:        D.purple,
                                whiteSpace:   'nowrap',
                            }}>
                                {selected.size} item{selected.size !== 1 ? 's' : ''}
                            </div>
                        )}

                        {preflightWarning && someSelected && (
                            <div
                                onClick={() => setOverrideModal(preflightWarning)}
                                title="Click to review and override"
                                style={{
                                    display:      'flex',
                                    alignItems:   'center',
                                    gap:          6,
                                    padding:      '5px 10px',
                                    borderRadius: D.radiusSm,
                                    background:   'rgba(245,158,11,0.12)',
                                    border:       '1px solid rgba(245,158,11,0.3)',
                                    color:        '#f59e0b',
                                    fontSize:     '0.72rem',
                                    fontWeight:   600,
                                    cursor:       'pointer',
                                    whiteSpace:   'nowrap',
                                    transition:   'all 0.15s',
                                }}
                            >
                                <ShieldAlert size={12} />
                                Safety warning
                            </div>
                        )}

                        <DeliveryBtn
                            variant="primary"
                            size="sm"
                            onClick={() => handleTransfer()}
                            onHover={audio.playHover}
                            disabled={!canTransfer}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            {transferring
                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Transferring…</>
                                : <><ArrowRight size={13} /> Transfer</>
                            }
                        </DeliveryBtn>

                        {sourceId && destId && sourceId !== destId && (() => {
                            const destIsTransferable = ['draft', 'cancelled'].includes(
                                allManifests.find(m => String(m.id) === String(destId))?.status
                            );
                            return destIsTransferable ? (
                                <button
                                    onClick={() => {
                                        const tmp = sourceId;
                                        setSourceId(destId);
                                        setDestId(tmp);
                                        setSelected(new Set());
                                        audio.playHover();
                                    }}
                                    title="Swap source and destination"
                                    style={{
                                        background:   'transparent',
                                        border:       `1px solid ${D.purpleBorder}`,
                                        borderRadius: D.radiusSm,
                                        padding:      '5px 8px',
                                        cursor:       'pointer',
                                        color:        D.textDim,
                                        display:      'flex',
                                        alignItems:   'center',
                                    }}
                                >
                                    <ArrowLeftRight size={13} />
                                </button>
                            ) : null;
                        })()}
                    </div>

                    {/* ── RIGHT: destination panel ── */}
                    <Panel
                        title="Move to"
                        sub="Draft manifests only"
                        accent={D.purpleBorder}
                    >
                        <ManifestSelect
                            label="Destination manifest"
                            manifests={destManifests.filter(m => String(m.id) !== String(sourceId))}
                            value={destId}
                            onChange={v => { setDestId(v); setTransferError(null); setTransferSuccess(null); }}
                            placeholder="Select destination manifest…"
                            loading={loadingManifests}
                        />

                        {destManifest && (
                            <div style={{
                                display:      'flex',
                                gap:          12,
                                marginBottom: 12,
                                padding:      '8px 12px',
                                background:   'rgba(168,85,247,0.05)',
                                border:       `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm,
                                fontSize:     '0.75rem',
                            }}>
                                <span style={{ color: D.textDim }}>Current stops:</span>
                                <span style={{ color: D.text, fontWeight: 700 }}>{destItems.length}</span>
                                {someSelected && (
                                    <>
                                        <span style={{ color: D.textDim }}>→ after transfer:</span>
                                        <span style={{ color: D.purple, fontWeight: 700 }}>
                                            {destItems.length + selected.size}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {loadingDest ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} />
                                </div>
                            ) : !destId ? (
                                <PanelEmpty text="Select a destination manifest above." />
                            ) : destItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '28px 0', color: D.textDim, fontSize: '0.8rem' }}>
                                    <Package size={22} color={D.purpleBorder} style={{ marginBottom: 6 }} />
                                    <div>Empty manifest — ready to receive items.</div>
                                </div>
                            ) : (
                                destItems.map(item => (
                                    <ReadonlyItem key={item.id} item={item} />
                                ))
                            )}
                        </div>

                        {someSelected && destId && (
                            <>
                                <DeliveryDivider label={`+ ${selected.size} incoming`} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.6 }}>
                                    {sourceItems
                                        .filter(i => selected.has(i.id))
                                        .map(item => (
                                            <div key={item.id} style={{
                                                display:      'flex',
                                                alignItems:   'center',
                                                gap:          8,
                                                padding:      '7px 12px',
                                                borderRadius: D.radiusSm,
                                                background:   'rgba(168,85,247,0.08)',
                                                border:       `1px dashed ${D.purple}`,
                                                fontSize:     '0.78rem',
                                                color:        D.text,
                                            }}>
                                                <ArrowRight size={11} color={D.purple} style={{ flexShrink: 0 }} />
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {customerName(item)}
                                                </span>
                                                <span style={{ color: D.textDim, fontSize: '0.7rem' }}>
                                                    {item.order?.order_number}
                                                </span>
                                            </div>
                                        ))
                                    }
                                </div>
                            </>
                        )}
                    </Panel>
                </div>

                {/* ── manifest quick links footer ── */}
                {hasAnySelection && (
                    <div style={{ marginTop: 24 }}>
                        <div style={{
                            fontSize:      '0.72rem',
                            fontWeight:    700,
                            color:         D.textDim,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom:  10,
                        }}>
                            Selected manifests
                        </div>
                        <div style={{
                            display:  'flex',
                            gap:      'clamp(8px, 1.5vw, 14px)',
                            flexWrap: 'wrap',
                        }}>
                            {activeSource && (
                                <ManifestLinkChip
                                    manifest={activeSource}
                                    label="Source"
                                    navigate={navigate}
                                    onHover={audio.playHover}
                                />
                            )}
                            {activeDest && (
                                <ManifestLinkChip
                                    manifest={activeDest}
                                    label="Destination"
                                    navigate={navigate}
                                    onHover={audio.playHover}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* ── override modal ── */}
                {overrideModal && (
                    <OverrideModal
                        warning={overrideModal.warning}
                        driverName={overrideModal.driver_name}
                        onConfirm={(reason) => handleTransfer(reason)}
                        onCancel={() => { setOverrideModal(null); audio.playHover(); }}
                        audio={audio}
                    />
                )}

                {/* ── empty-source modal ── */}
                {emptySourceModal && (
                    <EmptySourceModal
                        manifestNumber={emptySourceModal.manifestNumber}
                        onDelete={handleDeleteEmpty}
                        onStay={() => {
                            setEmptySourceModal(null);
                            setSourceId('');
                            setSourceManifest(null);
                        }}
                        deleting={deleting}
                    />
                )}

                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    select option { background: #1e1b2e; color: #e2e8f0; }
                `}</style>

            </DeliveryPageShell>
        </GeneralLayout>
    );
}