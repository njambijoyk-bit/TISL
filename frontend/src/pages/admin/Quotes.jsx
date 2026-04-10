import { useState, useEffect } from 'react';
import { Eye, Plus, Reply, CheckCircle, XCircle, Trash2, RotateCcw, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Select from '../../components/common/Select';
import Modal from '../../components/common/Modal';
import QuoteStatusBadge from '../../components/admin/QuoteStatusBadge';
import Badge from '../../components/common/Badge';
import { quotesAPI } from '../../api';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
  });

  const navigate = useNavigate();

    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'super_admin';

    // selection
    const [selectedIds, setSelectedIds] = useState([]);

    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerHistoryModal, setCustomerHistoryModal] = useState(false);

    const [customerQuotes, setCustomerQuotes] = useState([]);
    const [customerQuotesPagination, setCustomerQuotesPagination] = useState(null);
    const [customerQuotesLoading, setCustomerQuotesLoading] = useState(false);

    // trash modal state
    const [showTrashModal, setShowTrashModal] = useState(false);
    const [trashedQuotes, setTrashedQuotes] = useState([]);
    const [trashPagination, setTrashPagination] = useState(null);
    const [trashLoading, setTrashLoading] = useState(false);
    const [trashFilters, setTrashFilters] = useState({ search: '', status: '' });

    // permanent delete confirmation
    const [deleteConfirm, setDeleteConfirm] = useState('');

    const toggleSelect = (id) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    const pageIds = quotes.map((q) => q.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    const somePageSelected = pageIds.some((id) => selectedIds.includes(id)) && !allPageSelected;

    const toggleSelectAllPage = () => {
      setSelectedIds((prev) => {
        if (allPageSelected) return prev.filter((id) => !pageIds.includes(id));
        const merged = new Set([...prev, ...pageIds]);
        return Array.from(merged);
      });
    };

    const clearSelection = () => setSelectedIds([]);

  useEffect(() => {
    fetchQuotes();
  }, [filters]);

  const fetchQuotes = async (page = 1) => {
    try {
      setLoading(true);
      const response = await quotesAPI.getAllQuotes({
        ...filters,
        page,
        per_page: 20,
      });

      const list = response?.data?.data ?? response?.data ?? [];
      const meta = response?.data?.meta ?? response?.pagination ?? response?.meta ?? null;

      setQuotes(Array.isArray(list) ? list : []);
      setPagination(meta);
    } catch (error) {
      console.error('Failed to fetch quotes:', error);
      toast.error('Failed to load quotes');
    } finally {
      setLoading(false);
    }
  };

  const handleViewCustomerHistory = async (customer) => {
  setSelectedCustomer(customer);
  setCustomerHistoryModal(true);
  await fetchCustomerQuotes(customer.id, 1);
};

    const fetchTrash = async (page = 1) => {
    try {
      setTrashLoading(true);
      const res = await quotesAPI.getAdminTrashQuotes({
        ...trashFilters,
        page,
        per_page: 20,
      });

      const list = res?.data?.data ?? res?.data ?? [];
      const meta = res?.data?.meta ?? res?.pagination ?? res?.meta ?? null;

      setTrashedQuotes(Array.isArray(list) ? list : []);
      setTrashPagination(meta);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load trash');
    } finally {
      setTrashLoading(false);
    }
  };

  const openTrashModal = async () => {
    setShowTrashModal(true);
    await fetchTrash(1);
  };

  const restoreOne = async (id) => {
    try {
      await quotesAPI.restoreAdminQuote(id);
      toast.success('Restored');
      await fetchTrash(trashPagination?.current_page || 1);
      await fetchQuotes(pagination?.current_page || 1);
    } catch (e) {
      console.error(e);
      toast.error('Restore failed');
    }
  };

  const restoreSelected = async () => {
    const ids = selectedIds.filter((id) => trashedQuotes.some((q) => q.id === id));
    if (!ids.length) return toast.error('No trashed quotes selected');

    try {
      await quotesAPI.restoreMultipleAdminQuotes({ ids });
      toast.success('Restored selection');
      clearSelection();
      await fetchTrash(trashPagination?.current_page || 1);
      await fetchQuotes(pagination?.current_page || 1);
    } catch (e) {
      console.error(e);
      toast.error('Bulk restore failed');
    }
  };

  const forceDeleteSelected = async () => {
    if (!isSuperAdmin) return toast.error('Super admin only');
    if (deleteConfirm !== 'DELETE') return toast.error('Type DELETE to confirm');

    const ids = selectedIds.filter((id) => trashedQuotes.some((q) => q.id === id));
    if (!ids.length) return toast.error('No trashed quotes selected');

    try {
      await quotesAPI.forceDeleteMultipleAdminQuotes({ ids, confirm: 'DELETE' });
      toast.success('Permanently deleted');
      setDeleteConfirm('');
      clearSelection();
      await fetchTrash(trashPagination?.current_page || 1);
      await fetchQuotes(pagination?.current_page || 1);
    } catch (e) {
      console.error(e);
      toast.error('Permanent delete failed');
    }
  };

    const softDeleteSelected = async () => {
    if (!selectedIds.length) return toast.error('Select at least one quote');

    const ids = [...selectedIds];
    let deleted = 0;
    let skipped = 0;

    for (const id of ids) {
      try {
        await quotesAPI.deleteQuote(id);
        deleted += 1;
      } catch (e) {
        skipped += 1;
      }
    }

    if (deleted) toast.success(`Moved ${deleted} to trash`);
    if (skipped) toast(`Skipped ${skipped} (converted needs super admin)`, { icon: '⚠️' });

    clearSelection();
    await fetchQuotes(pagination?.current_page || 1);
  };

  const formatMoney = (amount, decimals = 2) => {
    const n = Number(amount || 0);
    return new Intl.NumberFormat('en-KE', {
      style: 'decimal',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  };

  const currencySymbol = (currency = 'KES') => {
    const map = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
    return map[currency] || currency;
  };

  const money = (value, currency = 'KES', decimals = 2) =>
    `${currencySymbol(currency)} ${formatMoney(value, decimals)}`;

  const kesMoney = (value, decimals = 2) => `KSh ${formatMoney(value, decimals)}`;

  const isKes = (c) => (c || 'KES') === 'KES';

  const quoteTotalKes = (q) => {
    // Prefer saved snapshot values
    if (Number(q?.total_kes) > 0) return Number(q.total_kes);

    const total = Number(q?.total ?? 0);
    if (!total) return 0;

    // If already KES, it's the same
    if (isKes(q?.currency)) return total;

    // Otherwise convert using snapshot rate
    const rate = Number(q?.exchange_rate_to_kes ?? 0);
    return rate > 0 ? total * rate : 0; // 0 means "we don't know rate"
  };

  const fetchCustomerQuotes = async (customerId, page = 1) => {
    try {
      setCustomerQuotesLoading(true);

      const res = await quotesAPI.getAdminCustomerQuotes(customerId, {
        page,
        per_page: 50, // use 200 if you're sure it won't be huge
        sort_by: 'created_at',
        sort_order: 'desc',
        // optional: if you want modal filters later:
        // status: '',
        // search: ''
      });

      const list = res?.data ?? [];
      const meta = res?.meta ?? null;

      setCustomerQuotes(Array.isArray(list) ? list : []);
      setCustomerQuotesPagination(meta);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load customer quotes');
    } finally {
      setCustomerQuotesLoading(false);
    }
  };

  const columns = [
        {
      header: (
        <input
          type="checkbox"
          checked={allPageSelected}
          ref={(el) => {
            if (el) el.indeterminate = somePageSelected;
          }}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelectAllPage();
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      render: (quote) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(quote.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(quote.id);
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    },
    {
      header: 'Quote #',
      render: (quote) => (
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">
            {quote.quote_number}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {format(new Date(quote.created_at), 'MMM d, yyyy')}
          </p>
        </div>
      ),
    },
    {
      header: 'Customer',
      render: (q) => (
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewCustomerHistory(q.customer);
            }}
            className="font-medium text-gray-900 dark:text-white hover:text-primary transition-colors text-left"
          >
            {q.customer?.first_name} {q.customer?.last_name}
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {q.customer?.email}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            ID: {q.customer_id}
          </p>
        </div>
      ),
    },

    {
      header: 'Items',
      render: (quote) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {quote.items?.length || 0} items
        </span>
      ),
    },
    {
      header: 'Amount',
      render: (quote) => {
        const ccy = quote.currency || 'KES';

        // pick the best available "total" field from your API
        const total =
          Number(
            quote.total ??
            quote.quoted_amount ??
            quote.amount ??
            quote.grand_total ??
            0
          );

        const rate = Number(quote.exchange_rate_to_kes ?? quote.rate_to_kes ?? 0);

        const showKes = !isKes(ccy) && rate > 0;

        const totalKes =
          Number(
            quote.total_kes ??
            quote.quoted_amount_kes ??
            (showKes ? total * rate : total)
          );

        if (!total || total <= 0) return <span className="text-gray-500">Pending</span>;

        return (
          <div className="text-left">
            <div className="font-semibold text-primary">
              {money(total, ccy)}
            </div>

            {showKes && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {kesMoney(totalKes)}
              </div>
            )}

            {showKes && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                (1 {ccy} = {formatMoney(rate, 8)} KES
                {quote.converted_at ? ` • ${format(new Date(quote.converted_at), 'MMM d, yyyy')}` : ''}
                )
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Priority',
      render: (quote) => {
        const variant = {
          low: 'default',
          medium: 'warning',
          high: 'danger',
          urgent: 'danger',
        }[quote.priority] || 'default';
        
        return (
          <Badge variant={variant} size="sm">
            {quote.priority || 'Medium'}
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      render: (quote) => <QuoteStatusBadge status={quote.status} />,
    },
    {
      header: 'Valid Until',
      render: (quote) => (
        quote.valid_until ? (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {format(new Date(quote.valid_until), 'MMM d, yyyy')}
          </span>
        ) : (
          <span className="text-sm text-gray-500">-</span>
        )
      ),
    },
    {
      header: 'Actions',
      render: (quote) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => window.location.href = `/admin/quotes/${quote.id}`}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="View Details"
          >
            <Eye size={18} className="text-blue-500" />
          </button>
          {quote.status === 'pending' && (
            <button
              onClick={() => window.location.href = `/admin/quotes/${quote.id}/respond`}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Respond to Quote"
            >
              <Reply size={18} className="text-green-500" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Quotes"
        subtitle="Manage customer quote requests"
      >
        <div className="flex gap-2">

          <Button
            onClick={() => navigate('/admin/quotes/create')}
            icon={<Plus size={16} />}
            variant="primary"
          >
            Create Quote
          </Button>

          <Button
            onClick={openTrashModal}
            icon={<RotateCcw size={16} />}
            variant="secondary"
          >
            Trash
          </Button>

          <Button
            onClick={softDeleteSelected}
            icon={<Trash2 size={16} />}
            variant="danger"
            disabled={!selectedIds.length}
          >
            Move to Trash ({selectedIds.length})
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <SearchBar
            placeholder="Search quotes..."
            onSearch={(query) => setFilters({ ...filters, search: query })}
            defaultValue={filters.search}
          />
          <Select
            name="status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'quoted', label: 'Quoted' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
          <Select
            name="priority"
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            options={[
              { value: '', label: 'All Priorities' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={quotes}
        loading={loading}
        pagination={pagination}
        onPageChange={fetchQuotes}
        emptyMessage="No quotes found"
      />

      {/* Customer History Modal */}
            <Modal
        isOpen={customerHistoryModal}
        onClose={() => {
          setCustomerHistoryModal(false);
          setSelectedCustomer(null);
          setCustomerQuotes([]);
          setCustomerQuotesPagination(null);
        }}
        title={`Customer Quote History - ${selectedCustomer?.first_name} ${selectedCustomer?.last_name}`}
        size="lg"
      >
        {selectedCustomer && (
          <div className="space-y-6 bg-[var(--bg-primary)] text-[var(--text-primary)]">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedCustomer?.first_name} {selectedCustomer?.last_name}
                    <a
                      href={`mailto:${selectedCustomer.email}`}
                      className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:no-underline transition-colors"
                    >
                      • {selectedCustomer.email}
                    </a>
                  </p>
                  {/* Customer Summary */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Customer ID</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        #{selectedCustomer.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Email</p>
                      <p className="font-semibold text-gray-900 dark:text-white break-all">
                        {selectedCustomer.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Phone</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {selectedCustomer.phone || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Company</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {selectedCustomer.company_name || 'N/A'}
                      </p>
                    </div>
                  </div>
      
                  {/* Customer Stats + Recent Quotes */}
                  {(() => {
                    const list = customerQuotes; // state
                    const totalQuotes = list.length;

                    const totalKes = list.reduce((sum, q) => sum + quoteTotalKes(q), 0);
                    const avgKes = totalQuotes > 0 ? totalKes / totalQuotes : 0;

                    const byStatus = list.reduce((acc, q) => {
                      const s = q.status || 'unknown';
                      acc[s] = (acc[s] || 0) + 1;
                      return acc;
                    }, {});

                    const recent = [...list]
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 10);

                    const kesMissingCount = list.filter((q) => {
                      const isForeign = !isKes(q.currency);
                      const hasKes = Number(q.total_kes) > 0;
                      const hasRate = Number(q.exchange_rate_to_kes) > 0;
                      return isForeign && !hasKes && !hasRate;
                    }).length;

                    // show "loading" nicely
                    if (customerQuotesLoading) {
                      return <div className="text-sm text-gray-500">Loading customer quotes...</div>;
                    }

                    return (
                      <>
                      <div className="space-y-6">
                        {/* Stats cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Total Quotes</p>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalQuotes}</p>
                          </div>

                          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Total Value (KES)</p>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                              {kesMoney(totalKes)}
                            </p>
                            {kesMissingCount > 0 && (
                              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                {kesMissingCount} foreign quote(s) missing KES conversion
                              </p>
                            )}
                          </div>

                          <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Avg Quote (KES)</p>
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                              {kesMoney(avgKes)}
                            </p>
                          </div>
                        </div>

                        {/* Status breakdown */}
                        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                          <p className="font-semibold text-gray-900 dark:text-white mb-3">Status Breakdown</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(byStatus).length === 0 ? (
                              <span className="text-sm text-gray-500">No quotes yet</span>
                            ) : (
                              Object.entries(byStatus).map(([status, count]) => (
                                <Badge key={status} variant="default" size="sm">
                                  {status}: {count}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Recent quotes */}
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                            Recent Quotes
                          </h4>

                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            
                            {list.length === 0 ? (
                              <div className="text-sm text-gray-500">No recent quotes</div>
                            ) : (
                              list.map((q) => {
                                const kes = quoteTotalKes(q);
                                const showKes = !isKes(q.currency);

                                return (
                                  <div
                                    key={q.id}
                                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                    onClick={() => {
                                      setCustomerHistoryModal(false);
                                      navigate(`/admin/quotes/${q.id}`);
                                    }}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold text-primary">
                                          {q.quote_number}
                                        </p>
                                        <QuoteStatusBadge status={q.status} />
                                        <Badge variant="default" size="sm">
                                          {q.currency || 'KES'}
                                        </Badge>
                                      </div>

                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {format(new Date(q.created_at), 'MMM d, yyyy h:mm a')}
                                        {q.converted_currency_at
                                          ? ` • Converted: ${format(new Date(q.converted_currency_at), 'MMM d, yyyy')}`
                                          : ''}
                                      </p>
                                    </div>

                                    <div className="text-right">
                                      {/* Original currency total */}
                                      <p className="font-bold text-gray-900 dark:text-white">
                                        {money(q.total, q.currency || 'KES')}
                                      </p>

                                      {/* KES equivalent (only if foreign) */}
                                      {showKes && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                          {kes > 0 ? `≈ ${kesMoney(kes)}` : 'KES N/A'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                      </>
                    );
                  })()}
                  
                </div>
              )}
            </Modal>
            {showTrashModal && (
            <div className="fixed inset-0 z-50">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-xl"
                onClick={() => setShowTrashModal(false)}
              />

              {/* Modal */}
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Quote Trash
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Restore items or permanently delete (super admin only).
                      </p>
                    </div>

                    <button
                      onClick={() => setShowTrashModal(false)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Filters + actions */}
                  <div className="px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex gap-2 w-full md:w-auto">
                      <input
                        value={trashFilters.search}
                        onChange={(e) => setTrashFilters((p) => ({ ...p, search: e.target.value }))}
                        placeholder="Search trash..."
                        className="w-full md:w-72 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                      />
                      <select
                        value={trashFilters.status}
                        onChange={(e) => setTrashFilters((p) => ({ ...p, status: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                      >
                        <option value="">All Statuses</option>
                        <option value="draft">Draft</option>
                        <option value="pending">Pending</option>
                        <option value="revised">Revised</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="expired">Expired</option>
                        <option value="converted">Converted</option>
                      </select>

                      <Button onClick={() => fetchTrash(1)} variant="secondary">
                        Refresh
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={restoreSelected}
                        icon={<RotateCcw size={16} />}
                        variant="primary"
                        disabled={!selectedIds.length}
                      >
                        Restore Selected
                      </Button>

                      {isSuperAdmin && (
                        <>
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-orange-500" />
                            <input
                              value={deleteConfirm}
                              onChange={(e) => setDeleteConfirm(e.target.value)}
                              placeholder="Type DELETE"
                              className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                            />
                          </div>

                          <Button
                            onClick={forceDeleteSelected}
                            icon={<Trash2 size={16} />}
                            variant="danger"
                            disabled={!selectedIds.length || deleteConfirm !== 'DELETE'}
                          >
                            Delete Forever
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Trash list */}
                  <div className="px-5 pb-5">
                    <DataTable
                      columns={[
                        {
                          header: (
                            <input
                              type="checkbox"
                              checked={
                                trashedQuotes.length > 0 &&
                                trashedQuotes.every((q) => selectedIds.includes(q.id))
                              }
                              onChange={() => {
                                setSelectedIds((prev) => {
                                  const ids = trashedQuotes.map((q) => q.id);
                                  const allSelected = ids.every((id) => prev.includes(id));
                                  if (allSelected) return prev.filter((id) => !ids.includes(id));
                                  return Array.from(new Set([...prev, ...ids]));
                                });
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          ),
                          render: (q) => (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(q.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelect(q.id);
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          ),
                        },
                        {
                          header: 'Quote #',
                          render: (q) => (
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {q.quote_number}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Deleted: {q.deleted_at ? format(new Date(q.deleted_at), 'MMM d, yyyy') : '-'}
                              </div>
                            </div>
                          ),
                        },
                        {
                          header: 'Customer',
                          render: (q) => (
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {q.customer?.first_name} {q.customer?.last_name}
                            </div>
                          ),
                        },
                        {
                          header: 'Status',
                          render: (q) => <QuoteStatusBadge status={q.status} />,
                        },
                        {
                          header: 'Actions',
                          render: (q) => (
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => restoreOne(q.id)}
                                variant="secondary"
                                size="sm"
                              >
                                Restore
                              </Button>
                            </div>
                          ),
                        },
                      ]}
                      data={trashedQuotes}
                      loading={trashLoading}
                      pagination={trashPagination}
                      onPageChange={fetchTrash}
                      emptyMessage="Trash is empty"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

    </AdminLayout>
  );
}