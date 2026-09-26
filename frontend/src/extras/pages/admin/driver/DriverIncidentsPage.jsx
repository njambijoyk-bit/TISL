import { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle, Shield, CheckCircle, Clock, RefreshCw,
    ChevronDown, ChevronUp, Loader2, FileText,
} from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import deliveryAPI from '../../../../_shared/api/delivery';
import { useDeliveryAudio } from '../delivery/useDeliveryAudio';
import {
    D, DeliveryPageShell, DeliveryPageHeader,
    DeliveryCard, StatCard, StatsGrid, StatusBadge, SeverityBadge,
    DeliveryDivider, DeliveryBtn, DeliveryEmptyState,
} from '../delivery/DeliveryShared';

function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CATEGORY_LABELS = {
    late_delivery:      'Late delivery',
    damaged_goods:      'Damaged goods',
    wrong_address:      'Wrong address',
    customer_complaint: 'Customer complaint',
    driver_issue:       'Driver issue',
    other:              'Other',
};

// ── incident row ──────────────────────────────────────────────────────────────
function IncidentRow({ incident, expanded, onToggle, onHover }) {
    const catLabel = CATEGORY_LABELS[incident.category] ?? (incident.category ?? 'Other').replace(/_/g, ' ');

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
                    padding: 'clamp(12px, 2vw, 16px)',
                    cursor: 'pointer', flexWrap: 'wrap',
                }}
            >
                {/* severity dot */}
                <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: D.severityColors[incident.severity]?.text ?? '#94a3b8',
                    boxShadow: `0 0 6px ${D.severityColors[incident.severity]?.text ?? '#94a3b8'}`,
                    flexShrink: 0,
                }} />

                {/* content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text, marginBottom: 3 }}>
                        #{incident.reference_number ?? incident.id}
                        <span style={{
                            fontSize: '0.72rem', color: D.textDim, fontWeight: 500,
                            marginLeft: 8, textTransform: 'capitalize',
                        }}>
                            {catLabel}
                        </span>
                    </div>
                    {!incident.filed_by_me && (
                        <span style={{
                            fontSize: '0.65rem', padding: '1px 7px', borderRadius: 20, marginLeft: 8,
                            background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontWeight: 700,
                        }}>
                            Filed against you
                        </span>
                    )}
                    <div style={{ fontSize: '0.74rem', color: D.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(() => {
                            const text = incident.is_redacted ? (incident.redacted_description ?? '') : (incident.description ?? '');
                            return text.substring(0, 80) + (text.length > 80 ? '…' : '');
                        })()}
                    </div>
                </div>

                {/* badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <SeverityBadge severity={incident.severity} />
                    <StatusBadge status={incident.status} />
                    {expanded ? <ChevronUp size={14} color={D.textDim} /> : <ChevronDown size={14} color={D.textDim} />}
                </div>
            </div>

            {/* expanded details */}
            {expanded && (
                <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: 'clamp(12px, 2vw, 16px)' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                        gap: 14,
                    }}>
                        <div>
                            <Label>Category</Label>
                            <Value>{catLabel}</Value>
                        </div>
                        <div>
                            <Label>Severity</Label>
                            <SeverityBadge severity={incident.severity} />
                        </div>
                        <div>
                            <Label>Status</Label>
                            <StatusBadge status={incident.status} />
                        </div>
                        <div>
                            <Label>Reported against</Label>
                            <Value>{incident.filed_by_me ? (incident.accused?.name ?? '—') : 'You'}</Value>
                        </div>
                        {incident.filed_by_me && incident.manifest_number && (
                            <div>
                                <Label>Manifest</Label>
                                <Value>{incident.manifest_number}</Value>
                            </div>
                        )}
                        <div>
                            <Label>Reported</Label>
                            <Value>{fmtDate(incident.filed_at ?? incident.created_at)}</Value>
                        </div>
                        {incident.resolved_at && (
                            <div>
                                <Label>Resolved</Label>
                                <Value style={{ color: D.teal }}>{fmtDate(incident.resolved_at)}</Value>
                            </div>
                        )}
                        {incident.resolution_notes && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <Label>Resolution notes</Label>
                                <Value style={{ color: D.textMid }}>{incident.resolution_notes}</Value>
                            </div>
                        )}
                        {incident.admin_notes && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <Label>Note from admin</Label>
                                <div style={{
                                    padding: '10px 12px', borderRadius: D.radiusSm, marginTop: 4,
                                    background: 'rgba(251,146,60,0.07)',
                                    border: '1px solid rgba(251,146,60,0.3)',
                                    boxShadow: '0 0 10px rgba(251,146,60,0.15)',
                                    fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5,
                                }}>
                                    {incident.admin_notes}
                                </div>
                            </div>
                        )}
                    </div>
                    <div>
                        <Label>Description</Label>
                        <div style={{
                            padding: '10px 12px', borderRadius: D.radiusSm, marginTop: 4,
                            background: 'rgba(168,85,247,0.07)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            boxShadow: '0 0 10px rgba(168,85,247,0.2)',
                            fontSize: '0.82rem', color: D.purple, lineHeight: 1.5,
                        }}>
                            <Value>
                                {incident.is_redacted
                                    ? (incident.redacted_description ?? incident.description ?? '—')
                                    : (incident.description ?? '—')
                                }
                            </Value>
                        </div>
                    </div>
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

