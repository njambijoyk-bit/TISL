import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package, Trash2, Plus, X, Save, AlertTriangle, Clock, CheckCircle,
  MapPin, CreditCard, Truck, Search, FileText, Star, RefreshCw,
  ArrowLeft, Wrench, Receipt, Info, XCircle
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Textarea from '../../components/common/TextArea';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useOrderStore from '../../store/orderStore';
import useProductStore from '../../store/productStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
const fmtNum = (v, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v || 0));
const safeFormat = (d, fmt) => { try { return format(new Date(String(d).replace(' ', 'T')), fmt); } catch { return '—'; } };

const STATUS_ORDER_CFG = {
  pending:    { color: '#f59e0b', label: 'Pending' },
  confirmed:  { color: '#3b82f6', label: 'Confirmed' },
  processing: { color: '#3b82f6', label: 'Processing' },
  shipped:    { color: '#a855f7', label: 'Shipped' },
  delivered:  { color: '#10b981', label: 'Delivered' },
  cancelled:  { color: '#ef4444', label: 'Cancelled' },
  failed:     { color: '#ef4444', label: 'Failed' },
};
const PAYMENT_CFG = {
  paid:           { color: '#10b981', label: 'Paid' },
  unpaid:         { color: '#ef4444', label: 'Unpaid' },
  partially_paid: { color: '#f59e0b', label: 'Partially Paid' },
  refunded:       { color: '#3b82f6', label: 'Refunded' },
  failed:         { color: '#ef4444', label: 'Failed' },
};
const ITEM_TYPE_ICON = { product: Package, custom_product: Package, service: Wrench, custom_service: Wrench, fee: Receipt };

