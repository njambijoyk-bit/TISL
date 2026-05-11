import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import useCareersStore from '../../store/useCareersStore';
import Pagination from '../components/Pagination';

const TYPE_LABELS = {
    full_time: 'Full Time', part_time: 'Part Time',
    contract: 'Contract', internship: 'Internship', temporary: 'Temporary',
};

const EXP_LABELS = {
    entry: 'Entry', mid: 'Mid', senior: 'Senior', lead: 'Lead', executive: 'Executive',
};

const s = {
    page: { minHeight: '100vh', background: '#0f0f0f', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" },
    hero: { borderBottom: '1px solid #1e1e1e', padding: '64px 40px 48px', maxWidth: 900, margin: '0 auto' },
    eyebrow: { fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 16, fontWeight: 600 },
    title: { fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 700, lineHeight: 1.1, marginBottom: 16, fontFamily: "'DM Serif Display', serif" },
    subtitle: { color: '#888', fontSize: 16, maxWidth: 480 },
    body: { maxWidth: 1100, margin: '0 auto', padding: '40px 40px 80px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 48 },
    sidebar: { position: 'sticky', top: 24, alignSelf: 'start' },
    sideLabel: { fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#555', marginBottom: 12, fontWeight: 600 },
    filterGroup: { marginBottom: 28 },
    filterBtn: (active) => ({
        display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px',
        borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
        background: active ? '#a855f7' : 'transparent',
        color: active ? '#fff' : '#aaa',
        marginBottom: 2, transition: 'all 0.15s',
    }),
    searchBar: {
        width: '100%', padding: '10px 14px', borderRadius: 8,
        border: '1px solid #222', background: '#161616', color: '#f0f0f0',
        fontSize: 14, marginBottom: 32, outline: 'none', boxSizing: 'border-box',
    },
    grid: { display: 'grid', gap: 16 },
    card: { background: '#161616', border: '1px solid #1e1e1e', borderRadius: 12, padding: 28, transition: 'border-color 0.2s', textDecoration: 'none', display: 'block', color: 'inherit' },
    cardTitle: { fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#f0f0f0' },
    cardMeta: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
    pill: (color = '#222') => ({
        fontSize: 11, padding: '3px 10px', borderRadius: 20,
        background: color, color: '#ccc', fontWeight: 500,
    }),
    cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e1e' },
    applyBtn: { fontSize: 12, color: '#a855f7', fontWeight: 600, letterSpacing: '0.05em' },
    deadline: { fontSize: 12, color: '#555' },
    empty: { textAlign: 'center', padding: '64px 0', color: '#555' },
    loader: { textAlign: 'center', padding: '64px 0', color: '#555' },
};

export default function CareersPage() {
    const { jobs, jobFilters, jobsLoading, fetchJobs } = useCareersStore();
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState(params.get('search') ?? '');

    const dept   = params.get('department') ?? '';
    const type   = params.get('type') ?? '';
    const page   = parseInt(params.get('page') ?? '1', 10);

    // Re-fetch whenever any filter or page changes
    useEffect(() => {
        const p = {};
        if (dept)   p.department = dept;
        if (type)   p.type = type;
        if (search) p.search = search;
        p.page = page;
        fetchJobs(p);
    }, [dept, type, page]);

    const handleSearch = (e) => {
        e.preventDefault();
        const p = new URLSearchParams(params);
        if (search) p.set('search', search); else p.delete('search');
        p.delete('page'); // reset to page 1 on new search
        setParams(p);
        const q = {};
        if (dept)   q.department = dept;
        if (type)   q.type = type;
        if (search) q.search = search;
        fetchJobs(q);
    };

    const setFilter = (key, val) => {
        const p = new URLSearchParams(params);
        if (p.get(key) === val) p.delete(key); else p.set(key, val);
        p.delete('page'); // reset to page 1 on filter change
        setParams(p);
    };

    const handlePageChange = (newPage) => {
        const p = new URLSearchParams(params);
        if (newPage === 1) p.delete('page'); else p.set('page', newPage);
        setParams(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const listings    = jobs?.data ?? [];
    const currentPage = jobs?.current_page ?? page;
    const lastPage    = jobs?.last_page ?? 1;

    return (
        <div style={s.page}>
            <div style={s.hero}>
                <p style={s.eyebrow}>TISL Careers</p>
                <h1 style={s.title}>Build the future<br />of industrial supply.</h1>
                <p style={s.subtitle}>Open roles across engineering, operations, sales, and more.</p>
            </div>

            <div style={s.body}>
                {/* Sidebar */}
                <aside style={s.sidebar}>
                    <form onSubmit={handleSearch}>
                        <input
                            style={s.searchBar}
                            placeholder="Search roles…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </form>

                    {(jobFilters.departments?.length > 0) && (
                        <div style={s.filterGroup}>
                            <p style={s.sideLabel}>Department</p>
                            {jobFilters.departments.map((d) => (
                                <button key={d} style={s.filterBtn(dept === d)} onClick={() => setFilter('department', d)}>
                                    {d}
                                </button>
                            ))}
                        </div>
                    )}

                    {(jobFilters.types?.length > 0) && (
                        <div style={s.filterGroup}>
                            <p style={s.sideLabel}>Type</p>
                            {jobFilters.types.map((t) => (
                                <button key={t} style={s.filterBtn(type === t)} onClick={() => setFilter('type', t)}>
                                    {TYPE_LABELS[t] ?? t}
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                {/* Listings */}
                <div>
                    {jobsLoading ? (
                        <p style={s.loader}>Loading roles…</p>
                    ) : listings.length === 0 ? (
                        <div style={s.empty}>
                            <p style={{ fontSize: 32, marginBottom: 8 }}>🔍</p>
                            <p>No open roles match your search.</p>
                        </div>
                    ) : (
                        <>
                            <div style={s.grid}>
                                {listings.map((job) => (
                                    <Link key={job.id} to={`/careers/${job.slug}`} style={s.card}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#a855f7'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1e1e1e'}>
                                        <p style={s.cardTitle}>{job.title}</p>
                                        <div style={s.cardMeta}>
                                            {job.department && <span style={s.pill()}>{job.department}</span>}
                                            <span style={s.pill('#1a1a2e')}>{TYPE_LABELS[job.type] ?? job.type}</span>
                                            {job.experience_level && <span style={s.pill()}>{EXP_LABELS[job.experience_level]}</span>}
                                            {job.location && <span style={s.pill()}><MapPin size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {job.location}</span>}
                                        </div>
                                        {job.salary_range && (
                                            <p style={{ fontSize: 13, color: '#a855f7', fontWeight: 600 }}>{job.salary_range}</p>
                                        )}
                                        <div style={s.cardFooter}>
                                            <span style={s.applyBtn}>View & Apply →</span>
                                            {job.deadline && (
                                                <span style={s.deadline}>
                                                    Closes {new Date(job.deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            <Pagination
                                currentPage={currentPage}
                                lastPage={lastPage}
                                onPageChange={handlePageChange}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}