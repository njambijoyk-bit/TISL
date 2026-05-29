import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gift, Plus, Search, Filter, MoreHorizontal, Play, Pause,
  Archive, Trash2, Eye, ChevronLeft, ChevronRight,
  TrendingUp, Users, DollarSign, Zap, Copy, Check,
  Info, ExternalLink, RefreshCw, UserPlus, Pencil, XCircle, Power, PowerOff,
  ChevronDown, ChevronUp, Tag,
} from 'lucide-react';
import api from '../../../api/axios'; // or wherever your API lives
import useReferralsStore from '../../../store/referralsStore';
import SettingsLayout from '../../../components/layout/SettingsLayout';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  general:           { label: 'General',      color: '#4338ca', bg: 'rgba(99,102,241,0.1)',  ring: 'rgba(99,102,241,0.25)'  },
  customer_referral: { label: 'Referral',     color: '#065f46', bg: 'rgba(16,185,129,0.1)',  ring: 'rgba(16,185,129,0.25)'  },
  first_time:        { label: 'First Time',   color: '#0e7490', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.25)'   },
  bulk_order:        { label: 'Bulk Order',   color: '#7c3aed', bg: 'rgba(168,85,247,0.1)',  ring: 'rgba(168,85,247,0.25)'  },
  vip:               { label: 'VIP',          color: '#b45309', bg: 'rgba(234,179,8,0.1)',   ring: 'rgba(234,179,8,0.25)'   },
  birthday:          { label: 'Birthday',     color: '#be185d', bg: 'rgba(236,72,153,0.1)',  ring: 'rgba(236,72,153,0.25)'  },
  event:             { label: 'Event',        color: '#b91c1c', bg: 'rgba(239,68,68,0.1)',   ring: 'rgba(239,68,68,0.25)'   },
};

const STATUS_STYLES = {
  draft:    { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)'  },
  active:   { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)'  },
  paused:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
  expired:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
  depleted: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', dot: '#a855f7', ring: 'rgba(168,85,247,0.25)'  },
  archived: { bg: 'rgba(107,114,128,0.08)',color: '#9ca3af', dot: '#d1d5db', ring: 'rgba(107,114,128,0.15)' },
};

const REWARD_META = {
  percentage:    { label: 'Percentage'    },
  fixed_amount:  { label: 'Fixed Amount'  },
  free_shipping: { label: 'Free Shipping' },
  store_credit:  { label: 'Store Credit'  },
};

