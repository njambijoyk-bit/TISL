import { useState, useEffect } from 'react';
import { XCircle, AlertTriangle, DollarSign, Package, AlertCircle, X } from 'lucide-react';

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none',
  color: '#111827', boxSizing: 'border-box', fontWeight: 500,
};
const focusIn  = e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const focusOut = e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 5, color: '#9ca3af' };

const StatusPill = ({ children, color }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
    color, background: `${color}18`, border: `1px solid ${color}30`,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
    {children}
  </span>
);

const statusColor = (s) => ({
  cancelled: '#ef4444', refunded: '#3b82f6', paid: '#10b981',
  partially_paid: '#f59e0b', delivered: '#10b981', shipped: '#a855f7',
}[s] || '#9ca3af');

// ── Currency helpers ──────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
const sym = (c = 'KES') => CURRENCY_SYMBOLS[c] || c;

const fmt = (n, d = 2) =>
  new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));

const money = (val, currency = 'KES', d = 2) => `${sym(currency)} ${fmt(val, d)}`;

// ── Shared overlay + card wrapper ─────────────────────────────────────────────
const Overlay = ({ children }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, overflowY: 'auto' }}>
    {children}
  </div>
);

export default function ReturnItemsModal({ isOpen, onClose, order, onConfirmCancel }) {
  const [cancellationReason, setCancellationReason] = useState('');
  const [refundItems, setRefundItems]               = useState([]);
  const [loading, setLoading]                       = useState(false);
  const [validationError, setValidationError]       = useState('');
  const [returnlessRefund, setReturnlessRefund]     = useState(false);
  const [manualRefundMode, setManualRefundMode]     = useState(false);
  const [manualRefundAmount, setManualRefundAmount] = useState('');
  const [refundType, setRefundType]                 = useState('full'); // full, no_tax, no_shipping, custom
  const [manualOverride, setManualOverride]         = useState(false);

  const orderItems   = order?.items || [];
  const hasItems     = orderItems.length > 0;
  const currency     = order?.currency || 'KES';
  const requiresRefund  = !!order && ['paid', 'partially_paid', 'overpayment'].includes(order.payment_status);
  const requiresReturn  = !!order && ['delivered', 'shipped'].includes(order.status);
  const canRefund       = requiresRefund;
  const isPartial       = order?.payment_status === 'partially_paid';
  const showKes         = currency !== 'KES' && Number(order?.exchange_rate_to_kes) > 0;
  const exchangeDate    = order?.converted_at
    ? new Date(order.converted_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  // Calculate net confirmed payments: sum confirmed inflows, subtract confirmed refunds.
  // Must mirror Order::getTotalConfirmedPayments() on the backend.
  const totalConfirmedPayments = (order?.payments || [])
    .filter(p => p.status === 'confirmed')
    .reduce((sum, p) => {
      const amt = Number(p.mpesa_amount_confirmed) || 0;
      return p.method === 'refund' ? sum - amt : sum + amt;
    }, 0);
    
  // Get snapshot data from the most recent confirmed payment
  const lastPayment = (order?.payments || [])
    .filter(p => p.status === 'confirmed')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  const snapshotTotal = Number(
    lastPayment?.snapshot_total_kes ?? 
    order?.snapshot_total_kes ?? 
    order?.total_kes ?? 
    (Number(order?.total || 0) * Number(order?.exchange_rate_to_kes || 1))
  );
  
  const snapshotTax = Number(
    lastPayment?.snapshot_tax_kes ?? 
    order?.snapshot_tax_kes ?? 
    (Number(order?.tax || 0) * Number(order?.exchange_rate_to_kes || 1))
  );
  
  const snapshotShipping = Number(
    lastPayment?.snapshot_shipping_kes ?? 
    order?.snapshot_shipping_kes ?? 
    (Number(order?.shipping_cost || 0) * Number(order?.exchange_rate_to_kes || 1))
  );

  const totalOrderKes = snapshotTotal;
  // Subtotal-only sum of item line totals — used as denominator for proportional refund
  // distribution so that items cover 100% of their share (tax is a separate line, not
  // attributable to any single item).
  const snapshotSubtotalKes = Number(
    lastPayment?.snapshot_subtotal_kes ??
    order?.snapshot_subtotal_kes ??
    (Number(order?.subtotal || 0) * Number(order?.exchange_rate_to_kes || 1))
  );
  const maxRefundable = requiresRefund ? totalConfirmedPayments : 0;
  const canCancel = () => {
    if (!order)                              return { valid: false, reason: 'Order data is not available. Please try again.' };
    if (order.payment_status === 'refunded') return { valid: false, reason: 'This order has already been refunded and cannot be cancelled again.' };
    if (order.status === 'cancelled')        return { valid: false, reason: 'This order is already cancelled.' };
    return { valid: true };
  };

  useEffect(() => {
    if (!isOpen || !order) return;
    const v = canCancel();
    if (!v.valid) { setValidationError(v.reason); return; }
    setValidationError(''); setReturnlessRefund(false); setCancellationReason('');
    setRefundType('full');
    setRefundItems(
    hasItems
      ? orderItems.map(item => {
          const quantity = parseFloat(item.quantity || 0);
          const alreadyReturned = parseFloat(item.quantity_returned || 0);
          const unitPrice = parseFloat(item.unit_price || 0);
          const lineTotal = parseFloat(item.line_total_after_discount || item.line_total || 0);
          const lineTotalKes = parseFloat(
            item.line_total_after_discount_kes ?? 
            item.line_total_kes ?? 
            (lineTotal * (Number(order.exchange_rate_to_kes) || 1))
          );

          // Pre-populate refund_amount proportionally so submitting without touching
          // quantity fields sends the correct per-item refund (Bug 3a).
          // Use snapshotSubtotalKes as denominator — item line totals don't include tax
          // so dividing against subtotal (not total) gives 100% coverage (Bug 3b).
          const maxReturnable = Math.max(0, quantity - alreadyReturned);
          const subtotalDenom = snapshotSubtotalKes > 0 ? snapshotSubtotalKes : totalOrderKes;
          const itemShare = subtotalDenom > 0 ? (lineTotalKes / subtotalDenom) : 0;
          const preloadedRefund = canRefund && maxReturnable > 0
            ? (itemShare * maxRefundable).toFixed(2)
            : '0.00';

          return {
            order_item_id: item.id,
            product_name: item.product_name || item.service_name || item.description || 'Unknown Item',
            product_sku: item.product_sku || item.service_category || null,
            quantity,
            quantity_returned: maxReturnable,  // default to full returnable qty
            max_returnable: maxReturnable,
            unit_price: unitPrice,
            line_total: lineTotal,
            line_total_kes: lineTotalKes,
            refund_amount: preloadedRefund,
            return_status: 'approved',
          };
        })
      : []);
      }, [isOpen, order]);
  
  useEffect(() => {
    if (!order || refundType === 'custom') return;
    
    let amount = 0;
    if (refundType === 'full') {
      amount = snapshotTotal;
    } else if (refundType === 'no_tax') {
      amount = Math.max(0, snapshotTotal - snapshotTax);
    } else if (refundType === 'no_shipping') {
      amount = Math.max(0, snapshotTotal - snapshotShipping);
    }
    amount = Math.min(amount, totalConfirmedPayments);
    
    setManualRefundAmount(amount.toFixed(2));
  }, [refundType, order, snapshotTotal, snapshotTax, snapshotShipping, totalConfirmedPayments]);

  useEffect(() => {
    if (!manualRefundMode || !canRefund) return;
    const overrideTotal = parseFloat(manualRefundAmount) || 0;
    const subtotalDenom = snapshotSubtotalKes > 0 ? snapshotSubtotalKes : totalOrderKes;

    setRefundItems(prev => prev.map(item => {
      const itemShare = subtotalDenom > 0 ? (item.line_total_kes / subtotalDenom) : 0;
      const qtyShare  = item.quantity > 0 ? (parseFloat(item.quantity_returned) / item.quantity) : 0;
      return {
        ...item,
        refund_amount: (itemShare * overrideTotal * qtyShare).toFixed(2),
      };
    }));
  }, [manualRefundMode, manualRefundAmount]);

  const handleQuantityChange = (index, qty) => {
    const items = [...refundItems];
    const item = items[index];

    const parsedQty = parseFloat(qty);
    const q = Math.min(
      Math.max(0, Number.isNaN(parsedQty) ? 0 : parsedQty),
      parseFloat(item.max_returnable || 0)
    );

    item.quantity_returned = q;
    
    // Proportional refund: (item's share of subtotal) * (amount paid) * (qty fraction).
    // Denominator is snapshotSubtotalKes — item line totals are subtotal-only (no tax),
    // so using the full snapshotTotal would under-distribute by the tax portion.
    const subtotalDenom = snapshotSubtotalKes > 0 ? snapshotSubtotalKes : totalOrderKes;
    const itemShare = subtotalDenom > 0 ? (item.line_total_kes / subtotalDenom) : 0;
    const qtyShare = item.quantity > 0 ? (q / item.quantity) : 0;
    
    item.refund_amount = canRefund
      ? (itemShare * maxRefundable * qtyShare).toFixed(2)
      : '0.00';

    setRefundItems(items);
  };

  const handleRefundAmountChange = (index, amount) => {  
    const items = [...refundItems];  
    if (!canRefund) { items[index].refund_amount = '0.00'; return; }  
    // Cap to proportional share of actual confirmed payments  
    const subtotalDenom = snapshotSubtotalKes > 0 ? snapshotSubtotalKes : totalOrderKes;
    const itemMaxRefund = subtotalDenom > 0   
      ? (items[index].line_total_kes / subtotalDenom) * maxRefundable   
      : items[index].line_total;  
    items[index].refund_amount = Math.min(Math.max(0, parseFloat(amount) || 0), itemMaxRefund).toFixed(2);  
    setRefundItems(items);  
  };

  const handleReturnStatusChange = (index, status) => {
    const items = [...refundItems];
    items[index].return_status = status;
    setRefundItems(items);
  };

  const handleSubmit = async () => {
    if (!cancellationReason.trim()) return setValidationError('Please provide a cancellation reason');
    const v = canCancel();
    if (!v.valid) return setValidationError(v.reason);
    if (requiresReturn && !refundItems.some(i => i.quantity_returned > 0) && !returnlessRefund)
      return setValidationError('For shipped or delivered orders, return items or mark as returnless refund.');

    setLoading(true); setValidationError('');
    try {
      const payload = { 
        cancellation_reason: cancellationReason,
        // When manual override is OFF, refundType='full' has set manualRefundAmount=snapshotTotal.
        // Always send the resolved amount so the backend doesn't fall back to
        // totalConfirmedPayments (which for a fully-paid order equals the subtotal only).
        manual_refund_amount: requiresRefund
          ? (manualRefundMode
              ? manualRefundAmount                                           // override on: send entered amount
              : requiresReturn
                ? null                                                        // override off + return path: let backend sum items
                : Math.min(snapshotTotal, totalConfirmedPayments).toFixed(2)) // override off + paid-only: cap to confirmed
          : null,
      };
      if (requiresReturn && refundItems.length > 0) payload.refund_items = refundItems;
      if (returnlessRefund) payload.returnless_refund = true;
      await onConfirmCancel(payload);
      onClose();
    } catch (err) {
      setValidationError(err?.response?.data?.message || 'Failed to cancel order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // ── No order data ───────────────────────────────────────────────────────────
  if (!order) return (
    <Overlay>
      <div style={{ borderRadius: 20, border: '1px solid #f3f4f6', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', maxWidth: 440, width: '100%', padding: 32, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={26} color="#ef4444" />
        </div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', marginBottom: 8 }}>Order Data Missing</h3>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 24 }}>Unable to load order information. Please refresh and try again.</p>
        <button onClick={onClose} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px solid #e5e7eb', color: '#374151', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', background: 'transparent' }}>Close</button>
      </div>
    </Overlay>
  );

  // ── Cannot cancel ───────────────────────────────────────────────────────────
  const validation = canCancel();
  if (!validation.valid) return (
    <Overlay>
      <div style={{ borderRadius: 20, border: '1px solid #f3f4f6', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', maxWidth: 480, width: '100%', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <XCircle size={20} color="#ef4444" />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>Cannot Cancel Order</h3>
        </div>

        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 20 }}>
          <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{validationError || validation.reason}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.82rem', marginBottom: 20 }}>
          {[
            { label: 'Order Number',    value: order.order_number },
            { label: 'Current Status',  value: <StatusPill color={statusColor(order.status)}>{order.status}</StatusPill> },
            { label: 'Payment Status',  value: <StatusPill color={statusColor(order.payment_status)}>{order.payment_status}</StatusPill> },
            order.cancelled_at && { label: 'Cancelled At', value: new Date(order.cancelled_at).toLocaleString() },
          ].filter(Boolean).map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#9ca3af', fontWeight: 500 }}>{label}</span>
              <span style={{ fontWeight: 700, color: '#111827' }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px solid #e5e7eb', color: '#374151', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', background: 'transparent' }}>Close</button>
        </div>
      </div>
    </Overlay>
  );

  // ── Main modal ──────────────────────────────────────────────────────────────
  const totalRefundKes = manualRefundMode 
    ? Number(manualRefundAmount || 0) 
    : refundItems.reduce((s, i) => s + Number(i.refund_amount || 0), 0);

  const exchangeRate = Number(order?.exchange_rate_to_kes || 1);
  const totalRefund = (currency !== 'KES' && exchangeRate > 0)
    ? totalRefundKes / exchangeRate
    : totalRefundKes;

  const subDesc = requiresReturn
    ? canRefund ? 'Process return and refund for delivered/shipped order' : 'Process return (no refund — unpaid)'
    : canRefund ? 'Process full refund for paid order' : 'Cancel order and restore stock';

  return (
    <Overlay>
      <div style={{ borderRadius: 20, border: '1px solid #f3f4f6', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', maxWidth: 860, width: '100%', margin: '32px auto', overflow: 'hidden', background: 'white'  }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#ef4444,#dc2626)', borderRadius: '20px 20px 0 0' }} />
          <div>
            <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#ef4444', marginBottom: 4 }}>Order Management</p>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#9ca3af' }}>
              Cancel Order <span style={{ color: '#a855f7' }}>{order.order_number}</span>
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: 4 }}>{subDesc}</p>
          </div>
          <button onClick={onClose} disabled={loading}
            style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: '#9ca3af', padding: 4, borderRadius: 8, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '24px 28px 28px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(168,85,247,0.06)',
            border: '1px solid rgba(168,85,247,0.18)',
          }}>
            <p style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#a855f7',
              margin: '0 0 6px',
            }}>
              Return and Refund Limits
            </p>
            <p style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#a855f7',
              margin: '0 0 6px',
            }}>
              items[index].refund_amount = Math.min(
            Math.max(0, parseFloat(amount) || 0),
            items[index].line_total
          ).toFixed(2);
            </p>
            <p style={{
              fontSize: '0.78rem',
              color: '#6b7280',
              lineHeight: 1.65,
              margin: 0,
            }}>
              Max Returnable is calculated as the ordered quantity minus the quantity already returned. This means only the remaining items still with the customer can be returned. Refund Amount is automatically calculated from unit price multiplied by the quantity being returned. In the current form, the manual refund field cannot exceed the item’s saved line total.
            </p>
            <p style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#a855f7',
              margin: '0 0 6px',
            }}>
              max_refund = line_total
            </p>
            <p style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#a855f7',
              margin: '0 0 6px',
            }}>
              const lineTotal = parseFloat(item.line_total_after_discount || item.line_total || 0);
            </p>
          </div>
          {/* Warning banner */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 10, borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.06)' }}>
            <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e', margin: 0 }}>
              {requiresReturn
                ? 'This order has been delivered/shipped. Specify return details for each item below.'
                : requiresRefund
                ? 'This order has been paid. A full refund will be processed automatically.'
                : 'This order will be cancelled and stock will be restored.'}
            </p>
          </div>

          {/* Validation error */}
          {validationError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{validationError}</p>
            </div>
          )}

          {/* Cancellation reason */}
          <div>
            <label style={{ ...labelStyle, fontSize: '0.82rem' }}>
            <span style={{ color: '#ef4444' }}> Cancellation Reason *</span>
            </label>
            <textarea
              value={cancellationReason}
              onChange={e => setCancellationReason(e.target.value)}
              placeholder="Enter detailed reason for cancellation…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              onFocus={focusIn} onBlur={focusOut}
            />
          </div>

          {/* Manual Refund Override Section */}
          {requiresRefund && (
          <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid #f3f4f6', background: 'rgba(168,85,247,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={16} color="#a855f7" />
                <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', margin: 0 }}>
                  Refund Override
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={manualRefundMode} 
                  onChange={e => {
                    setManualRefundMode(e.target.checked);
                    if (!e.target.checked) {
                      setRefundType('full');
                      setManualRefundAmount('');
                    }
                  }}
                  style={{ accentColor: '#a855f7' }}
                />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Manual Override</span>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Order Total (KES)</p>
                <p style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', margin: 0 }}>{money(totalOrderKes, 'KES')}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Total Paid (KES)</p>
                <p style={{ fontSize: '1rem', fontWeight: 800, color: totalConfirmedPayments > totalOrderKes ? '#10b981' : '#111827', margin: 0 }}>
                  {money(totalConfirmedPayments, 'KES')}
                  {totalConfirmedPayments > totalOrderKes && (
                    <span style={{ marginLeft: 6, fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: '#10b98120', color: '#10b981' }}>OVERPAYMENT</span>
                  )}
                </p>
              </div>
            </div>

            {manualRefundMode && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', margin: 0 }}>Refund Options</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {[
                      { id: 'full',        label: 'Refund Total',      desc: 'Full amount paid' },
                      { id: 'no_tax',      label: 'Without Tax',        desc: isPartial ? 'N/A for partial payments' : `Excl. ${money(snapshotTax, 'KES')}`,      disabled: isPartial },
                      { id: 'no_shipping', label: 'Without Shipping',   desc: isPartial ? 'N/A for partial payments' : `Excl. ${money(snapshotShipping, 'KES')}`,  disabled: isPartial },
                      { id: 'custom',      label: 'Custom Amount',      desc: 'Enter manually' },
                    ].map(opt => (
                      <div
                        key={opt.id}
                        onClick={() => !opt.disabled && setRefundType(opt.id)}
                        title={opt.disabled ? 'Cannot be determined automatically for partially paid orders' : undefined}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: `1.5px solid ${opt.disabled ? '#f3f4f6' : refundType === opt.id ? '#a855f7' : '#f3f4f6'}`,
                          background: opt.disabled ? '#fafafa' : refundType === opt.id ? 'rgba(168,85,247,0.04)' : 'white',
                          cursor: opt.disabled ? 'not-allowed' : 'pointer',
                          opacity: opt.disabled ? 0.5 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        <p style={{ fontSize: '0.78rem', fontWeight: 700, color: opt.disabled ? '#9ca3af' : refundType === opt.id ? '#a855f7' : '#374151', margin: '0 0 2px' }}>
                          {opt.label}
                        </p>
                        <p style={{ fontSize: '0.65rem', color: opt.disabled ? '#d1d5db' : '#9ca3af', margin: 0 }}>
                          {opt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                  {isPartial && (
                    <p style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                      ⚠ Tax and shipping exclusions are unavailable — the portion attributable to each cannot be determined for a partially paid order.
                    </p>
                  )}
                </div>

                <label style={labelStyle}>Refund Amount (KES)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    max={totalConfirmedPayments}
                    step="0.01"
                    value={manualRefundAmount}
                    onChange={e => {
                      setManualRefundAmount(e.target.value);
                      if (refundType !== 'custom') setRefundType('custom');
                    }}
                    placeholder="Enter total refund amount..."
                    style={{ ...inputStyle, background: refundType === 'custom' ? 'white' : '#f9fafb' }}
                    onFocus={focusIn} onBlur={focusOut}
                  />
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 6 }}>
                    Max refund: {money(totalConfirmedPayments, 'KES')} (Total amount paid by customer)
                  </p>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Return items section */}
          {requiresReturn && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={16} color="#a855f7" />
                <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', margin: 0 }}>
                  Return Items ({refundItems.length})
                </p>
              </div>

              {/* Returnless refund checkbox */}
              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={returnlessRefund}
                    onChange={e => setReturnlessRefund(e.target.checked)}
                    style={{ accentColor: '#a855f7', width: 14, height: 14, marginTop: 2 }}
                  />
                  <span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400e' }}>Customer keeps all delivered items (returnless refund)</span>
                    <br />
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>No stock will be returned to inventory. Use only if refunding without physical return.</span>
                  </span>
                </label>
              </div>

              {!hasItems ? (
                <div style={{ textAlign: 'center', padding: '32px 24px', borderRadius: 12, border: '1px solid #f3f4f6' }}>
                  <Package size={28} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No items found in this order</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {refundItems.map((item, index) => (
                    <div key={index} style={{ borderRadius: 12, border: '1px solid #f3f4f6', padding: '16px 18px', background: 'rgba(168,85,247,0.02)' }}>
                      {/* Item header */}
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#a855f7', margin: '0 0 3px' }}>{item.product_name}</p>
                        <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Category / SKU: {item.product_sku}</p>
                        <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: '0.78rem', color: '#a855f7' }}>
                          <span>Ordered: <strong style={{ color: '#10b981' }}>{fmt(item.quantity, 2)}</strong></span>
                          <span>Unit Price: <strong style={{ color: '#3b82f6' }}>{money(item.unit_price, currency)}</strong></span>
                          <span>Max Returnable: <strong style={{ color: '#f59e0b' }}>{fmt(item.max_returnable, 2)}</strong></span>
                        </div>
                      </div>

                      {/* Qty / Refund / Status row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <div>
                          <label style={labelStyle}>Qty Returned</label>
                          <input
                            type="number"
                            min="0"
                            max={item.max_returnable}
                            step="0.01"
                            value={item.quantity_returned}
                            onChange={e => handleQuantityChange(index, e.target.value)}
                            disabled={returnlessRefund}
                            style={{ ...inputStyle, opacity: returnlessRefund ? 0.5 : 1, background: returnlessRefund ? '#f9fafb' : 'white' }}
                            onFocus={focusIn}
                            onBlur={focusOut}
                          />
                          {returnlessRefund && (
                            <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>Customer keeps item — no return</p>
                          )}
                        </div>
                        <div>
                          <label style={labelStyle}>Refund Amount ({sym(currency)})</label>
                          <input
                            type="number" min="0" max={(() => { const d = snapshotSubtotalKes > 0 ? snapshotSubtotalKes : totalOrderKes; return d > 0 ? (item.line_total_kes / d) * maxRefundable : item.line_total; })()} step="0.01"
                            value={item.refund_amount}
                            disabled={!canRefund || manualRefundMode}
                            onChange={e => handleRefundAmountChange(index, e.target.value)}
                            style={{ ...inputStyle, opacity: (canRefund && !manualRefundMode) ? 1 : 0.5, background: manualRefundMode ? '#f9fafb' : 'white' }}
                            onFocus={focusIn} onBlur={focusOut}
                          />
                          {!canRefund && (
                            <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>No payment received — refund locked</p>
                          )}
                          {canRefund && manualRefundMode && (
                            <p style={{ fontSize: '0.7rem', color: '#a855f7', marginTop: 4 }}>Set by override above</p>
                          )}
                        </div>
                        <div>
                          <label style={labelStyle}>Return Status</label>
                          <select
                            value={item.return_status}
                            onChange={e => handleReturnStatusChange(index, e.target.value)}
                            style={inputStyle}
                            onFocus={focusIn} onBlur={focusOut}
                          >
                            <option value="requested">Requested</option>
                            <option value="approved">Approved (Restocks)</option>
                            <option value="rejected">Rejected</option>
                            <option value="completed">Completed (Restocks)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

              {/* Total refund summary */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right', padding: '14px 20px', borderRadius: 12, border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.04)' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>Total Refund</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', margin: 0, letterSpacing: '-0.02em' }}>
                    {money(totalRefund, currency)}
                  </p>
                  {showKes && (
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#9ca3af' }}>
                      <p style={{ margin: '0 0 2px' }}>≈ {money(totalRefundKes, 'KES')}</p>
                      <p style={{ margin: 0, fontStyle: 'italic' }}>
                        1 {currency} = {fmt(order.exchange_rate_to_kes, 6)} KES{exchangeDate ? ` · ${exchangeDate}` : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>

          {requiresRefund && !requiresReturn && (  
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>  
              <DollarSign size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />  
              <div>  
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', margin: '0 0 4px' }}>  
                  Refund will be processed automatically  
                </p>  
                <p style={{ fontSize: '0.82rem', color: '#3b82f6', margin: '0 0 4px' }}>  
                  Order Total: <strong>{money(order.total || 0, currency)}</strong>  
                </p>  
                <p style={{ fontSize: '0.82rem', color: '#3b82f6', margin: '0 0 4px' }}>  
                  Total Confirmed Payments: <strong>{money(totalConfirmedPayments, 'KES')}</strong>  
                </p>  
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', margin: 0 }}>  
                  Max Refundable: <strong>{money(maxRefundable, 'KES')}</strong>  
                </p>  
                {totalConfirmedPayments < totalOrderKes && totalConfirmedPayments > 0 && (  
                  <p style={{ fontSize: '0.75rem', color: '#f59e0b', margin: '6px 0 0', fontWeight: 600 }}>  
                    ⚠️ This order was only partially paid. Refund is capped to the amount actually received.  
                  </p>  
                )}  
              </div>  
            </div>  
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, borderTop: '1px solid #f3f4f6' }}>
            <button onClick={onClose} disabled={loading} type="button"
              style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', color: '#6b7280', fontSize: '0.85rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', background: 'transparent', opacity: loading ? 0.5 : 1 }}>
              Close
            </button>
            <button onClick={handleSubmit} disabled={loading} type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', fontSize: '0.85rem', fontWeight: 800, boxShadow: '0 4px 14px rgba(239,68,68,0.3)', opacity: loading ? 0.7 : 1 }}>
              <XCircle size={16} />
              {loading ? 'Processing…' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}