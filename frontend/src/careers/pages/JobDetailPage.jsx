import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import useCareersStore from '../../_shared/store/useCareersStore';

const DOC_LABELS = {
    cv:            'CV / Résumé',
    cover_letter:  'Cover Letter',
    certificate:   'Certificate',
    portfolio:     'Portfolio',
    id_document:   'ID Document',
    other:         'Other',
};

const TYPE_LABELS = { full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', internship: 'Internship', temporary: 'Temporary' };
const EXP_LABELS  = { entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior', lead: 'Lead', executive: 'Executive' };

const s = {
    page: { minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "var(--font-body, system-ui), sans-serif" },
    back: { display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13, textDecoration: 'none', padding: '24px 40px', transition: 'color 0.15s' },
    layout: { maxWidth: 1000, margin: '0 auto', background: 'var(--bg-primary)', padding: '0 40px 80px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 48, alignItems: 'start' },
    main: {},
    sidebar: { position: 'sticky', top: 24 },
    eyebrow: { fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-primary-500)', marginBottom: 12, fontWeight: 600 },
    title: { fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 700, lineHeight: 1.15, color: 'var(--color-primary-500)', marginBottom: 20, fontFamily: "var(--font-heading, serif), serif" },
    metaRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 },
    pill: { fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--surface-input)', color: 'var(--text-secondary)', fontWeight: 500 },
    pillPurple: { fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)', color: 'var(--color-primary-400)', fontWeight: 500 },
    section: { marginBottom: 36 },
    sectionTitle: { fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 14 },
    body: { fontSize: 15, lineHeight: 1.7, color: 'var(--text-primary)' },
    list: { listStyle: 'none', padding: 0, margin: 0 },
    listItem: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6 },
    dot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary-500)', flexShrink: 0, marginTop: 8 },

    // Sidebar card
    card: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, padding: 28 },
    salary: { fontSize: 20, fontWeight: 700, color: 'var(--color-primary-500)', marginBottom: 4 },
    salaryLabel: { fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 24 },
    applyBtn: {
        display: 'block', width: '100%', padding: '14px 0', textAlign: 'center',
        background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '#fff',
        borderRadius: 10, fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer',
        textDecoration: 'none', transition: 'opacity 0.2s',
    },
    disabledBtn: {
        display: 'block', width: '100%', padding: '14px 0', textAlign: 'center',
        background: 'var(--surface-input)', color: 'var(--text-tertiary)', borderRadius: 10, fontWeight: 600,
        fontSize: 15, border: 'none', cursor: 'not-allowed',
    },
    metaItem: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--line)', fontSize: 13 },
    metaKey: { color: 'var(--text-tertiary)' },
    metaVal: { color: 'var(--text-primary)', textAlign: 'right' },

    // Modal
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modal: {
        background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 16,
        padding: 36, width: '100%', maxWidth: 520,
        maxHeight: '88vh', overflowY: 'auto',   // scroll when doc list is long
    },
    modalTitle: { fontSize: 22, fontWeight: 700, marginBottom: 6, fontFamily: "var(--font-heading, serif), serif" },
    modalSub: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28 },
    label: { display: 'block', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 600 },
    textarea: { width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', minHeight: 120, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
    row: { display: 'flex', gap: 12, marginTop: 24 },
    cancelBtn: { flex: 1, padding: '12px 0', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' },
    submitBtn: (disabled) => ({
        flex: 2, padding: '12px 0', borderRadius: 8, border: 'none',
        background: disabled ? 'var(--line)' : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
        color: disabled ? 'var(--text-tertiary)' : '#fff', fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
    }),
    errMsg: { color: 'var(--status-error)', fontSize: 13, marginTop: 12 },
    warnMsg: { color: 'var(--status-warning)', fontSize: 13, marginTop: 12 },
    loader: { textAlign: 'center', padding: '120px 0', background: 'var(--bg-primary)', color: 'var(--text-tertiary)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },

    // Document upload rows
    docsSection: { marginBottom: 24 },
    docRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
    docName: { fontSize: 14, color: 'var(--text-primary)', flex: 1 },
    required: { color: 'var(--status-error)', marginLeft: 2, fontSize: 12 },
    fileBtn: (hasFile) => ({
        fontSize: 12, padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
        border: hasFile ? '1px solid var(--status-success)' : '1px dashed var(--line)',
        background: 'transparent',
        color: hasFile ? 'var(--status-success)' : 'var(--text-secondary)',
        whiteSpace: 'nowrap', maxWidth: 190, overflow: 'hidden',
        textOverflow: 'ellipsis', transition: 'all 0.15s',
    }),

    // Progress bar
    progressWrap: { marginTop: 20, background: 'var(--surface-card)', borderRadius: 8, overflow: 'hidden', height: 6 },
    progressBar: (pct) => ({ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600))', transition: 'width 0.3s ease', borderRadius: 8 }),
    progressLabel: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center' },
};

export default function JobDetailPage() {
    const { slug }   = useParams();
    const navigate   = useNavigate();
    const {
        currentJob, jobLoading, fetchJob,
        apply, applyLoading,
        uploadDocument, uploadLoading,
        isApplicantAuthed, applications, fetchMyApplications,
    } = useCareersStore();

    const [showModal, setShowModal]         = useState(false);
    const [coverLetter, setCoverLetter]     = useState('');
    const [files, setFiles]                 = useState({});       // { cv: File, portfolio: File, … }
    const [error, setError]                 = useState(null);
    const [uploadError, setUploadError]     = useState(null);
    const [done, setDone]                   = useState(false);
    const [uploading, setUploading]         = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

    useEffect(() => {
        fetchJob(slug);
        if (isApplicantAuthed()) fetchMyApplications();
    }, [slug]);

    const job = currentJob;

    // required_documents from job — e.g. ['cv', 'cover_letter', 'portfolio']
    // 'cover_letter' is handled as the textarea below; all others need a file upload.
    const requiredDocs    = job?.required_documents ?? [];
    const coverLetterReqd = requiredDocs.includes('cover_letter');
    const fileDocTypes    = requiredDocs.filter((t) => t !== 'cover_letter');

    const resetModal = () => {
        setCoverLetter('');
        setFiles({});
        setError(null);
        setUploadError(null);
        setDone(false);
        setUploading(false);
        setUploadProgress({ done: 0, total: 0 });
    };

    const handleApplyClick = () => {
        if (!isApplicantAuthed()) {
            navigate(`/careers/login?next=/careers/${slug}`);
            return;
        }
        resetModal();
        setShowModal(true);
    };

    const handleSubmit = async () => {
        setError(null);
        setUploadError(null);

        // ── Validate cover letter text (if required) ──────────────────────────
        if (coverLetterReqd && !coverLetter.trim()) {
            setError('A cover letter is required for this role.');
            return;
        }

        // ── Validate all required file types are attached ─────────────────────
        const missingFiles = fileDocTypes.filter((t) => !files[t]);
        if (missingFiles.length > 0) {
            setError(`Please attach: ${missingFiles.map((t) => DOC_LABELS[t] ?? t).join(', ')}`);
            return;
        }

        // ── Step 1: create the application ────────────────────────────────────
        let applicationId;
        try {
            const res = await apply(job.id, { cover_letter: coverLetter || null });
            applicationId = res.data.id;
        } catch (err) {
            setError(err.message ?? 'Could not submit application. Please try again.');
            return;
        }

        // ── Step 2: upload each required file in sequence ─────────────────────
        if (fileDocTypes.length > 0) {
            setUploading(true);
            setUploadProgress({ done: 0, total: fileDocTypes.length });

            for (const docType of fileDocTypes) {
                const file = files[docType];
                if (!file) continue;

                const form = new FormData();
                form.append('document', file);
                form.append('type', docType);

                try {
                    await uploadDocument(applicationId, form);
                    setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
                } catch (err) {
                    // Application is already created — tell them to finish in portal
                    setUploading(false);
                    setUploadError(
                        `Application submitted, but "${DOC_LABELS[docType] ?? docType}" failed to upload. ` +
                        `You can add it from your portal.`
                    );
                    setDone(true); // still show success screen with the warning
                    return;
                }
            }

            setUploading(false);
        }

        setDone(true);
    };

    const isBusy = applyLoading || uploading || uploadLoading;
    const progressPct = uploadProgress.total > 0
        ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
        : 0;

    if (jobLoading || !job) return <div style={s.loader}>Loading…</div>;

    const alreadyApplied = done || applications.some((a) => a.job_posting_id === job?.id);

    return (
        <div style={s.page}>
            <style>{`
                @media (max-width: 768px) {
                .job-layout { grid-template-columns: 1fr !important; padding: 0 16px 60px !important; gap: 24px !important; }
                .job-sidebar { position: static !important; }
                .job-back { padding: 16px !important; }
                }
            `}</style>
            <Link to="/careers" style={s.back} className="job-back"
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-primary-500)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}>
                ← All Roles
            </Link>

            <div style={s.layout} className="job-layout">
                {/* ── Main content ───────────────────────────────────────── */}
                <div style={s.main}>
                    {job.department && <p style={s.eyebrow}>{job.department}</p>}
                    <h1 style={s.title}>{job.title}</h1>

                    <div style={s.metaRow}>
                        <span style={s.pill}>{TYPE_LABELS[job.type] ?? job.type}</span>
                        {job.experience_level && <span style={s.pill}>{EXP_LABELS[job.experience_level]}</span>}
                        {job.location        && <span style={s.pill}><MapPin size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {job.location}</span>}
                        {job.salary_range    && <span style={s.pillPurple}>{job.salary_range}</span>}
                    </div>

                    {job.description && (
                        <div style={s.section}>
                            <p style={s.sectionTitle}>About this role</p>
                            <p style={s.body}>{job.description}</p>
                        </div>
                    )}

                    {job.responsibilities?.length > 0 && (
                        <div style={s.section}>
                            <p style={s.sectionTitle}>Responsibilities</p>
                            <ul style={s.list}>
                                {job.responsibilities.map((r, i) => (
                                    <li key={i} style={s.listItem}><span style={s.dot} />{r}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {job.requirements?.length > 0 && (
                        <div style={s.section}>
                            <p style={s.sectionTitle}>Requirements</p>
                            <ul style={s.list}>
                                {job.requirements.map((r, i) => (
                                    <li key={i} style={s.listItem}><span style={s.dot} />{r}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {job.nice_to_haves?.length > 0 && (
                        <div style={s.section}>
                            <p style={s.sectionTitle}>Nice to Have</p>
                            <ul style={s.list}>
                                {job.nice_to_haves.map((r, i) => (
                                    <li key={i} style={{ ...s.listItem, color: 'var(--text-secondary)' }}>
                                        <span style={{ ...s.dot, background: 'var(--line)' }} />{r}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* ── Sidebar ────────────────────────────────────────────── */}
                <aside style={s.sidebar} className="job-sidebar">
                    <div style={s.card}>
                        {job.salary_range && (
                            <>
                                <p style={s.salary}>{job.salary_range}</p>
                                <p style={s.salaryLabel}>per month</p>
                            </>
                        )}

                        {alreadyApplied ? (
                        <div>
                            <div style={s.disabledBtn}>Application Submitted ✓</div>
                            <Link
                                to="/careers/portal"
                                style={{ display: 'block', textAlign: 'center', fontSize: 12, color: 'var(--color-primary-500)', marginTop: 10, textDecoration: 'none' }}>
                                View my applications →
                            </Link>
                        </div>
                        ) : job.is_open ? (
                            <button style={s.applyBtn} onClick={handleApplyClick}>
                                Apply Now
                            </button>
                        ) : (
                            <div style={s.disabledBtn}>This role is closed</div>
                        )}

                        <div style={{ marginTop: 24 }}>
                            {job.deadline && (
                                <div style={s.metaItem}>
                                    <span style={s.metaKey}>Closes</span>
                                    <span style={s.metaVal}>
                                        {new Date(job.deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                            )}
                            <div style={s.metaItem}>
                                <span style={s.metaKey}>Type</span>
                                <span style={s.metaVal}>{TYPE_LABELS[job.type] ?? job.type}</span>
                            </div>
                            {job.location && (
                                <div style={s.metaItem}>
                                    <span style={s.metaKey}>Location</span>
                                    <span style={s.metaVal}>{job.location}</span>
                                </div>
                            )}
                            {requiredDocs.length > 0 && (
                                <div style={s.metaItem}>
                                    <span style={s.metaKey}>Required docs</span>
                                    <span style={s.metaVal}>{requiredDocs.length}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            {/* ── Apply Modal ─────────────────────────────────────────────── */}
            {showModal && (
                <div style={s.overlay} onClick={(e) => { if (!isBusy && e.target === e.currentTarget) setShowModal(false); }}>
                    <div style={s.modal}>

                        {/* ── Success screen ────────────────────────────── */}
                        {done ? (
                            <>
                                <p style={{ fontSize: 40, marginBottom: 16 }}>🎉</p>
                                <p style={s.modalTitle}>Application submitted!</p>
                                <p style={s.modalSub}>We'll be in touch. Track your application in your portal.</p>
                                {uploadError && <p style={s.warnMsg}>⚠ {uploadError}</p>}
                                <div style={s.row}>
                                    <Link
                                        to="/careers/portal"
                                        style={{ ...s.applyBtn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        View My Applications
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <>
                                <p style={s.modalTitle}>Apply for {job.title}</p>
                                <p style={s.modalSub}>Your profile details will be submitted automatically.</p>

                                {/* ── Required file documents ──────────── */}
                                {fileDocTypes.length > 0 && (
                                    <div style={s.docsSection}>
                                        <label style={s.label}>
                                            Required Documents
                                            <span style={{ color: 'var(--status-error)', marginLeft: 4 }}>*</span>
                                        </label>

                                        {fileDocTypes.map((docType) => (
                                            <div key={docType} style={s.docRow}>
                                                <span style={s.docName}>
                                                    {DOC_LABELS[docType] ?? docType}
                                                    <span style={s.required}>*</span>
                                                </span>
                                                <label style={s.fileBtn(!!files[docType])}>
                                                    <input
                                                        type="file"
                                                        style={{ display: 'none' }}
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                        disabled={isBusy}
                                                        onChange={(e) => {
                                                            const f = e.target.files[0];
                                                            if (f) setFiles((prev) => ({ ...prev, [docType]: f }));
                                                        }}
                                                    />
                                                    {files[docType]
                                                        ? `✓ ${files[docType].name}`
                                                        : '+ Attach file'}
                                                </label>
                                            </div>
                                        ))}

                                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                                            PDF, Word, JPG or PNG · max 5 MB each
                                        </p>
                                    </div>
                                )}

                                {/* ── Cover letter textarea ─────────────── */}
                                <div style={{ marginBottom: 4 }}>
                                    <label style={s.label}>
                                        Cover Letter{' '}
                                        {coverLetterReqd
                                            ? <span style={{ color: 'var(--status-error)' }}>*</span>
                                            : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                                        }
                                    </label>
                                    <textarea
                                        style={s.textarea}
                                        placeholder="Tell us why you're a great fit…"
                                        value={coverLetter}
                                        disabled={isBusy}
                                        onChange={(e) => setCoverLetter(e.target.value)}
                                    />
                                </div>

                                {/* ── Upload progress bar ───────────────── */}
                                {uploading && (
                                    <div style={{ marginTop: 16 }}>
                                        <div style={s.progressWrap}>
                                            <div style={s.progressBar(progressPct)} />
                                        </div>
                                        <p style={s.progressLabel}>
                                            Uploading documents… {uploadProgress.done}/{uploadProgress.total}
                                        </p>
                                    </div>
                                )}

                                {error    && <p style={s.errMsg}>{error}</p>}

                                <div style={s.row}>
                                    <button style={s.cancelBtn} onClick={() => setShowModal(false)} disabled={isBusy}>
                                        Cancel
                                    </button>
                                    <button
                                        style={s.submitBtn(isBusy)}
                                        onClick={handleSubmit}
                                        disabled={isBusy}>
                                        {applyLoading  ? 'Submitting…'
                                        : uploading     ? `Uploading ${uploadProgress.done + 1}/${uploadProgress.total}…`
                                        : 'Submit Application'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}