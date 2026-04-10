import { useEffect, useState } from 'react';
import { X, Trash2, RotateCcw, Search, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import useProjectStore from '../../store/projectStore';
import { useAuthStore } from '../../store';

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Confirm modal shared by restore + permanent delete ──────────────────────
const ConfirmDialog = ({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading, icon: Icon }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          confirmClass.includes('red')
            ? 'bg-red-100 dark:bg-red-900/30'
            : 'bg-green-100 dark:bg-green-900/30'
        }`}>
          <Icon className={`w-5 h-5 ${
            confirmClass.includes('red')
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          }`} />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
            text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
            disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-60 transition-colors
            flex items-center gap-2 ${confirmClass}`}
        >
          {loading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Working...
            </>
          ) : (
            confirmLabel
          )}
        </button>
      </div>
    </div>
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────────────
const EmptyTrash = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-4">
      <Trash2 className="w-7 h-7 text-gray-400 dark:text-gray-500" />
    </div>
    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Trash is empty</p>
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Deleted projects will appear here</p>
  </div>
);

// ── Skeleton row ─────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <div className="flex items-center gap-4 p-4 animate-pulse">
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
    </div>
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
    <div className="flex gap-2">
      <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const ProjectTrashModal = ({ onClose }) => {
  const { user } = useAuthStore();
  const {
    trashedProjects,
    trashedPagination,
    loading,
    fetchTrashedProjects,
    restoreProject,
    forceDeleteProject,
  } = useProjectStore();

  const isSuperAdmin = user?.role === 'super_admin';

  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [confirmRestore, setConfirmRestore]     = useState(null); // project object
  const [confirmForceDelete, setConfirmForceDelete] = useState(null); // project object

  // Fetch on mount and whenever search/page changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTrashedProjects({ search, page, per_page: 15 });
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page]);

  const handleRestore = async () => {
    const res = await restoreProject(confirmRestore.id);
    if (res.success) {
      toast.success(`"${confirmRestore.title}" restored.`);
      // Refresh current page; if it becomes empty go back one page
      const remaining = trashedProjects.length - 1;
      const targetPage = remaining === 0 && page > 1 ? page - 1 : page;
      fetchTrashedProjects({ search, page: targetPage, per_page: 15 });
      if (targetPage !== page) setPage(targetPage);
    } else {
      toast.error(res.error || 'Failed to restore project.');
    }
    setConfirmRestore(null);
  };

  const handleForceDelete = async () => {
    const res = await forceDeleteProject(confirmForceDelete.id);
    if (res.success) {
      toast.success(`"${confirmForceDelete.title}" permanently deleted.`);
      const remaining = trashedProjects.length - 1;
      const targetPage = remaining === 0 && page > 1 ? page - 1 : page;
      fetchTrashedProjects({ search, page: targetPage, per_page: 15 });
      if (targetPage !== page) setPage(targetPage);
    } else {
      toast.error(res.error || 'Failed to permanently delete project.');
    }
    setConfirmForceDelete(null);
  };

  const totalPages = trashedPagination?.last_page ?? 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh]
            flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Project Trash</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {trashedPagination?.total ?? 0} deleted project{(trashedPagination?.total ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Super-admin notice */}
          {!isSuperAdmin && (
            <div className="mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-900/20
              border border-amber-200 dark:border-amber-800/50 rounded-lg flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                You can restore projects. Only super admins can permanently delete them.
              </p>
            </div>
          )}

          {/* Search */}
          <div className="px-6 py-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search deleted projects..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                  bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400
                  transition-colors"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading.trash ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
              </div>
            ) : trashedProjects.length === 0 ? (
              <EmptyTrash />
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {trashedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50
                      transition-colors group"
                  >
                    {/* Project info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                          {project.project_number}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {project.title}
                      </p>
                      {project.customer && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {project.customer.first_name} {project.customer.last_name}
                        </p>
                      )}
                    </div>

                    {/* Deleted date */}
                    <div className="hidden sm:block text-right flex-shrink-0">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Deleted</p>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {formatDate(project.deleted_at)}
                      </p>
                    </div>

                    {/* Owner */}
                    {project.owner_admin && (
                      <div className="hidden md:block text-right flex-shrink-0 w-28">
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Owner</p>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">
                          {project.owner_admin.name}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setConfirmRestore(project)}
                        disabled={loading.submitting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                          border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400
                          hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => setConfirmForceDelete(project)}
                          disabled={loading.submitting}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                            border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400
                            hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200
              dark:border-gray-700 flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading.trash}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500
                    hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading.trash}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500
                    hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm restore */}
      {confirmRestore && (
        <ConfirmDialog
          title="Restore Project"
          message={
            <>
              Restore <strong className="text-gray-900 dark:text-white">{confirmRestore.title}</strong>?
              {' '}It will return to the active projects list.
            </>
          }
          confirmLabel="Restore"
          confirmClass="bg-green-600 hover:bg-green-700"
          icon={RotateCcw}
          loading={loading.submitting}
          onConfirm={handleRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}

      {/* Confirm permanent delete */}
      {confirmForceDelete && (
        <ConfirmDialog
          title="Permanently Delete"
          message={
            <>
              Permanently delete <strong className="text-gray-900 dark:text-white">{confirmForceDelete.title}</strong>?
              {' '}This will remove the project and all its data forever. This cannot be undone.
            </>
          }
          confirmLabel="Delete Forever"
          confirmClass="bg-red-600 hover:bg-red-700"
          icon={Trash2}
          loading={loading.submitting}
          onConfirm={handleForceDelete}
          onCancel={() => setConfirmForceDelete(null)}
        />
      )}
    </>
  );
};

export default ProjectTrashModal;