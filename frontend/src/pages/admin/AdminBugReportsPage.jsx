import { useState, useEffect, useCallback } from 'react';
import {
    Bug, Search, RefreshCw, Loader2, AlertCircle,
    ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
    SlidersHorizontal, X, Volume2, VolumeX,
} from 'lucide-react';
import '../../styles/bug.css';
import GeneralLayout from '../../components/layout/GeneralLayout';
import StatusBadge from '../../components/bugs/StatusBadge';
import PriorityBadge from '../../components/bugs/PriorityBadge';
import BugReportDetailModal from '../../components/bugs/BugReportDetailModal';
import { adminGetReports, BUG_STATUSES, BUG_PRIORITIES } from '../../api/bugReportsAPI';
import { useBugAudio } from './settings/useBugAudio';

const SORT_FIELDS = [
    { value: 'created_at', label: 'Date Submitted' },
    { value: 'updated_at', label: 'Last Updated' },
    { value: 'priority',   label: 'Priority' },
    { value: 'status',     label: 'Status' },
];

// Left accent border color per priority — the one clinical touch
const PRIORITY_ACCENT = {
    critical: '#dc2626',
    high:     '#d97706',
    medium:   '#2563eb',
    low:      'transparent',
};

function SortButton({ field, label, current, dir, onSort, onHover }) {
    const active = current === field;
    return (
        <button
            onClick={() => onSort(field)}
            onMouseEnter={onHover}
            className={`bug-sort-btn ${active ? 'bug-sort-btn-active' : ''}`}
        >
            {label}
            {active
                ? dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                : <ArrowUpDown size={11} style={{ opacity: 0.4 }} />}
        </button>
    );
}

