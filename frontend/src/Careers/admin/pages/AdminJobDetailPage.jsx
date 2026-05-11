import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { adminCareersApi } from '../../../api/careersApi';
import Pagination from '../components/Pagination';
import ApplicationDetailPanel from '../components/ApplicationDetailPanel';
import JobFormModal from '../components/JobFormModal';
import AdminCareersHeader from '../../layouts/AdminCareersHeader';
import useAdminCareersStore from '../../../store/useAdminCareersStore';

const TYPE_LABELS = { full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', internship: 'Internship', temporary: 'Temporary' };
const EXP_LABELS  = { entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior', lead: 'Lead', executive: 'Executive' };
const DOC_LABELS  = { cv: 'CV / Résumé', cover_letter: 'Cover Letter', certificate: 'Certificate', portfolio: 'Portfolio', id_document: 'ID Document', other: 'Other' };

const APP_STATUS_LABELS = {
    submitted:    'Submitted',
    under_review: 'Under Review',  
    shortlisted:  'Shortlisted',
    interviewed:  'Interview',      
    rejected:     'Rejected',
    hired:        'Hired',  
    withdrawn:   'Withdrawn',
};

const APP_STATUS_COLORS = {
    submitted:    { bg: '#1a1a2e', color: '#818cf8' },
    under_review: { bg: '#1c1a10', color: '#fbbf24' },  // was 'reviewing'
    shortlisted:  { bg: '#0d2618', color: '#34d399' },
    interviewed:  { bg: '#1a1028', color: '#c084fc' },  // was 'interview'
    rejected:     { bg: '#2a0f0f', color: '#f87171' },
    hired:        { bg: '#0d2020', color: '#2dd4bf' },
    withdrawn:    { bg: '#1a1a1a', color: '#555' },
};

const JOB_STATUS_COLORS = {
    draft:     { bg: '#1e1e1e', color: '#888' },
    published: { bg: '#0d2618', color: '#34d399' },
    closed:    { bg: '#2a0f0f', color: '#f87171' },
};

const s = {
    page:      { minHeight: '100vh', background: '#0a0a0a', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" },
    topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderBottom: '1px solid #1a1a1a' },
    back:      { display: 'inline-flex', alignItems: 'center', gap: 8, color: '#555', fontSize: 13, textDecoration: 'none', transition: 'color 0.15s', background: 'none', border: 'none', cursor: 'pointer' },
    layout:    { maxWidth: 1100, margin: '0 auto', padding: '32px 40px 80px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 40, alignItems: 'start' },
    main:      {},
    sidebar:   { position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 16 },

    eyebrow:   { fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 10, fontWeight: 600 },
    titleRow:  { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
    title:     { fontSize: 'clamp(22px, 3.5vw, 36px)', fontWeight: 700, lineHeight: 1.2, fontFamily: "'DM Serif Display', serif", flex: 1 },
    statusPill: (status) => ({
        fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 600, letterSpacing: '0.08em', whiteSpace: 'nowrap', marginTop: 6,
        background: JOB_STATUS_COLORS[status]?.bg ?? '#1e1e1e',
        color:      JOB_STATUS_COLORS[status]?.color ?? '#888',
    }),
    metaRow:   { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 },
    pill:      { fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#1a1a1a', color: '#aaa', fontWeight: 500 },
    pillPurple:{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#2d1b4e', color: '#c084fc', fontWeight: 500 },

    section:      { marginBottom: 32 },
    sectionTitle: { fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#444', fontWeight: 600, marginBottom: 14 },
    body:         { fontSize: 15, lineHeight: 1.75, color: '#bbb' },
    list:         { listStyle: 'none', padding: 0, margin: 0 },
    listItem:     { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 14, color: '#bbb', lineHeight: 1.6 },
    dot:          { width: 5, height: 5, borderRadius: '50%', background: '#a855f7', flexShrink: 0, marginTop: 8 },

    divider:   { border: 'none', borderTop: '1px solid #1a1a1a', margin: '32px 0' },

    card:      { background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: 20 },
    cardTitle: { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#444', fontWeight: 600, marginBottom: 16 },

    metaItem:  { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #161616', fontSize: 13 },
    metaKey:   { color: '#555' },
    metaVal:   { color: '#ccc', textAlign: 'right', maxWidth: 160 },

    btn: (variant) => {
        const map = {
            primary: { background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff' },
            danger:  { background: '#2a0f0f', color: '#f87171', border: '1px solid #3d1515' },
            ghost:   { background: '#161616', color: '#888', border: '1px solid #222' },
            green:   { background: '#0d2618', color: '#34d399', border: '1px solid #1a3d28' },
            amber:   { background: '#1c1a10', color: '#fbbf24', border: '1px solid #2e2810' },
        };
        return {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '11px 0', borderRadius: 9, fontWeight: 600,
            fontSize: 13, border: 'none', cursor: 'pointer', transition: 'opacity 0.15s',
            ...(map[variant] ?? map.ghost),
        };
    },

    appRow:    { display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #161616', gap: 14, cursor: 'pointer', textDecoration: 'none' },
    appName:   { fontSize: 14, fontWeight: 600, color: '#e5e5e5', flex: 1 },
    appMeta:   { fontSize: 12, color: '#555', marginTop: 2 },
    appStatus: (status) => ({
        fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap',
        background: APP_STATUS_COLORS[status]?.bg ?? '#1e1e1e',
        color:      APP_STATUS_COLORS[status]?.color ?? '#888',
    }),
    aiScore:   { fontSize: 12, fontWeight: 700, color: '#a855f7', minWidth: 36, textAlign: 'right' },

    loader:    { textAlign: 'center', padding: '100px 0', color: '#444' },
    empty:     { padding: '32px 0', textAlign: 'center', color: '#444', fontSize: 14 },

    overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modal:     { background: '#111', border: '1px solid #222', borderRadius: 14, padding: 32, width: '100%', maxWidth: 400 },
    modalTitle:{ fontSize: 18, fontWeight: 700, marginBottom: 8, fontFamily: "'DM Serif Display', serif" },
    modalSub:  { fontSize: 14, color: '#555', marginBottom: 28, lineHeight: 1.6 },
    modalRow:  { display: 'flex', gap: 10 },
    cancelBtn: { flex: 1, padding: '11px 0', borderRadius: 8, border: '1px solid #222', background: 'transparent', color: '#666', fontSize: 13, cursor: 'pointer' },
    confirmBtn:(danger) => ({
        flex: 2, padding: '11px 0', borderRadius: 8, border: 'none',
        background: danger ? '#c0392b' : 'linear-gradient(135deg,#a855f7,#7c3aed)',
        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    }),
};

export default function AdminJobDetailPage() {
    const { id }   = useParams();
    const navigate = useNavigate();

    const [job,         setJob]         = useState(null);
    const [apps,        setApps]        = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [appsLoading, setAppsLoading] = useState(true);
    const [actionBusy,  setActionBusy]  = useState(false);
    const [screenBusy,  setScreenBusy]  = useState(false);
    const [confirm,     setConfirm]     = useState(null); // { type: 'delete' | 'close' | 'publish' }

    const [showForm, setShowForm] = useState(false);

    const { fetchApplication } = useAdminCareersStore();
    const [selectedAppId, setSelectedAppId] = useState(null);

    const [appsPage, setAppsPage] = useState(1);
    const [appsMeta, setAppsMeta] = useState(null);

    const handleSelectApp = async (appId) => {
        setSelectedAppId(appId);
        await fetchApplication(appId);
    };

    const loadJob = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminCareersApi.getJob(id);
            setJob(res.data ?? res);
        } finally {
            setLoading(false);
        }
    }, [id]);

    const loadApps = useCallback(async (page = 1) => {
        setAppsLoading(true);
        try {
            const res = await adminCareersApi.getJobApps(id, { page });
            const paginator = res?.data;
            setApps(Array.isArray(paginator?.data) ? paginator.data : []);
            setAppsMeta(paginator);
        } finally {
            setAppsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadJob();
        loadApps();
    }, [id]);

    const handlePublish = async () => {
        setActionBusy(true);
        try {
            await adminCareersApi.publishJob(id);
            await loadJob();
        } finally {
            setActionBusy(false);
            setConfirm(null);
        }
    };

    const handleClose = async () => {
        setActionBusy(true);
        try {
            await adminCareersApi.closeJob(id);
            await loadJob();
        } finally {
            setActionBusy(false);
            setConfirm(null);
        }
    };

    const handleDelete = async () => {
        setActionBusy(true);
        try {
            await adminCareersApi.deleteJob(id);
            navigate('/admin/careers/jobs');
        } finally {
            setActionBusy(false);
            setConfirm(null);
        }
    };

    const handlePageChange = (page) => {
        setAppsPage(page);
        loadApps(page);
    };

    const handleScreenAll = async () => {
        setScreenBusy(true);
        try {
            await adminCareersApi.screenBatch(id);
            await loadApps(appsPage);
        } finally {
            setScreenBusy(false);
        }
    };

    if (loading || !job) {
        return <div style={s.page}><div style={s.loader}>Loading…</div></div>;
    }

    const statusKey   = job.status ?? 'draft';
    const isPublished = statusKey === 'published';
    const isClosed    = statusKey === 'closed';
    const isDraft     = statusKey === 'draft';

    const requiredDocs = job.required_documents ?? [];
    const screened     = apps.filter(a => a.ai_score != null).length;
    const shortlisted  = apps.filter(a => a.status === 'shortlisted').length;

    return (
        <div style={s.page}>
            <AdminCareersHeader />

            {/* ── Top bar ──────────────────────────────────────────────────────── */}
            <div style={s.topBar}>
                <Link
                    to="/admin/careers/jobs"
                    style={s.back}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#555'}
                >
                    ← All Jobs
                </Link>
                <button
                    style={{ ...s.btn('ghost'), width: 'auto', padding: '9px 18px' }}
                    onClick={() => setShowForm(true)}
                >
                    ✏ Edit Job
                </button>
            </div>

            {/* ── Body ─────────────────────────────────────────────────────────── */}
            <div style={s.layout}>

                {/* ── Main ─────────────────────────────────────────────────────── */}
                <div style={s.main}>
                    {job.department && <p style={s.eyebrow}>{job.department}</p>}

                    <div style={s.titleRow}>
                        <h1 style={s.title}>{job.title}</h1>
                        <span style={s.statusPill(statusKey)}>
                            {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                        </span>
                    </div>

                    <div style={s.metaRow}>
                        <span style={s.pill}>{TYPE_LABELS[job.type] ?? job.type}</span>
                        {job.experience_level && <span style={s.pill}>{EXP_LABELS[job.experience_level]}</span>}
                        {job.location         && <span style={s.pill}><MapPin size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {job.location}</span>}
                        {job.salary_range     && <span style={s.pillPurple}>{job.salary_range}</span>}
                    </div>

                    {job.description && (
                        <div style={s.section}>
                            <p style={s.sectionTitle}>About this Role</p>
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
                                    <li key={i} style={{ ...s.listItem, color: '#555' }}>
                                        <span style={{ ...s.dot, background: '#333' }} />{r}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <hr style={s.divider} />

                    {/* ── Applications ─────────────────────────────────────────── */}
                    <div style={s.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <p style={{ ...s.sectionTitle, marginBottom: 0 }}>
                                Applications
                                {(appsMeta?.total ?? apps.length) > 0 && (
                                    <span style={{ marginLeft: 10, fontSize: 12, color: '#555', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                                        {appsMeta?.total ?? apps.length} total · {screened} screened on this page · {shortlisted} shortlisted on this page
                                    </span>
                                )}
                            </p>
                            {apps.length > 0 && (
                                <button
                                    style={{ ...s.btn('ghost'), width: 'auto', padding: '7px 14px', opacity: screenBusy ? 0.5 : 1 }}
                                    onClick={handleScreenAll}
                                    disabled={screenBusy}
                                >
                                    {screenBusy ? '⏳ Screening…' : '✨ AI Screen All'}
                                </button>
                            )}
                        </div>

                        {appsLoading ? (
                            <p style={s.empty}>Loading applications…</p>
                        ) : apps.length === 0 ? (
                            <p style={s.empty}>No applications yet.</p>
                        ) : (
                            <div>
                                {apps.map(app => (
                                    <div
                                        key={app.id}
                                        style={s.appRow}
                                        onClick={() => handleSelectApp(app.id)}
                                        onMouseEnter={e => e.currentTarget.style.background = '#111'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: '#1e1e1e', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', fontSize: 14, fontWeight: 700,
                                            color: '#a855f7', flexShrink: 0,
                                        }}>
                                            {(app.applicant?.first_name ?? '?').charAt(0).toUpperCase()}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={s.appName}>
                                                {app.applicant ? `${app.applicant.first_name} ${app.applicant.last_name}` : '—'}
                                            </p>
                                            <p style={s.appMeta}>
                                                {app.applicant?.email ?? ''}
                                                {app.created_at && ` · ${new Date(app.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`}
                                            </p>
                                        </div>

                                        {app.ai_score != null && (
                                            <span style={s.aiScore}>{app.ai_score}%</span>
                                        )}

                                        <span style={s.appStatus(app.status)}>
                                            {APP_STATUS_LABELS[app.status] ?? app.status}
                                        </span>

                                        <span style={{ color: '#333', fontSize: 16 }}>›</span>
                                    </div>
                                ))}
                                <Pagination
                                currentPage={appsMeta?.current_page ?? 1}
                                lastPage={appsMeta?.last_page ?? 1}
                                onPageChange={handlePageChange}
                            />
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Sidebar ───────────────────────────────────────────────────── */}
                <aside style={s.sidebar}>

                    {/* Actions card */}
                    <div style={s.card}>
                        <p style={s.cardTitle}>Actions</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {isDraft && (
                                <button
                                    style={{ ...s.btn('green'), opacity: actionBusy ? 0.5 : 1 }}
                                    onClick={() => setConfirm({ type: 'publish' })}
                                    disabled={actionBusy}
                                >
                                    ▶ Publish Job
                                </button>
                            )}
                            {isPublished && (
                                <button
                                    style={{ ...s.btn('amber'), opacity: actionBusy ? 0.5 : 1 }}
                                    onClick={() => setConfirm({ type: 'close' })}
                                    disabled={actionBusy}
                                >
                                    ◼ Close Job
                                </button>
                            )}
                            {isClosed && (
                                <button
                                    style={{ ...s.btn('green'), opacity: actionBusy ? 0.5 : 1 }}
                                    onClick={() => setConfirm({ type: 'publish' })}
                                    disabled={actionBusy}
                                >
                                    ▶ Reopen Job
                                </button>
                            )}
                            <Link
                                to={`/admin/careers/applications?job=${id}`}
                                style={{ ...s.btn('ghost'), textDecoration: 'none' }}
                            >
                                👥 View All Applications
                            </Link>
                            <button
                                style={{ ...s.btn('danger'), opacity: actionBusy ? 0.5 : 1 }}
                                onClick={() => setConfirm({ type: 'delete' })}
                                disabled={actionBusy}
                            >
                                🗑 Delete Job
                            </button>
                        </div>
                    </div>

                    {/* Details card */}
                    <div style={s.card}>
                        <p style={s.cardTitle}>Details</p>
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
                        {job.experience_level && (
                            <div style={s.metaItem}>
                                <span style={s.metaKey}>Experience</span>
                                <span style={s.metaVal}>{EXP_LABELS[job.experience_level]}</span>
                            </div>
                        )}
                        {job.location && (
                            <div style={s.metaItem}>
                                <span style={s.metaKey}>Location</span>
                                <span style={s.metaVal}>{job.location}</span>
                            </div>
                        )}
                        {job.salary_range && (
                            <div style={s.metaItem}>
                                <span style={s.metaKey}>Salary</span>
                                <span style={s.metaVal}>{job.salary_range}</span>
                            </div>
                        )}
                        <div style={s.metaItem}>
                            <span style={s.metaKey}>Applications</span>
                            <span style={s.metaVal}>{job.application_count ?? apps.length}</span>
                        </div>
                        {requiredDocs.length > 0 && (
                            <div style={s.metaItem}>
                                <span style={s.metaKey}>Req. docs</span>
                                <span style={s.metaVal}>{requiredDocs.map(d => DOC_LABELS[d] ?? d).join(', ')}</span>
                            </div>
                        )}
                        {job.created_at && (
                            <div style={s.metaItem}>
                                <span style={s.metaKey}>Created</span>
                                <span style={s.metaVal}>
                                    {new Date(job.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            </div>
                        )}
                        {job.updated_at && (
                            <div style={{ ...s.metaItem, borderBottom: 'none' }}>
                                <span style={s.metaKey}>Updated</span>
                                <span style={s.metaVal}>
                                    {new Date(job.updated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Public link card */}
                    {isPublished && job.slug && (
                        <div style={s.card}>
                            <p style={s.cardTitle}>Public Listing</p>
                            <a
                                href={`/careers/${job.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 13, color: '#a855f7', textDecoration: 'none', wordBreak: 'break-all' }}
                            >
                                /careers/{job.slug} ↗
                            </a>
                        </div>
                    )}
                </aside>
            </div>

            {/* Application Detail Overlay */}
            {selectedAppId && (
                <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) setSelectedAppId(null); }}>
                    <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
                        <ApplicationDetailPanel
                            applicationId={selectedAppId}
                            onClose={() => setSelectedAppId(null)}
                        />
                    </div>
                </div>
            )}

            {showForm && (
                <JobFormModal
                    job={job}
                    onClose={() => setShowForm(false)}
                    onSaved={async () => {
                        setShowForm(false);
                        await loadJob(); // refresh job data after edit
                    }}
                />
            )}

            {/* ── Confirm modal ─────────────────────────────────────────────────── */}
            {confirm && (
                <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
                    <div style={s.modal}>
                        {confirm.type === 'delete' && (
                            <>
                                <p style={s.modalTitle}>Delete this job?</p>

                                {(appsMeta?.total ?? apps.length) > 0 ? (
                                    <>
                                        <p style={s.modalSub}>
                                            This job has <strong style={{ color: '#f87171' }}>
                                                {appsMeta?.total ?? apps.length} application{(appsMeta?.total ?? apps.length) !== 1 ? 's' : ''}
                                            </strong>. Deleting it will permanently remove the listing - those applications will remain in the system but will lose their job reference and appear without a job name.
                                        </p>
                                        <div style={{
                                            background: '#1c1a10', border: '1px solid #2e2810',
                                            borderRadius: 8, padding: '12px 14px', marginBottom: 20,
                                        }}>
                                            <p style={{ fontSize: 13, color: '#fbbf24', margin: 0, lineHeight: 1.6 }}>
                                                💡 Consider <strong>closing the job</strong> instead, it stops new applications while keeping the listing and its history intact.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <p style={s.modalSub}>This will permanently remove the listing. This cannot be undone.</p>
                                )}

                                <div style={s.modalRow}>
                                    <button style={s.cancelBtn} onClick={() => setConfirm(null)}>Cancel</button>
                                    {(appsMeta?.total ?? apps.length) > 0 && !isClosed && (
                                        <button
                                            style={{ ...s.confirmBtn(false), flex: 1 }}
                                            onClick={() => { setConfirm(null); setConfirm({ type: 'close' }); }}
                                            disabled={actionBusy}
                                        >
                                            Close Instead
                                        </button>
                                    )}
                                    <button style={s.confirmBtn(true)} onClick={handleDelete} disabled={actionBusy}>
                                        {actionBusy ? 'Deleting…' : 'Delete Anyway'}
                                    </button>
                                </div>
                            </>
                        )}
                        {confirm.type === 'close' && (
                            <>
                                <p style={s.modalTitle}>Close this job?</p>
                                <p style={s.modalSub}>No new applications will be accepted. You can reopen it later.</p>
                                <div style={s.modalRow}>
                                    <button style={s.cancelBtn} onClick={() => setConfirm(null)}>Cancel</button>
                                    <button style={s.confirmBtn(false)} onClick={handleClose} disabled={actionBusy}>
                                        {actionBusy ? 'Closing…' : 'Close Job'}
                                    </button>
                                </div>
                            </>
                        )}
                        {confirm.type === 'publish' && (
                            <>
                                <p style={s.modalTitle}>{isClosed ? 'Reopen' : 'Publish'} this job?</p>
                                <p style={s.modalSub}>The listing will go live on the public careers page immediately.</p>
                                <div style={s.modalRow}>
                                    <button style={s.cancelBtn} onClick={() => setConfirm(null)}>Cancel</button>
                                    <button style={s.confirmBtn(false)} onClick={handlePublish} disabled={actionBusy}>
                                        {actionBusy ? 'Publishing…' : isClosed ? 'Reopen' : 'Publish'}
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