import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, Search, Filter, MoreHorizontal,
  Shield, ShieldAlert, Lock, Unlock, Info, ExternalLink, Upload,
  KeyRound, UserX, UserCheck, Trash2, RotateCcw,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Eye,
  ArrowUpDown, ChevronDown, ChevronUp, Building2, Download,
} from 'lucide-react';
import useUsersStore from '../../../../_shared/store/usersStore';
import usersAPI from '../../../../_shared/api/users';
import toast from 'react-hot-toast';
import CreateUserModal from './components/CreateUserModal';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import ViewToggle from '../../../../_shared/components/common/ViewToggle';
import { useViewMode } from '../../../../_shared/components/common/viewMode';

// ── Constants ─────────────────────────────────────────────────────────────────
// The role badge colour follows the clearance level (0 to 6), never the role's name: roles are made in the role builder.
const LEVEL_STYLES = [
  { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   ring: 'rgba(217,119,6,0.25)'  },   // 0  no staff access (customers, vendors)
  { color: 'var(--text-secondary)', bg: 'rgba(107,114,128,0.1)', ring: 'rgba(107,114,128,0.2)' },   // 1
  { color: '#059669', bg: 'rgba(5,150,105,0.1)',   ring: 'rgba(5,150,105,0.25)'  },   // 2
  { color: '#0891b2', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.25)'  },   // 3
  { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  ring: 'rgba(124,58,237,0.25)' },   // 4
  { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   ring: 'rgba(37,99,235,0.25)'  },   // 5
  { color: 'var(--color-primary-600)', bg: 'color-mix(in srgb, var(--color-primary-600) 10%, transparent)', ring: 'color-mix(in srgb, var(--color-primary-600) 25%, transparent)' },   // 6
];
const levelStyle = (user) => LEVEL_STYLES[user.clearance ?? 0] ?? LEVEL_STYLES[0];

const STATUS_STYLES = {
  active:               { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)'  },
  inactive:             { bg: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)'  },
  suspended:            { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
  pending_verification: { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
};

const STAT_META = [
  { key: 'total',     label: 'Total users',  icon: <Users size={18} />,       accent: '#2563eb', bg: 'rgba(37,99,235,0.08)'   },
  { key: 'staff',     label: 'Staff',        icon: <Shield size={18} />,      accent: 'var(--color-primary-600)', bg: 'color-mix(in srgb, var(--color-primary-600) 8%, transparent)'  },
  { key: 'active',    label: 'Active',       icon: <CheckCircle size={18} />, accent: '#059669', bg: 'rgba(5,150,105,0.08)'   },
  { key: 'suspended', label: 'Suspended',    icon: <ShieldAlert size={18} />, accent: '#dc2626', bg: 'rgba(220,38,38,0.08)'   },
  { key: 'locked',    label: 'Locked',       icon: <Lock size={18} />,        accent: '#d97706', bg: 'rgba(217,119,6,0.08)'   },
  { key: 'customers', label: 'Customers',    icon: <UserCheck size={18} />,   accent: '#0891b2', bg: 'rgba(8,145,178,0.08)'   },
];

const PER_PAGE_OPTIONS = [10, 20, 50];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = {
  background: 'var(--surface-card, #fff)',
  borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};

const selectStyle = {
  padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'var(--surface-card, #fff)',
  border: '1.5px solid var(--line)',
  color: 'var(--text-primary)', outline: 'none',
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'border-color 150ms, box-shadow 150ms',
};

const selectFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const selectBlur  = (e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; };

const TH_LABEL = ({ children }) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
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
        <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary-500)', lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em' }}>{value ?? 0}</p>
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

function SkeletonRow({ cols }) {
  return (
    <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)' }}>
      <td style={{ padding: '12px 16px', width: 44 }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--surface-input)' }} />
      </td>
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-input)', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: 120, height: 11, borderRadius: 6, background: 'var(--surface-input)' }} />
            <div style={{ width: 160, height: 9, borderRadius: 6, background: 'var(--surface-input)' }} />
          </div>
        </div>
      </td>
      {[80, 70, 64, 90, 60, 0].map((w, j) => (
        <td key={j} style={{ padding: '12px 16px' }}>
          {w > 0 && <div style={{ width: w, height: 10, borderRadius: 6, background: 'var(--surface-input)' }} />}
        </td>
      ))}
    </tr>
  );
}

