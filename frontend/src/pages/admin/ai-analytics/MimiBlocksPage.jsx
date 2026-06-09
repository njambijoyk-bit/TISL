import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Shield, Loader2, AlertCircle, ShieldOff, ShieldCheck,
    ChevronLeft, ChevronRight, Search, Plus, X, Clock,
    Infinity as InfinityIcon, User, Wifi,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import mimiAPI from '../../../api/mimiAPI';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── Helpers ────────────────────────────────────────────────────────────────────
const actorColor = a => ({ customer: C.purple, staff: C.cyan, guest_ip: C.textMid }[a] ?? C.textMid);
const actorIcon  = a => a === 'customer' ? User : a === 'staff' ? User : Wifi;

function Badge({ label, color }) {
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            padding: '2px 7px', borderRadius: 5,
            background: `${color}15`, border: `1px solid ${color}40`, color,
        }}>{label}</span>
    );
}

const fmtTime = iso => iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtExpiry = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    return d < new Date() ? 'EXPIRED' : d.toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' });
};

// ── Pagination ─────────────────────────────────────────────────────────────────
function Pagination({ meta, onPage, onHover }) {
    if (!meta || meta.last_page <= 1) return null;
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <span style={{ fontSize: '0.68rem', color: C.textDim, fontFamily: 'monospace' }}>
                {meta.from}–{meta.to} of {meta.total}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={meta.current_page === 1} onClick={() => onPage(meta.current_page - 1)} onMouseEnter={onHover}
                    style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: meta.current_page === 1 ? 'not-allowed' : 'pointer', opacity: meta.current_page === 1 ? 0.4 : 1 }}>
                    <ChevronLeft size={12} />
                </button>
                <span style={{ fontSize: '0.68rem', color: C.textMid, fontFamily: 'monospace', padding: '4px 8px' }}>
                    {meta.current_page} / {meta.last_page}
                </span>
                <button disabled={meta.current_page === meta.last_page} onClick={() => onPage(meta.current_page + 1)} onMouseEnter={onHover}
                    style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: meta.current_page === meta.last_page ? 'not-allowed' : 'pointer', opacity: meta.current_page === meta.last_page ? 0.4 : 1 }}>
                    <ChevronRight size={12} />
                </button>
            </div>
        </div>
    );
}

