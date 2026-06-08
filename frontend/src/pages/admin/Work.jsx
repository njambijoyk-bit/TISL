import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Users, ShoppingBag, FileText, FolderOpen,
  MessageSquareQuote, AlertTriangle, CalendarClock, Activity,
  ArrowRight, Loader2, RefreshCw, Bell, Calendar,
  CheckSquare, Milestone, Ticket,
} from 'lucide-react';
import toast from 'react-hot-toast';
import NotificationsModal from '../../components/common/NotificationsModal';
import SettingsLayout from '../../components/layout/SettingsLayout';
import WorkTimetable from '../../components/timetable/WorkTimetable';
import workAPI from '../../api/work';
import { useAuthStore } from '../../store';

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'load',       label: 'Team Load',  icon: Users         },
  { id: 'unassigned', label: 'Unassigned', icon: AlertTriangle },
  { id: 'deadlines',  label: 'Deadlines',  icon: CalendarClock },
  { id: 'activity',   label: 'Activity',   icon: Activity      },
];

// ── Shared style objects ──────────────────────────────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 14px', borderRadius: 10,
  background: 'rgba(168,85,247,0.02)',
  border: '1px solid rgba(168,85,247,0.07)',
  textDecoration: 'none', transition: 'background 120ms, border-color 120ms',
  cursor: 'pointer',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
};

const urgencyColor = (days) =>
  days === null ? '#9ca3af' : days <= 3 ? '#dc2626' : days <= 7 ? '#ea580c' : '#ca8a04';

const urgencyDotColor = (days) =>
  days === null ? '#d1d5db' : days <= 3 ? '#ef4444' : days <= 7 ? '#f97316' : '#eab308';

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent, bg }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: accent, flexShrink: 0,
      }}>
        <Icon size={18} />
      </div>
      <div>
        <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7', margin: '0 0 2px', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
          {label}
        </p>
      </div>
    </div>
  );
}

function Row({ to, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      style={{
        ...rowStyle,
        background: hovered ? 'rgba(168,85,247,0.05)' : 'rgba(168,85,247,0.02)',
        borderColor: hovered ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.07)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </Link>
  );
}

const TYPE_ICON_META = {
  order:         { accent: '#ea580c', bg: 'rgba(234,88,12,0.1)',   Icon: ShoppingBag        },
  quote:         { accent: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  Icon: FileText           },
  quote_request: { accent: '#be185d', bg: 'rgba(190,24,93,0.1)',   Icon: MessageSquareQuote },
  project:       { accent: '#059669', bg: 'rgba(5,150,105,0.1)',   Icon: FolderOpen         },
  task:          { accent: '#0d9488', bg: 'rgba(13,148,136,0.1)',  Icon: CheckSquare        },
  milestone:     { accent: '#4338ca', bg: 'rgba(67,56,202,0.1)',   Icon: Milestone          },
  ticket:        { accent: '#0891b2', bg: 'rgba(8,145,178,0.1)',   Icon: Ticket             },
  booking:       { accent: '#db2777', bg: 'rgba(219,39,119,0.1)',  Icon: Calendar           },
};

function TypeIcon({ type }) {
  const cfg = TYPE_ICON_META[type] ?? { accent: '#9ca3af', bg: 'rgba(156,163,175,0.1)', Icon: Briefcase };
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: cfg.bg, color: cfg.accent,
    }}>
      <cfg.Icon size={13} />
    </div>
  );
}

function RowTitle({ children }) {
  return (
    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </p>
  );
}
function RowSub({ children }) {
  return (
    <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </p>
  );
}

function Section({ title, icon: Icon, children, alert = false }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Icon size={14} style={{ color: alert ? '#ef4444' : '#a855f7', flexShrink: 0 }} />
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: alert ? '#dc2626' : '#111827', margin: 0 }}>
          {title}
        </h3>
        {alert && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0,
            boxShadow: '0 0 0 3px rgba(239,68,68,0.2)',
            animation: 'pulse 1.5s infinite',
          }} />
        )}
      </div>
      {children}
    </div>
  );
}

