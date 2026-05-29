import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, Search, Filter, MoreHorizontal,
  Shield, ShieldAlert, Lock, Unlock, Info, ExternalLink, Upload,
  KeyRound, UserX, UserCheck, Trash2, RotateCcw,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Eye,
  ArrowUpDown, ChevronDown, ChevronUp, Building2,
} from 'lucide-react';
import useUsersStore from '../../../store/usersStore';
import { useAuthStore } from '../../../store';
import toast from 'react-hot-toast';
import CreateUserModal from './components/CreateUserModal';
import AdminLayout from '../../../components/layout/AdminLayout';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_META = {
  super_admin: { label: 'Super Admin', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  ring: 'rgba(124,58,237,0.25)' },
  admin:       { label: 'Admin',       color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   ring: 'rgba(37,99,235,0.25)'  },
  manager:     { label: 'Manager',     color: '#0891b2', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.25)'  },
  sales_rep:   { label: 'Sales Rep',   color: '#059669', bg: 'rgba(5,150,105,0.1)',   ring: 'rgba(5,150,105,0.25)'  },
  customer:    { label: 'Customer',    color: '#d97706', bg: 'rgba(217,119,6,0.1)',   ring: 'rgba(217,119,6,0.25)'  },
};

const STATUS_STYLES = {
  active:               { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)'  },
  inactive:             { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)'  },
  suspended:            { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
  pending_verification: { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
};

const STAT_META = [
  { key: 'total',     label: 'Total users',  icon: <Users size={18} />,       accent: '#2563eb', bg: 'rgba(37,99,235,0.08)'   },
  { key: 'staff',     label: 'Staff',        icon: <Shield size={18} />,      accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)'  },
  { key: 'active',    label: 'Active',       icon: <CheckCircle size={18} />, accent: '#059669', bg: 'rgba(5,150,105,0.08)'   },
  { key: 'suspended', label: 'Suspended',    icon: <ShieldAlert size={18} />, accent: '#dc2626', bg: 'rgba(220,38,38,0.08)'   },
  { key: 'locked',    label: 'Locked',       icon: <Lock size={18} />,        accent: '#d97706', bg: 'rgba(217,119,6,0.08)'   },
  { key: 'customers', label: 'Customers',    icon: <UserCheck size={18} />,   accent: '#0891b2', bg: 'rgba(8,145,178,0.08)'   },
];

const STAFF_ROLES = ['admin', 'manager', 'sales_rep'];
const LEVELS = { super_admin: 1, admin: 2, manager: 3, sales_rep: 4, customer: 5 };
const PER_PAGE_OPTIONS = [10, 20, 50];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

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
        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em' }}>{value ?? 0}</p>
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
    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
      {/* Checkbox */}
      <td style={{ padding: '12px 16px', width: 44 }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(168,85,247,0.08)' }} />
      </td>
      {/* User cell */}
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(168,85,247,0.08)', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: 120, height: 11, borderRadius: 6, background: 'rgba(168,85,247,0.08)' }} />
            <div style={{ width: 160, height: 9, borderRadius: 6, background: 'rgba(168,85,247,0.05)' }} />
          </div>
        </div>
      </td>
      {[80, 70, 64, 90, 60, 0].map((w, j) => (
        <td key={j} style={{ padding: '12px 16px' }}>
          {w > 0 && <div style={{ width: w, height: 10, borderRadius: 6, background: 'rgba(168,85,247,0.06)' }} />}
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
      null, // divider
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
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 200, zIndex: 20,
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

// ─── USERS SYSTEM DEV NOTES ──────────────────────────────────────────────────
const USERS_DEV_NOTES = {
  pitfalls: [
    {
      title: "generateCustomerNumber() has a race condition",
      severity: "critical",
      detail: "The pattern Customer::withTrashed()->max('id') + 1 is used in 3 separate places (AuthController, UserController::store, handleRoleTransition). Two concurrent registrations can read the same max(id) and generate the same customer number. There is no atomic guarantee. Also, the CUST-YEAR prefix means CUST-2025-0015 and CUST-2026-0015 can coexist, which may confuse customer service.",
      outcome: "Duplicate customer numbers under load. Fix: add a unique constraint on customer_number and use a retry loop, or replace with a DB auto-increment sequence or UUID.",
    },
    {
      title: "OAuthController::handleProviderCallback() has no DB transaction",
      severity: "critical",
      detail: "The callback creates User, Customer, and ReferralCode in three sequential inserts with no DB::beginTransaction() wrapper. If Customer::create() succeeds but ReferralCode::createForCustomer() throws (e.g. unique code collision), the user exists in a broken half-created state with no rollback.",
      outcome: "Orphaned users with no customer record on OAuth registration failures. Wrap the entire new-user branch in a transaction — AuthController::register() already does this correctly and is the model to follow.",
    },
    {
      title: "EmployeePolicy::update() grants managers unrestricted access without a model",
      severity: "critical",
      detail: "The manager branch falls through to return true when $employee is null. The parameter has a nullable default (Employee $employee = null), so any code path that calls the policy gate without passing the model instance silently authorises any manager to update any employee. The same nullable default appears on delete(), restore(), view(), and manageStatus().",
      outcome: "Potential privilege escalation if any route binds the policy gate without the model. Audit all ->authorize('update', ...) calls to confirm the Employee instance is always passed.",
    },
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
      detail: "When a customer is converted to a staff role, their customer record is soft-deleted including referral codes, usage history, and store credit. No warning is shown, no confirmation required. Reversing the transition (staff back to customer) restores everything — which is correct but surprising.",
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
      detail: "Account lock is checked before password verification. Password is verified before any soft-deleted account is restored. force_password_change is intercepted before a token is issued. canLogin() is evaluated before any database writes. The order matters and it's right.",
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
      title: "Role-based tab filtering mirrors the backend hierarchy",
      detail: "The tab system (staff / finance / logistics / drivers / customers / vendors) maps cleanly to the backend's role-gated query. The frontend LEVELS constant mirrors UserPolicy::$hierarchy, so canManage() in the UI reflects the same rules as the policy gate.",
    },
  ],
  future: [
    {
      title: "Rate limiting on auth endpoints",
      detail: "recordFailedLogin() tracks attempts and isLocked() blocks after threshold, but there is no middleware-level rate limiting on /login, /register, or /forgot-password. A high-volume distributed attack would flood failed_login_attempts before per-account locking triggers. Add Laravel's ThrottleRequests middleware with tight limits on auth routes.",
      horizon: "near",
    },
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

const USEV = { critical: "#ef4444", warning: "#f59e0b", low: "#a855f7" };
const UHOV = { near: "#06b6d4", medium: "#f59e0b", long: "#a855f7" };

function UsersDevNotesModal({ onClose }) {
  const [tab, setTab] = useState("pitfalls");

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(168,85,247,0.18), 0 4px 20px rgba(0,0,0,0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#a855f7" }}>
              // dev notes — users system
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>
            covers auth · oauth · customers · employees · user policy · employee policy
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

          {tab === "pitfalls" && USERS_DEV_NOTES.pitfalls.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: `1px solid ${USEV[n.severity]}2a`, background: `${USEV[n.severity]}07` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: USEV[n.severity], background: `${USEV[n.severity]}18`, padding: "2px 7px", borderRadius: 3 }}>{n.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.65, marginBottom: 6 }}>{n.detail}</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>
                <span style={{ color: "#6b7280" }}>→ outcome: </span>{n.outcome}
              </div>
            </div>
          ))}

          {tab === "strengths" && USERS_DEV_NOTES.strengths.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid #a855f722", background: "#a855f705" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a855f7", marginBottom: 6 }}>✓ {n.title}</div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}

          {tab === "future" && USERS_DEV_NOTES.future.map((n, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: UHOV[n.horizon], background: `${UHOV[n.horizon]}18`, padding: "2px 7px", borderRadius: 3 }}>{n.horizon}-term</span>
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

export default function UsersPage() {
  const navigate = useNavigate();
  const { user: currentAdmin } = useAuthStore();

  const {
    users, statistics, departments, pagination, filters,
    loading, actionLoading,
    fetchUsers, fetchStatistics, fetchDepartments,
    setFilter, setTab, resetFilters,
    deleteUser, restoreUser, updateStatus,
    unlockUser, forcePasswordReset, bulkDelete, bulkRestore,
  } = useUsersStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIds,     setSelectedIds]     = useState([]);
  const [showFilters,     setShowFilters]     = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [devNotesOpen, setDevNotesOpen] = useState(false);

  useEffect(() => { fetchStatistics(); fetchDepartments(); }, []);
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

  const isLocked  = (user) => user.locked_until && new Date(user.locked_until) > new Date();
  const canManage = (targetRole) => (LEVELS[currentAdmin?.role] || 99) < (LEVELS[targetRole] || 99);

  const hasFilters = filters.search || filters.role || filters.status || filters.department || filters.locked || filters.unverified || filters.trashed;
  const activeFilterCount = [filters.role, filters.status, filters.department, filters.locked && 'locked', filters.unverified && 'unverified', filters.trashed && 'trashed'].filter(Boolean).length;

  return (
    <AdminLayout>
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
            Users
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            {statistics?.total?.toLocaleString() ?? 0} total users
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setDevNotesOpen(true)}
          style={{
            padding: '9px 16px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 700,
            border: '1.5px solid rgba(168,85,247,0.3)', cursor: 'pointer',
            background: 'transparent', color: '#a855f7', fontFamily: 'monospace',
          }}
        >
          // dev
        </button>
        
        {/* New user button — customers self-register, so show info popover */}
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
            <UserPlus size={15} /> New user
          </button>

          {showInfo && (
            <div
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 300, zIndex: 30,
                background: 'white', borderRadius: 12, padding: 16,
                border: '1.5px solid rgba(168,85,247,0.2)',
                boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
              }}
            >
              {/* Top — explanation */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <Info size={16} style={{ color: '#a855f7', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                    Customers can't be created by admins
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
                    Customers register themselves or can be added in bulk via a manual import. No admin of any role can create a customer account directly.
                  </p>
                </div>
              </div>

              {/* Import hint */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(168,85,247,0.04)',
                border: '1px solid rgba(168,85,247,0.12)',
              }}>
                <Upload size={13} style={{ color: '#a855f7', flexShrink: 0 }} />
                <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                  Need to add many customers at once?{' '}
                  <span style={{ color: '#7c3aed', fontWeight: 600 }}>Use the import tool</span> on the Customers tab.
                </p>
              </div>

              {/* Divider + employee CTA */}
              <div style={{ borderTop: '1px solid rgba(168,85,247,0.1)', paddingTop: 12 }}>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 8px' }}>
                  Looking to add a staff member instead?
                </p>
                <button
                  onClick={() => navigate('/admin/employees/create')}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 8,
                    fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                    boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
                  }}
                >
                  Create new employee <ExternalLink size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
        </div></div>
      </div>

      {/* ── Stat cards ── */}
      {statistics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {STAT_META.map(({ key, label, icon, accent, bg }) => (
            <StatCard key={key} icon={icon} label={label} value={statistics[key]?.toLocaleString()} accent={accent} bg={bg} />
          ))}
        </div>
      )}

      {/* ── Tabs + search + filters ── */}
      <div style={card}>

        {/* Tab bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid rgba(168,85,247,0.1)',
        }}>
          <div style={{ display: 'flex' }}>
            {['staff', 'customers'].map(tab => (
              <button key={tab} onClick={() => setTab(tab)} style={{
                padding: '12px 18px', fontSize: '0.82rem', fontWeight: filters.tab === tab ? 700 : 500,
                color: filters.tab === tab ? '#a855f7' : '#9ca3af',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                borderBottom: `2px solid ${filters.tab === tab ? '#a855f7' : 'transparent'}`,
                marginBottom: -1, textTransform: 'capitalize', transition: 'color 150ms',
              }}>
                {tab === 'staff' ? 'Staff' : 'Customers'}
                {statistics && (
                  <span style={{
                    marginLeft: 7, padding: '1px 7px', borderRadius: 99,
                    fontSize: '0.65rem', fontWeight: 700,
                    background: filters.tab === tab ? 'rgba(168,85,247,0.12)' : 'rgba(107,114,128,0.1)',
                    color: filters.tab === tab ? '#7c3aed' : '#9ca3af',
                  }}>
                    {tab === 'staff' ? statistics.staff : statistics.customers}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{selectedIds.length} selected</span>
              {filters.trashed ? (
                <button onClick={handleBulkRestore} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'rgba(5,150,105,0.1)', color: '#065f46',
                }}>
                  <RotateCcw size={12} /> Restore
                </button>
              ) : (
                <button onClick={handleBulkDelete} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                }}>
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search + filter toggle */}
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#c4b5fd', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search name, email, phone…"
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

        {/* Expanded filters */}
        {showFilters && (
          <div style={{
            padding: '12px 16px 14px',
            borderTop: '1px solid rgba(168,85,247,0.1)',
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            {filters.tab === 'staff' && (
              <select value={filters.role ?? ''} onChange={e => setFilter('role', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
                <option value="">All roles</option>
                {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
              </select>
            )}

            {filters.tab === 'staff' && departments?.length > 0 && (
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

            {/* Toggle pills */}
            {[
              { key: 'locked',     label: 'Locked'     },
              { key: 'unverified', label: 'Unverified' },
              { key: 'trashed',    label: 'Trash'      },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key, !filters[key])} style={{
                padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                background: filters[key] ? 'rgba(168,85,247,0.1)' : 'transparent',
                border: `1.5px solid ${filters[key] ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.18)'}`,
                color: filters[key] ? '#7c3aed' : '#9ca3af',
              }}>
                {label}
              </button>
            ))}

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
                {/* Checkbox */}
                <th style={{ padding: '10px 16px', width: 44 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === users.length && users.length > 0}
                    onChange={toggleSelectAll}
                    style={{ accentColor: '#a855f7', width: 15, height: 15, cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 20px', textAlign: 'left', minWidth: 220 }}>
                  <TH_LABEL>User</TH_LABEL>
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 110 }}>
                  <TH_LABEL>{filters.tab === 'staff' ? 'Department' : 'Company'}</TH_LABEL>
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 110 }}>
                  <TH_LABEL>Role</TH_LABEL>
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 100 }}>
                  <TH_LABEL>Status</TH_LABEL>
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 130 }}>
                  <TH_LABEL>Last login</TH_LABEL>
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 140 }}>
                  <TH_LABEL>Flags</TH_LABEL>
                </th>
                <th style={{ padding: '10px 16px', width: 44 }} />
              </tr>
            </thead>

            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)

                : users.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '64px 24px', textAlign: 'center' }}>
                        <Users size={36} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '0 0 8px' }}>No users found</p>
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

                  : users.map((user, i) => {
                      const rm     = ROLE_META[user.role]     ?? ROLE_META.customer;
                      const st     = STATUS_STYLES[user.status] ?? STATUS_STYLES.inactive;
                      const locked = isLocked(user);
                      const isLast = i === users.length - 1;

                      return (
                        <tr
                          key={user.id}
                          style={{
                            borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                            transition: 'background 120ms',
                            opacity: user.deleted_at ? 0.6 : 1,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >

                          {/* Checkbox */}
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(user.id)}
                              onChange={() => toggleSelect(user.id)}
                              style={{ accentColor: '#a855f7', width: 15, height: 15, cursor: 'pointer' }}
                            />
                          </td>

                          {/* User */}
                          <td style={{ padding: '12px 20px', cursor: 'pointer' }} onClick={() => navigate(`/admin/users/${user.id}`)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              <img
                                src={
                                  user.role === 'customer'
                                    ? (user.customer?.profile_image_url || user.profile_picture_url)
                                    : user.profile_picture_url
                                }
                                alt={user.name}
                                style={{
                                  width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
                                  flexShrink: 0, background: 'rgba(168,85,247,0.08)', display: 'block',
                                }}
                              />
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {user.name}
                                </p>
                                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {user.email}
                                </p>
                                {user.phone && (
                                  <p style={{ fontSize: '0.65rem', color: '#c4b5fd', fontFamily: 'monospace', margin: 0 }}>
                                    {user.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Department / Company */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                              {filters.tab === 'staff' ? (user.department || '—') : (user.company_name || '—')}
                            </span>
                          </td>

                          {/* Role */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={rm.bg} color={rm.color} ring={rm.ring}>
                              {rm.label}
                            </Badge>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={st.bg} color={st.color} ring={st.ring}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                              {user.status?.replace('_', ' ') ?? 'unknown'}
                            </Badge>
                          </td>

                          {/* Last login */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '0.75rem', color: user.last_login_at ? '#374151' : '#d1d5db' }}>
                              {fmtDate(user.last_login_at)}
                            </span>
                            {user.last_login_at && (
                              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '1px 0 0' }}>
                                {new Date(user.last_login_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </td>

                          {/* Flags */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {locked && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '2px 7px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
                                  background: 'rgba(245,158,11,0.1)', color: '#b45309',
                                  boxShadow: '0 0 0 1px rgba(245,158,11,0.25)',
                                }}>
                                  <Lock size={9} /> Locked
                                </span>
                              )}
                              {user.force_password_change && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '2px 7px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
                                  background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                                  boxShadow: '0 0 0 1px rgba(239,68,68,0.2)',
                                }}>
                                  <KeyRound size={9} /> Pwd reset
                                </span>
                              )}
                              {!user.email_verified_at && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '2px 7px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
                                  background: 'rgba(107,114,128,0.08)', color: '#6b7280',
                                  boxShadow: '0 0 0 1px rgba(107,114,128,0.2)',
                                }}>
                                  <AlertCircle size={9} /> Unverified
                                </span>
                              )}
                              {user.deleted_at && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '2px 7px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
                                  background: 'rgba(239,68,68,0.07)', color: '#b91c1c',
                                  boxShadow: '0 0 0 1px rgba(239,68,68,0.15)',
                                }}>
                                  <Trash2 size={9} /> Deleted
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Action */}
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            {canManage(user.role) && (
                              <ActionMenu
                                user={user}
                                isLocked={locked}
                                onView={() => navigate(`/admin/users/${user.id}`)}
                                onStatusChange={(status) => handleStatusChange(user.id, status)}
                                onUnlock={() => handleUnlock(user.id)}
                                onForceReset={() => handleForceReset(user.id)}
                                onDelete={() => handleDelete(user.id)}
                                onRestore={() => handleRestore(user.id)}
                              />
                            )}
                          </td>

                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && users.length > 0 && pagination.last_page > 1 && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(168,85,247,0.02)',
          }}>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
              Page {pagination.current_page} of {pagination.last_page} — {pagination.total?.toLocaleString()} users
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