// ── Block actor modal ──────────────────────────────────────────────────────────
function BlockModal({ onClose, onSuccess, audio }) {
    const [form, setForm] = useState({
        actor_type: 'customer',
        customer_id: '',
        user_id: '',
        ip_address: '',
        reason: '',
        notes: '',
        expires_at: '',
    });
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState(null);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        setError(null);
        setSaving(true);
        try {
            const payload = {
                actor_type: form.actor_type,
                reason: form.reason || undefined,
                notes:  form.notes  || undefined,
                expires_at: form.expires_at || undefined,
            };
            if (form.actor_type === 'customer') payload.customer_id = parseInt(form.customer_id);
            if (form.actor_type === 'staff')    payload.user_id     = parseInt(form.user_id);
            if (form.actor_type === 'guest_ip') payload.ip_address  = form.ip_address;

            await mimiAPI.blockActor(payload);
            audio.playActivate();
            onSuccess();
        } catch (e) {
            setError(e?.response?.data?.message ?? 'Failed to block actor.');
            audio.playError();
        } finally {
            setSaving(false);
        }
    };

    const labelSt  = { fontSize: '0.65rem', fontWeight: 700, color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 };
    const inputSt  = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', colorScheme: 'dark' };
    const selectSt = { ...inputSt, cursor: 'pointer' };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 150ms ease',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                ...neuralCard, width: '100%', maxWidth: 480,
                padding: 28, margin: 16,
                border: `1px solid rgba(239,68,68,0.4)`,
                animation: 'fadeSlideIn 200ms ease',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldOff size={18} style={{ color: C.red, filter: `drop-shadow(0 0 6px ${C.red})` }} />
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>BLOCK ACTOR</span>
                    </div>
                    <button onClick={onClose} onMouseEnter={audio.playHover}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, display: 'flex', padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>

                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <AlertCircle size={13} style={{ color: C.red, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Actor type */}
                    <div>
                        <label style={labelSt}>Actor Type</label>
                        <select value={form.actor_type} onChange={e => set('actor_type', e.target.value)} style={selectSt}>
                            <option value="customer">Customer</option>
                            <option value="staff">Staff</option>
                            <option value="guest_ip">Guest IP</option>
                        </select>
                    </div>

                    {/* ID field — conditional */}
                    {form.actor_type === 'customer' && (
                        <div>
                            <label style={labelSt}>Customer ID</label>
                            <input type="number" value={form.customer_id} onChange={e => set('customer_id', e.target.value)} placeholder="e.g. 42" style={inputSt} />
                        </div>
                    )}
                    {form.actor_type === 'staff' && (
                        <div>
                            <label style={labelSt}>User ID</label>
                            <input type="number" value={form.user_id} onChange={e => set('user_id', e.target.value)} placeholder="e.g. 7" style={inputSt} />
                        </div>
                    )}
                    {form.actor_type === 'guest_ip' && (
                        <div>
                            <label style={labelSt}>IP Address</label>
                            <input type="text" value={form.ip_address} onChange={e => set('ip_address', e.target.value)} placeholder="e.g. 192.168.1.1" style={inputSt} />
                        </div>
                    )}

                    {/* Reason */}
                    <div>
                        <label style={labelSt}>Reason <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none' }}>(shown to user)</span></label>
                        <input type="text" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="e.g. Repeated policy violations" style={inputSt} maxLength={500} />
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={labelSt}>Internal Notes <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none' }}>(admin only)</span></label>
                        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional internal context…"
                            rows={2} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} maxLength={1000} />
                    </div>

                    {/* Expires at */}
                    <div>
                        <label style={labelSt}>
                            Expires At <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none' }}>(leave blank = permanent)</span>
                        </label>
                        <input type="datetime-local" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} style={inputSt} />
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} onMouseEnter={audio.playHover}
                        style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}>
                        CANCEL
                    </button>
                    <button onClick={handleSubmit} disabled={saving} onMouseEnter={audio.playHover}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 20px', borderRadius: 8,
                            border: `1px solid rgba(239,68,68,0.5)`,
                            background: 'rgba(239,68,68,0.12)', color: C.red,
                            fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700,
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                        }}>
                        {saving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ShieldOff size={13} />}
                        {saving ? 'BLOCKING…' : 'BLOCK ACTOR'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Unblock confirm ────────────────────────────────────────────────────────────
function UnblockConfirm({ block, onClose, onSuccess, audio }) {
    const [saving, setSaving] = useState(false);

    const handle = async () => {
        setSaving(true);
        try {
            await mimiAPI.unblock(block.id);
            audio.playDelete();
            onSuccess();
        } catch {
            audio.playError();
        } finally {
            setSaving(false);
        }
    };

    const name = block.customer
        ? `${block.customer.first_name} ${block.customer.last_name}`
        : block.user?.name ?? block.ip_address ?? 'Unknown';

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 150ms ease',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                ...neuralCard, width: '100%', maxWidth: 380, padding: 28, margin: 16,
                border: `1px solid rgba(16,185,129,0.4)`,
                animation: 'fadeSlideIn 200ms ease',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <ShieldCheck size={18} style={{ color: C.green, filter: `drop-shadow(0 0 6px ${C.green})` }} />
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>CONFIRM UNBLOCK</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: C.textMid, fontFamily: 'monospace', lineHeight: 1.6, marginBottom: 22 }}>
                    Remove the block on <span style={{ color: C.text, fontWeight: 700 }}>{name}</span>?
                    {block.reason && <><br /><span style={{ color: C.textDim, fontSize: '0.72rem' }}>Original reason: {block.reason}</span></>}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} onMouseEnter={audio.playHover}
                        style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}>
                        CANCEL
                    </button>
                    <button onClick={handle} disabled={saving} onMouseEnter={audio.playHover}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 20px', borderRadius: 8,
                            border: `1px solid rgba(16,185,129,0.5)`,
                            background: 'rgba(16,185,129,0.12)', color: C.green,
                            fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700,
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                        }}>
                        {saving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ShieldCheck size={13} />}
                        UNBLOCK
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function MimiBlocksPage() {
    const navigate  = useNavigate();
    const audio     = useAiPageAudio();
    const [ambientOn, setAmbientOn] = useState(false);
    const [blocks, setBlocks]       = useState(null);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [page, setPage]           = useState(1);
    const [filters, setFilters]     = useState({ active_only: 'true' });
    const [showBlockModal, setShowBlockModal]   = useState(false);
    const [unblockTarget, setUnblockTarget]     = useState(null);

    const load = async (p = 1) => {
        setLoading(true);
        setError(null);
        try {
            const res = await mimiAPI.getBlocks({ ...filters, page: p, per_page: 25 });
            setBlocks(res);
        } catch {
            setError('Failed to load blocked actors.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); setPage(1); }, [JSON.stringify(filters)]);

    const handlePage   = p => { setPage(p); load(p); };
    const handleFilter = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }));

    const navTabs = [
        { label: 'OVERVIEW',  path: '/admin/ai-analytics/mimi',  active: false  },
        { label: 'SESSIONS',  path: '/admin/ai-analytics/mimi-sessions',  active: false },
        { label: 'BLOCKS',    path: '/admin/ai-analytics/mimi-eligibility',    active: true },
        { label: 'HARMFUL',   path: '/admin/ai-analytics/mimi-harmful',   active: false },
    ];

    const thSt = { fontSize: '0.6rem', fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace', padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const tdSt = { padding: '10px 12px', fontSize: '0.75rem', color: C.text, fontFamily: 'monospace', borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: 'middle' };
    const selectSt = { padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, outline: 'none', fontFamily: 'monospace', cursor: 'pointer', colorScheme: 'dark' };

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>

                <NeuralBreadcrumb
                    onHover={audio.playHover}
                    items={[
                        { label: '⚙ SETTINGS',   onClick: () => navigate('/admin/settings/general') },
                        { label: 'AI ANALYTICS', onClick: () => navigate('/admin/ai-analytics') },
                        { label: 'MIMI BLOCKS' },
                    ]}
                />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <Shield size={32} style={{ color: C.red, filter: `drop-shadow(0 0 8px ${C.red})`, flexShrink: 0, marginTop: 4 }} />
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: '1.6rem', fontWeight: 800,
                                letterSpacing: '-0.02em', fontFamily: 'monospace',
                                background: `linear-gradient(135deg, ${C.red}, ${C.amber})`,
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>
                                BLOCKED ACTORS
                            </h1>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                                CUSTOMERS · STAFF · GUEST IPs · PERMANENT &amp; TEMPORARY
                            </p>
                        </div>
                    </div>
                    <button onClick={() => { audio.playActivate(); setShowBlockModal(true); }} onMouseEnter={audio.playHover}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '8px 18px', borderRadius: 9,
                            border: `1px solid rgba(239,68,68,0.5)`,
                            background: 'rgba(239,68,68,0.1)', color: C.red,
                            fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700,
                            cursor: 'pointer', letterSpacing: '0.06em',
                        }}>
                        <Plus size={14} /> BLOCK ACTOR
                    </button>
                </div>
                <NeuralDivider />

                {/* Nav pills */}
                <div style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
                    {navTabs.map(tab => (
                        <button key={tab.label} onClick={() => { audio.playHover(); navigate(tab.path); }}
                            style={{
                                padding: '6px 14px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700,
                                fontFamily: 'monospace', letterSpacing: '0.08em', cursor: 'pointer',
                                border: `1px solid ${tab.active ? C.red + '60' : C.border}`,
                                background: tab.active ? `${C.red}15` : 'transparent',
                                color: tab.active ? C.red : C.textDim,
                                transition: 'all 150ms',
                            }}
                        >{tab.label}</button>
                    ))}
                </div>

                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 20, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <AlertCircle size={15} style={{ color: C.red, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', color: C.red, fontFamily: 'monospace' }}>{error}</span>
                    </div>
                )}

                {/* Filters */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                    <select value={filters.actor_type ?? ''} onChange={e => handleFilter('actor_type', e.target.value)} style={selectSt}>
                        <option value="">All Actor Types</option>
                        <option value="customer">Customer</option>
                        <option value="staff">Staff</option>
                        <option value="guest_ip">Guest IP</option>
                    </select>
                    <select value={filters.active_only ?? 'true'} onChange={e => handleFilter('active_only', e.target.value)} style={selectSt}>
                        <option value="true">Active Blocks Only</option>
                        <option value="false">All Blocks</option>
                    </select>
                </div>

                {/* Stats row */}
                {!loading && blocks && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Total Shown', value: blocks.total ?? blocks.data?.length, color: C.red },
                            { label: 'Customers',   value: blocks.data?.filter(b => b.actor_type === 'customer').length, color: C.purple },
                            { label: 'Staff',       value: blocks.data?.filter(b => b.actor_type === 'staff').length, color: C.cyan },
                            { label: 'Guest IPs',   value: blocks.data?.filter(b => b.actor_type === 'guest_ip').length, color: C.textMid },
                            { label: 'Permanent',   value: blocks.data?.filter(b => !b.expires_at).length, color: C.amber },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', color: C.textDim, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>{value ?? 0}</span>
                            </div>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
                        <Loader2 size={20} style={{ color: C.red, animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '0.82rem', color: C.textDim, fontFamily: 'monospace', letterSpacing: '0.08em' }}>LOADING BLOCKS…</span>
                    </div>
                ) : (
                    <div style={{ ...neuralCard, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Actor', 'Type', 'Identifier', 'Reason', 'Blocked By', 'Blocked At', 'Expires', ''].map(h => (
                                            <th key={h} style={thSt}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {blocks?.data?.length === 0 && (
                                        <tr><td colSpan={8} style={{ ...tdSt, textAlign: 'center', color: C.textDim, padding: '60px 0' }}>
                                            <Shield size={28} style={{ color: C.textDim, display: 'block', margin: '0 auto 10px' }} />
                                            No blocked actors.
                                        </td></tr>
                                    )}
                                    {blocks?.data?.map(b => {
                                        const name = b.customer
                                            ? `${b.customer.first_name} ${b.customer.last_name}`
                                            : b.user?.name ?? '—';
                                        const identifier = b.actor_type === 'guest_ip'
                                            ? b.ip_address
                                            : b.actor_type === 'customer'
                                                ? `#${b.customer_id}`
                                                : `User #${b.user_id}`;
                                        const expiry = fmtExpiry(b.expires_at);
                                        const expired = expiry === 'EXPIRED';

                                        return (
                                            <tr key={b.id} style={{ transition: 'background 150ms', opacity: expired ? 0.5 : 1 }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; audio.playHover(); }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                                <td style={tdSt}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.is_active && !expired ? C.red : C.textDim, boxShadow: b.is_active && !expired ? `0 0 6px ${C.red}` : 'none', flexShrink: 0 }} />
                                                        <span style={{ fontWeight: 600 }}>{name}</span>
                                                    </div>
                                                </td>
                                                <td style={tdSt}><Badge label={b.actor_type} color={actorColor(b.actor_type)} /></td>
                                                <td style={{ ...tdSt, color: C.textDim, fontSize: '0.68rem' }}>{identifier}</td>
                                                <td style={{ ...tdSt, maxWidth: 200 }}>
                                                    <span style={{ fontSize: '0.72rem', color: C.textMid }}>{b.reason ?? <span style={{ color: C.textDim }}>—</span>}</span>
                                                </td>
                                                <td style={{ ...tdSt, color: C.textDim, fontSize: '0.7rem' }}>{b.blocked_by_user?.name ?? `#${b.blocked_by}`}</td>
                                                <td style={{ ...tdSt, color: C.textDim, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{fmtTime(b.blocked_at)}</td>
                                                <td style={tdSt}>
                                                    {b.expires_at ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <Clock size={11} style={{ color: expired ? C.textDim : C.amber }} />
                                                            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: expired ? C.textDim : C.amber }}>{expiry}</span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <InfinityIcon size={11} style={{ color: C.red }} />
                                                            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.red }}>PERMANENT</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={tdSt}>
                                                    {b.is_active && !expired && (
                                                        <button onClick={() => { audio.playHover(); setUnblockTarget(b); }}
                                                            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid rgba(16,185,129,0.4)`, background: 'rgba(16,185,129,0.08)', color: C.green, fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                            UNBLOCK
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: '8px 12px' }}>
                            <Pagination meta={blocks} onPage={handlePage} onHover={audio.playHover} />
                        </div>
                    </div>
                )}

            </NeuralPageShell>

            {showBlockModal && (
                <BlockModal
                    onClose={() => setShowBlockModal(false)}
                    onSuccess={() => { setShowBlockModal(false); load(1); }}
                    audio={audio}
                />
            )}

            {unblockTarget && (
                <UnblockConfirm
                    block={unblockTarget}
                    onClose={() => setUnblockTarget(null)}
                    onSuccess={() => { setUnblockTarget(null); load(page); }}
                    audio={audio}
                />
            )}

        </GeneralLayout>
    );
}
