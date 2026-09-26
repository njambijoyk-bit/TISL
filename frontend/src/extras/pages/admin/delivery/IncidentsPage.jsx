import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    AlertTriangle, Shield, CheckCircle, Clock, RefreshCw,
    Search, Filter, X, ChevronDown, ChevronUp, EyeOff, Printer,
    Loader2, FileText, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import deliveryAPI from '../../../../_shared/api/delivery';
import { useDeliveryAudio } from './useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
    DeliveryCard, StatCard, StatsGrid, StatusBadge, SeverityBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
    DriverAvatar,
} from './DeliveryShared';

const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'open',         label: 'Open'         },
    { value: 'under_review', label: 'Under review' },
    { value: 'resolved',     label: 'Resolved'     },
    { value: 'dismissed',    label: 'Dismissed'    },
];

const SEVERITY_OPTIONS = [
    { value: '',        label: 'All severities' },
    { value: 'low',      label: 'Low'      },
    { value: 'medium',   label: 'Medium'   },
    { value: 'high',     label: 'High'     },
    { value: 'critical', label: 'Critical' },
];

const CATEGORY_COLORS = {
    late_delivery:     '#f59e0b',
    damaged_goods:     '#ef4444',
    wrong_address:     '#3b82f6',
    customer_complaint:'#a855f7',
    driver_issue:      '#f97316',
    other:             '#94a3b8',
};