// ── Action menu ───────────────────────────────────────────────────────────────
function ActionMenu({ user, onView, onStatusChange, onUnlock, onForceReset, onDelete, onRestore, isLocked }) {
  const [open, setOpen] = useState(false);
  
  const items = [
    { icon: Eye,       label: 'View details',         onClick: onView,                              danger: false },
    ...(!user.deleted_at ? [
      user.status === 'suspended'
        ? { icon: UserCheck, label: 'Activate',       onClick: () => onStatusChange('active'),      danger: false }
        : { icon: UserX,     label: 'Suspend',        onClick: () => onStatusChange('suspended'),   danger: true  },
      ...(isLocked ? [{ icon: Unlock, label: 'Unlock account', onClick: onUnlock, danger: false }] : []),
      { icon: KeyRound,  label: 'Force password reset', onClick: onForceReset,                      danger: false },
      null,
      { icon: Trash2,    label: 'Delete',              onClick: onDelete,                            danger: true  },
    ] : [
      { icon: RotateCcw, label: 'Restore',             onClick: onRestore,                           danger: false },
    ]),
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer',
          color: 'var(--text-tertiary)', transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#c4b5fd'; }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 200, zIndex: 20,
            background: 'var(--surface-card, #fff)', borderRadius: 12, padding: '6px 0',
            border: '1.5px solid var(--line)',
            boxShadow: '0 8px 32px color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
          }}
            onClick={e => e.stopPropagation()}
          >
            {items.map((item, i) => item === null ? (
              <div key={i} style={{ margin: '4px 0', borderTop: '1px solid var(--line)' }} />
            ) : (
              <button key={i} onClick={() => { item.onClick(); setOpen(false); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', fontSize: '0.8rem', fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: item.danger ? '#ef4444' : 'var(--text-primary)',
                transition: 'background 120ms',
              }}
                onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(239,68,68,0.05)' : 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)'}
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

// ─── USERS SYSTEM DEV NOTES ──────────────────────────────────────────────────
const USERS_DEV_NOTES = {
  pitfalls: [
    {
      title: "Email verification is permanently commented out",
      severity: "warning",
      detail: "Mail::to()->send(new WelcomeEmail($user)) is commented out in AuthController::register(). Users are created with status 'pending_verification' but never receive an email, and there is no follow-up verification endpoint hooked up. All registered customers are effectively unverified indefinitely.",
      outcome: "No email ownership confirmation for any customer. Downstream logic gated on email_verified_at will never fire. The WelcomeEmail class exists — uncomment and wire up the verification endpoint.",
    },
    {
      title: "getAdminUsers() in AuthController has no authorization and was never cleaned up",
      severity: "warning",
      detail: "The method has a comment 'Simplified version for testing'. It returns all super_admin/admin/manager/sales_rep users with no pagination, no policy check, and no rate limiting. Any authenticated user (including customers) who knows the route can enumerate all admin accounts.",
      outcome: "Admin account enumeration exposure. Add ->authorize('viewAny', User::class) or gate it to staff roles only, and add pagination.",
    },
    {
      title: "UserController::index() eager-loads after paginate() instead of in the query",
      severity: "warning",
      detail: "$users->load(['employee.manager.user', 'vendor', 'customer']) runs after paginate(). Eloquent resolves the chained employee.manager.user relationship with additional queries per user rather than a single JOIN. On a page of 20 users, this can fire 40–60 additional queries.",
      outcome: "Noticeable latency on the Users page as user count grows. Move the load into the query: User::with(['employee.manager.user', 'vendor', 'customer'])->paginate().",
    },
    {
      title: "CustomerController::statistics() has an N+1 inside by_tier and by_type",
      severity: "warning",
      detail: "CustomerTier::get()->mapWithKeys(fn($t) => Customer::byTier()->count()) fires one COUNT query per tier inside a PHP loop. Same pattern for by_type. With 4 tiers and 4 types, the stats endpoint runs 8 separate COUNT queries in addition to the other stats.",
      outcome: "Slow stats endpoint. Replace with a single Customer::selectRaw('tier, COUNT(*) as count')->groupBy('tier')->pluck('count', 'tier') query.",
    },
    {
      title: "UserController::statistics() runs 13+ sequential COUNT queries",
      severity: "warning",
      detail: "Same clone-and-count pattern as the algorithm and referral controllers — total, staff, finance, logistics, drivers, customers, vendors, active, suspended, pending_verification, locked, unverified, by_role, by_department, staff_without_employee_record. Each is a separate DB round-trip.",
      outcome: "Statistics endpoint becomes a bottleneck at scale. Consolidate into conditional aggregates: SELECT SUM(role='customer') as customers, SUM(status='active') as active, ...",
    },
    {
      title: "OAuthController auto-accepts policies without user awareness",
      severity: "warning",
      detail: "OAuth login silently logs 'accepted' for terms_of_use, privacy_policy, and website_policy without ever displaying them to the user. AuthController::register() requires explicit policy_acceptances from the user — OAuth bypasses this entirely.",
      outcome: "Legal exposure if a user disputes having agreed to policies. At minimum, redirect OAuth users to a one-time policy acceptance screen on first login, or show an acceptance modal before completing the callback redirect.",
    },
    {
      title: "handleRoleTransition() soft-deletes the old profile with no data warning",
      severity: "low",
      detail: "When a customer is converted to a staff role, their customer record is soft-deleted including referral codes, usage history, and gift voucher. No warning is shown, no confirmation required. Reversing the transition (staff back to customer) restores everything — which is correct but surprising.",
      outcome: "Admins converting roles don't know they're suspending a customer's full purchase history and active promo codes. Add a check and a warning response if the customer has active orders, unused codes, or a positive credit balance before proceeding.",
    },
    {
      title: "Driver role creates no profile record by design — a documented debt",
      severity: "low",
      detail: "The driver branch in store() explicitly skips creating any profile: 'Driver is portal-only — no profile record until delivery system is built'. The comment is honest but means all currently created driver users have no associated profile record.",
      outcome: "When the delivery system is built, a backfill migration will be needed for all existing drivers. Track these in a known-debt list and ensure the delivery system migration includes a Customer::whereDoesntHave('driverProfile') cleanup step.",
    },
  ],
  strengths: [
    {
      title: "UserPolicy hierarchy is a single numeric source of truth",
      detail: "The $hierarchy array with integer levels and outranks() method means every policy check — view, update, delete, role assignment — derives from one place. Adding a new role is a single-line change to the array. No scattered if-role-is-admin checks anywhere.",
    },
    {
      title: "handleRoleTransition() centralises all profile lifecycle logic",
      detail: "All profile creation and teardown for role changes (staff ↔ customer ↔ vendor) lives in one private method. Adding a new user type (e.g. supplier) requires adding one branch here and nowhere else. The pattern is clean and extensible.",
    },
    {
      title: "Soft-delete cascade is thorough and consistent",
      detail: "destroy/restore/forceDelete all handle user + employee + customer + vendor in sync. forceDelete nulls user_id on customer/vendor records rather than deleting them, preserving order history. The cascade is the same in single-delete, bulk-delete, and restore paths.",
    },
    {
      title: "Login has a correct security operation sequence",
      detail: "The password is verified first, in the same time whether or not the email exists, and only someone who knows it is told whether the account is suspended or locked. Wrong passwords earn a growing wait for that email from that address only, so a stranger can never lock the real owner out. A soft-deleted account is restored only after the password fits, force_password_change is intercepted before a token is issued, and every sign-in is a tracked, expiring session the person can end.",
    },
    {
      title: "Policy re-acceptance system is sophisticated",
      detail: "Login checks if active policy versions have changed since the customer's last acceptance, and prompts re-acceptance inline before completing login. Critical policy disagreements flag the account, revoke access, and fire an admin notification. This is a production-grade compliance flow.",
    },
    {
      title: "bulkDestroy silently skips unauthorized targets",
      detail: "Rather than returning a 403 when some IDs in a bulk request aren't permitted, it processes what it can and returns a count. This prevents information leakage — the actor can't determine which IDs existed vs were protected. The same pattern is used in bulkRestore.",
    },
    {
      title: "Tabs follow the kind of account; manageability comes from the server",
      detail: "The tab system (staff / drivers / customers / vendors) maps to the kind of account the backend works out from the roles table, and each row arrives with a manageable flag the server worked out from clearance, so the UI never repeats the rules the policy gate applies.",
    },
  ],
  future: [
    {
      title: "Email verification flow completion",
      detail: "WelcomeEmail exists, the commented-out send() call exists, the status 'pending_verification' exists. The missing piece is a /verify-email endpoint that accepts the signed URL token and flips status to active. This is a near-complete feature with one endpoint needed.",
      horizon: "near",
    },
    {
      title: "Customer number generation — atomic sequence",
      detail: "Replace the max(id)+1 pattern with either a dedicated auto-increment sequence table (INSERT INTO sequences ... LAST_INSERT_ID()) or switch customer_number to a UUID. The current pattern is a known race condition that will eventually produce duplicates under concurrent load.",
      horizon: "near",
    },
    {
      title: "OAuth first-login policy acceptance",
      detail: "OAuth users need a one-time policy acceptance screen. The infrastructure (LogsPolicyAcceptances trait, Policy model, needsReacceptance()) is already there. The missing piece is redirecting new OAuth users to an acceptance screen before completing the callback flow.",
      horizon: "medium",
    },
    {
      title: "Driver profile model",
      detail: "When the delivery system is built, a DriverProfile model will be needed. Plan for a backfill migration that creates profiles for all existing driver-role users. The UserController::store() driver comment already documents this debt — track it.",
      horizon: "medium",
    },
    {
      title: "Unified user search across all types",
      detail: "Currently search within tabs is scoped to that tab's role. A global user search across all types — staff + customers + vendors in one query — would be useful for admin workflows like assigning a sales rep, linking a vendor, or looking up any account by phone or email. The index() query structure already supports this with a tab:'all' fallback.",
      horizon: "long",
    },
  ],
};

const USEV = { critical: "#ef4444", warning: "#f59e0b", low: "var(--color-primary-500)" };
const UHOV = { near: "#06b6d4", medium: "#f59e0b", long: "var(--color-primary-500)" };

function UsersDevNotesModal({ onClose }) {
  const [tab, setTab] = useState("pitfalls");

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface-card, #fff)", borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px color-mix(in srgb, var(--color-primary-500) 18%, transparent), 0 4px 20px rgba(0,0,0,0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--color-primary-500)" }}>
              // dev notes — users system
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-tertiary)", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 14 }}>
            covers auth · oauth · customers · employees · user policy · employee policy
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {["pitfalls", "strengths", "future"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "9px 20px", background: "none", border: "none",
                borderBottom: tab === t ? "2px solid var(--color-primary-500)" : "2px solid transparent",
                color: tab === t ? "var(--color-primary-500)" : "var(--text-secondary)",
                fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                opacity: tab === t ? 1 : 0.6, marginBottom: -1, transition: "all 0.15s",
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "18px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "pitfalls" && USERS_DEV_NOTES.pitfalls.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: `1px solid ${USEV[n.severity]}2a`, background: `${USEV[n.severity]}07` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: USEV[n.severity], background: `${USEV[n.severity]}18`, padding: "2px 7px", borderRadius: 3 }}>{n.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 6 }}>{n.detail}</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                <span style={{ color: "var(--text-secondary)" }}>→ outcome: </span>{n.outcome}
              </div>
            </div>
          ))}

          {tab === "strengths" && USERS_DEV_NOTES.strengths.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--color-primary-500)22", background: "var(--color-primary-500)05" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary-500)", marginBottom: 6 }}>✓ {n.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}

          {tab === "future" && USERS_DEV_NOTES.future.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-input)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: UHOV[n.horizon], background: `${UHOV[n.horizon]}18`, padding: "2px 7px", borderRadius: 3 }}>{n.horizon}-term</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Table and card pieces, per tab ───────────────────────────────────────────
