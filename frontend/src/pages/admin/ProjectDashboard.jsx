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

const SkeletonRows = ({ count = 5, height = 'h-4' }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`${height} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
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
    // fetchRecentProjects stores results in `recentProjects` — never touches the shared
    // `projects` / `pagination` / `filters` state used by the Projects list page
    fetchRecentProjects({ status: 'active', per_page: 5 });
  }, []);

  const byStatus        = statistics?.by_status        || {};
  const byPriority      = statistics?.by_priority      || {};
  const topCustomers    = statistics?.top_customers     || [];
  const createdPerMonth = statistics?.created_per_month || [];

  // Pre-compute max once rather than inside every map iteration
  const monthMax = createdPerMonth.length
    ? Math.max(...createdPerMonth.map((m) => m.count), 1)
    : 1;

  return (
    <AdminLayout>
      <PageHeader
        title="Projects"
        subtitle="Overview of all projects across your organisation"
        actions={
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/admin/projects/list')}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700
                dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              View All Projects
            </button>
            <button
              onClick={() => navigate('/admin/projects/create')}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              + New Project
            </button>
          </div>
        }
      />

      <div className="space-y-6">

        {/* Stats Bar */}
        <ProjectStatsBar statistics={statistics} loading={loading.statistics} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Status Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">By Status</h3>
            {loading.statistics ? (
              <SkeletonRows count={5} />
            ) : (
              <div className="space-y-3">
                {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((status) => (
                  <div
                    key={status}
                    className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate(`/admin/projects/list?status=${status}`)}
                  >
                    <ProjectStatusBadge status={status} />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {byStatus[status] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">By Priority</h3>
            {loading.statistics ? (
              <SkeletonRows count={4} />
            ) : (
              <div className="space-y-3">
                {['urgent', 'high', 'medium', 'low'].map((priority) => (
                  <div
                    key={priority}
                    className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate(`/admin/projects/list?priority=${priority}`)}
                  >
                    <ProjectPriorityBadge priority={priority} />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {byPriority[priority] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Customers */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top Customers</h3>
            {loading.statistics ? (
              <SkeletonRows count={5} />
            ) : topCustomers.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—'}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                      {c.project_count} project{c.project_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Projects Created Per Month */}
        {(loading.statistics || createdPerMonth.length > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Projects Created — Last 6 Months
            </h3>
            {loading.statistics ? (
              <div className="h-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              <div className="flex items-end gap-3 h-24">
                {createdPerMonth.map((m) => {
                  const height = Math.round((m.count / monthMax) * 100);
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {m.count > 0 ? m.count : ''}
                      </span>
                      <div
                        className="w-full bg-primary-500 dark:bg-primary-600 rounded-t transition-all"
                        style={{ height: `${height}%`, minHeight: m.count > 0 ? '4px' : '0' }}
                      />
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {m.month.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Recent Active Projects */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Active Projects</h3>
            <button
              onClick={() => navigate('/admin/projects/list?status=active')}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              View all
            </button>
          </div>

          {loading.statistics ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No active projects found.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/admin/projects/${project.id}`)}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50
                    dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {project.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {project.project_number} · {customerName(project.customer)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <ProjectPriorityBadge priority={project.priority} showDot={false} />
                    <ProjectStatusBadge status={project.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
};

export default ProjectDashboard;