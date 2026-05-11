import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import ProjectTrashModal from './ProjectTrashModal';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import AdminPagination from '../../components/common/AdminPagination';
import ProjectFilters from '../../components/admin/ProjectFilters';
import ProjectTable from '../../components/admin/ProjectTable';
import useProjectStore from '../../store/projectStore';
import { useAuthStore } from '../../store';

const Projects = () => {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();

  const {
    projects,
    pagination,
    filters,
    loading,
    fetchProjects,
    deleteProject,
    setFilters,
    resetFilters,
  } = useProjectStore();

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showTrash, setShowTrash]         = useState(false);

  const canDelete = ['admin', 'super_admin'].includes(user?.role);

  useEffect(() => {
    fetchProjects();
  }, [
    filters.status,
    filters.priority,
    filters.search,
    filters.page,
  ]);

  const handleFilterChange = (newFilters) => setFilters(newFilters);
  const handleSearch       = (search)     => setFilters({ search, page: 1 });
  const handlePageChange   = (page)       => setFilters({ page });

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const res = await deleteProject(confirmDelete.id);
    if (res.success) {
      toast.success('Project moved to trash.');
    } else {
      toast.error(res.error || 'Failed to delete project.');
    }
    setConfirmDelete(null);
  };

  return (
    <AdminLayout>
      <PageHeader
        title="All Projects"
        subtitle={pagination ? `${pagination.total} project${pagination.total !== 1 ? 's' : ''} total` : ''}
        actions={
          <div className="flex items-center gap-2">
            {canDelete && (
              <button
                onClick={() => setShowTrash(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300
                  dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg
                  hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200
                  transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Trash
              </button>
            )}
            <button
              onClick={() => navigate('/admin/projects/create')}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              + New Project
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        <ProjectFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          loading={loading.projects}
        />

        <ProjectTable
          projects={projects}
          loading={loading.projects}
          onDelete={canDelete ? (project) => setConfirmDelete(project) : null}
        />

        {/* ✅ NEW: Reusable Admin Pagination */}
        {pagination?.last_page > 1 && (
          <div className="mt-6 flex justify-center">
            <AdminPagination 
              pagination={pagination} 
              onPageChange={handlePageChange} 
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Project
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {confirmDelete.title}
              </span>
              ? This action can be undone by a super admin.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600
                  text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50
                  dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={loading.submitting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700
                  disabled:opacity-60 transition-colors"
              >
                {loading.submitting ? 'Deleting...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {showTrash && <ProjectTrashModal onClose={() => setShowTrash(false)} />}
    </AdminLayout>
  );
};

export default Projects;