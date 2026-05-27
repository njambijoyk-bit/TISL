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
  CalendarClock,
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
            <div className="font-semibold text-primary">{service.name}</div>
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
            <div className="text-s text-accent">
              {service.service_category}
            </div>
          )}
          {service.type && (
            <div className="text-xs text-gray-500">
              TYPE: {service.type}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Pricing',
      accessor: (service) => (
        <div>
          <Badge variant="primary" size="sm">
            {getPricingDisplay(service)}
          </Badge>
          <div className="text-s text-gray-500">Pricing: {service.pricing_model}</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Edit */}
          <button
            onClick={() => navigate(`/admin/services/${service.id}/edit`)}
            title="Edit"
            style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#7c3aed', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Edit size={15} />
          </button>

          {/* Publish toggle */}
          {service.status === 'active' ? (
            <button
              onClick={() => handleTogglePublish(service)}
              disabled={actionLoading}
              title="Unpublish"
              style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#f97316', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.5 : 1 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(249,115,22,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <PowerOff size={15} />
            </button>
          ) : (
            <button
              onClick={() => handleTogglePublish(service)}
              disabled={actionLoading}
              title="Publish"
              style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#10b981', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.5 : 1 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Power size={15} />
            </button>
          )}

          {/* Delete */}
          <button
            onClick={() => handleDeleteClick(service)}
            disabled={actionLoading}
            title="Delete"
            style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#ef4444', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.5 : 1 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 size={15} />
          </button>
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
              <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                <Wrench className="w-6 h-6" />
                Services Management
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Manage your service catalog
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

              {/* Trash — outline/neutral */}
              <button
                onClick={openTrashModal}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 9, cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                  background: 'transparent', color: '#6b7280',
                  border: '1.5px solid rgba(107,114,128,0.25)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(107,114,128,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(107,114,128,0.4)';
                  e.currentTarget.style.color = '#374151';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(107,114,128,0.25)';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                <Archive size={15} /> Trash
              </button>

              {/* Add Service — primary/purple */}
              <button
                onClick={() => navigate('/admin/services/new')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 9, cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                  background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
                  border: '1.5px solid rgba(168,85,247,0.25)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.18)';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                }}
              >
                <Plus size={16} /> Add Service
              </button>

              {/* Bookings — primary/purple */}
              <button
                onClick={() => navigate('/admin/bookings')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 9, cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                  background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
                  border: '1.5px solid rgba(168,85,247,0.25)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.18)';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                }}
              >
                <CalendarClock size={16} /> Bookings
              </button>

            </div>
          </div>
        </div>

      {statistics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total',    value: statistics.total_services    || 0, color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',   Icon: BarChart3   },
            { label: 'Active',   value: statistics.active_services   || 0, color: '#10b981', bg: 'rgba(16,185,129,0.1)',  Icon: Power       },
            { label: 'Draft',    value: statistics.draft_services    || 0, color: '#6b7280', bg: 'rgba(107,114,128,0.1)', Icon: Archive     },
            { label: 'Featured', value: statistics.featured_services || 0, color: '#eab308', bg: 'rgba(234,179,8,0.1)',   Icon: CheckSquare },
          ].map(({ label, value, color, bg, Icon }) => (
            <div key={label} style={{
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-tertiary)',
              borderRadius: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              padding: '20px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {label}
                </p>
                <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {value}
                </p>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} style={{ color }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div style={{
          background: 'rgba(168,85,247,0.06)',
          border: '1.5px solid rgba(168,85,247,0.2)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckSquare size={18} style={{ color: '#a855f7' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b21a8' }}>
                {selectedIds.length} service(s) selected
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

              {/* Clear Selection */}
              <button
                onClick={() => setSelectedIds([])}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
                  background: 'transparent', color: '#6b7280',
                  border: '1.5px solid rgba(107,114,128,0.25)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(107,114,128,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(107,114,128,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(107,114,128,0.25)';
                }}
              >
                Clear Selection
              </button>

              {/* Move to Trash — danger/red */}
              <button
                onClick={handleBulkSoftDelete}
                disabled={actionLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8, cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
                  background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                  border: '1.5px solid rgba(239,68,68,0.2)',
                  opacity: actionLoading ? 0.5 : 1,
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => {
                  if (!actionLoading) {
                    e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
                }}
              >
                <Trash2 size={14} /> Move to Trash
              </button>

            </div>
          </div>
        </div>
      )}

      {/* Search + Filter Bar */}
      <div style={{
        borderRadius: 12,
        border: '1px solid rgba(168,85,247,0.12)',
        boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
        padding: 16, marginBottom: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              color: '#9ca3af', pointerEvents: 'none',
            }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 12px 8px 34px', /* 34px = 11px icon left + 15px icon + 8px gap */
                borderRadius: 8, fontSize: '0.82rem', color: '#374151',
                background: 'rgba(168,85,247,0.03)',
                border: '1.5px solid rgba(168,85,247,0.18)',
                outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 150ms, box-shadow 150ms',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#a855f7';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
              background: 'rgba(168,85,247,0.03)',
              border: '1.5px solid rgba(168,85,247,0.18)',
              color: '#374151', outline: 'none',
              fontFamily: 'inherit', cursor: 'pointer',
              transition: 'border-color 150ms, box-shadow 150ms',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#a855f7';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.88rem', color: '#111827', margin: 0 }}>
            Are you sure you want to move <strong style={{ color: '#6b21a8' }}>{selectedIds.length} service(s)</strong> to trash?
          </p>
          <p style={{ fontSize: '0.8rem', color: '#4b5563', margin: 0 }}>
            You can restore them later from the trash.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>

            {/* Cancel */}
            <button
              onClick={() => setShowBulkDeleteModal(false)}
              disabled={actionLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, cursor: actionLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                background: 'transparent', color: '#6b7280',
                border: '1.5px solid rgba(107,114,128,0.25)',
                opacity: actionLoading ? 0.5 : 1, transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                if (!actionLoading) {
                  e.currentTarget.style.background = 'rgba(107,114,128,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(107,114,128,0.4)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(107,114,128,0.25)';
              }}
            >
              Cancel
            </button>

            {/* Move to Trash */}
            <button
              onClick={confirmBulkSoftDelete}
              disabled={actionLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, cursor: actionLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                border: '1.5px solid rgba(239,68,68,0.2)',
                opacity: actionLoading ? 0.5 : 1, transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                if (!actionLoading) {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
              }}
            >
              {actionLoading ? 'Moving...' : 'Move to Trash'}
            </button>

          </div>
        </div>
      </Modal>

      {/* Trash Modal */}
      <Modal
        isOpen={showTrashModal}
        onClose={() => { setShowTrashModal(false); setSelectedTrashIds([]); }}
        title="Trash"
        size="xl"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Bulk Actions */}
          {selectedTrashIds.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(168,85,247,0.06)',
              border: '1.5px solid rgba(168,85,247,0.2)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b21a8' }}>
                {selectedTrashIds.length} service(s) selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>

                {/* Restore Selected */}
                <button
                  onClick={handleBulkRestore}
                  disabled={actionLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8,
                    fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
                    background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
                    border: '1.5px solid rgba(168,85,247,0.25)',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.5 : 1, transition: 'all 150ms',
                  }}
                  onMouseEnter={e => {
                    if (!actionLoading) {
                      e.currentTarget.style.background = 'rgba(168,85,247,0.15)';
                      e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                  }}
                >
                  <RotateCcw size={14} /> Restore Selected
                </button>

                {/* Delete Permanently — superadmin only */}
                {isSuperAdmin && (
                  <button
                    onClick={handleBulkDelete}
                    disabled={actionLoading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8,
                      fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
                      background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                      border: '1.5px solid rgba(239,68,68,0.2)',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading ? 0.5 : 1, transition: 'all 150ms',
                    }}
                    onMouseEnter={e => {
                      if (!actionLoading) {
                        e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                        e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
                    }}
                  >
                    <Trash2 size={14} /> Delete Permanently
                  </button>
                )}

              </div>
            </div>
          )}

          {/* Trashed Services List */}
          {loadingTrash ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', animation: 'spin 0.7s linear infinite', margin: '0 auto 10px' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>Loading...</p>
            </div>
          ) : trashedServices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Archive size={40} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 10px' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No services in trash</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Select All */}
              <div style={{ padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 8 }}>
                <button
                  onClick={toggleAllTrashSelection}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {selectedTrashIds.length === trashedServices.length
                    ? <CheckSquare size={18} style={{ color: '#7c3aed' }} />
                    : <Square size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                  }
                  Select All
                </button>
              </div>

              {/* Services */}
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trashedServices.map(service => {
                  const isSelected = selectedTrashIds.includes(service.id);
                  return (
                    <div
                      key={service.id}
                      onClick={() => toggleTrashSelection(service.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        border: `1px solid ${isSelected ? '#7c3aed' : 'var(--color-border-tertiary)'}`,
                        borderRadius: 8, cursor: 'pointer',
                        background: isSelected ? 'rgba(124,58,237,0.05)' : 'var(--color-background-primary)',
                        transition: 'border-color 150ms, background 150ms',
                      }}
                    >
                      {isSelected
                        ? <CheckSquare size={18} style={{ color: '#7c3aed', flexShrink: 0 }} />
                        : <Square size={18} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                      }

                      {service.main_image && (
                        <img
                          src={service.main_image}
                          alt={service.name}
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {service.name}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
                          SKU: {service.sku} • Deleted {new Date(service.deleted_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={e => { e.stopPropagation(); handleRestore(service); }}
                          disabled={actionLoading}
                          title="Restore"
                          style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#10b981', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.08)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <RotateCcw size={14} />
                        </button>
                        {isSuperAdmin && (
                          <button
                            onClick={e => { e.stopPropagation(); handleSinglePermanentDelete(service.id); }}
                            disabled={actionLoading}
                            title="Delete permanently"
                            style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#ef4444', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--color-border-tertiary)' }}>
            <button
              onClick={() => { setShowTrashModal(false); setSelectedTrashIds([]); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>

        </div>
      </Modal>
    </div>
    </AdminLayout>
  );
};

export default Services;