const PER_PAGE = 12;

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function printIncident(incident) {
    const id = 'incident-print-target';
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const severity = incident.severity ?? 'unknown';
    const severityColor = {
        low: '#059669', medium: '#d97706', high: '#dc2626', critical: '#7c3aed'
    }[severity] ?? '#94a3b8';

    const row = (label, value) => value
        ? `<tr><td style="padding:5px 10px 5px 0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:5px 0;font-size:13px;color:#111827;vertical-align:top">${value}</td></tr>`
        : '';

    const html = `
        <div id="${id}" style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:32px 24px;color:#111827">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #a855f7">
                <div>
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#a855f7;margin-bottom:4px">Incident Report</div>
                    <div style="font-size:20px;font-weight:800;color:#111827">${incident.manifest?.manifest_number ?? 'No manifest'}</div>
                </div>
                <div style="text-align:right;font-size:11px;color:#9ca3af">
                    <div>Printed: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
                    <div style="margin-top:4px">
                        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;background:${severityColor}18;color:${severityColor};border:1px solid ${severityColor}40">${severity}</span>
                        <span style="display:inline-block;margin-left:6px;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;background:#f3f4f6;color:#374151">${(incident.status ?? '').replace('_', ' ')}</span>
                    </div>
                </div>
            </div>

            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                ${row('Reported by', incident.reporter ? `${incident.reporter.name} <span style="color:#9ca3af">(${incident.reporter.role ?? 'unknown'})</span>` : '—')}
                ${row('Reported against', incident.accused?.name ?? 'None')}
                ${row('Category', (incident.category ?? '').replace('_', ' '))}
                ${row('Created', incident.created_at ? new Date(incident.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—')}
                ${incident.resolved_at ? row('Resolved', new Date(incident.resolved_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })) : ''}
                ${incident.resolver ? row('Resolved by', `${incident.resolver.name} #${incident.resolver.id}`) : ''}
            </table>

            <div style="margin-bottom:16px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:6px">Description</div>
                <div style="padding:12px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#111827">${incident.description ?? '—'}</div>
            </div>

            ${incident.is_redacted && incident.redacted_description ? `
            <div style="margin-bottom:16px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#dc2626;margin-bottom:6px">Redacted version (shown to driver/customer)</div>
                <div style="padding:12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;font-size:13px;line-height:1.6;color:#374151">${incident.redacted_description}</div>
            </div>` : ''}

            ${incident.admin_notes ? `
            <div style="margin-bottom:16px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:6px">Admin notes</div>
                <div style="padding:12px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;font-size:13px;line-height:1.6;color:#92400e">${incident.admin_notes}</div>
            </div>` : ''}

            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;gap:20px">
                <span>Driver visibility: <strong style="color:#111827">${incident.driver_can_see ? 'Visible' : 'Hidden'}</strong></span>
                <span>Customer visibility: <strong style="color:#111827">${incident.customer_can_see ? 'Visible' : 'Hidden'}</strong></span>
                <span>Redaction: <strong style="color:#111827">${incident.is_redacted ? 'Active' : 'None'}</strong></span>
            </div>
        </div>
    `;

    const container = document.createElement('div');
    container.id = id;
    container.innerHTML = html;
    container.style.cssText = 'display:none';
    document.body.appendChild(container);

    const style = document.createElement('style');
    style.id = 'incident-print-style';
    style.innerHTML = `
        @media print {
            body > *:not(#${id}) { display: none !important; }
            #${id} { display: block !important; }
        }
    `;
    document.head.appendChild(style);

    window.print();

    window.addEventListener('afterprint', () => {
        document.getElementById(id)?.remove();
        document.getElementById('incident-print-style')?.remove();
    }, { once: true });
}

// ── incident row ──────────────────────────────────────────────────────────────
function IncidentRow({ incident, expanded, onToggle, onUpdate, onHover, onVisibilityToggle, onOpenRedactModal }) {
    const catColor = CATEGORY_COLORS[incident.category] ?? D.textDim;

    return (
        <div style={{
            background: D.card,
            border: `1px solid ${expanded ? D.purple : D.purpleBorder}`,
            borderRadius: D.radius,
            overflow: 'hidden',
            transition: 'border-color 0.2s',
        }}>
            {/* header */}
            <div
                onClick={onToggle}
                onMouseEnter={onHover}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 'clamp(10px, 2vw, 14px) clamp(12px, 3vw, 16px)',
                    cursor: 'pointer',
                    flexWrap: 'wrap',
                }}
            >
                <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: D.severityColors[incident.severity]?.text ?? '#94a3b8',
                    boxShadow: `0 0 6px ${D.severityColors[incident.severity]?.text ?? '#94a3b8'}`,
                    flexShrink: 0,
                }} />

                <div style={{ gridColumn: '1 / -1' }}>
                    <Label>Description {incident.is_redacted && <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase', marginLeft: 6 }}>Redacted active</span>}</Label>
                    <Value style={{ padding: 10, borderRadius: 8, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                        {incident.description
                            ? incident.description.length > 100
                                ? incident.description.slice(0, 100) + '…'
                                : incident.description
                            : '—'}
                    </Value>
                    {incident.is_redacted && incident.redacted_description && (
                        <div style={{ marginTop: 8 }}>
                            <Label style={{ color: '#dc2626' }}>Redacted version (shown to driver/customer)</Label>
                            <Value style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', color: '#374151' }}>
                                {incident.redacted_description.length > 100
                                    ? incident.redacted_description.slice(0, 100) + '…'
                                    : incident.redacted_description}
                            </Value>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <SeverityBadge severity={incident.severity} />
                    <StatusBadge status={incident.status} />
                    {expanded ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />}
                </div>
            </div>

            {/* expanded */}
            {expanded && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: 'clamp(12px, 2vw, 16px)' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                        gap: 14,
                    }}>
                        <div>
                            <Label>Reported by</Label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <DriverAvatar name={incident.reporter?.name} size={26} />
                                <Value>{incident.reporter?.name ?? '—'} <span style={{ fontSize: '0.7rem', color: D.textDim }}>({incident.reporter?.role ?? incident.reporter_role ?? 'unknown'})</span></Value>
                            </div>
                        </div>
                        <div>
                            <Label>Reported against</Label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <DriverAvatar name={incident.accused?.name} size={26} />
                                <Value>{incident.accused?.name ?? '—'}</Value>
                            </div>
                        </div>
                        <div>
                            <Label>Manifest</Label>
                            <Value>{incident.manifest?.manifest_number ?? '—'}</Value>
                        </div>
                        <div>
                            <Label>Created</Label>
                            <Value>{fmtDate(incident.created_at)}</Value>
                        </div>
                        {incident.resolved_at && (
                            <div>
                                <Label>Resolved</Label>
                                <Value style={{ color: D.teal }}>{fmtDate(incident.resolved_at)}</Value>
                            </div>
                        )}
                        
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Label>Description</Label>
                        <Value style={{ 
                            padding: 10, borderRadius: 8, 
                            background: incident.is_redacted ? 'rgba(239,68,68,0.04)' : 'transparent',
                            border: incident.is_redacted ? '1px solid rgba(239,68,68,0.15)' : 'none',
                        }}>
                            {incident.description ?? '—'}
                            {incident.is_redacted && (
                                <span style={{ 
                                    display: 'inline-block', marginLeft: 8,
                                    fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4,
                                    background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                                    fontWeight: 700, textTransform: 'uppercase',
                                }}>
                                    Redacted
                                </span>
                            )}
                        </Value>
                    </div>
                    {incident.is_redacted && incident.redacted_description && (
                        <div style={{ marginTop: 8 }}>
                            <Label style={{ color: '#dc2626' }}>Redacted version (shown to driver/customer)</Label>
                            <Value style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', color: '#374151' }}>
                                {incident.redacted_description}
                            </Value>
                        </div>
                    )}

                    {/* Admin notes */}
                    <AdminNotesField incident={incident} onSave={onUpdate} onHover={onHover} />

                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: D.textDim }}>Status:</span>
                        <select
                            value={incident.status}
                            onChange={e => onUpdate(incident.id, e.target.value)}
                            style={{
                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, color: D.text,
                                fontSize: '0.82rem', padding: '6px 10px', outline: 'none', cursor: 'pointer',
                            }}
                        >
                            {['open', 'under_review', 'resolved', 'dismissed'].map(s => (
                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                            ))}
                        </select>
                    </div>

                    {/* Resolved by */}
                    {incident.status === 'resolved' && incident.resolver && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: D.radiusSm,
                            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <CheckCircle size={13} color={D.teal} />
                            <span style={{ fontSize: '0.75rem', color: D.teal, fontWeight: 600 }}>
                                Resolved by {incident.resolver.name}
                                <span style={{ fontWeight: 400, color: D.textDim, marginLeft: 6 }}>
                                    #{incident.resolver.id} · {fmtDate(incident.resolved_at)}
                                </span>
                            </span>
                        </div>
                    )}

                    {/* Visibility toggles */}
                    <div style={{ 
                        display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, 
                        borderTop: `1px solid ${D.purpleBorder}`, flexWrap: 'wrap',
                        alignItems: 'center',
                    }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: D.textDim, marginRight: 4 }}>
                            Visibility:
                        </span>
                        
                        {/* Driver can see */}
                        {(() => {
                            const roles = [incident.reporter?.role, incident.accused?.role].filter(Boolean);
                            const driverInvolved = roles.some(r => r === 'driver');
                            return (
                                <div title={!driverInvolved ? 'Does not involve a driver' : undefined} style={{ display: 'inline-flex' }}>
                                    <button
                                        onClick={driverInvolved ? () => onVisibilityToggle(incident.id, { driver_can_see: !incident.driver_can_see }) : undefined}
                                        onMouseEnter={driverInvolved ? onHover : undefined}
                                        disabled={!driverInvolved}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '4px 10px', borderRadius: 20,
                                            border: `1px solid ${!driverInvolved ? 'rgba(148,163,184,0.15)' : incident.driver_can_see ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)'}`,
                                            background: !driverInvolved ? 'transparent' : incident.driver_can_see ? 'rgba(16,185,129,0.08)' : 'transparent',
                                            color: !driverInvolved ? 'rgba(148,163,184,0.35)' : incident.driver_can_see ? '#059669' : D.textDim,
                                            fontSize: '0.72rem', fontWeight: 600,
                                            cursor: driverInvolved ? 'pointer' : 'not-allowed',
                                            opacity: driverInvolved ? 1 : 0.5,
                                        }}
                                    >
                                        {incident.driver_can_see ? <Eye size={12} /> : <EyeOff size={12} />}
                                        Driver {incident.driver_can_see ? 'can see' : 'hidden'}
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Customer can see */}
                        {(() => {
                            const roles = [incident.reporter?.role, incident.accused?.role].filter(Boolean);
                            const customerInvolved = roles.some(r => r === 'customer');
                            return (
                                <div title={!customerInvolved ? 'Does not involve a customer' : undefined} style={{ display: 'inline-flex' }}>
                                    <button
                                        onClick={customerInvolved ? () => onVisibilityToggle(incident.id, { customer_can_see: !incident.customer_can_see }) : undefined}
                                        onMouseEnter={customerInvolved ? onHover : undefined}
                                        disabled={!customerInvolved}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '4px 10px', borderRadius: 20,
                                            border: `1px solid ${!customerInvolved ? 'rgba(148,163,184,0.15)' : incident.customer_can_see ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)'}`,
                                            background: !customerInvolved ? 'transparent' : incident.customer_can_see ? 'rgba(16,185,129,0.08)' : 'transparent',
                                            color: !customerInvolved ? 'rgba(148,163,184,0.35)' : incident.customer_can_see ? '#059669' : D.textDim,
                                            fontSize: '0.72rem', fontWeight: 600,
                                            cursor: customerInvolved ? 'pointer' : 'not-allowed',
                                            opacity: customerInvolved ? 1 : 0.5,
                                        }}
                                    >
                                        {incident.customer_can_see ? <Eye size={12} /> : <EyeOff size={12} />}
                                        Customer {incident.customer_can_see ? 'can see' : 'hidden'}
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Redact toggle */}
                        <button
                            onClick={() => onOpenRedactModal(incident)}
                            onMouseEnter={onHover}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 20,
                                border: `1px solid ${incident.is_redacted ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.3)'}`,
                                background: incident.is_redacted ? 'rgba(239,68,68,0.08)' : 'transparent',
                                color: incident.is_redacted ? '#dc2626' : D.textDim,
                                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            <FileText size={12} />
                            {incident.is_redacted ? 'Redacted ✎' : 'Not redacted'}
                        </button>
                    </div>

                    {/* Status actions */}
                    {incident.status !== 'resolved' && incident.status !== 'dismissed' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {incident.status === 'open' && (
                                <DeliveryBtn
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => onUpdate(incident.id, 'under_review')}
                                    onHover={onHover}
                                >
                                    <Clock size={12} /> Mark under review
                                </DeliveryBtn>
                            )}
                            <DeliveryBtn
                                variant="primary"
                                size="sm"
                                onClick={() => onUpdate(incident.id, 'resolved')}
                                onHover={onHover}
                            >
                                <CheckCircle size={12} /> Resolve
                            </DeliveryBtn>
                            <DeliveryBtn
                                variant="ghost"
                                size="sm"
                                onClick={() => onUpdate(incident.id, 'dismissed')}
                                onHover={onHover}
                            >
                                <X size={12} /> Dismiss
                            </DeliveryBtn>
                        </div>
                    )}
                    <DeliveryBtn
                        variant="ghost"
                        size="sm"
                        onClick={() => printIncident(incident)}
                        onHover={onHover}
                        style={{ marginLeft: 'auto' }}
                    >
                        <Printer size={12} /> Print
                    </DeliveryBtn>
                </div>
            )}
        </div>
    );
}

