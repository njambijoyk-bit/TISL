// pages/admin/delivery/AiManifestCreator.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Sparkles, Zap, FileText, ChevronLeft, ChevronRight,
    Loader2, CheckCircle, XCircle, AlertTriangle, SkipForward,
    Truck, Car, Store, Handshake, RefreshCw, Send,
    MessageSquare, Play, Route, User, Calendar,
    Brain, Shield, TrendingUp, Map, Package,
} from 'lucide-react';
import deliveryAPI from '../../../../_shared/api/delivery';
import {
    D, DeliveryCard, DeliveryDivider, DeliveryBtn, DriverAvatar,
} from './DeliveryShared';

// ── constants ──────────────────────────────────────────────────────────────────
const AI_MODES = { SELECT: 'select', ADVISORY_CONFIG: 'advisory_config', CREATOR_CONFIG: 'creator_config', LOADING: 'loading', ADVISORY_RESULT: 'advisory_result', CREATOR_RESULT: 'creator_result', IMPLEMENTING: 'implementing' };

const DELIVERY_METHODS = [
    { value: 'internal_driver',  label: 'Internal Driver',     icon: Truck,     color: D.purple  },
    { value: 'courier',          label: 'External Courier',    icon: Car,       color: '#3b82f6' },
    { value: 'customer_pickup',  label: 'Customer Pickup',     icon: Store,     color: '#10b981' },
    { value: 'third_party',      label: 'Third-Party Partner', icon: Handshake, color: '#f59e0b' },
];

const ORDER_STATUSES = [
    { value: 'confirmed',        label: 'Confirmed'        },
    { value: 'processing',       label: 'Processing'       },
    { value: 'ready_for_pickup', label: 'Ready for pickup' },
];

const PERIOD_OPTIONS = [
    { value: 7,  label: 'Last 7 days'  },
    { value: 14, label: 'Last 14 days' },
    { value: 30, label: 'Last 30 days' },
    { value: 60, label: 'Last 60 days' },
];

// Module metadata for the step log UI
const MODULE_META = {
    delivery_incident_analysis:  { label: 'Incident pattern detection', icon: Shield,     color: '#ef4444' },
    driver_performance:          { label: 'Driver performance analysis', icon: TrendingUp, color: '#3b82f6' },
    driver_assignment_safety:    { label: 'Driver-customer safety check', icon: Shield,    color: '#f59e0b' },
    delivery_manifest_generator: { label: 'AI manifest builder',         icon: Brain,      color: D.purple  },
    delivery_route_optimiser:    { label: 'Route optimisation',          icon: Map,        color: D.teal    },
};

const MAX_THREAD = 20;

// ── shared field styles ────────────────────────────────────────────────────────
const field = {
    label: { fontSize: '0.78rem', fontWeight: 600, color: D.textMid, display: 'block', marginBottom: 6 },
    input: { width: '100%', boxSizing: 'border-box', background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, color: D.text, fontSize: '0.85rem', padding: '9px 11px', outline: 'none' },
    error: { fontSize: '0.72rem', color: '#ef4444', marginTop: 4 },
};

function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Delivery method picker (self-contained, no DeliveryShared dependency) ─────
function MethodPicker({ value, onChange, onHover }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%,155px),1fr))', gap: 10 }}>
            {DELIVERY_METHODS.map(m => {
                const Icon     = m.icon;
                const selected = value === m.value;
                return (
                    <button key={m.value} onClick={() => onChange(m.value)} onMouseEnter={onHover}
                        style={{ background: selected ? `${m.color}15` : D.card, border: `2px solid ${selected ? m.color : D.purpleBorder}`, borderRadius: D.radiusSm, padding: '11px 13px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 7, color: D.text }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon size={16} color={m.color} />
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: selected ? m.color : D.text }}>{m.label}</span>
                        </div>
                        {selected && <div style={{ fontSize: '0.65rem', color: m.color, fontWeight: 600 }}>Selected</div>}
                    </button>
                );
            })}
        </div>
    );
}

