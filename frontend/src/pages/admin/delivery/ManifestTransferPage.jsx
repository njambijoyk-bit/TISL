import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, Package, RefreshCw, Loader2, CheckSquare,
    Square, AlertTriangle, CheckCircle, XCircle, Shuffle,
    ChevronDown, Trash2, ArrowLeftRight, ShieldAlert,
    ExternalLink, FileText,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import deliveryAPI from '../../../api/delivery';
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

// statuses allowed in source panel (left)
const TRANSFERABLE_STATUSES = ['draft', 'cancelled'];

const OVERRIDE_PRESETS = [
    'Manager approved',
    'Customer confirmed safe',
    'Emergency delivery',
    'Incident under investigation',
    'Other',
];

// ── SelectableItem row ────────────────────────────────────────────────────────
function SelectableItem({ item, selected, onToggle, disabled }) {
    return (
        <div
            onClick={() => !disabled && onToggle(item.id)}
            style={{
                display:        'flex',
                alignItems:     'center',
                gap:            10,
                padding:        '9px 12px',
                borderRadius:   D.radiusSm,
                background:     selected ? 'rgba(168,85,247,0.10)' : 'transparent',
                border:         `1px solid ${selected ? D.purple : 'transparent'}`,
                cursor:         disabled ? 'not-allowed' : 'pointer',
                transition:     'all 0.15s',
                opacity:        disabled ? 0.45 : 1,
            }}
        >
            <div style={{ flexShrink: 0, color: selected ? D.purple : D.textDim }}>
                {selected ? <CheckSquare size={15} /> : <Square size={15} />}
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

function statusColor(s) {
    return { delivered: D.teal, failed: '#ef4444', returned: '#f59e0b', out_for_delivery: D.purple }[s] ?? D.textDim;
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

// ── main page ─────────────────────────────────────────────────────────────────
export default function ManifestTransferPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    // all manifests (filtered for source: draft+cancelled; dest: draft only)
    const [allManifests, setAllManifests] = useState([]);
    const [loadingManifests, setLoadingManifests] = useState(true);

    // panel state
    const [sourceId,      setSourceId]      = useState('');
    const [destId,        setDestId]        = useState('');
    const [sourceManifest, setSourceManifest] = useState(null);
    const [destManifest,   setDestManifest]   = useState(null);
    const [loadingSource, setLoadingSource] = useState(false);
    const [loadingDest,   setLoadingDest]   = useState(false);

    // selection
    const [selected, setSelected] = useState(new Set());

    // transfer state
    const [transferring, setTransferring] = useState(false);
    const [transferError, setTransferError] = useState(null);
    const [transferSuccess, setTransferSuccess] = useState(null);

    // override modal state
    const [overrideModal, setOverrideModal] = useState(null); // { warning, driver_id, driver_name }

    // pre-flight safety warning (subtle badge)
    const [preflightWarning, setPreflightWarning] = useState(null); // { warning, driver_id, driver_name }

    // post-transfer empty-source modal
    const [emptySourceModal, setEmptySourceModal] = useState(null); // { manifestId, manifestNumber }
    const [deleting, setDeleting] = useState(false);

    // ── load manifest list ────────────────────────────────────────────────────
    const fetchManifestList = useCallback(async () => {
        setLoadingManifests(true);
        try {
            const res = await deliveryAPI.getManifests({ per_page: 200 });
            const data = res.data ?? res;
            const list = Array.isArray(data) ? data : (data.data ?? []);
            setAllManifests(list);
        } catch {
            setAllManifests([]);
        } finally {
            setLoadingManifests(false);
        }
    }, []);

    useEffect(() => { fetchManifestList(); }, [fetchManifestList]);

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
        // Only check when we have a destination with a driver, selected items, and no override already open
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

        if (orderIds.length === 0) {
            setPreflightWarning(null);
            return;
        }

        let cancelled = false;
        deliveryAPI.checkDriverSafety(destManifest.driver_id, orderIds)
            .then(res => {
                if (cancelled) return;
                if (res.warning) {
                    setPreflightWarning({
                        warning: res.warning,
                        driver_id: destManifest.driver_id,
                        driver_name: destManifest.driver?.name ?? 'Driver',
                    });
                } else {
                    setPreflightWarning(null);
                }
            })
            .catch(e => {
                if (cancelled) return;
                if (e.response?.status === 409) {
                    setPreflightWarning({
                        warning: e.response.data.warning,
                        driver_id: e.response.data.driver_id,
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
        const sourceItems = sourceManifest?.items ?? [];
        if (selected.size === sourceItems.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(sourceItems.map(i => i.id)));
        }
        audio.playHover();
    };

    // ── transfer ──────────────────────────────────────────────────────────────
    const handleTransfer = async (overrideReason = null) => {
        if (selected.size === 0 || !destId || !sourceId || sourceId === destId) return;

        // If pre-flight flagged a warning and no override provided yet, open modal
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
            if (overrideReason) {
                payload.override_reason = overrideReason;
            }

            const res = await deliveryAPI.transferManifestItems(payload);
            audio.playSuccess();
            const msg = res.message ?? `${selected.size} item(s) transferred.`;
            setTransferSuccess(msg);
            setOverrideModal(null);
            setPreflightWarning(null);

            // check if source is now empty
            const updatedSources = res.sources ?? [];
            const srcAfter = updatedSources.find(m => String(m.id) === String(sourceId));
            const srcEmpty = srcAfter && (srcAfter.items?.length === 0);

            // refresh destination
            setDestManifest(res.destination ?? destManifest);

            if (srcEmpty) {
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

            fetchManifestList();
        } catch (e) {
            const status = e.response?.status;
            const data   = e.response?.data;

            if (status === 409 && data?.requires_override) {
                setOverrideModal({
                    warning: data.warning,
                    driver_id: data.driver_id,
                    driver_name: data.driver_name ?? 'Driver',
                });
            } else {
                const errMsg = data?.message ?? 'Transfer failed. Please try again.';
                setTransferError(errMsg);
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
    const sourceManifests = allManifests.filter(m => TRANSFERABLE_STATUSES.includes(m.status));
    const destManifests   = allManifests.filter(m => m.status === 'draft');

    const sourceItems = sourceManifest?.items ?? [];
    const destItems   = destManifest?.items ?? [];

    const allSelected  = sourceItems.length > 0 && selected.size === sourceItems.length;
    const someSelected = selected.size > 0;

    const canTransfer = someSelected && destId && sourceId && sourceId !== destId && !transferring;

    const sameManifestError = sourceId && destId && sourceId === destId;

    // Determine which manifests to show links for
    const hasAnySelection = sourceId || destId;
    const activeSource = sourceManifest;
    const activeDest   = destManifest;

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
                    sub="Move stops between draft or cancelled manifests"
                    actions={
                        <DeliveryBtn
                            variant="ghost"
                            size="sm"
                            onClick={() => { audio.playHover(); fetchManifestList(); }}
                            onHover={audio.playHover}
                            disabled={loadingManifests}
                        >
                            <RefreshCw size={13} style={loadingManifests ? { animation: 'spin 1s linear infinite' } : {}} />
                        </DeliveryBtn>
                    }
                />

                {/* ── success banner ── */}
                {transferSuccess && !emptySourceModal && (
                    <div style={{
                        background:    'rgba(20,184,166,0.1)',
                        border:        '1px solid rgba(20,184,166,0.3)',
                        borderRadius:  D.radiusSm,
                        padding:       '10px 14px',
                        color:         D.teal,
                        fontSize:      '0.82rem',
                        marginBottom:  16,
                        display:       'flex',
                        alignItems:    'center',
                        gap:           8,
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
                    display:   'flex',
                    gap:       'clamp(12px, 2vw, 20px)',
                    alignItems: 'flex-start',
                    flexWrap:  'wrap',
                }}>

                    {/* ── LEFT: source panel ── */}
                    <Panel
                        title="Move from"
                        sub="Draft or cancelled manifests"
                        accent={someSelected ? D.purple : D.purpleBorder}
                    >
                        <ManifestSelect
                            label="Source manifest"
                            manifests={sourceManifests}
                            value={sourceId}
                            onChange={v => { setSourceId(v); setTransferError(null); setTransferSuccess(null); }}
                            placeholder="Select source manifest…"
                            loading={loadingManifests}
                        />

                        {/* select all row */}
                        {sourceItems.length > 0 && (
                            <div
                                onClick={toggleAll}
                                style={{
                                    display:       'flex',
                                    alignItems:    'center',
                                    gap:           8,
                                    padding:       '6px 12px',
                                    marginBottom:  6,
                                    cursor:        'pointer',
                                    borderRadius:  D.radiusSm,
                                    background:    allSelected ? 'rgba(168,85,247,0.07)' : 'transparent',
                                }}
                            >
                                <div style={{ color: allSelected ? D.purple : D.textDim }}>
                                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: D.textMid }}>
                                    {allSelected ? 'Deselect all' : `Select all (${sourceItems.length})`}
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
                                        disabled={false}
                                    />
                                ))
                            )}
                        </div>
                    </Panel>

                    {/* ── MIDDLE: transfer button (desktop vertical center, mobile horizontal) ── */}
                    <div style={{
                        display:        'flex',
                        flexDirection:  'column',
                        alignItems:     'center',
                        justifyContent: 'center',
                        gap:            10,
                        paddingTop:     'clamp(56px, 8vw, 80px)',
                        flexShrink:     0,
                    }}>
                        {/* item count pill */}
                        {someSelected && (
                            <div style={{
                                background:   'rgba(168,85,247,0.15)',
                                border:       `1px solid ${D.purpleBorder}`,
                                borderRadius:  D.radiusSm,
                                padding:      '3px 10px',
                                fontSize:     '0.72rem',
                                fontWeight:   700,
                                color:        D.purple,
                                whiteSpace:   'nowrap',
                            }}>
                                {selected.size} item{selected.size !== 1 ? 's' : ''}
                            </div>
                        )}

                        {/* pre-flight warning badge */}
                        {preflightWarning && someSelected && (
                            <div
                                onClick={() => setOverrideModal(preflightWarning)}
                                title="Click to review and override"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '5px 10px',
                                    borderRadius: D.radiusSm,
                                    background: 'rgba(245,158,11,0.12)',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    color: '#f59e0b',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s',
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

                        {/* swap dropdowns shortcut */}
                        {sourceId && destId && sourceId !== destId && (
                            <button
                                onClick={() => {
                                    const destIsTransferable = TRANSFERABLE_STATUSES.includes(
                                        allManifests.find(m => String(m.id) === String(destId))?.status
                                    );
                                    if (!destIsTransferable) return;
                                    const tmp = sourceId;
                                    setSourceId(destId);
                                    setDestId(tmp);
                                    setSelected(new Set());
                                    audio.playHover();
                                }}
                                title="Swap source and destination"
                                style={{
                                    background: 'transparent',
                                    border:     `1px solid ${D.purpleBorder}`,
                                    borderRadius: D.radiusSm,
                                    padding:    '5px 8px',
                                    cursor:     'pointer',
                                    color:      D.textDim,
                                    display:    'flex',
                                    alignItems: 'center',
                                }}
                            >
                                <ArrowLeftRight size={13} />
                            </button>
                        )}
                    </div>

                    {/* ── RIGHT: destination panel ── */}
                    <Panel
                        title="Move to"
                        sub="Draft manifests only"
                        accent={destId ? D.purpleBorder : D.purpleBorder}
                    >
                        <ManifestSelect
                            label="Destination manifest"
                            manifests={destManifests.filter(m => String(m.id) !== String(sourceId))}
                            value={destId}
                            onChange={v => { setDestId(v); setTransferError(null); setTransferSuccess(null); }}
                            placeholder="Select destination manifest…"
                            loading={loadingManifests}
                        />

                        {/* destination stats */}
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

                        {/* incoming preview */}
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
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: D.textDim,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: 10,
                        }}>
                            Selected manifests
                        </div>
                        <div style={{
                            display: 'flex',
                            gap: 'clamp(8px, 1.5vw, 14px)',
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
