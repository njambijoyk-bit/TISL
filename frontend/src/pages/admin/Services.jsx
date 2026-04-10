import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wrench, 
  Plus, 
  Search, 
  Filter,
  Edit,
  Trash2,
  Eye,
  Power,
  PowerOff,
  RotateCcw,
  BarChart3,
  Archive,
  CheckSquare,
  Square,
} from 'lucide-react';
import useServiceStore from '../../store/serviceStore';
import useAuthStore from '../../store/authStore';
import { getTrashedServices, restoreMultipleServices, forceDeleteMultipleServices } from '../../api/services';
import AdminLayout from '../../components/layout/AdminLayout';
import DataTable from '../../components/admin/DataTable';
import ServiceStatusBadge from '../../components/admin/ServiceStatusBadge';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';

const Services = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const {
    services,
    pagination,
    loading,
    error,
    statistics,
    fetchAdminServices,
    deleteService,
    restoreService,
    publishService,
    unpublishService,
    fetchStatistics,
    setAdminFilters,
    setSearch,
    setPage,
  } = useServiceStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Trash management
  const [trashedServices, setTrashedServices] = useState([]);
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);
  const [loadingTrash, setLoadingTrash] = useState(false);

  // Bulk selection in main table
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    console.log('Fetching services and statistics...');
    fetchAdminServices();
    fetchStatistics();
  }, []);

  useEffect(() => {
    console.log('Services updated:', { count: services?.length, services });
  }, [services]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchTerm);
    fetchAdminServices();
  };

  const handleStatusFilter = (status) => {
    setStatusFilter(status);
    setAdminFilters({ status: status || null });
    fetchAdminServices();
  };

  const handlePageChange = (page) => {
    setPage(page);
    fetchAdminServices();
  };

  const handleDeleteClick = (service) => {
    setSelectedService(service);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedService) return;
    setActionLoading(true);
    try {
      await deleteService(selectedService.id);
      setShowDeleteModal(false);
      setSelectedService(null);
    } catch (error) {
      console.error('Delete failed:', error);
      alert(error.response?.data?.message || 'Failed to delete service');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async (service) => {
    setActionLoading(true);
    try {
      await restoreService(service.id);
    } catch (error) {
      console.error('Restore failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePublish = async (service) => {
    setActionLoading(true);
    try {
      if (service.status === 'active') {
        await unpublishService(service.id);
      } else {
        await publishService(service.id);
      }
    } catch (error) {
      console.error('Toggle publish failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `KES ${parseFloat(amount || 0).toLocaleString()}`;
  };

  const getPricingDisplay = (service) => {
    if (service.price_is_negotiable) return 'Negotiable';
    switch (service.pricing_model) {
      case 'hourly': return `${formatCurrency(service.hourly_rate)}/hr`;
      case 'daily': return `${formatCurrency(service.daily_rate)}/day`;
      case 'fixed':
      case 'project_based': return formatCurrency(service.base_price);
      case 'subscription': return `${formatCurrency(service.base_price)}/mo`;
      default: return service.base_price ? formatCurrency(service.base_price) : 'N/A';
    }
  };

  // Bulk selection handlers for main table
  const handleSelectAll = () => {
    if (selectedIds.length === services.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(services.map(s => s.id));
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkSoftDelete = async () => {
    if (selectedIds.length === 0) return;
    setShowBulkDeleteModal(true);
  };

  const confirmBulkSoftDelete = async () => {
    setActionLoading(true);
    try {
      // Delete each service (soft delete)
      await Promise.all(selectedIds.map(id => deleteService(id)));
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      alert(`${selectedIds.length} service(s) moved to trash`);
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Failed to delete services');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (selectedIds.length === 0 || !isSuperAdmin) return;
    
    if (!confirm(`Permanently delete ${selectedIds.length} service(s)? This cannot be undone!`)) {
      return;
    }

    setActionLoading(true);
    try {
      await forceDeleteMultipleServices(selectedIds);
      setSelectedIds([]);
      fetchAdminServices();
      alert(`${selectedIds.length} service(s) permanently deleted`);
    } catch (error) {
      console.error('Permanent delete failed:', error);
      alert('Failed to permanently delete services');
    } finally {
      setActionLoading(false);
    }
  };

  // Trash modal functions
  const openTrashModal = async () => {
    setShowTrashModal(true);
    setLoadingTrash(true);
    try {
      const data = await getTrashedServices();
      setTrashedServices(data.data || data);
    } catch (error) {
      console.error('Failed to load trashed services:', error);
      setTrashedServices([]);
    } finally {
      setLoadingTrash(false);
    }
  };

  const toggleTrashSelection = (id) => {
    setSelectedTrashIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllTrashSelection = () => {
    if (selectedTrashIds.length === trashedServices.length) {
      setSelectedTrashIds([]);
    } else {
      setSelectedTrashIds(trashedServices.map(s => s.id));
    }
  };

  const handleBulkRestore = async () => {
    if (selectedTrashIds.length === 0) return;
    
    setActionLoading(true);
    try {
      await restoreMultipleServices(selectedTrashIds);
      setTrashedServices(prev => prev.filter(s => !selectedTrashIds.includes(s.id)));
      setSelectedTrashIds([]);
      fetchAdminServices(); // Refresh main list
      alert(`${selectedTrashIds.length} service(s) restored successfully`);
    } catch (error) {
      console.error('Bulk restore failed:', error);
      alert('Failed to restore services');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTrashIds.length === 0 || !isSuperAdmin) return;
    
    if (!confirm(`Permanently delete ${selectedTrashIds.length} service(s)? This cannot be undone!`)) {
      return;
    }

    setActionLoading(true);
    try {
      await forceDeleteMultipleServices(selectedTrashIds);
      setTrashedServices(prev => prev.filter(s => !selectedTrashIds.includes(s.id)));
      setSelectedTrashIds([]);
      alert(`${selectedTrashIds.length} service(s) permanently deleted`);
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Failed to delete services');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSinglePermanentDelete = async (serviceId) => {
    if (!isSuperAdmin) return;
    
    if (!confirm('Permanently delete this service? This cannot be undone!')) {
      return;
    }

    setActionLoading(true);
    try {
      await forceDeleteMultipleServices([serviceId]);
      setTrashedServices(prev => prev.filter(s => s.id !== serviceId));
      alert('Service permanently deleted');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete service');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Service',
      accessor: (service) => (
        <div className="flex items-center gap-3">
          {service.main_image && (
            <img
              src={service.main_image}
              alt={service.name}
              className="w-12 h-12 object-cover rounded"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
          <div>
            <div className="font-semibold text-gray-900 dark:text-white">{service.name}</div>
            {service.sku && <div className="text-xs text-gray-500">SKU: {service.sku}</div>}
          </div>
        </div>
      ),
    },
    {
      header: 'Category & Type',
      accessor: (service) => (
        <div className="space-y-1">
          {service.service_category && (
            <Badge variant="primary" size="sm">
              {service.service_category}
            </Badge>
          )}
          {service.type && (
            <div className="text-xs text-gray-600 dark:text-gray-400 capitalize">
              {service.type}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Pricing',
      accessor: (service) => (
        <div>
          <div className="font-semibold">{getPricingDisplay(service)}</div>
          <div className="text-xs text-gray-500">{service.pricing_model}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (service) => <ServiceStatusBadge status={service.status} />,
    },
    {
      header: 'Actions',
      accessor: (service) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/services/${service.id}/edit`)}>
            <Edit className="w-4 h-4" />
          </Button>
          {service.status === 'active' ? (
            <Button variant="ghost" size="sm" onClick={() => handleTogglePublish(service)} disabled={actionLoading}>
              <PowerOff className="w-4 h-4 text-orange-600" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => handleTogglePublish(service)} disabled={actionLoading}>
              <Power className="w-4 h-4 text-green-600" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(service)} disabled={actionLoading}>
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-6 h-6" />
                Services Management
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Manage your service catalog
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={openTrashModal}>
                <Archive className="w-4 h-4 mr-2" />
                Trash
              </Button>
              <Button variant="primary" onClick={() => navigate('/admin/services/new')}>
                <Plus className="w-5 h-5 mr-2" />
                Add Service
              </Button>
            </div>
          </div>
        </div>

      {statistics && (
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-2xl font-bold">{statistics.total_services || 0}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600">Active</p>
            <p className="text-2xl font-bold text-green-600">{statistics.active_services || 0}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600">Draft</p>
            <p className="text-2xl font-bold text-gray-600">{statistics.draft_services || 0}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600">Featured</p>
            <p className="text-2xl font-bold text-yellow-600">{statistics.featured_services || 0}</p>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-900 dark:text-blue-100">
                {selectedIds.length} service(s) selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkSoftDelete}
                disabled={actionLoading}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Move to Trash
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <form onSubmit={handleSearch} className="relative">
            <Input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          </form>
          <Select
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'draft', label: 'Draft' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={services}
        loading={loading}
        pagination={pagination}
        onPageChange={handlePageChange}
        emptyMessage="No services found"
        selectable={true}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        onSelectRow={handleSelectRow}
      />

      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedService(null); }}
        title="Delete Service"
      >
        <div className="space-y-4">
          <p>Are you sure you want to delete <strong>{selectedService?.name}</strong>?</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={actionLoading}>
              {actionLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title="Move Services to Trash"
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to move <strong>{selectedIds.length} service(s)</strong> to trash?
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You can restore them later from the trash.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteModal(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmBulkSoftDelete}
              disabled={actionLoading}
            >
              {actionLoading ? 'Moving...' : 'Move to Trash'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Trash Modal */}
      <Modal
        isOpen={showTrashModal}
        onClose={() => {
          setShowTrashModal(false);
          setSelectedTrashIds([]);
        }}
        title="Trash"
        size="xl"
      >
        <div className="space-y-4">
          {/* Bulk Actions */}
          {selectedTrashIds.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {selectedTrashIds.length} service(s) selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkRestore}
                  disabled={actionLoading}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore Selected
                </Button>
                {isSuperAdmin && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={actionLoading}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Permanently
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Trashed Services List */}
          {loadingTrash ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading...</p>
            </div>
          ) : trashedServices.length === 0 ? (
            <div className="text-center py-8">
              <Archive className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">No services in trash</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select All */}
              <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <button
                  onClick={toggleAllTrashSelection}
                  className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {selectedTrashIds.length === trashedServices.length ? (
                    <CheckSquare className="w-5 h-5 mr-2 text-primary-600" />
                  ) : (
                    <Square className="w-5 h-5 mr-2" />
                  )}
                  Select All
                </button>
              </div>

              {/* Services */}
              <div className="max-h-96 overflow-y-auto space-y-2">
                {trashedServices.map((service) => (
                  <div
                    key={service.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedTrashIds.includes(service.id)
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => toggleTrashSelection(service.id)}
                  >
                    {selectedTrashIds.includes(service.id) ? (
                      <CheckSquare className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                    
                    {service.main_image && (
                      <img
                        src={service.main_image}
                        alt={service.name}
                        className="w-12 h-12 object-cover rounded flex-shrink-0"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {service.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        SKU: {service.sku} • Deleted {new Date(service.deleted_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(service);
                        }}
                        disabled={actionLoading}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSinglePermanentDelete(service.id);
                          }}
                          disabled={actionLoading}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={() => {
                setShowTrashModal(false);
                setSelectedTrashIds([]);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </AdminLayout>
  );
};

export default Services;