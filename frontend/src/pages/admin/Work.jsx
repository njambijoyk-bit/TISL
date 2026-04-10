import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Users, ShoppingBag, FileText, FolderOpen,
  MessageSquareQuote, AlertTriangle, CalendarClock, Activity,
  ChevronRight, ArrowRight, Loader2, RefreshCw,
  UserCheck, CheckSquare, Milestone, Ticket,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Footer from '../../components/layout/Footer';
import Sidebar from '../../components/layout/Sidebar';
import workAPI from '../../api/work';
import { useAuthStore } from '../../store';

const TABS = [
  { id: 'load',       label: 'Team Load',   icon: Users },
  { id: 'unassigned', label: 'Unassigned',  icon: AlertTriangle },
  { id: 'deadlines',  label: 'Deadlines',   icon: CalendarClock },
  { id: 'activity',   label: 'Activity',    icon: Activity },
];

export default function Work() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('load');
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState(null);

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

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  const urgencyClass = (days) =>
    days === null ? 'text-gray-400'
    : days <= 3  ? 'text-red-600'
    : days <= 7  ? 'text-orange-500'
    : 'text-yellow-600';

  const urgencyDot = (days) =>
    days === null ? 'bg-gray-300'
    : days <= 3  ? 'bg-red-500'
    : days <= 7  ? 'bg-orange-400'
    : 'bg-yellow-400';

  // Totals for summary bar
  const unassignedTotal =
    (data?.unassigned?.counts?.orders        || 0) +
    (data?.unassigned?.counts?.quotes        || 0) +
    (data?.unassigned?.counts?.quoteRequests || 0) +
    (data?.unassigned?.counts?.tasks         || 0) +
    (data?.unassigned?.counts?.tickets       || 0);

  const deadlineTotal =
    (data?.deadlines?.projects?.length   || 0) +
    (data?.deadlines?.quotes?.length     || 0) +
    (data?.deadlines?.milestones?.length || 0) +
    (data?.deadlines?.tasks?.length      || 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">

            {/* Page header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-sm">
                  <Briefcase size={18} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Work Overview</h1>
                  <p className="text-sm text-gray-500">Team assignments, workload &amp; deadlines</p>
                </div>
              </div>
              <button onClick={fetchOverview} disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 size={36} className="animate-spin text-purple-500" />
              </div>
            ) : (
              <>
                {/* Summary stat bar */}
                {data && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <SummaryCard
                      label="Staff Members"
                      value={data.team_load?.length || 0}
                      icon={Users}
                      color="purple"
                    />
                    <SummaryCard
                      label="Unassigned Items"
                      value={unassignedTotal}
                      icon={AlertTriangle}
                      color={unassignedTotal > 0 ? 'red' : 'green'}
                    />
                    <SummaryCard
                      label="Unassigned Tasks"
                      value={data.unassigned?.counts?.tasks || 0}
                      icon={CheckSquare}
                      color={data.unassigned?.counts?.tasks > 0 ? 'orange' : 'green'}
                    />
                    <SummaryCard
                      label="Unassigned Tickets"
                      value={data.unassigned?.counts?.tickets || 0}
                      icon={Ticket}
                      color={data.unassigned?.counts?.tickets > 0 ? 'red' : 'green'}
                    />
                  </div>
                )}

                {/* Tab bar */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    <div className="flex flex-wrap">
                      {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.id
                              ? 'border-purple-600 text-purple-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}>
                          <tab.icon size={15} /> {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-6">

                    {/* ── TEAM LOAD TAB ──────────────────────────────────── */}
                    {activeTab === 'load' && (
                      <div className="space-y-4">
                        <p className="text-sm text-gray-500 mb-4">Active work per staff member — sorted by total load.</p>
                        {data?.team_load
                          ?.sort((a, b) => {
                            const sumA = Object.values(a.counts).reduce((s, v) => s + v, 0);
                            const sumB = Object.values(b.counts).reduce((s, v) => s + v, 0);
                            return sumB - sumA;
                          })
                          .map((member, idx) => {
                            const total = Object.values(member.counts).reduce((s, v) => s + v, 0);
                            return (
                              <div key={idx}
                                className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                                <div className="flex items-start gap-4">
                                  {/* Avatar + identity */}
                                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-sm flex-shrink-0">
                                    {member.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{member.user?.name}</p>
                                      <RolePill role={member.user?.role} />
                                      {member.employee && (
                                        <span className="text-xs text-gray-500">
                                          {member.employee.job_title}{member.employee.department && ` · ${member.employee.department}`}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{member.user?.email}</p>

                                    {/* Load pills */}
                                    <div className="flex flex-wrap gap-2 mt-3">
                                      <LoadPill icon={Users}              label="Customers"   value={member.counts.customers}     color="blue" />
                                      <LoadPill icon={FolderOpen}         label="Projects"    value={member.counts.projects}      color="green" />
                                      <LoadPill icon={ShoppingBag}        label="Orders"      value={member.counts.orders}        color="orange" />
                                      <LoadPill icon={FileText}           label="Quotes"      value={member.counts.quotes}        color="purple" />
                                      <LoadPill icon={MessageSquareQuote} label="Requests"    value={member.counts.quoteRequests} color="pink" />
                                      <LoadPill icon={CheckSquare}        label="Tasks"       value={member.counts.tasks}         color="teal" />
                                      <LoadPill icon={Milestone}          label="Milestones"  value={member.counts.milestones}    color="indigo" />
                                      <LoadPill icon={Ticket}             label="Tickets"     value={member.counts.tickets}       color="cyan" />
                                    </div>
                                  </div>

                                  {/* Total badge */}
                                  <div className="flex-shrink-0 text-right">
                                    <div className={`text-lg font-bold ${total > 10 ? 'text-red-600' : total > 5 ? 'text-orange-500' : 'text-green-600'}`}>
                                      {total}
                                    </div>
                                    <p className="text-xs text-gray-400">total</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        {!data?.team_load?.length && <EmptyState icon={Users} message="No staff members found" />}
                      </div>
                    )}

                    {/* ── UNASSIGNED TAB ─────────────────────────────────── */}
                    {activeTab === 'unassigned' && (
                      <div className="space-y-6">
                        <p className="text-sm text-gray-500">Items with no assigned staff member — assign them to prevent them falling through the cracks.</p>

                        {/* Unassigned orders */}
                        <Section title={`Unassigned Orders (${data?.unassigned?.counts?.orders || 0})`} icon={ShoppingBag}
                          alert={data?.unassigned?.counts?.orders > 0}>
                          {data?.unassigned?.orders?.length > 0 ? (
                            <div className="space-y-2">
                              {data.unassigned.orders.map((o, idx) => (
                                <Link key={idx} to={`/admin/orders/${o.id}`} className={rowClass}>
                                  <TypeIcon type="order" />
                                  <div className="flex-1 min-w-0">
                                    <p className={titleClass}>{o.order_number}</p>
                                    <p className={subClass}>{o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Unknown customer'}</p>
                                  </div>
                                  <StatusPill status={o.status} />
                                  <p className="text-xs text-gray-400">{fmtDate(o.created_at)}</p>
                                  <ArrowRight size={14} className="text-gray-400" />
                                </Link>
                              ))}
                            </div>
                          ) : <EmptyState icon={ShoppingBag} message="No unassigned orders" positive />}
                        </Section>

                        {/* Unassigned quotes */}
                        <Section title={`Unassigned Quotes (${data?.unassigned?.counts?.quotes || 0})`} icon={FileText}
                          alert={data?.unassigned?.counts?.quotes > 0}>
                          {data?.unassigned?.quotes?.length > 0 ? (
                            <div className="space-y-2">
                              {data.unassigned.quotes.map((q, idx) => (
                                <Link key={idx} to={`/admin/quotes/${q.id}`} className={rowClass}>
                                  <TypeIcon type="quote" />
                                  <div className="flex-1 min-w-0">
                                    <p className={titleClass}>{q.quote_number}</p>
                                    <p className={subClass}>{q.customer ? `${q.customer.first_name} ${q.customer.last_name}` : 'Unknown customer'}</p>
                                  </div>
                                  <StatusPill status={q.status} />
                                  <p className="text-xs text-gray-400">{fmtDate(q.created_at)}</p>
                                  <ArrowRight size={14} className="text-gray-400" />
                                </Link>
                              ))}
                            </div>
                          ) : <EmptyState icon={FileText} message="No unassigned quotes" positive />}
                        </Section>

                        {/* Unassigned quote requests */}
                        <Section title={`Unassigned Quote Requests (${data?.unassigned?.counts?.quoteRequests || 0})`} icon={MessageSquareQuote}
                          alert={data?.unassigned?.counts?.quoteRequests > 0}>
                          {data?.unassigned?.quoteRequests?.length > 0 ? (
                            <div className="space-y-2">
                              {data.unassigned.quoteRequests.map((qr, idx) => (
                                <Link key={idx} to={`/admin/quote-requests/${qr.id}`} className={rowClass}>
                                  <TypeIcon type="quote_request" />
                                  <div className="flex-1 min-w-0">
                                    <p className={titleClass}>{qr.request_number}</p>
                                    <p className={subClass}>{qr.request_title || 'No title'}</p>
                                  </div>
                                  <PriorityPill priority={qr.priority} />
                                  <p className="text-xs text-gray-400">{fmtDate(qr.created_at)}</p>
                                  <ArrowRight size={14} className="text-gray-400" />
                                </Link>
                              ))}
                            </div>
                          ) : <EmptyState icon={MessageSquareQuote} message="No unassigned quote requests" positive />}
                        </Section>

                        {/* Unassigned tasks */}
                        <Section title={`Unassigned Tasks (${data?.unassigned?.counts?.tasks || 0})`} icon={CheckSquare}
                          alert={data?.unassigned?.counts?.tasks > 0}>
                          {data?.unassigned?.tasks?.length > 0 ? (
                            <div className="space-y-2">
                              {data.unassigned.tasks.map((t, idx) => (
                                <Link key={idx} to={`/admin/projects/${t.project_id}`} className={rowClass}>
                                  <TypeIcon type="task" />
                                  <div className="flex-1 min-w-0">
                                    <p className={titleClass}>{t.title}</p>
                                    <p className={subClass}>
                                      {t.project ? `${t.project.project_number} · ${t.project.title}` : 'Unknown project'}
                                      {t.due_date && ` · Due ${fmtDate(t.due_date)}`}
                                    </p>
                                  </div>
                                  <PriorityPill priority={t.priority} />
                                  <StatusPill status={t.status} />
                                  <ArrowRight size={14} className="text-gray-400" />
                                </Link>
                              ))}
                            </div>
                          ) : <EmptyState icon={CheckSquare} message="No unassigned tasks" positive />}
                        </Section>

                        {/* Unassigned tickets */}
                        <Section title={`Unassigned Tickets (${data?.unassigned?.counts?.tickets || 0})`} icon={Ticket}
                          alert={data?.unassigned?.counts?.tickets > 0}>
                          {data?.unassigned?.tickets?.length > 0 ? (
                            <div className="space-y-2">
                              {data.unassigned.tickets.map((t, idx) => (
                                <Link key={idx} to={`/admin/tickets/${t.id}`} className={rowClass}>
                                  <TypeIcon type="ticket" />
                                  <div className="flex-1 min-w-0">
                                    <p className={titleClass}>{t.ticket_number}</p>
                                    <p className={subClass}>
                                      {t.subject}
                                      {t.customer && ` · ${t.customer.first_name} ${t.customer.last_name}`}
                                    </p>
                                  </div>
                                  <PriorityPill priority={t.priority} />
                                  <StatusPill status={t.status} />
                                  <ArrowRight size={14} className="text-gray-400" />
                                </Link>
                              ))}
                            </div>
                          ) : <EmptyState icon={Ticket} message="No unassigned tickets" positive />}
                        </Section>
                      </div>
                    )}

                    {/* ── DEADLINES TAB ──────────────────────────────────── */}
                    {activeTab === 'deadlines' && (
                      <div className="space-y-6">
                        <p className="text-sm text-gray-500">Team-wide items due within 30 days.</p>

                        {/* Project deadlines */}
                        <Section title={`Projects (${data?.deadlines?.projects?.length || 0})`} icon={FolderOpen}>
                          {data?.deadlines?.projects?.length > 0 ? (
                            <div className="space-y-2">
                              {data.deadlines.projects.map((p, idx) => {
                                const days = daysUntil(p.deadline);
                                return (
                                  <Link key={idx} to={p.url} className={rowClass}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${urgencyDot(days)}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={titleClass}>{p.label}</p>
                                      <p className={subClass}>
                                        {p.customer && `${p.customer} · `}{p.owner && `Owner: ${p.owner}`}
                                      </p>
                                    </div>
                                    <StatusPill status={p.status} />
                                    <span className={`text-sm font-bold flex-shrink-0 ${urgencyClass(days)}`}>{days}d</span>
                                    <ArrowRight size={14} className="text-gray-400" />
                                  </Link>
                                );
                              })}
                            </div>
                          ) : <EmptyState icon={FolderOpen} message="No project deadlines in the next 30 days" positive />}
                        </Section>

                        {/* Milestone deadlines */}
                        <Section title={`Milestones (${data?.deadlines?.milestones?.length || 0})`} icon={Milestone}>
                          {data?.deadlines?.milestones?.length > 0 ? (
                            <div className="space-y-2">
                              {data.deadlines.milestones.map((m, idx) => {
                                const days = daysUntil(m.deadline);
                                return (
                                  <Link key={idx} to={m.url} className={rowClass}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${urgencyDot(days)}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={titleClass}>{m.label}</p>
                                      <p className={subClass}>
                                        {m.project && `${m.project} · `}
                                        {m.amount != null && `${m.currency || ''} ${Number(m.amount).toLocaleString()}`}
                                      </p>
                                    </div>
                                    <StatusPill status={m.status} />
                                    <span className={`text-sm font-bold flex-shrink-0 ${urgencyClass(days)}`}>{days}d</span>
                                    <ArrowRight size={14} className="text-gray-400" />
                                  </Link>
                                );
                              })}
                            </div>
                          ) : <EmptyState icon={Milestone} message="No milestone deadlines in the next 30 days" positive />}
                        </Section>

                        {/* Task deadlines */}
                        <Section title={`Tasks Due Soon (${data?.deadlines?.tasks?.length || 0})`} icon={CheckSquare}>
                          {data?.deadlines?.tasks?.length > 0 ? (
                            <div className="space-y-2">
                              {data.deadlines.tasks.map((t, idx) => {
                                const days = daysUntil(t.deadline);
                                return (
                                  <Link key={idx} to={t.url} className={rowClass}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${urgencyDot(days)}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={titleClass}>{t.label}</p>
                                      <p className={subClass}>
                                        {t.project && `${t.project} · `}
                                        {t.assignedTo ? `Assigned: ${t.assignedTo}` : 'Unassigned'}
                                      </p>
                                    </div>
                                    <PriorityPill priority={t.priority} />
                                    <StatusPill status={t.status} />
                                    <span className={`text-sm font-bold flex-shrink-0 ${urgencyClass(days)}`}>{days}d</span>
                                    <ArrowRight size={14} className="text-gray-400" />
                                  </Link>
                                );
                              })}
                            </div>
                          ) : <EmptyState icon={CheckSquare} message="No tasks due in the next 14 days" positive />}
                        </Section>

                        {/* Expiring quotes */}
                        <Section title={`Expiring Quotes (${data?.deadlines?.quotes?.length || 0})`} icon={FileText}>
                          {data?.deadlines?.quotes?.length > 0 ? (
                            <div className="space-y-2">
                              {data.deadlines.quotes.map((q, idx) => {
                                const days = daysUntil(q.deadline);
                                return (
                                  <Link key={idx} to={q.url} className={rowClass}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${urgencyDot(days)}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={titleClass}>{q.label}</p>
                                      <p className={subClass}>{q.assignedTo ? `Assigned to: ${q.assignedTo}` : 'Unassigned'}</p>
                                    </div>
                                    <StatusPill status={q.status} />
                                    <span className={`text-sm font-bold flex-shrink-0 ${urgencyClass(days)}`}>{days}d</span>
                                    <ArrowRight size={14} className="text-gray-400" />
                                  </Link>
                                );
                              })}
                            </div>
                          ) : <EmptyState icon={FileText} message="No quotes expiring in the next 14 days" positive />}
                        </Section>
                      </div>
                    )}

                    {/* ── ACTIVITY TAB ───────────────────────────────────── */}
                    {activeTab === 'activity' && (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-500 mb-4">Recent order and quote activity across the team.</p>
                        {data?.activity?.length > 0 ? (
                          data.activity.map((item, idx) => (
                            <Link key={idx} to={item.url} className={rowClass}>
                              <TypeIcon type={item.type} />
                              <div className="flex-1 min-w-0">
                                <p className={titleClass}>{item.reference}</p>
                                <p className={subClass}>
                                  {item.type} · {item.status}
                                  {item.assignedTo?.name && ` · ${item.assignedTo.name}`}
                                </p>
                              </div>
                              <p className="text-xs text-gray-400 flex-shrink-0">
                                {new Date(item.updated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                              </p>
                              <ArrowRight size={14} className="text-gray-400" />
                            </Link>
                          ))
                        ) : <EmptyState icon={Activity} message="No recent activity" />}
                      </div>
                    )}

                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ─── Shared style strings ─────────────────────────────────────────────────────
const rowClass   = 'flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors';
const titleClass = 'text-sm font-medium text-gray-900 dark:text-white truncate';
const subClass   = 'text-xs text-gray-500 truncate';

// ─── TypeIcon ─────────────────────────────────────────────────────────────────
const TYPE_ICON_MAP = {
  order:         { bg: 'bg-orange-100 text-orange-600', Icon: ShoppingBag },
  quote:         { bg: 'bg-purple-100 text-purple-600', Icon: FileText },
  quote_request: { bg: 'bg-pink-100   text-pink-600',   Icon: MessageSquareQuote },
  project:       { bg: 'bg-green-100  text-green-600',  Icon: FolderOpen },
  task:          { bg: 'bg-teal-100   text-teal-600',   Icon: CheckSquare },
  milestone:     { bg: 'bg-indigo-100 text-indigo-600', Icon: Milestone },
  ticket:        { bg: 'bg-cyan-100   text-cyan-600',   Icon: Ticket },
};

function TypeIcon({ type }) {
  const cfg = TYPE_ICON_MAP[type] ?? { bg: 'bg-gray-100 text-gray-500', Icon: Briefcase };
  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
      <cfg.Icon size={14} />
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, color }) {
  const map = {
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    green:  'bg-green-50  text-green-600  dark:bg-green-900/20  dark:text-green-400',
    red:    'bg-red-50    text-red-600    dark:bg-red-900/20    dark:text-red-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
    teal:   'bg-teal-50   text-teal-600   dark:bg-teal-900/20   dark:text-teal-400',
  };
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
      <div className={`w-10 h-10 rounded-lg ${map[color] ?? map.purple} flex items-center justify-center mb-3`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children, alert = false }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${alert ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
        <Icon size={15} className={alert ? 'text-red-500' : 'text-purple-500'} />
        {title}
        {alert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      </h3>
      {children}
    </div>
  );
}

function LoadPill({ icon: Icon, label, value, color }) {
  if (!value && value !== 0) return null;
  const map = {
    blue:   'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400',
    green:  'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    pink:   'bg-pink-100   text-pink-700   dark:bg-pink-900/30   dark:text-pink-400',
    teal:   'bg-teal-100   text-teal-700   dark:bg-teal-900/30   dark:text-teal-400',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    cyan:   'bg-cyan-100   text-cyan-700   dark:bg-cyan-900/30   dark:text-cyan-400',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${map[color] ?? map.blue}`}>
      <Icon size={11} /> {value} {label}
    </span>
  );
}

function RolePill({ role }) {
  const map = {
    super_admin: 'bg-purple-100 text-purple-700',
    admin:       'bg-blue-100   text-blue-700',
    manager:     'bg-teal-100   text-teal-700',
    sales_rep:   'bg-green-100  text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role?.replace('_', ' ')}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    active:           'bg-green-100  text-green-700',
    delivered:        'bg-green-100  text-green-700',
    approved:         'bg-green-100  text-green-700',
    done:             'bg-green-100  text-green-700',
    resolved:         'bg-green-100  text-green-700',
    pending:          'bg-yellow-100 text-yellow-700',
    planning:         'bg-blue-100   text-blue-700',
    converted:        'bg-blue-100   text-blue-700',
    todo:             'bg-gray-100   text-gray-600',
    doing:            'bg-blue-100   text-blue-700',
    in_progress:      'bg-blue-100   text-blue-700',
    blocked:          'bg-red-100    text-red-700',
    draft:            'bg-gray-100   text-gray-600',
    on_hold:          'bg-orange-100 text-orange-700',
    open:             'bg-yellow-100 text-yellow-700',
    waiting_customer: 'bg-orange-100 text-orange-700',
    closed:           'bg-gray-100   text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function PriorityPill({ priority }) {
  const map = {
    urgent: 'bg-red-100    text-red-700',
    high:   'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100   text-blue-700',
    low:    'bg-gray-100   text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${map[priority] ?? 'bg-gray-100 text-gray-600'}`}>
      {priority}
    </span>
  );
}

function EmptyState({ icon: Icon, message, positive = false }) {
  return (
    <div className={`text-center py-8 rounded-xl ${positive ? 'bg-green-50 dark:bg-green-900/10' : 'bg-gray-50 dark:bg-gray-900'}`}>
      <Icon size={28} className={`mx-auto mb-2 ${positive ? 'text-green-400' : 'text-gray-300'}`} />
      <p className={`text-sm ${positive ? 'text-green-600' : 'text-gray-500'}`}>{message}</p>
    </div>
  );
}