// ── Primitives ────────────────────────────────────────────────────────────────
function StatusPill({ label, color }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: `${color}15`, border: `1.5px solid ${color}40`, color, padding: '3px 10px 3px 8px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

const Chip = ({ children, color }) => (
  <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full"
    style={{ background: `${color}18`, border: `1px solid ${color}33`, color }}>
    {children}
  </span>
);

function Section({ title, icon: Icon, accent, children, action }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden mb-5"
      style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
      {accent && <div style={{ height: 3, background: accent }} />}
      <div className="p-5">
        {(title || action) && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {Icon && <Icon size={13} color="#c084fc" />}
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#c084fc' }}>{title}</p>
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function AlertBox({ type, title, body }) {
  const C = {
    info:    { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-200 dark:border-blue-700',   ic: '#3b82f6', tc: 'text-blue-800 dark:text-blue-200',   Icon: Clock },
    warning: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-700', ic: '#f59e0b', tc: 'text-amber-800 dark:text-amber-200', Icon: AlertTriangle },
    danger:  { bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-700',     ic: '#ef4444', tc: 'text-red-800 dark:text-red-200',     Icon: X },
    success: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', ic: '#10b981', tc: 'text-emerald-800 dark:text-emerald-200', Icon: CheckCircle },
  }[type];
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${C.bg} ${C.border} mb-5`}>
      <C.Icon size={15} color={C.ic} className="flex-shrink-0 mt-0.5" />
      <div>
        {title && <p className={`text-sm font-semibold ${C.tc}`}>{title}</p>}
        {body && <p className={`text-xs mt-0.5 ${C.tc} opacity-80`}>{body}</p>}
      </div>
    </div>
  );
}

function PurpleBtn({ onClick, disabled, loading, children, type = 'button' }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} type={type}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
      {loading ? <LoadingSpinner size="sm" /> : children}
    </button>
  );
}

function GhostBtn({ onClick, disabled, children, type = 'button' }) {
  return (
    <button onClick={onClick} disabled={disabled} type={type}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold transition-colors hover:border-purple-300 hover:text-purple-500 disabled:opacity-40">
      {children}
    </button>
  );
}

function DangerBtn({ onClick, disabled, loading, children }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} type="button"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
      {loading ? <LoadingSpinner size="sm" /> : children}
    </button>
  );
}

function GreenBtn({ onClick, disabled, loading, children, fullWidth }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} type="button"
      className={`inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 ${fullWidth ? 'w-full' : ''}`}
      style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 4px 12px rgba(237, 243, 241, 0.25)' }}>
      {loading ? <LoadingSpinner size="sm" /> : children}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CustomerOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentOrder: order, loading, fetchOrder, updateMyOrder, cancelOrder, restoreCustomerOrder, rateOrder, trashMyOrder } = useOrderStore();
  const { products, fetchProducts } = useProductStore();

  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod]   = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const [courierCompany, setCourierCompany] = useState('');
  const [orderType, setOrderType]           = useState('standard');
  const [shippingAddress, setShippingAddress] = useState('');
  const [customerNotes, setCustomerNotes]   = useState('');
  const [itemVariants, setItemVariants]     = useState({});

  const [cancelModal, setCancelModal]       = useState(false);
  const [cancelReason, setCancelReason]     = useState('');
  const [addItemModal, setAddItemModal]     = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [productSearch, setProductSearch]   = useState('');
  const [ratingModal, setRatingModal]       = useState(false);
  const [rating, setRating]                 = useState(0);
  const [feedback, setFeedback]             = useState('');
  const [itemView, setItemView] = useState('minimal');

  useEffect(() => { fetchOrder(id); fetchProducts({ per_page: 1000 }); }, [id]);

  useEffect(() => {
    if (order) {
      setItems(order.items || []);
      setPaymentMethod(order.payment_method || '');
      setDeliveryMethod(order.delivery_method || '');
      setCourierCompany(order.courier_company || '');
      setOrderType(order.order_type || 'standard');
      setShippingAddress(order.shipping_address || '');
      setCustomerNotes(order.customer_notes || '');
      setRating(order.rating || 0);
      setFeedback(order.feedback || '');
      const variants = {};
      order.items?.forEach((item, i) => { if (item.variant_details) variants[i] = item.variant_details; });
      setItemVariants(variants);
    }
  }, [order]);

  const totalQty    = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const canEdit     = order?.status === 'pending';
  const canRate     = order?.status === 'delivered' && !order?.rating;
  const isQuotedOrder = !!order?.quote_id;
  const canCancel   = order?.status === 'pending' && order?.payment_status === 'unpaid';
  const canRestore  = order?.status === 'cancelled' && order?.payment_status === 'unpaid';
  const canDelete   = order?.status === 'pending' && order?.payment_status === 'unpaid';

  const displayCurrency = order?.currency || 'KES';
  const symbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const money = (v, d = 2) => `${symbol} ${fmtNum(v, d)}`;
  const moneyKes = (v) => `KSh ${fmtNum(v)}`;
  const isNonKes = displayCurrency !== 'KES';
  const hasKesSnapshot = order?.subtotal_kes != null && order?.total_kes != null && order?.exchange_rate_to_kes != null;
  const showKes = isNonKes && hasKesSnapshot;

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.brand?.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleSaveChanges = async () => {
    if (orderType === 'bulk' && totalQty <= 100) { toast.error('Bulk orders must have more than 100 items total'); return; }
    if (deliveryMethod === 'courier' && !courierCompany.trim()) { toast.error('Please enter courier company name'); return; }
    if (!shippingAddress.trim()) { toast.error('Please enter shipping address'); return; }
    try {
      await updateMyOrder(order.id, {
        payment_method: paymentMethod, delivery_method: deliveryMethod,
        courier_company: deliveryMethod === 'courier' ? courierCompany : null,
        order_type: orderType, shipping_address: shippingAddress, customer_notes: customerNotes,
        items: items.map((item, i) => ({
        product_id:     item.product_id     || null,
        service_id:     item.service_id     || null,
        item_type:      item.item_type      || 'product',
        is_custom_item: item.is_custom_item || false,
        quantity:       item.quantity,
        unit_price:     item.unit_price     || null,
        discount_amount: item.discount_amount || 0,
        unit_of_measure: item.unit_of_measure || 'each',
        variant_details: itemVariants[i]    || item.variant_details || null,
      })),
      });
      toast.success('Order updated successfully');
      await fetchOrder(id);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update order'); }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a cancellation reason'); return; }
    try {
      await cancelOrder(order.id, cancelReason);
      toast.success('Order cancelled successfully');
      setCancelModal(false); navigate('/orders');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to cancel order'); }
  };

  const handleRestoreOrder = async () => {
    if (!window.confirm('Restore this order? Stock will be reserved again.')) return;
    try { await restoreCustomerOrder(order.id); toast.success('Order restored'); await fetchOrder(id); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to restore order'); }
  };

  const handleDeleteOrder = async () => {
    if (!window.confirm('Move this order to trash?')) return;
    try { await trashMyOrder(order.id); toast.success('Order moved to trash'); navigate('/orders'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to delete order'); }
  };

  const handleUpdateQuantity = (i, v) => {
    const updated = [...items]; updated[i] = { ...updated[i], quantity: Math.max(1, parseInt(v) || 1) }; setItems(updated);
  };
  const handleRemoveItem = (i) => {
    if (items.length === 1) { toast.error('Cannot remove the last item. Cancel the order instead.'); return; }
    setItems(items.filter((_, idx) => idx !== i)); toast.success('Item removed');
  };
  const handleUpdateVariant = (i, field, value) => {
    setItemVariants(prev => ({ ...prev, [i]: { ...(prev[i] || {}), [field]: value } }));
  };
  const handleAddItem = () => {
    if (!selectedProduct) { toast.error('Please select a product'); return; }
    const product = products.find(p => p.id === parseInt(selectedProduct));
    if (!product) { toast.error('Product not found'); return; }
    const existingIndex = items.findIndex(item => item.product_id === product.id);
    if (existingIndex !== -1) {
      const updated = [...items]; updated[existingIndex].quantity = Number(updated[existingIndex].quantity) + Number(newItemQuantity);
      setItems(updated); toast.success('Item quantity updated');
    } else {
      setItems([...items, { product_id: product.id, product_name: product.name, product_sku: product.sku, brand_name: product.brand?.name || '', quantity: newItemQuantity, unit_price: product.price, line_total: product.price * newItemQuantity }]);
      toast.success('Item added to order');
    }
    setAddItemModal(false); setSelectedProduct(''); setNewItemQuantity(1); setProductSearch('');
  };
  const handleSubmitRating = async () => {
    if (rating < 1 || rating > 10) { toast.error('Please select a rating between 1 and 10'); return; }
    try { await rateOrder(order.id, rating, feedback); toast.success('Thank you for your feedback!'); setRatingModal(false); await fetchOrder(id); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to submit rating'); }
  };

  if (loading && !order) return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header /><div className="flex-1 flex items-center justify-center"><LoadingSpinner size="lg" /></div><Footer />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(168,85,247,0.08)' }}>
            <Package size={28} color="#c084fc" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Order Not Found</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">This order doesn't exist or you don't have access to it.</p>
          <PurpleBtn onClick={() => navigate('/orders')}><ArrowLeft size={14} /> Back to Orders</PurpleBtn>
        </div>
      </div>
      <Footer />
    </div>
  );

  const statusCfg  = STATUS_ORDER_CFG[order.status]      || { color: '#9ca3af', label: order.status };
  const paymentCfg = PAYMENT_CFG[order.payment_status]   || { color: '#9ca3af', label: order.payment_status };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />

      <style>{`
        /* ── Main two-column grid ── */
        .cod-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 24px;
          align-items: start;
        }

        /* ── Page header row ── */
        .cod-page-header-inner {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }

        /* ── Item pricing table ── */
        .cod-pricing-table {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
        }

        /* ── Tablet (≤ 900px) ── */
       
        @media (max-width: 900px) {
          .cod-main-grid {
            grid-template-columns: 1fr;
          }

          /* Ensure right column drops nicely below */
          .cod-main-grid > div:last-child {
            margin-top: 16px;
          }
        }

        /* ── Mobile (≤ 640px) ── */
        @media (max-width: 640px) {
          .cod-page-header-inner {
            flex-direction: column;
          }
          .cod-page-header-inner .cod-total {
            text-align: left;
          }
          .cod-pricing-table {
            grid-template-columns: 1fr 1fr;
          }
          .cod-pricing-table > *:nth-child(3),
          .cod-pricing-table > *:nth-child(4) {
            margin-top: 8px;
          }
        }

        /* ── Very small phones (≤ 400px) ── */
        @media (max-width: 400px) {
          .cod-pricing-table {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 px-6 pt-6 pb-5"
        style={{ borderBottom: '2px solid rgba(168,85,247,0.2)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Top row: back button + actions */}
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <button onClick={() => navigate('/orders')} type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors flex-shrink-0">
              <ArrowLeft size={12} /> Back to Orders
            </button>

            <div className="flex flex-wrap gap-2">
              {canEdit && <PurpleBtn onClick={handleSaveChanges} loading={loading}><Save size={14} /> Save Changes</PurpleBtn>}
              {canEdit && (
                <GhostBtn onClick={() => setAddItemModal(true)} disabled={isQuotedOrder}>
                  <Plus size={14} /> Add Item
                </GhostBtn>
              )}
              {canDelete && <DangerBtn onClick={handleDeleteOrder} loading={loading}><Trash2 size={14} /> Delete Order</DangerBtn>}
            </div>
          </div>

          {/* Bottom row: order info + total */}
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#c084fc' }}>Order</p>
              <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: '#a855f7' }}>{order.order_number}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill label={statusCfg.label} color={statusCfg.color} />
                <StatusPill label={paymentCfg.label} color={paymentCfg.color} />
                {order.order_type && (
                  <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(168,85,247,0.08)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}>
                    {order.order_type}
                  </span>
                )}
                {order.invoice_number && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(168,85,247,0.08)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}>
                     {order.invoice_number}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Placed {safeFormat(order.created_at, 'MMMM d, yyyy · h:mm a')}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c084fc' }}>Total</p>
              <p className="text-2xl font-bold" style={{ color: '#a855f7' }}>{money(order.total)}</p>
              {showKes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{moneyKes(order.total_kes)}</p>}
            </div>
          </div>

        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto' }} className="w-full px-6 py-8 pb-16">

        {/* Status banners */}
        {order.status === 'cancelled' && (
          <div className="flex items-start gap-3 p-4 rounded-xl mb-5"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444' }}>
            <XCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-bold m-0" style={{ color: '#b91c1c' }}>Order Cancelled</p>
              <p className="text-xs mt-1 m-0" style={{ color: '#ef4444', opacity: 0.85 }}>
                {order.cancellation_reason || 'This order has been cancelled.'}
              </p>
            </div>
          </div>
        )}
        {canEdit && (
          <div className="flex items-start gap-3 p-4 rounded-xl mb-5"
            style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderLeft: '4px solid #a855f7' }}>
            <CheckCircle size={15} color="#a855f7" className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold m-0" style={{ color: '#7c3aed' }}>Order Can Be Modified</p>
              <p className="text-xs mt-0.5 m-0" style={{ color: '#a855f7', opacity: 0.8 }}>This order is pending. Make your changes and click "Save Changes" when done.</p>
            </div>
          </div>
        )}

        <div className="cod-main-grid">

          {/* ── LEFT ────────────────────────────────────────────────────── */}
          <div>
            {/* Order Items */}
<Section title={`Order Items · ${items.length}`} icon={Package} accent="#a855f7">

  {/* View toggle */}
  {items.length > 0 && (
    <div className="flex items-center gap-2 mb-4 p-1 rounded-xl w-fit" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
      {['minimal', 'detailed'].map(mode => (
        <button key={mode} type="button"
          onClick={() => setItemView(mode)}
          className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize"
          style={itemView === mode ? {
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
            color: 'white',
            boxShadow: '0 2px 8px rgba(168,85,247,0.35)',
          } : { color: '#a78bfa' }}>
          {mode}
        </button>
      ))}
    </div>
  )}

  <div className="space-y-3">
    {items.map((item, idx) => {
      const TypeIcon      = ITEM_TYPE_ICON[item.item_type || item.type] || Package;
      const isService     = (item.item_type || item.type)?.includes('service');
      const isFee         = (item.item_type || item.type) === 'fee';
      const typeColor     = isService ? '#10b981' : isFee ? '#f59e0b' : '#a855f7';

      const qty           = parseFloat(item.quantity || 1);
      const unitPrice     = parseFloat(item.unit_price || 0);
      const discAmt       = parseFloat(item.discount_amount || 0);
      const lineTotal     = parseFloat(item.line_total || 0);
      const lineAfterDisc = parseFloat(item.line_total_after_discount || lineTotal);
      const origUnitPrice = lineTotal / Math.max(qty, 0.01);
      const hasDiscount   = discAmt > 0.01;
      const hasMarkup     = unitPrice > origUnitPrice && origUnitPrice > 0;
      const discPct       = hasDiscount && origUnitPrice > 0 ? ((origUnitPrice - unitPrice) / origUnitPrice * 100).toFixed(1) : 0;
      const markupPct     = hasMarkup ? ((unitPrice - origUnitPrice) / origUnitPrice * 100).toFixed(1) : 0;

      return (
        <div key={idx} className="rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(168,85,247,0.2)', transition: 'box-shadow 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 16px rgba(168,85,247,0.08)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

          <div className="p-4 bg-white dark:bg-gray-800">
            <div className="flex items-start gap-3">

              {/* Type icon */}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${typeColor}14`, border: `1px solid ${typeColor}30` }}>
                <TypeIcon size={16} color={typeColor} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">

                  {/* Left: badges + name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      <Chip color={typeColor}>{(item.item_type || item.type)?.replace('_', ' ')}</Chip>
                      {item.product_sku  && <Chip color="#9ca3af">SKU: {item.product_sku}</Chip>}
                      {item.brand_name   && <Chip color="#f756e1">{item.brand_name}</Chip>}
                      {item.is_bulk_pricing     && <Chip color="#3b82f6">Bulk</Chip>}
                      {item.is_negotiated_price && <Chip color="#a855f7">Negotiated</Chip>}
                      {item.is_taxable ? <Chip color="#10b981">Taxable</Chip> : <Chip color="#9ca3af">Non-Taxable</Chip>}
                      {item.fulfillment_status === 'backorder' && <Chip color="#f59e0b">Backorder</Chip>}
                      {item.backorder_quantity > 0 && <Chip color="#f97316">{item.backorder_quantity} on backorder</Chip>}
                    </div>
                    <p className="text-sm font-extrabold text-gray-900 dark:text-white">
                      {item.product_name || item.service_name || `Item ${idx + 1}`}
                    </p>
                  </div>

                  {/* Right: price + remove */}
                  <div className="flex items-start gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-base font-extrabold" style={{ color: '#a855f7' }}>{money(lineAfterDisc)}</p>
                      {(hasDiscount || hasMarkup) && (
                        <div className="flex items-center gap-1.5 justify-end mt-0.5">
                          <span className="text-xs text-gray-400 dark:text-gray-500 line-through">{money(lineTotal)}</span>
                          <Chip color={hasDiscount ? '#10b981' : '#f97316'}>
                            {hasDiscount ? `${discPct}% off` : `${markupPct}% up`}
                          </Chip>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{qty} × {money(unitPrice)}</p>
                    </div>

                    {canEdit && (
                      <button
                        onClick={() => {
                          handleRemoveItem(idx);
                          toast('Item removed — click Save Changes at the top to confirm.', {
                            icon: '💾', style: { fontSize: '0.8rem' },
                          });
                        }}
                        type="button"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; }}>
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Minimal: qty edit for non-quoted editable orders */}
                {itemView === 'minimal' && canEdit && !isQuotedOrder && (
                  <div className="mt-3 flex items-center gap-3">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Qty</p>
                    <Input type="number" min="1" value={item.quantity}
                      onChange={e => handleUpdateQuantity(idx, e.target.value)}
                      className="w-20" size="sm" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── DETAILED VIEW ── */}
          {itemView === 'detailed' && (
            <div style={{ borderTop: '1px solid rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.03)' }}>

              {/* Pricing table */}
              <div className="mx-4 mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="cod-pricing-table px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider"
                  style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)', color: '#a78bfa' }}>
                  <span>Unit Price</span>
                  <span className="text-center">Quantity</span>
                  <span className="text-center">{hasMarkup ? 'Markup' : 'Discount'}</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="grid items-start px-4 py-3 bg-white dark:bg-gray-800 text-xs"
                  style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                  <div>
                    <p className="font-extrabold text-gray-800 dark:text-gray-200">{money(unitPrice)}</p>
                    {hasDiscount && <p className="text-gray-400 dark:text-gray-500 line-through mt-0.5">{money(origUnitPrice)}</p>}
                    {item.unit_of_measure && <p className="text-gray-400 dark:text-gray-500 mt-0.5">per {item.unit_of_measure}</p>}
                  </div>
                  <div className="text-center">
                    {canEdit && !isQuotedOrder ? (
                      <Input type="number" min="1" value={item.quantity}
                        onChange={e => handleUpdateQuantity(idx, e.target.value)}
                        className="w-20 mx-auto" size="sm" />
                    ) : (
                      <p className="font-extrabold text-gray-800 dark:text-gray-200">{qty}</p>
                    )}
                    {item.unit_of_measure && <p className="text-gray-400 dark:text-gray-500 mt-0.5">{item.unit_of_measure}</p>}
                  </div>
                  <div className="text-center">
                    {hasDiscount ? (
                      <>
                        <p className="font-extrabold" style={{ color: '#10b981' }}>-{money(discAmt)}</p>
                        <p className="mt-0.5" style={{ color: '#10b981' }}>{discPct}% off</p>
                      </>
                    ) : hasMarkup ? (
                      <>
                        <p className="font-extrabold" style={{ color: '#f97316' }}>+{money((unitPrice - origUnitPrice) * qty)}</p>
                        <p className="mt-0.5" style={{ color: '#f97316' }}>{markupPct}% up</p>
                      </>
                    ) : (
                      <p className="text-gray-300 dark:text-gray-600">—</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-sm" style={{ color: '#a855f7' }}>{money(lineAfterDisc)}</p>
                    {(hasDiscount || hasMarkup) && (
                      <p className="text-gray-400 dark:text-gray-500 line-through mt-0.5">{money(lineTotal)}</p>
                    )}
                  </div>
                </div>

                {/* Save/markup footer */}
                {(hasDiscount || hasMarkup) && (
                  <div className="px-4 py-2 flex items-center justify-between"
                    style={{ borderTop: '1px solid rgba(168,85,247,0.1)', background: hasDiscount ? 'rgba(16,185,129,0.05)' : 'rgba(249,115,22,0.05)' }}>
                    <span className="text-xs font-bold" style={{ color: hasDiscount ? '#065f46' : '#9a3412' }}>
                      {hasDiscount ? 'Customer saves on this item' : 'Price includes a markup'}
                    </span>
                    <Chip color={hasDiscount ? '#10b981' : '#f97316'}>
                      {hasDiscount
                        ? `Save ${money(discAmt)} · ${discPct}% off`
                        : `+${money((unitPrice - origUnitPrice) * qty)} · ${markupPct}% up`}
                    </Chip>
                  </div>
                )}

                {/* Pricing notes inline */}
                {item.pricing_notes && (
                  <div className="px-4 py-2.5 flex gap-2 items-start"
                    style={{ borderTop: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.05)' }}>
                    <Info size={12} color="#a855f7" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p className="text-xs font-semibold m-0" style={{ color: '#a855f7' }}>{item.pricing_notes}</p>
                  </div>
                )}
              </div>

              {/* Fulfillment */}
              {(item.fulfillment_status || item.stock_status || item.backorder_quantity > 0 || item.reserved_at || item.quantity_returned > 0 || item.refund_amount > 0 || item.return_status !== 'none') && (() => {
                const returnCfg = {
                  requested: { color: '#f59e0b', label: 'Return Requested' },
                  approved:  { color: '#3b82f6', label: 'Return Approved' },
                  rejected:  { color: '#ef4444', label: 'Return Rejected' },
                  completed: { color: '#10b981', label: 'Return Completed' },
                }[item.return_status] || null;

                return (
                  <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                    <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                      <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#a78bfa' }}>
                        {(item.item_type === 'product' || item.item_type === 'custom_product') ? 'Fulfillment' : ' '}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800">
                      {[
                        item.fulfillment_status && (item.item_type === 'product' || item.item_type === 'custom_product') && ['Fulfillment', item.fulfillment_status.replace(/_/g, ' '), item.fulfillment_status === 'in_stock' ? '#10b981' : '#f59e0b', item.fulfillment_status === 'in_stock' ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)'],
                        item.stock_status && (item.item_type === 'product' || item.item_type === 'custom_product') && ['Stock Status', item.stock_status.replace(/_/g, ' '), item.stock_status === 'in_stock' ? '#10b981' : '#ef4444', item.stock_status === 'in_stock' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'],
                        item.backorder_quantity > 0 && (item.item_type === 'product' || item.item_type === 'custom_product') && ['Backorder Qty', `${item.backorder_quantity} units`, '#f59e0b', 'rgba(245,158,11,0.06)'],
                        item.reserved_at && (item.item_type === 'product' || item.item_type === 'custom_product') && ['Reserved At', new Date(item.reserved_at).toLocaleString(), '#3b82f6', 'rgba(59,130,246,0.06)'],
                        item.quantity_returned > 0 && ['Qty Returned', `${item.quantity_returned} units`, '#ef4444', 'rgba(239,68,68,0.06)'],
                        item.refund_amount > 0 && ['Refund Amount', money(item.refund_amount), '#ef4444', 'rgba(239,68,68,0.06)'],
                        returnCfg && ['Return Status', returnCfg.label, returnCfg.color, `${returnCfg.color}18`],
                      ].filter(Boolean).map(([label, val, color, bg], i) => (
                        <div key={label} className="grid px-4 py-2.5 text-xs items-center"
                          style={{ gridTemplateColumns: '130px 1fr', background: bg, borderTop: i > 0 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                          <span className="font-semibold" style={{ color }}>{label}</span>
                          <span className="font-bold text-gray-800 dark:text-gray-200 capitalize">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Service details */}
              {isService && (item.scheduled_start_date || item.scheduled_end_date || item.estimated_hours != null || item.hourly_rate != null || item.labor_cost != null || item.material_cost != null || item.estimated_duration) && (() => {
                const completionCfg = {
                  not_started: { color: '#9ca3af', label: 'Not Started' },
                  in_progress:  { color: '#f59e0b', label: 'In Progress' },
                  completed:    { color: '#10b981', label: 'Completed' },
                  on_hold:      { color: '#ef4444', label: 'On Hold' },
                  cancelled:    { color: '#6b7280', label: 'Cancelled' },
                }[item.completion_status] || { color: '#9ca3af', label: item.completion_status || 'Not Started' };

                return (
                  <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(59,130,246,0.25)' }}>
                    <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
                      <Wrench size={11} color="#3b82f6" />
                      <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#3b82f6' }}>Service Details</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800">
                      {[
                        (item.scheduled_start_date || item.scheduled_end_date) && ['Schedule', '#10b981', 'rgba(16,185,129,0.06)',
                          `${item.scheduled_start_date ? new Date(item.scheduled_start_date).toLocaleDateString() : '—'}${item.scheduled_end_date ? ` → ${new Date(item.scheduled_end_date).toLocaleDateString()}` : ''}`],
                        item.estimated_duration    && ['Duration',      '#a855f7', 'rgba(168,85,247,0.06)', item.estimated_duration],
                        item.estimated_hours != null && ['Est. Hours',  '#3b82f6', 'rgba(59,130,246,0.06)', `${parseFloat(item.estimated_hours).toFixed(1)} hrs`],
                        item.hourly_rate != null   && ['Hourly Rate',   '#f59e0b', 'rgba(245,158,11,0.06)', `${money(item.hourly_rate)} / hr`],
                        item.labor_cost != null    && ['Labor Cost',    '#ef4444', 'rgba(239,68,68,0.06)',  money(item.labor_cost)],
                        item.material_cost != null && ['Material Cost', '#06b6d4', 'rgba(6,182,212,0.06)',  money(item.material_cost)],
                      ].filter(Boolean).map(([label, color, bg, val], i) => (
                        <div key={label} className="grid px-4 py-2.5 text-xs"
                          style={{ gridTemplateColumns: '130px 1fr', background: bg, borderTop: i > 0 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                          <span className="font-semibold" style={{ color }}>{label}</span>
                          <span className="font-bold text-gray-800 dark:text-gray-200">{val}</span>
                        </div>
                      ))}
                    </div>
                    {/* Completion bar */}
                    <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(59,130,246,0.15)', background: 'rgba(59,130,246,0.04)' }}>
                      <div className="flex justify-between items-center mb-1.5">
                        <Chip color={completionCfg.color}>{completionCfg.label}</Chip>
                        <span className="text-xs font-extrabold" style={{ color: completionCfg.color }}>{item.completion_percentage || 0}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(168,85,247,0.1)' }}>
                        <div style={{ height: '100%', width: `${item.completion_percentage || 0}%`, background: completionCfg.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Variant details — editable */}
              {canEdit && (
                <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                  <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                    <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#a78bfa' }}>Variant Details</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-4 bg-white dark:bg-gray-800">
                    {['color', 'size', 'material', 'other'].map(field => (
                      <Input key={field}
                        placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        value={itemVariants[idx]?.[field] || item.variant_details?.[field] || ''}
                        onChange={e => handleUpdateVariant(idx, field, e.target.value)}
                        size="sm" />
                    ))}
                  </div>
                </div>
              )}

              {/* Variant details — read only */}
              {item.variant_details && Object.keys(item.variant_details).length > 0 && (
                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(168,85,247,0.2)` }}>
                  <div style={{ padding: '8px 14px', background: 'rgba(168,85,247,0.08)', borderBottom: `1px solid rgba(168,85,247,0.15)` }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a78bfa', margin: 0 }}>Saved Variant Details</p>
                  </div>
                  <div style={{ background: 'var(--panel-bg,white)' }}>
                    {Object.entries(item.variant_details).map(([key, val], i) => (
                      <div key={key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', padding: '8px 14px', fontSize: '0.78rem', background: i % 2 === 0 ? 'transparent' : 'rgba(168,85,247,0.03)', borderTop: i > 0 ? `1px solid rgba(168,85,247,0.08)` : 'none' }}>
                        <span style={{ color: '#a78bfa', fontWeight: 700, textTransform: 'capitalize' }}>{key}</span>
                        <span style={{ fontWeight: 800, color: 'var(--text,#111827)' }}>{val || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom item details */}
              {item.custom_item_details && Object.keys(item.custom_item_details).length > 0 && (
                <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.25)' }}>
                  <div className="px-4 py-2.5" style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                    <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#f59e0b' }}>Custom Item Details</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800">
                    {Object.entries(item.custom_item_details).filter(([, v]) => v).map(([k, v], i) => (
                      <div key={k} className="grid px-4 py-2.5 text-xs"
                        style={{ gridTemplateColumns: '130px 1fr', background: i % 2 === 0 ? 'transparent' : 'rgba(245,158,11,0.03)', borderTop: i > 0 ? '1px solid rgba(245,158,11,0.08)' : 'none' }}>
                        <span className="font-semibold capitalize" style={{ color: '#f59e0b' }}>{String(k).replace(/_/g, ' ')}</span>
                        <span className="font-bold text-gray-800 dark:text-gray-200">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes & Info */}
              {(item.notes || item.prerequisites || item.pricing_notes) && (
                <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                  <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                    <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#a78bfa' }}>Notes & Info</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800">
                    {[
                      item.prerequisites && ['Prerequisites', item.prerequisites, '#3b82f6', 'rgba(59,130,246,0.06)'],
                      item.notes         && ['Notes',          item.notes,         '#a855f7', 'rgba(168,85,247,0.06)'],
                      item.pricing_notes && ['Pricing Notes',  item.pricing_notes, '#f59e0b', 'rgba(245,158,11,0.06)'],
                    ].filter(Boolean).map(([label, val, color, bg], i) => (
                      <div key={label} className="grid px-4 py-2.5 text-xs"
                        style={{ gridTemplateColumns: '130px 1fr', background: bg, borderTop: i > 0 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                        <span className="font-semibold" style={{ color }}>{label}</span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-4" />
            </div>
          )}
        </div>
      );
    })}
  </div>
</Section>

            {/* Order Items */}
            <Section title={`Pricing Summary · ${items.length}`} icon={Package} accent="#a855f7">
              {/* Pricing summary */}
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span>
                  <div className="text-right">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.subtotal)}</span>
                    {showKes && <p className="text-xs text-gray-400 dark:text-gray-500">{moneyKes(order.subtotal_kes)}</p>}
                  </div>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between" style={{ color: '#10b981' }}>
                    <span>Discount</span><span className="font-semibold">-{money(order.discount)}</span>
                  </div>
                )}
                {order.referral_discount > 0 && (
                  <div className="flex justify-between items-center" style={{ color: '#a855f7' }}>
                    <span className="flex items-center gap-1.5">
                      🎁 Referral Discount
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                        style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}>
                        Applied
                      </span>
                    </span>
                    <span className="font-semibold">-{money(order.referral_discount)}</span>
                  </div>
                )}
                {order.promo_discount > 0 && (
                  <div className="flex justify-between items-center" style={{ color: '#10b981' }}>
                    <span className="flex items-center gap-1.5">
                      Promo Code
                      {order.promo_code && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                          {order.promo_code}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">-{money(order.promo_discount)}</span>
                  </div>
                )}
                {order.tax > 0 && (
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Tax (16%)</span><span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.tax)}</span>
                  </div>
                )}
                {order.shipping_cost > 0 && (
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Shipping</span><span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-2 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-gray-800 dark:text-gray-200">Total</span>
                  <div className="text-right">
                    <span style={{ color: '#a855f7' }}>{money(order.total)}</span>
                    {showKes && (
                      <>
                        <p className="font-bold text-xs" style={{ color: '#a855f7' }}>{moneyKes(order.total_kes)}</p>
                        <p className="text-xs font-normal italic text-gray-400 dark:text-gray-500">
                          1 {displayCurrency} = {fmtNum(order.exchange_rate_to_kes, 6)} KES
                          {order.converted_at && ` · ${safeFormat(order.converted_at, 'MMM d, yyyy')}`}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* Order Settings */}
            <Section title="Order Settings" icon={FileText}>
              <div className="space-y-4">

                {/* Payment + Delivery row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CreditCard size={11} color="#c084fc" />
                      <p className="text-xs font-bold uppercase tracking-wider m-0" style={{ color: '#c084fc' }}>Payment</p>
                    </div>
                    {canEdit ? (
                      <Select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                        options={[
                          { value: 'request_invoice', label: 'Request Invoice' },
                          { value: 'pay_on_delivery', label: 'Pay on Delivery' },
                          { value: 'mpesa', label: 'M-Pesa' },
                          { value: 'bank_transfer', label: 'Bank Transfer' },
                          { value: 'credit_card', label: 'Credit Card' },
                          { value: 'credit', label: 'Credit' },
                        ]} />
                    ) : (
                      <p className="text-sm font-bold capitalize m-0" style={{ color: '#7c3aed' }}>{paymentMethod.replace(/_/g, ' ')}</p>
                    )}
                  </div>

                  <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Truck size={11} color="#c084fc" /><span></span>
                      <p className="text-xs font-bold uppercase tracking-wider m-0" style={{ color: '#c084fc' }}> Delivery</p>
                    </div>
                    {canEdit ? (
                      <Select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}
                        options={[
                          { value: 'pickup',            label: 'Pickup' },
                          { value: 'standard_delivery', label: 'Standard Delivery' },
                          { value: 'express_delivery',  label: 'Express Delivery' },
                          { value: 'courier',           label: 'Courier' },
                        ]} />
                    ) : (
                      <p className="text-sm font-bold capitalize m-0" style={{ color: '#7c3aed' }}>{deliveryMethod.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                </div>

                {/* Courier company — only when courier selected */}
                {deliveryMethod === 'courier' && (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Truck size={11} color="#c084fc" />
                      <p className="text-xs font-bold uppercase tracking-wider m-0" style={{ color: '#c084fc' }}>Courier Company</p>
                    </div>
                    {canEdit
                      ? <Input value={courierCompany} onChange={e => setCourierCompany(e.target.value)} placeholder="e.g., DHL, FedEx, G4S" />
                      : <p className="text-sm font-bold m-0" style={{ color: '#7c3aed' }}>{courierCompany || 'Not specified'}</p>}
                  </div>
                )}

                {/* Order Type */}
                <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Package size={11} color="#c084fc" />
                      <p className="text-xs font-bold uppercase tracking-wider m-0" style={{ color: '#c084fc' }}>Order Type</p>
                    </div>
                    {canEdit && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                        {totalQty} items
                      </span>
                    )}
                  </div>
                  {canEdit ? (
                    <>
                      <Select value={orderType} onChange={e => setOrderType(e.target.value)}
                        options={[
                          { value: 'standard', label: 'Standard' },
                          { value: 'bulk',     label: 'Bulk (100+ items required)' },
                          { value: 'b2b',      label: 'B2B (Business to Business)' },
                        ]} />
                      {orderType === 'bulk' && totalQty <= 100 && (
                        <div className="flex items-center gap-1.5 mt-2 p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <span style={{ color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700 }}>⚠ Bulk orders require 100+ items · current: {totalQty}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full capitalize"
                      style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)' }}>
                      {orderType}
                    </span>
                  )}
                </div>

                {/* Shipping Address */}
                <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <MapPin size={11} color="#c084fc" />
                    <p className="text-xs font-bold uppercase tracking-wider m-0" style={{ color: '#c084fc' }}>Shipping Address</p>
                  </div>
                  {canEdit
                    ? <Textarea value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} placeholder="Enter complete shipping address..." rows={3} />
                    : <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed m-0">{order.shipping_address}</p>}
                </div>

                {/* Customer Notes */}
                <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText size={11} color="#c084fc" />
                    <p className="text-xs font-bold uppercase tracking-wider m-0" style={{ color: '#c084fc' }}>Customer Notes</p>
                  </div>
                  {canEdit
                    ? <Textarea value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} placeholder="Any special instructions or notes..." rows={3} />
                    : <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed m-0">
                        {order.customer_notes || <span className="italic text-gray-400">No notes added</span>}
                      </p>}
                </div>

              </div>
            </Section>
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Status card */}
            <Section title="Status" icon={CheckCircle} accent="#a855f7">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Order</span>
                  <StatusPill label={statusCfg.label} color={statusCfg.color} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Payment</span>
                  <StatusPill label={paymentCfg.label} color={paymentCfg.color} />
                </div>
                {order.invoice_number && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 dark:text-gray-500">Invoice</span>
                    <span className="text-xs font-semibold" style={{ color: '#a855f7' }}>{order.invoice_number}</span>
                  </div>
                )}
              </div>
            </Section>

            {/* Tracking */}
            {order.tracking_number && (
              <Section title="Tracking" icon={Truck}>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Tracking Number</p>
                    <p className="font-semibold" style={{ color: '#a855f7' }}>{order.tracking_number}</p>
                  </div>
                  {order.courier_company && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Courier</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{order.courier_company}</p>
                    </div>
                  )}
                  {order.estimated_delivery_date && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">ETA</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{safeFormat(order.estimated_delivery_date, 'MMMM d, yyyy')}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Timeline */}
            <Section title="Timeline" icon={Clock}>
              <div className="space-y-0">
                {[
                  { label: 'Created',   val: order.created_at,   color: '#a855f7' },
                  { label: 'Confirmed', val: order.confirmed_at,  color: '#3b82f6' },
                  { label: 'Shipped',   val: order.shipped_at,    color: '#a855f7' },
                  { label: 'Delivered', val: order.delivered_at,  color: '#10b981' },
                  { label: 'Cancelled', val: order.cancelled_at,  color: '#ef4444' },
                ].filter(t => t.val).map(({ label, val, color }) => (
                  <div key={label} className="flex items-start gap-2.5 pb-3 mb-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0 last:pb-0 last:mb-0">
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{safeFormat(val, 'MMM d · h:mm a')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Actions */}
            {canCancel && (
              <Section title="Actions" icon={X}>
                <DangerBtn onClick={() => setCancelModal(true)} fullWidth>
                  <X size={14} /> Cancel Order
                </DangerBtn>
              </Section>
            )}
            {!canCancel && order?.status === 'pending' && (
              <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <p className="text-xs text-amber-800 dark:text-amber-200">Paid orders cannot be cancelled online. Please contact support.</p>
              </div>
            )}

            {/* Restore */}
            {canRestore && (
              <Section title="Restore Order" icon={RefreshCw}>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">This cancelled order can be restored. We'll reserve the stock again.</p>
                <GreenBtn onClick={handleRestoreOrder} loading={loading} fullWidth><RefreshCw size={14} /> Restore Order</GreenBtn>
              </Section>
            )}

            {/* Cancelled + paid */}
            {order?.status === 'cancelled' && order?.payment_status !== 'unpaid' && (
              <div className="px-4 py-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700">
                <p className="text-xs text-orange-800 dark:text-orange-200">This paid order cannot be restored online. Contact support for assistance.</p>
              </div>
            )}

            {/* Rate order */}
            {canRate && (
              <Section title="Rate Your Order" icon={Star}>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">How was your experience?</p>
                <PurpleBtn onClick={() => setRatingModal(true)}><Star size={14} /> Leave a Rating</PurpleBtn>
              </Section>
            )}

            {/* Existing rating */}
            {order.rating && (
              <Section title="Your Rating" icon={Star} accent="#f59e0b">
                <div className="flex items-center gap-3 mb-2">
                  <Star size={18} color="#f59e0b" fill="#f59e0b" />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{order.rating}<span className="text-base font-normal text-gray-400">/10</span></span>
                </div>
                {order.feedback && <p className="text-sm text-gray-600 dark:text-gray-400">{order.feedback}</p>}
              </Section>
            )}
          </div>
        </div>
      </div>

      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>

            {/* Purple accent bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />

            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#c084fc' }}>Action</p>
              <h3 className="text-lg font-bold mb-4" style={{ color: '#111827' }}>
                Cancel <span style={{ color: '#a855f7' }}>{order.order_number}</span>
              </h3>

              <div className="flex items-start gap-3 p-3 rounded-xl mb-4"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444' }}>
                <span className="flex-shrink-0">⚠️</span>
                <p className="text-sm m-0" style={{ color: '#b91c1c' }}>Cancelling will restore stock for all items and cannot be undone.</p>
              </div>

              <div style={{ marginBottom: 4 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Cancellation Reason *
                </label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Why are you cancelling this order?"
                  rows={3}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: '1.5px solid #e5e7eb', fontSize: '0.82rem',
                    outline: 'none', color: '#111827', background: 'white',
                    fontWeight: 500, resize: 'vertical', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div className="flex gap-3 mt-5 pt-4" style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                <button onClick={() => setCancelModal(false)} type="button"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:border-purple-300"
                  style={{ background: 'white', border: '1.5px solid #e5e7eb', color: '#6b7280' }}>
                  Keep Order
                </button>
                <button onClick={handleCancelOrder} disabled={loading} type="button"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', boxShadow: '0 4px 12px rgba(239,68,68,0.3)', border: 'none' }}>
                  {loading ? 'Cancelling…' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Item Modal ────────────────────────────────────────────────── */}
      {addItemModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>

            {/* Accent bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />

            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#c084fc' }}>Order</p>
              <h3 className="text-lg font-bold mb-5" style={{ color: '#111827' }}>Add Item</h3>

              {products.length === 0 ? (
                <div className="text-center py-8">
                  <LoadingSpinner size="lg" />
                  <p className="text-sm mt-3" style={{ color: '#9ca3af' }}>Loading products…</p>
                </div>
              ) : (
                <div className="space-y-4">

                  {/* Search */}
                  <div className="relative">
                    <Search size={14} color="#9ca3af" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Search by name, SKU or brand…"
                      style={{
                        width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
                        borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: '0.82rem',
                        outline: 'none', color: '#111827', background: 'white',
                        fontWeight: 500, boxSizing: 'border-box',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                      onBlur={e =>  { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                  <p className="text-xs -mt-2" style={{ color: '#9ca3af' }}>{filteredProducts.length} of {products.length} products</p>

                  {/* Product list */}
                  <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredProducts.map(p => {
                      const alreadyInOrder = items.some(i => i.product_id === p.id);
                      const isSelected     = selectedProduct === p.id || selectedProduct === String(p.id);

                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={alreadyInOrder}
                          onClick={() => !alreadyInOrder && setSelectedProduct(p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                            cursor: alreadyInOrder ? 'not-allowed' : 'pointer',
                            border: isSelected
                              ? '1.5px solid #a855f7'
                              : alreadyInOrder
                              ? '1.5px solid rgba(168,85,247,0.15)'
                              : '1.5px solid #e5e7eb',
                            background: isSelected
                              ? 'rgba(168,85,247,0.08)'
                              : alreadyInOrder
                              ? 'rgba(168,85,247,0.03)'
                              : 'white',
                            opacity: alreadyInOrder ? 0.6 : 1,
                            transition: 'all 0.15s',
                          }}
                        >
                          {/* Tick / circle */}
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: alreadyInOrder || isSelected ? '#a855f7' : 'transparent',
                            border: alreadyInOrder || isSelected ? 'none' : '2px solid #d1d5db',
                          }}>
                            {(alreadyInOrder || isSelected) && <CheckCircle size={12} color="white" />}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name}
                              {alreadyInOrder && <span style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 600, color: '#a855f7' }}>· already in order</span>}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>
                              {p.product_sku && `SKU: ${p.product_sku} · `}{symbol} {fmtNum(p.price)}
                            </p>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {p.in_stock
                              ? <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981' }}>✓ {p.stock_quantity} in stock</span>
                              : <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b' }}>Backorder</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected product preview */}
                  {selectedProduct && (() => {
                    const p = products.find(p => p.id === parseInt(selectedProduct) || p.id === selectedProduct);
                    return p ? (
                      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{p.name}</p>
                        <p style={{ fontSize: '0.88rem', fontWeight: 900, color: '#a855f7', margin: 0 }}>{money(p.price)}</p>
                      </div>
                    ) : null;
                  })()}

                  {/* Quantity */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                      Quantity *
                    </label>
                    <input
                      type="number" min="1"
                      value={newItemQuantity}
                      onChange={e => setNewItemQuantity(parseInt(e.target.value) || 1)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 10,
                        border: '1.5px solid #e5e7eb', fontSize: '0.82rem',
                        outline: 'none', color: '#111827', background: 'white',
                        fontWeight: 500, boxSizing: 'border-box',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                      onBlur={e =>  { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex gap-3 mt-5 pt-4" style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                <button
                  type="button"
                  onClick={() => { setAddItemModal(false); setSelectedProduct(''); setNewItemQuantity(1); setProductSearch(''); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!selectedProduct || products.length === 0}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                    fontSize: '0.83rem', fontWeight: 700, cursor: !selectedProduct ? 'not-allowed' : 'pointer',
                    opacity: !selectedProduct ? 0.5 : 1,
                    boxShadow: '0 4px 12px rgba(168,85,247,0.3)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  <Plus size={14} /> Add to Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ratingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />

            <div className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Star size={13} color="#c084fc" />
                <p className="text-xs font-semibold uppercase tracking-widest m-0" style={{ color: '#c084fc' }}>Rate Your Order</p>
              </div>

              {/* Rating buttons */}
              <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                  <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#a78bfa' }}>
                    How was your experience? (1–10) *
                  </p>
                </div>
                <div className="p-4" style={{ background: 'white' }}>
                  <div className="flex gap-2 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => {
                      const isSelected = rating === n;
                      const color = n <= 4 ? '#ef4444' : n <= 7 ? '#f59e0b' : '#10b981';
                      return (
                        <button key={n} onClick={() => setRating(n)} type="button"
                          className="w-10 h-10 rounded-xl text-sm font-extrabold transition-all"
                          style={isSelected ? {
                            background: `linear-gradient(135deg,${color},${color}cc)`,
                            color: 'white',
                            boxShadow: `0 4px 10px ${color}55`,
                            transform: 'scale(1.12)',
                            border: 'none',
                          } : {
                            background: `${color}12`,
                            color,
                            border: `1px solid ${color}30`,
                          }}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {rating > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <Chip color={rating <= 4 ? '#ef4444' : rating <= 7 ? '#f59e0b' : '#10b981'}>
                        {rating <= 4 ? 'Poor' : rating <= 6 ? 'Fair' : rating <= 8 ? 'Good' : 'Excellent'}
                      </Chip>
                      <span className="text-xs" style={{ color: '#9ca3af' }}>{rating} / 10</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback */}
              <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="px-4 py-2.5" style={{ background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                  <p className="text-xs font-extrabold uppercase tracking-wider m-0" style={{ color: '#a78bfa' }}>
                    Feedback <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· optional</span>
                  </p>
                </div>
                <div className="p-4" style={{ background: 'white' }}>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="Tell us about your experience…"
                    rows={3}
                    maxLength={1000}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 10,
                      border: '1.5px solid #e5e7eb', fontSize: '0.82rem',
                      outline: 'none', color: '#111827', background: 'white',
                      fontWeight: 500, resize: 'vertical', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                    onBlur={e =>  { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <p className="text-xs mt-1.5 text-right m-0" style={{ color: '#9ca3af' }}>{feedback.length} / 1000</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4" style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                <button type="button" onClick={() => setRatingModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="button" onClick={handleSubmitRating} disabled={rating === 0 || loading}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                    fontSize: '0.83rem', fontWeight: 700,
                    cursor: rating === 0 ? 'not-allowed' : 'pointer',
                    opacity: rating === 0 ? 0.5 : 1,
                    boxShadow: '0 4px 12px rgba(168,85,247,0.3)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  <Star size={14} /> {loading ? 'Submitting…' : 'Submit Rating'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}