function FilterBar({ filters, onChange, onClear, onHover }) {
    const hasFilters = filters.status || filters.priority || filters.search;
    return (
        <div className="bug-flex bug-flex-wrap bug-items-center bug-gap-2">
            <div className="bug-relative">
                <Search size={13} className="bug-text-muted" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                    type="text"
                    value={filters.search}
                    onChange={e => onChange('search', e.target.value)}
                    onFocus={onHover}
                    placeholder="Search title, report #, email..."
                    className="bug-input"
                    style={{ paddingLeft: 32, width: 256 }}
                />
            </div>
            <select value={filters.status}   onChange={e => { onChange('status', e.target.value); onHover(); }}   className="bug-select">
                <option value="">All Statuses</option>
                {BUG_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filters.priority} onChange={e => { onChange('priority', e.target.value); onHover(); }} className="bug-select">
                <option value="">All Priorities</option>
                {BUG_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {hasFilters && (
                <button onClick={onClear} onMouseEnter={onHover} className="bug-btn bug-text-muted" style={{ fontSize: 12, padding: '6px 10px' }}>
                    <X size={11} /> Clear
                </button>
            )}
        </div>
    );
}

function ReporterCell({ report }) {
    if (report.customer) return (
        <div className="bug-flex-col">
            <span className="bug-text-sm bug-text">{report.customer.name ?? `Customer #${report.customer.id}`}</span>
            <span className="bug-text-xs bug-text-muted">Customer</span>
        </div>
    );
    if (report.user) return (
        <div className="bug-flex-col">
            <span className="bug-text-sm bug-text">{report.user.name ?? `Staff #${report.user.id}`}</span>
            <span className="bug-text-xs bug-text-muted">Staff</span>
        </div>
    );
    return (
        <div className="bug-flex-col">
            <span className="bug-text-sm bug-text">{report.guest_name ?? 'Anonymous'}</span>
            {report.guest_email && (
                <span className="bug-text-xs bug-text-muted" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {report.guest_email}
                </span>
            )}
        </div>
    );
}

export default function AdminBugReportsPage() {
    const audio = useBugAudio();

    const [reports,    setReports]    = useState([]);
    const [meta,       setMeta]       = useState(null);
    const [page,       setPage]       = useState(1);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [sort,       setSort]       = useState({ field: 'created_at', dir: 'desc' });
    const [filters,    setFilters]    = useState({ status: '', priority: '', search: '' });
    const [selectedId, setSelectedId] = useState(null);

    const load = useCallback(async (p = 1, s = sort, f = filters) => {
        setLoading(true); setError(null);
        try {
            const params = {
                page: p, per_page: 20,
                sort: s.field, dir: s.dir,
                ...(f.status   && { status: f.status }),
                ...(f.priority && { priority: f.priority }),
                ...(f.search   && { search: f.search }),
            };
            const res = await adminGetReports(params);
            setReports(res.data);
            setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            setPage(p);
        } catch {
            setError('Failed to load bug reports.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    }, [sort, filters]);

    useEffect(() => { load(1, sort, filters); }, [sort, filters]);

    const handleSort = (field) => {
        audio.playClick();
        const next = field === sort.field
            ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
            : { field, dir: 'desc' };
        setSort(next);
    };

    const handleFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
    const clearFilters = () => { setFilters({ status: '', priority: '', search: '' }); audio.playClick(); };

    return (
        <GeneralLayout>
            <div className="bug-container-xl">

                {/* ── Header ── */}
                <div className="bug-flex bug-items-center bug-justify-between bug-gap-4">
                    <div className="bug-flex bug-items-center bug-gap-3">
                        <div className="bug-icon-box bug-icon-box-md bug-icon-box-red">
                            <Bug size={18} />
                        </div>
                        <div>
                            <h1 className="bug-text-xl bug-font-bold bug-text">Bug Reports</h1>
                            {meta && (
                                <p className="bug-text-xs bug-text-muted">{meta.total} total report{meta.total !== 1 ? 's' : ''}</p>
                            )}
                        </div>
                    </div>
                    <div className="bug-flex bug-items-center bug-gap-2">
                        {/* Mute toggle */}
                        <button
                            onClick={audio.toggleMute}
                            onMouseEnter={audio.playHover}
                            className="bug-btn"
                            style={{ padding: 8 }}
                            title={audio.muted ? 'Unmute sounds' : 'Mute sounds'}
                        >
                            {audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <button
                            onClick={() => { load(page); audio.playClick(); }}
                            disabled={loading}
                            onMouseEnter={audio.playHover}
                            className="bug-btn"
                            style={{ padding: 8 }}
                            title="Refresh"
                        >
                            <RefreshCw size={15} className={loading ? 'bug-animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* ── Filters ── */}
                <FilterBar filters={filters} onChange={handleFilter} onClear={clearFilters} onHover={audio.playHover} />

                {/* ── Sort row ── */}
                <div className="bug-flex bug-items-center bug-gap-4 bug-text-xs bug-text-muted">
                    <SlidersHorizontal size={12} />
                    <span>Sort by:</span>
                    {SORT_FIELDS.map(f => (
                        <SortButton key={f.value} field={f.value} label={f.label} current={sort.field} dir={sort.dir} onSort={handleSort} onHover={audio.playHover} />
                    ))}
                </div>

                {/* ── Table ── */}
                <div className="bug-card">
                    {/* Header row */}
                    <div className="bug-grid-reports bug-border-b-light bug-bg-gray-50">
                        {['Report', 'Reporter', 'Status', 'Priority', 'Submitted', 'History'].map(h => (
                            <span key={h} className="bug-text-xs bug-font-semibold bug-uppercase bug-text-muted" style={{ letterSpacing: '0.05em' }}>{h}</span>
                        ))}
                    </div>

                    {loading && (
                        <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '64px 0' }}>
                            <Loader2 size={22} className="bug-animate-spin bug-text-muted" />
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bug-flex bug-items-center bug-gap-2 bug-px-5 bug-py-8 bug-text-sm bug-text-red">
                            <AlertCircle size={15} /> {error}
                        </div>
                    )}

                    {!loading && !error && reports.length === 0 && (
                        <div className="bug-flex-col bug-items-center bug-gap-3" style={{ padding: '64px 0' }}>
                            <Bug size={32} strokeWidth={1.5} className="bug-text-muted" />
                            <p className="bug-text-sm bug-text-muted">No bug reports found.</p>
                        </div>
                    )}

                    {!loading && reports.map(r => (
                        <button
                            key={r.id}
                            onClick={() => { setSelectedId(r.id); audio.playOpen(); }}
                            onMouseEnter={audio.playHover}
                            className="bug-grid-reports bug-row-hover bug-text-left"
                            style={{
                                borderBottom: '1px solid var(--bug-border-light)',
                                borderLeft: `3px solid ${PRIORITY_ACCENT[r.priority] ?? 'transparent'}`,
                                background: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                paddingLeft: 17, // compensate for 3px border
                            }}
                        >
                            <div className="bug-flex-col bug-min-w-0" style={{ gap: 2 }}>
                                <span className="bug-text-sm bug-font-medium bug-text bug-truncate" style={{ display: 'block' }}>
                                    {r.title}
                                </span>
                                <span className="bug-mono bug-text-xs bug-text-muted">{r.report_number}</span>
                            </div>
                            <ReporterCell report={r} />
                            <div className="bug-flex bug-items-center"><StatusBadge status={r.status} /></div>
                            <div className="bug-flex bug-items-center"><PriorityBadge priority={r.priority} /></div>
                            <div className="bug-flex-col bug-justify-center">
                                <span className="bug-text-xs bug-text-secondary">{new Date(r.created_at).toLocaleDateString()}</span>
                                <span className="bug-text-xs bug-text-muted">{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="bug-flex bug-items-center">
                                <span className="bug-text-xs bug-text-muted">
                                    {r.status_history_count ?? 0} update{(r.status_history_count ?? 0) !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* ── Pagination ── */}
                {meta && meta.last_page > 1 && (
                    <div className="bug-flex bug-items-center bug-justify-between">
                        <button
                            onClick={() => { load(page - 1); audio.playClick(); }}
                            onMouseEnter={audio.playHover}
                            disabled={page <= 1 || loading}
                            className="bug-flex bug-items-center bug-gap-1 bug-text-sm bug-text-secondary"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page <= 1 || loading ? 0.4 : 1 }}
                        >
                            <ChevronLeft size={15} /> Previous
                        </button>
                        <span className="bug-text-xs bug-text-muted">Page {meta.current_page} of {meta.last_page}</span>
                        <button
                            onClick={() => { load(page + 1); audio.playClick(); }}
                            onMouseEnter={audio.playHover}
                            disabled={page >= meta.last_page || loading}
                            className="bug-flex bug-items-center bug-gap-1 bug-text-sm bug-text-secondary"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page >= meta.last_page || loading ? 0.4 : 1 }}
                        >
                            Next <ChevronRight size={15} />
                        </button>
                    </div>
                )}

                {/* ── Detail modal ── */}
                {selectedId && (
                    <BugReportDetailModal
                        reportId={selectedId}
                        onClose={() => { setSelectedId(null); audio.playClose(); }}
                        onUpdated={() => load(page)}
                    />
                )}
            </div>
        </GeneralLayout>
    );
}