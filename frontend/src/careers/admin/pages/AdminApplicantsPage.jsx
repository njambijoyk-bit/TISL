import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, User, Briefcase, MapPin, ChevronRight } from 'lucide-react';
import { adminApi } from '../../../_shared/api/careersApi';
import AdminCareersHeader from '../../layouts/AdminCareersHeader';
import Pagination from '../components/Pagination';

const STATUS_STYLES = {
    active:    { bg: 'rgba(16,185,129,0.12)', color: 'var(--status-success)', label: 'Active' },
    suspended: { bg: 'rgba(239,68,68,0.12)',  color: 'var(--status-error)', label: 'Suspended' },
};

export default function AdminApplicantsPage() {
    const [params, setParams] = useSearchParams();
    const [data, setData]     = useState(null);
    const [loading, setLoading] = useState(true);

    const search = params.get('search') ?? '';
    const status = params.get('status') ?? '';
    const page   = parseInt(params.get('page') ?? '1', 10);
    const [searchInput, setSearchInput] = useState(search);

    useEffect(() => {
        setLoading(true);
        const p = { page };
        if (search) p.search = search;
        if (status) p.status = status;

        adminApi.getApplicants(p)
            .then(res => setData(res.data))
            .finally(() => setLoading(false));
    }, [search, status, page]);

    const updateParam = (key, val) => {
        const p = new URLSearchParams(params);
        if (val) p.set(key, val); else p.delete(key);
        p.delete('page');
        setParams(p);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        updateParam('search', searchInput.trim());
    };

    const handlePageChange = (pg) => {
        const p = new URLSearchParams(params);
        if (pg === 1) p.delete('page'); else p.set('page', pg);
        setParams(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const applicants  = data?.data ?? [];
    const currentPage = data?.current_page ?? page;
    const lastPage    = data?.last_page ?? 1;
    const total       = data?.total ?? 0;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "var(--font-body, system-ui), sans-serif" }}>
            <AdminCareersHeader />

            <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 80px' }}>

                {/* ── Page title ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Applicants</h1>
                        {!loading && (
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
                                {total.toLocaleString()} registered applicant{total !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Filters ── */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                    <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 220, position: 'relative' }}>
                        <Search size={14} color="var(--text-tertiary)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search name, email, role, location…"
                            style={{
                                width: '100%', padding: '9px 12px 9px 34px',
                                background: 'var(--surface-card)', border: '1px solid var(--line)',
                                borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
                                outline: 'none', boxSizing: 'border-box',
                            }}
                        />
                    </form>

                    {/* Status filter pills */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {['', 'active', 'suspended'].map(s => (
                            <button
                                key={s}
                                onClick={() => updateParam('status', s)}
                                style={{
                                    padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                                    border: '1px solid',
                                    borderColor: status === s ? 'var(--color-primary-500)' : 'var(--line)',
                                    background:  status === s ? 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)' : 'transparent',
                                    color:       status === s ? 'var(--color-primary-400)' : 'var(--text-secondary)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                            >
                                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── List ── */}
                {loading ? (
                    <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
                ) : applicants.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-tertiary)' }}>
                        <User size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <p>No applicants found.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {applicants.map(a => {
                            const st = STATUS_STYLES[a.status] ?? STATUS_STYLES.active;
                            return (
                                <Link
                                    key={a.id}
                                    to={`/admin/careers/applicants/${a.id}`}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        background: 'var(--surface-card)', border: '1px solid var(--line)',
                                        borderRadius: 10, padding: '16px 20px',
                                        textDecoration: 'none', color: 'inherit',
                                        transition: 'border-color 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary-500)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
                                >
                                    {/* Avatar */}
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                        background: 'linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 15, fontWeight: 700, color: '',
                                    }}>
                                        {a.first_name?.[0]?.toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {a.first_name} {a.last_name}
                                            </span>
                                            <span style={{
                                                fontSize: 10, fontWeight: 600, padding: '2px 8px',
                                                borderRadius: 20, background: st.bg, color: st.color,
                                                letterSpacing: '0.05em', textTransform: 'uppercase',
                                            }}>
                                                {st.label}
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.email}
                                            {a.current_role && <span style={{ color: 'var(--text-tertiary)' }}> · {a.current_role}</span>}
                                            {a.location && <span style={{ color: 'var(--text-tertiary)' }}> · {a.location}</span>}
                                        </p>
                                    </div>

                                    {/* Stats */}
                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-primary-500)' }}>{a.applications_count}</p>
                                            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>applications</p>
                                        </div>
                                        <ChevronRight size={14} color="var(--text-tertiary)" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}

                <Pagination currentPage={currentPage} lastPage={lastPage} onPageChange={handlePageChange} />
            </div>
        </div>
    );
}