import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins, CreditCard, Search, ChevronLeft, ChevronRight,
  TrendingUp, Users, Filter, ChevronDown, Loader2, Settings,
} from 'lucide-react';
import SettingsLayout from '../../components/layout/SettingsLayout';
import loyaltyAPI from '../../api/loyalty';
import customerTiersAPI from '../../api/customerTiers';
import { useAuthStore } from '../../store';

// ── Style tokens ──────────────────────────────────────────────────────────────

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const inputStyle = {
  padding: '7px 11px 7px 34px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 150ms, box-shadow 150ms',
};

const pill = (active) => ({
  padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
  background: active ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.06)',
  color: active ? 'white' : '#7c3aed',
  transition: 'all 150ms',
});

const TIER_STYLES_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.25)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.2)'  },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.25)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.25)'  },
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) {
    return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  }
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}

const fmtKes  = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtPts  = (n) => Number(n ?? 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = '#a855f7' }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `rgba(168,85,247,0.08)`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>{label}</p>
        <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function TierBadge({ tier, tierOptions = [] }) {
  const s = tierStyle(tier, tierOptions);
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: '0.65rem', fontWeight: 700, textTransform: 'capitalize',
      background: s.bg, color: s.color,
    }}>
      {tier}
    </span>
  );
}

// ─── LOYALTY SYSTEM DEV NOTES ────────────────────────────────────────────────
/*
 * LOYALTY SYSTEM — DESIGNED BEHAVIOUR (read before editing dev notes)
 *
 * Standard orders:
 *   • Store credit deducted at order creation (checkout), order stores deduction_kes
 *   • Loyalty points earned ONLY on full payment — Order::markAsPaid() →
 *     LoyaltyService::earnPointsForOrder(). markAsPaid() is called by
 *     Payment::syncOrderPaymentStatus() when confirmed payments reach the full total.
 *   • Cancel (unpaid): store credit refunded, no points to reverse.
 *   • Cancel (paid): store credit refunded, earned points reversed via
 *     reversePointsForCancelledOrder(). loyalty_points_earned is zeroed out.
 *   • Restore: store credit re-deducted (rechargeOrderStoreCredit), points NOT
 *     re-awarded. Order is back to unpaid — points re-earn naturally on next payment.
 *
 * Hamper orders (discount campaign — customer pays upfront):
 *   • Points awarded directly at hamper checkout (not gated on a separate payment event).
 *   • Cancel: reverseFinancials() refunds credit + reverses points. Idempotent via
 *     financials_reversed_at flag.
 *   • Restore: restoreFinancials() re-deducts credit + re-awards points. Same flag.
 *   • Convert to standard order: points already awarded on hamper — markAsPaid() on the
 *     converted order explicitly skips earnPointsForOrder() for hamper-origin orders.
 */

