import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import ProjectStatsBar from '../../components/admin/ProjectStatsBar';
import ProjectStatusBadge from '../../components/admin/ProjectStatusBadge';
import ProjectPriorityBadge from '../../components/admin/ProjectPriorityBadge';
import useProjectStore from '../../store/projectStore';

const customerName = (customer) => {
  if (!customer) return '—';
  return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email || '—';
};

// ── Glowy Card Wrapper ──────────────────────────────────────────────────────
function GlowCard({ children, className = '', hover = true }) {
  return (
    <div 
      className={`rounded-2xl p-5 transition-all duration-200 ${className}`}
      style={{
        border: '1.5px solid rgba(168, 85, 247, 0.25)',
        boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.08), 0 4px 20px rgba(168, 85, 247, 0.06)',
        ...(hover && {
          ':hover': {
            borderColor: 'rgba(168, 85, 247, 0.45)',
            boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.15), 0 6px 28px rgba(168, 85, 247, 0.12)'
          }
        })
      }}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.45)';
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.15), 0 6px 28px rgba(168, 85, 247, 0.12)';
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.25)';
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(168, 85, 247, 0.08), 0 4px 20px rgba(168, 85, 247, 0.06)';
      } : undefined}
    >
      {children}
    </div>
  );
}

// ── Gradient Divider ────────────────────────────────────────────────────────
const GradientDivider = ({ className = '' }) => (
  <div 
    className={`h-px w-full ${className}`} 
    style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.25), transparent)' }} 
  />
);

// ── Skeleton Rows with Glow ─────────────────────────────────────────────────
const SkeletonRows = ({ count = 5, height = 'h-4' }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div 
        key={i} 
        className={`${height} rounded animate-pulse`}
        style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.08), rgba(168,85,247,0.15), rgba(168,85,247,0.08))' }}
      />
    ))}
  </div>
);

