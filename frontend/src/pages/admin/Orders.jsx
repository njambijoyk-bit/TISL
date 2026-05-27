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
  TrendingUp, Search
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import StatsCard from '../../components/admin/StatsCard';
import AdminPagination from '../../components/common/AdminPagination';
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

  // update destructure:
  const { 
    orders, statistics, loading, pagination,
    fetchAllOrders, fetchStatistics, confirmOrder
  } = useOrderStore();
 
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    payment_status: '',
    order_type: '',
    from_date: '',  // ✅ Changed from start_date
    to_date: '',    // ✅ Changed from end_date
  });

  // add page state near other useState calls:
  const [currentPage, setCurrentPage] = useState(1);

  // update loadOrders to pass page:
  const loadOrders = async (page = currentPage) => {
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '' && value != null)
      );
      await fetchAllOrders({ ...params, page, per_page: 20 });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  // add page change handler:
  const handlePageChange = (page) => {
    setCurrentPage(page);
    loadOrders(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // reset page when filters change — update the filters useEffect:
  useEffect(() => {
    setCurrentPage(1);
    loadOrders(1);
  }, [filters]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistoryModal, setCustomerHistoryModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrdersPagination, setCustomerOrdersPagination] = useState(null);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);

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

  const handleExport = async () => {
  const toastId = toast.loading('Generating PDF report...');

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W  = pdf.internal.pageSize.getWidth();   // 297mm
    const H  = pdf.internal.pageSize.getHeight();  // 210mm
    const M  = 12;
    const CW = W - M * 2;
    let y = M;

    // ── Helpers ──────────────────────────────────────────────────────
    const rgb = (hex) => {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r
        ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
        : { r: 124, g: 58, b: 237 };
    };

    const withOpacity = (op, fn) => {
      pdf.setGState(pdf.GState({ opacity: op }));
      fn();
      pdf.setGState(pdf.GState({ opacity: 1 }));
    };

    const need = (h) => {
      if (y + h > H - M) { pdf.addPage(); y = M; }
    };

    const hline = (colorHex = '#e5e7eb', lw = 0.2) => {
      const { r, g, b } = rgb(colorHex);
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(lw);
      pdf.line(M, y, W - M, y);
    };

    const fmtMoney = (val, curr = 'KES') => {
      const n   = Number(val || 0);
      const sym = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' }[curr] || curr;
      return `${sym} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const fmtDate = (d) => {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    };

    // pill with light tinted bg — no emoji, no broken opacity
    const statusPill = (x, py, label, colorHex) => {
      const { r, g, b } = rgb(colorHex);
      pdf.setFontSize(6);
      const tw = pdf.getTextWidth(label);
      const pw = tw + 8;
      withOpacity(0.12, () => {
        pdf.setFillColor(r, g, b);
        pdf.roundedRect(x, py - 3.5, pw, 5, 2, 2, 'F');
      });
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(x, py - 3.5, pw, 5, 2, 2, 'S');
      pdf.setTextColor(r, g, b);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, x + 4, py);
      return pw + 3;
    };

    const STATUS_COLORS = {
      pending: '#f59e0b', confirmed: '#3b82f6', processing: '#8b5cf6',
      shipped: '#06b6d4', delivered: '#10b981', cancelled: '#ef4444', failed: '#6b7280',
    };
    const PAYMENT_COLORS = {
      unpaid: '#ef4444', paid: '#10b981', partially_paid: '#f59e0b', refunded: '#6b7280',
    };

    // ══════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════
    pdf.setFillColor(124, 58, 237);
    pdf.rect(0, 0, W, 3, 'F');
    y = M + 4;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(28, 28, 28);
    pdf.text('Orders Report', M, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(107, 114, 128);
    pdf.text(
      `Generated: ${fmtDate(new Date())}  ·  ${orders?.length || 0} orders`,
      W - M, y, { align: 'right' }
    );

    y += 8;
    hline('#7c3aed', 0.3);
    y += 6;

    // ══════════════════════════════════════════
    // STATS CARDS
    // ══════════════════════════════════════════
    if (statistics) {
      need(28);

      const cards = [
        { label: 'Total Orders',   value: statistics.total_orders || 0,                                            color: '#7c3aed' },
        { label: 'Pending',        value: statistics.pending || 0,       sub: `${statistics.confirmed || 0} confirmed`, color: '#f59e0b' },
        { label: "Today's Orders", value: statistics.today || 0,         sub: `KSh ${Number(statistics.today_revenue || 0).toLocaleString()}`, color: '#3b82f6' },
        { label: 'Total Revenue',  value: `KSh ${(Number(statistics.total_revenue || 0) / 1000).toFixed(1)}K`, sub: `${statistics.delivered || 0} delivered`, color: '#10b981' },
      ];

      const cardW = (CW - 9) / 4;

      cards.forEach((card, i) => {
        const cx = M + i * (cardW + 3);
        const { r, g, b } = rgb(card.color);

        // card — white bg, subtle colored border only
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(0.4);
        pdf.roundedRect(cx, y, cardW, 22, 3, 3, 'FD');

        // colored top accent line
        pdf.setFillColor(r, g, b);
        pdf.roundedRect(cx, y, cardW, 2.5, 2, 2, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(card.label, cx + 4, y + 8);

        pdf.setFontSize(11);
        pdf.setTextColor(r, g, b);
        pdf.text(String(card.value), cx + 4, y + 16);

        if (card.sub) {
          pdf.setFontSize(5.5);
          pdf.setTextColor(156, 163, 175);
          pdf.text(card.sub, cx + 4, y + 20.5);
        }
      });

      y += 28;
    }

    // ══════════════════════════════════════════
    // ALERTS — no emoji, use plain text markers
    // ══════════════════════════════════════════
    const hasPendingPaid = orders?.some(o => o.status === 'pending' && o.payment_status === 'paid');
    const hasBackorder   = (statistics?.orders_with_backorder || 0) > 0;

    if (hasPendingPaid) {
      need(12);
      withOpacity(0.07, () => {
        pdf.setFillColor(239, 68, 68);
        pdf.roundedRect(M, y, CW, 11, 3, 3, 'F');
      });
      pdf.setDrawColor(239, 68, 68);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, 11, 3, 3, 'S');
      pdf.setFillColor(239, 68, 68);
      pdf.roundedRect(M, y, 3, 11, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(185, 28, 28);
      pdf.text('Some orders are paid but still marked pending — review required.', M + 7, y + 7);
      y += 15;
    }

    if (hasBackorder) {
      need(12);
      withOpacity(0.07, () => {
        pdf.setFillColor(249, 115, 22);
        pdf.roundedRect(M, y, CW, 11, 3, 3, 'F');
      });
      pdf.setDrawColor(249, 115, 22);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, 11, 3, 3, 'S');
      pdf.setFillColor(249, 115, 22);
      pdf.roundedRect(M, y, 3, 11, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(154, 52, 18);
      pdf.text(`${statistics.orders_with_backorder} order(s) have items on backorder.`, M + 7, y + 7);
      y += 15;
    }

    // ══════════════════════════════════════════
    // TABLE
    // ══════════════════════════════════════════
    need(14);

    // Section label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(124, 58, 237);
    pdf.text('Order Details', M, y);
    y += 5;
    hline('#7c3aed', 0.25);
    y += 4;

    // Column definitions — landscape A4 = 273mm content width
    const cols = [
      { label: 'Order #',   x: M,       w: 52  },
      { label: 'Customer',  x: M + 52,  w: 42  },
      { label: 'Items',     x: M + 94,  w: 22  },
      { label: 'Currency',  x: M + 116, w: 18  },
      { label: 'Amount',    x: M + 134, w: 38  },
      { label: 'KES Equiv', x: M + 172, w: 38  },
      { label: 'Status',    x: M + 210, w: 32  },
      { label: 'Date',      x: M + 242, w: 31  },
    ];

    // Header band
    withOpacity(0.07, () => {
      pdf.setFillColor(124, 58, 237);
      pdf.rect(M, y - 1, CW, 8, 'F');
    });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(107, 114, 128);
    cols.forEach(c => pdf.text(c.label, c.x + 1, y + 5));
    y += 8;

    // ── Rows ─────────────────────────────────
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);

    (orders || []).forEach((order, idx) => {
      const ROW_H = 15;
      need(ROW_H + 2);

      // Zebra stripe
      if (idx % 2 !== 0) {
        withOpacity(0.04, () => {
          pdf.setFillColor(124, 58, 237);
          pdf.rect(M, y - 1, CW, ROW_H, 'F');
        });
      }

      const midY = y + 5;

      // Order number
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(28, 28, 28);
      const orderNumLines = pdf.splitTextToSize(order.order_number, cols[0].w - 2);
      pdf.text(orderNumLines[0], cols[0].x + 1, midY);
      if (order.order_type && order.order_type !== 'standard') {
        pdf.setFontSize(5.5);
        pdf.setTextColor(124, 58, 237);
        pdf.text(`[${order.order_type}]`, cols[0].x + 1, midY + 5);
      }

      // Customer
      const custName = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || '—';
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(28, 28, 28);
      pdf.text(pdf.splitTextToSize(custName, cols[1].w - 2)[0], cols[1].x + 1, midY);
      if (order.customer?.email) {
        pdf.setFontSize(5.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(pdf.splitTextToSize(order.customer.email, cols[1].w - 2)[0], cols[1].x + 1, midY + 5);
      }

      // Items
      const orderItems   = Array.isArray(order.items) ? order.items : [];
      const totalUnits   = orderItems.reduce((s, i) => s + Number(i.quantity || 0), 0);
      const backorderQty = orderItems.reduce((s, i) => s + Number(i.backorder_quantity || 0), 0);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(28, 28, 28);
      pdf.text(`${totalUnits}`, cols[2].x + 1, midY);
      if (backorderQty > 0) {
        pdf.setFontSize(5.5);
        pdf.setTextColor(249, 115, 22);
        pdf.text(`${backorderQty} BO`, cols[2].x + 1, midY + 5);
      }

      // Currency
      const curr = order.currency || 'KES';
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(curr, cols[3].x + 1, midY);

      // Amount (in order currency)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(28, 28, 28);
      pdf.text(fmtMoney(order.total, curr), cols[4].x + 1, midY);

      // KES equivalent
      if (curr !== 'KES' && order.total_kes) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(fmtMoney(order.total_kes, 'KES'), cols[5].x + 1, midY);
      } else if (curr === 'KES') {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(156, 163, 175);
        pdf.text('—', cols[5].x + 1, midY);
      }

      // Status pills — stacked
      statusPill(cols[6].x + 1, midY, order.status || '—', STATUS_COLORS[order.status] || '#9ca3af');
      statusPill(cols[6].x + 1, midY + 6, order.payment_status || '—', PAYMENT_COLORS[order.payment_status] || '#9ca3af');

      // Date
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(fmtDate(order.created_at), cols[7].x + 1, midY);

      y += ROW_H;

      // Row divider
      if (idx < (orders?.length || 0) - 1) {
        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.15);
        pdf.line(M, y, W - M, y);
      }
    });

    // ══════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════
    y += 6;
    need(12);
    hline('#e5e7eb', 0.25);
    y += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(107, 114, 128);
    pdf.text(
      `Exported by ${user?.email || 'Admin'}  ·  Page ${pdf.internal.getNumberOfPages()}`,
      M, y
    );
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(124, 58, 237);
    pdf.text('Orders Management System', W - M, y, { align: 'right' });

    const fileName = `Orders-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);
    toast.success('PDF exported successfully!', { id: toastId });

  } catch (err) {
    console.error('PDF export failed:', err);
    toast.error('Failed to generate PDF', { id: toastId });
  }
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
            {order.customer?.first_name} {order.customer?.last_name}
          </button>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

          {/* View — outline/neutral */}
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/orders/${order.id}`); }}
            title="View Details"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
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
            <Eye size={13} /> View
          </button>

          {/* Confirm — success/green */}
          {order.status === 'pending' && (
            <button
              onClick={(e) => handleConfirm(order.id, e)}
              title="Confirm Order"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
                background: 'rgba(5,150,105,0.08)', color: '#065f46',
                border: '1.5px solid rgba(5,150,105,0.2)',
                transition: 'all 150ms',
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
              <CheckCircle size={13} /> Confirm
            </button>
          )}

          {/* Ship — primary/purple */}
          {(order.status === 'confirmed' || order.status === 'processing') && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/admin/orders/${order.id}`); }}
              title="Ship Order"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
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
              <Truck size={13} /> Ship
            </button>
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
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="primary"
              icon={<Plus size={18} />}
              onClick={() => setCreateOrderModal(true)}
              style={{ borderColor: '#7c3aed', color: '#7c3aed', background: 'rgba(124,58,237,0.08)' }}
            >
              Create Order
            </Button>

            <Button
              variant="outline"
              onClick={handleExport}
              icon={<Download size={18} style={{ color: '#10b981' }} />}
              style={{ borderColor: '#10b981', color: '#10b981', background: 'rgba(16,185,129,0.08)' }}
            >
              Export
            </Button>

            <Button
              variant="outline"
              onClick={handleRefresh}
              icon={<RefreshCw size={18} className={autoRefresh ? 'animate-spin' : ''} style={{ color: '#0ea5e9' }} />}
              style={{ borderColor: '#0ea5e9', color: '#0ea5e9', background: 'rgba(14,165,233,0.08)' }}
            >
              Refresh
            </Button>

            <Button
              variant={autoRefresh ? 'success' : 'outline'}
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={!autoRefresh ? { borderColor: '#8b5cf6', color: '#8b5cf6', background: 'rgba(139,92,246,0.08)' } : {}}
            >
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </Button>

            <Button
              variant="outline"
              onClick={openTrashModal}
              icon={<RotateCcw size={18} style={{ color: '#f59e0b' }} />}
              style={{ borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}
            >
              Trash
            </Button>

            {selectedOrders.length > 0 && (
              <>
                {allSelectedCancelled ? (
                  <Button
                    variant="success"
                    onClick={() => setBulkRestoreModal(true)}
                    icon={<RefreshCw size={18} />}
                    style={{ borderColor: '#10b981', color: '#10b981', background: 'rgba(16,185,129,0.08)' }}
                  >
                    Restore {selectedOrders.length} Order(s)
                  </Button>
                ) : (
                  !anySelectedCancelled && (
                    <Button
                      variant="danger"
                      onClick={() => setBulkCancelModal(true)}
                      style={{ borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
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
                  style={{ borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
                >
                  Move to Trash ({selectedOrders.length})
                </Button>
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

      {/* Statistics Cards */}
      {statistics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            {
              label: 'Total Orders',
              value: statistics.total_orders || 0,
              sub: null,
              bg: 'rgba(124,58,237,0.08)',
              border: 'rgba(124,58,237,0.2)',
              color: '#7c3aed',
            },
            {
              label: 'Pending Orders',
              value: statistics.pending || 0,
              sub: `${statistics.confirmed || 0} confirmed`,
              bg: 'rgba(245,158,11,0.08)',
              border: 'rgba(245,158,11,0.2)',
              color: '#d97706',
            },
            {
              label: "Today's Orders",
              value: statistics.today || 0,
              sub: `KSh ${Number(statistics.today_revenue || 0).toLocaleString()}`,
              bg: 'rgba(59,130,246,0.08)',
              border: 'rgba(59,130,246,0.2)',
              color: '#2563eb',
            },
            {
              label: 'Total Revenue',
              value: `KSh ${(Number(statistics.total_revenue || 0) / 1000).toFixed(1)}K`,
              sub: `${statistics.delivered || 0} delivered`,
              bg: 'rgba(16,185,129,0.08)',
              border: 'rgba(16,185,129,0.2)',
              color: '#059669',
            },
          ].map(({ label, value, sub, bg, border, color }) => (
            <div key={label} style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: '16px 20px',
            }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
              </p>
              <p style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1.1, marginBottom: sub ? 4 : 0 }}>
                {value}
              </p>
              {sub && (
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {sub}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Alerts row */}
      {(hasPendingPaid || statistics?.orders_with_backorder > 0) && (
        <div className="flex gap-4 mb-6">

          {hasPendingPaid && (
            <div
              className="flex-1 border-l-4 p-4 rounded-r-lg"
              style={{ background: 'rgba(239,68,68,0.08)', borderColor: '#ef4444' }}
            >
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" style={{ color: '#ef4444' }} />
                <div>
                  <h3 className="text-sm font-medium" style={{ color: '#b91c1c' }}>
                    Some orders are paid but still pending
                  </h3>
                  <p className="text-sm mt-1" style={{ color: '#dc2626' }}>
                    Filter by status "Pending" and payment "Paid" to review and confirm these orders.
                  </p>
                </div>
              </div>
            </div>
          )}

          {statistics?.orders_with_backorder > 0 && (
            <div
              className="flex-1 border-l-4 p-4 rounded-r-lg"
              style={{ background: 'rgba(249,115,22,0.08)', borderColor: '#f97316' }}
            >
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" style={{ color: '#f97316' }} />
                <div>
                  <h3 className="text-sm font-medium" style={{ color: '#9a3412' }}>
                    Backorder Alert
                  </h3>
                  <p className="text-sm mt-1" style={{ color: '#c2410c' }}>
                    <strong>{statistics.orders_with_backorder}</strong> order(s) have items on backorder and need attention.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Filters */}
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
          {hasActiveFilters && (
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
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search orders, customers..."
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
              <button
                onClick={() => setFilters(f => ({ ...f, search: '' }))}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Select row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              {
                value: filters.status,
                onChange: e => setFilters(f => ({ ...f, status: e.target.value })),
                options: [['', 'All Statuses'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['processing', 'Processing'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['failed', 'Failed'], ['ready_for_pickup', 'Ready for Pickup']],
              },
              {
                value: filters.payment_status,
                onChange: e => setFilters(f => ({ ...f, payment_status: e.target.value })),
                options: [['', 'All Payments'], ['unpaid', 'Unpaid'], ['paid', 'Paid'], ['partially_paid', 'Partially Paid'], ['refunded', 'Refunded']],
              },
              {
                value: filters.order_type,
                onChange: e => setFilters(f => ({ ...f, order_type: e.target.value })),
                options: [['', 'All Types'], ['standard', 'Standard'], ['quotation', 'Quotation'], ['bulk', 'Bulk'], ['b2b', 'B2B']],
              },
            ].map((sel, i) => (
              <select key={i} value={sel.value} onChange={sel.onChange} style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
                border: '1px solid var(--color-border-tertiary)',
                background: 'var(--color-background-secondary)',
                color: '#7b51c5', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
              }}>
                {sel.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            ))}

            {/* Date inputs */}
            {[
              { placeholder: 'From Date', value: filters.from_date, key: 'from_date' },
              { placeholder: 'To Date', value: filters.to_date, key: 'to_date' },
            ].map(({ placeholder, value, key }) => (
              <input
                key={key}
                type="date"
                value={value}
                onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
                title={placeholder}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
                  border: '1px solid var(--color-border-tertiary)',
                  background: 'var(--color-background-secondary)',
                  color: value ? '#7b51c5' : 'var(--color-text-tertiary)',
                  outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        </div>
      </div>

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

      {/* Pagination — outside DataTable, always evaluated */}
      {(() => { console.log('pagination state:', pagination); return null; })()}
      {pagination && pagination.last_page > 1 && (
        <AdminPagination pagination={pagination} onPageChange={handlePageChange} />
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
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
        {/* Backdrop */}
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}
          onClick={() => setShowTrashModal(false)}
        />

        {/* Modal */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{
            width: '100%', maxWidth: 960,
            maxHeight: 'calc(100vh - 48px)', // ← add this
            overflowY: 'auto',               // ← and this
            background: '#fff',
            color: '#a855f7',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border-tertiary)' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                  Orders Trash
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Restore items or permanently delete (super admin only).
                </p>
              </div>
              <button
                onClick={() => setShowTrashModal(false)}
                style={{ padding: 8, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Filters + actions */}
            <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-tertiary)' }}>
              {/* Left: search + status + refresh */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={trashFilters.search}
                  onChange={(e) => setTrashFilters((p) => ({ ...p, search: e.target.value }))}
                  placeholder="Search trash..."
                  style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
                    border: '1px solid var(--color-border-tertiary)',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'inherit', width: 240,
                  }}
                />
                <select
                  value={trashFilters.status}
                  onChange={(e) => setTrashFilters((p) => ({ ...p, status: e.target.value }))}
                  style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
                    border: '1px solid var(--color-border-tertiary)',
                    background: 'var(--color-background-secondary)',
                    color: '#7b51c5', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
                  }}
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
                <Button
                  onClick={() => fetchTrash(1)}
                  variant="secondary"
                  style={{ backgroundColor: '#F3F4F6', color: '#374151', borderColor: '#D1D5DB' }}
                >
                  Refresh
                </Button>
              </div>

              {/* Right: restore + force delete */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  onClick={restoreSelected}
                  icon={<RotateCcw size={16} />}
                  variant="primary"
                  disabled={!trashSelectedIds.length}
                  style={{ backgroundColor: '#7C3AED', color: '#fff', borderColor: '#7C3AED' }}
                >
                  Restore Selected
                </Button>

                {isSuperAdmin && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={16} style={{ color: '#f97316' }} />
                      <input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Type DELETE"
                        style={{
                          width: 140, padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
                          border: '1px solid var(--color-border-tertiary)',
                          background: 'var(--color-background-secondary)',
                          color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    <Button
                      onClick={forceDeleteSelected}
                      icon={<Trash2 size={16} />}
                      variant="danger"
                      disabled={!trashSelectedIds.length || deleteConfirm !== 'DELETE'}
                      style={{ backgroundColor: '#DC2626', color: '#fff', borderColor: '#DC2626' }}
                    >
                      Delete Forever
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Trash list */}
            <div style={{ padding: '0 20px 20px' }}>
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
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{
            width: '100%', maxWidth: 900,
            background: 'white', borderRadius: 14,
            border: '1px solid rgba(168,85,247,0.15)',
            boxShadow: '0 8px 40px rgba(168,85,247,0.12), 0 2px 12px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1.5px solid rgba(168,85,247,0.1)',
            }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>
                  Customer Order History — {selectedCustomer?.first_name} {selectedCustomer?.last_name}
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#4b5563', margin: 0 }}>
                  {selectedCustomer?.first_name} {selectedCustomer?.last_name} • {selectedCustomer?.email}
                </p>
              </div>
              <button
                onClick={() => setCustomerHistoryModal(false)}
                title="Close"
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

            {/* Body */}
            <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
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

                if (customerOrdersLoading) return (
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Loading customer orders…</p>
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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

                    {/* Stat cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
                        <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Orders</p>
                        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1d4ed8', margin: 0, lineHeight: 1 }}>{totalOrders}</p>
                      </div>

                      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.12)' }}>
                        <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Value (KES)</p>
                        <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#065f46', margin: 0, lineHeight: 1 }}>{kesMoney(totalKes)}</p>
                        {kesMissingCount > 0 && (
                          <p style={{ fontSize: '0.68rem', color: '#b45309', margin: '4px 0 0' }}>{kesMissingCount} foreign order(s) missing KES conversion</p>
                        )}
                        {backorderCount > 0 && (
                          <p style={{ fontSize: '0.68rem', color: '#b45309', margin: '3px 0 0' }}>{backorderCount} order(s) have backorder items</p>
                        )}
                      </div>

                      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                        <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Order (KES)</p>
                        <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed', margin: 0, lineHeight: 1 }}>{kesMoney(avgKes)}</p>
                      </div>
                    </div>

                    {/* Status breakdown */}
                    <div style={{ padding: 14, borderRadius: 10, background: 'rgba(168,85,247,0.03)', border: '1px solid rgba(168,85,247,0.1)' }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>Status Breakdown</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {Object.keys(byStatus).length === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No orders yet</span>
                        ) : (
                          Object.entries(byStatus).map(([status, count]) => (
                            <span key={status} style={{
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

                    {/* Recent orders list */}
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>Recent Orders</p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 380, overflowY: 'auto' }}>
                        {list.length === 0 ? (
                          <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No recent orders</p>
                        ) : (
                          list.map((o) => {
                            const kes = orderTotalKes(o);
                            const showKes = !isKes(o.currency);
                            const hasBackorder = Array.isArray(o.items) && o.items.some((i) => Number(i.backorder_quantity || 0) > 0);
                            return (
                              <div
                                key={o.id}
                                onClick={() => { setCustomerHistoryModal(false); navigate(`/admin/orders/${o.id}`); }}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '10px 13px', borderRadius: 10, cursor: 'pointer',
                                  background: 'white', border: '1px solid rgba(168,85,247,0.1)',
                                  transition: 'border-color 150ms, background 150ms',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'; }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b21a8' }}>{o.order_number}</span>
                                    <OrderStatusBadge status={o.status} />
                                    <PaymentStatusBadge status={o.payment_status} />
                                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(107,114,128,0.08)', color: '#4b5563', boxShadow: '0 0 0 1px rgba(107,114,128,0.15)' }}>
                                      {o.currency || 'KES'}
                                    </span>
                                    {o.order_type && (
                                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(37,99,235,0.08)', color: '#1d4ed8', boxShadow: '0 0 0 1px rgba(37,99,235,0.15)' }}>
                                        {o.order_type}
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
                                    {format(new Date(o.created_at), 'MMM d, yyyy h:mm a')}
                                  </p>
                                  {hasBackorder && (
                                    <p style={{ fontSize: '0.68rem', color: '#b45309', margin: '2px 0 0' }}>Backorder items present</p>
                                  )}
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                                    {money(o.total, o.currency || 'KES')}
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

                      {/* Pagination */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                        <a
                          href={`mailto:${selectedCustomer.email}`}
                          className="ml-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:no-underline transition-colors"
                        >
                          • {selectedCustomer.email}
                        </a>
                        <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
                          Page {customerOrdersPagination?.current_page || 1}
                          {customerOrdersPagination?.last_page ? ` of ${customerOrdersPagination.last_page}` : ''}
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            disabled={customerOrdersLoading || !(customerOrdersPagination?.current_page > 1)}
                            onClick={() => fetchCustomerOrders(selectedCustomer.id, (customerOrdersPagination?.current_page || 1) - 1)}
                            style={{
                              padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                              fontFamily: 'inherit', cursor: (customerOrdersLoading || !(customerOrdersPagination?.current_page > 1)) ? 'not-allowed' : 'pointer',
                              background: 'rgba(168,85,247,0.06)', color: '#7c3aed',
                              border: '1.5px solid rgba(168,85,247,0.18)',
                              opacity: (customerOrdersLoading || !(customerOrdersPagination?.current_page > 1)) ? 0.4 : 1,
                              transition: 'all 150ms',
                            }}
                          >
                            Prev
                          </button>
                          <button
                            disabled={customerOrdersLoading || !customerOrdersPagination?.last_page || (customerOrdersPagination?.current_page || 1) >= customerOrdersPagination.last_page}
                            onClick={() => fetchCustomerOrders(selectedCustomer.id, (customerOrdersPagination?.current_page || 1) + 1)}
                            style={{
                              padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                              fontFamily: 'inherit', cursor: 'pointer',
                              background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
                              border: '1.5px solid rgba(168,85,247,0.25)',
                              opacity: (customerOrdersLoading || !customerOrdersPagination?.last_page || (customerOrdersPagination?.current_page || 1) >= customerOrdersPagination.last_page) ? 0.4 : 1,
                              transition: 'all 150ms',
                            }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px', display: 'flex', justifyContent: 'flex-end',
              borderTop: '1.5px solid rgba(168,85,247,0.1)',
            }}>
              <button
                onClick={() => setCustomerHistoryModal(false)}
                style={{
                  padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                  background: 'transparent', color: '#6b7280',
                  border: '1.5px solid rgba(107,114,128,0.25)', transition: 'all 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(107,114,128,0.06)'; e.currentTarget.style.borderColor = 'rgba(107,114,128,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(107,114,128,0.25)'; }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      </div>
    )}
      
    </AdminLayout>
  );
}