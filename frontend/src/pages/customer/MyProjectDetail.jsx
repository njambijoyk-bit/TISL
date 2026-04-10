import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2, Calendar, User, Shield, ArrowLeft, MapPin, DollarSign, CalendarCheck, CalendarClock, Info } from 'lucide-react';
import Header from '../../components/layout/Header';
import ProjectStatusBadge from '../../components/admin/ProjectStatusBadge';
import ProjectPriorityBadge from '../../components/admin/ProjectPriorityBadge';
import ProjectItemsTable from '../../components/projects/shared/ProjectItemsTable';
import TaskCard from '../../components/projects/shared/TaskCard';
import MilestoneCard from '../../components/projects/shared/MilestoneCard';
import MessageThread from '../../components/projects/shared/MessageThread';
import MessageComposer from '../../components/projects/shared/MessageComposer';
import ParticipantList from '../../components/projects/customer/ParticipantList';
import ProjectFinanceTab from '../../components/projects/shared/ProjectFinanceTab';
import useProjectStore from '../../store/projectStore';
import { useAuthStore } from '../../store';

const BASE_TABS = ['Overview', 'Items', 'Tasks', 'Milestones', 'Messages', 'Team', 'Finance'];
const POLL_INTERVAL = 30000;

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const MyProjectDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const {
    activeProject, items, tasks, milestones, messages, participants,
    permissions, loading,
    customerFetchProject,
    customerFetchMessages,
    customerPostMessage, customerEditMessage, customerDeleteMessage, customerDeleteMessages,
    customerFetchItems,
    customerFetchTasks,
    customerFetchMilestones,
    CustomerForceDeleteMilestones,
    customerFetchParticipants,
    clearActiveProject,
  } = useProjectStore();

  const [activeTab, setActiveTab]                   = useState('Overview');
  const [selectedMilestones, setSelectedMilestones] = useState([]);
  const pollingRef = useRef(null);

  useEffect(() => {
    customerFetchProject(id);
    return () => clearActiveProject();
  }, [id]);

  useEffect(() => {
    if (!activeProject) return;
    if (activeTab === 'Items'      && items.length === 0)        customerFetchItems(id);
    if (activeTab === 'Tasks'      && tasks.length === 0)        customerFetchTasks(id);
    if (activeTab === 'Milestones' && milestones.length === 0)   customerFetchMilestones(id);
    if (activeTab === 'Team'       && participants.length === 0) customerFetchParticipants(id);
  }, [activeTab, activeProject]);

  useEffect(() => {
    clearInterval(pollingRef.current);
    if (activeTab === 'Messages') {
      customerFetchMessages(id);
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') customerFetchMessages(id);
      }, POLL_INTERVAL);
    }
    return () => clearInterval(pollingRef.current);
  }, [activeTab, id]);

  const toggleSelect = (milestoneId) => {
    setSelectedMilestones((prev) =>
      prev.includes(milestoneId) ? prev.filter((m) => m !== milestoneId) : [...prev, milestoneId]
    );
  };

  const handleBulkDelete = async () => {
    if (!confirm('Permanently delete selected milestones?')) return;
    const res = await CustomerForceDeleteMilestones(id, selectedMilestones);
    if (res.success) { toast.success('Milestones deleted'); setSelectedMilestones([]); }
    else toast.error(res.error || 'Failed to delete milestones');
  };

  const handleSendMessage = async (data) => { await customerPostMessage(id, data); };

  const canComment     = permissions?.can_comment     ?? false;
  const canApprove     = permissions?.can_approve      ?? false;
  const canViewFinance = permissions?.can_view_finance ?? false;

  const visibleTabs = canViewFinance
    ? ['Overview', 'Items', 'Tasks', 'Milestones', 'Finance', 'Messages', 'Team']
    : BASE_TABS;

  if (loading.project && !activeProject) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header />
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          Project not found or you don't have access.
        </div>
      </div>
    );
  }

  const project = activeProject;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800"
        style={{ borderBottom: '2px solid rgba(168,85,247,0.2)', padding: '24px 24px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Back button */}
          <button
            onClick={() => navigate('/my-projects')}
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors mb-5"
            style={{ border: '1px solid rgba(168,85,247,0.2)', color: '#9ca3af' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#9ca3af'; }}
          >
            <ArrowLeft size={12} /> Back to Projects
          </button>

          {/* Title + badges row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#c084fc', marginBottom: 4 }}>
                Project
              </p>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: 0 }}>
                {project.title}
              </h1>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 3 }}>{project.project_number}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 4 }}>
              <ProjectStatusBadge status={project.status} />
              <ProjectPriorityBadge priority={project.priority} showDot />
            </div>
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            {project.target_end_date && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#9ca3af' }}>
                <Calendar size={13} color="#c084fc" />
                Target: {formatDate(project.target_end_date)}
              </span>
            )}
            {project.owner_admin?.name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#9ca3af' }}>
                <User size={13} color="#c084fc" />
                Manager: {project.owner_admin.name}
              </span>
            )}
            {permissions?.role && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#9ca3af', textTransform: 'capitalize' }}>
                <Shield size={13} color="#c084fc" />
                {permissions.role.replace('customer_', '')}
              </span>
            )}
          </div>

          {/* ── Tab bar ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {visibleTabs.map((tab) => {
              const active = activeTab === tab;
              const badge =
                tab === 'Messages'   && messages.length > 0   ? messages.length :
                tab === 'Milestones' && milestones.length > 0 ? milestones.length : null;
              return (
                <button key={tab} onClick={() => setActiveTab(tab)} type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '12px 16px', border: 'none', cursor: 'pointer',
                    background: 'transparent', whiteSpace: 'nowrap',
                    fontSize: '0.82rem', fontWeight: 700,
                    color: active ? '#a855f7' : '#9ca3af',
                    borderBottom: active ? '2.5px solid #a855f7' : '2.5px solid transparent',
                    transition: 'all 150ms', marginBottom: -1,
                  }}
                >
                  {tab}
                  {badge !== null && (
                    <span style={{
                      minWidth: 18, padding: '1px 5px', borderRadius: 9999,
                      fontSize: '0.65rem', fontWeight: 800,
                      background: active ? 'rgba(168,85,247,0.12)' : '#f3f4f6',
                      color: active ? '#a855f7' : '#9ca3af',
                      transition: 'all 150ms',
                    }}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        padding: activeTab === 'Messages' ? '0' : '32px 24px 64px',
      }}>

        {/* ── OVERVIEW ── */}
        {activeTab === 'Overview' && (
          <div className="space-y-4">

            {/* About this project — purple tint banner */}
            {project.description && (
              <div className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                {/* Accent bar */}
                <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />
                <div style={{ padding: '16px 20px', background: 'rgba(168,85,247,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Info size={14} color="#a855f7" />
                    </div>
                    <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a855f7', margin: 0 }}>
                      About this project
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{project.description}</p>
                </div>
              </div>
            )}

            {/* Details table */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
              {/* Header */}
              <div style={{ padding: '10px 16px', background: 'rgba(168,85,247,0.06)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a855f7', margin: 0 }}>
                  Project Details
                </p>
              </div>

              {/* Rows */}
              <div className="bg-white dark:bg-gray-800">
                {[
                  {
                    label: 'Start Date', value: formatDate(project.start_date),
                    Icon: Calendar, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',
                  },
                  {
                    label: 'Target Date', value: formatDate(project.target_end_date),
                    Icon: CalendarCheck, color: '#10b981', bg: 'rgba(16,185,129,0.08)',
                  },
                  {
                    label: 'Manager', value: project.owner_admin?.name || 'Unassigned',
                    Icon: User, color: '#a855f7', bg: 'rgba(168,85,247,0.08)',
                  },
                  {
                    label: 'Currency', value: project.base_currency,
                    Icon: DollarSign, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',
                  },
                  {
                    label: 'Delivery Location', value: project.delivery_location,
                    Icon: MapPin, color: '#ef4444', bg: 'rgba(239,68,68,0.08)',
                  },
                ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
                  <div key={row.label}
                    style={{
                      display: 'grid', gridTemplateColumns: '160px 1fr',
                      alignItems: 'center', padding: '10px 16px',
                      borderBottom: i < arr.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none',
                    }}>
                    {/* Label with icon */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: row.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <row.Icon size={13} color={row.color} />
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: row.color }}>{row.label}</span>
                    </div>
                    {/* Value */}
                    <span className="text-gray-900 dark:text-white" style={{ fontSize: '0.82rem', fontWeight: 700 }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ITEMS ── */}
        {activeTab === 'Items' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5"
            style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
            <ProjectItemsTable items={items} loading={loading.items} readOnly />
          </div>
        )}

        {/* ── TASKS ── */}
        {activeTab === 'Tasks' && (
          <div className="space-y-3">
            {loading.tasks ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))
            ) : tasks.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-8">No tasks yet.</p>
            ) : (
              tasks.map((task) => <TaskCard key={task.id} task={task} readOnly />)
            )}
          </div>
        )}

        {/* ── MILESTONES ── */}
        {activeTab === 'Milestones' && (
          <div className="space-y-3">
            {selectedMilestones.length > 0 && (
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">{selectedMilestones.length} selected</span>
                <button onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                  <Trash2 className="w-4 h-4" /> Delete Selected
                </button>
              </div>
            )}
            {loading.milestones ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))
            ) : milestones.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-8">No milestones yet.</p>
            ) : (
              milestones.map((m) => (
                <MilestoneCard
                  key={m.id} milestone={m} projectId={id}
                  selected={selectedMilestones.includes(m.id)}
                  onSelect={toggleSelect}
                  canApprove={canApprove} canViewFinance={canViewFinance}
                  isAdmin={false} readOnly={!canApprove}
                />
              ))
            )}
          </div>
        )}

        {/* ── FINANCE ── */}
        {activeTab === 'Finance' && (
          <ProjectFinanceTab project={project} items={items} milestones={milestones} />
        )}

        {/* ── MESSAGES ── */}
        {activeTab === 'Messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', width: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 0', minWidth: 0 }}>
              <MessageThread
                messages={messages} loading={loading.messages}
                currentUserId={user?.id} userRole={user?.role}
                onEditMessage={(msgId, text) => customerEditMessage(id, msgId, text)}
                onDeleteMessage={(msgId)     => customerDeleteMessage(id, msgId)}
                onDeleteMessages={(ids)      => customerDeleteMessages(id, ids)}
              />
            </div>
            <MessageComposer
              onSend={handleSendMessage} loading={loading.submitting}
              isAdmin={false} disabled={!canComment}
              placeholder={canComment ? 'Type a message...' : 'You do not have permission to comment.'}
            />
          </div>
        )}

        {/* ── TEAM ── */}
        {activeTab === 'Team' && (
          <ParticipantList project={project} permissions={permissions} />
        )}
      </div>

    </div>
  );
};

export default MyProjectDetail;