const STATUS_COLORS = {
  active:           { bg: 'rgba(16,185,129,0.1)',  color: '#065f46' },
  delivered:        { bg: 'rgba(16,185,129,0.1)',  color: '#065f46' },
  approved:         { bg: 'rgba(16,185,129,0.1)',  color: '#065f46' },
  done:             { bg: 'rgba(16,185,129,0.1)',  color: '#065f46' },
  resolved:         { bg: 'rgba(16,185,129,0.1)',  color: '#065f46' },
  pending:          { bg: 'rgba(234,179,8,0.1)',   color: '#854d0e' },
  planning:         { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  converted:        { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  doing:            { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  in_progress:      { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  todo:             { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' },
  draft:            { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' },
  closed:           { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' },
  blocked:          { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c' },
  on_hold:          { bg: 'rgba(234,88,12,0.1)',   color: '#9a3412' },
  open:             { bg: 'rgba(234,179,8,0.1)',   color: '#854d0e' },
  waiting_customer: { bg: 'rgba(234,88,12,0.1)',   color: '#9a3412' },
  confirmed:        { bg: 'rgba(16,185,129,0.1)',  color: '#065f46' },
  assigned:         { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  accepted:         { bg: 'rgba(5,150,105,0.1)',   color: '#065f46' },
  declined:         { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c' },
  cancelled:        { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' },
  no_show:          { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c' },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] ?? { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      flexShrink: 0, whiteSpace: 'nowrap', textTransform: 'capitalize',
      background: s.bg, color: s.color,
    }}>
      {status?.replace('_', ' ')}
    </span>
  );
}

const PRIORITY_COLORS = {
  urgent: { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c' },
  high:   { bg: 'rgba(234,88,12,0.1)',   color: '#9a3412' },
  medium: { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  low:    { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' },
};

function PriorityPill({ priority }) {
  const p = PRIORITY_COLORS[priority] ?? { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      flexShrink: 0, whiteSpace: 'nowrap', textTransform: 'capitalize',
      background: p.bg, color: p.color,
    }}>
      {priority}
    </span>
  );
}

const ROLE_COLORS = {
  super_admin: { bg: 'rgba(168,85,247,0.1)',  color: '#6d28d9' },
  admin:       { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  manager:     { bg: 'rgba(13,148,136,0.1)',  color: '#0d5c55' },
  sales_rep:   { bg: 'rgba(5,150,105,0.1)',   color: '#065f46' },
};

function RolePill({ role }) {
  const r = ROLE_COLORS[role] ?? { bg: 'rgba(107,114,128,0.1)', color: '#4b5563' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700,
      background: r.bg, color: r.color, whiteSpace: 'nowrap',
    }}>
      {role?.replace('_', ' ')}
    </span>
  );
}

const LOAD_PILL_COLORS = {
  blue:   { bg: 'rgba(37,99,235,0.1)',   color: '#1e40af' },
  green:  { bg: 'rgba(5,150,105,0.1)',   color: '#065f46' },
  orange: { bg: 'rgba(234,88,12,0.1)',   color: '#9a3412' },
  purple: { bg: 'rgba(124,58,237,0.1)',  color: '#5b21b6' },
  pink:   { bg: 'rgba(190,24,93,0.1)',   color: '#9d174d' },
  teal:   { bg: 'rgba(13,148,136,0.1)',  color: '#0d5c55' },
  indigo: { bg: 'rgba(67,56,202,0.1)',   color: '#312e81' },
  cyan:   { bg: 'rgba(8,145,178,0.1)',   color: '#155e75' },
};

function LoadPill({ icon: Icon, label, value, color }) {
  if (!value && value !== 0) return null;
  const c = LOAD_PILL_COLORS[color] ?? LOAD_PILL_COLORS.blue;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600,
      background: c.bg, color: c.color,
    }}>
      <Icon size={11} />
      {value} {label}
    </span>
  );
}

function EmptyState({ icon: Icon, message, positive = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', borderRadius: 12, gap: 8,
      background: positive ? 'rgba(5,150,105,0.04)' : 'rgba(168,85,247,0.02)',
      border: `1px solid ${positive ? 'rgba(5,150,105,0.12)' : 'rgba(168,85,247,0.07)'}`,
    }}>
      <Icon size={28} style={{ color: positive ? 'rgba(5,150,105,0.4)' : 'rgba(168,85,247,0.2)' }} />
      <p style={{ fontSize: '0.78rem', color: positive ? '#065f46' : '#9ca3af', margin: 0, fontWeight: 500 }}>
        {message}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Work() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('load');
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState(null);
  const [refreshHover, setRefreshHover] = useState(false);
  const [showTimetable, setShowTimetable] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => { fetchOverview(); }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await workAPI.teamOverview();
      setData(res);
    } catch {
      toast.error('Failed to load work overview');
    } finally {
      setLoading(false);
    }
  };

  const unassignedTotal =
    (data?.unassigned?.counts?.orders        || 0) +
    (data?.unassigned?.counts?.quotes        || 0) +
    (data?.unassigned?.counts?.quoteRequests || 0) +
    (data?.unassigned?.counts?.tasks         || 0) +
    (data?.unassigned?.counts?.bookings      || 0);+
    (data?.unassigned?.counts?.tickets       || 0);

  const STAT_CARDS = [
    {
      label: 'Staff Members',
      value: data?.team_load?.length || 0,
      icon:  Users,
      accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)',
    },
    {
      label: 'Unassigned Items',
      value: unassignedTotal,
      icon:  AlertTriangle,
      accent: unassignedTotal > 0 ? '#dc2626' : '#059669',
      bg:     unassignedTotal > 0 ? 'rgba(220,38,38,0.08)' : 'rgba(5,150,105,0.08)',
    },
    {
      label: 'Unassigned Tasks',
      value: data?.unassigned?.counts?.tasks || 0,
      icon:  CheckSquare,
      accent: (data?.unassigned?.counts?.tasks || 0) > 0 ? '#ea580c' : '#059669',
      bg:     (data?.unassigned?.counts?.tasks || 0) > 0 ? 'rgba(234,88,12,0.08)' : 'rgba(5,150,105,0.08)',
    },
    {
      label: 'Unassigned Tickets',
      value: data?.unassigned?.counts?.tickets || 0,
      icon:  Ticket,
      accent: (data?.unassigned?.counts?.tickets || 0) > 0 ? '#dc2626' : '#059669',
      bg:     (data?.unassigned?.counts?.tickets || 0) > 0 ? 'rgba(220,38,38,0.08)' : 'rgba(5,150,105,0.08)',
    },
  ];

  return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)', color: 'white',
            }}>
              <Briefcase size={18} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
                Work Overview
              </h1>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
                Team assignments, workload &amp; deadlines
              </p>
            </div>
          </div>
        </div>

          <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowNotifications(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
              border: '1.5px solid rgba(168,85,247,0.2)',
              background: 'white', color: '#7c3aed',
              transition: 'background 150ms',
              boxShadow: '0 1px 6px rgba(168,85,247,0.08)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <Bell size={13} />
            Notifications
          </button>
          <button
            onClick={() => setShowTimetable(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
              border: '1.5px solid rgba(168,85,247,0.2)',
              background: 'white', color: '#7c3aed',
              transition: 'background 150ms',
              boxShadow: '0 1px 6px rgba(168,85,247,0.08)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}
          >
            <CalendarClock size={13} />
            Timetable
          </button>
          <button
            onClick={fetchOverview}
            disabled={loading}
            onMouseEnter={() => setRefreshHover(true)}
            onMouseLeave={() => setRefreshHover(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer',
              border: '1.5px solid rgba(168,85,247,0.2)',
              background: refreshHover ? 'rgba(168,85,247,0.06)' : 'white',
              color: '#7c3aed', opacity: loading ? 0.5 : 1,
              transition: 'background 150ms, border-color 150ms',
              boxShadow: '0 1px 6px rgba(168,85,247,0.08)',
            }}
          >
            <RefreshCw
              size={13}
              style={{ transition: 'transform 600ms', transform: loading ? 'rotate(360deg)' : 'none' }}
            />
            Refresh
          </button>
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '96px 0' }}>
            <Loader2 size={36} style={{ color: '#a855f7', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            {data && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {STAT_CARDS.map(({ label, value, icon, accent, bg }) => (
                  <StatCard key={label} label={label} value={value} icon={icon} accent={accent} bg={bg} />
                ))}
              </div>
            )}

            {/* ── Tab container ── */}
            <div style={{ ...card, overflow: 'hidden' }}>

              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.01)' }}>
                {TABS.map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                    <TabBtn
                      key={tab.id}
                      active={isActive}
                      icon={tab.icon}
                      label={tab.label}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  );
                })}
              </div>

              {/* Tab content */}
              <div style={{ padding: '24px' }}>

                {/* ── TEAM LOAD ── */}
                {activeTab === 'load' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 6px' }}>
                      Active work per staff member — sorted by total load.
                    </p>
                    {data?.team_load
                      ?.slice()
                      .sort((a, b) => {
                        const sum = (m) => Object.values(m.counts).reduce((s, v) => s + v, 0);
                        return sum(b) - sum(a);
                      })
                      .map((member, idx) => {
                        const total = Object.values(member.counts).reduce((s, v) => s + v, 0);
                        const totalColor = total > 10 ? '#dc2626' : total > 5 ? '#ea580c' : '#059669';
                        return (
                          <div key={idx} style={{
                            padding: '14px 16px', borderRadius: 12,
                            border: '1px solid rgba(168,85,247,0.08)',
                            background: 'rgba(168,85,247,0.02)',
                            display: 'flex', alignItems: 'flex-start', gap: 14,
                          }}>
                            {/* Avatar */}
                            <div style={{
                              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
                              fontWeight: 800, fontSize: '0.78rem',
                            }}>
                              {member.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
                                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                                  {member.user?.name}
                                </p>
                                <RolePill role={member.user?.role} />
                                {member.employee && (
                                  <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                                    {member.employee.job_title}
                                    {member.employee.department && ` · ${member.employee.department}`}
                                  </span>
                                )}
                              </div>
                              <p style={{ fontSize: '0.72rem', color: '#c4b5fd', margin: '0 0 10px' }}>
                                {member.user?.email}
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                <LoadPill icon={Users}              label="Customers"  value={member.counts.customers}     color="blue"   />
                                <LoadPill icon={FolderOpen}         label="Projects"   value={member.counts.projects}      color="green"  />
                                <LoadPill icon={ShoppingBag}        label="Orders"     value={member.counts.orders}        color="orange" />
                                <LoadPill icon={FileText}           label="Quotes"     value={member.counts.quotes}        color="purple" />
                                <LoadPill icon={MessageSquareQuote} label="Requests"   value={member.counts.quoteRequests} color="pink"   />
                                <LoadPill icon={CheckSquare}        label="Tasks"      value={member.counts.tasks}         color="teal"   />
                                <LoadPill icon={Milestone}          label="Milestones" value={member.counts.milestones}    color="indigo" />
                                <LoadPill icon={Ticket}             label="Tickets"    value={member.counts.tickets}       color="cyan"   />
                                <LoadPill icon={Calendar}           label="Bookings"   value={member.counts.bookings}      color="pink"   /> 
                              </div>
                            </div>

                            {/* Total */}
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <p style={{ fontSize: '1.35rem', fontWeight: 800, color: totalColor, margin: '0 0 1px', lineHeight: 1 }}>
                                {total}
                              </p>
                              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                total
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    {!data?.team_load?.length && <EmptyState icon={Users} message="No staff members found" />}
                  </div>
                )}

                {/* ── UNASSIGNED ── */}
                {activeTab === 'unassigned' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                      Items with no assigned staff member — assign them to prevent them falling through the cracks.
                    </p>

                    <Section title={`Unassigned Orders (${data?.unassigned?.counts?.orders || 0})`} icon={ShoppingBag} alert={data?.unassigned?.counts?.orders > 0}>
                      {data?.unassigned?.orders?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.unassigned.orders.map((o, idx) => (
                            <Row key={idx} to={`/admin/orders/${o.id}`}>
                              <TypeIcon type="order" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RowTitle>{o.order_number}</RowTitle>
                                <RowSub>{o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Unknown customer'}</RowSub>
                              </div>
                              <StatusPill status={o.status} />
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>{fmtDate(o.created_at)}</span>
                              <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            </Row>
                          ))}
                        </div>
                      ) : <EmptyState icon={ShoppingBag} message="No unassigned orders" positive />}
                    </Section>

                    <Section title={`Unassigned Quotes (${data?.unassigned?.counts?.quotes || 0})`} icon={FileText} alert={data?.unassigned?.counts?.quotes > 0}>
                      {data?.unassigned?.quotes?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.unassigned.quotes.map((q, idx) => (
                            <Row key={idx} to={`/admin/quotes/${q.id}`}>
                              <TypeIcon type="quote" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RowTitle>{q.quote_number}</RowTitle>
                                <RowSub>{q.customer ? `${q.customer.first_name} ${q.customer.last_name}` : 'Unknown customer'}</RowSub>
                              </div>
                              <StatusPill status={q.status} />
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>{fmtDate(q.created_at)}</span>
                              <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            </Row>
                          ))}
                        </div>
                      ) : <EmptyState icon={FileText} message="No unassigned quotes" positive />}
                    </Section>

                    <Section title={`Unassigned Quote Requests (${data?.unassigned?.counts?.quoteRequests || 0})`} icon={MessageSquareQuote} alert={data?.unassigned?.counts?.quoteRequests > 0}>
                      {data?.unassigned?.quoteRequests?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.unassigned.quoteRequests.map((qr, idx) => (
                            <Row key={idx} to={`/admin/quote-requests/${qr.id}`}>
                              <TypeIcon type="quote_request" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RowTitle>{qr.request_number}</RowTitle>
                                <RowSub>{qr.request_title || 'No title'}</RowSub>
                              </div>
                              <PriorityPill priority={qr.priority} />
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>{fmtDate(qr.created_at)}</span>
                              <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            </Row>
                          ))}
                        </div>
                      ) : <EmptyState icon={MessageSquareQuote} message="No unassigned quote requests" positive />}
                    </Section>

                    <Section title={`Unassigned Bookings (${data?.unassigned?.counts?.bookings || 0})`} icon={Calendar} alert={data?.unassigned?.counts?.bookings > 0}>
                      {data?.unassigned?.bookings?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.unassigned.bookings.map((b, idx) => (
                            <Row key={idx} to={`/admin/bookings/${b.id}`}>
                              <TypeIcon type="booking" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RowTitle>{b.booking_number}</RowTitle>
                                <RowSub>
                                  {b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown customer'}
                                  {b.scheduled_at && ` · ${fmtDate(b.scheduled_at)}`}
                                </RowSub>
                              </div>
                              <StatusPill status={b.status} />
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>{fmtDate(b.created_at)}</span>
                              <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            </Row>
                          ))}
                        </div>
                      ) : <EmptyState icon={Calendar} message="No unassigned bookings" positive />}
                    </Section>

                    <Section title={`Unassigned Tasks (${data?.unassigned?.counts?.tasks || 0})`} icon={CheckSquare} alert={data?.unassigned?.counts?.tasks > 0}>
                      {data?.unassigned?.tasks?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.unassigned.tasks.map((t, idx) => (
                            <Row key={idx} to={`/admin/projects/${t.project_id}`}>
                              <TypeIcon type="task" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RowTitle>{t.title}</RowTitle>
                                <RowSub>
                                  {t.project ? `${t.project.project_number} · ${t.project.title}` : 'Unknown project'}
                                  {t.due_date && ` · Due ${fmtDate(t.due_date)}`}
                                </RowSub>
                              </div>
                              <PriorityPill priority={t.priority} />
                              <StatusPill status={t.status} />
                              <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            </Row>
                          ))}
                        </div>
                      ) : <EmptyState icon={CheckSquare} message="No unassigned tasks" positive />}
                    </Section>

                    <Section title={`Unassigned Tickets (${data?.unassigned?.counts?.tickets || 0})`} icon={Ticket} alert={data?.unassigned?.counts?.tickets > 0}>
                      {data?.unassigned?.tickets?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.unassigned.tickets.map((t, idx) => (
                            <Row key={idx} to={`/admin/tickets/${t.id}`}>
                              <TypeIcon type="ticket" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RowTitle>{t.ticket_number}</RowTitle>
                                <RowSub>
                                  {t.subject}
                                  {t.customer && ` · ${t.customer.first_name} ${t.customer.last_name}`}
                                </RowSub>
                              </div>
                              <PriorityPill priority={t.priority} />
                              <StatusPill status={t.status} />
                              <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            </Row>
                          ))}
                        </div>
                      ) : <EmptyState icon={Ticket} message="No unassigned tickets" positive />}
                    </Section>
                  </div>
                )}

                {/* ── DEADLINES ── */}
                {activeTab === 'deadlines' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                      Team-wide items due within 30 days.
                    </p>

                    <Section title={`Projects (${data?.deadlines?.projects?.length || 0})`} icon={FolderOpen}>
                      {data?.deadlines?.projects?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.deadlines.projects.map((p, idx) => {
                            const days = daysUntil(p.deadline);
                            return (
                              <Row key={idx} to={p.url}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: urgencyDotColor(days) }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <RowTitle>{p.label}</RowTitle>
                                  <RowSub>{p.customer && `${p.customer} · `}{p.owner && `Owner: ${p.owner}`}</RowSub>
                                </div>
                                <StatusPill status={p.status} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: urgencyColor(days), flexShrink: 0 }}>{days}d</span>
                                <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                              </Row>
                            );
                          })}
                        </div>
                      ) : <EmptyState icon={FolderOpen} message="No project deadlines in the next 30 days" positive />}
                    </Section>

                    <Section title={`Upcoming Bookings (${data?.deadlines?.bookings?.length || 0})`} icon={Calendar}>
                      {data?.deadlines?.bookings?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.deadlines.bookings.map((b, idx) => {
                            const days = daysUntil(b.deadline);
                            return (
                              <Row key={idx} to={b.url}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: urgencyDotColor(days) }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <RowTitle>{b.label}</RowTitle>
                                  <RowSub>{b.customer || 'Unknown customer'}</RowSub>
                                </div>
                                <StatusPill status={b.status} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: urgencyColor(days), flexShrink: 0 }}>{days}d</span>
                                <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                              </Row>
                            );
                          })}
                        </div>
                      ) : <EmptyState icon={Calendar} message="No bookings scheduled in the next 30 days" positive />}
                    </Section>

                    <Section title={`Milestones (${data?.deadlines?.milestones?.length || 0})`} icon={Milestone}>
                      {data?.deadlines?.milestones?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.deadlines.milestones.map((m, idx) => {
                            const days = daysUntil(m.deadline);
                            return (
                              <Row key={idx} to={m.url}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: urgencyDotColor(days) }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <RowTitle>{m.label}</RowTitle>
                                  <RowSub>
                                    {m.project && `${m.project} · `}
                                    {m.amount != null && `${m.currency || ''} ${Number(m.amount).toLocaleString()}`}
                                  </RowSub>
                                </div>
                                <StatusPill status={m.status} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: urgencyColor(days), flexShrink: 0 }}>{days}d</span>
                                <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                              </Row>
                            );
                          })}
                        </div>
                      ) : <EmptyState icon={Milestone} message="No milestone deadlines in the next 30 days" positive />}
                    </Section>

                    <Section title={`Tasks Due Soon (${data?.deadlines?.tasks?.length || 0})`} icon={CheckSquare}>
                      {data?.deadlines?.tasks?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.deadlines.tasks.map((t, idx) => {
                            const days = daysUntil(t.deadline);
                            return (
                              <Row key={idx} to={t.url}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: urgencyDotColor(days) }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <RowTitle>{t.label}</RowTitle>
                                  <RowSub>
                                    {t.project && `${t.project} · `}
                                    {t.assignedTo ? `Assigned: ${t.assignedTo}` : 'Unassigned'}
                                  </RowSub>
                                </div>
                                <PriorityPill priority={t.priority} />
                                <StatusPill status={t.status} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: urgencyColor(days), flexShrink: 0 }}>{days}d</span>
                                <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                              </Row>
                            );
                          })}
                        </div>
                      ) : <EmptyState icon={CheckSquare} message="No tasks due in the next 14 days" positive />}
                    </Section>

                    <Section title={`Expiring Quotes (${data?.deadlines?.quotes?.length || 0})`} icon={FileText}>
                      {data?.deadlines?.quotes?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {data.deadlines.quotes.map((q, idx) => {
                            const days = daysUntil(q.deadline);
                            return (
                              <Row key={idx} to={q.url}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: urgencyDotColor(days) }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <RowTitle>{q.label}</RowTitle>
                                  <RowSub>{q.assignedTo ? `Assigned to: ${q.assignedTo}` : 'Unassigned'}</RowSub>
                                </div>
                                <StatusPill status={q.status} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: urgencyColor(days), flexShrink: 0 }}>{days}d</span>
                                <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                              </Row>
                            );
                          })}
                        </div>
                      ) : <EmptyState icon={FileText} message="No quotes expiring in the next 14 days" positive />}
                    </Section>
                  </div>
                )}

                {/* ── ACTIVITY ── */}
                {activeTab === 'activity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 6px' }}>
                      Recent order and quote activity across the team.
                    </p>
                    {data?.activity?.length > 0 ? (
                      data.activity.map((item, idx) => (
                        <Row key={idx} to={item.url}>
                          <TypeIcon type={item.type} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <RowTitle>{item.reference}</RowTitle>
                            <RowSub>
                              {item.type} · {item.status}
                              {item.assignedTo?.name && ` · ${item.assignedTo.name}`}
                            </RowSub>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>
                            {new Date(item.updated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                          </span>
                          <ArrowRight size={13} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                        </Row>
                      ))
                    ) : <EmptyState icon={Activity} message="No recent activity" />}
                  </div>
                )}

              </div>
            </div>
          </>
        )}
        <NotificationsModal
          open={showNotifications}
          onClose={() => setShowNotifications(false)}
        />
        {showTimetable && (
          <WorkTimetable data={data} onClose={() => setShowTimetable(false)} />
        )}
      </div>
    </SettingsLayout>
  );
}

// ── Tab button (extracted to manage its own hover state) ──────────────────────
function TabBtn({ active, icon: Icon, label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '13px 20px', fontSize: '0.8rem', fontWeight: 700,
        border: 'none', borderBottom: `2px solid ${active ? '#a855f7' : 'transparent'}`,
        background: 'none', cursor: 'pointer', fontFamily: 'inherit',
        color: active ? '#a855f7' : hovered ? '#7c3aed' : '#9ca3af',
        transition: 'color 150ms, border-color 150ms',
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}