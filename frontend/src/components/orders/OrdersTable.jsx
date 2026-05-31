import { useNavigate } from 'react-router-dom';
import { Package, Calendar, CreditCard, Truck, Star, Receipt, Wrench, ChevronRight } from 'lucide-react';

// ── Helpers (mirrors OrderCard) ───────────────────────────────────────────────
const CURRENCY_SYMBOLS = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };

const formatMoney = (amount, decimals = 2) => {
  const n = Number(amount || 0);
  return new Intl.NumberFormat('en-KE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
};

const STATUS_CFG = {
  pending:    { color: '#f59e0b' },
  confirmed:  { color: '#3b82f6' },
  processing: { color: '#3b82f6' },
  shipped:    { color: '#a855f7' },
  delivered:  { color: '#10b981' },
  cancelled:  { color: '#ef4444' },
  failed:     { color: '#ef4444' },
};

const PAYMENT_CFG = {
  paid:           { color: '#10b981' },
  unpaid:         { color: '#ef4444' },
  partially_paid: { color: '#f59e0b' },
  refunded:       { color: '#3b82f6' },
  failed:         { color: '#ef4444' },
};

const ITEM_TYPE_ICON = {
  product:        Package,
  custom_product: Package,
  service:        Wrench,
  custom_service: Wrench,
  fee:            Receipt,
};

function StatusPill({ label, color }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full text-xs font-semibold"
      style={{ background: `${color}18`, border: `1px solid ${color}33`, color, padding: '2px 8px 2px 6px' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function ItemThumb({ item }) {
  const Icon = ITEM_TYPE_ICON[item.type] || Package;
  const color = item.type?.includes('service') ? '#10b981' : item.type === 'fee' ? '#f59e0b' : '#a855f7';
  if (item.image_url) {
    return (
      <img src={item.image_url} alt={item.product_name}
        className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
        style={{ border: `1px solid ${color}22` }}
        onError={e => { e.currentTarget.style.display = 'none'; }} />
    );
  }
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}14`, border: `1px solid ${color}22` }}>
      <Icon size={13} color={color} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrdersTable({ orders = [], onCancel, isAdmin = false }) {
  const navigate = useNavigate();

  if (!orders.length) return null;

  return (
    <div className="w-full overflow-x-auto rounded-2xl"
      style={{ border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 1px 8px rgba(168,85,247,0.06)' }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>

        {/* Head */}
        <thead>
          <tr style={{ background: 'rgba(168,85,247,0.05)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
            {['Order', 'Date', 'Status', 'Payment', 'Items', 'Subtotal', 'Total', 'Method', 'Tracking', ''].map((h, i) => (
              <th key={i}
                className="text-left text-xs font-semibold uppercase tracking-wide px-4 py-3 whitespace-nowrap"
                style={{ color: '#a855f7' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {orders.map((order, idx) => {
            const displayCurrency = order?.currency || 'KES';
            const symbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
            const money = (v) => `${symbol} ${formatMoney(v)}`;
            const kesMoney = (v) => `KSh ${formatMoney(v)}`;
            const isNonKes = displayCurrency !== 'KES';
            const hasKesSnapshot = order?.exchange_rate_to_kes != null && order?.subtotal_kes != null && order?.total_kes != null;
            const showKes = isNonKes && hasKesSnapshot;
            const statusCfg  = STATUS_CFG[order.status]          || { color: '#9ca3af' };
            const paymentCfg = PAYMENT_CFG[order.payment_status]  || { color: '#9ca3af' };
            const canCancel  = order.status === 'pending' && order.payment_status === 'unpaid';
            const totalDiscount = (Number(order.discount) || 0) + (Number(order.referral_discount) || 0) + (Number(order.promo_discount) || 0);
            const isEven = idx % 2 === 0;

            return (
              <tr
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="cursor-pointer transition-colors"
                style={{
                  background: isEven ? 'rgba(168,85,247,0.05)' : 'rgba(168,85,247,0.015)',
                  borderBottom: '1px solid rgba(168,85,247,0.08)',
                  borderLeft: `3px solid ${statusCfg.color}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = isEven ? 'rgba(120, 85, 247, 0.09)' : 'rgba(168,85,247,0.015)'}
              >
                {/* Order number + badges */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-sm" style={{ color: '#a855f7' }}>{order.order_number}</span>
                    <div className="flex flex-wrap gap-1">
                      {order.order_type && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7' }}>
                          {order.order_type}
                        </span>
                      )}
                      {order.referral_code && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7' }}>
                          🎁 {order.referral_code}
                        </span>
                      )}
                      {order.promo_code && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                          🏷️ {order.promo_code}
                        </span>
                      )}
                    </div>
                    {order.rating && (
                      <div className="flex items-center gap-1">
                        <Star size={10} color="#f59e0b" fill="#f59e0b" />
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{order.rating}/10</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Date */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Calendar size={11} color="#c084fc" />
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </td>

                {/* Order status */}
                <td className="px-4 py-3">
                  <StatusPill label={order.status_label || order.status} color={statusCfg.color} />
                </td>

                {/* Payment status */}
                <td className="px-4 py-3">
                  <StatusPill label={order.payment_status_label || order.payment_status} color={paymentCfg.color} />
                </td>

                {/* Items thumbnails */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex -space-x-1.5">
                      {order.items?.slice(0, 3).map((item, i) => (
                        <div key={i} style={{ zIndex: 3 - i }}>
                          <ItemThumb item={item} />
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </td>

                {/* Subtotal + discounts */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-xs">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.subtotal || 0)}</span>
                    {showKes && <p className="text-gray-400 dark:text-gray-500">{kesMoney(order.subtotal_kes)}</p>}
                    {totalDiscount > 0 && (
                      <p className="font-semibold" style={{ color: '#10b981' }}>−{money(totalDiscount)}</p>
                    )}
                  </div>
                </td>

                {/* Total */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div>
                    <span className="font-bold text-sm" style={{ color: '#a855f7' }}>{money(order.total)}</span>
                    {showKes && <p className="text-xs text-gray-400 dark:text-gray-500">{kesMoney(order.total_kes)}</p>}
                    {Number(order.store_credit_deduction) > 0 && (
                      <p className="text-xs font-semibold" style={{ color: '#e48213' }}>💳 −{money(order.store_credit_deduction)}</p>
                    )}
                  </div>
                </td>

                {/* Payment method */}
                <td className="px-4 py-3">
                  {order.payment_method ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <CreditCard size={11} color="#c084fc" />
                      <span className="capitalize">{order.payment_method.replace(/_/g, ' ')}</span>
                    </div>
                  ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                </td>

                {/* Tracking */}
                <td className="px-4 py-3">
                  {order.tracking_number ? (
                    <div className="text-xs">
                      <div className="flex items-center gap-1">
                        <Truck size={10} color="#c084fc" />
                        <span className="font-semibold" style={{ color: '#a855f7' }}>{order.tracking_number}</span>
                      </div>
                      {order.courier_company && <p className="text-gray-400 dark:text-gray-500 mt-0.5">via {order.courier_company}</p>}
                      {order.estimated_delivery_date && (
                        <p className="text-gray-400 dark:text-gray-500">ETA: {new Date(order.estimated_delivery_date).toLocaleDateString()}</p>
                      )}
                    </div>
                  ) : order.shipping_method_name || order.delivery_method ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Truck size={10} color="#c084fc" />
                      <span className="capitalize">{(order.shipping_method_name || order.delivery_method).replace(/_/g, ' ')}</span>
                    </div>
                  ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                </td>

                {/* Actions */}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/orders/${order.id}`)}
                      type="button"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 2px 8px rgba(168,85,247,0.25)' }}
                    >
                      View <ChevronRight size={12} />
                    </button>
                    {!isAdmin && canCancel && (
                      <button
                        onClick={() => onCancel?.(order.id)}
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}