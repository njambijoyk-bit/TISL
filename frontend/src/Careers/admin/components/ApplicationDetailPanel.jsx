import { useState, useEffect } from 'react';
import useAdminCareersStore from '../../../store/useAdminCareersStore';

const STATUSES = ['submitted','under_review','shortlisted','interviewed','rejected','hired','withdrawn'];
const STATUS_LABELS = { submitted:'Application Received', under_review:'Under Review', shortlisted:'Shortlisted', interviewed:'Interview Stage', rejected:'Unsuccessful', hired:'Offer Extended', withdrawn:'Withdrawn' };
const STATUS_COLORS = { submitted:'#818cf8', under_review:'#fbbf24', shortlisted:'#34d399', interviewed:'#38bdf8', rejected:'#f87171', hired:'#a3e635', withdrawn:'#444' };
const REC_COLORS = { strong_yes:'#a3e635', yes:'#34d399', maybe:'#fbbf24', no:'#f87171' };
const REC_LABELS = { strong_yes:'Strong Yes', yes:'Yes', maybe:'Maybe', no:'No' };

const s = {
    panel: { background: '#161616', border: '1px solid #1e1e1e', borderRadius: 14, overflow: 'hidden' },
    panelHdr: { padding: '20px 24px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    applicantName: { fontSize: 18, fontWeight: 700, color: '#f0f0f0', marginBottom: 2 },
    applicantEmail: { fontSize: 13, color: '#555' },
    closeBtn: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20 },
    body: { padding: '24px' },
    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#555', fontWeight: 600, marginBottom: 14 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    infoItem: { background: '#0f0f0f', borderRadius: 8, padding: '10px 14px' },
    infoLabel: { fontSize: 11, color: '#555', marginBottom: 3 },
    infoVal: { fontSize: 13, color: '#ccc', fontWeight: 500 },

    // Status buttons
    statusRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    statusBtn: (active, loading, color) => ({
        padding: '6px 14px',
        borderRadius: 20,
        border: `1px solid ${(active || loading) ? color : '#2a2a2a'}`,
        background: loading ? `${color}44` : active ? `${color}22` : 'transparent',
        color: (active || loading) ? color : '#555',
        fontSize: 12,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontWeight: (active || loading) ? 600 : 400,
        transition: 'all 0.15s',
        opacity: loading ? 0.8 : 1,
    }),

    // AI score
    scoreRing: (score) => {
        const color = score >= 75 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';
        return { width: 72, height: 72, borderRadius: '50%', border: `4px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
    },
    scoreNum: { fontSize: 20, fontWeight: 700, color: '#f0f0f0' },
    aiCard: { background: '#0f0f0f', borderRadius: 10, padding: 18 },
    aiRow: { display: 'flex', gap: 16, alignItems: 'flex-start' },
    aiBody: { flex: 1 },
    aiSummary: { fontSize: 14, color: '#ccc', lineHeight: 1.65, marginBottom: 14 },
    aiTag: (color) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${color}22`, color, marginRight: 6, marginBottom: 6 }),
    screenBtn: { width: '100%', padding: '11px 0', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    rescreenBtn: { width: '100%', padding: '10px 0', borderRadius: 9, border: '1px solid #2a2a2a', background: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer', marginTop: 8 },
    pollingMsg: { fontSize: 13, color: '#a855f7', textAlign: 'center', padding: '12px 0' },

    // Documents
    docRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #111', fontSize: 13 },
    docName: { color: '#ccc' },
    docSize: { color: '#555', fontSize: 12 },

    // Notes
    noteArea: { width: '100%', padding: '10px 13px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#0f0f0f', color: '#f0f0f0', fontSize: 13, resize: 'vertical', minHeight: 90, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
    saveNoteBtn: (saving) => ({ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? '#1e1535' : '#2d1b4e', color: saving ? '#7c3aed' : '#c084fc', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 10, transition: 'all 0.15s' }),
    noteErr: { fontSize: 12, color: '#f87171', marginTop: 6 },

    // Timeline
    timeline: { position: 'relative', paddingLeft: 18 },
    tItem: { position: 'relative', paddingBottom: 18, paddingLeft: 14 },
    tDot: (color) => ({ position: 'absolute', left: -18, top: 5, width: 8, height: 8, borderRadius: '50%', background: color }),
    tLabel: { fontSize: 13, fontWeight: 600, color: '#ccc', marginBottom: 2 },
    tDate: { fontSize: 11, color: '#444' },
};

export default function ApplicationDetailPanel({ applicationId, onClose }) {
    const { currentApp, appLoading, updateStatus, addNote, screenOne, rescreen, pollForResult } = useAdminCareersStore();

    const [note, setNote]               = useState('');
    const [noteErr, setNoteErr]         = useState(null);
    const [savingNote, setSavingNote]   = useState(false);
    const [statusNote, setStatusNote]   = useState('');
    const [changingStatus, setChangingStatus] = useState(null); // which status is in flight
    const [screening, setScreening]     = useState(false);
    const [pollingMsg, setPollingMsg]   = useState(null);

    // ── Sync note textarea when application data loads ────────────────────────
    // useState(currentApp?.admin_notes) only runs once at mount.
    // currentApp loads async, so we must sync via useEffect.
    useEffect(() => {
        if (currentApp) {
            setNote(currentApp.admin_notes ?? '');
        }
    }, [currentApp?.id]); // re-sync when a different application is opened

    const app = currentApp;

    // ── Status change with per-button loading indicator ───────────────────────
    const handleStatusChange = async (status) => {
        if (status === app.status || changingStatus) return;
        setChangingStatus(status);
        try {
            await updateStatus(app.id, { status, note: statusNote || undefined });
            setStatusNote('');
        } finally {
            setChangingStatus(null);
        }
    };

    // ── Save note with error feedback ─────────────────────────────────────────
    const handleSaveNote = async () => {
        if (savingNote) return;
        setNoteErr(null);

        // Guard: backend requires non-empty note
        if (!note.trim()) {
            setNoteErr('Note cannot be empty.');
            return;
        }

        setSavingNote(true);
        try {
            await addNote(app.id, note.trim());
        } catch (err) {
            setNoteErr(err?.message ?? 'Failed to save note. Please try again.');
        } finally {
            setSavingNote(false);
        }
    };

    // ── AI screening ──────────────────────────────────────────────────────────
    const handleScreen = async () => {
        setScreening(true);
        setPollingMsg('Running AI analysis…');
        try {
            await screenOne(app.id);
            setPollingMsg(null);
        } catch (err) {
            setPollingMsg(err?.message ?? 'Screening failed.');
        } finally {
            setScreening(false);
        }
    };

    const handleRescreen = async () => {
        setScreening(true);
        setPollingMsg('Re-running AI analysis…');
        try {
            await rescreen(app.id);
            setPollingMsg(null);
        } catch (err) {
            setPollingMsg(err?.message ?? 'Re-screen failed.');
        } finally {
            setScreening(false);
        }
    };

    if (appLoading || !app) {
        return (
            <div style={s.panel}>
                <div style={{ padding: 48, textAlign: 'center', color: '#555' }}>Loading application…</div>
            </div>
        );
    }

    const { applicant, job_posting, documents, status_history } = app;
    const score = parseFloat(app.ai_score);

    return (
        <div style={s.panel}>
            <div style={s.panelHdr}>
                <div>
                    <p style={s.applicantName}>{applicant?.first_name} {applicant?.last_name}</p>
                    <p style={s.applicantEmail}>{applicant?.email} · {job_posting?.title}</p>
                </div>
                <button style={s.closeBtn} onClick={onClose}>×</button>
            </div>

            <div style={s.body}>
                {/* Applicant info */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Applicant</p>
                    <div style={s.grid2}>
                        <div style={s.infoItem}><p style={s.infoLabel}>Phone</p><p style={s.infoVal}>{applicant?.phone ?? '—'}</p></div>
                        <div style={s.infoItem}><p style={s.infoLabel}>Current Role</p><p style={s.infoVal}>{applicant?.current_role ?? '—'}</p></div>
                        <div style={s.infoItem}><p style={s.infoLabel}>Experience</p><p style={s.infoVal}>{applicant?.years_of_experience ? `${applicant.years_of_experience} yrs` : '—'}</p></div>
                        <div style={s.infoItem}><p style={s.infoLabel}>Location</p><p style={s.infoVal}>{applicant?.location ?? '—'}</p></div>
                    </div>
                    {applicant?.linkedin_url && (
                        <a href={applicant.linkedin_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 13, color: '#a855f7', textDecoration: 'none', display: 'block', marginTop: 10 }}>
                            LinkedIn Profile →
                        </a>
                    )}
                </div>

                {/* Status */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>Status</p>
                    <div style={s.statusRow}>
                        {STATUSES.map((st) => {
                            const isActive  = app.status === st;
                            const isLoading = changingStatus === st;
                            const color     = STATUS_COLORS[st];
                            return (
                                <button
                                    key={st}
                                    style={s.statusBtn(isActive, isLoading, color)}
                                    onClick={() => handleStatusChange(st)}
                                    disabled={!!changingStatus}>
                                    {isLoading ? '···' : STATUS_LABELS[st]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* AI Screening */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>AI Screening</p>
                    {app.ai_screened_at ? (
                        <div style={s.aiCard}>
                            <div style={s.aiRow}>
                                <div style={s.scoreRing(score)}>
                                    <span style={s.scoreNum}>{Math.round(score)}</span>
                                </div>
                                <div style={s.aiBody}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                        <span style={{ fontSize: 13, color: '#555' }}>Recommendation:</span>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: REC_COLORS[app.ai_recommendation] ?? '#888' }}>
                                            {REC_LABELS[app.ai_recommendation] ?? app.ai_recommendation}
                                        </span>
                                    </div>
                                    <p style={s.aiSummary}>{app.ai_summary}</p>
                                    {app.ai_strengths?.length > 0 && (
                                        <div style={{ marginBottom: 8 }}>
                                            {app.ai_strengths.map((str, i) => <span key={i} style={s.aiTag('#4ade80')}>✓ {str}</span>)}
                                        </div>
                                    )}
                                    {app.ai_gaps?.length > 0 && (
                                        <div>
                                            {app.ai_gaps.map((gap, i) => <span key={i} style={s.aiTag('#f87171')}>✗ {gap}</span>)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p style={{ fontSize: 11, color: '#444', marginTop: 12 }}>
                                Screened {new Date(app.ai_screened_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    ) : (
                        <div style={{ background: '#0f0f0f', borderRadius: 10, padding: 18 }}>
                            <p style={{ fontSize: 14, color: '#555', marginBottom: 14 }}>This application has not been screened yet.</p>
                            {!screening && (
                                <button style={s.screenBtn} onClick={handleScreen}>
                                    Run AI Screen
                                </button>
                            )}
                        </div>
                    )}
                    {pollingMsg && <p style={s.pollingMsg}>{pollingMsg}</p>}
                    {app.ai_screened_at && !screening && (
                        <button style={s.rescreenBtn} onClick={handleRescreen}>Re-run AI Screen</button>
                    )}
                </div>

                {/* Documents */}
                {documents?.length > 0 && (
                    <div style={s.section}>
                        <p style={s.sectionTitle}>Documents ({documents.length})</p>
                        {documents.map((doc) => (
                            <div key={doc.id} style={s.docRow}>
                                <div>
                                    <span style={s.docName}>{doc.original_filename}</span>
                                    <span style={{ ...s.docSize, marginLeft: 10 }}>{doc.type}</span>
                                </div>
                                {doc.download_url && (
                                    <a href={doc.download_url} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: 12, color: '#a855f7', textDecoration: 'none' }}>
                                        Download
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Cover Letter */}
                {app.cover_letter && (
                    <div style={s.section}>
                        <p style={s.sectionTitle}>Cover Letter</p>
                        {/* FIX: wordBreak + overflowWrap prevent long unbroken strings overflowing */}
                        <p style={{
                            fontSize: 14, color: '#aaa', lineHeight: 1.7,
                            background: '#0f0f0f', borderRadius: 8, padding: 16,
                            wordBreak: 'break-word', overflowWrap: 'break-word',
                            whiteSpace: 'pre-wrap',   // preserves line breaks from the original
                        }}>
                            {app.cover_letter}
                        </p>
                    </div>
                )}

                {/* Admin Notes */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>
                        Internal Notes{' '}
                        <span style={{ color: '#333', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                            (not visible to applicant)
                        </span>
                    </p>
                    <textarea
                        style={s.noteArea}
                        value={note}
                        onChange={(e) => { setNote(e.target.value); setNoteErr(null); }}
                        placeholder="Add internal notes…"
                    />
                    {noteErr && <p style={s.noteErr}>{noteErr}</p>}
                    <button style={s.saveNoteBtn(savingNote)} onClick={handleSaveNote} disabled={savingNote}>
                        {savingNote ? 'Saving…' : 'Save Note'}
                    </button>
                </div>

                {/* Timeline */}
                <div style={s.section}>
                    <p style={s.sectionTitle}>History</p>
                    <div style={s.timeline}>
                        {(status_history ?? []).slice().reverse().map((h, i) => (
                            <div key={i} style={s.tItem}>
                                <div style={s.tDot(STATUS_COLORS[h.to_status] ?? '#555')} />
                                <p style={s.tLabel}>{STATUS_LABELS[h.to_status] ?? h.to_status}</p>
                                <p style={s.tDate}>{new Date(h.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
                                {h.note && <p style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{h.note}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}