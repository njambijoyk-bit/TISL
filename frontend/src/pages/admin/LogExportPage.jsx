import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Loader2, CheckSquare, Square, Calendar, FileSpreadsheet, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import ThemeSwitcher from '../../components/common/ThemeSwitcher';
import { logExportAPI } from '../../api';

// ── Design tokens (purple system) ────────────────────────────────────────────
const S = {
    bg:      'var(--bg-primary, #0f0f1a)',
    card:    'rgba(255,255,255,0.03)',
    border:  'rgba(168,85,247,0.15)',
    purple:  '#a855f7',
    purpleDim:'rgba(168,85,247,0.12)',
    text:    'var(--text-primary, #f1f1f1)',
    textDim: 'rgba(255,255,255,0.4)',
    textMid: 'rgba(255,255,255,0.65)',
    green:   '#22c55e',
    amber:   '#f59e0b',
    mono:    '"JetBrains Mono", "Fira Code", monospace',
};

const LOG_LABELS = {
    order_activity:         { label: 'Order Activity',          emoji: '📦' },
    auction_order_activity: { label: 'Auction Order Activity',  emoji: '🔨' },
    booking_activity:       { label: 'Booking Activity',        emoji: '📅' },
    hamper_activity:        { label: 'Hamper Activity',         emoji: '🎁' },
    leave:                  { label: 'Leave Logs',              emoji: '🏖️' },
    mimi_query:             { label: 'Mimi Query Logs',         emoji: '🤖' },
    policy_change:          { label: 'Policy Change Logs',      emoji: '📜' },
    referral_activity:      { label: 'Referral Activity',       emoji: '🔗' },
    dev_access_key:         { label: 'Dev Access Key Logs',     emoji: '🔑' },
    inventory_export:       { label: 'Inventory Export Logs',   emoji: '🏭' },
};