const REFERRAL_ACTION_META = {
  CREATED:        { icon: <UserPlus size={12} />,  bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  UPDATED:        { icon: <Pencil size={12} />,    bg: 'rgba(99,102,241,0.12)',  color: '#4f46e5' },
  ACTIVATED:      { icon: <Power size={12} />,     bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  PAUSED:         { icon: <PowerOff size={12} />,  bg: 'rgba(245,158,11,0.12)',  color: '#b45309' },
  ARCHIVED:       { icon: <Archive size={12} />,   bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  DELETED:        { icon: <XCircle size={12} />,   bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  USED:           { icon: <Tag size={12} />,        bg: 'rgba(8,145,178,0.12)',   color: '#0e7490' },
  REVERSED:       { icon: <RefreshCw size={12} />, bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  CANCELLED:      { icon: <XCircle size={12} />,   bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  RESTORED:       { icon: <RefreshCw size={12} />, bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  REWARD_PAID:    { icon: <Zap size={12} />,        bg: 'rgba(234,179,8,0.12)',   color: '#b45309' },
  REWARD_REVERSED:{ icon: <RefreshCw size={12} />, bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
};

const STAT_META = [
  { key: 'total',   label: 'Total codes',  icon: <Gift size={18} />,        accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)',  val: (s) => s.counts?.total ?? 0         },
  { key: 'active',  label: 'Active',       icon: <Zap size={18} />,         accent: '#059669', bg: 'rgba(5,150,105,0.08)',   val: (s) => s.counts?.active ?? 0        },
  { key: 'revenue', label: 'Total revenue',icon: <DollarSign size={18} />,  accent: '#2563eb', bg: 'rgba(37,99,235,0.08)',   val: (s) => fmt(s.totals?.revenue), raw: true },
  { key: 'uses',    label: 'Total uses',   icon: <Users size={18} />,       accent: '#0891b2', bg: 'rgba(8,145,178,0.08)',   val: (s) => (s.totals?.total_uses ?? 0).toLocaleString() },
];

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const selectStyle = {
  padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#374151', outline: 'none',
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const selectFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const selectBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const TH_LABEL = ({ children }) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>
    {children}
  </span>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent, bg }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: accent,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
      </div>
    </div>
  );
}

function Badge({ bg, color, ring, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 7,
      fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700,
      background: 'rgba(168,85,247,0.06)', color: '#6d28d9',
      border: '1px solid rgba(168,85,247,0.18)', cursor: 'pointer',
      transition: 'background 120ms, border-color 120ms',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.12)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; }}
    >
      {code}
      {copied
        ? <Check size={10} style={{ color: '#10b981', flexShrink: 0 }} />
        : <Copy size={10} style={{ color: '#c4b5fd', flexShrink: 0 }} />
      }
    </button>
  );
}

function ActionMenu({ code, onView, onActivate, onPause, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);

  const items = [
    { icon: Eye,     label: 'View details', onClick: onView,     danger: false },
    null,
    ...(code.status !== 'active'   ? [{ icon: Play,    label: 'Activate', onClick: onActivate, danger: false }] : []),
    ...(code.status === 'active'   ? [{ icon: Pause,   label: 'Pause',    onClick: onPause,    danger: false }] : []),
    ...(code.status !== 'archived' ? [{ icon: Archive, label: 'Archive',  onClick: onArchive,  danger: false }] : []),
    null,
    { icon: Trash2, label: 'Delete', onClick: onDelete, danger: true },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer',
          color: '#c4b5fd', transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = '#a855f7'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#c4b5fd'; }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 180, zIndex: 20,
            background: 'white', borderRadius: 12, padding: '6px 0',
            border: '1.5px solid rgba(168,85,247,0.15)',
            boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
          }}
            onClick={e => e.stopPropagation()}
          >
            {items.map((item, i) => item === null ? (
              <div key={i} style={{ margin: '4px 0', borderTop: '1px solid rgba(168,85,247,0.08)' }} />
            ) : (
              <button key={i} onClick={() => { item.onClick(); setOpen(false); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', fontSize: '0.8rem', fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: item.danger ? '#ef4444' : '#374151',
                transition: 'background 120ms',
              }}
                onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(239,68,68,0.05)' : 'rgba(168,85,247,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <item.icon size={13} style={{ flexShrink: 0 }} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
      {[180, 80, 90, 70, 50, 80, 70, 0].map((w, j) => (
        <td key={j} style={{ padding: '14px 20px' }}>
          {w > 0 && <div style={{ width: w, height: 10, borderRadius: 6, background: 'rgba(168,85,247,0.07)' }} />}
        </td>
      ))}
    </tr>
  );
}

function ReferralActivityTimeline({ items, pag, onLoadMore, loading }) {
  if (loading) return (
    <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 20px' }}>
      Loading activity...
    </p>
  );
  if (!items.length) return (
    <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 20px' }}>
      No activity yet.
    </p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((a, i) => {
        const meta    = REFERRAL_ACTION_META[a.action] ?? REFERRAL_ACTION_META.UPDATED;
        const isLast  = i === items.length - 1;
        const isPromo = a.entity_type === 'promo_code';

        return (
          <div key={a.id} style={{
            display: 'flex', gap: 10, padding: '10px 20px',
            borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.06)',
          }}>
            {/* Icon */}
            <div style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1,
              background: meta.bg, color: meta.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {meta.icon}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.78rem', color: '#374151', margin: 0, lineHeight: 1.5 }}>
                <strong>{a.actor?.name ?? 'System'}</strong>{' '}
                <span style={{ color: meta.color, fontWeight: 600, textTransform: 'lowercase' }}>
                  {a.action.replace(/_/g, ' ')}
                </span>{' '}
                <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                  {isPromo ? 'promo' : 'referral'} code
                </span>
                {a.metadata?.code && (
                  <span style={{
                    marginLeft: 6, fontFamily: 'monospace', fontSize: '0.72rem',
                    fontWeight: 700, color: '#7c3aed',
                    background: 'rgba(168,85,247,0.08)',
                    padding: '1px 6px', borderRadius: 5,
                    border: '1px solid rgba(168,85,247,0.18)',
                  }}>
                    {a.metadata.code}
                  </span>
                )}
                {a.metadata?.name && (
                  <> — <strong style={{ color: '#111827' }}>{a.metadata.name}</strong></>
                )}
              </p>

              {/* Field changes */}
              {a.metadata?.changes?.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: '0.72rem', color: '#6b7280' }}>
                  {a.metadata.changes.map((c, j) => (
                    <li key={j}>
                      {c.field}:{' '}
                      <span style={{ color: '#dc2626' }}>{String(c.old ?? '—')}</span>
                      {' → '}
                      <span style={{ color: '#16a34a' }}>{String(c.new ?? '—')}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Amount if present */}
              {a.amount > 0 && (
                <p style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600, margin: '2px 0 0' }}>
                  {fmt(a.amount)}
                </p>
              )}

              {/* Order link if present */}
              {a.order_id && a.metadata?.order_number && (
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>
                  Order: <span style={{ color: '#7c3aed', fontWeight: 600 }}>{a.metadata.order_number}</span>
                </p>
              )}

              {/* Timestamp + actor type */}
              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '3px 0 0' }}>
                {new Date(a.created_at).toLocaleString('en-KE', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                {a.actor_type && (
                  <span style={{
                    marginLeft: 6, fontSize: '0.6rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: a.actor_type === 'admin' ? '#7c3aed' : a.actor_type === 'customer' ? '#0e7490' : '#9ca3af',
                  }}>
                    · {a.actor_type}
                  </span>
                )}
              </p>
            </div>
          </div>
        );
      })}

      {/* Load more */}
      {pag && pag.current_page < pag.last_page && (
        <button onClick={() => onLoadMore(pag.current_page + 1)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px', fontSize: '0.75rem', fontWeight: 600, color: '#7c3aed',
          background: 'rgba(168,85,247,0.04)', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          <RefreshCw size={12} /> Load more
        </button>
      )}
    </div>
  );
}

// ─── REFERRAL SYSTEM DEV NOTES ───────────────────────────────────────────────
const REFERRAL_DEV_NOTES = {
  pitfalls: [
    {
      title: "ReferralController::update() — $changes is declared but never populated",
      severity: "critical",
      detail: "$changes = [] is set at the top of update(), and logReferralCodeUpdated($code, $changes) fires at the end — but the field-diff loop that exists in PromoCodeController::update() was never ported here. Every referral code update logs an empty changes array.",
      outcome: "Activity log entries for referral code edits are useless. An admin editing a code's value, expiry, or status leaves no traceable record of what changed. Copy the $fields loop from PromoCodeController::update() into ReferralController::update().",
    },
    {
      title: "Both statistics() methods fire 8–11 sequential COUNT/SUM queries",
      severity: "warning",
      detail: "Both PromoCodeController::statistics() and ReferralController::statistics() use the (clone $base)->count(), (clone $base)->where('status','active')->count() pattern — each is a separate DB round trip. PromoCodeController fires at least 11 queries per page load.",
      outcome: "Gets noticeably slow as the referral_codes table grows. Replace with a single conditional aggregate: SELECT COUNT(*) as total, SUM(status='active') as active, SUM(status='expired') as expired, ... This is one query regardless of table size.",
    },
    {
      title: "generateBirthdayCodes(daysAhead: 0) loads all birthday customers into PHP memory",
      severity: "warning",
      detail: "The manual trigger path calls Customer::whereNotNull('birthday')->where('status','active')->get() with no limit, then filters in PHP with ->filter(). The scheduler path correctly uses DB-side whereMonth/whereDay. For large customer bases the manual trigger pulls every customer with a birthday into memory.",
      outcome: "The admin-facing triggerBirthday endpoint could exhaust memory or timeout on production. Fix: apply the same DB-side date filter the scheduler uses, or chunk the manual path.",
    },
    {
      title: "generateWinBackCodes() has no chunking",
      severity: "warning",
      detail: "Customer::where('status','active')->where('total_orders','>',0)->where('last_order_date','<',$cutoff)->get() loads every inactive customer at once. No ->chunk() like the algorithm service uses.",
      outcome: "A platform with 5,000+ inactive customers hits a memory wall. Wrap in ->chunk(200, function($customers) { ... }) — same pattern already used in the algorithm batch scorer.",
    },
    {
      title: "topPerformers() filters to active codes only",
      severity: "warning",
      detail: "topPerformers() applies ->where('status','active'), excluding depleted and archived codes. A code that drove significant revenue before being archived disappears from the top performers list.",
      outcome: "Misleading performance view — the admin sees 'current' best performers, not historically best performers. Remove the status filter and sort purely by total_revenue or times_used.",
    },
    {
      title: "PromoCodeController::statistics() averages an already-averaged column",
      severity: "warning",
      detail: "(clone $base)->avg('average_order_value') computes the average of a column that is itself a pre-computed average per code. This is the average of averages — mathematically wrong when codes have different usage volumes (a code used once with KES 10,000 skews the figure as much as one used 500 times).",
      outcome: "The avg_order_value stat on the promo dashboard is inaccurate. Correct formula: SUM(total_revenue) / NULLIF(SUM(times_used), 0).",
    },
    {
      title: "getCustomerPromoCodes() has overlapping filter buckets",
      severity: "low",
      detail: "used_codes returns codes where times_used > 0. expired_codes returns codes where is_expired or status='expired'. A code that was used once and then expired appears in both buckets simultaneously.",
      outcome: "Frontend deduplication needed, or the customer-facing wallet shows the same code twice. Fix: make the buckets mutually exclusive — active (not expired, not depleted), used (used but still valid or depleted), expired (expired, used or not).",
    },
    {
      title: "validateCode (public endpoint) records a view before eligibility check",
      severity: "low",
      detail: "ReferralController::validateCode() calls $code->recordView() immediately after finding the code — before any auth or eligibility check. An unauthenticated request to /referrals/validate with a known code string increments its view counter.",
      outcome: "View counts are inflatable by bots or competitors probing the API. Move recordView() to after the is_valid check at minimum, ideally after confirmed customer eligibility.",
    },
    {
      title: "generateVipCode deduplication uses name LIKE %tier%",
      severity: "low",
      detail: "The existence check uses .where('name', 'like', \"%{$newTier}%\") to detect whether a VIP code for this tier was already issued. If a customer's full_name contains 'gold' or 'platinum', or an admin manually named a different code with those words, the check fires a false positive and skips a legitimate VIP code generation.",
      outcome: "Edge case but possible. Fix: add a vip_tier column to referral_codes and check that explicitly instead of pattern-matching on name.",
    },
    {
      title: "Double fetchStatistics() call on component mount",
      severity: "low",
      detail: "Referrals.jsx has two useEffect hooks with empty dependency arrays that both call fetchStatistics(). The first (line ~373) was apparently left over when the second combined effect (fetchStatistics + loadActivity) was added.",
      outcome: "Every page load fires the statistics API twice. Remove the standalone useEffect(() => { fetchStatistics(); }, []) and keep only the combined one.",
    },
  ],
  strengths: [
    {
      title: "Unified model for referral codes and promo codes",
      detail: "Customer referral codes and admin promo codes share the same referral_codes table and model, distinguished by type. One validation flow, one usage tracking path, consistent metrics. Extending with a new code type (e.g. 'event', 'bulk_order') requires zero schema changes.",
    },
    {
      title: "5-trigger automated promo lifecycle",
      detail: "Birthday, first-time registration, VIP tier upgrade, loyalty milestone, and win-back codes all fire from lifecycle events with no manual admin intervention. The platform runs a personalised discount program on autopilot once the commands are scheduled.",
    },
    {
      title: "destroy() preserves history by archiving used codes",
      detail: "A code with any usage history is silently archived instead of hard-deleted. Revenue and usage data are never lost, and the audit trail stays intact. Zero chance of orphaned usage rows.",
    },
    {
      title: "Three-stage conversion funnel per code",
      detail: "views → attempts → times_used tracks where drop-off happens at individual code level. Low views means the code isn't being seen. High views + low uses means eligibility barriers or confusion. This granularity is genuinely useful for diagnosing campaign problems.",
    },
    {
      title: "Per-code stackable flag",
      detail: "Whether a promo can be combined with a referral discount is controlled at the individual code level, not globally. Lets admins run non-stackable flash sales while keeping referral bonuses combinable with other promotions.",
    },
    {
      title: "Manual trigger endpoints for all scheduled jobs",
      detail: "triggerBirthday, triggerWinBack, and triggerExpire endpoints mean an admin can re-run any scheduled task from the UI without SSH or artisan access. Critical for Railway deployments where terminal access may not always be convenient.",
    },
    {
      title: "Activity log trait on both controllers",
      detail: "LogsReferralActivity covers code creation, status changes (activated/paused/archived/deleted), and updates across both the referral and promo controllers. Consistent audit trail without duplicating logging logic.",
    },
  ],
  future: [
    {
      title: "Email/SMS delivery for birthday and win-back codes",
      detail: "All auto-generated promo notifications currently use channels: ['database'] — in-app only. Dormant and at-risk customers by definition aren't opening the app regularly. Email delivery for birthday and win-back codes would dramatically improve redemption rates for the customers who need it most.",
      horizon: "near",
    },
    {
      title: "Referrer reward payout pipeline",
      detail: "referrer_reward_paid and referrer_reward_amount exist on usage rows. The earnings() endpoint correctly tracks what's owed. But the actual disbursement mechanism — store credit, M-Pesa push, wallet credit — hasn't been built yet. This is the missing half of the referral program.",
      horizon: "near",
    },
    {
      title: "Statistics query consolidation",
      detail: "Both statistics() methods should be refactored to single conditional aggregate queries. The current clone-and-count pattern is functional now but becomes a latency problem as the referral_codes table grows into tens of thousands of rows.",
      horizon: "near",
    },
    {
      title: "auto_apply code selection at checkout",
      detail: "The auto_apply boolean exists on codes but the checkout flow has no logic to query and apply the best eligible auto-apply code automatically. The column is inert until this is implemented. Priority: define 'best' (highest discount? most restrictive eligibility? newest?).",
      horizon: "medium",
    },
    {
      title: "Campaign total spend cap",
      detail: "max_uses limits the number of redemptions but not the total discount value given. A 50%-off code with max_uses=1000 could give away KES 500,000 if order values are high. A max_total_discount_budget column would give admins a financial safety net for high-value codes.",
      horizon: "medium",
    },
    {
      title: "Referral code performance attribution to algorithm segments",
      detail: "Once the algorithm scoring system and the referral system are both running at scale, joining referral_code_usages.customer_id to customer_algorithm_scores would answer: do champion-segment customers generate better referrals? Do at-risk customers actually return after a win-back code? This closes the feedback loop between the two systems.",
      horizon: "long",
    },
  ],
};

const RSEV = { critical: "#ef4444", warning: "#f59e0b", low: "#a855f7" };
const RHOR = { near: "#06b6d4", medium: "#f59e0b", long: "#a855f7" };

function ReferralDevNotesModal({ onClose }) {
  const [tab, setTab] = useState("pitfalls");

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(168,85,247,0.2), 0 4px 20px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#a855f7" }}>
              // dev notes — referral &amp; promo code system
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>
            internal analysis · not visible to customers
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {["pitfalls", "strengths", "future"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "9px 20px", background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #a855f7" : "2px solid transparent",
                color: tab === t ? "#a855f7" : "#6b7280",
                fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                opacity: tab === t ? 1 : 0.6, marginBottom: -1, transition: "all 0.15s",
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "pitfalls" && REFERRAL_DEV_NOTES.pitfalls.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: `1px solid ${RSEV[n.severity]}2a`, background: `${RSEV[n.severity]}07` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: RSEV[n.severity], background: `${RSEV[n.severity]}18`, padding: "2px 7px", borderRadius: 3 }}>{n.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.65, marginBottom: 6 }}>{n.detail}</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>
                <span style={{ color: "#6b7280" }}>→ outcome: </span>{n.outcome}
              </div>
            </div>
          ))}

          {tab === "strengths" && REFERRAL_DEV_NOTES.strengths.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid #a855f722", background: "#a855f705" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a855f7", marginBottom: 6 }}>✓ {n.title}</div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}

          {tab === "future" && REFERRAL_DEV_NOTES.future.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: RHOR[n.horizon], background: `${RHOR[n.horizon]}18`, padding: "2px 7px", borderRadius: 3 }}>{n.horizon}-term</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Referrals() {
  const navigate = useNavigate();
  const {
    codes, statistics, pagination, filters, loading,
    fetchCodes, fetchStatistics, setFilter, resetFilters,
    activateCode, pauseCode, archiveCode, deleteCode,
  } = useReferralsStore();

  const [showInfo,    setShowInfo]    = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activity,    setActivity]    = useState([]);
  const [activityPag, setActivityPag] = useState(null);
  const [actLoading,  setActLoading]  = useState(true);
  const [showLog,     setShowLog]     = useState(true);
  const [devNotesOpen, setDevNotesOpen] = useState(false);

  useEffect(() => { fetchStatistics(); }, []);
  useEffect(() => { fetchCodes(); }, [filters]);

  const loadActivity = async (page = 1) => {
    try {
      setActLoading(page === 1);
      const res = await api.get('/admin/referrals/activity', {
        params: { per_page: 20, page },
      });
      const { data, current_page, last_page } = res.data;
      if (page === 1) setActivity(data);
      else setActivity(prev => [...prev, ...data]);
      setActivityPag({ current_page, last_page });
    } catch {
      toast.error('Failed to load activity log');
    } finally {
      setActLoading(false);
    }
  };

  // Update existing useEffects:
  useEffect(() => { fetchStatistics(); loadActivity(); }, []);

  const handleActivate = async (id) => {
    try { await activateCode(id); toast.success('Code activated.'); loadActivity(); }
    catch { toast.error('Failed.'); }
  };
  const handlePause = async (id) => {
    try { await pauseCode(id); toast.success('Code paused.'); loadActivity(); }
    catch { toast.error('Failed.'); }
  };
  const handleArchive = async (id) => {
    try { await archiveCode(id); toast.success('Code archived.'); loadActivity(); }
    catch { toast.error('Failed.'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this code?')) return;
    try { await deleteCode(id); toast.success('Code deleted.'); loadActivity(); }
    catch { toast.error('Failed to delete.'); }
  };

  const rewardStr = (code) => {
    if (code.reward_type === 'percentage')   return `${code.reward_value}% off`;
    if (code.reward_type === 'fixed_amount') return `${fmt(code.reward_value)} off`;
    return REWARD_META[code.reward_type]?.label ?? '—';
  };

  const hasFilters = filters.search || filters.type || filters.status || filters.reward_type || filters.expiring;
  const activeFilterCount = [filters.type, filters.status, filters.reward_type, filters.expiring && 'expiring'].filter(Boolean).length;

  return (
    <SettingsLayout>
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
            Referral Codes
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            Customer referral program and discount code management
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setDevNotesOpen(true)}
            style={{
              padding: '9px 16px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 700,
              border: '1.5px solid rgba(168,85,247,0.3)', cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', color: '#a855f7', fontFamily: 'monospace',
            }}
          >
            // dev
          </button>

        {/* New code button — referrals are auto-generated, so show info tooltip */}
        <div style={{ position: 'relative' }}>
          <button
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)',
              transition: 'box-shadow 150ms',
            }}
            onMouseEnterCapture={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
            onMouseLeaveCapture={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
          >
            <Plus size={15} /> New code
          </button>
          
          {showInfo && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 300, zIndex: 30,
              background: 'white', borderRadius: 12, padding: 16,
              border: '1.5px solid rgba(168,85,247,0.2)',
              boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
            }}
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
            >
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <Info size={16} style={{ color: '#a855f7', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                    Referral codes are automated
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
                    Every customer automatically receives a personal referral code on registration. No manual creation is needed.
                  </p>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(168,85,247,0.1)', paddingTop: 12 }}>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 8px' }}>
                  Looking to create a discount or campaign code?
                </p>
                <button
                  onClick={() => navigate('/admin/promo-codes')}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 8,
                    fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                    boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
                  }}
                >
                  Go to Promo Codes <ExternalLink size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
        </div></div>
      </div>

      {/* ── How it works banner ── */}
      <div style={{
        padding: '14px 18px', borderRadius: 12,
        background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)',
        display: 'flex', gap: 12,
      }}>
        <Info size={16} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1d4ed8', margin: '0 0 3px' }}>
            How referral rewards work
          </p>
          <p style={{ fontSize: '0.72rem', color: '#3b82f6', margin: 0, lineHeight: 1.6 }}>
            When a customer shares their code and a new user registers with it, the new user receives a discount on their first order.
            The referrer's reward is only credited after the referred customer places an order and an admin <strong>confirms</strong> it.
            This ensures rewards are given only for verified, completed orders.
          </p>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {statistics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {STAT_META.map(({ key, label, icon, accent, bg, val }) => (
            <StatCard key={key} icon={icon} label={label} value={val(statistics)} accent={accent} bg={bg} />
          ))}
        </div>
      )}

      {/* ── Search + filters ── */}
      <div style={card}>
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#c4b5fd', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search name, code…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              style={{
                width: '100%', padding: '7px 12px 7px 32px', borderRadius: 8, fontSize: '0.82rem',
                background: 'rgba(168,85,247,0.04)',
                border: '1.5px solid rgba(168,85,247,0.18)',
                color: '#111827', outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box', transition: 'border-color 150ms, box-shadow 150ms',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
              background: showFilters || hasFilters ? 'rgba(168,85,247,0.08)' : 'transparent',
              border: `1.5px solid ${showFilters || hasFilters ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.18)'}`,
              color: showFilters || hasFilters ? '#7c3aed' : '#9ca3af',
            }}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%', fontSize: '0.6rem', fontWeight: 800,
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div style={{
            padding: '12px 16px 14px',
            borderTop: '1px solid rgba(168,85,247,0.1)',
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            <select value={filters.type ?? ''} onChange={e => setFilter('type', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All types</option>
              {Object.entries(TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>

            <select value={filters.status ?? ''} onChange={e => setFilter('status', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All statuses</option>
              {Object.keys(STATUS_STYLES).map(v => (
                <option key={v} value={v} style={{ textTransform: 'capitalize' }}>{v}</option>
              ))}
            </select>

            <select value={filters.reward_type ?? ''} onChange={e => setFilter('reward_type', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All reward types</option>
              {Object.entries(REWARD_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>

            <button onClick={() => setFilter('expiring', !filters.expiring)} style={{
              padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
              background: filters.expiring ? 'rgba(168,85,247,0.1)' : 'transparent',
              border: `1.5px solid ${filters.expiring ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.18)'}`,
              color: filters.expiring ? '#7c3aed' : '#9ca3af',
            }}>
              Expiring soon
            </button>

            {hasFilters && (
              <button onClick={resetFilters} style={{
                fontSize: '0.78rem', fontWeight: 600, color: '#c4b5fd',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '0 4px', transition: 'color 150ms',
              }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', minWidth: 200 }}><TH_LABEL>Code / Name</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 100 }}><TH_LABEL>Type</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 120 }}><TH_LABEL>Reward</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 100 }}><TH_LABEL>Status</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'right', minWidth: 80  }}><TH_LABEL>Uses</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'right', minWidth: 110 }}><TH_LABEL>Revenue</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 100 }}><TH_LABEL>Expires</TH_LABEL></th>
                <th style={{ padding: '10px 16px', width: 44 }} />
              </tr>
            </thead>

            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)

                : codes.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '64px 24px', textAlign: 'center' }}>
                        <Gift size={36} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '0 0 8px' }}>No referral codes found</p>
                        {hasFilters && (
                          <button onClick={resetFilters} style={{
                            fontSize: '0.75rem', fontWeight: 600, color: '#a855f7',
                            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            Clear filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )

                  : codes.map((code, i) => {
                      const tm    = TYPE_META[code.type]     ?? { label: code.type,   color: '#6b7280', bg: 'rgba(107,114,128,0.1)', ring: 'rgba(107,114,128,0.2)' };
                      const sm    = STATUS_STYLES[code.status] ?? STATUS_STYLES.draft;
                      const isLast = i === codes.length - 1;

                      return (
                        <tr
                          key={code.id}
                          onClick={() => navigate(`/admin/referrals/${code.id}`)}
                          style={{
                            borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                            cursor: 'pointer', transition: 'background 120ms',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >

                          {/* Code / Name */}
                          <td style={{ padding: '12px 20px' }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                              {code.name}
                            </p>
                            <CopyCode code={code.code} />
                          </td>

                          {/* Type */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={tm.bg} color={tm.color} ring={tm.ring}>
                              {tm.label}
                            </Badge>
                          </td>

                          {/* Reward */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                              {rewardStr(code)}
                            </span>
                            {code.min_order_value > 0 && (
                              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>
                                min. {fmt(code.min_order_value)}
                              </p>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={sm.bg} color={sm.color} ring={sm.ring}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.dot, flexShrink: 0 }} />
                              {code.status}
                            </Badge>
                          </td>

                          {/* Uses */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                              {(code.times_used ?? 0).toLocaleString()}
                            </span>
                            {code.max_uses && (
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                                {' '}/ {code.max_uses.toLocaleString()}
                              </span>
                            )}
                          </td>

                          {/* Revenue */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                              {fmt(code.total_revenue)}
                            </span>
                          </td>

                          {/* Expires */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '0.75rem', color: code.valid_until ? '#374151' : '#d1d5db' }}>
                              {fmtDate(code.valid_until)}
                            </span>
                          </td>

                          {/* Action */}
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            <ActionMenu
                              code={code}
                              onView={() => navigate(`/admin/referrals/${code.id}`)}
                              onActivate={() => handleActivate(code.id)}
                              onPause={() => handlePause(code.id)}
                              onArchive={() => handleArchive(code.id)}
                              onDelete={() => handleDelete(code.id)}
                            />
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && codes.length > 0 && pagination.last_page > 1 && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(168,85,247,0.02)',
          }}>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
              Page {pagination.current_page} of {pagination.last_page} — {pagination.total?.toLocaleString()} codes
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setFilter('page', pagination.current_page - 1)}
                disabled={pagination.current_page <= 1}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: pagination.current_page <= 1 ? 'not-allowed' : 'pointer',
                  border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', opacity: pagination.current_page <= 1 ? 0.3 : 1, transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (pagination.current_page > 1) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                const p = pagination.current_page <= 3
                  ? i + 1
                  : pagination.current_page >= pagination.last_page - 2
                  ? pagination.last_page - 4 + i
                  : pagination.current_page - 2 + i;
                if (p < 1 || p > pagination.last_page) return null;
                const isActive = p === pagination.current_page;
                return (
                  <button
                    key={p} onClick={() => setFilter('page', p)}
                    style={{
                      width: 30, height: 30, borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
                      background: isActive ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'none',
                      border: isActive ? 'none' : '1.5px solid rgba(168,85,247,0.18)',
                      color: isActive ? 'white' : '#9ca3af',
                      boxShadow: isActive ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setFilter('page', pagination.current_page + 1)}
                disabled={pagination.current_page >= pagination.last_page}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: pagination.current_page >= pagination.last_page ? 'not-allowed' : 'pointer',
                  border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', opacity: pagination.current_page >= pagination.last_page ? 0.3 : 1, transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (pagination.current_page < pagination.last_page) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* ── Activity Log ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <button
          onClick={() => setShowLog(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '14px 20px',
            background: 'rgba(168,85,247,0.04)', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>
            Activity Log
          </span>
          {showLog
            ? <ChevronUp size={14} color="#7c3aed" />
            : <ChevronDown size={14} color="#7c3aed" />
          }
        </button>
        {showLog && (
          <ReferralActivityTimeline
            items={activity}
            pag={activityPag}
            onLoadMore={loadActivity}
            loading={actLoading}
          />
        )}
      </div>
      {devNotesOpen && <ReferralDevNotesModal onClose={() => setDevNotesOpen(false)} />}
    </div>
    </SettingsLayout>
  );
}