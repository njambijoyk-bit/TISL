import { useEffect, useState } from 'react';
import useAdminCareersStore from '../../../_shared/store/useAdminCareersStore';
import Pagination from '../components/Pagination';
import ApplicationDetailPanel from '../components/ApplicationDetailPanel';
import AdminCareersHeader from '../../layouts/AdminCareersHeader';

const STATUS_COLORS = { submitted:'var(--status-info)', under_review:'var(--status-warning)', shortlisted:'var(--status-success)', interviewed:'var(--status-info)', rejected:'var(--status-error)', hired:'var(--status-success)', withdrawn:'var(--text-tertiary)' };
const STATUS_LABELS = { submitted:'Received', under_review:'Under Review', shortlisted:'Shortlisted', interviewed:'Interview', rejected:'Rejected', hired:'Hired', withdrawn:'Withdrawn' };
const REC_COLORS   = { strong_yes:'var(--status-success)', yes:'var(--status-success)', maybe:'var(--status-warning)', no:'var(--status-error)' };

const s = {
    page: { display: 'grid', gridTemplateColumns: '1fr 420px', gap: 0, minHeight: '100vh', fontFamily: "var(--font-body, system-ui), sans-serif", color: 'var(--text-primary)', background: 'var(--bg-primary)' },
    pageNoDetail: { padding: '32px 36px', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "var(--font-body, system-ui), sans-serif", color: 'var(--text-primary)' },
    left: { padding: '32px 28px', borderRight: '1px solid var(--line)', background: 'var(--bg-primary)', overflowY: 'auto' },
    right: { padding: 24, overflowY: 'auto', background: 'var(--bg-primary)' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    pageTitle: { fontSize: 22, fontWeight: 700, fontFamily: "var(--font-heading, serif), serif", marginBottom: 2 },
    pageSub: { fontSize: 13, color: 'var(--text-tertiary)' },
    toolbar: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
    filterBtn: (active) => ({ padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? 'var(--color-primary-500)' : 'var(--line)'}`, background: active ? 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)' : 'transparent', color: active ? 'var(--color-primary-400)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }),
    search: { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', flex: 1, minWidth: 160 },
    row: { padding: '14px 16px', borderRadius: 10, border: '1px solid transparent', marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s', background: 'var(--surface-card)' },
    rowActive: { border: '1px solid var(--color-primary-500)', background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' },
    rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    appName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 },
    appJob: { fontSize: 12, color: 'var(--text-tertiary)' },
    statusPill: (status) => ({ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: `color-mix(in srgb, ${STATUS_COLORS[status]} 13%, transparent)`, color: STATUS_COLORS[status] ?? 'var(--text-secondary)' }),
    rowBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    scoreChip: (score) => {
        const c = score >= 75 ? 'var(--status-success)' : score >= 50 ? 'var(--status-warning)' : 'var(--status-error)';
        return { fontSize: 11, color: c, fontWeight: 700 };
    },
    recChip: (rec) => ({ fontSize: 11, color: REC_COLORS[rec] ?? 'var(--text-tertiary)' }),
    date: { fontSize: 11, color: 'var(--text-tertiary)' },
    emptyMsg: { textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' },
    batchBtn: { padding: '8px 16px', borderRadius: 9, border: 'none', background: 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)', color: 'var(--color-primary-400)', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
};

const STATUSES = ['submitted','under_review','shortlisted','interviewed','rejected','hired'];

export default function AdminApplicationsPage() {
    const { applications, appsLoading, fetchApplications, fetchApplication, screenBatch, currentApp } = useAdminCareersStore();

    const [selectedId, setSelectedId] = useState(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [screeningBatch, setScreeningBatch] = useState(false);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const p = { page };
        if (statusFilter) p.status = statusFilter;
        if (search) p.search = search;
        fetchApplications(p);
    }, [statusFilter, page]);

    const handleSelect = async (id) => {
        setSelectedId(id);
        await fetchApplication(id);
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter') {
            setPage(1);
            fetchApplications({ page: 1, search, ...(statusFilter ? { status: statusFilter } : {}) });
        }
    };

    const listings = applications?.data ?? [];

    const leftContent = (
        <>
        <AdminCareersHeader />
            <div style={s.header}>
                <div>
                    <p style={s.pageTitle}>Applications</p>
                    <p style={s.pageSub}>{applications?.total ?? 0} total</p>
                </div>
            </div>

            <div style={s.toolbar}>
                <button style={s.filterBtn(!statusFilter)} onClick={() => { setStatusFilter(''); setPage(1); }}>All</button>
                {STATUSES.map((st) => (
                    <button key={st} style={s.filterBtn(statusFilter === st)} onClick={() => { setStatusFilter(st); setPage(1); }}>
                        {STATUS_LABELS[st]}
                    </button>
                ))}
                <input
                    style={s.search} placeholder="Search applicants…"
                    value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleSearch}
                />
            </div>

            {appsLoading ? (
                <p style={s.emptyMsg}>Loading…</p>
            ) : listings.length === 0 ? (
                <p style={s.emptyMsg}>No applications found.</p>
            ) : listings.map((app) => (
                <div key={app.id}
                    style={selectedId === app.id ? { ...s.row, ...s.rowActive } : s.row}
                    onClick={() => handleSelect(app.id)}
                    onMouseEnter={(e) => selectedId !== app.id && (e.currentTarget.style.borderColor = 'var(--line)')}
                    onMouseLeave={(e) => selectedId !== app.id && (e.currentTarget.style.borderColor = 'transparent')}>
                    <div style={s.rowTop}>
                        <div>
                            <p style={s.appName}>{app.applicant?.first_name} {app.applicant?.last_name}</p>
                            <p style={s.appJob}>{app.job_posting?.title}</p>
                        </div>
                        <span style={s.statusPill(app.status)}>{STATUS_LABELS[app.status] ?? app.status}</span>
                    </div>
                    <div style={s.rowBottom}>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {app.ai_score != null && (
                                <span style={s.scoreChip(parseFloat(app.ai_score))}>
                                    AI: {Math.round(app.ai_score)}
                                </span>
                            )}
                            {app.ai_recommendation && (
                                <span style={s.recChip(app.ai_recommendation)}>
                                    {app.ai_recommendation.replace('_', ' ')}
                                </span>
                            )}
                            {!app.ai_screened_at && (
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Not screened</span>
                            )}
                        </div>
                        <span style={s.date}>{new Date(app.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short' })}</span>
                    </div>
                </div>
            ))}
            <Pagination
                currentPage={applications?.current_page ?? 1}
                lastPage={applications?.last_page ?? 1}
                onPageChange={setPage}
            />
            <div></div>
        </>
    );

    if (!selectedId) {
        return <div style={s.pageNoDetail}>{leftContent}</div>;
    }

    return (
        <div style={s.page}>
            <div style={s.left}>{leftContent}</div>
            <div style={s.right}>
                <ApplicationDetailPanel
                    applicationId={selectedId}
                    onClose={() => setSelectedId(null)}
                />
            </div>
        </div>
    );
}