// ── Status chips ───────────────────────────────────────────────────────────────
function StatusChips({ value, onChange, onHover }) {
    const toggle = (v) => onChange(
        value.includes(v) ? value.filter(s => s !== v) : [...value, v]
    );
    return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ORDER_STATUSES.map(s => {
                const on = value.includes(s.value);
                return (
                    <button key={s.value} onClick={() => { onHover(); toggle(s.value); }}
                        style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${on ? D.purple : D.purpleBorder}`, background: on ? D.purpleDim : 'transparent', color: on ? D.purple : D.textDim, fontSize: '0.75rem', fontWeight: on ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {s.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── Module step log ────────────────────────────────────────────────────────────
function StepLog({ steps, running }) {
    const allModules = Object.keys(MODULE_META);

    // Build display list: completed steps + any in-progress placeholder
    const completedKeys = steps.map(s => s.module);
    const nextModule    = allModules.find(k => !completedKeys.includes(k));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map(step => {
                const meta    = MODULE_META[step.module] ?? { label: step.module, icon: Brain, color: D.textDim };
                const Icon    = meta.icon;
                const success = step.status === 'success';
                const skipped = step.status === 'skipped';
                const failed  = step.status === 'failed';

                return (
                    <div key={step.module} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: success ? 'rgba(20,184,166,0.12)' : skipped ? 'rgba(148,163,184,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${success ? D.teal : skipped ? D.purpleBorder : '#ef4444'}`,
                        }}>
                            {success && <CheckCircle size={14} color={D.teal} />}
                            {skipped && <SkipForward  size={14} color={D.textDim} />}
                            {failed  && <XCircle      size={14} color="#ef4444" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                                <Icon size={13} color={meta.color} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: D.text }}>{meta.label}</span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 'auto',
                                    color: success ? D.teal : skipped ? D.textDim : '#ef4444',
                                }}>
                                    {step.status}
                                </span>
                            </div>
                            {step.reason && (
                                <div style={{ fontSize: '0.7rem', color: D.textDim, fontStyle: 'italic' }}>
                                    {step.reason === 'disabled' ? `${step.label ?? step.module} is disabled in AI settings` :
                                     step.reason === 'module_not_found' ? 'Module not configured' :
                                     step.reason === 'not_internal_driver' ? 'Skipped — not an internal driver manifest' :
                                     step.reason}
                                </div>
                            )}
                            {success && step.content && (
                                <div style={{ fontSize: '0.7rem', color: D.textDim, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                    {step.content.slice(0, 120)}{step.content.length > 120 ? '…' : ''}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* In-progress indicator for the next module */}
            {running && nextModule && (() => {
                const meta = MODULE_META[nextModule] ?? { label: nextModule, icon: Brain, color: D.textDim };
                const Icon = meta.icon;
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `${D.purple}08`, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.purpleDim, border: `1px solid ${D.purpleBorder}` }}>
                            <Loader2 size={14} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Icon size={13} color={meta.color} />
                            <span style={{ fontSize: '0.8rem', color: D.textMid }}>{meta.label}</span>
                            <span style={{ fontSize: '0.68rem', color: D.purple, fontWeight: 600 }}>running…</span>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

// ── Advisory panel ─────────────────────────────────────────────────────────────
function AdvisoryPanel({ content }) {
    return (
        <div style={{ background: `${D.purple}08`, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles size={15} color={D.purple} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: D.purple, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Advisory</span>
            </div>
            <div style={{ fontSize: '0.83rem', color: D.text, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {content}
            </div>
        </div>
    );
}

// ── Reiterate thread ───────────────────────────────────────────────────────────
function ReiterateThread({ thread, onSend, loading, onHover }) {
    const [msg, setMsg]   = useState('');
    const bottomRef       = useRef(null);
    const inputRef        = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [thread]);

    const handleSend = () => {
        const text = msg.trim();
        if (!text || loading) return;
        setMsg('');
        onSend(text);
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    return (
        <div style={{ marginTop: 16, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '10px 14px', background: D.purpleDim, borderBottom: `1px solid ${D.purpleBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={13} color={D.purple} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: D.purple }}>Reiterate with AI</span>
                <span style={{ fontSize: '0.7rem', color: D.textDim, marginLeft: 'auto' }}>
                    {thread.filter(m => m.role === 'user').length}/{MAX_THREAD} messages
                </span>
            </div>

            {/* Thread */}
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {thread.length === 0 && (
                    <div style={{ fontSize: '0.78rem', color: D.textDim, textAlign: 'center', padding: '20px 0' }}>
                        Ask the AI to refine, focus, or adjust the advisory above.
                    </div>
                )}
                {thread.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                            maxWidth: '85%',
                            padding: '9px 13px',
                            borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                            background: m.role === 'user' ? D.purpleDim : D.card,
                            border: `1px solid ${m.role === 'user' ? D.purple : D.purpleBorder}`,
                            fontSize: '0.8rem',
                            color: D.text,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                        }}>
                            {m.content}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: D.textDim, marginTop: 3, padding: '0 4px' }}>
                            {m.role === 'user' ? 'You' : 'AI'}
                        </span>
                    </div>
                ))}
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                        <Loader2 size={13} color={D.purple} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.78rem', color: D.textDim }}>AI is thinking…</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                    ref={inputRef}
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask AI to refine… (Enter to send)"
                    rows={2}
                    disabled={loading || thread.filter(m => m.role === 'user').length >= MAX_THREAD}
                    style={{ ...field.input, resize: 'none', flex: 1, fontSize: '0.82rem', padding: '8px 10px' }}
                />
                <DeliveryBtn
                    variant="primary"
                    size="sm"
                    onClick={handleSend}
                    onHover={onHover}
                    disabled={loading || !msg.trim() || thread.filter(m => m.role === 'user').length >= MAX_THREAD}
                    style={{ flexShrink: 0, alignSelf: 'flex-end' }}
                >
                    <Send size={13} />
                </DeliveryBtn>
            </div>
        </div>
    );
}

// ── Creator result preview ─────────────────────────────────────────────────────
function CreatorPreview({ data, suggestion, meta, onConfirm, onHover, confirming }) {
    const manifest = data?.data ?? data;
    const items    = manifest?.items ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Meta summary row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[
                    { icon: Calendar, label: 'Date',   value: fmtDate(meta?.scheduled_date)  },
                    { icon: Truck,    label: 'Method', value: meta?.delivery_method?.replace(/_/g, ' ') },
                    { icon: Package,  label: 'Orders', value: `${meta?.order_count} orders`  },
                    { icon: User,     label: 'Driver', value: manifest?.driver?.name ?? (meta?.driver_id ? `Driver #${meta.driver_id}` : 'AI-selected') },
                ].map(({ icon: Icon, label, value }) => (
                    <div key={label} style={{ flex: '1 1 130px', padding: '10px 14px', background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Icon size={12} color={D.textDim} />
                            <span style={{ fontSize: '0.68rem', color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: D.text }}>{value ?? '—'}</div>
                    </div>
                ))}
            </div>

            {/* Parse source warning */}
            {meta?.parse_source === 'fallback' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: D.radiusSm, fontSize: '0.75rem', color: '#f59e0b' }}>
                    <AlertTriangle size={13} />
                    AI response was not parseable as JSON — used all eligible orders in default sequence. Review before dispatching.
                </div>
            )}

            {/* Stop list */}
            {items.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: D.purple, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Stop sequence ({items.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((item, i) => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm }}>
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: D.purpleDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem', fontWeight: 700, color: D.purple }}>
                                    {i + 1}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>{item.order?.order_number ?? `Order #${item.order_id}`}</div>
                                    <div style={{ fontSize: '0.7rem', color: D.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.order?.customer ? `${item.order.customer.first_name} ${item.order.customer.last_name}` : '—'}
                                        {item.order?.shipping_address ? ` · ${item.order.shipping_address}` : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI reasoning */}
            {suggestion && (
                <AdvisoryPanel content={suggestion} />
            )}

            <DeliveryBtn variant="primary" size="md" onClick={onConfirm} onHover={onHover} disabled={confirming}
                style={{ alignSelf: 'flex-end' }}>
                {confirming
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                    : <><CheckCircle size={14} /> Confirm &amp; save manifest</>
                }
            </DeliveryBtn>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AiManifestCreator({ onBack, onSuccess, audio }) {
    const [screen,          setScreen]         = useState(AI_MODES.SELECT);
    const [aiMode,          setAiMode]         = useState(null);     // 'advisory' | 'creator'
    const [loading,         setLoading]        = useState(false);
    const [error,           setError]          = useState(null);

    // Shared config
    const [deliveryMethod, setDeliveryMethod]  = useState('internal_driver');

    // Advisory config
    const [periodDays,      setPeriodDays]     = useState(14);
    const [orderStatuses,   setOrderStatuses]  = useState(['confirmed', 'processing', 'ready_for_pickup']);
    const [driverHint,      setDriverHint]     = useState('');
    const [customPrompt,    setCustomPrompt]   = useState('');
    const [scheduledDate,   setScheduledDate]  = useState('');

    const [drivers,       setDrivers]      = useState([]);
    const [driversLoaded, setDriversLoaded] = useState(false);

    // Results
    const [steps,           setSteps]          = useState([]);
    const [suggestion,      setSuggestion]     = useState(null);
    const [resultMeta,      setResultMeta]     = useState(null);
    const [creatorData,     setCreatorData]    = useState(null);

    // Reiterate thread
    const [showThread,      setShowThread]     = useState(false);
    const [thread,          setThread]         = useState([]);
    const [threadLoading,   setThreadLoading]  = useState(false);

    // Creator confirm
    const [confirming,      setConfirming]     = useState(false);

    // fetch drivers when method switches to internal_driver
    useEffect(() => {
        if (deliveryMethod !== 'internal_driver' || driversLoaded) return;
        deliveryAPI.getActiveDrivers()
            .then(res => {
                // API returns { data: [...] } — adjust if yours differs
                setDrivers((res.data ?? res).slice(0, 100));
                setDriversLoaded(true);
            })
            .catch(() => setDriversLoaded(true)); // fail silently, field just stays empty
    }, [deliveryMethod, driversLoaded]);

    // ── Run advisory ──────────────────────────────────────────────────
    const runAdvisory = useCallback(async (advisoryContext = null, conversationHistory = null) => {
        setLoading(true);
        setError(null);
        setSteps([]);
        setScreen(AI_MODES.LOADING);

        try {
            const payload = {
                mode:                 'advisory',
                delivery_method:      deliveryMethod,
                order_period_days:    periodDays,
                order_statuses:       orderStatuses,
                ...(driverHint    && { driver_id:     parseInt(driverHint) }),
                ...(scheduledDate && { scheduled_date: scheduledDate }),
                ...(customPrompt  && { custom_prompt: customPrompt }),
                ...(advisoryContext       && { advisory_context:      advisoryContext }),
                ...(conversationHistory   && { conversation_history:  conversationHistory }),
            };

            const res = await deliveryAPI.aiCreateManifest(payload);

            setSteps(res.steps ?? []);
            setSuggestion(res.suggestion ?? '');
            setResultMeta(res.meta ?? null);
            setScreen(AI_MODES.ADVISORY_RESULT);
        } catch (e) {
            setError(e.response?.data?.message ?? 'AI advisory failed. Please try again.');
            setSteps(e.response?.data?.steps ?? []);
            setScreen(aiMode === 'advisory' ? AI_MODES.ADVISORY_CONFIG : AI_MODES.CREATOR_CONFIG);
        } finally {
            setLoading(false);
        }
    }, [deliveryMethod, periodDays, orderStatuses, driverHint, scheduledDate, customPrompt, aiMode]);

    // ── Run creator ───────────────────────────────────────────────────
    const runCreator = useCallback(async (advisoryContext = null) => {
        setLoading(true);
        setError(null);
        setSteps([]);
        setScreen(AI_MODES.LOADING);

        try {
            const payload = {
                mode:              'creator',
                delivery_method:   deliveryMethod,
                order_period_days: periodDays,
                order_statuses:    orderStatuses,
                ...(driverHint    && { driver_id:      parseInt(driverHint) }),
                ...(scheduledDate && { scheduled_date: scheduledDate }),
                ...(customPrompt  && { custom_prompt:  customPrompt }),
                ...(advisoryContext && { advisory_context: advisoryContext }),
            };

            const res = await deliveryAPI.aiCreateManifest(payload);

            setSteps(res.steps ?? []);
            setSuggestion(res.suggestion ?? '');
            setResultMeta(res.meta ?? null);
            setCreatorData(res);
            setScreen(AI_MODES.CREATOR_RESULT);
        } catch (e) {
            setError(e.response?.data?.message ?? 'AI manifest creation failed. Please try again.');
            setSteps(e.response?.data?.steps ?? []);
            setScreen(AI_MODES.CREATOR_CONFIG);
        } finally {
            setLoading(false);
        }
    }, [deliveryMethod, periodDays, orderStatuses, driverHint, scheduledDate, customPrompt]);

    // ── Reiterate send ────────────────────────────────────────────────
    const handleReiterateSend = useCallback(async (userMessage) => {
        const userTurn    = { role: 'user', content: userMessage };
        const nextThread  = [...thread, userTurn].slice(-MAX_THREAD);
        setThread(nextThread);
        setThreadLoading(true);

        try {
            const payload = {
                mode:                'advisory',
                delivery_method:     deliveryMethod,
                order_period_days:   periodDays,
                order_statuses:      orderStatuses,
                advisory_context:    suggestion,
                conversation_history: nextThread,
            };

            const res = await deliveryAPI.aiCreateManifest(payload);

            const aiContent  = res.suggestion ?? '';
            const assistantTurn = { role: 'assistant', content: aiContent };

            setThread(prev => [...prev, assistantTurn].slice(-MAX_THREAD));
            setSuggestion(aiContent);
            setSteps(res.steps ?? steps);
        } catch (e) {
            setThread(prev => [...prev, { role: 'assistant', content: '⚠️ Failed to get a response. Please try again.' }]);
        } finally {
            setThreadLoading(false);
        }
    }, [thread, deliveryMethod, periodDays, orderStatuses, suggestion, steps]);

    // ── AI Implement — bridge advisory → creator ──────────────────────
    const handleAiImplement = useCallback(() => {
        audio.playHover();
        setAiMode('creator');
        setShowThread(false);
        // Pass the latest advisory (including any reiterate refinements) as context
        const latestAdvisory = thread.length > 0
            ? thread.map(m => `${m.role === 'user' ? 'Admin' : 'AI'}: ${m.content}`).join('\n\n') + `\n\nFINAL ADVISORY:\n${suggestion}`
            : suggestion;
        runCreator(latestAdvisory);
    }, [audio, thread, suggestion, runCreator]);

    // ── Confirm creator result ────────────────────────────────────────
    const handleConfirm = useCallback(async () => {
        // Manifest was already created by the backend in creator mode.
        // Just navigate to it.
        const manifest = creatorData?.data?.data ?? creatorData?.data;
        if (manifest?.id) {
            setConfirming(true);
            audio.playHover();
            onSuccess(manifest.id);
        }
    }, [creatorData, audio, onSuccess]);

    // ── Shared config section ─────────────────────────────────────────
    const renderSharedConfig = () => (
        <div style={{ marginBottom: 20 }}>
            <label style={field.label}>Delivery method *</label>
            <MethodPicker
                value={deliveryMethod}
                onChange={v => {
                    setDeliveryMethod(v);
                    setDriverHint('');
                    if (v !== 'internal_driver') setDriversLoaded(false); // allow refetch if they come back
                }}
                onHover={audio.playHover}
            />
        </div>
    );

    const renderOrderConfig = () => (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                    <label style={field.label}>Order period</label>
                    <select value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))}
                        style={{ ...field.input, cursor: 'pointer' }}>
                        {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div>
                    <label style={field.label}>Scheduled date <span style={{ color: D.textDim, fontWeight: 400 }}>(optional — AI picks from order priority)</span></label>
                    <input type="date" value={scheduledDate} min={today()}
                        onChange={e => setScheduledDate(e.target.value)}
                        style={field.input} />
                </div>
            </div>

            <div style={{ marginBottom: 18 }}>
                <label style={field.label}>Include order statuses</label>
                <StatusChips value={orderStatuses} onChange={setOrderStatuses} onHover={audio.playHover} />
            </div>

            {/* Driver — required for internal, optional otherwise */}
            <div style={{ marginBottom: 18 }}>
                <label style={field.label}>
                    Driver
                    {deliveryMethod === 'internal_driver'
                        ? <span style={{ color: '#ef4444' }}> *</span>
                        : <span style={{ color: D.textDim, fontWeight: 400 }}> (optional — AI picks best match)</span>
                    }
                </label>

                {deliveryMethod === 'internal_driver' ? (
                    <select
                        value={driverHint}
                        onChange={e => setDriverHint(e.target.value)}
                        style={{ ...field.input, cursor: 'pointer' }}
                    >
                        <option value="">— Select a driver —</option>
                        {drivers.map(d => (
                            <option key={d.driver_id} value={d.driver_id}>
                                {d.name} (ID {d.driver_id})
                                {d.avg_rating ? ` · ★ ${d.avg_rating}` : ''}
                                {d.critical_incidents > 0 ? ` · ⚠ ${d.critical_incidents} critical` : ''}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        type="number"
                        value={driverHint}
                        onChange={e => setDriverHint(e.target.value)}
                        placeholder="Driver user ID (optional)…"
                        style={{ ...field.input, maxWidth: 220 }}
                    />
                )}
            </div>

            <div>
                <label style={field.label}>Custom instruction <span style={{ color: D.textDim, fontWeight: 400 }}>(optional)</span></label>
                <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="e.g. Prioritise Westlands area orders, avoid driver 12…"
                    rows={2} style={{ ...field.input, resize: 'vertical' }} />
            </div>
        </>
    );

    // ════════════════════════════════════════════════════════════════
    // ── Screens ──────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════

    // ── Mode select ───────────────────────────────────────────────────
    if (screen === AI_MODES.SELECT) {
        return (
            <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,260px),1fr))', gap: 'clamp(12px,3vw,20px)', marginTop: 8 }}>
                    {[
                        {
                            mode:  'advisory',
                            icon:  FileText,
                            color: D.purple,
                            title: 'Advisory mode',
                            desc:  'Set a period, statuses, and optional driver hint. AI analyses your fleet and orders, then recommends a manifest. You review, refine with back-and-forth chat, then decide.',
                        },
                        {
                            mode:  'creator',
                            icon:  Zap,
                            color: '#f59e0b',
                            title: 'Autopilot  mode',
                            desc:  'Pick a delivery method and let AI do everything — select orders, assign the best driver, set the date from order priority, and sequence stops. One click, manifest created. Note: Very High AI token usage!',
                        },
                    ].map(o => {
                        const Icon = o.icon;
                        return (
                            <button key={o.mode}
                                onClick={() => { audio.playHover(); setAiMode(o.mode); setScreen(o.mode === 'advisory' ? AI_MODES.ADVISORY_CONFIG : AI_MODES.CREATOR_CONFIG); }}
                                onMouseEnter={audio.playHover}
                                style={{ background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, padding: 'clamp(20px,4vw,28px)', cursor: 'pointer', textAlign: 'left', transition: 'box-shadow 0.2s, border-color 0.2s', color: D.text, display: 'flex', flexDirection: 'column', gap: 14 }}
                                onMouseOver={e => { e.currentTarget.style.boxShadow = D.purpleGlow; e.currentTarget.style.borderColor = o.color; }}
                                onMouseOut={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = D.purpleBorder; }}
                            >
                                <div style={{ width: 44, height: 44, borderRadius: D.radiusSm, background: `${o.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={22} color={o.color} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>{o.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: D.textDim, lineHeight: 1.55 }}>{o.desc}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: o.color, fontWeight: 600, marginTop: 4 }}>
                                    Choose this <ChevronRight size={14} />
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 20 }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={onBack} onHover={audio.playHover}>
                        <ChevronLeft size={14} /> Back
                    </DeliveryBtn>
                </div>
            </div>
        );
    }

    // ── Advisory config ───────────────────────────────────────────────
    if (screen === AI_MODES.ADVISORY_CONFIG) {
        return (
            <DeliveryCard>
                {error && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: D.radiusSm, fontSize: '0.8rem', color: '#ef4444' }}>
                        {error}
                    </div>
                )}

                {renderSharedConfig()}
                <DeliveryDivider label="Order selection" />
                {renderOrderConfig()}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={() => setScreen(AI_MODES.SELECT)} onHover={audio.playHover}>
                        <ChevronLeft size={14} /> Back
                    </DeliveryBtn>
                    <DeliveryBtn variant="primary" size="md"
                        onClick={() => { audio.playHover(); runAdvisory(); }}
                        onHover={audio.playHover}
                        disabled={orderStatuses.length === 0 || (deliveryMethod === 'internal_driver' && !driverHint)}
                    >
                        <Sparkles size={14} /> Generate advisory
                    </DeliveryBtn>
                </div>
            </DeliveryCard>
        );
    }

    // ── Creator config ────────────────────────────────────────────────
    if (screen === AI_MODES.CREATOR_CONFIG) {
        return (
            <DeliveryCard>
                {error && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: D.radiusSm, fontSize: '0.8rem', color: '#ef4444' }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: D.radiusSm, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <Zap size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: '0.78rem', color: '#f59e0b', lineHeight: 1.5 }}>
                        <strong>Autopilot mode.</strong> AI will select orders, assign the best available driver, set a date based on order priority, and sequence all stops. You only need to confirm after.
                    </span>
                </div>

                {renderSharedConfig()}

                {/* Driver hint — dropdown for internal, text input otherwise */}
                <div style={{ marginBottom: 18 }}>
                    <label style={field.label}>
                        Driver hint
                        <span style={{ color: D.textDim, fontWeight: 400 }}> (optional — AI picks best match)</span>
                    </label>

                    {deliveryMethod === 'internal_driver' ? (
                        <select
                            value={driverHint}
                            onChange={e => setDriverHint(e.target.value)}
                            style={{ ...field.input, cursor: 'pointer' }}
                        >
                            <option value="">— Nudge AI toward a driver (optional) —</option>
                            {drivers.map(d => (
                                <option key={d.driver_id} value={d.driver_id}>
                                    {d.name} (ID {d.driver_id})
                                    {d.avg_rating ? ` · ★ ${d.avg_rating}` : ''}
                                    {d.critical_incidents > 0 ? ` · ⚠ ${d.critical_incidents} critical` : ''}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="number"
                            value={driverHint}
                            onChange={e => setDriverHint(e.target.value)}
                            placeholder="Driver user ID to nudge AI toward…"
                            style={{ ...field.input, maxWidth: 220 }}
                        />
                    )}
                </div>

                <div style={{ marginBottom: 18 }}>
                    <label style={field.label}>Custom instruction <span style={{ color: D.textDim, fontWeight: 400 }}>(optional)</span></label>
                    <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                        placeholder="e.g. Focus on urgent orders in Mombasa CBD only…"
                        rows={2} style={{ ...field.input, resize: 'vertical' }} />
                </div>

                <DeliveryDivider label="Order pool" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 8 }}>
                    <div>
                        <label style={field.label}>Order period</label>
                        <select value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))}
                            style={{ ...field.input, cursor: 'pointer' }}>
                            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={field.label}>Include statuses</label>
                        <StatusChips value={orderStatuses} onChange={setOrderStatuses} onHover={audio.playHover} />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                    <DeliveryBtn variant="ghost" size="sm" onClick={() => setScreen(AI_MODES.SELECT)} onHover={audio.playHover}>
                        <ChevronLeft size={14} /> Back
                    </DeliveryBtn>
                    <DeliveryBtn variant="primary" size="md"
                        onClick={() => { audio.playHover(); runCreator(); }}
                        onHover={audio.playHover}
                        disabled={orderStatuses.length === 0}
                    >
                        <Zap size={14} /> Let AI build this manifest
                    </DeliveryBtn>
                </div>
            </DeliveryCard>
        );
    }

    // ── Loading ───────────────────────────────────────────────────────
    if (screen === AI_MODES.LOADING) {
        return (
            <DeliveryCard>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: D.purpleDim, border: `2px solid ${D.purpleBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <Brain size={24} color={D.purple} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: D.text, marginBottom: 4 }}>
                        {aiMode === 'creator' ? 'Building your manifest…' : 'Generating advisory…'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: D.textDim }}>
                        Running AI modules in sequence — this takes 1–5 minutes
                    </div>
                </div>

                <StepLog steps={steps} running={loading} />
            </DeliveryCard>
        );
    }

    // ── Advisory result ───────────────────────────────────────────────
    if (screen === AI_MODES.ADVISORY_RESULT) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DeliveryCard>
                    {/* Step log collapsed summary */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                            Analysis steps ({steps.filter(s => s.status === 'success').length}/{steps.length} succeeded)
                        </div>
                        <StepLog steps={steps} running={false} />
                    </div>

                    <DeliveryDivider />

                    <AdvisoryPanel content={suggestion} />

                    {/* Reiterate thread */}
                    {showThread && (
                        <ReiterateThread
                            thread={thread}
                            onSend={handleReiterateSend}
                            loading={threadLoading}
                            onHover={audio.playHover}
                        />
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <DeliveryBtn variant="ghost" size="sm"
                                onClick={() => { audio.playHover(); setScreen(AI_MODES.ADVISORY_CONFIG); }}
                                onHover={audio.playHover}>
                                <ChevronLeft size={14} /> Back
                            </DeliveryBtn>
                            <DeliveryBtn variant="ghost" size="sm"
                                onClick={() => { audio.playHover(); setShowThread(t => !t); }}
                                onHover={audio.playHover}>
                                <MessageSquare size={13} /> {showThread ? 'Hide' : 'Reiterate'}
                            </DeliveryBtn>
                            <DeliveryBtn variant="ghost" size="sm"
                                onClick={() => { audio.playHover(); runAdvisory(); }}
                                onHover={audio.playHover}
                                disabled={loading}>
                                <RefreshCw size={13} /> Regenerate
                            </DeliveryBtn>
                        </div>
                        <DeliveryBtn variant="primary" size="md"
                            onClick={handleAiImplement}
                            onHover={audio.playHover}>
                            <Zap size={14} /> AI implement
                        </DeliveryBtn>
                    </div>
                </DeliveryCard>
            </div>
        );
    }

    // ── Creator result ────────────────────────────────────────────────
    if (screen === AI_MODES.CREATOR_RESULT) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DeliveryCard>
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                            Analysis steps ({steps.filter(s => s.status === 'success').length}/{steps.length} succeeded)
                        </div>
                        <StepLog steps={steps} running={false} />
                    </div>

                    <DeliveryDivider />

                    <CreatorPreview
                        data={creatorData}
                        suggestion={suggestion}
                        meta={resultMeta}
                        onConfirm={handleConfirm}
                        onHover={audio.playHover}
                        confirming={confirming}
                    />

                    <div style={{ marginTop: 16 }}>
                        <DeliveryBtn variant="ghost" size="sm"
                            onClick={() => { audio.playHover(); setScreen(AI_MODES.CREATOR_CONFIG); setCreatorData(null); }}
                            onHover={audio.playHover}>
                            <ChevronLeft size={14} /> Adjust &amp; retry
                        </DeliveryBtn>
                    </div>
                </DeliveryCard>
            </div>
        );
    }

    return null;
}