const LOYALTY_DEV_NOTES = {
  pitfalls: [
    {
      title: "HamperOrderController bypasses LoyaltyService — raw DB writes with no lockForUpdate",
      severity: "critical",
      detail: "reverseFinancials() and restoreFinancials() in HamperOrderController write LoyaltyPointTransaction and StoreCreditTransaction records directly via Model::create(), reading and writing customer.loyalty_points and customer.store_credit with a plain read-then-update pattern. There is no DB::lockForUpdate() on the customer row. By contrast, LoyaltyService::writePointTransaction() and writeCreditTransaction() both re-fetch the customer with lockForUpdate() inside their own transaction before touching the balance.",
      outcome: "If a hamper cancellation and an admin point grant (or another hamper cancel) hit the same customer simultaneously, both read the same balance, both compute a new_balance from it, and the second write silently overwrites the first. Fix: route reverseFinancials() and restoreFinancials() through LoyaltyService methods instead of raw creates. All balance mutation should flow through the service.",
    },
    {
      title: "Store credit deduction at checkout is committed outside the order's DB transaction",
      severity: "critical",
      detail: "In OrderController::store(), DB::commit() is called after the order and its items are created, and then spendCredit() is called in a separate try/catch that only logs a Warning on failure. If spendCredit() throws post-commit, the order record exists with store_credit_deduction_kes > 0 but the customer balance was never debited. The admin store() path has the same structure at line ~2176.",
      outcome: "Customer gets a store credit discount applied to a confirmed order without the balance actually moving. On a subsequent cancel, refundOrderStoreCredit() will add the deduction amount back — double-crediting the customer. Fix: move spendCredit() inside the DB::transaction() block before commit(). writeCreditTransaction() uses its own inner lockForUpdate transaction so nesting is safe.",
    },
    {
      title: "grantReferralCredit and grantReferralCreditExact have no idempotency guard",
      severity: "critical",
      detail: "grantReferralPointBonus() correctly checks for an existing referral_bonus transaction keyed on reference_type + reference_id before writing. Neither grantReferralCredit() nor grantReferralCreditExact() perform this check. Both methods write unconditionally. The two methods are also partially redundant — grantReferralCreditExact() takes an explicit amount while grantReferralCredit() reads from settings, but both write a 'referral_reward' StoreCreditTransaction with the same reference fields.",
      outcome: "If the triggering payment event is re-delivered (M-Pesa callback retry, queue failure, or admin double-click on mark-as-paid), the referrer receives duplicate store credit with no visibility in the ledger that one entry is a duplicate. Fix: add the same exists() check as grantReferralPointBonus(), keyed on reference_type = Order::class, reference_id = order->id, type = 'referral_reward'.",
    },
    {
      title: "reverseReferralCreditExact uses type 'referral_reward' for reversals — indistinguishable from grants",
      severity: "warning",
      detail: "reverseReferralCreditExact() writes a negative StoreCreditTransaction with type = 'referral_reward', which is the same type string used by the original grant. The code comment acknowledges this: 'or a new referral_reversal type if you want it distinct'. An admin reading the ledger sees two referral_reward entries for the same order — one +500 and one -500 — with no label distinguishing a grant from a clawback.",
      outcome: "Ambiguous ledger rows make audit and reconciliation harder than it needs to be, especially when investigating a customer dispute. Add 'referral_reversal' to the StoreCreditTransaction type enum and use it in reverseReferralCreditExact(). The LoyaltyPointTransaction model already has distinct 'order_cancel' and 'order_restore' types for exactly this reason.",
    },
    {
      title: "reversePointsForCancelledOrder can take points the customer earned elsewhere",
      severity: "warning",
      detail: "The method computes toDeduct = min(loyalty_points_earned_on_order, customer.loyalty_points). If the customer has since redeemed those specific points for store credit, their balance is now 0 and toDeduct = 0 — correct. But if they earned additional points from other orders after the redemption, toDeduct will take from those unrelated points. The reversal is not scoped to the original earn transaction; it just looks at the current balance as a cap.",
      outcome: "Cancel of order A reverses up to A's earned points from whatever balance happens to exist — even if that balance came entirely from orders B and C. This is a known tradeoff of running a flat balance rather than per-earn buckets. Document this as intentional or add a metadata flag on the earn transaction that tracks whether those specific points were redeemed, and skip reversal if they were.",
    },
    {
      title: "Stat cards (points and credit totals) are page-scoped, not platform-wide",
      severity: "warning",
      detail: "The 'Points on this page' and 'Credit on this page' StatCards are computed client-side as reduce() over the current 20-row page payload. The subtitles say 'sum of visible rows', which is accurate, but visually they sit alongside the 'Total customers' card which is a true server-side total. The page-scope behaviour resets every time the admin paginates or filters.",
      outcome: "An admin doing a quick check on total loyalty liability is looking at a fraction of the data. Fix: add GET /admin/loyalty/stats returning platform-wide aggregates (SUM(loyalty_points), SUM(store_credit), counts by tier) and use those for the header cards.",
    },
    {
      title: "points_expiry_months setting is respected at earn-time but the expiry command may not be scheduled",
      severity: "low",
      detail: "When points_expiry_months is configured, earnPointsForOrder() correctly sets point_type = 'expiring' and expires_at on the transaction. The expirePoints() method in LoyaltyService reads LoyaltyPointTransaction::due() (point_type=expiring, expired_at null, expires_at <= now) and writes offsetting negative transactions. However, this method must be called by an artisan command, and there is no visible evidence of that command being registered in Kernel.php.",
      outcome: "If the expiry command is not scheduled, points never expire in production regardless of the setting. Admins may configure an expiry window expecting automatic enforcement that silently does not exist. Verify the command exists and add it to Kernel.php: $schedule->command('loyalty:expire-points')->dailyAt('00:30');",
    },
    {
      title: "updatePaymentStatus() reverses points on payment void without checking order cancel status",
      severity: "low",
      detail: "When admin voids payments by setting payment_status to 'unpaid' or 'failed' via updatePaymentStatus(), the code calls reversePointsForCancelledOrder() if loyalty_points_earned > 0. However the order status is not checked — the order remains in its current workflow status (e.g. 'shipped' or 'processing'). The customer loses their earned points on an order that is still active and being fulfilled.",
      outcome: "An admin accidentally sets payment_status = 'unpaid' on a shipped order and the customer's points are silently reversed. Since loyalty_points_earned is zeroed out by the reversal, those points are unrecoverable without a manual admin grant. Fix: guard the reversal with a check that the order status is 'cancelled' or 'failed', or remove the reversal from updatePaymentStatus() entirely and rely on the cancel flow.",
    },
  ],
  strengths: [
    {
      title: "Earn trigger chain is clean — markAsPaid() is the single point of entry",
      detail: "Points are earned exactly once and only on full payment. The chain is: Daraja callback or manual admin payment → Payment::syncOrderPaymentStatus() → Order::markAsPaid() → LoyaltyService::earnPointsForOrder(). Every path that confirms full payment converges on the same model method, so there is no risk of one controller earning points while another doesn't.",
    },
    {
      title: "earnPointsForOrder has double-checked locking — truly idempotent",
      detail: "The method checks order->loyalty_points_earned > 0 as a fast-path bail-out before opening a transaction. Inside the transaction it re-fetches the order with lockForUpdate() and checks again. This two-phase pattern handles the edge case where two concurrent payment confirmations both pass the outer check before either commits — only one will win the lock and write, the other sees loyalty_points_earned > 0 and exits cleanly.",
    },
    {
      title: "Hamper conversion to standard order correctly skips re-earning points",
      detail: "Order::markAsPaid() checks HamperOrder::where('order_id', $this->id)->exists() before calling earnPointsForOrder(). Since hamper orders award points directly at checkout, this guard prevents double-earning when the converted standard order is later marked as paid. The skip is also noted in the order's admin_notes at conversion time.",
    },
    {
      title: "Store credit restore on cancel is proportional — never exceeds what was deducted",
      detail: "refundOrderStoreCredit() reads store_credit_deduction_kes directly from the order row — the exact amount that was deducted at checkout — and grants exactly that back. It does not recompute from current prices or customer state. Combined with writeCreditTransaction()'s lockForUpdate pattern, the refund is both accurate and concurrency-safe.",
    },
    {
      title: "Hamper financials_reversed_at flag is a robust idempotency gate for a complex reversal sequence",
      detail: "reverseFinancials() touches five things: store credit, loyalty points, promo code stats, promo usage status, and hamper stock. Rather than tracking each reversal individually, a single financials_reversed_at timestamp gates the entire method. reverseFinancials() exits immediately if the flag is set; restoreFinancials() exits immediately if it is not. This makes double-cancel and double-restore safe without per-field tracking.",
    },
    {
      title: "restorePointsForRestoredOrder is a deliberate no-op — correct by design",
      detail: "When a cancelled standard order is restored, points are not re-awarded. The order returns to its pre-cancel status as unpaid, and the customer will earn points again naturally when payment is confirmed. The method exists explicitly as a no-op with a comment explaining the intent, which prevents future developers from accidentally wiring it to re-award points.",
    },
    {
      title: "Role-gated policy with clean escalation — sales_rep can grant but not deduct",
      detail: "LoyaltyPolicy separates read (any admin), grant (includes sales_rep), deduct (finance/manager/admin), and configure (super_admin/admin only). The before() hook grants super_admin a blanket pass without polluting each method. The customer self-serve redeem path uses an ownership check in the same policy file, keeping all loyalty authorisation in one place.",
    },
  ],
  future: [
    {
      title: "Platform-wide loyalty stats endpoint",
      detail: "The header StatCards currently show page-scoped sums. Add GET /admin/loyalty/stats returning SUM(loyalty_points), SUM(store_credit), points_earned_this_month, points_redeemed_this_month, and a tier breakdown. This also unblocks the Reports tab loyalty panel and gives finance a reconciliation figure without exporting the full ledger.",
      horizon: "near",
    },
    {
      title: "Verify and schedule the loyalty:expire-points artisan command",
      detail: "Confirm the command class exists and add it to Kernel.php if missing: $schedule->command('loyalty:expire-points')->dailyAt('00:30'). Without this, the points_expiry_months setting is a no-op in production. A Slack/email notification on command failure is strongly recommended since a silent expiry failure means uncontrolled liability growth.",
      horizon: "near",
    },
    {
      title: "Customer-facing loyalty timeline on profile / MyOrders",
      detail: "GET /customer/loyalty/transactions is implemented and functional. Surfacing this as a transaction timeline on the customer profile page — showing earn, spend, redemption, and expiry events with order links — closes the customer-facing loop. The points balance is already shown; the history is the missing piece.",
      horizon: "near",
    },
    {
      title: "Route HamperOrderController financial mutations through LoyaltyService",
      detail: "Replace the raw Model::create() calls in reverseFinancials() and restoreFinancials() with calls to LoyaltyService::writePointTransaction() and writeCreditTransaction(). This eliminates the race condition risk and ensures all balance mutations go through the same lockForUpdate pattern regardless of order type. A secondary benefit: the hamper transactions will appear consistently in the ledger without special-casing.",
      horizon: "medium",
    },
    {
      title: "Points earned per order visible in OrderDetail",
      detail: "loyalty_points_earned is stored on every order row but is not surfaced in the admin OrderDetail panel. Showing the earned amount alongside a link to the matching LoyaltyPointTransaction would let admins answer 'did this customer get their points?' without navigating away. Particularly useful during a customer support query.",
      horizon: "medium",
    },
    {
      title: "Earn transaction metadata: raw points, multiplier, tier at time of earn",
      detail: "earnPointsForOrder() applies the customer's tier multiplier silently. The resulting transaction note only shows the final point total. Adding a metadata JSON field with {raw_points, multiplier, tier} at earn time would make tier benefit disputes auditable — admins could confirm whether a Gold multiplier was applied on a specific order without reverse-engineering the figure.",
      horizon: "medium",
    },
    {
      title: "Redemption funnel analytics in Reports tab",
      detail: "Once earn volume builds, a funnel from points_earned → points_redeemed → store_credit_used_at_checkout would show whether the loyalty programme drives repeat purchases or accumulates as a growing liability. All the raw data (LoyaltyPointTransaction, StoreCreditTransaction, order store_credit_deduction_kes) is already in the DB — this is a reporting query, not a schema change.",
      horizon: "long",
    },
  ],
};