// ── main page ─────────────────────────────────────────────────────────────────
export default function DriverIncidentsPage() {
    const audio = useDeliveryAudio();

    const [incidents,  setIncidents]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,      setError]      = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    const fetchIncidents = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else         setRefreshing(true);
        setError(null);
        try {
            const res = await deliveryAPI.getDriverIncidents();
            // Response shape: { data: [...] }
            const incidentsData = Array.isArray(res) ? res : (res.data ?? []);
            setIncidents(incidentsData);
        } catch (err) {
            console.error('Driver incidents error:', err);
            setError('Failed to load incidents.');
            audio.playError();
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

    const handleRefresh = () => { audio.playHover(); fetchIncidents(true); };

    // Stats
    const openCount     = incidents.filter(i => i.status === 'open').length;
    const reviewCount   = incidents.filter(i => i.status === 'under_review').length;
    const resolvedCount = incidents.filter(i => i.status === 'resolved').length;
    const criticalOpen  = incidents.filter(i => i.severity === 'critical' && i.status === 'open').length;

    return (
        <GeneralLayout>
            <DeliveryPageShell audio={audio}>
                <DeliveryPageHeader
                    title="My Incidents"
                    sub="Incidents related to your deliveries"
                    actions={
                        <DeliveryBtn variant="ghost" size="sm" onClick={handleRefresh} onHover={audio.playHover} disabled={refreshing}>
                            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                        </DeliveryBtn>
                    }
                />

                {/* KPIs */}
                <StatsGrid cols={4}>
                    <StatCard label="Total" value={incidents.length} icon={FileText} accent={D.purple} />
                    <StatCard label="Open" value={openCount} sub="awaiting action" icon={AlertTriangle} accent={openCount > 0 ? '#ef4444' : D.purple} />
                    <StatCard label="Under review" value={reviewCount} icon={Clock} accent="#f59e0b" />
                    <StatCard label="Resolved" value={resolvedCount} icon={CheckCircle} accent={D.teal} />
                </StatsGrid>

                {criticalOpen > 0 && (
                    <div style={{
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: D.radiusSm, padding: '10px 14px',
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: '0.82rem', color: '#ef4444', fontWeight: 600,
                        marginBottom: 18,
                    }}>
                        <AlertTriangle size={14} />
                        {criticalOpen} critical incident{criticalOpen !== 1 ? 's' : ''} require{criticalOpen === 1 ? 's' : ''} your attention
                    </div>
                )}

                <DeliveryDivider label={`${incidents.length} incident${incidents.length !== 1 ? 's' : ''}`} />

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
                            icon={Shield}
                            title="All clear"
                            sub="No incidents have been filed against your deliveries."
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
                                onHover={audio.playHover}
                            />
                        ))}
                    </div>
                )}

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </DeliveryPageShell>
        </GeneralLayout>
    );
}
