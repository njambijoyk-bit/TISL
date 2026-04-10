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
import QuoteRequestCard from '../../components/quotes/QuoteRequestCard';
import PageHeader from '../../components/layout/PageHeader';
import EmptyState from '../../components/layout/EmptyState';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Button from '../../components/common/Button';
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
            {/* Total Requests */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Total Requests
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {statistics.total_requests}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                  <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            {/* Pending */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Pending
                  </p>
                  <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">
                    {statistics.pending}
                  </p>
                </div>
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
              </div>
            </div>

            {/* Under Review */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Under Review
                  </p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                    {statistics.reviewing}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                  <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            {/* Quoted */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Quoted
                  </p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                    {statistics.quoted}
                  </p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            {/* Rejected */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Rejected
                  </p>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                    {statistics.rejected}
                  </p>
                </div>
                <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full">
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </div>

            {/* Unassigned */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Unassigned
                  </p>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-2">
                    {statistics.unassigned}
                  </p>
                </div>
                <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-full">
                  <AlertCircle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Filters
            </h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden text-primary-600 dark:text-primary-400 hover:text-primary-700"
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>

          <div className={`space-y-4 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            {/* Search */}
            <form onSubmit={handleSearch} className="relative">
              <Input
                type="text"
                placeholder="Search by request number, title, customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSearch('');
                    fetchAdminQuoteRequests();
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </form>

            {/* Filter Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Status Filter */}
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  handleFilterChange();
                }}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="reviewing">Under Review</option>
                <option value="quoted">Quote Created</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </Select>

              {/* Priority Filter */}
              <Select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  handleFilterChange();
                }}
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>

              {/* Type Filter */}
              <Select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  handleFilterChange();
                }}
              >
                <option value="">All Types</option>
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="mixed">Mixed</option>
                <option value="not_sure">Not Sure</option>
              </Select>

              {/* Assigned Filter */}
              <Select
                value={assignedFilter}
                onChange={(e) => {
                  setAssignedFilter(e.target.value);
                  handleFilterChange();
                }}
              >
                <option value="">All Requests</option>
                <option value="true">Assigned</option>
                <option value="false">Unassigned</option>
              </Select>

              {/* Clarification Filter */}
              <div className="flex items-center">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clarificationFilter}
                    onChange={(e) => {
                      setClarificationFilter(e.target.checked);
                      handleFilterChange();
                    }}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Needs Clarification
                  </span>
                </label>
              </div>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="w-full sm:w-auto"
              >
                <X className="w-4 h-4 mr-2" />
                Clear All Filters
              </Button>
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

            {/* Pagination */}
            {pagination.last_page > 1 && (
              <div className="flex items-center justify-center gap-2">
                {/* Previous Button */}
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                  disabled={pagination.current_page === 1}
                >
                  Previous
                </Button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                    let pageNum;

                    // Show pages around current page
                    if (pagination.last_page <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.current_page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.current_page >= pagination.last_page - 2) {
                      pageNum = pagination.last_page - 4 + i;
                    } else {
                      pageNum = pagination.current_page - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={pagination.current_page === pageNum ? 'primary' : 'outline'}
                        onClick={() => handlePageChange(pageNum)}
                        className="min-w-[40px]"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                {/* Next Button */}
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                  disabled={pagination.current_page === pagination.last_page}
                >
                  Next
                </Button>
              </div>
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
  );
};

export default QuoteRequests;