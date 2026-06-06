import { useState } from 'react';
import {
  Globe, DollarSign, FileText, Phone, BookOpen, Home, Crown, Gavel,
  Briefcase, Gift, Tag, Users, ChevronRight, GraduationCap, Award,
  UserCheck, Settings as SettingsIcon, FootprintsIcon, Truck,
  ChevronDown, ChevronUp, Copy, ArrowRight, AlertCircle, Boxes,
  Scale,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../../components/layout/Sidebar';
import toast from 'react-hot-toast';

const GROUPS = [
  {
    label: 'Content',
    items: [
      { name: 'About',    icon: FileText,       bg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#3b82f6', path: '/admin/settings/content/about',    active: true },
      { name: 'Contact',  icon: Phone,          bg: 'linear-gradient(135deg,#c2410c,#f97316)', color: '#f97316', path: '/admin/settings/content/contact',  active: true },
      { name: 'Manual',   icon: BookOpen,       bg: 'linear-gradient(135deg,#6d28d9,#a855f7)', color: '#a855f7', path: '/admin/settings/content/manual',   active: true },
      { name: 'Homepage', icon: Home,           bg: 'linear-gradient(135deg,#15803d,#22c55e)', color: '#22c55e', path: '/admin/settings/content/homepage', active: true },
      { name: 'Footer',   icon: FootprintsIcon, bg: 'linear-gradient(135deg,#b45309,#f59e0b)', color: '#f59e0b', path: '/admin/settings/content/footer',   active: true },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'General',  icon: Globe,      bg: 'linear-gradient(135deg,#0e7490,#06b6d4)', color: '#06b6d4', path: '/admin/settings/general',  active: true },
      { name: 'Currency', icon: DollarSign, bg: 'linear-gradient(135deg,#065f46,#10b981)', color: '#10b981', path: '/admin/settings/currency', active: true },
      { name: 'Customer Tiers',icon: Crown, bg: 'linear-gradient(135deg,#ec4899,#f472b6)', color: '#f472b6', path: '/admin/settings/customer-tiers',   active: true },
      { name: 'Shipping', icon: Truck,      bg: 'linear-gradient(135deg,#f97316,#fb923c)', color: '#fb923c', path: '/admin/settings/shipping', active: true },
      
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Work', icon: Briefcase,         bg: 'linear-gradient(135deg,#9d174d,#ec4899)', color: '#ec4899', path: '/admin/work',                  active: true },
      { name: 'Careers', icon: GraduationCap,  bg: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#6366f1', path: '/admin/careers/jobs',          active: true },
      { name: 'Inventory', icon: Boxes,        bg: 'linear-gradient(135deg,#c2410c,#f97316)', color: '#f97316', path: '/admin/inventory',             active: true },  
      { name: 'Reconciliation', icon: Scale,   bg: 'linear-gradient(135deg,#065f46,#10b981)', color: '#10b981', path: '/admin/reconciliation',        active: true },  
      { name: 'Publications', icon: FileText,  bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#a855f7', path: '/admin/settings/publications', active: true },
    ],
  },
  {
    label: 'People & Promos',
    items: [
      { name: 'User Management',     icon: Users, bg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#3b82f6', path: '/admin/users',       active: true },
      { name: 'Loyalties',           icon: Award, bg: 'linear-gradient(135deg,#9d174d,#ec4899)', color: '#ec4899', path: '/admin/loyalty',     active: true },
      { name: 'Referral Codes',      icon: Gift,  bg: 'linear-gradient(135deg,#ec4899,#f472b6)', color: '#f472b6', path: '/admin/referrals',   active: true },
      { name: 'Promo Codes',         icon: Tag,   bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#a78bfa', path: '/admin/promo-codes', active: true },
      { name: 'policy',              icon: Gavel, bg: 'linear-gradient(135deg,#c2410c,#f97316)', color: '#f97316', path: '/admin/settings/policy',  active: true },
    ],
  },
];

const SettingRow = ({ item, onClick, isLast }) => {
  const Icon = item.icon;

  return (
    <button
      onClick={() => item.active && onClick(item.path)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        background: 'transparent',
        border: 'none',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
        cursor: item.active ? 'pointer' : 'default',
        opacity: item.active ? 1 : 0.4,
        fontFamily: 'inherit',
        transition: 'background 150ms',
        textAlign: 'left',
      }}
      onMouseEnter={e => {
        if (item.active) e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: item.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}>
        <Icon size={16} color="white" strokeWidth={2.2} />
      </div>

      <span style={{
        flex: 1,
        fontSize: '0.88rem',
        fontWeight: 600,
        color: item.color,
      }}>
        {item.name}
      </span>

      {!item.active ? (
        <span style={{
          fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--color-text-muted, var(--color-text-secondary, var(--color-text)))',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '2px 7px', borderRadius: 20,
        }}>
          Soon
        </span>
      ) : (
        <ChevronRight size={13} strokeWidth={2.5} color="rgba(255,255,255,0.15)" />
      )}
    </button>
  );
};

const GroupCard = ({ group, onNavigate }) => (
  <div>
    <p style={{
      fontSize: '0.6rem', fontWeight: 700,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#a855f7',
      padding: '0 2px 8px',
      margin: 0, userSelect: 'none',
    }}>
      {group.label}
    </p>
    <div style={{
      background: 'var(--color-bg-elevated, var(--color-bg))',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    }}>
      {group.items.map((item, i) => (
        <SettingRow
          key={item.name}
          item={item}
          onClick={onNavigate}
          isLast={i === group.items.length - 1}
        />
      ))}
    </div>
  </div>
);

// ─── 1. Order Pricing Model ──────────────────────────────────────────────────
function OrderPricingAppendix() {
  const box = { background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 };
  const formulaBox = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.9, marginTop: 10, marginBottom: 4, whiteSpace: 'pre-wrap' };
  const label = { fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', marginBottom: 8, display: 'block' };
  const h = (text) => <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>;
  const p = (text, style = {}) => <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>;
 
  const DEDUCTIONS = [
    { step: 1, name: 'Customer Discount', field: '− customer_discount', color: '#f97316', note: 'From customer tier / type discount DB rules' },
    { step: 2, name: 'Referral Discount', field: '− referral_discount', color: '#ec4899', note: 'Applied when a referral code is used' },
    { step: 3, name: 'Promo Discount',    field: '− promo_discount',    color: '#8b5cf6', note: 'Validated and applied via PromoCodeService' },
    { step: 4, name: 'Tax (16%)',         field: '+ tax',               color: '#ef4444', note: 'Computed on taxable_amount after all discounts' },
    { step: 5, name: 'Shipping',          field: '+ shipping_cost',     color: '#3b82f6', note: 'From the active shipping option record' },
    { step: 6, name: 'Store Credit',      field: '− store_credit',      color: '#10b981', note: 'Cap: KES 500 for hamper orders' },
  ];
 
  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>
      {p('Every order total is assembled through a staged math pipeline. The controller uses calcPricing() to compute per-line amounts, sums them into a subtotal, then applies discounts, tax, shipping, and store credit in a fixed sequence.')}
 
      {h('Line Item Formula')}
      <div style={box}>
        <span style={label}>calcPricing(qty, unitPrice, discAmount)</span>
        <div style={formulaBox}>{`line_total_after_discount = qty × unit_price
line_total               = line_total_after_discount + discount_amount
 
→ line_total_after_discount  is the real payable amount per line
→ discount_amount can be positive (surcharge) or negative (discount)
→ line_total is the gross reference — not the amount charged`}</div>
      </div>
 
      {h('Subtotal')}
      <div style={box}>
        <span style={label}>Sum of all line net amounts</span>
        <div style={formulaBox}>{`subtotal = Σ ( line_total_after_discount )   ← across all items in the order`}</div>
        {p('Only line_total_after_discount flows into the subtotal — not line_total. The gross line_total is stored for reference but is not used in the total calculation.', { fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 0' })}
      </div>
 
      {h('Final Total — 6 Deduction / Addition Layers')}
      <div style={{ ...box, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          <span style={label}>Applied in this exact order, starting from subtotal</span>
        </div>
        {DEDUCTIONS.map((d, i) => (
          <div key={d.step} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: i < DEDUCTIONS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: `${d.color}22`, border: `1px solid ${d.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, color: d.color, flexShrink: 0 }}>{d.step}</span>
            <span style={{ width: 140, fontWeight: 700, color: d.color, fontSize: '0.78rem', flexShrink: 0 }}>{d.name}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#e9d5ff', width: 170, flexShrink: 0 }}>{d.field}</span>
            <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{d.note}</span>
          </div>
        ))}
        <div style={{ padding: '0 18px 14px', background: 'rgba(168,85,247,0.05)', borderTop: '1px solid rgba(168,85,247,0.12)' }}>
          <div style={formulaBox}>{`taxable_amount = subtotal − customer_discount − referral_discount − promo_discount
tax            = taxable_amount × 0.16
total          = taxable_amount + tax + shipping_cost − store_credit
 
net_total      = max(0, total − refunded_amount)   ← used in reporting`}</div>
        </div>
      </div>
    </div>
  );
}
 
 
// ─── 2. Order Creation Flow ──────────────────────────────────────────────────
function OrderCreationFlowAppendix() {
  const box = { background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 };
  const formulaBox = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.9, marginTop: 10, marginBottom: 4, whiteSpace: 'pre-wrap' };
  const label = { fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', marginBottom: 8, display: 'block' };
  const h = (text) => <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>;
  const p = (text, style = {}) => <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>;
 
  const STEPS = [
    { n: 'A', title: 'Validate Input',           color: '#6366f1', detail: 'Customer identity, contact, shipping address, delivery method, payment method, line items, optional promo and store credit fields' },
    { n: 'B', title: 'Resolve Customer',         color: '#8b5cf6', detail: 'Uses authenticated customer or finds/creates a guest by email. Order always ends up attached to a customers.id — no anonymous orders' },
    { n: 'C', title: 'Inspect Each Item',        color: '#a855f7', detail: 'Each item is classified: custom (no IDs), service (service_id only), or product (product_id present). Item type determines what DB tables are read and whether stock is touched' },
    { n: 'D', title: 'Build Line Totals',        color: '#c084fc', detail: 'calcPricing() runs per item. line_total_after_discount and line_total computed. Subtotal = Σ line_total_after_discount across all items' },
    { n: 'E', title: 'Apply Order-Level Math',   color: '#ec4899', detail: 'Sequential deductions: customer discount → referral discount → promo discount → tax (16%) → shipping → store credit. Produces the final payable total' },
    { n: 'F', title: 'Generate Order Number',    color: '#f97316', detail: 'Unique order reference number generated before the row is saved. Used as the human-readable identifier across all communications' },
    { n: 'G', title: 'Save Order Row',           color: '#f59e0b', detail: 'orders row created with all financial fields, shipping snapshot, status = pending, payment_status = unpaid' },
    { n: 'H', title: 'Save Order Items',         color: '#10b981', detail: 'createOrderItems() writes order_items rows. Simultaneously reserves stock, decrements products.stock_quantity, marks products out-of-stock when depleted' },
    { n: 'I', title: 'Record Promo / Referral',  color: '#06b6d4', detail: 'recordPromoUsage() increments usage metrics on the code row. referral_code_usage row is created/updated with order reference and reward details' },
    { n: 'J', title: 'Record Transactions',      color: '#3b82f6', detail: 'Payment, loyalty, and store credit transactions are written when applicable. Hamper-converted orders skip loyalty earning — it was already processed at hamper checkout' },
    { n: 'K', title: 'Send Confirmation Email',  color: '#ef4444', detail: 'Confirmation email dispatched to the customer. Order is live.' },
  ];
 
  const ITEM_TYPES = [
    { type: 'Product',     condition: 'product_id exists',                stocks: '✓ Reserves stock', inventory: '✓ Decrements stock_quantity', price: 'From products table', color: '#10b981' },
    { type: 'Service',     condition: 'service_id exists, no product_id', stocks: '✗ No effect',      inventory: '✗ No change',                 price: 'From services table', color: '#3b82f6' },
    { type: 'Custom Item', condition: 'no product_id, no service_id',     stocks: '✗ No effect',      inventory: '✗ No change',                 price: 'Manually provided',   color: '#f97316' },
  ];
 
  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>
      {p('store() is the customer checkout entry point. It is not a simple insert — it is an 11-step staged pipeline that validates, prices, writes, and notifies. Admin order creation via adminCreateOrder() follows the same stages with extra admin-controlled fields.')}
 
      {h('The 11-Step Pipeline')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {STEPS.map((step) => (
          <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 8, background: `${step.color}0d`, border: `1px solid ${step.color}25` }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: `${step.color}22`, border: `1px solid ${step.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: step.color, flexShrink: 0, marginTop: 1 }}>{step.n}</span>
            <div>
              <span style={{ fontWeight: 800, color: step.color, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{step.title}</span>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#d1d5db' }}>{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
 
      {h('Item Type Behaviour')}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
              {['Item Type', 'Detected When', 'Stock Reserved', 'Inventory Effect', 'Price Source'].map(col => (
                <th key={col} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.07em' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ITEM_TYPES.map((t, i) => (
              <tr key={t.type} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: t.color }}>{t.type}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#9ca3af' }}>{t.condition}</td>
                <td style={{ padding: '8px 10px', color: t.stocks.startsWith('✓') ? '#10b981' : '#ef4444', fontWeight: 600 }}>{t.stocks}</td>
                <td style={{ padding: '8px 10px', color: t.inventory.startsWith('✓') ? '#10b981' : '#ef4444', fontWeight: 600 }}>{t.inventory}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: '0.72rem' }}>{t.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
 
      {h('Tables Written on a Successful Checkout')}
      <div style={box}>
        <span style={label}>What gets created</span>
        <div style={formulaBox}>{`orders                     ← 1 row  (the order header)
order_items                ← N rows (one per line item)
products                   ← stock_quantity updated per product line
payments                   ← only if payment is recorded at creation time
loyalty_point_transactions ← if loyalty points are awarded
store_credit_transactions  ← if store credit was applied or refunded
referral_code_usage        ← if a referral or promo code was used`}</div>
      </div>
    </div>
  );
}
 
 
// ─── 3. Inventory Reservation System ────────────────────────────────────────
function InventoryReservationAppendix() {
  const box = { background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 };
  const formulaBox = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.9, marginTop: 10, marginBottom: 4, whiteSpace: 'pre-wrap' };
  const label = { fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', marginBottom: 8, display: 'block' };
  const h = (text) => <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>;
  const p = (text, style = {}) => <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>;
 
  const LIFECYCLE = [
    { event: 'Order Created',       formula: '− in_stock_quantity',  color: '#ef4444', note: 'Reserved from products.stock_quantity immediately' },
    { event: 'Order Cancelled',     formula: '+ in_stock_quantity',  color: '#10b981', note: 'Stock returned. backorder_quantity is NOT returned (was never deducted)' },
    { event: 'Order Trashed',       formula: '+ in_stock_quantity',  color: '#10b981', note: 'Same as cancel — stock released on trash' },
    { event: 'Order Restored',      formula: '− in_stock_quantity',  color: '#ef4444', note: 'Re-reserves stock. Fails if stock is now insufficient' },
    { event: 'Order Edited',        formula: '+ old  then  − new',   color: '#f59e0b', note: 'Full rebuild: old items restored → deleted → new items reserved' },
    { event: 'Permanently Deleted', formula: '+ in_stock_quantity',  color: '#10b981', note: 'Full restoration including backorder tracking cleanup. Use sparingly.' },
  ];
 
  const STATUS_RULES = [
    { status: 'in_stock',  rule: 'requestedQty ≤ currentStock',                color: '#10b981' },
    { status: 'partial',   rule: 'currentStock > 0  AND  requestedQty > stock', color: '#f59e0b' },
    { status: 'backorder', rule: 'currentStock = 0',                            color: '#ef4444' },
  ];
 
  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>
      {p('Inventory is a reservation system, not a simple subtract-on-checkout. Each order item stores exactly how many units were pulled from live stock vs. placed on backorder. That breakdown drives every reversal, restore, and edit operation.')}
 
      {h('Stock Validation — Backorder Buffer')}
      <div style={box}>
        <span style={label}>Checked before any item is saved</span>
        <div style={formulaBox}>{`max_allowed = current_stock + 200   ← hard cap per product line
 
if requestedQty > max_allowed  →  order rejected entirely`}</div>
        {p('The +200 buffer allows limited backordering without creating runaway obligations. Beyond 200 units over current stock, the request is blocked.', { fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 0' })}
      </div>
 
      {h('Line Reservation Split')}
      <div style={box}>
        <span style={label}>Per product item, inside createOrderItems()</span>
        <div style={formulaBox}>{`rawBackorder   = max(0, requestedQty − currentStock)
backorder_qty  = ceil(rawBackorder)          ← fractional shortage rounds up to full unit
in_stock_qty   = min(requestedQty, currentStock)
 
→ in_stock_qty   is deducted from products.stock_quantity immediately
→ backorder_qty  is tracked but does NOT reduce stock`}</div>
      </div>
 
      {h('Fulfillment Status')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {STATUS_RULES.map(r => (
          <div key={r.status} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderRadius: 8, background: `${r.color}0d`, border: `1px solid ${r.color}25` }}>
            <span style={{ fontWeight: 800, color: r.color, fontSize: '0.78rem', width: 90, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.status}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#e9d5ff' }}>{r.rule}</span>
          </div>
        ))}
      </div>
 
      {h('Fields Stored on Each order_items Row')}
      <div style={box}>
        <span style={label}>The reservation breakdown is always on the item</span>
        <div style={formulaBox}>{`quantity             ← what the customer ordered
in_stock_quantity    ← what was actually pulled from stock  ← KEY FIELD
backorder_quantity   ← what could not be fulfilled immediately
fulfillment_status   ← in_stock / partial / backorder
reserved_at          ← timestamp of reservation
stock_status         ← snapshot of stock state at reservation time`}</div>
        {p('in_stock_quantity is the number used in every reversal. When restoring, cancelling, or editing, the system always uses this field — not quantity — to know how much to return or re-reserve.', { fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 0' })}
      </div>
 
      {h('Stock Lifecycle Per Order Event')}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
              {['Event', 'Stock Effect', 'Notes'].map(col => (
                <th key={col} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.07em' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIFECYCLE.map((row, i) => (
              <tr key={row.event} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#d1d5db' }}>{row.event}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 800, color: row.color, whiteSpace: 'nowrap' }}>{row.formula}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: '0.72rem' }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
 
      {h('What Does Not Touch Inventory')}
      <div style={box}>
        <span style={label}>These operations never change stock_quantity</span>
        {[
          'Viewing, listing, searching, or filtering orders',
          'Generating invoices or PDF exports',
          'Statistics and reporting endpoints',
          'Payment status updates',
          'Rating or reviewing a delivered order',
          'Service items and custom items — only real product items affect stock',
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ color: '#6b7280', fontSize: '0.8rem', flexShrink: 0 }}>—</span>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{item}</span>
          </div>
        ))}
      </div>
 
      {h('Hamper Inventory — Separate System')}
      <div style={box}>
        <span style={label}>hampers table, not products</span>
        <div style={formulaBox}>{`hampers.total_stock      ← separate from products.stock_quantity
hampers.stock_remaining  ← decremented on hamper purchase
hampers.is_sold_out      ← flag set when stock_remaining reaches 0
 
Hamper model methods:
  decrementStock()
  purchaseCountForCustomer()`}</div>
        {p('Hamper inventory and product inventory are completely independent. A hamper order does not touch product stock — it touches the hamper record only.', { fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 0' })}
      </div>
    </div>
  );
}
 
 
// ─── 4. Transaction Ledgers ──────────────────────────────────────────────────
function TransactionLedgersAppendix() {
  const box = { background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 };
  const formulaBox = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.9, marginTop: 10, marginBottom: 4, whiteSpace: 'pre-wrap' };
  const label = { fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', marginBottom: 8, display: 'block' };
  const h = (text) => <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>;
  const p = (text, style = {}) => <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>;
 
  const PAYMENT_STATUS = [
    { condition: 'totalConfirmed ≤ 0',            status: 'unpaid',         color: '#ef4444' },
    { condition: 'totalConfirmed > totalKes',      status: 'overpayment',    color: '#f97316' },
    { condition: 'totalConfirmed ≥ totalKes',      status: 'paid',           color: '#10b981' },
    { condition: 'totalConfirmed > 0 < totalKes',  status: 'partially_paid', color: '#f59e0b' },
  ];
 
  const LOYALTY_EVENTS = [
    ['order_earned',    'Points awarded on order payment',         '#10b981'],
    ['order_cancelled', 'Points reversed when order is cancelled', '#ef4444'],
    ['order_restored',  'Points re-awarded when order is restored','#3b82f6'],
    ['admin_grant',     'Manual admin grant',                      '#a855f7'],
    ['admin_deduct',    'Manual admin deduction',                  '#f97316'],
    ['redemption',      'Customer redeems points',                 '#f59e0b'],
    ['expiry',          'Points expired by the system',            '#6b7280'],
  ];
 
  const CREDIT_EVENTS = [
    ['referral_reward', 'Referrer earns credit when a referral completes', '#ec4899'],
    ['order_refund',    'Credit returned on order cancellation',           '#10b981'],
    ['order_spend',     'Credit deducted when applied to an order',        '#ef4444'],
    ['admin_grant',     'Manual admin credit grant',                       '#a855f7'],
    ['admin_deduct',    'Manual admin deduction',                          '#f97316'],
    ['redemption',      'Customer redeems their store credit balance',     '#f59e0b'],
  ];
 
  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>
      {p('The system maintains three separate financial ledgers. Each owns a different kind of value: real money (payments), reward points (loyalty), and spendable balance (store credit). All three are append-only — balance and status are always derived from the ledger, never stored directly.')}
 
      {h('Ledger 1 — Payments')}
      <div style={box}>
        <span style={label}>payments table — real money events</span>
        {p('Created when an admin marks an order as paid or partially paid. Each row freezes the financial state at payment time via snapshot fields. These values do not change even if order totals are edited later.')}
        <div style={formulaBox}>{`Snapshot fields frozen at payment time:
  snapshot_subtotal_kes
  snapshot_tax_kes
  snapshot_discount_kes
  snapshot_shipping_kes
  snapshot_total_kes
  snapshot_amount_previously_paid_kes
  snapshot_amount_still_owed_kes`}</div>
        {p('M-Pesa references are protected against duplicate entries. Confirmed refund payments are subtracted from totalConfirmed when computing payment status.', { fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 0' })}
      </div>
 
      {h('Payment Status Derivation')}
      <div style={{ ...box, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          <span style={label}>Payment::syncOrderPaymentStatus() — derived from ledger, never guessed</span>
        </div>
        {PAYMENT_STATUS.map((row, i) => (
          <div key={row.status} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: i < PAYMENT_STATUS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#e9d5ff', flex: 1 }}>{row.condition}</span>
            <span style={{ fontWeight: 800, color: row.color, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>→ {row.status}</span>
          </div>
        ))}
        {p('Payment status is always computed from the sum of confirmed payment rows — it is never set manually on the order.', { fontSize: '0.78rem', color: '#9ca3af', margin: '10px 18px 10px' })}
      </div>
 
      {h('Ledger 2 — Loyalty Point Transactions')}
      <div style={box}>
        <span style={label}>loyalty_point_transactions — managed by LoyaltyService</span>
        <div style={formulaBox}>{`Earning formula:
  rawPoints = floor(totalKes / 100) × points_per_100_kes
  points    = rawPoints × tier_multiplier
 
→ Higher customer tiers earn more points via the multiplier
→ Hamper-converted orders skip this — loyalty was handled at hamper checkout`}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
        {LOYALTY_EVENTS.map(([type, desc, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 7, background: `${color}0d`, border: `1px solid ${color}20` }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color, fontSize: '0.72rem', width: 140, flexShrink: 0 }}>{type}</span>
            <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{desc}</span>
          </div>
        ))}
      </div>
 
      {h('Ledger 3 — Store Credit Transactions')}
      <div style={box}>
        <span style={label}>store_credit_transactions — also managed by LoyaltyService</span>
        {p('Store credit is a spendable balance separate from loyalty points. Hamper orders cap store credit usage at KES 500. Standard orders have no cap. The actual balance on customers.store_credit is derived from this ledger.', { fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 10px' })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
        {CREDIT_EVENTS.map(([type, desc, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 7, background: `${color}0d`, border: `1px solid ${color}20` }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color, fontSize: '0.72rem', width: 140, flexShrink: 0 }}>{type}</span>
            <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
 
 
// ─── 5. Referral & Promo Code Flow ───────────────────────────────────────────
function ReferralPromoAppendix() {
  const box = { background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 };
  const formulaBox = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.9, marginTop: 10, marginBottom: 4, whiteSpace: 'pre-wrap' };
  const label = { fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', marginBottom: 8, display: 'block' };
  const h = (text) => <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>;
  const p = (text, style = {}) => <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>;
 
  const REFERRAL_STEPS = [
    { step: '1', label: 'Referred customer places order',   color: '#ec4899', detail: 'Controller validates the referral code and links it to the order via orders.referral_code_id' },
    { step: '2', label: 'Usage recorded',                   color: '#f97316', detail: 'referral_code_usage row created with status = completed. Stores order_id and financial snapshot' },
    { step: '3', label: 'Referral discount applied',        color: '#f59e0b', detail: 'referral_discount deducted from taxable_amount in the final total calculation' },
    { step: '4', label: 'Referrer rewarded',                color: '#10b981', detail: 'If reward is configured, referrer receives store credit, loyalty points, or discount benefit via LoyaltyService' },
    { step: '5', label: 'On cancellation',                  color: '#6b7280', detail: 'adminCancel() calls cancelReferralUsage() — reverses the usage record and the referrer\'s reward' },
  ];
 
  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>
      {p('Both referral codes and promo codes share the same referral_codes table. They are differentiated by type semantics at the application layer — not by separate tables. All discount analytics live in one place as a result.')}
 
      {h('Shared Table Architecture')}
      <div style={box}>
        <span style={label}>referral_codes — used for both referrals and promos</span>
        <div style={formulaBox}>{`referral_codes           ← code definitions, reward config, usage stats
referral_code_usage      ← per-use lifecycle records, reward audit trail
 
orders.referral_code_id          ← code applied to a standard order
hamper_orders.referral_code_id   ← code applied to a hamper order`}</div>
        {p('PromoCodeService validates and applies promo codes. recordPromoUsage() increments times_used, total_revenue, and total_discount on the referral_codes row — identical behaviour whether it is a promo code or a referral code.', { fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 0' })}
      </div>
 
      {h('Referral Code Flow')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
        {REFERRAL_STEPS.map((item) => (
          <div key={item.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 8, background: `${item.color}0d`, border: `1px solid ${item.color}25` }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: `${item.color}22`, border: `1px solid ${item.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, color: item.color, flexShrink: 0, marginTop: 1 }}>{item.step}</span>
            <div>
              <span style={{ fontWeight: 700, color: item.color, fontSize: '0.78rem' }}>{item.label}</span>
              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#9ca3af' }}>{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
 
      {h('Promo Code Flow')}
      <div style={box}>
        <span style={label}>PromoCodeService → validate → apply → record</span>
        <div style={formulaBox}>{`1. PromoCodeService validates the code (active, not expired, within usage limit)
2. Discount calculated and stored as promo_discount on the order
3. After order is saved, recordPromoUsage() is called:
     referral_codes.times_used     += 1
     referral_codes.total_revenue  += order total
     referral_codes.total_discount += promo_discount amount
4. referral_code_usage row created with type = promo
 
On cancellation:
   Stats are reversed — times_used--, total_revenue--, total_discount--`}</div>
      </div>
 
      {h('Hamper Promo Behaviour — Special Case')}
      <div style={box}>
        <span style={label}>Promo codes on hamper orders follow different timing</span>
        {p('Promo stats are recorded at hamper checkout via recordSuccess(). When the hamper converts to a standard order, the standard order stores only promo_discount — the discount field is set to 0 to prevent double-counting the same amount across two fields.')}
        {p('Stats are not re-recorded on the converted standard order. They were already counted at hamper checkout and must not be incremented twice.', { fontSize: '0.78rem', color: '#9ca3af' })}
      </div>
    </div>
  );
}
 
 
// ─── 6. Table Relationships & Data Flow ─────────────────────────────────────
function TableRelationshipsAppendix() {
  const box = { background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 };
  const formulaBox = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.9, marginTop: 10, marginBottom: 4, whiteSpace: 'pre-wrap' };
  const label = { fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', marginBottom: 8, display: 'block' };
  const h = (text) => <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>;
  const p = (text, style = {}) => <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>;
 
  const CHAINS = [
    {
      title: 'Standard Order Chain',
      color: '#a855f7',
      chain: 'customers  →  orders  →  order_items',
      note: 'Core sales chain. One customer, one header row, N line item rows.',
    },
    {
      title: 'Product Fulfillment Chain',
      color: '#10b981',
      chain: 'products  →  [reserved via]  →  order_items  →  orders',
      note: 'Stock is reserved at the item level, not the order header level. in_stock_quantity is the key field.',
    },
    {
      title: 'Payment Chain',
      color: '#3b82f6',
      chain: 'orders  →  payments  (snapshot_*_kes fields frozen at payment time)',
      note: 'Payment status is always derived from the payments ledger by syncOrderPaymentStatus() — never set manually.',
    },
    {
      title: 'Loyalty & Credit Chains',
      color: '#f59e0b',
      chain: 'orders  →  loyalty_point_transactions\norders  →  store_credit_transactions',
      note: 'Both ledgers are written by LoyaltyService. Customer balances are derived from ledger sums, never stored directly.',
    },
    {
      title: 'Referral / Promo Chain',
      color: '#ec4899',
      chain: 'referral_codes  →  referral_code_usage  →  orders / hamper_orders',
      note: 'Referral codes and promo codes share the referral_codes table. Usage lifecycle is tracked per order via referral_code_usage.',
    },
    {
      title: 'Hamper Chain',
      color: '#f97316',
      chain: 'hampers  →  hamper_orders  ↔  orders  (via hamper_orders.order_id)',
      note: 'Bidirectional. A hamper order links to a standard order after conversion. Status changes on orders propagate notes back into hamper_orders.',
    },
    {
      title: 'Quote → Order Chain',
      color: '#06b6d4',
      chain: 'quotes  →  quote_items  →  [converted to]  →  orders  →  order_items',
      note: 'Quote conversion copies totals, address, and items into the order. Sets quote_id and converted_to_order_id on both ends.',
    },
    {
      title: 'Customer Statistics Chain',
      color: '#8b5cf6',
      chain: 'orders (confirmed / paid)  →  recalculateStatistics()  →  customers.*',
      note: 'customers.total_orders, total_spent, avg_order_value, last_order_date, tier are all derived aggregates. Cancelled and failed orders are excluded.',
    },
  ];
 
  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>
      {p('The order system is not a single table — it is a network of related tables that each own a slice of the order lifecycle. This is a map of every relationship chain and what each one owns.')}
 
      {h('Relationship Chains')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {CHAINS.map((chain) => (
          <div key={chain.title} style={{ borderRadius: 8, border: `1px solid ${chain.color}25`, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', background: `${chain.color}12`, borderBottom: `1px solid ${chain.color}20` }}>
              <span style={{ fontWeight: 800, color: chain.color, fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{chain.title}</span>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.76rem', color: '#e9d5ff', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{chain.chain}</div>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#6b7280' }}>{chain.note}</p>
            </div>
          </div>
        ))}
      </div>
 
      {h('Business-Layer Interpretation')}
      <div style={box}>
        <span style={label}>What each table actually represents</span>
        <div style={formulaBox}>{`orders                      ← master sales header
order_items                 ← line items (financial record + inventory reservation)
payments                    ← money ledger (audit-safe, snapshot-frozen at payment time)
customers                   ← account identity + derived order aggregates
products / services         ← sellable inventory and catalog records
referral_codes              ← discount + marketing audit layer (promo and referral)
referral_code_usage         ← per-use lifecycle and reward tracking
hamper_orders               ← specialized wrapper for hamper commerce
loyalty_point_transactions  ← reward points ledger (append-only)
store_credit_transactions   ← spendable balance ledger (append-only)
quotes / quote_items        ← pre-order planning layer (converted → orders)`}</div>
      </div>
    </div>
  );
}

function AlgorithmAppendix() {
  const box = {
    background: 'rgba(168,85,247,0.07)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: 10, padding: '14px 18px', marginBottom: 16,
  };
  const formulaBox = {
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(168,85,247,0.25)',
    borderRadius: 8, padding: '12px 16px',
    fontFamily: 'monospace', fontSize: '0.78rem',
    color: '#e9d5ff', lineHeight: 1.9,
    marginTop: 10, marginBottom: 4,
  };
  const label = {
    fontSize: '0.6rem', fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '0.1em',
    color: '#a855f7', marginBottom: 8, display: 'block',
  };
  const h = (text) => (
    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' }}>{text}</p>
  );
  const p = (text, style = {}) => (
    <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db', margin: '0 0 10px', ...style }}>{text}</p>
  );
  const pill = (text, color) => (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 99,
      fontSize: '0.68rem', fontWeight: 700,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      marginRight: 5, marginBottom: 4,
    }}>{text}</span>
  );

  const SIGNALS = [
    { key: 'recency',    label: 'Recency',    weight: 25, color: '#f97316', formula: 'max(0, 100 − days_since_last_order / 3.65)',            source: 'customers.last_order_date' },
    { key: 'frequency',  label: 'Frequency',  weight: 20, color: '#3b82f6', formula: 'min(100, log(total_orders + 1) / log(50) × 100)',       source: 'customers.total_orders' },
    { key: 'monetary',   label: 'Monetary',   weight: 20, color: '#10b981', formula: 'PERCENT_RANK() OVER (ORDER BY total_spent) × 100',      source: 'customers.total_spent' },
    { key: 'loyalty',    label: 'Loyalty',    weight: 15, color: '#f59e0b', formula: 'min(100, loyalty_points / 100)',                        source: 'customers.loyalty_points' },
    { key: 'engagement', label: 'Engagement', weight: 10, color: '#8b5cf6', formula: 'min(100, reviews×20 + bids×10 + quote_requests×15)',    source: 'product_reviews, auction_bids, quote_requests' },
    { key: 'service',    label: 'Service',    weight:  5, color: '#06b6d4', formula: 'min(100, bookings×25 + service_order_items×15)',         source: 'bookings, order_items (type=service)' },
    { key: 'referral',   label: 'Referral',   weight:  5, color: '#ec4899', formula: 'min(100, completed_referrals × 20)',                    source: 'referral_code_usage (status=completed)' },
  ];

  const SEGMENTS = [
    { label: 'champion', icon: '🏆', color: '#f59e0b', threshold: 'score ≥ 68',        sees: 'Recognition message, loyalty points bar, tier progress' },
    { label: 'loyal',    icon: '⭐', color: '#a855f7', threshold: 'score ≥ 48',        sees: 'Points balance, redemption progress, tier next step' },
    { label: 'at_risk',  icon: '⚡', color: '#f97316', threshold: 'last order > 90d',  sees: '"It\'s been N days" nudge + Shop Now CTA' },
    { label: 'dormant',  icon: '🌙', color: '#6b7280', threshold: 'score < 25',        sees: 'Come back nudge + New Arrivals CTA' },
    { label: 'new',      icon: '✨', color: '#10b981', threshold: 'total_orders = 0',  sees: 'Welcome message, double points promo hint' },
  ];

  return (
    <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#d1d5db' }}>

      {/* ── Overview ── */}
      {p('The Customer Scoring Algorithm is a server-side RFM + Loyalty + Engagement weighted scoring system that assigns every customer a 0–100 score. The score drives the AlgorithmBanner shown on the customer-facing site — personalising nudges, CTAs, and loyalty feedback in real time.')}
      {p('This is the Customer Algorithm. A separate Catalogue Algorithm (planned) will use these scores to reorder product and service listings per customer — high-recency customers see new arrivals first; high-loyalty customers see featured/sale items first.')}

      {/* ── Scoring formula ── */}
      {h('Scoring Formula')}
      <div style={box}>
        <span style={label}>Master Formula</span>
        <div style={formulaBox}>
          {'final_score = Σ ( raw_signal × signal_weight / 100 )'}<br />
          {'           then × segment_rule_boosts'}<br /><br />
          {'Where all raw signals are independently capped 0–100'}<br />
          {'and weights must sum to 100 for the score to stay in range.'}
        </div>
        {p('Weights are stored in algorithm_config (key: "weights") and editable live from the admin panel without touching code. Signal toggles (key: "signal_toggles") let you disable any signal entirely — disabled signals contribute 0 to the final score.', { margin: '8px 0 0', fontSize: '0.78rem', color: '#9ca3af' })}
      </div>

      {/* ── Signals table ── */}
      {h('The 7 Signals — Source, Formula, Weight')}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
              {['Signal', 'Default Weight', 'Formula (raw 0–100)', 'DB Source'].map(h => (
                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIGNALS.map((sig, i) => (
              <tr key={sig.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontWeight: 700, color: sig.color }}>{sig.label}</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <span style={{ fontWeight: 800, color: sig.color }}>{sig.weight}</span>
                </td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#e9d5ff', fontSize: '0.72rem' }}>
                  {sig.formula}
                </td>
                <td style={{ padding: '8px 10px', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                  {sig.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Segment rules ── */}
      {h('Segment Rules — Conditional Boosts')}
      <div style={box}>
        <span style={label}>How Segment Rules Work</span>
        {p('After the base weighted score is computed, segment rules apply conditional multipliers. A rule targets one signal and boosts or penalises it by a percentage for customers matching a condition.')}
        <div style={formulaBox}>
          {'Example rule:'}<br />
          {'  condition : tier = "gold"'}<br />
          {'  boost     : loyalty signal +20%'}<br /><br />
          {'Effect on a gold customer with loyalty_raw = 60:'}<br />
          {'  base contribution  = 60 × 15 / 100 = 9.0'}<br />
          {'  after +20% boost   = 9.0 × 1.20   = 10.8'}<br />
          {'  final score delta  = +1.8 points'}
        </div>
        {p('Rules are stored in algorithm_segment_rules and evaluated in PHP by AlgorithmService::applySegmentRules(). Multiple rules can match the same customer — each applies independently in sequence.', { margin: '8px 0 0', fontSize: '0.78rem', color: '#9ca3af' })}
      </div>

      {/* ── What customers see ── */}
      {h('What Each Customer Segment Sees')}
      {p('The AlgorithmBanner component reads useCustomerScore() — a client-side hook that mirrors the server signal computation using data already in useAuthStore. No extra API call is made. The banner is mounted once in App.jsx above all routes, so it persists across navigation.')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {SEGMENTS.map(seg => (
          <div key={seg.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '10px 14px', borderRadius: 8,
            background: `${seg.color}0d`,
            border: `1px solid ${seg.color}25`,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{seg.icon}</span>
            <div>
              <span style={{ fontWeight: 800, color: seg.color, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{seg.label}</span>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 8 }}>when {seg.threshold}</span>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#d1d5db' }}>{seg.sees}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── How actions affect score ── */}
      {h('How Customer Actions Affect the Score')}
      <div style={box}>
        <span style={label}>Action → Signal → Score Impact</span>
        {[
          ['Places an order',           'Recency ↑  Frequency ↑  Monetary ↑', '#10b981'],
          ['Earns loyalty points',       'Loyalty ↑',                          '#f59e0b'],
          ['Writes a product review',    'Engagement ↑ (+20 raw)',             '#8b5cf6'],
          ['Places an auction bid',      'Engagement ↑ (+10 raw)',             '#8b5cf6'],
          ['Submits a quote request',    'Engagement ↑ (+15 raw)',             '#8b5cf6'],
          ['Books a service',            'Service ↑ (+25 raw)',                '#06b6d4'],
          ['Completes a referral',       'Referral ↑ (+20 raw per referral)',  '#ec4899'],
          ['Goes 90+ days without order','Recency ↓ → at_risk segment',       '#f97316'],
        ].map(([action, impact, color]) => (
          <div key={action} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
            <span style={{ fontSize: '0.78rem', color: '#d1d5db' }}>{action}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color, flexShrink: 0 }}>{impact}</span>
          </div>
        ))}
        {p('Scores are recomputed in batch by the Artisan command algorithm:compute-scores (scheduled nightly at 03:00) or on-demand via POST /api/admin/algorithm/run from the admin panel. Individual scores can be triggered with --customer=ID.', { margin: '12px 0 0', fontSize: '0.75rem', color: '#6b7280' })}
      </div>

      {/* ── Auth store usage ── */}
      {h('Auth Store — How the Banner Reads Customer Data')}
      <div style={box}>
        <span style={label}>useAuthStore → useCustomerScore → AlgorithmBanner</span>
        <div style={formulaBox}>
          {'useAuthStore holds:'}<br />
          {'  user.customer.last_order_date   → recency signal'}<br />
          {'  user.customer.total_orders      → frequency signal'}<br />
          {'  user.customer.loyalty_points    → loyalty signal'}<br />
          {'  user.customer.tier             → segment rules + TierBadge'}<br />
          {'  user.customer.first_name       → personalised greeting'}<br /><br />
          {'useCustomerScore() computes a partial client-side score'}<br />
          {'from these three signals + neutral defaults (50) for'}<br />
          {'monetary, engagement, service, referral — those require'}<br />
          {'DB joins and are computed server-side only.'}
        </div>
        {p('The server-side score (customer_algorithm_scores table) is the authoritative score used in the admin leaderboard. The client-side score is approximate — used only to determine which segment message to show in the banner without a round-trip.', { margin: '8px 0 0', fontSize: '0.78rem', color: '#9ca3af' })}
      </div>

      {/* ── Who qualifies ── */}
      {h('Who Qualifies — Role Gating')}
      <div style={box}>
        <span style={label}>AlgorithmBanner Visibility Rules</span>
        {p('The banner checks useAuthStore immediately on mount. It renders nothing (returns null) for:')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {['admin', 'super_admin', 'staff', 'finance', 'vendor'].map(r => (
            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              ✕ {r}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(107,114,128,0.1)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.2)' }}>
            ✕ unauthenticated
          </span>
        </div>
        {p('Only authenticated users whose role is not in the exclusion list — i.e. regular customers — see the banner. This is intentional: admins and vendors manage the system; they are not targets of personalisation nudges. Scoring and recommendations are customer-only features.')}
        <div style={formulaBox}>
          {'// AlgorithmBanner.jsx — gate check'}<br />
          {'const role = user?.role;'}<br />
          {"const excluded = ['admin','super_admin','staff','finance','vendor'];"}<br />
          {'const show = isAuthenticated && !excluded.includes(role);'}<br />
          {'if (!show) return null;'}
        </div>
        {p('Admins can view and configure the algorithm via the Customer Scoring Algorithm page under /admin/algorithm. The Run Scoring Now button is additionally gated to super_admin only, matching the destructive-action convention used elsewhere in the admin panel.', { fontSize: '0.78rem', color: '#9ca3af' })}
      </div>

    </div>
  );
}

function RouteMapAppendix() {
  const navigate = useNavigate();
  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success(`Path copied: ${txt}`);
  };

  const th = { 
    padding: '10px', textAlign: 'left', borderBottom: '2px solid rgba(168,85,247,0.3)', 
    color: '#a855f7', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.05em'
  };
  const td = { 
    padding: '10px', fontSize: '0.78rem', color: '#d1d5db', 
    borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle'
  };
  
  const RouteGroup = ({ title, routes }) => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: 'rgba(0,0,0,0.2)', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
        >
          <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: 0 }}>{title}</h4>
          {open ? <ChevronUp size={13} color="rgba(255,255,255,0.15)" /> : <ChevronDown size={13} color="rgba(255,255,255,0.15)" />}
        </button>
        {open && (
          <div style={{ background: 'rgba(0,0,0,0.2)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Route Path</th>
                  <th style={th}>Destination Component</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontFamily: 'monospace', color: '#e9d5ff' }}>{r.path}</td>
                    <td style={td}>{r.comp}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => copy(r.path)} title="Copy Path" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, display: 'flex' }}>
                          <Copy size={13} />
                        </button>
                        {!r.path.includes(':') && (
                          <button onClick={() => navigate(r.path)} title="Navigate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a855f7', padding: 4, display: 'flex' }}>
                            <ArrowRight size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const ROLE_STYLES = {
    SUPER_ADMIN: { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.25)' },
    ADMIN:       { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)'  },
    FINANCE:     { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)'  },
    LOGISTICS:   { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)'  },
    SALES_REP:   { color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.25)'  },
    STAFF:       { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',   border: 'rgba(6,182,212,0.25)'   },
    CUSTOMER:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)'  },
  };

  const RoleGroup = ({ role, description, pages }) => {
    const [open, setOpen] = useState(false);
    const s = ROLE_STYLES[role] ?? ROLE_STYLES.STAFF;
    return (
      <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: `1px solid ${s.border}` }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', background: s.bg, border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            borderBottom: open ? `1px solid ${s.border}` : 'none',
            transition: 'opacity 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          <span style={{
            padding: '2px 10px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 800,
            letterSpacing: '0.07em', textTransform: 'uppercase',
            color: s.color, border: `1px solid ${s.border}`, background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}>
            {role}
          </span>
          <span style={{ flex: 1, fontSize: '0.8rem', color: '#9ca3af' }}>{description}</span>
          <span style={{ fontSize: '0.65rem', color: s.color, marginRight: 6 }}>{pages.length} routes</span>
          {open ? <ChevronUp size={13} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={13} color="rgba(255,255,255,0.3)" />}
        </button>

        {open && (
          <div style={{ background: 'rgba(0,0,0,0.2)' }}>
            {pages.map((page, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 14px',
                borderBottom: i < pages.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>
                <code style={{ fontSize: '0.74rem', color: '#e9d5ff', fontFamily: 'monospace', flexShrink: 0, minWidth: 220 }}>
                  {page.path}
                </code>
                <span style={{ fontSize: '0.78rem', color: '#9ca3af', flex: 1 }}>{page.label}</span>
                {page.gated && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '1px 7px', borderRadius: 99, flexShrink: 0 }}>
                    GATED
                  </span>
                )}
                {page.exclusive && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', padding: '1px 7px', borderRadius: 99, flexShrink: 0 }}>
                    EXCLUSIVE
                  </span>
                )}
                {!page.gated && !page.exclusive && (
                  <button onClick={() => !page.path.includes(':') && navigate(page.path)} title="Navigate"
                    style={{ background: 'none', border: 'none', cursor: page.path.includes(':') ? 'default' : 'pointer', color: s.color, padding: 4, display: 'flex', opacity: page.path.includes(':') ? 0.3 : 1 }}>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: '#9ca3af', marginBottom: 20 }}>
        Technical overview of the system routing architecture. This map tracks the relationship between URL paths and their respective React components as defined in <code style={{color: '#a855f7'}}>App.jsx</code>.
      </p>

      <RouteGroup title="1. Public Pages" routes={[
        { path: '/',                          comp: 'Home' },
        { path: '/auctions',                  comp: 'AuctionController@index' },
        { path: '/auctions/:id',              comp: 'AuctionController@show' },
        { path: '/products',                  comp: 'ProductController@index' },
        { path: '/products/:id',              comp: 'ProductController@show' },
        { path: '/services',                  comp: 'ServiceController@index' },
        { path: '/services/:id',              comp: 'ServiceController@show' },
        { path: '/specials',                  comp: 'Specials (filtered products)' },
        { path: '/cart',                      comp: 'Cart' },
        { path: '/wishlist',                  comp: 'Wishlist' },
        { path: '/quote-list',                comp: 'QuoteList' },
        { path: '/about',                     comp: 'ContentPageController@showBySlug' },
        { path: '/contact',                   comp: 'ContentPageController@showBySlug' },
        { path: '/manual',                    comp: 'ContentPageController@showBySlug' },
        { path: '/privacy',                   comp: 'PrivacyPolicy' },
        { path: '/terms',                     comp: 'TermsOfService' },
        { path: '/cookies',                   comp: 'CookiePolicy' },
        { path: '/brochures',                 comp: 'PublicationController@publicIndex' },
        { path: '/brochures/:slug',           comp: 'PublicationController@publicShow' },
        { path: '/news/:slug',                comp: 'PublicationController@publicShow' },
        { path: '/blog/:slug',                comp: 'PublicationController@publicShow' },
        { path: '/careers',                   comp: 'PublicJobController@index' },
        { path: '/careers/:slug',             comp: 'PublicJobController@show' },
        { path: '/careers/login',             comp: 'Applicant Login' },
        { path: '/careers/register',          comp: 'Applicant Register' },
        { path: '/careers/forgot-password',   comp: 'Applicant Forgot Password' },
        { path: '/careers/reset-password',    comp: 'Applicant Reset Password' },
        { path: '/careers/portal',            comp: 'ApplicantPortalController@myApplications' },
        { path: '/careers/portal/profile',    comp: 'Applicant Profile' },
        { path: '/careers/portal/change-password', comp: 'Applicant Change Password' },
      ]} />

      <RouteGroup title="2. Authentication" routes={[
        { path: '/login',                   comp: 'AuthController@login' },
        { path: '/register',                comp: 'AuthController@register' },
        { path: '/auth/callback',           comp: 'OAuthController@handleProviderCallback' },
        { path: '/force-change-password',   comp: 'AuthController@forceChangePassword' },
        { path: '/forgot-password',         comp: 'AuthController@forgotPassword' },
        { path: '/reset-password',          comp: 'AuthController@resetPassword' },
      ]} />

      <RouteGroup title="3. Customer Protected Pages" routes={[
        { path: '/hampers',                     comp: 'PublicHamperController@index' },
        { path: '/hampers/my-orders',           comp: 'HamperOrderController@myOrders' },
        { path: '/hampers/my-orders/:id',       comp: 'HamperOrderController@show' },
        { path: '/hampers/:slug',               comp: 'PublicHamperController@show' },
        { path: '/hampers/:slug/checkout',      comp: 'HamperCheckoutController@load' },
        { path: '/bookings',                    comp: 'BookingController@customerIndex' },
        { path: '/bookings/:id',                comp: 'BookingController@customerShow' },
        { path: '/services/:id/book',           comp: 'Book Service' },
        { path: '/checkout',                    comp: 'OrderController@store' },
        { path: '/orders',                      comp: 'OrderController@myOrders' },
        { path: '/orders/:id',                  comp: 'OrderController@show' },
        { path: '/request-quote',               comp: 'QuoteRequestController@store' },
        { path: '/my-quote-requests',           comp: 'QuoteRequestController@myQuoteRequests' },
        { path: '/my-quote-requests/:id',       comp: 'QuoteRequestController@show' },
        { path: '/my-quotes',                   comp: 'QuoteController@myQuotes' },
        { path: '/my-quotes/:id',               comp: 'QuoteController@show' },
        { path: '/my-tickets',                  comp: 'TicketController@myTickets' },
        { path: '/my-tickets/:id',              comp: 'TicketController@customerShow' },
        { path: '/profile',                     comp: 'RoleBasedProfile' },
        { path: '/my-projects',                 comp: 'ProjectController@customerIndex' },
        { path: '/my-projects/:id',             comp: 'ProjectController@customerShow' },
      ]} />

      <RouteGroup title="4. Admin — Core & Dashboard" routes={[
        { path: '/admin',                       comp: 'Dashboard' },
        { path: '/admin/profile',               comp: 'Admin Profile' },
        { path: '/admin/settings',              comp: 'Settings' },
        { path: '/admin/reports',               comp: 'ReportsController' },
        { path: '/admin/algorithm',             comp: 'AlgorithmController@getConfig' },
        { path: '/admin/algorithm/catalogue-boosts', comp: 'AlgorithmController@getCatalogueBoosts' },
        { path: '/admin/work',                  comp: 'WorkController@myDashboard' },
      ]} />

      <RouteGroup title="5. Admin — Orders & Payments" routes={[
        { path: '/admin/orders',                    comp: 'OrderController@index' },
        { path: '/admin/orders/:id',                comp: 'OrderController@adminShow' },
        { path: '/admin/orders/:id/ship',           comp: 'OrderController@ship' },
        { path: '/admin/orders/:id/payments',       comp: 'PaymentController@orderPayments' },
        { path: '/admin/finance/payments',          comp: 'PaymentController@index' },
        { path: '/admin/finance/payments/:id',      comp: 'PaymentController@show' },
      ]} />

      <RouteGroup title="6. Admin — Products, Brands & Categories" routes={[
        { path: '/admin/products',                  comp: 'ProductController@adminIndex' },
        { path: '/admin/products/create',           comp: 'ProductController@store' },
        { path: '/admin/products/:id/edit',         comp: 'ProductController@update' },
        { path: '/admin/brands',                    comp: 'BrandController@adminIndex' },
        { path: '/admin/brands/create',             comp: 'BrandController@store' },
        { path: '/admin/brands/:id/edit',           comp: 'BrandController@update' },
        { path: '/admin/categories',                comp: 'CategoryController' },
        { path: '/admin/categories/create',         comp: 'CategoryController@store' },
        { path: '/admin/categories/:id/edit',       comp: 'CategoryController@update' },
        { path: '/admin/reviews',                   comp: 'ProductReviewController@adminIndex' },
      ]} />

      <RouteGroup title="7. Admin — Quotes & Tickets" routes={[
        { path: '/admin/quote-requests',            comp: 'QuoteRequestController@index' },
        { path: '/admin/quote-requests/:id',        comp: 'QuoteRequestController@adminShow' },
        { path: '/admin/quotes',                    comp: 'QuoteController@adminIndex' },
        { path: '/admin/quotes/create',             comp: 'QuoteController@store' },
        { path: '/admin/quotes/new',                comp: 'QuoteController@store (alias)' },
        { path: '/admin/quotes/:id',                comp: 'QuoteController@adminShow' },
        { path: '/admin/quotes/:id/edit',           comp: 'QuoteController@update' },
        { path: '/admin/tickets',                   comp: 'TicketController@adminIndex' },
        { path: '/admin/tickets/:id',               comp: 'TicketController@adminShow' },
      ]} />

      <RouteGroup title="8. Admin — Services & Bookings" routes={[
        { path: '/admin/services',                      comp: 'ServiceController@adminIndex' },
        { path: '/admin/services/new',                  comp: 'ServiceController@store' },
        { path: '/admin/services/:id/edit',             comp: 'ServiceController@update' },
        { path: '/admin/service-categories',            comp: 'ServiceCategoryController' },
        { path: '/admin/bookings',                      comp: 'BookingController@adminIndex' },
        { path: '/admin/bookings/create',               comp: 'BookingController@adminStore' },
        { path: '/admin/bookings/:id',                  comp: 'BookingController@adminShow' },
        { path: '/admin/bookings/:id/worksheets/:wsId', comp: 'BookingWorksheetController' },
        { path: '/admin/settings/bookings',             comp: 'BookingSettingController' },
      ]} />

      <RouteGroup title="9. Admin — Auctions & Hampers" routes={[
        { path: '/admin/auctions',              comp: 'AuctionController@adminIndex' },
        { path: '/admin/auctions/create',       comp: 'AuctionController@store' },
        { path: '/admin/auctions/:id',          comp: 'AuctionController@adminShow' },
        { path: '/admin/hampers',               comp: 'HamperController@index' },
        { path: '/admin/hampers/create',        comp: 'HamperController@store' },
        { path: '/admin/hampers/orders/:id',    comp: 'HamperOrderController@show' },
        { path: '/admin/hampers/:id',           comp: 'HamperController@show' },
        { path: '/admin/hampers/:id/edit',      comp: 'HamperController@update' },
      ]} />

      <RouteGroup title="10. Admin — People & Promos" routes={[
        { path: '/admin/customers',                 comp: 'CustomerController@index' },
        { path: '/admin/customers/:id',             comp: 'CustomerController@show' },
        { path: '/admin/users',                     comp: 'UserController@index' },
        { path: '/admin/users/:id',                 comp: 'UserController@show' },
        { path: '/admin/employees',                 comp: 'EmployeeController@index' },
        { path: '/admin/employees/create',          comp: 'EmployeeController@store' },
        { path: '/admin/employees/:id',             comp: 'EmployeeController@show' },
        { path: '/admin/employees/:id/edit',        comp: 'EmployeeController@update' },
        { path: '/admin/loyalty',                   comp: 'LoyaltyController@index' },
        { path: '/admin/loyalty/settings',          comp: 'LoyaltyController@getSettings' },
        { path: '/admin/loyalty/:customerId',       comp: 'LoyaltyController@transactions' },
        { path: '/admin/referrals',                 comp: 'ReferralController@index' },
        { path: '/admin/referrals/:id',             comp: 'ReferralController@show' },
        { path: '/admin/promo-codes',               comp: 'PromoCodeController@index' },
        { path: '/admin/promo-codes/:id',           comp: 'PromoCodeController@show' },
      ]} />

      <RouteGroup title="11. Admin — Projects & Careers" routes={[
        { path: '/admin/projects',                      comp: 'ProjectController@statistics' },
        { path: '/admin/projects/list',                 comp: 'ProjectController@adminIndex' },
        { path: '/admin/projects/create',               comp: 'ProjectController@adminStore' },
        { path: '/admin/projects/:id',                  comp: 'ProjectController@adminShow' },
        { path: '/admin/careers',                       comp: 'Admin Careers Stats' },
        { path: '/admin/careers/jobs',                  comp: 'AdminJobController' },
        { path: '/admin/careers/jobs/:id',              comp: 'Admin Job Detail' },
        { path: '/admin/careers/applications',          comp: 'AdminApplicationController' },
        { path: '/admin/careers/applicants',            comp: 'AdminApplicantController' },
        { path: '/admin/careers/applicants/:id',        comp: 'Admin Applicant Detail' },
      ]} />

      <RouteGroup title="12. Admin — Settings & Content" routes={[
        { path: '/admin/settings/general',                  comp: 'General Settings' },
        { path: '/admin/settings/general/bulk/products',    comp: 'Product Bulk' },
        { path: '/admin/settings/general/bulk/customers',   comp: 'Customer Bulk' },
        { path: '/admin/settings/general/bulk/employees',   comp: 'Employee Bulk' },
        { path: '/admin/settings/currency',                 comp: 'CurrencyController' },
        { path: '/admin/settings/customer-tiers',           comp: 'CustomerTierController' },
        { path: '/admin/settings/shipping',                 comp: 'ShippingOptionController' },
        { path: '/admin/settings/notifications',            comp: 'Notification Settings' },
        { path: '/admin/settings/security',                 comp: 'Security Settings' },
        { path: '/admin/settings/email',                    comp: 'Email Settings' },
        { path: '/admin/settings/backup',                   comp: 'Backup Settings' },
        { path: '/admin/settings/appearance',               comp: 'Appearance Settings' },
        { path: '/admin/settings/integrations',             comp: 'Integration Settings' },
        { path: '/admin/settings/publications',             comp: 'PublicationController@index' },
        { path: '/admin/settings/publications/:id/edit',    comp: 'PublicationController@update' },
        { path: '/admin/settings/content/about',            comp: 'ContentPageController (about)' },
        { path: '/admin/settings/content/contact',          comp: 'ContentPageController (contact)' },
        { path: '/admin/settings/content/manual',           comp: 'ContentPageController (manual)' },
        { path: '/admin/settings/content/homepage',         comp: 'ContentPageController (homepage)' },
        { path: '/admin/settings/content/footer',           comp: 'ContentPageController (footer)' },
      ]} />

      {/* ── Roles & Navigation ── */}
      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c4b5fd', margin: '28px 0 12px' }}>Role-Based Navigation Access</p>

      <RoleGroup role="SUPER_ADMIN" description="Unrestricted access to all routes including destructive actions."
        pages={[
          { path: '/admin',                          label: 'Dashboard — Global KPIs' },
          { path: '/admin/orders',                   label: 'Orders — Full lifecycle + force delete', exclusive: true },
          { path: '/admin/finance/payments',         label: 'Finance Hub — M-Pesa audit & disputes' },
          { path: '/admin/products',                 label: 'Catalog — Full inventory control' },
          { path: '/admin/customers',                label: 'CRM — Customer database & tiers' },
          { path: '/admin/users',                    label: 'Users — Role & account management' },
          { path: '/admin/employees',                label: 'Employees — HR records' },
          { path: '/admin/loyalty',                  label: 'Loyalty — Points & credit ledger' },
          { path: '/admin/algorithm',                label: 'Algorithm — RFM config + Run Scoring Now', exclusive: true },
          { path: '/admin/settings/security',        label: 'Security Settings', exclusive: true },
          { path: '/admin/settings/backup',          label: 'Backup Settings', exclusive: true },
          { path: '/admin/settings',                 label: 'All Settings pages' },
        ]}
      />

      <RoleGroup role="ADMIN" description="Full CRUD on catalog, users, orders, and configuration."
        pages={[
          { path: '/admin',                          label: 'Dashboard' },
          { path: '/admin/orders',                   label: 'Orders — Confirm, Ship, Deliver, Cancel, Restore' },
          { path: '/admin/products',                 label: 'Products — Full CRUD' },
          { path: '/admin/products/create',          label: 'Create Product' },
          { path: '/admin/products/:id/edit',        label: 'Edit Product' },
          { path: '/admin/services',                 label: 'Services — Full CRUD' },
          { path: '/admin/categories',               label: 'Categories — Full CRUD' },
          { path: '/admin/brands',                   label: 'Brands — Full CRUD' },
          { path: '/admin/customers',                label: 'CRM — Customer tiers & analytics' },
          { path: '/admin/users',                    label: 'User & Employee management' },
          { path: '/admin/loyalty',                  label: 'Loyalty settings & configuration' },
          { path: '/admin/settings/customer-tiers',  label: 'Customer Tier configuration' },
          { path: '/admin/settings',                 label: 'Settings hub' },
        ]}
      />

      <RoleGroup role="FINANCE" description="Payment operations and financial audit only."
        pages={[
          { path: '/admin/finance/payments',         label: 'Finance Dashboard — M-Pesa logs' },
          { path: '/admin/finance/payments/:id',     label: 'Payment Detail — dispute resolution' },
          { path: '/admin/orders/:id/payments',      label: 'Order Payment History' },
          { path: '/admin/orders',                   label: 'Orders — view only for payment context' },
          { path: '/admin/products',                 label: 'Catalog — view only', gated: true },
          { path: '/admin/customers',                label: 'CRM — financial data view' },
        ]}
      />

      <RoleGroup role="LOGISTICS" description="Shipping pipeline and delivery tracking."
        pages={[
          { path: '/admin/orders',                   label: 'Orders — shipping queue view' },
          { path: '/admin/orders/:id/ship',          label: 'Ship Order — tracking & courier entry' },
          { path: '/admin/bookings',                 label: 'Bookings — logistics scheduling' },
          { path: '/admin/customers',                label: 'Customer financial data', gated: true },
          { path: '/admin/orders/:id',               label: 'Order totals / financial fields', gated: true },
        ]}
      />

      <RoleGroup role="SALES_REP" description="Quote and customer communication management."
        pages={[
          { path: '/admin/quote-requests',           label: 'Quote Requests — review incoming leads' },
          { path: '/admin/quote-requests/:id',       label: 'Quote Request Detail — clarification thread' },
          { path: '/admin/quotes',                   label: 'Quotes — manage formal proposals' },
          { path: '/admin/quotes/create',            label: 'Create Quote' },
          { path: '/admin/quotes/:id',               label: 'Quote Detail — conversion history' },
          { path: '/admin/quotes/:id/edit',          label: 'Edit Quote — pricing adjustments' },
          { path: '/admin/customers',                label: 'CRM — assigned customer view' },
          { path: '/admin/orders',                   label: 'Orders — post-quote conversion tracking' },
        ]}
      />

      <RoleGroup role="STAFF" description="Work dashboard, bookings, projects, and service worksheets."
        pages={[
          { path: '/admin/work',                          label: 'Work Overview — personal assignment dashboard' },
          { path: '/admin/bookings',                      label: 'Bookings — assigned appointments' },
          { path: '/admin/bookings/:id',                  label: 'Booking Detail — worksheets & status' },
          { path: '/admin/bookings/:id/worksheets/:wsId', label: 'Worksheet Form — on-site findings' },
          { path: '/admin/projects',                      label: 'Projects — assigned workspaces' },
          { path: '/admin/projects/:id',                  label: 'Project Detail — tasks & milestones' },
        ]}
      />

      <RoleGroup role="CUSTOMER" description="Self-service portal for orders, support, and loyalty."
        pages={[
          { path: '/profile',              label: 'Profile — personal details & loyalty status' },
          { path: '/orders',               label: 'My Orders — history & tracking' },
          { path: '/orders/:id',           label: 'Order Detail — invoice & reviews' },
          { path: '/bookings',             label: 'My Bookings — upcoming appointments' },
          { path: '/services/:id/book',    label: 'Book Service — scheduling calendar' },
          { path: '/my-quotes',            label: 'My Quotes — approved proposals' },
          { path: '/my-quote-requests',    label: 'My Quote Requests — pending leads' },
          { path: '/my-tickets',           label: 'My Tickets — support history' },
          { path: '/my-projects',          label: 'My Projects — collaborative workspaces' },
          { path: '/hampers',              label: 'Hampers — tier-gated bundles' },
          { path: '/checkout',             label: 'Checkout — standard order payment' },
          { path: '/auctions/:id',         label: 'Auction Detail — live bidding' },
        ]}
      />

      <div style={{ 
        padding: '14px 18px', borderRadius: 12, background: 'rgba(168,85,247,0.04)', 
        border: '1px solid rgba(168,85,247,0.15)', marginTop: 10 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertCircle size={15} style={{ color: '#a855f7' }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Notes</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li><strong>Profile Routing:</strong> The <code style={{color:'#e9d5ff'}}>/profile</code> path auto-switches between Admin and Customer views via <code style={{color:'#e9d5ff'}}>RoleBasedProfile</code>.</li>
          <li><strong>Admin Access:</strong> All <code style={{color:'#e9d5ff'}}>/admin/*</code> routes are role-gated to staff (Admin, Manager, Finance, Logistics, Sales Rep).</li>
          <li><strong>Ship View:</strong> <code style={{color:'#e9d5ff'}}>/admin/orders/:id/ship</code> uses <code style={{color:'#e9d5ff'}}>OrderDetail</code> with a specialised context mode.</li>
          <li><strong>Hamper Checkout:</strong> Store credit is capped at KES 500 and financials are locked post-conversion.</li>
          <li><strong>Careers Portal:</strong> Applicant auth is separate from the main customer auth system.</li>
        </ul>
      </div>
    </div>
  );
}

function NavigationLinksSection() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 36 }}>
      <p style={{
        fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#a855f7',
        padding: '0 2px 8px',
        margin: 0, userSelect: 'none',
      }}>
        Navigation Links
      </p>
      <div style={{
        background: 'var(--color-bg-elevated, var(--color-bg))',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', background: 'transparent', border: 'none',
            borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg,#4b5563,#6b7280)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}>
            <ArrowRight size={16} color="white" strokeWidth={2.2} />
          </div>
          <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: '#9ca3af' }}>
            System Route Map — App Architecture
          </span>
          {open ? <ChevronUp size={13} color="rgba(255,255,255,0.15)" /> : <ChevronDown size={13} color="rgba(255,255,255,0.15)" />}
        </button>

        {open && (
          <div style={{ padding: '16px 22px' }}>
            <RouteMapAppendix />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();

  const leftGroups  = GROUPS.filter((_, i) => i % 2 === 0);
  const rightGroups = GROUPS.filter((_, i) => i % 2 !== 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
              }}>
                <SettingsIcon size={16} color="white" strokeWidth={2} />
              </div>
              <h1 style={{
                margin: 0,
                fontSize: '1.6rem', fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#a855f7',
              }}>
                Settings
              </h1>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px 20px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {leftGroups.map(group => (
                  <GroupCard key={group.label} group={group} onNavigate={navigate} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {rightGroups.map(group => (
                  <GroupCard key={group.label} group={group} onNavigate={navigate} />
                ))}
              </div>
            </div>

            {/* ── Navigation Links ────────────────────────────────── */}
            <NavigationLinksSection />

            {/* ── Appendix ────────────────────────────────────────── */}
            <AppendixSection />

          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Collapsible appendix section ─────────────────────────────────────── */
const APPENDIX_SECTIONS = [
  {
    title: 'Financial Handling: Hamper Orders vs Standard Orders',
    content: `### Loyalty Points
 
**Standard Orders** — Loyalty points are calculated based on the **subtotal** (before tax and shipping). Points are awarded **on payment** via \`markAsPaid()\` → \`earnPointsForOrder()\`.
 
**Hamper Orders** — Loyalty points are calculated based on the **total** (after tax, shipping, and discounts). Points are awarded **at checkout** — they come precalculated and are applied immediately. This is intentional because hampers are competitive deals and the full total reflects the customer's actual spend.
 
### Store Credit
 
**Standard Orders** — Store credit is deducted **on order confirmation**. If the order is cancelled, store credit is refunded back to the customer.
 
**Hamper Orders** — Store credit is deducted **at checkout** (precalculated). The maximum store credit that can be applied to a hamper order is **KES 500**. If the order is cancelled, store credit is refunded.
 
### Promo Codes / Referral Codes
 
**Standard Orders** — Promo stats (times_used, total_revenue, etc.) are incremented **on order confirmation**. If cancelled, stats are reversed.
 
**Hamper Orders** — Promo stats are recorded **at checkout** via \`recordSuccess()\`. The discount is applied immediately and carried forward if the hamper order is converted to a standard order. The standard order only stores \`promo_discount\` (the \`discount\` field is set to 0 to avoid showing both with the same amount).
 
### Converting Hamper → Standard Order
 
When a hamper order is converted to a standard order:
- **Financials are copied as-is** (subtotal, tax, total, shipping) — no recalculation
- **Type is set to \`hamper\`** — the order is locked from item modifications
- **Status starts as \`confirmed\`** — never \`pending\`
- **Store credit, loyalty, promo stats are NOT re-applied** — they were already processed at hamper checkout
- **Customer stats** (total_orders, total_spent) are updated via \`recalculateStatistics()\`
- All actions on the converted order are logged to the original hamper order's notes`,
  },
  {
    title: 'Order Pricing Model',
    component: OrderPricingAppendix,
  },
  {
    title: 'Order Creation Flow — store() Pipeline',
    component: OrderCreationFlowAppendix,
  },
  {
    title: 'Inventory Reservation System',
    component: InventoryReservationAppendix,
  },
  {
    title: 'Transaction Ledgers — Payments, Loyalty & Store Credit',
    component: TransactionLedgersAppendix,
  },
  {
    title: 'Referral & Promo Code Flow',
    component: ReferralPromoAppendix,
  },
  {
    title: 'Table Relationships & Data Flow',
    component: TableRelationshipsAppendix,
  },
  {
    title: 'Customer Scoring Algorithm — How It Works',
    component: AlgorithmAppendix,
  },
];
 
function AppendixSection() {
  const [openIdx, setOpenIdx] = useState(null);
 
  return (
    <div style={{ marginTop: 36 }}>
      <p style={{
        fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#a855f7',
        padding: '0 2px 10px',
        margin: 0, userSelect: 'none',
      }}>
        Appendix
      </p>
      <div style={{
        background: 'var(--color-bg-elevated, var(--color-bg))',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}>
        {APPENDIX_SECTIONS.map((section, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={i}>
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px', background: 'transparent', border: 'none',
                  borderBottom: (isOpen || i < APPENDIX_SECTIONS.length - 1) ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'linear-gradient(135deg,#4b5563,#6b7280)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }}>
                  <BookOpen size={16} color="white" strokeWidth={2.2} />
                </div>
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: '#9ca3af' }}>
                  {section.title}
                </span>
                {isOpen ? <ChevronUp size={13} color="rgba(255,255,255,0.15)" /> : <ChevronDown size={13} color="rgba(255,255,255,0.15)" />}
              </button>
              {isOpen && (
                <div style={{
                  padding: '16px 22px',
                  borderBottom: i < APPENDIX_SECTIONS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  {section.component
                    ? <section.component />                                 
                    : (
                      <div style={{ fontSize: '0.82rem', lineHeight: 1.8, color: 'var(--text, #d1d5db)', whiteSpace: 'pre-wrap' }}>
                        {section.content}
                      </div>
                    )
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}