function Label({ children, style = {} }) {
    return <div style={{ fontSize: '0.68rem', fontWeight: 600, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, ...style }}>{children}</div>;
}
function Value({ children, style = {} }) {
    return <div style={{ fontSize: '0.82rem', color: D.text, fontWeight: 500, ...style }}>{children}</div>;
}

function RedactModal({ incident, onClose, onSave, onUnredact }) {
    const [text, setText] = useState(incident.redacted_description ?? '');
    const [loading, setLoading] = useState(false);
    const MAX_CHARS = 2000;
    const overLimit = text.length > MAX_CHARS;

    const handleSave = async () => {
        if (!text.trim() || overLimit) return;

        setLoading(true);
        await onSave(incident.id, text.trim());
        setLoading(false);
    };

    const handleUnredact = async () => {
        setLoading(true);
        await onUnredact(incident.id);
        setLoading(false);
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: 'white', borderRadius: 20, width: '100%', maxWidth: 480,
                boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
            }}>
                <div style={{ height: 4, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />
                <div style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#111827' }}>
                        {incident.is_redacted ? 'Edit Redacted Description' : 'Redact Description'}
                    </h3>
                    <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af' }}>
                        This text is what drivers and customers will see when redaction is active.
                    </p>

                    {/* Original description for reference */}
                    <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#a855f7', marginBottom: 4 }}>
                            Original (admin only)
                        </div>
                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                            {incident.description
                                ? incident.description.length > 200
                                    ? incident.description.slice(0, 200) + '…'
                                    : incident.description
                                : '—'}
                        </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#c084fc', marginBottom: 6 }}>
                            Redacted version <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Write a sanitised version safe for drivers and customers to read…"
                            rows={4}
                            maxLength={2100}
                            style={{
                                width: '100%', resize: 'vertical', boxSizing: 'border-box',
                                border: `1px solid ${overLimit ? 'rgba(239,68,68,0.4)' : 'rgba(168,85,247,0.2)'}`,
                                borderRadius: 12,
                                padding: '10px 12px', fontSize: 13, color: '#111827',
                                outline: 'none', fontFamily: 'inherit',
                            }}
                        />
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', marginTop: 4,
                            fontSize: 11, fontWeight: 600,
                            color: overLimit ? '#dc2626' : text.length > 1800 ? '#d97706' : '#9ca3af',
                        }}>
                            {text.length} / {MAX_CHARS}
                            {overLimit && <span style={{ marginLeft: 6 }}>— too long</span>}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={onClose} disabled={loading} style={{
                            flex: 1, padding: '10px 14px', borderRadius: 12,
                            border: '1px solid #e5e7eb', background: 'transparent',
                            fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
                        }}>
                            Cancel
                        </button>
                        {incident.is_redacted && (
                            <button onClick={handleUnredact} disabled={loading} style={{
                                flex: 1, padding: '10px 14px', borderRadius: 12,
                                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
                                fontSize: 13, fontWeight: 600, color: '#dc2626', cursor: 'pointer',
                            }}>
                                Remove redaction
                            </button>
                        )}
                        <button onClick={handleSave} disabled={!text.trim() || loading || overLimit} style={{
                            flex: 2, padding: '10px 14px', borderRadius: 12, border: 'none',
                            background: text.trim() && !loading && !overLimit ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.2)',
                            color: text.trim() && !loading && !overLimit ? 'white' : '#a855f7',
                            fontSize: 13, fontWeight: 700, cursor: text.trim() && !loading && !overLimit ? 'pointer' : 'not-allowed',
                        }}>
                            {loading ? 'Saving…' : incident.is_redacted ? 'Update redaction' : 'Save redaction'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AdminNotesField({ incident, onSave, onHover }) {
    const [notes, setNotes] = useState(incident.admin_notes ?? '');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const dirty = notes !== (incident.admin_notes ?? '');

    const handleSave = async () => {
        setSaving(true);
        await onSave(incident.id, null, { admin_notes: notes });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${D.purpleBorder}` }}>
            <Label>Admin notes</Label>
            {incident.admin_notes && (
                <div style={{
                    padding: '10px 12px', borderRadius: D.radiusSm, marginBottom: 8, marginTop: 4,
                    background: 'rgba(251,146,60,0.07)', 
                    border: '1px solid rgba(251,146,60,0.3)',
                    boxShadow: '0 0 10px rgba(251,146,60,0.15)',
                    fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5,
                }}>
                    {incident.admin_notes}
                </div>
            )}
            <textarea
                value={notes}
                onChange={e => { setNotes(e.target.value); setSaved(false); }}
                onMouseEnter={onHover}
                placeholder="Internal notes — not visible to driver or customer…"
                rows={3}
                style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    background: 'rgba(168,85,247,0.03)', border: `1px solid ${D.purpleBorder}`,
                    borderRadius: D.radiusSm, color: D.text,
                    fontSize: '0.82rem', padding: '8px 10px', outline: 'none',
                    fontFamily: 'inherit', marginTop: 4,
                }}
            />
            {dirty && (
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        marginTop: 6, padding: '5px 14px', borderRadius: D.radiusSm,
                        border: 'none', background: D.purple, color: 'white',
                        fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save notes'}
                </button>
            )}
        </div>
    );
}

function CreateIncidentModal({ onClose, onSuccess, audio }) {
    const [manifestSearch, setManifestSearch]     = useState('');
    const [manifests,      setManifests]          = useState([]);
    const [searchingM,     setSearchingM]         = useState(false);
    const [selectedManifest, setSelectedManifest] = useState(null);
    const [participants,   setParticipants]       = useState([]);
    const [loadingP,       setLoadingP]           = useState(false);

    const [reportedByUserId,  setReportedByUserId]  = useState('');
    const [reportedAgainst,   setReportedAgainst]   = useState('');
    const [category,          setCategory]          = useState('');
    const [severity,          setSeverity]          = useState('medium');
    const [description,       setDescription]       = useState('');
    const [overrideReason,    setOverrideReason]    = useState('');
    const [needsOverride,     setNeedsOverride]     = useState(false);
    const [submitting,        setSubmitting]        = useState(false);
    const [error,             setError]             = useState(null);

    const searchTimer = useRef(null);

    const reporterIsAdmin = participants.find(p => p.user_id === Number(reportedByUserId))?.role === undefined
        && reportedByUserId === 'admin';

    const reporterParticipant = participants.find(p => p.user_id === Number(reportedByUserId));
    const isAdminReporter = reportedByUserId === 'admin';

    // Search manifests
    useEffect(() => {
        if (!manifestSearch.trim()) { setManifests([]); return; }
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            setSearchingM(true);
            try {
                const res = await deliveryAPI.getManifests({ search: manifestSearch, per_page: 8 });
                setManifests(res.data ?? []);
            } catch { setManifests([]); }
            finally { setSearchingM(false); }
        }, 350);
        return () => clearTimeout(searchTimer.current);
    }, [manifestSearch]);

    // Load participants when manifest selected
    useEffect(() => {
        if (!selectedManifest) { setParticipants([]); return; }
        setLoadingP(true);
        deliveryAPI.getManifestParticipants(selectedManifest.id)
            .then(res => setParticipants(res.participants ?? []))
            .catch(() => setParticipants([]))
            .finally(() => setLoadingP(false));
    }, [selectedManifest]);

    // Reset override when reporter changes
    useEffect(() => {
        setNeedsOverride(false);
        setOverrideReason('');
    }, [reportedByUserId]);

    const accusedOptions = participants.filter(p => p.user_id !== Number(reportedByUserId));

    const canSubmit = selectedManifest && reportedByUserId && category && severity
        && description.trim().length >= 20
        && (!isAdminReporter || (reportedAgainst && (!needsOverride || overrideReason.trim())));

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await deliveryAPI.createAdminIncident({
                manifest_id:         selectedManifest.id,
                reported_by_user_id: isAdminReporter ? 'admin' : String(reportedByUserId),
                reported_against:    reportedAgainst ? Number(reportedAgainst) : undefined,
                category,
                severity,
                description:         description.trim(),
                override_reason:     overrideReason.trim() || undefined,
            });
            onSuccess();
        } catch (e) {
            if (e?.response?.data?.requires_override) {
                setNeedsOverride(true);
                setError(e.response.data.message);
            } else {
                setError(e?.response?.data?.message ?? 'Failed to file incident.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: D.card, width: '100%', maxWidth: 560,
                borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
                overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
            }}>
                <div style={{ height: 4, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />

                {/* header */}
                <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${D.purpleBorder}`, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: D.purpleDim,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FileText size={16} color={D.purple} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: D.text }}>File Incident Report</div>
                                <div style={{ fontSize: '0.72rem', color: D.textDim }}>Admin — full access</div>
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: '1.2rem', padding: 4 }}>✕</button>
                    </div>
                </div>

                {/* body */}
                <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Visibility notice */}
                    <div style={{
                        padding: '10px 14px', borderRadius: D.radiusSm,
                        background: 'rgba(251,146,60,0.08)',
                        border: '1px solid rgba(251,146,60,0.35)',
                        boxShadow: '0 0 12px rgba(251,146,60,0.12)',
                        fontSize: '0.78rem', color: '#92400e', lineHeight: 1.6,
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                    }}>
                        <AlertTriangle size={14} color="#f97316" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>This incident will be <strong>hidden from all parties</strong> until you manually enable visibility from the incidents list.</span>
                    </div>

                    {/* Manifest search */}
                    <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                            Manifest <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        {selectedManifest ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '9px 12px', borderRadius: D.radiusSm,
                                border: `1px solid ${D.purple}`, background: D.purpleDim,
                            }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: D.purple }}>
                                    {selectedManifest.manifest_number}
                                    <span style={{ fontWeight: 400, color: D.textDim, marginLeft: 8, fontSize: '0.75rem' }}>
                                        {selectedManifest.scheduled_date}
                                    </span>
                                </span>
                                <button onClick={() => { setSelectedManifest(null); setParticipants([]); setReportedByUserId(''); setReportedAgainst(''); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, fontSize: '1rem' }}>✕</button>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <input
                                    value={manifestSearch}
                                    onChange={e => setManifestSearch(e.target.value)}
                                    placeholder="Search by manifest number…"
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        background: D.card, border: `1px solid ${D.purpleBorder}`,
                                        borderRadius: D.radiusSm, color: D.text,
                                        fontSize: '0.85rem', padding: '9px 11px', outline: 'none',
                                    }}
                                />
                                {(searchingM || manifests.length > 0) && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                                        background: D.card, border: `1px solid ${D.purpleBorder}`,
                                        borderRadius: D.radiusSm, marginTop: 4,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
                                    }}>
                                        {searchingM ? (
                                            <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Searching…
                                            </div>
                                        ) : manifests.length === 0 ? (
                                            <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: D.textDim }}>No manifests found</div>
                                        ) : manifests.map(m => (
                                            <div
                                                key={m.id}
                                                onClick={() => { setSelectedManifest(m); setManifestSearch(''); setManifests([]); }}
                                                style={{
                                                    padding: '10px 12px', cursor: 'pointer',
                                                    borderBottom: `1px solid ${D.purpleBorder}`,
                                                    fontSize: '0.82rem', color: D.text,
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = D.purpleDim}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div style={{ fontWeight: 600 }}>{m.manifest_number}</div>
                                                <div style={{ fontSize: '0.72rem', color: D.textDim, marginTop: 2 }}>
                                                    {m.scheduled_date} · {m.driver?.name ?? 'No driver'} · {m.items?.length ?? 0} stops
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Participants — only show after manifest selected */}
                    {selectedManifest && (
                        <>
                            {loadingP ? (
                                <div style={{ fontSize: '0.8rem', color: D.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} color={D.purple} /> Loading participants…
                                </div>
                            ) : (
                                <>
                                    {/* Reported by */}
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                                            Reported by <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <select
                                            value={reportedByUserId}
                                            onChange={e => { setReportedByUserId(e.target.value); setReportedAgainst(''); }}
                                            style={{
                                                width: '100%', boxSizing: 'border-box',
                                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                                borderRadius: D.radiusSm, color: D.text,
                                                fontSize: '0.85rem', padding: '9px 10px', outline: 'none', cursor: 'pointer',
                                            }}
                                        >
                                            <option value="">Select reporter…</option>
                                            <option value="admin">Admin (myself)</option>
                                            {participants.map(p => (
                                                <option key={p.user_id} value={p.user_id}>
                                                    {p.name} ({p.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Admin override warning */}
                                    {isAdminReporter && (
                                        <div style={{
                                            padding: '10px 14px', borderRadius: D.radiusSm,
                                            background: 'rgba(251,146,60,0.1)',
                                            border: '1px solid rgba(251,146,60,0.4)',
                                            boxShadow: '0 0 14px rgba(251,146,60,0.18)',
                                            fontSize: '0.78rem', color: '#92400e', lineHeight: 1.6,
                                            display: 'flex', gap: 8, alignItems: 'flex-start',
                                        }}>
                                            <AlertTriangle size={14} color="#f97316" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span>You are filing this incident <strong>as admin</strong>. The accused party will be notified that an admin has filed this report. An override reason is required.</span>
                                        </div>
                                    )}

                                    {/* Reported against */}
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                                            Reported against {isAdminReporter && <span style={{ color: '#ef4444' }}>*</span>}
                                        </label>
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
                                            <option value="">None (no specific person)</option>
                                            {accusedOptions.map(p => (
                                                <option key={p.user_id} value={p.user_id}>
                                                    {p.name} ({p.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Override reason — shown when admin is reporter OR after 409 */}
                                    {(isAdminReporter || needsOverride) && (
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#f97316', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                                                Override reason <span style={{ color: '#ef4444' }}>*</span>
                                            </label>
                                            <textarea
                                                value={overrideReason}
                                                onChange={e => setOverrideReason(e.target.value)}
                                                placeholder="Explain why you are filing this incident as admin…"
                                                rows={3}
                                                style={{
                                                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                                                    background: 'rgba(251,146,60,0.04)',
                                                    border: '1px solid rgba(251,146,60,0.3)',
                                                    borderRadius: D.radiusSm, color: D.text,
                                                    fontSize: '0.85rem', padding: '9px 10px', outline: 'none',
                                                    fontFamily: 'inherit',
                                                }}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* Category */}
                    <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                            Category <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                            {[
                                { value: 'misconduct',      label: 'Misconduct'      },
                                { value: 'rude_customer',   label: 'Rude Customer'   },
                                { value: 'security_issue',  label: 'Security Issue'  },
                                { value: 'road_condition',  label: 'Road Condition'  },
                                { value: 'assault',         label: 'Assault'         },
                                { value: 'property_damage', label: 'Property Damage' },
                                { value: 'other',           label: 'Other'           },
                            ].map(c => (
                                <button key={c.value} onClick={() => setCategory(c.value)} style={{
                                    padding: '8px 10px', borderRadius: D.radiusSm, cursor: 'pointer',
                                    border: `1px solid ${category === c.value ? D.purple : D.purpleBorder}`,
                                    background: category === c.value ? D.purpleDim : 'transparent',
                                    color: category === c.value ? D.purple : D.textMid,
                                    fontSize: '0.78rem', fontWeight: category === c.value ? 700 : 500,
                                    textAlign: 'left', transition: 'all 0.15s',
                                }}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Severity */}
                    <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: D.textDim, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                            Severity <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[
                                { value: 'low', color: '#059669' }, { value: 'medium', color: '#d97706' },
                                { value: 'high', color: '#dc2626' }, { value: 'critical', color: '#7c3aed' },
                            ].map(s => (
                                <button key={s.value} onClick={() => setSeverity(s.value)} style={{
                                    flex: 1, padding: '8px 4px', borderRadius: D.radiusSm, cursor: 'pointer',
                                    border: `1px solid ${severity === s.value ? s.color : D.purpleBorder}`,
                                    background: severity === s.value ? `${s.color}18` : 'transparent',
                                    color: severity === s.value ? s.color : D.textMid,
                                    fontSize: '0.75rem', fontWeight: severity === s.value ? 700 : 500,
                                    textTransform: 'capitalize', transition: 'all 0.15s',
                                }}>
                                    {s.value}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
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
                            padding: '10px 12px', borderRadius: D.radiusSm,
                            background: needsOverride ? 'rgba(251,146,60,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${needsOverride ? 'rgba(251,146,60,0.35)' : 'rgba(239,68,68,0.25)'}`,
                            boxShadow: needsOverride ? '0 0 12px rgba(251,146,60,0.15)' : 'none',
                            color: needsOverride ? '#92400e' : '#ef4444',
                            fontSize: '0.8rem', display: 'flex', gap: 8, alignItems: 'flex-start',
                        }}>
                            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
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
                                ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
                                : 'rgba(168,85,247,0.2)',
                            color: canSubmit && !submitting ? 'white' : D.purple,
                            fontSize: '0.9rem', fontWeight: 700,
                            cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        {submitting
                            ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Filing…</>
                            : <><FileText size={15} /> File incident report</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, onPage, onHover }) {
    if (!meta || meta.last_page <= 1) return null;
    const { current_page, last_page, from, to, total } = meta;

    const pages = [];
    let start = Math.max(1, current_page - 2);
    let end   = Math.min(last_page, current_page + 2);
    if (start > 1) pages.push('..start');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < last_page) pages.push('..end');

    const btnStyle = (active, disabled) => ({
        padding: '5px 10px', borderRadius: D.radiusSm,
        border: `1px solid ${active ? D.purple : D.purpleBorder}`,
        background: active ? D.purpleDim : 'transparent',
        color: active ? D.purple : D.textMid,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '0.78rem', fontWeight: active ? 700 : 400,
        opacity: disabled ? 0.4 : 1,
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${D.purpleBorder}` }}>
            <span style={{ fontSize: '0.75rem', color: D.textDim }}>{from}–{to} of {total} incidents</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={btnStyle(false, current_page === 1)} disabled={current_page === 1} onClick={() => { onHover(); onPage(current_page - 1); }}>
                    <ChevronLeft size={14} />
                </button>
                {pages.map((p, i) =>
                    typeof p === 'number' ? (
                        <button key={p} style={btnStyle(p === current_page, false)} onClick={() => { onHover(); onPage(p); }}>{p}</button>
                    ) : (
                        <span key={p + i} style={{ padding: '5px 4px', color: D.textDim, fontSize: '0.78rem' }}>…</span>
                    )
                )}
                <button style={btnStyle(false, current_page === last_page)} disabled={current_page === last_page} onClick={() => { onHover(); onPage(current_page + 1); }}>
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function IncidentsPage() {
    const navigate = useNavigate();
    const audio    = useDeliveryAudio();

    const [incidents,  setIncidents]  = useState([]);
    const [meta,       setMeta]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    const [filters, setFilters] = useState({ status: '', severity: '', search: '' });
    const [page, setPage] = useState(1);
    const [redactModal, setRedactModal] = useState(null); // { id, redacted_description, is_redacted }
    const [showCreateModal, setShowCreateModal] = useState(false);

    const searchTimer = useRef(null);
    const hasActiveFilters = filters.status || filters.severity || filters.search;

    const fetchIncidents = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const params = {
                page, per_page: PER_PAGE,
                ...(filters.status    && { status: filters.status }),
                ...(filters.severity  && { severity: filters.severity }),
                ...(filters.search    && { search: filters.search }),
            };
            const res = await deliveryAPI.getIncidents(params);
            setIncidents(res.data ?? []);
            setMeta(res.meta ?? null);
        } catch {
            setError('Failed to load incidents.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filters, page, audio]);

    const handleVisibilityToggle = async (id, updates) => {
        try {
            await deliveryAPI.updateIncident(id, updates);
            audio.playSuccess();
            fetchIncidents(true);
        } catch {
            audio.playError();
            toast.error('Failed to update visibility.');
        }
    };

    const handleRedactSave = async (id, redactedText) => {
        try {
            await deliveryAPI.updateIncident(id, {
                is_redacted: true,
                redacted_description: redactedText,
            });
            audio.playSuccess();
            setRedactModal(null);
            fetchIncidents(true);
            toast.success('Incident redacted.');
        } catch {
            audio.playError();
            toast.error('Failed to save redaction.');
        }
    };

    const handleUnredact = async (id) => {
        try {
            await deliveryAPI.updateIncident(id, {
                is_redacted: false,
                redacted_description: null,
            });
            audio.playSuccess();
            setRedactModal(null);
            fetchIncidents(true);
            toast.success('Redaction removed.');
        } catch {
            audio.playError();
            toast.error('Failed to remove redaction.');
        }
    };

    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setPage(1); fetchIncidents(); }, filters.search ? 350 : 0);
        return () => clearTimeout(searchTimer.current);
    }, [filters]);

    useEffect(() => { fetchIncidents(); }, [page]);

    const handleUpdateStatus = async (id, status, extra = {}) => {
        try {
            await deliveryAPI.updateIncident(id, { ...(status ? { status } : {}), ...extra });
            audio.playSuccess();
            fetchIncidents(true);
        } catch {
            audio.playError();
            toast.error('Failed to update incident.');
        }
    };

    const handleRedactToggle = async (id, updates) => {
        try {
            await deliveryAPI.updateIncident(id, updates);
            audio.playSuccess();
            fetchIncidents(true);
        } catch {
            audio.playError();
            toast.error('Failed to update visibility.');
        }
    };

    const handleClear = () => setFilters({ status: '', severity: '', search: '' });
    const handleRefresh = () => { audio.playHover(); fetchIncidents(true); };

    // Stats
    const openCount     = incidents.filter(i => i.status === 'open').length;
    const criticalCount = incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'dismissed').length;
    const resolvedToday = incidents.filter(i => {
        if (i.status !== 'resolved' || !i.resolved_at) return false;
        const d = new Date(i.resolved_at);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    }).length;

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryBreadcrumb
                    items={[{ label: 'Delivery', onClick: () => navigate('/admin/delivery') }, { label: 'Incidents' }]}
                    onHover={audio.playHover}
                />

                <DeliveryPageHeader
                    title="Incidents"
                    sub="Track and resolve delivery incidents"
                    actions={
                        <div style={{ display: 'flex', gap: 8 }}>
                            <DeliveryBtn variant="primary" size="sm" onClick={() => setShowCreateModal(true)} onHover={audio.playHover}>
                                <FileText size={13} /> File Report
                            </DeliveryBtn>
                            <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                                <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                                Refresh
                            </DeliveryBtn>
                        </div>
                    }
                />

                {/* KPIs */}
                <StatsGrid cols={4}>
                    <StatCard label="Total" value={meta?.total ?? incidents.length} icon={FileText} accent={D.purple} />
                    <StatCard label="Open" value={openCount} sub="awaiting action" icon={AlertTriangle} accent={openCount > 0 ? '#ef4444' : D.purple} />
                    <StatCard label="Critical" value={criticalCount} sub="unresolved" icon={Shield} accent={criticalCount > 0 ? '#ef4444' : D.purple} />
                    <StatCard label="Resolved today" value={resolvedToday} icon={CheckCircle} accent={D.teal} />
                </StatsGrid>

                {/* filters */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18, alignItems: 'flex-end' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
                        <Search size={13} color={D.textDim} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            value={filters.search}
                            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                            placeholder="Search incidents…"
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, color: D.text,
                                fontSize: '0.82rem', padding: '8px 10px 8px 28px', outline: 'none',
                            }}
                        />
                    </div>
                    <div style={{ flex: '0 1 160px', minWidth: 140 }}>
                        <select
                            value={filters.status}
                            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, color: D.text,
                                fontSize: '0.82rem', padding: '8px 10px', outline: 'none', cursor: 'pointer',
                            }}
                        >
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: '0 1 160px', minWidth: 140 }}>
                        <select
                            value={filters.severity}
                            onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: D.card, border: `1px solid ${D.purpleBorder}`,
                                borderRadius: D.radiusSm, color: D.text,
                                fontSize: '0.82rem', padding: '8px 10px', outline: 'none', cursor: 'pointer',
                            }}
                        >
                            {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    {hasActiveFilters && (
                        <DeliveryBtn variant="ghost" size="sm" onClick={handleClear} onHover={audio.playHover} style={{ flexShrink: 0 }}>
                            <X size={12} /> Clear
                        </DeliveryBtn>
                    )}
                </div>

                <DeliveryDivider label={meta ? `${meta.total} incident${meta.total !== 1 ? 's' : ''}` : 'Incidents'} />

                {/* list */}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 0', color: D.textDim }}>
                        <Loader2 size={18} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.85rem' }}>Loading incidents…</span>
                    </div>
                ) : error ? (
                    <DeliveryCard>
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#ef4444', fontSize: '0.9rem' }}>
                            {error}
                            <br /><br />
                            <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover}>
                                <RefreshCw size={13} /> Retry
                            </DeliveryBtn>
                        </div>
                    </DeliveryCard>
                ) : incidents.length === 0 ? (
                    <DeliveryCard>
                        <DeliveryEmptyState
                            icon={hasActiveFilters ? Filter : Shield}
                            title={hasActiveFilters ? 'No incidents match' : 'No incidents'}
                            sub={hasActiveFilters ? 'Adjust your filters.' : 'All clear — no incidents reported.'}
                            action={hasActiveFilters ? <DeliveryBtn variant="ghost" size="sm" onClick={handleClear} onHover={audio.playHover}><X size={12} /> Clear</DeliveryBtn> : null}
                        />
                    </DeliveryCard>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {incidents.map(inc => (
                            <IncidentRow
                                key={inc.id}
                                incident={inc}
                                expanded={expandedId === inc.id}
                                onToggle={() => { audio.playHover(); setExpandedId(expandedId === inc.id ? null : inc.id); }}
                                onUpdate={handleUpdateStatus}
                                onVisibilityToggle={handleVisibilityToggle}
                                onOpenRedactModal={(incident) => setRedactModal(incident)}
                                onHover={audio.playHover}
                            />
                        ))}
                    </div>
                )}

                {redactModal && (
                    <RedactModal
                        incident={redactModal}
                        onClose={() => setRedactModal(null)}
                        onSave={handleRedactSave}
                        onUnredact={handleUnredact}
                    />
                )}

                {showCreateModal && (
                    <CreateIncidentModal
                        onClose={() => setShowCreateModal(false)}
                        onSuccess={() => {
                            setShowCreateModal(false);
                            audio.playSuccess();
                            fetchIncidents(true);
                            toast.success('Incident filed successfully.');
                        }}
                        audio={audio}
                    />
                )}

                {!loading && !error && <Pagination meta={meta} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onHover={audio.playHover} />}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } } select option { background: #1e1b2e; color: #e2e8f0; }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}
