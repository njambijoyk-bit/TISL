import { useState, useEffect } from 'react';
import {
    KeyRound, RefreshCw, Loader2, AlertCircle, Shield, Check, CheckCircle2, XCircle,
    Clock, ChevronLeft, ChevronRight, Eye, EyeOff, Copy, Volume2, VolumeX,
} from 'lucide-react';
import '../../styles/bug.css';
import GeneralLayout from '../../components/layout/GeneralLayout';
import { adminGetActiveKey, adminRegenerateKey, adminGetKeyLogs } from '../../api/bugReportsAPI';
import { useBugAudio } from './settings/useBugAudio';

function KeyDisplay({ keyData, onRegenerate, regenerating, audio }) {
    const [copied,  setCopied]  = useState(false);
    const [visible, setVisible] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(keyData.raw_key);
        setCopied(true);
        audio.playPing();
        setTimeout(() => setCopied(false), 2000);
    };

    const usedPercent = Math.round((keyData.failed_attempts / 10) * 100);
    const urgency = keyData.remaining <= 3 ? 'bug-text-red'
        : keyData.remaining <= 6 ? 'bug-text-amber'
        : 'bug-text-green';

    return (
        <div className="bug-card" style={{ padding: 24 }}>
            <div className="bug-flex bug-items-center bug-justify-between">
                <div className="bug-flex bug-items-center bug-gap-2">
                    <div className="bug-icon-box bug-icon-box-sm bug-icon-box-emerald">
                        <Shield size={16} />
                    </div>
                    <div>
                        <p className="bug-text-sm bug-font-semibold bug-text">Active Dev Key</p>
                        <p className="bug-text-xs bug-text-muted">
                            Generated {new Date(keyData.generated_at).toLocaleString()}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onRegenerate}
                    onMouseEnter={audio.playHover}
                    disabled={regenerating}
                    className="bug-btn"
                    style={{ fontSize: 14 }}
                >
                    <RefreshCw size={13} className={regenerating ? 'bug-animate-spin' : ''} />
                    Regenerate
                </button>
            </div>

            {/* Key display */}
            <div className="bug-key-box">
                <div className="bug-flex bug-items-center bug-justify-between bug-gap-3">
                    <div className="bug-flex-col bug-gap-1 bug-min-w-0">
                        <p className="bug-text-xs bug-text-muted" style={{ marginBottom: 4 }}>Raw Key (share with dev)</p>
                        <p className="bug-key-text bug-text-sm bug-text">
                            {visible ? keyData.raw_key : keyData.raw_key.slice(0, 6) + '••••••••••••••'}
                        </p>
                    </div>
                    <div className="bug-flex bug-items-center bug-gap-1" style={{ flexShrink: 0 }}>
                        <button
                            onClick={() => { setVisible(v => !v); audio.playClick(); }}
                            onMouseEnter={audio.playHover}
                            className="bug-copy-btn"
                            style={{ padding: 8, borderRadius: 8 }}
                            title={visible ? 'Hide key' : 'Show key'}
                        >
                            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                            onClick={copy}
                            onMouseEnter={audio.playHover}
                            className="bug-copy-btn"
                            style={{ padding: 8, borderRadius: 8 }}
                            title="Copy key"
                        >
                            {copied ? <Check size={14} className="bug-text-green" /> : <Copy size={14} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Attempt meter */}
            <div className="bug-flex-col bug-gap-2">
                <div className="bug-flex bug-items-center bug-justify-between bug-text-xs">
                    <span className="bug-text-muted">Failed attempts</span>
                    <span className={`bug-font-semibold ${urgency}`}>
                        {keyData.failed_attempts} / 10 — {keyData.remaining} remaining
                    </span>
                </div>
                <div className="bug-progress-track">
                    <div
                        className="bug-progress-fill"
                        style={{
                            width: `${usedPercent}%`,
                            backgroundColor: usedPercent >= 70 ? '#ef4444' : usedPercent >= 40 ? '#f59e0b' : '#10b981',
                        }}
                    />
                </div>
                <p className="bug-text-xs bug-text-muted">
                    Key auto-resets after 10 failed attempts or upon successful use.
                </p>
            </div>
        </div>
    );
}