const ProjectDashboard = () => {
  const navigate = useNavigate();

  const {
    statistics,
    recentProjects,
    loading,
    fetchStatistics,
    fetchRecentProjects,
  } = useProjectStore();

  useEffect(() => {
    fetchStatistics();
    fetchRecentProjects({ status: 'active', per_page: 5 });
  }, []);

  const byStatus        = statistics?.by_status        || {};
  const byPriority      = statistics?.by_priority      || {};
  const topCustomers    = statistics?.top_customers     || [];
  const createdPerMonth = statistics?.created_per_month || [];

  const monthMax = createdPerMonth.length
    ? Math.max(...createdPerMonth.map((m) => m.count), 1)
    : 1;

  return (
    <AdminLayout>
      {/* ── Page Header with Glow Accent ───────────────────────────────────── */}
      <div className="mb-6" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
        <PageHeader
          title="Projects"
          subtitle="Overview of all projects across your organisation"
          actions={
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/admin/projects/list')}
                className="px-4 py-2 text-sm rounded-xl font-semibold transition-all"
                style={{
                  border: '1.5px solid rgba(168,85,247,0.3)',
                  background: 'transparent',
                  color: '#a855f7'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(168,85,247,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                View All Projects
              </button>
              <button
                onClick={() => navigate('/admin/projects/create')}
                className="px-4 py-2 text-sm rounded-xl font-extrabold text-white transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                  boxShadow: '0 4px 12px rgba(168,85,247,0.35)'
                }}
              >
                + New Project
              </button>
            </div>
          }
        />
      </div>

      <div className="space-y-6">

        {/* Stats Bar - Wrapped with glow */}
        <div style={{ borderRadius: 16, padding: '2px' }}>
          <ProjectStatsBar statistics={statistics} loading={loading.statistics} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Status Breakdown */}
          <GlowCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <span style={{ fontSize: '14px' }}>📊</span>
              </div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>By Status</h3>
            </div>
            {loading.statistics ? (
              <SkeletonRows count={5} />
            ) : (
              <div className="space-y-3">
                {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((status, i) => (
                  <div key={status}>
                    <div
                      className="flex items-center justify-between cursor-pointer py-2 px-2 rounded-lg transition-all"
                      onClick={() => navigate(`/admin/projects/list?status=${status}`)}
                      style={{
                        border: '1px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
                        e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <ProjectStatusBadge status={status} />
                      <span className="text-sm font-extrabold" style={{ color: '#a855f7' }}>
                        {byStatus[status] ?? 0}
                      </span>
                    </div>
                    {i < 4 && <GradientDivider className="mt-2" />}
                  </div>
                ))}
              </div>
            )}
          </GlowCard>

          {/* Priority Breakdown */}
          <GlowCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <span style={{ fontSize: '14px' }}>🎯</span>
              </div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>By Priority</h3>
            </div>
            {loading.statistics ? (
              <SkeletonRows count={4} />
            ) : (
              <div className="space-y-3">
                {['urgent', 'high', 'medium', 'low'].map((priority, i) => (
                  <div key={priority}>
                    <div
                      className="flex items-center justify-between cursor-pointer py-2 px-2 rounded-lg transition-all"
                      onClick={() => navigate(`/admin/projects/list?priority=${priority}`)}
                      style={{ border: '1px solid transparent' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
                        e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <ProjectPriorityBadge priority={priority} />
                      <span className="text-sm font-extrabold" style={{ color: '#a855f7' }}>
                        {byPriority[priority] ?? 0}
                      </span>
                    </div>
                    {i < 3 && <GradientDivider className="mt-2" />}
                  </div>
                ))}
              </div>
            )}
          </GlowCard>

          {/* Top Customers */}
          <GlowCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span style={{ fontSize: '14px' }}>👥</span>
              </div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>Top Customers</h3>
            </div>
            {loading.statistics ? (
              <SkeletonRows count={5} />
            ) : topCustomers.length === 0 ? (
              <p className="text-sm text-gray-400 italic" style={{ padding: '12px 0' }}>No data yet.</p>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((c, i) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-purple-50/50 transition-colors cursor-pointer">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—'}
                      </span>
                      <span className="text-sm font-extrabold shrink-0" style={{ color: '#a855f7' }}>
                        {c.project_count} project{c.project_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {i < topCustomers.length - 1 && <GradientDivider className="mt-2" />}
                  </div>
                ))}
              </div>
            )}
          </GlowCard>
        </div>

        {/* Projects Created Per Month - Chart Card */}
        {(loading.statistics || createdPerMonth.length > 0) && (
          <GlowCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <span style={{ fontSize: '14px' }}>📈</span>
              </div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>
                Projects Created — Last 6 Months
              </h3>
            </div>
            {loading.statistics ? (
              <div className="h-24 rounded animate-pulse" style={{ background: 'rgba(168,85,247,0.08)' }} />
            ) : (
              <div className="flex items-end gap-3 h-28">
                {createdPerMonth.map((m) => {
                  const height = Math.round((m.count / monthMax) * 100);
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-2 group">
                      <span className="text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity" 
                        style={{ color: '#a855f7' }}>
                        {m.count > 0 ? m.count : ''}
                      </span>
                      <div
                        className="w-full rounded-t transition-all duration-300 group-hover:opacity-90"
                        style={{ 
                          height: `${height}%`, 
                          minHeight: m.count > 0 ? '6px' : '0',
                          background: 'linear-gradient(180deg, #a855f7, #7c3aed)',
                          boxShadow: height > 0 ? '0 0 8px rgba(168,85,247,0.4)' : 'none'
                        }}
                      />
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                        {m.month.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </GlowCard>
        )}

        {/* Recent Active Projects - List Card */}
        <GlowCard className="overflow-hidden">
          <div className="flex items-center justify-between px-1 py-3 mb-4" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <span style={{ fontSize: '14px' }}>📋</span>
              </div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: '#c084fc' }}>
                Recent Active Projects
              </h3>
            </div>
            <button
              onClick={() => navigate('/admin/projects/list?status=active')}
              className="text-xs font-bold transition-colors hover:underline"
              style={{ color: '#a855f7' }}
            >
              View all →
            </button>
          </div>

          {loading.statistics ? (
            <div className="p-2 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 rounded animate-pulse" style={{ background: 'rgba(168,85,247,0.08)' }} />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No active projects found.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/admin/projects/${project.id}`)}
                  className="flex items-center justify-between px-2 py-4 cursor-pointer rounded-xl transition-all mx-1 my-1"
                  style={{ border: '1px solid transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(168,85,247,0.04)';
                    e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(168,85,247,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-gray-900 dark:text-white truncate">
                      {project.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <span style={{ color: '#a855f7', fontWeight: 600 }}>{project.project_number}</span> · {customerName(project.customer)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <ProjectPriorityBadge priority={project.priority} showDot={false} />
                    <ProjectStatusBadge status={project.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlowCard>

      </div>
    </AdminLayout>
  );
};

export default ProjectDashboard;