const SEV_COLOR = { critical: "#ff4d4d", warning: "#f59e0b", low: "#a855f7" };
const HOR_COLOR = { near: "#06b6d4", medium: "#f59e0b", long: "#a855f7" };

function LoyaltyDevNotesModal({ onClose }) {
  const [tab, setTab] = useState("pitfalls");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-primary, #fff)", borderRadius: 12, width: "100%", maxWidth: 800,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border,#e5e7eb)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#a855f7" }}>
              // dev notes — loyalty system
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af" }}>✕</button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>
            internal analysis · not visible to customers
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {["pitfalls", "strengths", "future"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "9px 18px", background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #a855f7" : "2px solid transparent",
                color: tab === t ? "#a855f7" : "var(--text-secondary,#6b7280)",
                fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                opacity: tab === t ? 1 : 0.6, marginBottom: -1,
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "pitfalls" && LOYALTY_DEV_NOTES.pitfalls.map((n, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8,
              border: `1px solid ${SEV_COLOR[n.severity]}33`,
              background: `${SEV_COLOR[n.severity]}08`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  color: SEV_COLOR[n.severity],
                  background: `${SEV_COLOR[n.severity]}18`,
                  padding: "2px 7px", borderRadius: 3,
                }}>{n.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary,#111)" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)", lineHeight: 1.65, marginBottom: 6 }}>{n.detail}</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>
                <span style={{ color: "#6b7280" }}>→ outcome: </span>{n.outcome}
              </div>
            </div>
          ))}

          {tab === "strengths" && LOYALTY_DEV_NOTES.strengths.map((n, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8,
              border: "1px solid #a855f722", background: "#a855f706",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a855f7", marginBottom: 6 }}>✓ {n.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}

          {tab === "future" && LOYALTY_DEV_NOTES.future.map((n, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8,
              border: "1px solid var(--border,#e5e7eb)",
              background: "var(--bg-secondary,#f9fafb)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  color: HOR_COLOR[n.horizon],
                  background: `${HOR_COLOR[n.horizon]}18`,
                  padding: "2px 7px", borderRadius: 3,
                }}>{n.horizon}-term</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary,#111)" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LoyaltyLedger() {
  const navigate   = useNavigate();
  const { user }   = useAuthStore();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [tier,     setTier]     = useState('');
  const [hasPoints,setHasPoints]= useState(false);
  const [hasCredit,setHasCredit]= useState(false);
  const [sort,     setSort]     = useState('loyalty_points');

  const [tierOptions, setTierOptions] = useState([]);
  useEffect(() => { customerTiersAPI.getActiveTiers().then(setTierOptions).catch(() => {}); }, []);

  const [devNotesOpen, setDevNotesOpen] = useState(false);

  const searchRef  = useRef(null);
  const debounceRef= useRef(null);

  const canConfig = ['super_admin','admin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loyaltyAPI.index({
        page, search: search || undefined,
        tier: tier || undefined,
        has_points: hasPoints || undefined,
        has_credit: hasCredit || undefined,
        sort, dir: 'desc', per_page: 20,
      });
      setData(res);
    } catch { /* handled by interceptor */ }
    finally { setLoading(false); }
  }, [page, search, tier, hasPoints, hasCredit, sort]);

  useEffect(() => { load(); }, [load]);

  const onSearch = (v) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(1); }, 350);
  };

  const customers  = data?.data ?? [];
  const meta = {
    current_page: data?.current_page ?? 1,
    last_page:    data?.last_page    ?? 1,
    total:        data?.total        ?? 0,
    };
  const totalPts   = customers.reduce((s, c) => s + Number(c.loyalty_points ?? 0), 0);
  const totalCred  = customers.reduce((s, c) => s + Number(c.store_credit ?? 0), 0);

  return (
    <SettingsLayout>
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#a855f7', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Loyalty Ledger
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
            Store credit & loyalty points across all customers
          </p>
        </div>
        {canConfig && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setDevNotesOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                background: 'transparent', border: '1.5px solid rgba(168,85,247,0.18)',
                color: '#9ca3af', cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {'// dev'}
            </button>
            <button
              onClick={() => navigate('/admin/loyalty/settings')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                background: 'rgba(168,85,247,0.06)', border: '1.5px solid rgba(168,85,247,0.18)',
                color: '#7c3aed', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Settings size={14} /> Settings
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard icon={<Users size={18} style={{ color: '#a855f7' }} />}   label="Total customers" value={meta.total?.toLocaleString() ?? '—'} />
        <StatCard icon={<Coins size={18} style={{ color: '#a855f7' }} />}   label="Points on this page" value={fmtPts(totalPts)} sub="sum of visible rows" />
        <StatCard icon={<CreditCard size={18} style={{ color: '#a855f7' }} />} label="Credit on this page" value={fmtKes(totalCred)} sub="sum of visible rows" />
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#c4b5fd', pointerEvents: 'none' }} />
          <input
            ref={searchRef} placeholder="Search name, email, number…"
            style={inputStyle}
            onChange={e => onSearch(e.target.value)}
            onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(168,85,247,0.18)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Tier filter */}
        <select
          value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}
          style={{ ...inputStyle, paddingLeft: 10, flex: '0 0 120px', cursor: 'pointer' }}
        >
          <option value="">All tiers</option>
          {(tierOptions.length > 0 ? tierOptions : [
            { slug: 'bronze', name: 'Bronze' },{ slug: 'silver', name: 'Silver' },
            { slug: 'gold', name: 'Gold' },{ slug: 'platinum', name: 'Platinum' },
          ]).map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
          style={{ ...inputStyle, paddingLeft: 10, flex: '0 0 160px', cursor: 'pointer' }}
        >
          <option value="loyalty_points">Sort: Points ↓</option>
          <option value="store_credit">Sort: Credit ↓</option>
          <option value="total_orders">Sort: Orders ↓</option>
          <option value="last_order_date">Sort: Last order ↓</option>
        </select>

        {/* Toggle pills */}
        <button style={pill(hasPoints)} onClick={() => { setHasPoints(p => !p); setPage(1); }}>
          Has points
        </button>
        <button style={pill(hasCredit)} onClick={() => { setHasCredit(p => !p); setPage(1); }}>
          Has credit
        </button>
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.08)', background: 'rgba(168,85,247,0.02)' }}>
              {['Customer','Tier','Loyalty Points','Store Credit','Orders','Last Order'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', fontSize: '0.65rem', fontWeight: 700,
                  color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em',
                  textAlign: h === 'Customer' || h === 'Tier' ? 'left' : 'right',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 0', textAlign: 'center' }}>
                  <Loader2 size={22} style={{ color: '#c4b5fd', animation: 'spin 700ms linear infinite', display: 'inline-block' }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No customers found</p>
                </td>
              </tr>
            ) : customers.map((c, i) => {
              const isLast = i === customers.length - 1;
              const initials = `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase();
              return (
                <tr key={c.id}
                  onClick={() => navigate(`/admin/loyalty/${c.id}`)}
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                    cursor: 'pointer', transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Customer */}
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.profile_image_url ? (
                        <img src={c.profile_image_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.68rem', fontWeight: 700, color: 'white',
                        }}>
                          {initials || '?'}
                        </div>
                      )}
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>
                          {c.first_name} {c.last_name}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
                          {c.customer_number}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Tier */}
                  <td style={{ padding: '11px 16px' }}>
                    <TierBadge tier={c.tier} tierOptions={tierOptions} />
                  </td>

                  {/* Points */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <Coins size={13} style={{ color: Number(c.loyalty_points) > 0 ? '#a855f7' : '#d1d5db' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: Number(c.loyalty_points) > 0 ? '#111827' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPts(c.loyalty_points)}
                      </span>
                    </div>
                  </td>

                  {/* Credit */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: Number(c.store_credit) > 0 ? '#059669' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtKes(c.store_credit)}
                    </span>
                  </td>

                  {/* Orders */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.82rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {c.total_orders ?? 0}
                    </span>
                  </td>

                  {/* Last order */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {fmtDate(c.last_order_date)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && customers.length > 0 && meta.last_page > 1 && (
        <div style={{
            padding: '12px 16px', borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(168,85,247,0.02)', gap: 4,
        }}>
            {/* Prev */}
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.current_page <= 1} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
            color: '#a855f7', cursor: meta.current_page <= 1 ? 'not-allowed' : 'pointer',
            opacity: meta.current_page <= 1 ? 0.3 : 1,
            }}>
            <ChevronLeft size={13} />
            </button>

            {/* Page numbers */}
            {Array.from({ length: meta.last_page }, (_, i) => i + 1)
            .filter(p => p === 1 || p === meta.last_page || Math.abs(p - meta.current_page) <= 1)
            .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                acc.push(p);
                return acc;
            }, [])
            .map((p, i) => p === '...' ? (
                <span key={`ellipsis-${i}`} style={{ width: 30, textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af' }}>…</span>
            ) : (
                <button key={p} onClick={() => setPage(p)} style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', border: 'none',
                background: meta.current_page === p ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.06)',
                color: meta.current_page === p ? 'white' : '#7c3aed',
                }}>
                {p}
                </button>
            ))
            }

            {/* Next */}
            <button onClick={() => setPage(p => Math.min(meta.last_page, p + 1))} disabled={meta.current_page >= meta.last_page} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
            color: '#a855f7', cursor: meta.current_page >= meta.last_page ? 'not-allowed' : 'pointer',
            opacity: meta.current_page >= meta.last_page ? 0.3 : 1,
            }}>
            <ChevronRight size={13} />
            </button>
        </div>
        )}
      </div>

    </div>
    {devNotesOpen && <LoyaltyDevNotesModal onClose={() => setDevNotesOpen(false)} />}
    </SettingsLayout>
  );
}