import { useState } from 'react';
import {
  Globe, DollarSign, FileText, Phone, BookOpen, Home, Crown,
  Briefcase, Gift, Tag, Users, ChevronRight, GraduationCap, Award,
  UserCheck, Settings as SettingsIcon, FootprintsIcon, Truck,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../../components/layout/Sidebar';

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
 
**Hamper Orders** — Loyalty points are calculated based on the **total** (after tax, shipping, and discounts). Points are awarded **at checkout** — they come precalculated and are applied immediately. This is intentional because hampers are competitive deals and the full total reflects the customer\'s actual spend.
 
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
- All actions on the converted order are logged to the original hamper order\'s notes`,
  },
  {
    title: 'Inventory Handling',
    content: `Inventory is updated directly when an order is created. If enough stock is available, the ordered quantity is deducted from the product inventory immediately. If the ordered quantity is greater than the available stock, the system allocates the available quantity and records the remaining quantity as backorder. For example, if stock is 40 and the order quantity is 140, the system fulfills 40 units and places 100 units on backorder.
 
Where decimal quantities are used, backorder values are rounded upward before being recorded when the backorder field is stored as a whole number. This means a shortage of 3.1, 3.2, or 3.8 units is recorded as 4 units on backorder. This ensures that fractional shortages are treated as full units for backorder planning and stock follow-up.
 
If the order is cancelled before shipment, the allocated stock is returned to inventory, while the backordered quantity remains unfulfilled because it was never deducted from stock. If the order had already been shipped, inventory is adjusted through the return process, where only the quantity entered as returned is restored back into stock.
 
If an order has already had some items returned previously, only the remaining items still with the customer can be returned in a future cancellation. For example, if 9 out of 11 items were already returned earlier, only the remaining 2 items can be returned when the order is cancelled again.
 
If a cancelled order is restored, the system reapplies the inventory logic based on available stock. Previously returned stock is deducted again, and any quantity that cannot be fulfilled remains on backorder.
 
If an order is permanently deleted, the system removes its inventory effect completely and restores the full ordered quantity to stock, including quantities that were previously recorded as backorder. For this reason, deleting an order should only be done when it is truly necessary.`,
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
                  fontSize: '0.82rem', lineHeight: 1.8,
                  color: 'var(--text, #d1d5db)',
                  whiteSpace: 'pre-wrap',
                  borderBottom: i < APPENDIX_SECTIONS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}