function LogsTable({ logs, meta, page, loading, onPage, audio }) {
    return (
        <div className="bug-card">
            <div className="bug-flex bug-items-center bug-gap-2 bug-px-5 bug-py-4 bug-border-b-light">
                <Clock size={14} className="bug-text-muted" />
                <h2 className="bug-text-sm bug-font-semibold bug-text">Attempt Logs</h2>
                {meta && <span className="bug-text-xs bug-text-muted" style={{ marginLeft: 'auto' }}>{meta.total} total</span>}
            </div>

            <div className="bug-grid-logs bug-border-b-light bug-bg-gray-50">
                {['Result', 'IP / User Agent', 'Attempted Key', 'Time'].map(h => (
                    <span key={h} className="bug-text-xs bug-font-semibold bug-uppercase bug-text-muted" style={{ letterSpacing: '0.05em' }}>{h}</span>
                ))}
            </div>

            {loading && (
                <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '40px 0' }}>
                    <Loader2 size={20} className="bug-animate-spin bug-text-muted" />
                </div>
            )}

            {!loading && logs.length === 0 && (
                <p className="bug-text-sm bug-text-muted bug-text-center" style={{ padding: '32px 0' }}>No attempts logged yet.</p>
            )}

            {!loading && logs.map(log => (
                <div
                    key={log.id}
                    className="bug-grid-logs bug-row-hover"
                    style={{
                        borderBottom: '1px solid var(--bug-border-light)',
                        fontSize: 14, padding: '14px 20px',
                        // clinical: left accent per result
                        borderLeft: `3px solid ${log.result === 'success' ? '#10b981' : '#dc2626'}`,
                        paddingLeft: 17,
                    }}
                >
                    <div className="bug-flex bug-items-center">
                        {log.result === 'success'
                            ? <span className="bug-flex bug-items-center bug-gap-1 bug-text-xs bug-text-green bug-font-medium"><CheckCircle2 size={13} /> Pass</span>
                            : <span className="bug-flex bug-items-center bug-gap-1 bug-text-xs bug-text-red bug-font-medium"><XCircle size={13} /> Fail</span>
                        }
                    </div>
                    <div className="bug-flex-col bug-min-w-0" style={{ gap: 2 }}>
                        <span className="bug-text-xs bug-mono bug-text-secondary">{log.ip_address ?? '—'}</span>
                        <span className="bug-text-xs bug-text-muted bug-truncate">{log.user_agent ?? '—'}</span>
                    </div>
                    <span className="bug-mono bug-text-xs bug-text-muted bug-truncate">{log.attempted_key}</span>
                    <span className="bug-text-xs bug-text-muted">{new Date(log.attempted_at).toLocaleString()}</span>
                </div>
            ))}

            {meta && meta.last_page > 1 && (
                <div className="bug-flex bug-items-center bug-justify-between bug-px-5 bug-py-3 bug-border-t-light">
                    <button
                        onClick={() => { onPage(page - 1); audio.playClick(); }}
                        onMouseEnter={audio.playHover}
                        disabled={page <= 1 || loading}
                        className="bug-flex bug-items-center bug-gap-1 bug-text-sm bug-text-secondary"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page <= 1 || loading ? 0.4 : 1 }}
                    >
                        <ChevronLeft size={14} /> Previous
                    </button>
                    <span className="bug-text-xs bug-text-muted">Page {meta.current_page} of {meta.last_page}</span>
                    <button
                        onClick={() => { onPage(page + 1); audio.playClick(); }}
                        onMouseEnter={audio.playHover}
                        disabled={page >= meta.last_page || loading}
                        className="bug-flex bug-items-center bug-gap-1 bug-text-sm bug-text-secondary"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page >= meta.last_page || loading ? 0.4 : 1 }}
                    >
                        Next <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}

