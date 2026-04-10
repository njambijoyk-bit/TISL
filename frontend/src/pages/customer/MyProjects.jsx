import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Folder, Search, X, Activity, Clock, CheckCircle,
  PauseCircle, XCircle, Layers,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import ProjectCard from '../../components/projects/customer/ProjectCard';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useProjectStore from '../../store/projectStore';

const STATUS_TABS = [
  { id: '',           label: 'All',       Icon: Layers },
  { id: 'active',     label: 'Active',    Icon: Activity,     color: '#10b981' },
  { id: 'planning',   label: 'Planning',  Icon: Clock,        color: '#3b82f6' },
  { id: 'on_hold',    label: 'On Hold',   Icon: PauseCircle,  color: '#f59e0b' },
  { id: 'completed',  label: 'Completed', Icon: CheckCircle,  color: '#a855f7' },
  { id: 'cancelled',  label: 'Cancelled', Icon: XCircle,      color: '#ef4444' },
];

const MyProjects = () => {
  const navigate = useNavigate();
  const { projects, pagination, loading, customerFetchProjects } = useProjectStore();

  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]                 = useState(1);
  const [searchQuery, setSearchQuery]   = useState('');

  useEffect(() => {
    customerFetchProjects({ status: statusFilter, page, per_page: 12 });
  }, [statusFilter, page]);

  const allProjects = Array.isArray(projects) ? projects : [];

  const counts = useMemo(() => ({
    '':          allProjects.length,
    active:      allProjects.filter(p => p.status === 'active').length,
    planning:    allProjects.filter(p => p.status === 'planning').length,
    on_hold:     allProjects.filter(p => p.status === 'on_hold').length,
    completed:   allProjects.filter(p => p.status === 'completed').length,
    cancelled:   allProjects.filter(p => p.status === 'cancelled').length,
  }), [allProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return allProjects;
    const q = searchQuery.trim().toLowerCase();
    return allProjects.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q)
    );
  }, [allProjects, searchQuery]);

  const isLoading = loading?.projects ?? loading;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Helmet>
        <title>My Projects — TISL Store</title>
      </Helmet>
      <Header />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '2px solid rgba(168,85,247,0.2)', padding: '32px 24px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6, color: '#c084fc' }}>Account</p>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: 0 }}>My Projects</h1>
              <p style={{ marginTop: 6, fontSize: '0.88rem', color: '#9ca3af', fontWeight: 500 }}>
                {pagination?.total ?? allProjects.length} project{(pagination?.total ?? allProjects.length) !== 1 ? 's' : ''} total
              </p>
            </div>

            {/* Summary pills */}
            {!isLoading && allProjects.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: 4 }}>
                {[
                  { label: 'Active',    value: counts.active,    color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
                  { label: 'Planning',  value: counts.planning,  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)'  },
                  { label: 'Completed', value: counts.completed, color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)' },
                ].map(s => s.value > 0 && (
                  <div key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 9999, background: s.bg, border: `1px solid ${s.border}` }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: s.color }}>{s.value}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.color, opacity: 0.8 }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Search bar ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by project name, description, or status…"
                style={{ width: '100%', padding: '10px 40px', borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.2)', fontSize: '0.85rem', outline: 'none', background: 'white', color: '#111827', boxSizing: 'border-box' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                onBlur={e =>  { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                  <X size={15} />
                </button>
              )}
            </div>
            {searchQuery && (
              <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#9ca3af' }}>
                {filteredProjects.length} result{filteredProjects.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            )}
          </div>

          {/* ── Tab bar ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {STATUS_TABS.map(({ id, label, Icon, color }) => {
              const active      = statusFilter === id;
              const activeColor = color || '#a855f7';
              const count       = counts[id] ?? 0;
              return (
                <button key={id}
                  onClick={() => { setStatusFilter(id); setPage(1); setSearchQuery(''); }}
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '12px 16px', border: 'none', cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap',
                    fontSize: '0.82rem', fontWeight: 700,
                    color: active ? activeColor : '#9ca3af',
                    borderBottom: active ? `2.5px solid ${activeColor}` : '2.5px solid transparent',
                    transition: 'all 150ms', marginBottom: -1,
                  }}
                >
                  <Icon size={13} />
                  {label}
                  <span style={{
                    minWidth: 18, padding: '1px 5px', borderRadius: 9999, fontSize: '0.65rem', fontWeight: 800,
                    background: active ? `${activeColor}18` : '#f3f4f6',
                    color: active ? activeColor : '#9ca3af',
                    transition: 'all 150ms',
                  }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Loading skeletons */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 160, borderRadius: 16, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>

        /* No projects at all */
        ) : allProjects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', borderRadius: 20, border: '1px solid rgba(168,85,247,0.2)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Folder size={28} color="#c084fc" />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', marginBottom: 8 }}>No projects yet</h3>
            <p style={{ fontSize: '0.88rem', color: '#9ca3af' }}>Projects you're added to will appear here.</p>
          </div>

        /* No search results */
        ) : filteredProjects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', borderRadius: 20, border: '1px solid rgba(168,85,247,0.2)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              {searchQuery ? <Search size={28} color="#c084fc" /> : <Folder size={28} color="#c084fc" />}
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', marginBottom: 8 }}>
              {searchQuery ? 'No Results Found' : 'No projects found'}
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#9ca3af', marginBottom: 24 }}>
              {searchQuery
                ? `Nothing matched "${searchQuery}". Try a different term.`
                : `No ${statusFilter.replace('_', ' ')} projects to show.`}
            </p>
            <button type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter(''); setPage(1); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, border: '1.5px solid rgba(168,85,247,0.2)', cursor: 'pointer', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.85rem' }}>
              <X size={14} /> Clear Filters
            </button>
          </div>

        /* Projects grid */
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
              {filteredProjects.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>

            {/* Pagination */}
            {pagination?.last_page > 1 && !searchQuery && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 32 }}>
                <button
                  onClick={() => setPage(p => p - 1)} disabled={page <= 1} type="button"
                  style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
                  Previous
                </button>
                {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                  const p = pagination.last_page <= 5 ? i + 1
                    : pagination.current_page <= 3 ? i + 1
                    : pagination.current_page >= pagination.last_page - 2 ? pagination.last_page - 4 + i
                    : pagination.current_page - 2 + i;
                  const isActive = p === pagination.current_page;
                  return (
                    <button key={p} onClick={() => setPage(p)} type="button"
                      style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${isActive ? '#a855f7' : 'rgba(168,85,247,0.2)'}`, background: isActive ? '#a855f7' : 'white', color: isActive ? 'white' : '#374151', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', boxShadow: isActive ? '0 0 0 3px rgba(168,85,247,0.15)' : 'none' }}>
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => p + 1)} disabled={page >= pagination.last_page} type="button"
                  style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: page >= pagination.last_page ? 'not-allowed' : 'pointer', opacity: page >= pagination.last_page ? 0.4 : 1 }}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default MyProjects;