// ─────────────────────────────────────────────────────────────────────────────
// HamperOrderGuide — drop-in reference panel for AdminHamperOrderDetail
// Place this component inside the left column (after the notes section)
// or wherever you want the admin guide to appear.
//
// Usage:  <HamperOrderGuide order={order} />
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

// ── Shared tokens (match AdminHamperOrderDetail) ──────────────────────────────

const card = {
  background: 'white',
  border: '1px solid #dcb6ff',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  color: '#0b080e',
};

const thStyle = {
  padding: '10px 14px', textAlign: 'left',
  fontSize: '0.65rem', fontWeight: 700,
  color: '#a855f7',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border-tertiary)',
  fontSize: '0.8rem',
  color: 'var(--color-text-primary)',
  verticalAlign: 'top',
};

// ── Collapsible section ───────────────────────────────────────────────────────

function GuideSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--color-border-tertiary)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </span>
        {open ? <ChevronUp size={14} style={{ color: '#a855f7' }} /> : <ChevronDown size={14} style={{ color: '#a855f7' }} />}
      </button>
      {open && <div style={{ padding: '0 20px 16px' }}>{children}</div>}
    </div>
  );
}

// ── Dot indicator ─────────────────────────────────────────────────────────────

function Dot({ color }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, marginRight: 6, flexShrink: 0 }} />;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const STATUS_TRANSITIONS = [
  { status: 'pending',    label: 'Pending',    color: '#f59e0b', canConvert: false, canCancel: true,  financialNote: 'No financial side-effects on entry' },
  { status: 'confirmed',  label: 'Confirmed',  color: '#22c55e', canConvert: true,  canCancel: true,  financialNote: 'Eligible for conversion to standard order' },
  { status: 'processing', label: 'Processing', color: '#7c3aed', canConvert: true,  canCancel: true,  financialNote: 'Eligible for conversion to standard order' },
  { status: 'shipped',    label: 'Shipped',    color: '#3b82f6', canConvert: false, canCancel: true,  financialNote: 'In transit — conversion blocked' },
  { status: 'delivered',  label: 'Delivered',  color: '#22c55e', canConvert: false, canCancel: true,  financialNote: 'Fulfillment complete — conversion blocked' },
  { status: 'cancelled',  label: 'Cancelled',  color: '#ef4444', canConvert: false, canCancel: false, financialNote: 'Financials reversed (credit, points, promo, stock)' },
  { status: 'refunded',   label: 'Refunded',   color: '#6b7280', canConvert: false, canCancel: false, financialNote: 'Financials reversed (credit, points, promo, stock)' },
];

const CONVERSION_BLOCKERS = [
  { condition: 'Status is not confirmed or processing',          reason: 'Only confirmed and processing orders can be converted' },
  { condition: 'Already converted (order_id is set)',             reason: 'A standard order already exists for this hamper order' },
  { condition: 'Order is cancelled or refunded',                  reason: 'Must reactivate first (e.g. cancelled → confirmed), then convert' },
  { condition: 'Order is pending',                                reason: 'Must confirm the order before conversion is available' },
  { condition: 'Order is shipped or delivered',                   reason: 'Already in fulfillment — too late to convert' },
];

const FINANCIAL_SIDE_EFFECTS = [
  {
    action: 'Cancel / Refund',
    arrow: '→ cancelled or refunded',
    effects: [
      { area: 'Store Credit',   detail: 'Refunded back to customer balance (order_refund transaction)' },
      { area: 'Loyalty Points',  detail: 'Deducted from customer balance (order_cancel transaction, negative points)' },
      { area: 'Promo / Referral', detail: 'times_used, successful_uses, total_orders decremented; total_discount_given reduced' },
      { area: 'Hamper Stock',    detail: 'stock_remaining incremented; is_sold_out cleared if applicable' },
      { area: 'Guard',          detail: 'financials_reversed_at is set — prevents double reversal' },
    ],
  },
  {
    action: 'Reactivate',
    arrow: 'cancelled/refunded → active status',
    effects: [
      { area: 'Store Credit',   detail: 'Re-deducted from customer balance (order_spend transaction)' },
      { area: 'Loyalty Points',  detail: 'Re-awarded to customer balance (order_restore transaction, positive points)' },
      { area: 'Promo / Referral', detail: 'times_used, successful_uses, total_orders re-incremented; total_discount_given restored' },
      { area: 'Hamper Stock',    detail: 'stock_remaining decremented; is_sold_out set if zero' },
      { area: 'Guard',          detail: 'financials_reversed_at is cleared — allows future cancel to reverse again' },
    ],
  },
  {
    action: 'Double Cancel',
    arrow: 'cancelled → cancelled',
    effects: [
      { area: 'Blocked', detail: 'Returns 422 — "This order is already cancelled"' },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function HamperOrderGuide({ order }) {
  const currentStatus = order?.status;

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(124,58,237,0.04))',
        borderBottom: '1px solid var(--color-border-tertiary)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Info size={16} style={{ color: '#a855f7' }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Order Lifecycle Guide
        </span>
      </div>

      {/* Section 1: Status Transitions */}
      <GuideSection title="Status Transition Rules" defaultOpen>
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border-tertiary)' }}>
          <thead>
            <tr>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Can Convert</th>
              <th style={thStyle}>Can Cancel</th>
              <th style={thStyle}>Note</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_TRANSITIONS.map((row) => {
              const isActive = row.status === currentStatus;
              return (
                <tr key={row.status} style={isActive ? { background: 'rgba(168,85,247,0.06)' } : {}}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Dot color={row.color} />
                      <span style={{ fontWeight: isActive ? 800 : 600 }}>{row.label}</span>
                      {isActive && (
                        <span style={{
                          marginLeft: 6, fontSize: '0.55rem', fontWeight: 800, padding: '1px 6px',
                          borderRadius: 4, background: '#a855f7', color: 'white', textTransform: 'uppercase',
                        }}>Current</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: row.canConvert ? '#22c55e' : '#ef4444' }}>
                      {row.canConvert ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: row.canCancel ? '#22c55e' : '#ef4444' }}>
                      {row.canCancel ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>{row.financialNote}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GuideSection>

      {/* Section 2: Conversion Blockers */}
      <GuideSection title="Why Conversion May Fail">
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border-tertiary)' }}>
          <thead>
            <tr>
              <th style={thStyle}>Condition</th>
              <th style={thStyle}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {CONVERSION_BLOCKERS.map((row, idx) => (
              <tr key={idx}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{row.condition}</td>
                <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GuideSection>

      {/* Section 3: Financial Side-Effects */}
      <GuideSection title="Financial Side-Effects (Loyalty, Credit, Promos)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FINANCIAL_SIDE_EFFECTS.map((group, idx) => (
            <div key={idx}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                padding: '6px 12px', borderRadius: 6,
                background: idx === 0 ? 'rgba(239,68,68,0.06)' : idx === 1 ? 'rgba(34,197,94,0.06)' : 'rgba(107,114,128,0.06)',
              }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: idx === 0 ? '#ef4444' : idx === 1 ? '#22c55e' : '#6b7280' }}>
                  {group.action}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)' }}>({group.arrow})</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border-tertiary)' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 130 }}>Area</th>
                    <th style={thStyle}>What Happens</th>
                  </tr>
                </thead>
                <tbody>
                  {group.effects.map((e, eidx) => (
                    <tr key={eidx}>
                      <td style={{ ...tdStyle, fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{e.area}</td>
                      <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </GuideSection>
    </div>
  );
}
