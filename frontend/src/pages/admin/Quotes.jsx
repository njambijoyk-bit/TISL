import { useState, useEffect } from 'react';
import { Eye, Plus, Reply, CheckCircle, XCircle, Trash2, RotateCcw, X, AlertTriangle, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Select from '../../components/common/Select';
import Modal from '../../components/common/Modal';
import AdminPagination from '../../components/common/AdminPagination';
import QuoteStatusBadge from '../../components/admin/QuoteStatusBadge';
import Badge from '../../components/common/Badge';
import { quotesAPI } from '../../api';
import { useAuthStore, useQuoteStore } from '../../store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Quotes() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const { quotes, loading, pagination, fetchQuotes } = useQuoteStore();
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
  });


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

  // Replace local fetchQuotes with store action call
  const loadQuotes = async (page = 1) => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([_, value]) => value !== '' && value != null)
    );
    await fetchQuotes({ ...params, page, per_page: 20 });
  };

  // Reset page when filters change
  useEffect(() => {
    loadQuotes(1);
  }, [filters]);

  // Initial load
  useEffect(() => {
    loadQuotes(1);
  }, []);

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
          <p className="font-semibold text-primary">
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
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20,
              background: 'rgba(168,85,247,0.06)',
              border: '1.5px solid rgba(168,85,247,0.15)',
              color: '#ff91f2', fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 150ms ease-out',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(168,85,247,0.12)';
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 3px 8px rgba(168,85,247,0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)';
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'none';
            }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

          {/* View */}
          <button
            onClick={() => navigate(`/admin/quotes/${quote.id}`)}
            title="View Details"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              background: 'rgba(168,85,247,0.06)',
              border: '1.5px solid rgba(168,85,247,0.15)',
              color: '#7c3aed', transition: 'all 150ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(168,85,247,0.14)';
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)';
            }}
          >
            <Eye size={15} />
          </button>

          {/* Respond — green, only on pending */}
          {quote.status === 'pending' && (
            <button
              onClick={() => navigate(`/admin/quotes/${quote.id}/respond`)}
              title="Respond to Quote"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(5,150,105,0.08)',
                border: '1.5px solid rgba(5,150,105,0.2)',
                color: '#065f46', transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(5,150,105,0.15)';
                e.currentTarget.style.borderColor = 'rgba(5,150,105,0.35)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(5,150,105,0.08)';
                e.currentTarget.style.borderColor = 'rgba(5,150,105,0.2)';
              }}
            >
              <Reply size={15} />
            </button>
          )}

        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader title="Quotes" subtitle="Manage customer quote requests">

  {/* Buttons */}
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {[
      { label: 'Create Quote', icon: <Plus size={15} />, onClick: () => navigate('/admin/quotes/create'), color: '#7c3aed', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)' },
      { label: 'Trash', icon: <RotateCcw size={15} />, onClick: openTrashModal, color: '#d73333', bg: 'rgba(215, 51, 51, 0.1)', border: 'rgba(215, 51, 51, 0.3)' },
    ].map(({ label, icon, onClick, color, bg, border }) => (
      <button key={label} onClick={onClick} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
        border: `1px solid ${border}`, background: bg, color, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        {icon} {label}
      </button>
    ))}

    <button
      onClick={softDeleteSelected}
      disabled={!selectedIds.length}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
        border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
        color: selectedIds.length ? '#ef4444' : 'var(--color-text-tertiary)',
        cursor: selectedIds.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: selectedIds.length ? 1 : 0.5,
      }}
    >
      <Trash2 size={15} /> Move to Trash ({selectedIds.length})
    </button>
  </div>

  {/* Filters */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
    {/* Search */}
    <div style={{ position: 'relative' }}>
      <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
      <input
        type="text"
        placeholder="Search quotes..."
        value={filters.search}
        onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        style={{
          width: '100%', padding: '8px 36px', borderRadius: 8, fontSize: '0.875rem',
          border: '1px solid var(--color-border-tertiary)',
          background: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)', outline: 'none',
          fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {filters.search && (
        <button onClick={() => setFilters(f => ({ ...f, search: '' }))}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }}>
          <X size={15} />
        </button>
      )}
    </div>

    {/* Selects + Clear */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {[
        {
          value: filters.status,
          onChange: e => setFilters(f => ({ ...f, status: e.target.value })),
          options: [['', 'All Statuses'], ['pending', 'Pending'], ['reviewed', 'Reviewed'], ['quoted', 'Quoted'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['expired', 'Expired']],
        },
        {
          value: filters.priority,
          onChange: e => setFilters(f => ({ ...f, priority: e.target.value })),
          options: [['', 'All Priorities'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']],
        },
      ].map((sel, i) => (
        <select key={i} value={sel.value} onChange={sel.onChange} style={{
          flex: '1 1 160px', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
          border: '1px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
          color: '#7b51c5', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
        }}>
          {sel.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
      ))}

      {(filters.search || filters.status || filters.priority) && (
        <button
          onClick={() => setFilters({ search: '', status: '', priority: '' })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            border: '1px solid var(--color-border-danger)',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-danger)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          <X size={14} /> Clear Filters
        </button>
      )}
    </div>
  </div>

</PageHeader>

      <DataTable
        columns={columns}
        data={quotes}
        loading={loading}
        emptyMessage="No quotes found"
      />

      {pagination?.last_page > 1 && (
        <AdminPagination 
          pagination={pagination} 
          onPageChange={(page) => loadQuotes(page)} 
        />
      )}

      {/* Customer History Modal */}
      <Modal
        isOpen={customerHistoryModal}
        onClose={() => {
          setCustomerHistoryModal(false);
          setSelectedCustomer(null);
          setCustomerQuotes([]);
          setCustomerQuotesPagination(null);
        }}
        title={`Customer Quote History — ${selectedCustomer?.first_name} ${selectedCustomer?.last_name}`}
        size="lg"
      >
        {selectedCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Email line */}
            <div style={{ fontSize: '0.82rem', color: '#4b5563', margin: 0 }}>
              {selectedCustomer.first_name} {selectedCustomer.last_name} 
              <a
                href={`mailto:${selectedCustomer.email}`}
                className="ml-1 text-s text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:no-underline transition-colors"
              >
                • {selectedCustomer.email}
              </a>
            </div>
            
            {/* Customer summary grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              padding: 14, borderRadius: 10,
              background: 'rgba(168,85,247,0.04)',
              border: '1px solid rgba(168,85,247,0.1)',
            }}>
              {[
                { label: 'Customer ID', value: `#${selectedCustomer.id}` },
                { label: 'Email',       value: selectedCustomer.email },
                { label: 'Phone',       value: selectedCustomer.phone || 'N/A' },
                { label: 'Company',     value: selectedCustomer.company_name || 'N/A' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0, wordBreak: 'break-all' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Stats + quotes */}
            {(() => {
              const list = customerQuotes;
              const totalQuotes = list.length;
              const totalKes = list.reduce((sum, q) => sum + quoteTotalKes(q), 0);
              const avgKes = totalQuotes > 0 ? totalKes / totalQuotes : 0;
              const byStatus = list.reduce((acc, q) => {
                const s = q.status || 'unknown';
                acc[s] = (acc[s] || 0) + 1;
                return acc;
              }, {});
              const kesMissingCount = list.filter((q) => {
                const isForeign = !isKes(q.currency);
                const hasKes = Number(q.total_kes) > 0;
                const hasRate = Number(q.exchange_rate_to_kes) > 0;
                return isForeign && !hasKes && !hasRate;
              }).length;

              if (customerQuotesLoading) return (
                <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Loading customer quotes…</p>
              );

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* Stat cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {/* Total Quotes */}
                    <div style={{ padding: 14, borderRadius: 10, background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
                      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Quotes</p>
                      <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1d4ed8', margin: 0, lineHeight: 1 }}>{totalQuotes}</p>
                    </div>

                    {/* Total Value */}
                    <div style={{ padding: 14, borderRadius: 10, background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.12)' }}>
                      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Value (KES)</p>
                      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#065f46', margin: 0, lineHeight: 1 }}>{kesMoney(totalKes)}</p>
                      {kesMissingCount > 0 && (
                        <p style={{ fontSize: '0.68rem', color: '#b45309', margin: '4px 0 0' }}>
                          {kesMissingCount} foreign quote(s) missing KES conversion
                        </p>
                      )}
                    </div>

                    {/* Avg Quote */}
                    <div style={{ padding: 14, borderRadius: 10, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Quote (KES)</p>
                      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed', margin: 0, lineHeight: 1 }}>{kesMoney(avgKes)}</p>
                    </div>
                  </div>

                  {/* Status breakdown */}
                  <div style={{ padding: 14, borderRadius: 10, background: 'rgba(168,85,247,0.03)', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>Status Breakdown</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {Object.keys(byStatus).length === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No quotes yet</span>
                      ) : (
                        Object.entries(byStatus).map(([status, count]) => (
                          <span key={status} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 20,
                            fontSize: '0.72rem', fontWeight: 700,
                            background: 'rgba(168,85,247,0.08)', color: '#6b21a8',
                            boxShadow: '0 0 0 1px rgba(168,85,247,0.2)',
                          }}>
                            {status}: {count}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Recent quotes */}
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>Recent Quotes</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 380, overflowY: 'auto' }}>
                      {list.length === 0 ? (
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No recent quotes</p>
                      ) : (
                        list.map((q) => {
                          const kes = quoteTotalKes(q);
                          const showKes = !isKes(q.currency);
                          return (
                            <div
                              key={q.id}
                              onClick={() => { setCustomerHistoryModal(false); navigate(`/admin/quotes/${q.id}`); }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 13px', borderRadius: 10, cursor: 'pointer',
                                background: 'white',
                                border: '1px solid rgba(168,85,247,0.1)',
                                transition: 'border-color 150ms, background 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'; }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b21a8' }}>{q.quote_number}</span>
                                  <QuoteStatusBadge status={q.status} />
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                                    background: 'rgba(107,114,128,0.08)', color: '#4b5563',
                                    boxShadow: '0 0 0 1px rgba(107,114,128,0.15)',
                                  }}>
                                    {q.currency || 'KES'}
                                  </span>
                                </div>
                                <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
                                  {format(new Date(q.created_at), 'MMM d, yyyy h:mm a')}
                                  {q.converted_currency_at ? ` • Converted: ${format(new Date(q.converted_currency_at), 'MMM d, yyyy')}` : ''}
                                </p>
                              </div>

                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                                  {money(q.total, q.currency || 'KES')}
                                </p>
                                {showKes && (
                                  <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '2px 0 0' }}>
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
              );
            })()}

          </div>
        )}
      </Modal>
            {showTrashModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>

              {/* Backdrop */}
              <div
                onClick={() => setShowTrashModal(false)}
                style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                }}
              />

              {/* Modal */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{
                  width: '100%', maxWidth: 1000,
                  background: 'white', borderRadius: 14,
                  border: '1px solid rgba(168,85,247,0.15)',
                  boxShadow: '0 8px 40px rgba(168,85,247,0.12), 0 2px 12px rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                }}>

                  {/* Header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: '1.5px solid rgba(168,85,247,0.1)',
                  }}>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                        Quote Trash
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                        Restore items or permanently delete (super admin only).
                      </p>
                    </div>
                    <button
                      onClick={() => setShowTrashModal(false)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: 8,
                        border: 'none', background: 'none',
                        color: '#9ca3af', cursor: 'pointer', transition: 'all 150ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = '#7c3aed'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Filters + Actions */}
                  <div style={{
                    padding: '14px 20px',
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                    justifyContent: 'space-between', gap: 10,
                    borderBottom: '1.5px solid rgba(168,85,247,0.08)',
                  }}>

                    {/* Left: search + status + refresh */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        value={trashFilters.search}
                        onChange={(e) => setTrashFilters((p) => ({ ...p, search: e.target.value }))}
                        placeholder="Search trash..."
                        style={{
                          width: 240, padding: '7px 12px', borderRadius: 8,
                          fontSize: '0.82rem', color: '#111827', fontFamily: 'inherit',
                          background: 'rgba(168,85,247,0.03)',
                          border: '1.5px solid rgba(168,85,247,0.18)', outline: 'none',
                          transition: 'border-color 150ms, box-shadow 150ms',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                      <select
                        value={trashFilters.status}
                        onChange={(e) => setTrashFilters((p) => ({ ...p, status: e.target.value }))}
                        style={{
                          padding: '7px 12px', borderRadius: 8, fontSize: '0.82rem',
                          color: '#111827', fontFamily: 'inherit', cursor: 'pointer',
                          background: 'rgba(168,85,247,0.03)',
                          border: '1.5px solid rgba(168,85,247,0.18)', outline: 'none',
                          transition: 'border-color 150ms, box-shadow 150ms',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
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
                      <button
                        onClick={() => fetchTrash(1)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                          fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                          background: 'rgba(168,85,247,0.06)', color: '#7c3aed',
                          border: '1.5px solid rgba(168,85,247,0.18)', transition: 'all 150ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.12)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; }}
                      >
                        Refresh
                      </button>
                    </div>

                    {/* Right: restore + superadmin delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={restoreSelected}
                        disabled={!selectedIds.length}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '7px 13px', borderRadius: 8, fontFamily: 'inherit',
                          fontSize: '0.82rem', fontWeight: 600, cursor: selectedIds.length ? 'pointer' : 'not-allowed',
                          background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
                          border: '1.5px solid rgba(168,85,247,0.22)',
                          opacity: selectedIds.length ? 1 : 0.4, transition: 'all 150ms',
                        }}
                        onMouseEnter={e => { if (selectedIds.length) { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; }}
                      >
                        <RotateCcw size={14} /> Restore Selected
                      </button>

                      {isSuperAdmin && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
                            <input
                              value={deleteConfirm}
                              onChange={(e) => setDeleteConfirm(e.target.value)}
                              placeholder="Type DELETE"
                              style={{
                                width: 130, padding: '7px 12px', borderRadius: 8,
                                fontSize: '0.82rem', color: '#111827', fontFamily: 'inherit',
                                background: 'rgba(239,68,68,0.04)',
                                border: '1.5px solid rgba(239,68,68,0.2)', outline: 'none',
                                transition: 'border-color 150ms, box-shadow 150ms',
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.1)'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                          </div>
                          <button
                            onClick={forceDeleteSelected}
                            disabled={!selectedIds.length || deleteConfirm !== 'DELETE'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 13px', borderRadius: 8, fontFamily: 'inherit',
                              fontSize: '0.82rem', fontWeight: 600,
                              cursor: (!selectedIds.length || deleteConfirm !== 'DELETE') ? 'not-allowed' : 'pointer',
                              background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                              border: '1.5px solid rgba(239,68,68,0.2)',
                              opacity: (!selectedIds.length || deleteConfirm !== 'DELETE') ? 0.4 : 1,
                              transition: 'all 150ms',
                            }}
                            onMouseEnter={e => { if (selectedIds.length && deleteConfirm === 'DELETE') { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'; } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; }}
                          >
                            <Trash2 size={14} /> Delete Forever
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Trash list */}
                  <div style={{ padding: '0 20px 20px' }}>
                    <DataTable
                      columns={[
                        {
                          header: (
                            <input
                              type="checkbox"
                              checked={trashedQuotes.length > 0 && trashedQuotes.every((q) => selectedIds.includes(q.id))}
                              onChange={() => {
                                setSelectedIds((prev) => {
                                  const ids = trashedQuotes.map((q) => q.id);
                                  const allSelected = ids.every((id) => prev.includes(id));
                                  if (allSelected) return prev.filter((id) => !ids.includes(id));
                                  return Array.from(new Set([...prev, ...ids]));
                                });
                              }}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#a855f7' }}
                            />
                          ),
                          render: (q) => (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(q.id)}
                              onChange={(e) => { e.stopPropagation(); toggleSelect(q.id); }}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#a855f7' }}
                            />
                          ),
                        },
                        {
                          header: 'Quote #',
                          render: (q) => (
                            <div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{q.quote_number}</div>
                              <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1 }}>
                                Deleted: {q.deleted_at ? format(new Date(q.deleted_at), 'MMM d, yyyy') : '—'}
                              </div>
                            </div>
                          ),
                        },
                        {
                          header: 'Customer',
                          render: (q) => (
                            <span style={{ fontSize: '0.82rem', color: '#374151' }}>
                              {q.customer?.first_name} {q.customer?.last_name}
                            </span>
                          ),
                        },
                        {
                          header: 'Status',
                          render: (q) => <QuoteStatusBadge status={q.status} />,
                        },
                        {
                          header: 'Actions',
                          render: (q) => (
                            <button
                              onClick={() => restoreOne(q.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
                                fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
                                background: 'rgba(168,85,247,0.07)', color: '#7c3aed',
                                border: '1.5px solid rgba(168,85,247,0.2)', transition: 'all 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.14)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.07)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; }}
                            >
                              <RotateCcw size={12} /> Restore
                            </button>
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