const money = (n) => `Ksh ${Number(n || 0).toLocaleString()}`;

/** "3 months ago": how long ago, in the biggest unit that fits. */
function ago(d) {
  if (!d) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// which columns each tab shows (after User); the rest of the row is the same everywhere
const TAB_COLUMNS = {
  staff:     ['dept', 'role', 'status', 'login', 'flags'],
  drivers:   ['dept', 'role', 'status', 'login', 'flags'],
  customers: ['type', 'orders', 'spent', 'lastOrder', 'status', 'flags'],
  vendors:   ['company', 'vendorNo', 'status', 'login', 'flags'],
};
const COLUMN_LABELS = { dept: 'Department', role: 'Role', status: 'Status', login: 'Last login', flags: 'Flags', type: 'Type and tier', orders: 'Orders', spent: 'Total spent', lastOrder: 'Last order', company: 'Company', vendorNo: 'Vendor no.' };
const RIGHT_COLUMNS = ['orders', 'spent'];

const dash = <span style={{ color: 'var(--text-tertiary)' }}>—</span>;

function StatusCell({ user }) {
  if (user.status === 'pending_verification') return dash;   // shown as a flag instead
  const st = STATUS_STYLES[user.status] ?? STATUS_STYLES.inactive;
  return (
    <Badge bg={st.bg} color={st.color} ring={st.ring}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
      {user.status?.replace('_', ' ') ?? 'unknown'}
    </Badge>
  );
}

/** Only real problems: locked, password reset due, pending verification, unverified email, deleted. A clean user shows nothing. */
function FlagsCell({ user, locked }) {
  const flag = (bg, color, ring, icon, text) => (
    <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700, background: bg, color, boxShadow: `0 0 0 1px ${ring}`, whiteSpace: 'nowrap' }}>{icon} {text}</span>
  );
  const out = [];
  if (user.deleted_at) out.push(flag('rgba(239,68,68,0.07)', '#b91c1c', 'rgba(239,68,68,0.15)', <Trash2 size={9} />, 'Deleted'));
  if (locked) out.push(flag('rgba(245,158,11,0.1)', '#b45309', 'rgba(245,158,11,0.25)', <Lock size={9} />, 'Locked'));
  if (user.force_password_change) out.push(flag('rgba(239,68,68,0.08)', '#b91c1c', 'rgba(239,68,68,0.2)', <KeyRound size={9} />, 'Password reset'));
  if (user.status === 'pending_verification') out.push(flag('rgba(245,158,11,0.1)', '#b45309', 'rgba(245,158,11,0.25)', <AlertCircle size={9} />, 'Pending verification'));
  if (!user.email_verified_at) out.push(flag('rgba(107,114,128,0.08)', 'var(--text-secondary)', 'rgba(107,114,128,0.2)', <AlertCircle size={9} />, 'Unverified'));
  return out.length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{out}</div> : dash;
}

