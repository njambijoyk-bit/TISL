import { useState } from 'react';
import { Package, Calendar, CreditCard, Truck, AlertCircle, Star, MapPin, FileText, ChevronDown, ChevronUp, Wrench, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Badge from '../common/Badge';
import Button from '../common/Button';

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function StatusPill({ label, color }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold"
      style={{ background: `${color}18`, border: `1px solid ${color}33`, color, padding: '3px 10px 3px 8px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

const ITEM_TYPE_ICON = {
  product:        Package,
  custom_product: Package,
  service:        Wrench,
  custom_service: Wrench,
  fee:            Receipt,
};

function ItemIcon({ type }) {
  const Icon = ITEM_TYPE_ICON[type] || Package;
  const color = type?.includes('service') ? '#10b981' : type === 'fee' ? '#f59e0b' : '#a855f7';
  return (
    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}14`, border: `1px solid ${color}22` }}>
      <Icon size={17} color={color} />
    </div>
  );
}

function InfoStrip({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl"
      style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
      <Icon size={14} color="#c084fc" className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function OrderCard({ order, onCancel, isAdmin = false }) {
  const navigate = useNavigate();
  const [showAllItems, setShowAllItems] = useState(false);

  const displayCurrency = order?.currency || 'KES';
  const symbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const money = (v, d = 2) => `${symbol} ${formatMoney(v, d)}`;
  const kesMoney = (v) => `KSh ${formatMoney(v)}`;

  const isNonKes = displayCurrency !== 'KES';
  const hasKesSnapshot = order?.exchange_rate_to_kes != null && order?.subtotal_kes != null && order?.total_kes != null;
  const showKes = isNonKes && hasKesSnapshot;

  const hasBackorder = order.items?.some(i => i.backorder_quantity > 0);
  const totalBackorder = order.items?.reduce((s, i) => s + (i.backorder_quantity || 0), 0) || 0;
  const canCancel = order.status === 'pending' && order.payment_status === 'unpaid';

  const statusCfg  = STATUS_CFG[order.status]         || { color: '#9ca3af' };
  const paymentCfg = PAYMENT_CFG[order.payment_status] || { color: '#9ca3af' };

  const visibleItems = order.items?.slice(0, showAllItems ? order.items.length : 3) || [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md"
      style={{ border: '1px solid rgba(168,85,247,0.2)' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 16px rgba(168,85,247,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>

      {/* Status accent bar */}
      <div style={{ height: 3, background: statusCfg.color, opacity: 0.7 }} />

      <div className="p-5">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-base font-bold" style={{ color: '#a855f7' }}>{order.order_number}</h3>
              <StatusPill label={order.status_label || order.status} color={statusCfg.color} />
              <StatusPill label={order.payment_status_label || order.payment_status} color={paymentCfg.color} />
              {order.order_type && (
                <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7' }}>
                  {order.order_type}
                </span>
              )}
              {order.referral_code && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7' }}>
                  🎁 {order.referral_code}
                </span>
              )}
              {order.promo_code && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                  🏷️ {order.promo_code}
                </span>
              )}
              {Number(order.store_credit_deduction) > 0 && (
              <div className="flex justify-between items-center" style={{ color: '#059669' }}>
                <span className="flex items-center gap-1">
                  💳 Store credit
                </span>
                <div className="text-right">
                  <span className="font-semibold">-{money(order.store_credit_deduction)}</span>
                  {showKes && Number(order.store_credit_deduction_kes) > 0 && (
                    <p className="text-gray-400">-{kesMoney(order.store_credit_deduction_kes)}</p>
                  )}
                </div>
              </div>
            )}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
              <span className="flex items-center gap-1.5"><Calendar size={12} color="#c084fc" />{new Date(order.created_at).toLocaleDateString()}</span>
              <span className="flex items-center gap-1.5"><Package size={12} color="#c084fc" />{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold" style={{ color: '#a855f7' }}>{money(order.total)}</p>
            {showKes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{kesMoney(order.total_kes)}</p>}
            {order.payment_method && (
              <p className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-1 justify-end">
                <CreditCard size={11} />{order.payment_method.replace(/_/g, ' ')}
              </p>
            )}
          </div>
        </div>

        {/* ── Rating ────────────────────────────────────────────────── */}
        {order.rating && (
          <div className="mb-4 flex items-start gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <Star size={15} color="#f59e0b" fill="#f59e0b" className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 dark:text-white">{order.rating}/10</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={order.rating >= 8
                    ? { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
                    : order.rating >= 6
                    ? { background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }
                    : { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {order.rating >= 8 ? 'Excellent' : order.rating >= 6 ? 'Good' : 'Needs Improvement'}
                </span>
              </div>
              {order.feedback && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{order.feedback}</p>}
            </div>
          </div>
        )}

        {/* ── Backorder warning ─────────────────────────────────────── */}
        {hasBackorder && (
          <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl"
            style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <AlertCircle size={14} color="#f97316" className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">{totalBackorder} item{totalBackorder !== 1 ? 's' : ''} on backorder</p>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">Will be fulfilled within 5–7 business days</p>
            </div>
          </div>
        )}

        {/* ── Customer notes ────────────────────────────────────────── */}
        {order.customer_notes && (
          <div className="mb-4">
            <InfoStrip icon={FileText}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Your Notes</p>
              <p className="line-clamp-2">{order.customer_notes}</p>
            </InfoStrip>
          </div>
        )}

        {/* ── Shipping address ──────────────────────────────────────── */}
        {order.shipping_address && (
          <div className="mb-4">
            <InfoStrip icon={MapPin}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Shipping To</p>
              <p className="line-clamp-2">{order.shipping_address}</p>
            </InfoStrip>
          </div>
        )}

        {/* ── Items ─────────────────────────────────────────────────── */}
        <div className="mb-4 space-y-2">
          {visibleItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 pb-2 last:pb-0"
              style={{ borderBottom: idx < visibleItems.length - 1 ? '1px solid rgba(168,85,247,0.1)' : 'none' }}>
              <ItemIcon type={item.item_type || item.type || 'product'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.product_name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Qty: {item.quantity}
                  {item.backorder_quantity > 0 && (
                    <span className="ml-2" style={{ color: '#f97316' }}>({item.backorder_quantity} on backorder)</span>
                  )}
                </p>
                {item.variant_details && Object.keys(item.variant_details).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(item.variant_details).slice(0, 2).map(([k, v]) => v && (
                      <span key={k} className="text-xs px-1.5 py-0.5 rounded-md"
                        style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)', color: '#a855f7' }}>
                        {k}: {v}
                      </span>
                    ))}
                    {Object.keys(item.variant_details).length > 2 && (
                      <span className="text-xs" style={{ color: '#c084fc' }}>+{Object.keys(item.variant_details).length - 2}</span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">
                {money(Number(item.line_total_after_discount || item.line_total || 0))}
              </p>
            </div>
          ))}

          {order.items?.length > 3 && (
            <button onClick={() => setShowAllItems(v => !v)} type="button"
              className="w-full py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all"
              style={{ border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#c084fc'; e.currentTarget.style.background = 'transparent'; }}>
              {showAllItems ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> Show {order.items.length - 3} More Items</>}
            </button>
          )}
        </div>

        {/* ── Pricing summary ───────────────────────────────────────── */}
        <div className="mb-4 p-3 rounded-xl"
          style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Subtotal</span>
              <div className="text-right">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.subtotal || 0)}</span>
                {showKes && <p className="text-gray-400 dark:text-gray-500">{kesMoney(order.subtotal_kes)}</p>}
              </div>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between" style={{ color: '#10b981' }}>
                <span>Discount</span>
                <span className="font-semibold">-{money(order.discount)}</span>
              </div>
            )}
            {order.referral_discount > 0 && (
              <div className="flex justify-between items-center" style={{ color: '#a855f7' }}>
                <span className="flex items-center gap-1">
                  🎁 Referral
                  {order.referral_code && (
                    <span className="font-bold px-1.5 py-0.5 rounded-md text-xs"
                      style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                      {order.referral_code}
                    </span>
                  )}
                </span>
                <span className="font-semibold">-{money(order.referral_discount)}</span>
              </div>
            )}
            {order.promo_discount > 0 && (
              <div className="flex justify-between items-center" style={{ color: '#10b981' }}>
                <span className="flex items-center gap-1">
                  🏷️ Promo
                  {order.promo_code && (
                    <span className="font-bold px-1.5 py-0.5 rounded-md text-xs"
                      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                      {order.promo_code}
                    </span>
                  )}
                </span>
                <span className="font-semibold">-{money(order.promo_discount)}</span>
              </div>
            )}
            {order.tax > 0 && (
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>Tax</span><span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.tax)}</span>
              </div>
            )}
            {order.shipping_cost > 0 && (
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>Shipping</span><span className="font-semibold text-gray-700 dark:text-gray-300">{money(order.shipping_cost)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 font-bold"
              style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
              <span className="text-gray-800 dark:text-gray-200">Total</span>
              <div className="text-right">
                <span style={{ color: '#a855f7' }}>{money(order.total)}</span>
                {showKes && (
                  <div className="mt-0.5">
                    <p className="font-bold" style={{ color: '#a855f7' }}>{kesMoney(order.total_kes)}</p>
                    <p className="text-xs font-normal text-gray-400 dark:text-gray-500 italic">
                      1 {displayCurrency} = {formatMoney(order.exchange_rate_to_kes, 6)} KES
                      {order.converted_at && ` · ${new Date(order.converted_at).toLocaleDateString()}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Delivery / tracking ───────────────────────────────────── */}
        {(order.tracking_number || order.delivery_method) && (
          <div className="mb-4">
            <InfoStrip icon={Truck}>
              {order.tracking_number ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Tracking: <span style={{ color: '#a855f7' }}>{order.tracking_number}</span>
                  </p>
                  {order.courier_company && <p className="text-xs text-gray-500 dark:text-gray-400">via {order.courier_company}</p>}
                  {order.estimated_delivery_date && <p className="text-xs text-gray-500 dark:text-gray-400">ETA: {new Date(order.estimated_delivery_date).toLocaleDateString()}</p>}
                </div>
              ) : (
                <p className="text-sm capitalize">{order.delivery_method?.replace(/_/g, ' ')}</p>
              )}
            </InfoStrip>
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 pt-4"
          style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
          <button
            onClick={() => navigate(`/orders/${order.id}`)}
            type="button"
            className="flex-1 py-2.5 px-4 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}
          >
            View Details
          </button>
          {!isAdmin && canCancel && (
            <button
              onClick={() => onCancel?.(order.id)}
              type="button"
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}