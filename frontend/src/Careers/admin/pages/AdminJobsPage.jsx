import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAdminCareersStore from '../../../store/useAdminCareersStore';
import Pagination from '../components/Pagination';
import JobFormModal from '../components/JobFormModal';
import AdminCareersHeader from '../../layouts/AdminCareersHeader';

const STATUS_COLORS = {
    draft:     { bg: '#1a1a1a', text: '#555' },
    published: { bg: '#0f2318', text: '#4ade80' },
    closed:    { bg: '#1e1010', text: '#f87171' },
    archived:  { bg: '#1a1a1a', text: '#444' },
};

const s = {
    page: { padding: '32px 36px', fontFamily: "'DM Sans', sans-serif", background: '#0f0f0f', color: '#f0f0f0', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
    pageTitle: { fontSize: 26, fontWeight: 700, fontFamily: "'DM Serif Display', serif", marginBottom: 4 },
    pageSub: { fontSize: 14, color: '#555' },
    newBtn: { padding: '11px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    toolbar: { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
    filterBtn: (active) => ({ padding: '7px 16px', borderRadius: 20, border: `1px solid ${active ? '#a855f7' : '#2a2a2a'}`, background: active ? '#2d1b4e' : 'transparent', color: active ? '#c084fc' : '#666', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400 }),
    search: { padding: '8px 14px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#161616', color: '#f0f0f0', fontSize: 13, outline: 'none', width: 240 },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '10px 16px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', fontWeight: 600, borderBottom: '1px solid #1e1e1e' },
    td: { padding: '16px', borderBottom: '1px solid #111', fontSize: 14, verticalAlign: 'middle' },
    jobTitle: { fontWeight: 600, color: '#f0f0f0', marginBottom: 2 },
    jobMeta: { fontSize: 12, color: '#555' },
    statusPill: (status) => ({ display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: STATUS_COLORS[status]?.bg ?? '#1a1a1a', color: STATUS_COLORS[status]?.text ?? '#888' }),
    appCount: { fontSize: 13, color: '#888', fontWeight: 600 },
    actionRow: { display: 'flex', gap: 8 },
    actionBtn: (color = '#555') => ({ padding: '6px 14px', borderRadius: 7, border: `1px solid ${color}22`, background: 'transparent', color, fontSize: 12, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }),
    emptyRow: { textAlign: 'center', padding: '64px 0', color: '#444' },
};

const STATUSES = ['draft', 'published', 'closed'];

export default function AdminJobsPage() {
    const navigate = useNavigate(); 
    const { jobs, jobsLoading, fetchJobs, publishJob, closeJob, deleteJob } = useAdminCareersStore();
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editJob, setEditJob] = useState(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const p = { page };
        if (statusFilter) p.status = statusFilter;
        if (search) p.search = search;
        fetchJobs(p);
    }, [statusFilter, page]);

    const handleSearch = (e) => {
        if (e.key === 'Enter') {
            setPage(1);
            fetchJobs({ page: 1, search, ...(statusFilter ? { status: statusFilter } : {}) });
        }
    };

    const handlePublish = async (id) => {
        if (!confirm('Publish this job posting?')) return;
        await publishJob(id);
    };

    const handleClose = async (id) => {
        if (!confirm('Close this job posting? Applicants will no longer be able to apply.')) return;
        await closeJob(id);
    };

    const listings = jobs?.data ?? [];

    return (
        <div style={s.page} className="jobs-page">
            <style>{`
                @media (max-width: 768px) {
                .jobs-page { padding: 20px 16px !important; }
                .jobs-header { flex-direction: column !important; gap: 16px !important; align-items: flex-start !important; }
                .jobs-table { display: none !important; }
                .jobs-cards { display: flex !important; }
                .jobs-search { width: 100% !important; box-sizing: border-box !important; }
                }
            `}</style>
            <AdminCareersHeader />
            <div style={s.header} className="jobs-header">
                <div>
                    <p style={s.pageTitle}>Job Postings</p>
                    <p style={s.pageSub}>{jobs?.total ?? 0} total postings</p>
                </div>
                <button style={s.newBtn} onClick={() => { setEditJob(null); setShowForm(true); }}>
                    + New Job
                </button>
            </div>

            <div style={s.toolbar}>
                <button style={s.filterBtn(!statusFilter)} onClick={() => { setStatusFilter(''); setPage(1); }}>All</button>
                {STATUSES.map((st) => (
                    <button key={st} style={s.filterBtn(statusFilter === st)} onClick={() => { setStatusFilter(st); setPage(1); }}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                ))}
                <input
                    style={s.search} className="jobs-search"
                    placeholder="Search jobs…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearch}
                />
            </div>

            <table style={s.table} className="jobs-table">
                <thead>
                    <tr>
                        <th style={s.th}>Role</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Type</th>
                        <th style={s.th}>Applications</th>
                        <th style={s.th}>Deadline</th>
                        <th style={s.th}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {jobsLoading ? (
                        <tr><td colSpan={6} style={{ ...s.td, ...s.emptyRow }}>Loading…</td></tr>
                    ) : listings.length === 0 ? (
                        <tr><td colSpan={6} style={{ ...s.td, ...s.emptyRow }}>No job postings found.</td></tr>
                    ) : listings.map((job) => (
                        <tr key={job.id}>
                            <td style={s.td}>
                                <p style={s.jobTitle}>{job.title}</p>
                                <p style={s.jobMeta}>{[job.department, job.location].filter(Boolean).join(' · ')}</p>
                            </td>
                            <td style={s.td}>
                                <span style={s.statusPill(job.status)}>{job.status}</span>
                            </td>
                            <td style={{ ...s.td, color: '#888', fontSize: 13 }}>
                                {job.type?.replace('_', ' ')}
                            </td>
                            <td style={s.td}>
                                <span style={s.appCount}>{job.application_count ?? 0}</span>
                            </td>
                            <td style={{ ...s.td, color: '#666', fontSize: 13 }}>
                                {job.deadline ? new Date(job.deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td style={s.td}>
                                <div style={s.actionRow}>
                                    <button style={s.actionBtn('#a855f7')} onClick={() => navigate(`/admin/careers/jobs/${job.id}`)}>View</button>
                                    {job.status === 'draft' && (
                                        <button style={s.actionBtn('#4ade80')} onClick={() => handlePublish(job.id)}>Publish</button>
                                    )}
                                    {job.status === 'published' && (
                                        <button style={s.actionBtn('#f87171')} onClick={() => handleClose(job.id)}>Close</button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {/* Mobile cards — hidden on desktop via CSS */}
            <div className="jobs-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {listings.map((job) => (
                <div key={job.id} style={{ background: '#161616', border: '1px solid #1e1e1e', borderRadius: 12, padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...s.jobTitle, marginBottom: 4 }}>{job.title}</p>
                    <p style={s.jobMeta}>{[job.department, job.location].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span style={{ ...s.statusPill(job.status), flexShrink: 0, marginLeft: 10 }}>{job.status}</span>
                </div>

                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span>{job.type?.replace('_', ' ')}</span>
                    <span>📋 {job.application_count ?? 0} applications</span>
                    {job.deadline && <span>Closes {new Date(job.deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                </div>

                <div style={s.actionRow}>
                    <button style={s.actionBtn('#a855f7')} onClick={() => navigate(`/admin/careers/jobs/${job.id}`)}>View</button>
                    {job.status === 'draft'     && <button style={s.actionBtn('#4ade80')} onClick={() => handlePublish(job.id)}>Publish</button>}
                    {job.status === 'published' && <button style={s.actionBtn('#f87171')} onClick={() => handleClose(job.id)}>Close</button>}
                </div>
                </div>
            ))}
            </div>
            <Pagination
                currentPage={jobs?.current_page ?? 1}
                lastPage={jobs?.last_page ?? 1}
                onPageChange={setPage}
            />

            {showForm && (
                <JobFormModal
                    job={editJob}
                    onClose={() => { setShowForm(false); setEditJob(null); }}
                    onSaved={() => fetchJobs()}
                />
            )}
        </div>
    );
}