function LoginCell({ user }) {
  if (!user.last_login_at) return <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Never</span>;
  return (
    <div>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{ago(user.last_login_at)}</span>
      <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: '1px 0 0' }}>{fmtDate(user.last_login_at)}, {new Date(user.last_login_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  );
}

function cellFor(key, user, locked) {
  const c = user.customer;
  const note = { fontSize: '0.78rem', color: 'var(--text-secondary)' };
  switch (key) {
    case 'dept': return <span style={note}>{user.department || '—'}</span>;
    case 'company': return <span style={note}>{user.vendor?.company_name || user.company_name || '—'}</span>;
    case 'vendorNo': return <span style={{ ...note, fontFamily: 'monospace' }}>{user.vendor?.vendor_number || '—'}</span>;
    case 'role': { const rm = levelStyle(user); return <Badge bg={rm.bg} color={rm.color} ring={rm.ring}>{user.role_name || user.role}</Badge>; }
    case 'status': return <StatusCell user={user} />;
    case 'login': return <LoginCell user={user} />;
    case 'flags': return <FlagsCell user={user} locked={locked} />;
    case 'type': return c ? (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {c.customer_type && <Badge bg="color-mix(in srgb, var(--color-primary-500) 7%, transparent)" color="var(--color-primary-600)" ring="color-mix(in srgb, var(--color-primary-500) 18%, transparent)">{c.customer_type}</Badge>}
        {c.tier && <Badge bg="rgba(107,114,128,0.1)" color="var(--text-secondary)" ring="rgba(107,114,128,0.2)">{c.tier}</Badge>}
      </div>
    ) : dash;
    case 'orders': return c ? <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{(c.total_orders ?? 0).toLocaleString()}</span> : dash;
    case 'spent': return c ? (
      <div><span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{money(c.total_spent)}</span>
        {Number(c.average_order_value) > 0 && <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: '2px 0 0', whiteSpace: 'nowrap' }}>avg {money(c.average_order_value)}</p>}</div>
    ) : dash;
    case 'lastOrder': return c?.last_order_date ? <span style={{ fontSize: '0.78rem' }}>{fmtDate(c.last_order_date)}</span> : dash;
    default: return null;
  }
}

