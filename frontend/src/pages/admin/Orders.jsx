import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, 
  Clock, 
  Calendar, 
  DollarSign, 
  Eye, 
  CheckCircle, 
  Truck,
  AlertTriangle,
  Download,
  RefreshCw,
  Filter,
  X,
  RotateCcw,
  Plus,
  Trash2,
  ShoppingBag,
  TrendingUp
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import StatsCard from '../../components/admin/StatsCard';
import Select from '../../components/common/Select';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Textarea from '../../components/common/TextArea';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import CreateOrderModal from '../../components/admin/CreateOrderModal';
import OrderStatusBadge from '../../components/admin/OrderStatusBadge';
import PaymentStatusBadge from '../../components/admin/PaymentStatusBadge';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useOrderStore from '../../store/orderStore';
import { ordersAPI } from '../../api';
import { useAuthStore } from '../../store';

import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Orders() {
  const navigate = useNavigate();

  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const { 
    orders, 
    statistics, 
    loading, 
    fetchAllOrders, 
    fetchStatistics,
    confirmOrder
  } = useOrderStore();

  const [filters, setFilters] = useState({
    search: '',
    status: '',
    payment_status: '',
    order_type: '',
    start_date: '',
    end_date: '',
  });

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistoryModal, setCustomerHistoryModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrdersPagination, setCustomerOrdersPagination] = useState(null);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);

  const [pagination, setPagination] = useState(null);

  const [trashWarnOpen, setTrashWarnOpen] = useState(false);
  const [trashWarnOrders, setTrashWarnOrders] = useState([]); // full order objects
  const [trashWarnLoading, setTrashWarnLoading] = useState(false);

  // trash modal
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashedOrders, setTrashedOrders] = useState([]);
  const [trashPagination, setTrashPagination] = useState(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashFilters, setTrashFilters] = useState({ search: '', status: '' });

  // trash selection
  const [trashSelectedIds, setTrashSelectedIds] = useState([]);

  // permanent delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [selectedOrders, setSelectedOrders] = useState([]);
  const [bulkCancelModal, setBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');

  const [bulkRestoreModal, setBulkRestoreModal] = useState(false);
  const [bulkRestoreReason, setBulkRestoreReason] = useState('');

  const [createOrderModal, setCreateOrderModal] = useState(false);

  const orderTotalKes = (o) => {
    if (Number(o?.total_kes) > 0) return Number(o.total_kes);

    const total = Number(o?.total ?? 0);
    if (!total) return 0;

    if (isKes(o?.currency)) return total;

    const rate = Number(o?.exchange_rate_to_kes ?? 0);
    return rate > 0 ? total * rate : 0;
  };

  const fetchCustomerOrders = async (customerId, page = 1) => {
    try {
      setCustomerOrdersLoading(true);

      const res = await ordersAPI.getAdminCustomerOrders(customerId, {
        page,
        per_page: 10,
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      const list = res?.data ?? [];
      const meta = res?.meta ?? null;

      setCustomerOrders(Array.isArray(list) ? list : []);
      setCustomerOrdersPagination(meta);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load customer orders');
    } finally {
      setCustomerOrdersLoading(false);
    }
  };

  const toggleTrashSelect = (id) =>
    setTrashSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clearTrashSelection = () => setTrashSelectedIds([]);

  const fetchTrash = async (page = 1) => {
    try {
      setTrashLoading(true);
      const res = await ordersAPI.getTrashOrders({ ...trashFilters, page, per_page: 20 });

      const list = res?.data?.data ?? res?.data ?? [];
      const meta = res?.data?.meta ?? res?.pagination ?? res?.meta ?? null;

      setTrashedOrders(Array.isArray(list) ? list : []);
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
    clearTrashSelection();
    setDeleteConfirm('');
    await fetchTrash(1);
  };
  
  const refreshMain = async () => {
    await Promise.all([loadOrders(), loadStatistics()]);
  };

  const refreshTrashAndMain = async () => {
    await Promise.all([
      fetchTrash(trashPagination?.current_page || 1),
      refreshMain(),
    ]);
  };

  const doTrashSelected = async () => {
    if (!selectedOrders.length) return toast.error('Select at least one order');

    let deleted = 0;
    let skipped = 0;

    for (const id of selectedOrders) {
      try {
        await ordersAPI.trashOrder(id);
        deleted++;
      } catch (e) {
        skipped++;
      }
    }

    if (deleted) toast.success(`Moved ${deleted} to trash`);
    if (skipped) toast(`Skipped ${skipped} (not allowed)`, { icon: '⚠️' });

    setSelectedOrders([]);
    await refreshMain();
  };

  const softDeleteSelected = async () => {
    if (!selectedOrders.length) return toast.error('Select at least one order');

    // Build list of selected order objects
    const selected = orders.filter((o) => selectedOrders.includes(o.id));

    // Risky statuses we want to warn about
    const risky = selected.filter((o) => ['shipped', 'delivered'].includes(o.status));

    // Super admin can trash anything, but warn for risky
    if (isSuperAdmin && risky.length > 0) {
      setTrashWarnOrders(risky);
      setTrashWarnOpen(true);
      return;
    }

    // Non-risky OR not super admin → proceed normally (backend enforces)
    await doTrashSelected();
  };

  const restoreOne = async (id) => {
    try {
      await ordersAPI.restoreTrashedOrder(id);
      toast.success('Restored');
      await refreshTrashAndMain();
    } catch (e) {
      console.error(e);
      toast.error('Restore failed');
    }
  };

  const restoreSelected = async () => {
    if (!trashSelectedIds.length) return toast.error('No trashed orders selected');

    try {
      await ordersAPI.restoreMultipleTrashedOrders(trashSelectedIds);
      toast.success('Restored selected');
      clearTrashSelection();
      await refreshTrashAndMain();
    } catch (e) {
      console.error(e);
      toast.error('Bulk restore failed');
    }
  };

  const forceDeleteSelected = async () => {
    if (!isSuperAdmin) return toast.error('Super admin only');
    if (deleteConfirm !== 'DELETE') return toast.error('Type DELETE to confirm');
    if (!trashSelectedIds.length) return toast.error('No trashed orders selected');

    try {
      await ordersAPI.forceDeleteMultipleOrders(trashSelectedIds);
      toast.success('Permanently deleted');
      setDeleteConfirm('');
      clearTrashSelection();
      await refreshTrashAndMain();
    } catch (e) {
      console.error(e);
      toast.error('Permanent delete failed');
    }
  };

  const hasPendingPaid = Array.isArray(orders)
  ? orders.some(
      (o) => o.status === 'pending' && o.payment_status === 'paid'
    )
  : false;

  useEffect(() => {
    loadOrders();
    loadStatistics();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [filters]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadOrders();
        loadStatistics();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Orders.jsx
  const loadOrders = async () => {
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '' && value != null)
      );

      await fetchAllOrders(params);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const handleCreateOrder = async (orderData) => {
    try {
      const { adminCreateOrder } = useOrderStore.getState();
      const response = await adminCreateOrder(orderData);
      
      toast.success(
        `Order ${response.order.order_number} created successfully!`,
        { duration: 4000 }
      );
      
      // Refresh orders list
      await loadOrders();
      
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create order');
      throw error; // Re-throw so modal knows it failed
    }
  };

  const loadStatistics = async () => {
    try {
      await fetchStatistics();
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    }
  };

  const handleConfirm = async (orderId, e) => {
    e?.stopPropagation();
    try {
      await confirmOrder(orderId);
      toast.success('Order confirmed successfully!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to confirm order');
    }
  };

  const handleExport = () => {
    toast.success('Export functionality coming soon!');
  };

  const handleRefresh = () => {
    loadOrders();
    loadStatistics();
    toast.success('Orders refreshed!');
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      status: '',
      payment_status: '',
      order_type: '',
      from_date: '',
      to_date: '',
    });
  };

  const handleViewCustomerHistory = async (customer) => {
    setSelectedCustomer(customer);
    setCustomerHistoryModal(true);

    setCustomerOrders([]);
    setCustomerOrdersPagination(null);

    await fetchCustomerOrders(customer.id, 1);
  };

  const handleBulkCancel = async () => {
    if (!bulkCancelReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    try {
      const { bulkCancelOrders } = useOrderStore.getState();
      const response = await bulkCancelOrders({
        order_ids: selectedOrders,
        cancellation_reason: bulkCancelReason,
      });
      
      toast.success(response.message);
      
      if (response.failed_orders?.length > 0) {
        toast.error(`${response.failed_orders.length} orders require manual processing`);
      }
      
      setSelectedOrders([]);
      setBulkCancelModal(false);
      setBulkCancelReason('');
      loadOrders();
    } catch (error) {
      toast.error('Failed to cancel orders');
    }
  };

  const handleBulkRestore = async () => {
    try {
      const { bulkRestoreOrders } = useOrderStore.getState();
      const response = await bulkRestoreOrders(selectedOrders, bulkRestoreReason);
      
      toast.success(response.message);
      
      // Show refund notification if any orders had refunds
      if (response.refund_notification) {
        toast.info(response.refund_notification, { duration: 6000 });
      }
      
      if (response.failed_orders?.length > 0) {
        toast.error(`${response.failed_orders.length} orders failed to restore`);
      }
      
      setSelectedOrders([]);
      setBulkRestoreModal(false);
      setBulkRestoreReason('');
      loadOrders();
    } catch (error) {
      toast.error('Failed to restore orders');
    }
  };

  // Check if all selected orders are cancelled
  const allSelectedCancelled = selectedOrders.length > 0 && 
    selectedOrders.every(id => {
      const order = orders.find(o => o.id === id);
      return order?.status === 'cancelled';
    });

  // Check if any selected orders are cancelled
  const anySelectedCancelled = selectedOrders.some(id => {
    const order = orders.find(o => o.id === id);
    return order?.status === 'cancelled';
  });

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

  const isKes = (c) => (c || 'KES') === 'KES';

  const showKesForOrder = (order) =>
    !isKes(order?.currency) && Number(order?.exchange_rate_to_kes) > 0;

  // KES formatter (always KES)
  const kesMoney = (value, decimals = 2) => `KSh ${formatMoney(value, decimals)}`;


  const columns = [
        {
          header: (
          <input
            type="checkbox"
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedOrders(orders.map((o) => o.id));
              } else {
                setSelectedOrders([]);
              }
            }}
            checked={
              orders.length > 0 &&
              selectedOrders.length === orders.length
            }
          />
        ),
        render: (order) => (
          <input
            type="checkbox"
            checked={selectedOrders.includes(order.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedOrders([...selectedOrders, order.id]);
              } else {
                setSelectedOrders(
                  selectedOrders.filter((id) => id !== order.id)
                );
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
      header: 'Order Details',
      render: (order) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-primary hover:underline cursor-pointer">
              {order.order_number}
            </p>
            {order.order_type === 'quotation' && (
              <Badge variant="info" size="sm">Quote</Badge>
            )}
            {order.order_type === 'bulk' && (
              <Badge variant="primary" size="sm">Bulk</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
          </p>
          {order.invoice_number && (
            <p className="text-xs text-primary mt-0.5">
              INV: {order.invoice_number}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Customer',
      render: (order) => (
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewCustomerHistory(order.customer);
            }}
            className="font-medium text-gray-900 dark:text-white hover:text-primary transition-colors text-left"
          >
            {order.customer?.first_name} {order.customer?.last_name}
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {order.customer?.email}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            ID: {order.customer_id}
          </p>
        </div>
      ),
    },
    {
      header: 'Items & Fulfillment',
      render: (order) => {
        const items = Array.isArray(order.items) ? order.items : [];

        const totalUnits =
          items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

        const lineCount = items.length;

        const backorderUnits =
          items.reduce((sum, item) => sum + Number(item.backorder_quantity || 0), 0);

        const hasBackorder = backorderUnits > 0;

        return (
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {totalUnits} unit{totalUnits !== 1 ? 's' : ''}{' '}
              <span className="text-gray-500 dark:text-gray-400">
                ({lineCount} item{lineCount !== 1 ? 's' : ''})
              </span>
            </p>

            {hasBackorder ? (
              <div className="flex items-center gap-1">
                <AlertTriangle size={14} className="text-orange-500" />
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  On backorder ({backorderUnits} unit{backorderUnits !== 1 ? 's' : ''})
                </p>
              </div>
            ) : (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                Fulfilled (no backorder)
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'Amount',
      render: (order) => {
        const ccy = order.currency || 'KES';
        const showKes = showKesForOrder(order); // true only when currency != KES && rate > 0

        const totalKes =
          order.total_kes ?? (Number(order.total || 0) * Number(order.exchange_rate_to_kes || 0));

        const subtotalKes =
          order.subtotal_kes ?? (Number(order.subtotal || 0) * Number(order.exchange_rate_to_kes || 0));

        return (
          <div className="text-left space-y-1">
            {/* Main total (always) */}
            <div className="font-bold text-primary">
              {money(order.total, ccy)}
            </div>

            {/* KES total (ONLY if non-KES order) */}
            {showKes && (
              <div className="text-xs italic text-gray-600 dark:text-gray-400 text-right">
                in {kesMoney(totalKes)}
              </div>
            )}

            {/* Subtotal */}
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Subtotal: {money(order.subtotal, ccy)}
            </div>

            {/* KES subtotal (ONLY if non-KES order) */}
            {showKes && (
              <div className="text-xs italic text-gray-600 dark:text-gray-400 text-right">
                or {kesMoney(subtotalKes)}
              </div>
            )}

            {/* Discount */}
            {Number(order.discount) > 0 && (
              <p className="text-xs text-primary font-bold">
                Saved: {money(order.discount, ccy)}
              </p>
            )}

            {/* Exchange rate line (ONLY if non-KES order) */}
            {showKes && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                (1 {ccy} = {formatMoney(order.exchange_rate_to_kes, 8)} KES
                {order.converted_at ? (
                  <> • {format(new Date(order.converted_at), 'MMM d, yyyy')}</>
                ) : null}
                )
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Status',
      render: (order) => (
        <div className="space-y-1">
          <OrderStatusBadge status={order.status} />
          {' & '}
          <PaymentStatusBadge status={order.payment_status} />
          {order.priority === 'urgent' && (
            <Badge variant="danger" size="sm">Urgent</Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      render: (order) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/orders/${order.id}`);
            }}
            icon={<Eye size={14} />}
            title="View Details"
          >
            View
          </Button>
          
          {order.status === 'pending' && (
            <Button
              size="sm"
              variant="success"
              onClick={(e) => handleConfirm(order.id, e)}
              icon={<CheckCircle size={14} />}
              title="Confirm Order"
            >
              Confirm
            </Button>
          )}
          
          {(order.status === 'confirmed' || order.status === 'processing') && (
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/admin/orders/${order.id}`);
              }}
              icon={<Truck size={14} />}
              title="Ship Order"
            >
              Ship
            </Button>
          )}
        </div>
      ),
    },
  ];

  const trashColumns = [
    {
      header: (
        <input
          type="checkbox"
          checked={trashedOrders.length > 0 && trashedOrders.every((o) => trashSelectedIds.includes(o.id))}
          onChange={() => {
            setTrashSelectedIds((prev) => {
              const ids = trashedOrders.map((o) => o.id);
              const allSelected = ids.every((id) => prev.includes(id));
              if (allSelected) return prev.filter((id) => !ids.includes(id));
              return Array.from(new Set([...prev, ...ids]));
            });
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      render: (o) => (
        <input
          type="checkbox"
          checked={trashSelectedIds.includes(o.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleTrashSelect(o.id);
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    },
    {
      header: 'Order #',
      render: (o) => (
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">{o.order_number}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Deleted: {o.deleted_at ? format(new Date(o.deleted_at), 'MMM d, yyyy') : '-'}
          </div>
        </div>
      ),
    },
    {
      header: 'Customer',
      render: (o) => (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          {o.customer?.first_name} {o.customer?.last_name}
        </div>
      ),
    },
    {
      header: 'Status',
      render: (o) => (
        <Badge variant="default" size="sm">
          {o.status}
        </Badge>
      ),
    },
    {
      header: 'Payment',
      render: (o) => (
        <Badge variant={o.payment_status === 'paid' ? 'success' : 'warning'} size="sm">
          {o.payment_status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      render: (o) => (
        <Button onClick={() => restoreOne(o.id)} variant="secondary" size="sm">
          Restore
        </Button>
      ),
    },
  ];

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <AdminLayout>
      <PageHeader
        title="Orders Management"
        subtitle="Manage and track all customer orders"
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              icon={<Plus size={18} />}
              onClick={() => setCreateOrderModal(true)}
            >
              Create Order
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              icon={<Download size={18} />}
            >
              Export
            </Button>
            <Button
              variant="outline"
              onClick={handleRefresh}
              icon={<RefreshCw size={18} className={autoRefresh ? 'animate-spin' : ''} />}
            >
              Refresh
            </Button>
            <Button
              variant={autoRefresh ? 'success' : 'outline'}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </Button>

                <Button
                  variant="outline"
                  onClick={openTrashModal}
                  icon={<RotateCcw size={18} />}
                >
                  Trash
                </Button>
            {selectedOrders.length > 0 && (
              <>
                {/* Show RESTORE if ALL selected are cancelled */}
                {allSelectedCancelled ? (
                  <Button
                    variant="success"
                    onClick={() => setBulkRestoreModal(true)}
                    icon={<RefreshCw size={18} />}
                  >
                    Restore {selectedOrders.length} Order(s)
                  </Button>
                ) : (
                  /* Show CANCEL if NONE are cancelled */
                  !anySelectedCancelled && (
                    <Button
                      variant="danger"
                      onClick={() => setBulkCancelModal(true)}
                    >
                      Cancel {selectedOrders.length} Order(s)
                    </Button>
                  )
                )}

                <Button
                  variant="danger"
                  onClick={softDeleteSelected}
                  disabled={!selectedOrders.length}
                  icon={<Trash2 size={18} />}
                >
                  Move to Trash ({selectedOrders.length})
                </Button>
                
                {/* Show warning if mixed selection */}
                {anySelectedCancelled && !allSelectedCancelled && (
                  <Badge variant="warning">
                    Mixed selection - separate cancelled and active orders
                  </Badge>
                )}
              </>
            )}
          </div>
        }
      />
{/* Pending but paid alert */}
{hasPendingPaid && (
  <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
    <div className="flex items-start">
      <AlertTriangle className="w-5 h-5 text-secondary mr-3 mt-0.5 flex-shrink-0" />
      <div>
        <h3 className="text-sm font-medium text-secondary">
          Some orders are paid but still pending
        </h3>
        <p className="text-sm text-blue-800 mt-1">
          Filter by status “Pending” and payment “Paid” to review and confirm these orders.
        </p>
      </div>
    </div>
  </div>
)}

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Total Orders"
            value={statistics.total_orders || 0}
            icon={Package}
            variant="primary"
          />
          <StatsCard
            title="Pending Orders"
            value={statistics.pending || 0}
            icon={Clock}
            variant="warning"
            subtitle={`${statistics.confirmed || 0} confirmed`}
          />
          <StatsCard
            title="Today's Orders"
            value={statistics.today || 0}
            icon={Calendar}
            variant="info"
            subtitle={`KSh ${Number(statistics.today_revenue || 0).toLocaleString()}`}
          />
          <StatsCard
            title="Total Revenue"
            value={`KSh ${(Number(statistics.total_revenue || 0) / 1000).toFixed(1)}K`}
            icon={DollarSign}
            variant="success"
            subtitle={`${statistics.delivered || 0} delivered`}
          />
        </div>
      )}

      {/* Backorder Alert */}
      {statistics?.orders_with_backorder > 0 && (
        <div className="mb-6 bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-orange-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-orange-800">
                Backorder Alert
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                <strong>{statistics.orders_with_backorder}</strong> order(s) have items on backorder and need attention.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
            {hasActiveFilters && (
              <Badge variant="primary" size="sm">
                {Object.values(filters).filter(v => v !== '').length} active
              </Badge>
            )}
          </div>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearFilters}
              icon={<X size={16} />}
            >
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="xl:col-span-2">
            <SearchBar
              placeholder="Search orders, customers..."
              onSearch={(query) => setFilters({ ...filters, search: query })}
              defaultValue={filters.search}
            />
          </div>

          <Select
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'processing', label: 'Processing' },
              { value: 'shipped', label: 'Shipped' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'failed', label: 'Failed' },
              { value: 'ready_for_pickup', label: 'Ready for pickup' },
            ]}
          />

          <Select
            label="Payment"
            value={filters.payment_status}
            onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })}
            options={[
              { value: '', label: 'All Payments' },
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'paid', label: 'Paid' },
              { value: 'partially_paid', label: 'Partially Paid' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />

          <Select
            label="Type"
            value={filters.order_type}
            onChange={(e) => setFilters({ ...filters, order_type: e.target.value })}
            options={[
              { value: '', label: 'All Types' },
              { value: 'standard', label: 'Standard' },
              { value: 'quotation', label: 'Quotation' },
              { value: 'bulk', label: 'Bulk' },
              { value: 'b2b', label: 'B2B' },
            ]}
          />

          <Input
            label="From Date"
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
          />

          <Input
            label="To Date"
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
          />
        </div>
      </Card>

      {/* Orders Table */}
      {loading && !orders.length ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={orders || []}
          loading={loading}
          onRowClick={(order) => navigate(`/admin/orders/${order.id}`)}
          emptyMessage={
            hasActiveFilters
              ? "No orders match your filters"
              : "No orders found. Orders will appear here once customers start placing them."
          }
        />
      )}

      {bulkCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Bulk Cancel Orders</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              You are about to cancel {selectedOrders.length} order(s). This action cannot be undone.
            </p>
            <Textarea
              label="Cancellation Reason *"
              value={bulkCancelReason}
              onChange={(e) => setBulkCancelReason(e.target.value)}
              placeholder="Enter reason for bulk cancellation..."
              rows={3}
            />
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                fullWidth
                onClick={() => {
                  setBulkCancelModal(false);
                  setBulkCancelReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                fullWidth
                onClick={handleBulkCancel}
              >
                Confirm Bulk Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {bulkRestoreModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Bulk Restore Orders</h2>
            
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 rounded-r-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                ℹ️ You are about to restore {selectedOrders.length} cancelled order(s).
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                Orders with refunds will have their payment status restored and refund amounts cleared.
              </p>
            </div>
            
            <Textarea
              label="Restore Reason (Optional)"
              value={bulkRestoreReason}
              onChange={(e) => setBulkRestoreReason(e.target.value)}
              placeholder="Enter reason for bulk restoration..."
              rows={3}
            />
            
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                fullWidth
                onClick={() => {
                  setBulkRestoreModal(false);
                  setBulkRestoreReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                fullWidth
                onClick={handleBulkRestore}
                icon={<RefreshCw size={18} />}
              >
                Confirm Bulk Restore
              </Button>
            </div>
          </div>
        </div>
      )}
      <CreateOrderModal
        isOpen={createOrderModal}
        onClose={() => setCreateOrderModal(false)}
        onSuccess={handleCreateOrder}
      />

      {trashWarnOpen && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-500 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Move shipped/delivered orders to Trash?
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                These orders are already in a fulfillment-complete state. Trashing them may hide important history.
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
            {trashWarnOrders.map((o) => (
              <div key={o.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 dark:text-white">{o.order_number}</div>
                  <Badge variant="warning" size="sm">{o.status}</Badge>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {o.customer?.first_name} {o.customer?.last_name} • {o.customer?.email}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setTrashWarnOpen(false);
                setTrashWarnOrders([]);
              }}
              disabled={trashWarnLoading}
            >
              Cancel
            </Button>

            <Button
              variant="danger"
              fullWidth
              onClick={async () => {
                setTrashWarnLoading(true);
                try {
                  await doTrashSelected();
                } finally {
                  setTrashWarnLoading(false);
                  setTrashWarnOpen(false);
                  setTrashWarnOrders([]);
                }
              }}
              disabled={trashWarnLoading}
            >
              Yes, Move to Trash
            </Button>
          </div>
        </div>
      </div>
    )}


      {showTrashModal && (
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-xl"
          onClick={() => setShowTrashModal(false)}
        />

        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Orders Trash
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
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="failed">Failed</option>
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
                  disabled={!trashSelectedIds.length}
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
                      disabled={!trashSelectedIds.length || deleteConfirm !== 'DELETE'}
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
                columns={trashColumns}
                data={trashedOrders}
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
    
    {customerHistoryModal && selectedCustomer && (
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-xl"
          onClick={() => setCustomerHistoryModal(false)}
        />

        {/* Modal */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {`Customer Order History - ${selectedCustomer?.first_name} ${selectedCustomer?.last_name}`}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedCustomer?.first_name} {selectedCustomer?.last_name}
                  <a
                    href={`mailto:${selectedCustomer.email}`}
                    className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:no-underline transition-colors"
                  >
                    • {selectedCustomer.email}
                  </a>
                </p>
              </div>

              <button
                onClick={() => setCustomerHistoryModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 max-h-[75vh] overflow-y-auto">
              {(() => {
                const list = customerOrders;
                const totalOrders = list.length;

                const totalKes = list.reduce((sum, o) => sum + orderTotalKes(o), 0);
                const avgKes = totalOrders > 0 ? totalKes / totalOrders : 0;

                const byStatus = list.reduce((acc, o) => {
                  const s = o.status || 'unknown';
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {});

                const backorderCount = list.filter((o) =>
                  Array.isArray(o.items) && o.items.some((i) => Number(i.backorder_quantity || 0) > 0)
                ).length;

                const kesMissingCount = list.filter((o) => {
                  const isForeign = !isKes(o.currency);
                  const hasKes = Number(o.total_kes) > 0;
                  const hasRate = Number(o.exchange_rate_to_kes) > 0;
                  return isForeign && !hasKes && !hasRate;
                }).length;

                if (customerOrdersLoading) {
                  return <div className="text-sm text-gray-500">Loading customer orders...</div>;
                }

                return (
                  <div className="space-y-6">
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
                    {/* Stats cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Orders (this page)</p>
                        <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalOrders}</p>
                      </div>

                      <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Value (KES)</p>
                        <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                          {kesMoney(totalKes)}
                        </p>

                        {kesMissingCount > 0 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                            {kesMissingCount} foreign order(s) missing KES conversion
                          </p>
                        )}

                        {backorderCount > 0 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                            {backorderCount} order(s) have backorder items
                          </p>
                        )}
                      </div>

                      <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Avg Order (KES)</p>
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
                          <span className="text-sm text-gray-500">No orders yet</span>
                        ) : (
                          Object.entries(byStatus).map(([status, count]) => (
                            <Badge key={status} variant="default" size="sm">
                              {status}: {count}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Recent orders list */}
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Recent Orders</h4>

                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {list.length === 0 ? (
                          <div className="text-sm text-gray-500">No recent orders</div>
                        ) : (
                          list.map((o) => {
                            const kes = orderTotalKes(o);
                            const showKes = !isKes(o.currency);

                            return (
                              <div
                                key={o.id}
                                className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                onClick={() => {
                                  setCustomerHistoryModal(false);
                                  navigate(`/admin/orders/${o.id}`);
                                }}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-primary">{o.order_number}</p>
                                    <OrderStatusBadge status={o.status} />
                                    <PaymentStatusBadge status={o.payment_status} />
                                    <Badge variant="default" size="sm">{o.currency || 'KES'}</Badge>
                                    {o.order_type && (
                                      <Badge variant="info" size="sm">{o.order_type}</Badge>
                                    )}
                                  </div>

                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {format(new Date(o.created_at), 'MMM d, yyyy h:mm a')}
                                  </p>

                                  {Array.isArray(o.items) && o.items.some((i) => Number(i.backorder_quantity || 0) > 0) && (
                                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                      Backorder items present
                                    </p>
                                  )}
                                </div>

                                <div className="text-right">
                                  <p className="font-bold text-gray-900 dark:text-white">
                                    {money(o.total, o.currency || 'KES')}
                                  </p>

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

                      {/* Pagination controls */}
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-gray-500">
                          Page {customerOrdersPagination?.current_page || 1}
                          {customerOrdersPagination?.last_page ? ` of ${customerOrdersPagination.last_page}` : ''}
                        </p>

                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            disabled={customerOrdersLoading || !(customerOrdersPagination?.current_page > 1)}
                            onClick={() =>
                              fetchCustomerOrders(
                                selectedCustomer.id,
                                (customerOrdersPagination?.current_page || 1) - 1
                              )
                            }
                          >
                            Prev
                          </Button>

                          <Button
                            variant="primary"
                            disabled={
                              customerOrdersLoading ||
                              !customerOrdersPagination?.last_page ||
                              (customerOrdersPagination?.current_page || 1) >= customerOrdersPagination.last_page
                            }
                            onClick={() =>
                              fetchCustomerOrders(
                                selectedCustomer.id,
                                (customerOrdersPagination?.current_page || 1) + 1
                              )
                            }
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <Button variant="outline" onClick={() => setCustomerHistoryModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
      
    </AdminLayout>
  );
}