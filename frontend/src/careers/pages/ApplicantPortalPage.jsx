import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useCareersStore from '../../_shared/store/useCareersStore';

const STATUS_COLORS = {
    submitted:    { bg: 'color-mix(in srgb, var(--status-info) 14%, transparent)', text: 'var(--status-info)' },
    under_review: { bg: 'color-mix(in srgb, var(--status-warning) 14%, transparent)', text: 'var(--status-warning)' },
    shortlisted:  { bg: 'color-mix(in srgb, var(--status-success) 14%, transparent)', text: 'var(--status-success)' },
    interviewed:  { bg: 'color-mix(in srgb, var(--status-info) 14%, transparent)', text: 'var(--status-info)' },
    rejected:     { bg: 'color-mix(in srgb, var(--status-error) 14%, transparent)', text: 'var(--status-error)' },
    hired:        { bg: 'color-mix(in srgb, var(--status-success) 14%, transparent)', text: 'var(--status-success)' },
    withdrawn:    { bg: 'var(--surface-card)', text: 'var(--text-tertiary)' },
};

const STATUS_LABELS = {
    submitted:    'Application Received',
    under_review: 'Under Review',
    shortlisted:  'Shortlisted',
    interviewed:  'Interview Stage',
    rejected:     'Unsuccessful',
    hired:        'Offer Extended',
    withdrawn:    'Withdrawn',
};

const s = {
    page: { minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "var(--font-body, system-ui), sans-serif" },
    header: { borderBottom: '1px solid var(--line)', padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: {},
    name: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
    email: { fontSize: 13, color: 'var(--text-tertiary)' },
    headerRight: { display: 'flex', gap: 12, alignItems: 'center' },
    logoutBtn: { padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' },
    browseBtn: { padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
    body: { maxWidth: 860, margin: '0 auto', padding: '40px 40px 80px' },
    sectionTitle: { fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 20 },
    emptyBox: { textAlign: 'center', padding: '64px 0', color: 'var(--text-tertiary)', border: '1px dashed var(--line)', borderRadius: 12 },
    grid: { display: 'grid', gap: 14 },
    card: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 24, cursor: 'pointer', transition: 'border-color 0.2s' },
    cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    jobTitle: { fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 },
    jobMeta: { fontSize: 13, color: 'var(--text-tertiary)' },
    statusPill: (status) => ({
        fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600,
        background: STATUS_COLORS[status]?.bg ?? 'var(--surface-card)',
        color: STATUS_COLORS[status]?.text ?? 'var(--text-secondary)',
        whiteSpace: 'nowrap',
    }),
    cardBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--line)' },
    docCount: { fontSize: 12, color: 'var(--text-tertiary)' },
    date: { fontSize: 12, color: 'var(--text-tertiary)' },
    // Detail
    detailOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    detailModal: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 16, padding: 36, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' },
    detailTitle: { fontSize: 22, fontWeight: 700, marginBottom: 4, fontFamily: "var(--font-heading, serif), serif" },
    detailSub: { fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 },
    timeline: { position: 'relative', paddingLeft: 20 },
    timelineItem: { position: 'relative', paddingBottom: 24, paddingLeft: 16 },
    timelineDot: (status) => ({
        position: 'absolute', left: -20, top: 4, width: 8, height: 8, borderRadius: '50%',
        background: STATUS_COLORS[status]?.text ?? 'var(--text-tertiary)',
    }),
    timelineLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 },
    timelineDate: { fontSize: 12, color: 'var(--text-tertiary)' },
    timelineNote: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
    uploadSection: { marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--line)' },
    fileInput: { display: 'none' },
    docType: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 12, width: '100%', boxSizing: 'border-box' },
    uploadBtn: { padding: '10px 20px', borderRadius: 8, border: '1px dashed var(--line)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', width: '100%', marginBottom: 10 },
    uploadSubmit: { padding: '11px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' },
    withdrawBtn: { padding: '10px 0', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--status-error) 35%, transparent)', background: 'transparent', color: 'var(--status-error)', fontSize: 13, cursor: 'pointer', width: '100%', marginTop: 12 },
    docRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 },
    closeBtn: { position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 20 },
};

const DOC_TYPES = ['cv','cover_letter','certificate','portfolio','id_document','other'];
const DOC_LABELS = { cv: 'CV / Résumé', cover_letter: 'Cover Letter', certificate: 'Certificate', portfolio: 'Portfolio', id_document: 'ID Document', other: 'Other' };