export default function LogExportPage() {
    const navigate = useNavigate();
    const [meta,        setMeta]        = useState([]);
    const [loadingMeta, setLoadingMeta] = useState(true);
    const [metaError,   setMetaError]   = useState('');

    // selection: { [key]: { selected, period_start, period_end, expanded } }
    const [selection,   setSelection]   = useState({});
    const [format,      setFormat]      = useState('xlsx');
    const [exporting,   setExporting]   = useState(false);
    const [exportError, setExportError] = useState('');
    const [exportDone,  setExportDone]  = useState(false);

    // ── Load meta ─────────────────────────────────────────────────
    useEffect(() => {
        logExportAPI.getMeta()
            .then(res => {
                const logs = res.data.logs || [];
                setMeta(logs);
                // init selection state
                const init = {};
                logs.forEach(l => {
                    init[l.key] = { selected: false, period_start: '', period_end: '', expanded: false };
                });
                setSelection(init);
            })
            .catch(() => setMetaError('Failed to load log metadata.'))
            .finally(() => setLoadingMeta(false));
    }, []);

    // ── Helpers ───────────────────────────────────────────────────
    const toggleSelect = (key) => {
        setSelection(prev => ({
            ...prev,
            [key]: { ...prev[key], selected: !prev[key].selected, expanded: !prev[key].selected ? true : prev[key].expanded },
        }));
    };

    const toggleExpand = (key) => {
        setSelection(prev => ({
            ...prev,
            [key]: { ...prev[key], expanded: !prev[key].expanded },
        }));
    };

    const setDate = (key, field, value) => {
        setSelection(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    const selectAll = () => {
        setSelection(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => { next[k] = { ...next[k], selected: true, expanded: true }; });
            return next;
        });
    };

    const clearAll = () => {
        setSelection(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => { next[k] = { ...next[k], selected: false }; });
            return next;
        });
    };

    const selectedKeys  = Object.entries(selection).filter(([, v]) => v.selected).map(([k]) => k);
    const allSelected   = meta.length > 0 && selectedKeys.length === meta.length;

    // ── Export ────────────────────────────────────────────────────
    const handleExport = async () => {
        if (selectedKeys.length === 0) return;
        setExporting(true);
        setExportError('');
        setExportDone(false);

        const logs = selectedKeys.map(key => ({
            key,
            period_start: selection[key].period_start || null,
            period_end:   selection[key].period_end   || null,
        }));

        try {
            const res = await logExportAPI.export(format, logs);
            const ext      = format === 'xlsx' ? 'xlsx' : 'csv';
            const mimeType = format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv';
            const blob     = new Blob([res.data], { type: mimeType });
            const url      = window.URL.createObjectURL(blob);
            const link     = document.createElement('a');
            link.href      = url;
            link.setAttribute('download', `logs_export_${new Date().toISOString().slice(0,10)}.${ext}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            setExportDone(true);
        } catch (e) {
            let msg = 'Export failed.';
            if (e.response?.data instanceof Blob) {
                try {
                    const text = await e.response.data.text();
                    msg = JSON.parse(text)?.message ?? msg;
                } catch {}
            }
            setExportError(msg);
        } finally {
            setExporting(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────
    return (
        <div style={{ minHeight: '100vh', background: S.bg, padding: '32px 24px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: 860, margin: '0 auto' }}>

                {/* Page header */}
                <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: '0.65rem', color: S.textDim, fontFamily: S.mono, letterSpacing: '0.12em', marginBottom: 6 }}>
                        ADMIN /{' '}
                        <span
                            onClick={() => navigate('/admin/logs')}
                            style={{ color: S.purple, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                        >
                            LOGS
                        </span>
                        {' '}/ EXPORTS
                    </div>
                    <ThemeSwitcher />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FileSpreadsheet size={24} style={{ color: S.purple }} />
                        <div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: S.purple, fontFamily: S.mono, letterSpacing: '0.04em' }}>
                                LOG EXPORT
                            </div>
                            <div style={{ fontSize: '0.68rem', color: S.textDim, fontFamily: S.mono }}>
                                Select logs, set date ranges, download
                            </div>
                        </div>
                    </div>
                </div>

                {/* Format picker + bulk controls */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 20, flexWrap: 'wrap', gap: 12,
                }}>
                    {/* Format */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.62rem', color: S.textDim, fontFamily: S.mono, letterSpacing: '0.08em' }}>FORMAT</span>
                        {[
                            { val: 'xlsx', icon: <FileSpreadsheet size={13} />, label: '.XLSX' },
                            { val: 'csv',  icon: <FileText size={13} />,        label: '.CSV'  },
                        ].map(f => (
                            <button key={f.val} onClick={() => setFormat(f.val)} style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '7px 14px', borderRadius: 7,
                                border: `1px solid ${format === f.val ? S.purple + '55' : 'rgba(255,255,255,0.1)'}`,
                                background: format === f.val ? S.purpleDim : 'rgba(0,0,0,0.2)',
                                color: format === f.val ? S.purple : S.textMid,
                                fontSize: '0.68rem', fontWeight: 700,
                                fontFamily: S.mono, cursor: 'pointer',
                                transition: 'all 150ms',
                            }}>
                                {f.icon} {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Bulk select */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={selectAll} style={ghostBtn}>SELECT ALL</button>
                        <button onClick={clearAll}  style={ghostBtn}>CLEAR</button>
                    </div>
                </div>

                {/* Error */}
                {metaError && (
                    <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontFamily: S.mono, fontSize: '0.72rem', marginBottom: 20 }}>
                        {metaError}
                    </div>
                )}

                {/* Log list */}
                {loadingMeta ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
                        <Loader2 size={22} style={{ color: S.purple, animation: 'spin 1s linear infinite' }} />
                        <span style={{ color: S.textDim, fontFamily: S.mono, fontSize: '0.72rem' }}>LOADING LOGS...</span>
                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                        {meta.map(log => {
                            const sel   = selection[log.key] || {};
                            const meta_ = LOG_LABELS[log.key] || { label: log.key, emoji: '📋' };
                            const isOn  = sel.selected;

                            return (
                                <div key={log.key} style={{
                                    borderRadius: 10,
                                    border: `1px solid ${isOn ? S.purple + '40' : 'rgba(255,255,255,0.07)'}`,
                                    background: isOn ? S.purpleDim : S.card,
                                    transition: 'all 150ms',
                                    overflow: 'hidden',
                                }}>
                                    {/* Row header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '14px 18px', cursor: 'pointer',
                                    }} onClick={() => toggleSelect(log.key)}>
                                        {/* Checkbox */}
                                        <div style={{ color: isOn ? S.purple : S.textDim, flexShrink: 0 }}>
                                            {isOn ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </div>

                                        {/* Emoji + label */}
                                        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{meta_.emoji}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isOn ? S.purple : S.text, fontFamily: S.mono }}>
                                                {meta_.label}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: S.textDim, fontFamily: S.mono }}>
                                                {log.table} · {log.row_count.toLocaleString()} records
                                            </div>
                                        </div>

                                        {/* Row count badge */}
                                        <div style={{
                                            padding: '3px 10px', borderRadius: 20,
                                            background: isOn ? S.purple + '22' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${isOn ? S.purple + '40' : 'rgba(255,255,255,0.08)'}`,
                                            fontSize: '0.62rem', fontWeight: 700,
                                            color: isOn ? S.purple : S.textDim,
                                            fontFamily: S.mono,
                                        }}>
                                            {log.row_count.toLocaleString()} rows
                                        </div>

                                        {/* Expand toggle — only when selected */}
                                        {isOn && (
                                            <button
                                                onClick={e => { e.stopPropagation(); toggleExpand(log.key); }}
                                                style={{ background: 'none', border: 'none', color: S.textDim, cursor: 'pointer', padding: 4 }}
                                            >
                                                {sel.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>
                                        )}
                                    </div>

                                    {/* Date range — shown when selected + expanded */}
                                    {isOn && sel.expanded && (
                                        <div style={{
                                            padding: '0 18px 18px',
                                            borderTop: `1px solid ${S.purple}20`,
                                        }}>
                                            <div style={{ fontSize: '0.6rem', color: S.textDim, fontFamily: S.mono, letterSpacing: '0.08em', margin: '14px 0 10px' }}>
                                                DATE RANGE (optional — leave blank for all records)
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                <div>
                                                    <div style={{ fontSize: '0.58rem', color: S.textDim, fontFamily: S.mono, marginBottom: 5, letterSpacing: '0.08em' }}>FROM</div>
                                                    <input
                                                        type="date"
                                                        value={sel.period_start}
                                                        onChange={e => setDate(log.key, 'period_start', e.target.value)}
                                                        style={dateInput(sel.period_start)}
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.58rem', color: S.textDim, fontFamily: S.mono, marginBottom: 5, letterSpacing: '0.08em' }}>TO</div>
                                                    <input
                                                        type="date"
                                                        value={sel.period_end}
                                                        onChange={e => setDate(log.key, 'period_end', e.target.value)}
                                                        style={dateInput(sel.period_end)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Export error */}
                {exportError && (
                    <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontFamily: S.mono, fontSize: '0.72rem', marginBottom: 16 }}>
                        {exportError}
                    </div>
                )}

                {/* Success */}
                {exportDone && (
                    <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', fontFamily: S.mono, fontSize: '0.72rem', marginBottom: 16 }}>
                        ✓ Export downloaded successfully.
                    </div>
                )}

                {/* Export button */}
                <button
                    onClick={handleExport}
                    disabled={exporting || selectedKeys.length === 0}
                    style={{
                        width: '100%', padding: '15px', borderRadius: 10,
                        border: `1px solid ${(exporting || selectedKeys.length === 0) ? 'rgba(255,255,255,0.08)' : S.purple + '55'}`,
                        background: (exporting || selectedKeys.length === 0) ? 'rgba(0,0,0,0.2)' : S.purpleDim,
                        color: (exporting || selectedKeys.length === 0) ? S.textDim : S.purple,
                        fontSize: '0.8rem', fontWeight: 800,
                        fontFamily: S.mono, letterSpacing: '0.1em',
                        cursor: (exporting || selectedKeys.length === 0) ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        transition: 'all 150ms',
                    }}
                >
                    {exporting ? (
                        <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> EXPORTING {selectedKeys.length} LOG{selectedKeys.length !== 1 ? 'S' : ''}...</>
                    ) : (
                        <><Download size={16} /> DOWNLOAD {selectedKeys.length > 0 ? `${selectedKeys.length} LOG${selectedKeys.length !== 1 ? 'S' : ''}` : 'LOGS'} AS {format.toUpperCase()}</>
                    )}
                </button>

                {selectedKeys.length > 0 && !exporting && (
                    <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.62rem', color: S.textDim, fontFamily: S.mono }}>
                        {selectedKeys.map(k => LOG_LABELS[k]?.label || k).join(' · ')}
                    </div>
                )}

            </div>
        </div>
    );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const ghostBtn = {
    padding: '6px 14px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.2)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.62rem', fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    cursor: 'pointer', letterSpacing: '0.06em',
};

const dateInput = (hasValue) => ({
    width: '100%', padding: '9px 12px',
    borderRadius: 7,
    border: `1px solid ${hasValue ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
    background: 'rgba(0,0,0,0.3)',
    color: '#f1f1f1', fontFamily: '"JetBrains Mono", monospace',
    fontSize: '0.76rem', outline: 'none',
    boxSizing: 'border-box', colorScheme: 'dark',
});