function UserIdentity({ user }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <img src={user.customer ? (user.customer.profile_image_url || user.profile_picture_url) : user.profile_picture_url} alt={user.name}
        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--surface-card, #fff)', display: 'block' }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px', overflowWrap: 'anywhere' }}>{user.name}</p>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', margin: '0 0 1px', overflowWrap: 'anywhere' }}>{user.email}</p>
        {user.phone && <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', margin: 0 }}>{user.phone}</p>}
      </div>
    </div>
  );
}

/** The selected users as a spreadsheet file (CSV opens in Excel). */
function exportUsers(rows, tab) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'Email', 'Phone', 'Role', 'Status', 'Department', 'Company', 'Email verified', 'Phone verified', 'Last login'];
  const lines = [head, ...rows.map((u) => [u.name, u.email, u.phone, u.role_name || u.role, u.status, u.department, u.vendor?.company_name || u.company_name, u.email_verified_at ? 'yes' : 'no', u.phone_verified_at ? 'yes' : 'no', u.last_login_at ? new Date(u.last_login_at).toISOString() : ''])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `users-${tab}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const cardLabel = { fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: 700, margin: 0 };

function UserCard({ user, locked, columns, selected, onToggle, navigate, menu }) {
  return (
    <div style={{ ...card, padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, opacity: user.deleted_at ? 0.6 : 1, outline: selected ? '2px solid var(--color-primary-500)' : 'none' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" aria-label={`Select ${user.name}`} checked={selected} onChange={onToggle} style={{ accentColor: 'var(--color-primary-500)', width: 15, height: 15, cursor: 'pointer', marginTop: 12 }} />
        <div style={{ flex: 1, minWidth: 0 }}><UserIdentity user={user} /></div>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', rowGap: 14, columnGap: 12 }}>
        {columns.filter((k) => k !== 'flags').map((k) => (
          <div key={k} style={{ minWidth: 0 }}><p style={cardLabel}>{COLUMN_LABELS[k]}</p><div style={{ marginTop: 4 }}>{cellFor(k, user, locked)}</div></div>
        ))}
        {columns.includes('flags') && <div style={{ gridColumn: '1 / -1' }}><p style={cardLabel}>Flags</p><div style={{ marginTop: 4 }}>{cellFor('flags', user, locked)}</div></div>}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" onClick={() => navigate(`/admin/users/${user.id}`)} style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-input)', border: '1.5px solid var(--line)' }}>View</button>
        {menu}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UsersPage() {
  const navigate = useNavigate();
  const {
    users, statistics, departments, pagination, filters,
    loading, actionLoading,
    fetchUsers, fetchStatistics, fetchDepartments, fetchRoles, roles,
    setFilter, setTab, resetFilters,
    deleteUser, restoreUser, updateStatus,
    unlockUser, forcePasswordReset, bulkDelete, bulkRestore,
  } = useUsersStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIds,     setSelectedIds]     = useState([]);
  const [showFilters,     setShowFilters]     = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [devNotesOpen, setDevNotesOpen] = useState(false);
  const [view, setView] = useViewMode('users');

  useEffect(() => { fetchStatistics(); fetchDepartments(); fetchRoles(); }, []);
  useEffect(() => { fetchUsers(); setSelectedIds([]); }, [filters]);

  const toggleSelect    = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === users.length && users.length > 0 ? [] : users.map(u => u.id));

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    try { await deleteUser(id); toast.success('User deleted.'); }
    catch { toast.error('Failed to delete user.'); }
  };

  const handleRestore = async (id) => {
    try { await restoreUser(id); toast.success('User restored.'); }
    catch { toast.error('Failed to restore user.'); }
  };

  const handleStatusChange = async (id, status) => {
    try { await updateStatus(id, status); toast.success(`User ${status === 'suspended' ? 'suspended' : 'activated'}.`); }
    catch { toast.error('Failed to update status.'); }
  };

  const handleUnlock = async (id) => {
    try { await unlockUser(id); toast.success('Account unlocked.'); }
    catch { toast.error('Failed to unlock account.'); }
  };

  const handleForceReset = async (id) => {
    try { await forcePasswordReset(id); toast.success('Password reset required on next login.'); }
    catch { toast.error('Failed.'); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} users?`)) return;
    try { const res = await bulkDelete(selectedIds); toast.success(res.message); setSelectedIds([]); }
    catch { toast.error('Bulk delete failed.'); }
  };

  const handleBulkRestore = async () => {
    try { const res = await bulkRestore(selectedIds); toast.success(res.message); setSelectedIds([]); }
    catch { toast.error('Bulk restore failed.'); }
  };

  const handleBulkVerifyEmail = async () => {
    const targets = users.filter(u => selectedIds.includes(u.id) && !u.email_verified_at);
    if (targets.length === 0) return;
    if (!confirm(`Force-verify email for ${targets.length} user${targets.length !== 1 ? 's' : ''}?`)) return;
    let done = 0;
    const toastId = toast.loading(`Verifying emails… 0 / ${targets.length}`);
    for (const u of targets) {
      try {
        await usersAPI.verifyEmail(u.id);
        done++;
        toast.loading(`Verifying emails… ${done} / ${targets.length}`, { id: toastId });
      } catch {
        toast.error(`Failed for ${u.name}`);
      }
    }
    toast.success(`${done} email${done !== 1 ? 's' : ''} verified.`, { id: toastId });
    setSelectedIds([]);
    fetchUsers();
  };

  const handleBulkVerifyPhone = async () => {
    const targets = users.filter(u => selectedIds.includes(u.id) && u.phone && !u.phone_verified_at);
    if (targets.length === 0) return;
    if (!confirm(`Force-verify phone for ${targets.length} user${targets.length !== 1 ? 's' : ''}?`)) return;
    let done = 0;
    const toastId = toast.loading(`Verifying phones… 0 / ${targets.length}`);

    for (const u of targets) {
      try {
        await usersAPI.verifyPhone(u.id);
        done++;
        toast.loading(`Verifying phones… ${done} / ${targets.length}`, { id: toastId });
      } catch {
        toast.error(`Failed for ${u.name}`);
      }
    }

    toast.success(`${done} phone${done !== 1 ? 's' : ''} verified.`, { id: toastId });
    setSelectedIds([]);
    fetchUsers();
  };

  const isLocked  = (user) => user.locked_until && new Date(user.locked_until) > new Date();
  const hasFilters = filters.search || filters.role || filters.status || filters.department || filters.locked || filters.unverified || filters.trashed;
  const activeFilterCount = [filters.role, filters.status, filters.department, filters.locked && 'locked', filters.unverified && 'unverified', filters.trashed && 'trashed'].filter(Boolean).length;

  const showStaffTab = filters.tab === 'staff';
  const showDriversTab = filters.tab === 'drivers';
  const columns = TAB_COLUMNS[filters.tab] ?? TAB_COLUMNS.staff;
  const selectedUsers = users.filter(u => selectedIds.includes(u.id));
  const staffSide = showStaffTab || showDriversTab;   // staff and drivers have a department; customers and vendors a company

  return (
    <AdminLayout>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
              Users
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: 0 }}>
              {statistics?.total?.toLocaleString() ?? 0} total users
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setDevNotesOpen(true)}
                style={{
                  padding: '9px 16px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 700,
                  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)', cursor: 'pointer',
                  background: 'transparent', color: 'var(--color-primary-500)', fontFamily: 'monospace',
                }}
              >
                // dev
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  onMouseEnter={() => setShowInfo(true)}
                  onMouseLeave={() => setShowInfo(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
                    boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
                    transition: 'box-shadow 150ms',
                  }}
                  onMouseEnterCapture={e => e.currentTarget.style.boxShadow = '0 6px 20px color-mix(in srgb, var(--color-primary-500) 50%, transparent)'}
                  onMouseLeaveCapture={e => e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)'}
                >
                  <UserPlus size={15} /> New user
                </button>

                {showInfo && (
                  <div
                    onMouseEnter={() => setShowInfo(true)}
                    onMouseLeave={() => setShowInfo(false)}
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 300, zIndex: 30,
                      background: 'var(--surface-card, #fff)', borderRadius: 12, padding: 16,
                      border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
                      boxShadow: '0 8px 32px color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <Info size={16} style={{ color: 'var(--color-primary-500)', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                          Customers can't be created by admins
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                          Customers register themselves or can be added in bulk via a manual import. No admin of any role can create a customer account directly.
                        </p>
                      </div>
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8, marginBottom: 12,
                      background: 'var(--surface-card, #fff)',
                      border: '1px solid var(--line)',
                    }}>
                      <Upload size={13} style={{ color: 'var(--color-primary-500)', flexShrink: 0 }} />
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                        Need to add many customers at once?{' '}
                        <span style={{ color: 'var(--color-primary-600)', fontWeight: 600 }}>Use the import tool</span> on the Customers tab.
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
                        Looking to add a staff member instead?
                      </p>
                      <button
                        onClick={() => navigate('/admin/employees/create')}
                        style={{
                          width: '100%', padding: '8px', borderRadius: 8,
                          fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
                          boxShadow: '0 2px 10px color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
                        }}
                      >
                        Create new employee <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary strip ── */}
        {statistics && (
          <div style={{ ...card, display: 'flex', flexWrap: 'wrap', padding: '12px 0' }}>
            {STAT_META.map(({ key, label }, i) => {
              const tone = key === 'active' ? '#059669' : key === 'suspended' ? '#dc2626' : key === 'locked' ? 'var(--text-tertiary)' : 'var(--text-primary)';
              return (
                <div key={key} style={{ flex: '1 1 140px', padding: '4px 22px', borderLeft: i ? '1px solid var(--line)' : 'none', minWidth: 0 }}>
                  <p style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{label}</p>
                  <p style={{ fontSize: '1.35rem', fontWeight: 800, color: tone, lineHeight: 1.15, margin: '2px 0 0', letterSpacing: '-0.02em' }}>{(statistics[key] ?? 0).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tabs + search + filters ── */}
        <div style={{ borderRadius: 12, border: '1px solid var(--line)' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
            borderBottom: '1px solid var(--line)',
          }}>
            <div style={{ display: 'flex' }}>
              {['staff', 'drivers', 'customers', 'vendors'].map(tab => {
                const tabLabels = {
                  staff: 'Staff',
                  drivers: 'Drivers',
                  customers: 'Customers',
                  vendors: 'Vendors',
                };

                const tabStats = {
                  staff: statistics?.staff,
                  drivers: statistics?.drivers,
                  customers: statistics?.customers,
                  vendors: statistics?.vendors,
                };

                return (
                  <button key={tab} onClick={() => setTab(tab)} style={{
                    padding: '12px 18px', fontSize: '0.82rem', fontWeight: filters.tab === tab ? 700 : 500,
                    color: filters.tab === tab ? 'var(--color-primary-500)' : 'var(--text-tertiary)',
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    borderBottom: `2px solid ${filters.tab === tab ? 'var(--color-primary-500)' : 'transparent'}`,
                    marginBottom: -1, textTransform: 'capitalize', transition: 'color 150ms',
                  }}>
                    {tabLabels[tab]}
                    {tabStats[tab] !== undefined && (
                      <span style={{
                        marginLeft: 7, padding: '1px 7px', borderRadius: 99,
                        fontSize: '0.65rem', fontWeight: 700,
                        background: filters.tab === tab ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'rgba(107,114,128,0.1)',
                        color: filters.tab === tab ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
                      }}>
                        {tabStats[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

          </div>

          {/* Search + filter toggle */}
          <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search name, email, phone…"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
                style={{
                  width: '100%', padding: '7px 12px 7px 32px', borderRadius: 8, fontSize: '0.82rem',
                  background: 'var(--surface-card, #fff)',
                  border: '1.5px solid var(--line)',
                  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box', transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            <ViewToggle view={view} setView={setView} />

            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                background: showFilters || hasFilters ? 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)' : 'transparent',
                border: `1.5px solid ${showFilters || hasFilters ? 'color-mix(in srgb, var(--color-primary-500) 35%, transparent)' : 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'}`,
                color: showFilters || hasFilters ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
              }}
            >
              <Filter size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%', fontSize: '0.6rem', fontWeight: 800,
                  background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
                }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div style={{
              padding: '12px 16px 14px',
              borderTop: '1px solid var(--line)',
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            }}>
              {staffSide && (
                <select value={filters.role ?? ''} onChange={e => setFilter('role', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
                  <option value="">All roles</option>
                  {(roles?.staff ?? []).map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              )}

              {showStaffTab && departments?.length > 0 && (
                <select value={filters.department ?? ''} onChange={e => setFilter('department', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
                  <option value="">All departments</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}

              <select value={filters.status ?? ''} onChange={e => setFilter('status', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
                <option value="">All statuses</option>
                {Object.entries(STATUS_STYLES).map(([v]) => (
                  <option key={v} value={v} style={{ textTransform: 'capitalize' }}>{v.replace('_', ' ')}</option>
                ))}
              </select>

              {[
                { key: 'locked',     label: 'Locked'     },
                { key: 'unverified', label: 'Unverified' },
                { key: 'trashed',     label: 'Trash'      },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFilter(key, !filters[key])} style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                  background: filters[key] ? 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' : 'transparent',
                  border: `1.5px solid ${filters[key] ? 'color-mix(in srgb, var(--color-primary-500) 35%, transparent)' : 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'}`,
                  color: filters[key] ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
                }}>
                  {label}
                </button>
              ))}

              {hasFilters && (
                <button onClick={resetFilters} style={{
                  fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-tertiary)',
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

        {/* ── Bulk bar ── */}
        {selectedIds.length > 0 && (() => {
          const emailCount = selectedUsers.filter(u => !u.email_verified_at).length;
          const phoneCount = selectedUsers.filter(u => u.phone && !u.phone_verified_at).length;
          const pill = (bg, color) => ({ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: bg, color });
          return (
            <div role="region" aria-label="Bulk actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', boxShadow: '0 0 0 1px rgba(245,158,11,0.25)' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b45309' }}>{selectedIds.length} selected</span>
              <span style={{ flex: 1 }} />
              {emailCount > 0 && <button type="button" onClick={handleBulkVerifyEmail} style={pill('rgba(8,145,178,0.12)', '#0e7490')}><CheckCircle size={12} /> Verify {emailCount} email{emailCount !== 1 ? 's' : ''}</button>}
              {phoneCount > 0 && <button type="button" onClick={handleBulkVerifyPhone} style={pill('rgba(5,150,105,0.12)', '#065f46')}><CheckCircle size={12} /> Verify {phoneCount} phone{phoneCount !== 1 ? 's' : ''}</button>}
              <button type="button" onClick={() => exportUsers(selectedUsers, filters.tab)} style={pill('var(--surface-input)', 'var(--text-primary)')}><Download size={12} /> Export</button>
              {filters.trashed
                ? <button type="button" onClick={handleBulkRestore} style={pill('rgba(5,150,105,0.12)', '#065f46')}><RotateCcw size={12} /> Restore</button>
                : <button type="button" onClick={handleBulkDelete} style={pill('rgba(239,68,68,0.1)', '#b91c1c')}><Trash2 size={12} /> Delete</button>}
              <button type="button" onClick={() => setSelectedIds([])} style={pill('transparent', 'var(--text-tertiary)')}>Clear</button>
            </div>
          );
        })()}

        {/* ── Table or cards ── */}
        <div style={view === 'cards' ? undefined : { ...card, overflow: 'hidden' }}>
          {view === 'cards' ? (
            loading ? <p style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Loading…</p> : users.length === 0 ? (
              <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No users found</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'stretch' }}>
                {users.map((user) => {
                  const locked = isLocked(user);
                  return (
                    <UserCard key={user.id} user={user} locked={locked} columns={columns} selected={selectedIds.includes(user.id)} onToggle={() => toggleSelect(user.id)} navigate={navigate}
                      menu={user.manageable && (
                        <ActionMenu user={user} isLocked={locked}
                          onView={() => navigate(`/admin/users/${user.id}`)}
                          onStatusChange={(status) => handleStatusChange(user.id, status)}
                          onUnlock={() => handleUnlock(user.id)}
                          onForceReset={() => handleForceReset(user.id)}
                          onDelete={() => handleDelete(user.id)}
                          onRestore={() => handleRestore(user.id)} />
                      )} />
                  );
                })}
              </div>
            )
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-card, #fff)' }}>
                  <th style={{ padding: '10px 16px', width: 44 }}>
                    <input type="checkbox" aria-label="Select all" checked={selectedIds.length === users.length && users.length > 0} onChange={toggleSelectAll}
                      style={{ accentColor: 'var(--color-primary-500)', width: 15, height: 15, cursor: 'pointer' }} />
                  </th>
                  <th style={{ padding: '10px 20px', textAlign: 'left', minWidth: 240 }}><TH_LABEL>User</TH_LABEL></th>
                  {columns.map((k) => (
                    <th key={k} style={{ padding: '10px 16px', textAlign: RIGHT_COLUMNS.includes(k) ? 'right' : 'left', minWidth: k === 'flags' ? 170 : 90 }}><TH_LABEL>{COLUMN_LABELS[k]}</TH_LABEL></th>
                  ))}
                  <th style={{ padding: '10px 16px', width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : users.length === 0
                    ? (
                      <tr>
                        <td colSpan={columns.length + 3} style={{ padding: '64px 24px', textAlign: 'center' }}>
                          <Users size={36} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', margin: '0 auto 12px', display: 'block' }} />
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>No users found</p>
                          {hasFilters && <button onClick={resetFilters} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear filters</button>}
                        </td>
                      </tr>
                    )
                    : users.map((user, i) => {
                      const locked = isLocked(user);
                      const picked = selectedIds.includes(user.id);
                      return (
                        <tr key={user.id}
                          style={{ borderBottom: i === users.length - 1 ? 'none' : '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)', transition: 'background 120ms', opacity: user.deleted_at ? 0.6 : 1, background: picked ? 'rgba(245,158,11,0.07)' : 'transparent' }}
                          onMouseEnter={e => { if (!picked) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = picked ? 'rgba(245,158,11,0.07)' : 'transparent'; }}>
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" aria-label={`Select ${user.name}`} checked={picked} onChange={() => toggleSelect(user.id)} style={{ accentColor: 'var(--color-primary-500)', width: 15, height: 15, cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '12px 20px', cursor: 'pointer' }} onClick={() => navigate(`/admin/users/${user.id}`)}><UserIdentity user={user} /></td>
                          {columns.map((k) => <td key={k} style={{ padding: '12px 16px', textAlign: RIGHT_COLUMNS.includes(k) ? 'right' : 'left' }}>{cellFor(k, user, locked)}</td>)}
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            {user.manageable && (
                              <ActionMenu user={user} isLocked={locked}
                                onView={() => navigate(`/admin/users/${user.id}`)}
                                onStatusChange={(status) => handleStatusChange(user.id, status)}
                                onUnlock={() => handleUnlock(user.id)}
                                onForceReset={() => handleForceReset(user.id)}
                                onDelete={() => handleDelete(user.id)}
                                onRestore={() => handleRestore(user.id)} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          )}

          {/* ── Pagination ── */}
          {!loading && users.length > 0 && pagination.last_page > 1 && (
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface-card, #fff)',
            }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>
                Page {pagination.current_page} of {pagination.last_page} — {pagination.total?.toLocaleString()} users
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setFilter('page', pagination.current_page - 1)}
                  disabled={pagination.current_page <= 1}
                  style={{
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 8, cursor: pagination.current_page <= 1 ? 'not-allowed' : 'pointer',
                    border: '1.5px solid var(--line)', background: 'none',
                    color: 'var(--color-primary-500)', opacity: pagination.current_page <= 1 ? 0.3 : 1, transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (pagination.current_page > 1) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'; }}
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
                        background: isActive ? 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' : 'none',
                        border: isActive ? 'none' : '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
                        color: isActive ? 'white' : 'var(--text-tertiary)',
                        boxShadow: isActive ? '0 2px 8px color-mix(in srgb, var(--color-primary-500) 30%, transparent)' : 'none',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'; }}
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
                    border: '1.5px solid var(--line)', background: 'none',
                    color: 'var(--color-primary-500)', opacity: pagination.current_page >= pagination.last_page ? 0.3 : 1, transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (pagination.current_page < pagination.last_page) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'; }}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {showCreateModal && (
          <CreateUserModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => { setShowCreateModal(false); fetchUsers(); fetchStatistics(); }}
          />
        )}
        {devNotesOpen && <UsersDevNotesModal onClose={() => setDevNotesOpen(false)} />}
      </div>
    </AdminLayout>
  );
}