export default function ApplicantPortalPage() {
    const navigate = useNavigate();
    const { applicant, applications, appsLoading, fetchMyApplications, logout,
            currentApplication, fetchApplication, appLoading, isApplicantAuthed,
            withdraw, uploadDocument, uploadLoading } = useCareersStore();

    const [selected, setSelected] = useState(null);
    const [docType, setDocType] = useState('cv');
    const [file, setFile] = useState(null);
    const [uploadErr, setUploadErr] = useState(null);

    useEffect(() => {
        if (!isApplicantAuthed()) {
            navigate('/careers/login?next=/careers/portal', { replace: true });
            return;
        }
        fetchMyApplications().catch(() => {
            // Token rejected by server — clear and redirect
            logout();
            navigate('/careers/login?next=/careers/portal', { replace: true });
        });
    }, []);

    const openDetail = async (id) => {
        setSelected(id);
        await fetchApplication(id);
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploadErr(null);
        const form = new FormData();
        form.append('document', file);
        form.append('type', docType);
        try {
            await uploadDocument(selected, form);
            setFile(null);
        } catch (err) {
            setUploadErr(err.message ?? 'Upload failed.');
        }
    };

    const handleWithdraw = async () => {
        if (!confirm('Withdraw this application?')) return;
        await withdraw(selected);
        setSelected(null);
    };

    const handleLogout = async () => {
        await logout();
        navigate('/careers');
    };

    return (
        <div style={s.page}>
            <header style={s.header}>
                <div style={s.headerLeft}>
                    <p style={s.name}>{applicant?.first_name} {applicant?.last_name}</p>
                    <p style={s.email}>{applicant?.email}</p>
                </div>
                <div style={s.headerRight}>
                    <Link to="/careers" style={s.browseBtn}>Browse Roles</Link>
                    <button style={s.logoutBtn} onClick={handleLogout}>Log out</button>
                </div>
            </header>

            <div style={s.body}>
                <p style={s.sectionTitle}>My Applications ({applications.length})</p>

                {appsLoading ? (
                    <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
                ) : applications.length === 0 ? (
                    <div style={s.emptyBox}>
                        <p style={{ fontSize: 32, marginBottom: 8 }}>📋</p>
                        <p style={{ marginBottom: 16 }}>No applications yet.</p>
                        <Link to="/careers" style={{ ...s.browseBtn, display: 'inline-block' }}>Browse open roles</Link>
                    </div>
                ) : (
                    <div style={s.grid}>
                        {applications.map((app) => (
                            <div key={app.id} style={s.card}
                                onClick={() => openDetail(app.id)}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary-500)'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--line)'}>
                                <div style={s.cardTop}>
                                    <div>
                                        <p style={s.jobTitle}>{app.job_posting?.title}</p>
                                        <p style={s.jobMeta}>{app.job_posting?.department} · {app.job_posting?.location}</p>
                                    </div>
                                    <span style={s.statusPill(app.status)}>{STATUS_LABELS[app.status] ?? app.status}</span>
                                </div>
                                <div style={s.cardBottom}>
                                    <span style={s.docCount}>{app.documents?.length ?? 0} document{app.documents?.length !== 1 ? 's' : ''}</span>
                                    <span style={s.date}>{new Date(app.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Application Detail Modal */}
            {selected && (
                <div style={s.detailOverlay} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
                    <div style={{ ...s.detailModal, position: 'relative' }}>
                        <button style={s.closeBtn} onClick={() => setSelected(null)}>×</button>

                        {appLoading || !currentApplication ? (
                            <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
                        ) : (
                            <>
                                <p style={s.detailTitle}>{currentApplication.job_posting?.title}</p>
                                <p style={s.detailSub}>{currentApplication.job_posting?.department} · {currentApplication.job_posting?.location}</p>

                                {/* Status timeline */}
                                <p style={{ ...s.sectionTitle, marginBottom: 16 }}>Application Timeline</p>
                                <div style={s.timeline}>
                                    {(currentApplication.status_history ?? []).map((h, i) => (
                                        <div key={i} style={s.timelineItem}>
                                            <div style={s.timelineDot(h.to_status)} />
                                            <p style={s.timelineLabel}>{STATUS_LABELS[h.to_status] ?? h.to_status}</p>
                                            <p style={s.timelineDate}>{new Date(h.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                            {h.note && h.to_status !== 'submitted' && <p style={s.timelineNote}>{h.note}</p>}
                                        </div>
                                    ))}
                                </div>

                                {/* Documents */}
                                <div style={s.uploadSection}>
                                    <p style={s.sectionTitle}>Documents ({currentApplication.documents?.length ?? 0})</p>
                                    {currentApplication.documents?.map((doc) => (
                                        <div key={doc.id} style={s.docRow}>
                                            <span style={{ color: 'var(--text-primary)' }}>{DOC_LABELS[doc.type] ?? doc.type}</span>
                                            <span style={{ color: 'var(--text-tertiary)' }}>{doc.original_filename}</span>
                                        </div>
                                    ))}

                                    {/* Upload new */}
                                    {!['rejected','hired','withdrawn'].includes(currentApplication.status) && (
                                        <div style={{ marginTop: 20 }}>
                                            <p style={{ ...s.sectionTitle, marginBottom: 10 }}>Add Document</p>
                                            <select style={s.docType} value={docType} onChange={(e) => setDocType(e.target.value)}>
                                                {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
                                            </select>
                                            <label style={s.uploadBtn}>
                                                <input style={s.fileInput} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                    onChange={(e) => setFile(e.target.files[0])} />
                                                {file ? `📎 ${file.name}` : '+ Choose file (PDF, Word, image)'}
                                            </label>
                                            {uploadErr && <p style={{ color: 'var(--status-error)', fontSize: 12, marginBottom: 8 }}>{uploadErr}</p>}
                                            {file && (
                                                <button style={s.uploadSubmit} onClick={handleUpload} disabled={uploadLoading}>
                                                    {uploadLoading ? 'Uploading…' : 'Upload Document'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Withdraw */}
                                {!['rejected','hired','withdrawn'].includes(currentApplication.status) && (
                                    <button style={s.withdrawBtn} onClick={handleWithdraw}>
                                        Withdraw Application
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}