export default function AdminDevKeysPage() {
    const audio = useBugAudio();

    const [keyData,      setKeyData]      = useState(null);
    const [keyLoading,   setKeyLoading]   = useState(true);
    const [keyError,     setKeyError]     = useState(null);
    const [regenerating, setRegenerating] = useState(false);
    const [regenMsg,     setRegenMsg]     = useState(null);

    const [logs,      setLogs]      = useState([]);
    const [logsMeta,  setLogsMeta]  = useState(null);
    const [logsPage,  setLogsPage]  = useState(1);
    const [logsLoad,  setLogsLoad]  = useState(true);

    const loadKey = async () => {
        setKeyLoading(true); setKeyError(null);
        try {
            const data = await adminGetActiveKey();
            setKeyData(data);
        } catch {
            setKeyError('Failed to load active key.');
            audio.playError();
        } finally {
            setKeyLoading(false);
        }
    };

    const loadLogs = async (p = 1) => {
        setLogsLoad(true);
        try {
            const res = await adminGetKeyLogs({ page: p, per_page: 30 });
            setLogs(res.data);
            setLogsMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            setLogsPage(p);
        } finally {
            setLogsLoad(false);
        }
    };

    useEffect(() => { loadKey(); loadLogs(1); }, []);

    const handleRegenerate = async () => {
        if (!window.confirm('Regenerate the dev access key? The current key will be invalidated immediately.')) return;
        setRegenerating(true); setRegenMsg(null);
        try {
            const data = await adminRegenerateKey();
            setKeyData({ raw_key: data.raw_key, key_preview: data.key_preview, generated_at: data.generated_at, failed_attempts: 0, remaining: 10 });
            setRegenMsg('New key generated successfully.');
            audio.playSuccess();
            loadLogs(1);
        } catch {
            setRegenMsg('Failed to regenerate key.');
            audio.playError();
        } finally {
            setRegenerating(false);
            setTimeout(() => setRegenMsg(null), 4000);
        }
    };

    return (
        <GeneralLayout>
            <div className="bug-container-keys">

                {/* ── Header ── */}
                <div className="bug-flex bug-items-center bug-justify-between bug-gap-3">
                    <div className="bug-flex bug-items-center bug-gap-3">
                        <div className="bug-icon-box bug-icon-box-md bug-icon-box-emerald">
                            <KeyRound size={18} />
                        </div>
                        <div>
                            <h1 className="bug-text-xl bug-font-bold bug-text">Dev Access Keys</h1>
                            <p className="bug-text-xs bug-text-muted">Manage the one-time dev authentication key</p>
                        </div>
                    </div>
                    <button
                        onClick={audio.toggleMute}
                        onMouseEnter={audio.playHover}
                        className="bug-btn"
                        style={{ padding: 8 }}
                        title={audio.muted ? 'Unmute sounds' : 'Mute sounds'}
                    >
                        {audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                </div>

                {regenMsg && (
                    <div className={`bug-alert ${regenMsg.includes('success') ? 'bug-alert-green' : 'bug-alert-red'}`}>
                        {regenMsg.includes('success') ? <Check size={15} /> : <AlertCircle size={15} />}
                        {regenMsg}
                    </div>
                )}

                {keyLoading && (
                    <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '48px 0' }}>
                        <Loader2 size={22} className="bug-animate-spin bug-text-muted" />
                    </div>
                )}
                {keyError && !keyLoading && (
                    <div className="bug-flex bug-items-center bug-gap-2 bug-text-sm bug-text-red">
                        <AlertCircle size={15} /> {keyError}
                    </div>
                )}
                {keyData && !keyLoading && (
                    <KeyDisplay keyData={keyData} onRegenerate={handleRegenerate} regenerating={regenerating} audio={audio} />
                )}

                <LogsTable logs={logs} meta={logsMeta} page={logsPage} loading={logsLoad} onPage={loadLogs} audio={audio} />
            </div>
        </GeneralLayout>
    );
}