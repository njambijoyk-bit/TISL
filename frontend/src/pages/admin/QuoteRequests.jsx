import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Search, 
  Filter, 
  X, 
  UserCheck, 
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  TrendingUp
} from 'lucide-react';
import useQuoteRequestStore from '../../store/quoteRequestStore';
import AdminLayout from '../../components/layout/AdminLayout';
import QuoteRequestCard from '../../components/quotes/QuoteRequestCard';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/layout/EmptyState';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Button from '../../components/common/Button';
import AdminPagination from '../../components/common/AdminPagination';
import Select from '../../components/common/Select';
import Input from '../../components/common/Input';
import Badge from '../../components/common/Badge';

/**
 * QuoteRequests Page (ADMIN)
 * Manage all quote requests from customers
 */
const QuoteRequests = () => {
  const navigate = useNavigate();

  const {
    quoteRequests,
    pagination,
    statistics,
    loading,
    loadingStatistics,
    error,
    fetchAdminQuoteRequests,
    fetchStatistics,
    setFilters,
    setAdminFilters,
    resetFilters,
    setPage,
    setSearch,
  } = useQuoteRequestStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [clarificationFilter, setClarificationFilter] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch requests and statistics on mount
  useEffect(() => {
    fetchAdminQuoteRequests();
    fetchStatistics();
  }, []);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchTerm);
    fetchAdminQuoteRequests();
  };

  // Handle filters
  const handleFilterChange = () => {
    setFilters({ search: searchTerm });
    setAdminFilters({
      status: statusFilter || null,
      priority: priorityFilter || null,
      request_type: typeFilter || null,
      assigned: assignedFilter ? assignedFilter === 'true' : null,
      requires_clarification: clarificationFilter,
    });
    fetchAdminQuoteRequests();
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setPriorityFilter('');
    setTypeFilter('');
    setAssignedFilter('');
    setClarificationFilter(false);
    resetFilters();
    fetchAdminQuoteRequests();
  };

  // Handle page change
  const handlePageChange = (page) => {
    setPage(page);
    fetchAdminQuoteRequests();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Check if filters are active
  const hasActiveFilters = searchTerm || statusFilter || priorityFilter || typeFilter || assignedFilter || clarificationFilter;

  // Handle view request
  const handleViewRequest = (request) => {
    navigate(`/admin/quote-requests/${request.id}`);
  };

  return (
    <AdminLayout>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Page Header */}
      <PageHeader
        title="Quote Requests"
        description="Manage customer quote requests"
        icon={FileText}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        {statistics && !loadingStatistics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total Requests', value: statistics.total_requests, color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  Icon: FileText    },
              { label: 'Pending',        value: statistics.pending,        color: '#eab308', bg: 'rgba(234,179,8,0.1)',   Icon: Clock       },
              { label: 'Under Review',   value: statistics.reviewing,      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', Icon: TrendingUp  },
              { label: 'Quoted',         value: statistics.quoted,         color: '#10b981', bg: 'rgba(16,185,129,0.1)', Icon: CheckCircle },
              { label: 'Rejected',       value: statistics.rejected,       color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  Icon: XCircle     },
              { label: 'Unassigned',     value: statistics.unassigned,     color: '#f97316', bg: 'rgba(249,115,22,0.1)', Icon: AlertCircle },
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

        {/* Filters Section */}
        <div style={{
          background: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-tertiary)',
          borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          padding: '20px 24px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Filters
            </h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{ display: 'none', background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer' }}
              className="lg:hidden"
            >
              <Filter size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search by request number, title, customer name..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch(e)}
                style={{
                  width: '100%', padding: '8px 36px', borderRadius: 8, fontSize: '0.875rem',
                  border: '1px solid var(--color-border-tertiary)',
                  background: 'var(--color-background-primary)',
                  color: '#7c3aed', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setSearch(''); fetchAdminQuoteRequests(); }}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Filter Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                {
                  value: statusFilter, onChange: e => { setStatusFilter(e.target.value); handleFilterChange(); },
                  options: [['', 'All Statuses'], ['pending', 'Pending'], ['reviewing', 'Under Review'], ['quoted', 'Quote Created'], ['rejected', 'Rejected'], ['expired', 'Expired']],
                },
                {
                  value: priorityFilter, onChange: e => { setPriorityFilter(e.target.value); handleFilterChange(); },
                  options: [['', 'All Priorities'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']],
                },
                {
                  value: typeFilter, onChange: e => { setTypeFilter(e.target.value); handleFilterChange(); },
                  options: [['', 'All Types'], ['product', 'Product'], ['service', 'Service'], ['mixed', 'Mixed'], ['not_sure', 'Not Sure']],
                },
                {
                  value: assignedFilter, onChange: e => { setAssignedFilter(e.target.value); handleFilterChange(); },
                  options: [['', 'All Requests'], ['true', 'Assigned'], ['false', 'Unassigned']],
                },
              ].map((sel, i) => (
                <select key={i} value={sel.value} onChange={sel.onChange} style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
                  border: '1px solid var(--color-border-tertiary)',
                  background: '#cccaca',
                  color: '#7b51c5', outline: 'none',
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                  {sel.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              ))}

              {/* Clarification checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={clarificationFilter}
                  onChange={e => { setClarificationFilter(e.target.checked); handleFilterChange(); }}
                  style={{ width: 16, height: 16, accentColor: '#7c3aed', cursor: 'pointer' }}
                />
                Needs Clarification
              </label>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div>
                <button
                  onClick={handleClearFilters}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                    border: '1px solid var(--color-border-danger)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-danger)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <X size={14} /> Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {/* Empty State */}
        {!loading && quoteRequests.length === 0 && (
          <EmptyState
            icon={FileText}
            title={hasActiveFilters ? 'No requests found' : 'No quote requests yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting your filters'
                : 'Customer quote requests will appear here'
            }
          />
        )}

        {/* Quote Requests Grid */}
        {!loading && quoteRequests.length > 0 && (
          <>
            {/* Results Count */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Showing {quoteRequests.length} of {pagination.total} requests
                {pagination.current_page > 1 && ` (Page ${pagination.current_page} of ${pagination.last_page})`}
              </p>
              
              {/* Quick Stats */}
              <div className="flex items-center gap-2">
                {statistics && (
                  <>
                    <Badge variant="warning" size="sm">
                      {statistics.requires_clarification} need clarification
                    </Badge>
                    <Badge variant="danger" size="sm">
                      {statistics.unassigned} unassigned
                    </Badge>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {quoteRequests.map((request) => (
                <QuoteRequestCard
                  key={request.id}
                  request={request}
                  onView={handleViewRequest}
                  showCustomer={true}
                />
              ))}
            </div>
{pagination?.total > 0 && (
  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 text-center">
    Showing {(pagination.current_page - 1) * pagination.per_page + 1}–
    {Math.min(pagination.current_page * pagination.per_page, pagination.total)} of {pagination.total}
  </p>
)}
            {/* Pagination */}
            {pagination?.last_page > 1 && (
              <AdminPagination 
                pagination={pagination} 
                onPageChange={handlePageChange} 
              />
            )}
          </>
        )}

        {/* Additional Statistics */}
        {statistics && !loadingStatistics && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Type */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Requests by Type
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Product</span>
                  <Badge variant="primary">{statistics.by_type.product}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Service</span>
                  <Badge variant="info">{statistics.by_type.service}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Mixed</span>
                  <Badge variant="secondary">{statistics.by_type.mixed}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Not Sure</span>
                  <Badge variant="secondary">{statistics.by_type.not_sure}</Badge>
                </div>
              </div>
            </div>

            {/* By Priority */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Requests by Priority
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Urgent</span>
                  <Badge variant="danger">{statistics.by_priority.urgent}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">High</span>
                  <Badge variant="warning">{statistics.by_priority.high}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Medium</span>
                  <Badge variant="info">{statistics.by_priority.medium}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Low</span>
                  <Badge variant="secondary">{statistics.by_priority.low}</Badge>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </AdminLayout>
  );
};

export default QuoteRequests;