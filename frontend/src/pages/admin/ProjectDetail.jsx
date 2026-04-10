import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Trash2, Calendar, User, Shield, ChevronLeft, Edit2, ArrowLeftRight,
  Package, CheckSquare, Flag, MessageSquare, Users, Link2, Activity,
  DollarSign, Plus,
} from 'lucide-react';
import AdminLayout           from '../../components/layout/AdminLayout';
import ProjectStatusBadge    from '../../components/admin/ProjectStatusBadge';
import ProjectPriorityBadge  from '../../components/admin/ProjectPriorityBadge';
import EditProjectModal       from '../../components/projects/admin/EditProjectModal';
import TransferOwnershipModal from '../../components/projects/admin/TransferOwnershipModal';
import ParticipantsPanel      from '../../components/projects/admin/ParticipantsPanel';
import ProjectLinksPanel      from '../../components/projects/admin/ProjectLinksPanel';
import CreateItemModal        from '../../components/projects/admin/CreateItemModal';
import CreateTaskModal        from '../../components/projects/admin/CreateTaskModal';
import CreateMilestoneModal   from '../../components/projects/admin/CreateMilestoneModal';
import ActivityFeed           from '../../components/projects/admin/ActivityFeed';
import ProjectItemsTable      from '../../components/projects/shared/ProjectItemsTable';
import TaskCard               from '../../components/projects/shared/TaskCard';
import MilestoneCard          from '../../components/projects/shared/MilestoneCard';
import MessageThread          from '../../components/projects/shared/MessageThread';
import MessageComposer        from '../../components/projects/shared/MessageComposer';
import ProjectFinanceTab      from '../../components/projects/shared/ProjectFinanceTab';
import useProjectStore        from '../../store/projectStore';
import { useAuthStore }       from '../../store';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const POLL_INTERVAL = 45000;

const TABS = [
  { key: 'Overview',     icon: Shield },
  { key: 'Items',        icon: Package },
  { key: 'Tasks',        icon: CheckSquare },
  { key: 'Milestones',   icon: Flag },
  { key: 'Messages',     icon: MessageSquare },
  { key: 'Participants', icon: Users },
  { key: 'Links',        icon: Link2 },
  { key: 'Activity',     icon: Activity },
  { key: 'Finance',      icon: DollarSign },
];

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Atoms ────────────────────────────────────────────────────────────────────

const Btn = ({ children, onClick, disabled, variant = 'outline', icon, size = 'md', type = 'button' }) => {
  const variants = {
    primary:     { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    danger:      { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.25)' },
    outline:     { background: 'transparent', color: '#6b7280', border: '1.5px solid var(--border,#e5e7eb)', boxShadow: 'none' },
    ghost:       { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
    red_outline: { background: 'transparent', color: '#ef4444', border: '1.5px solid rgba(239,68,68,0.35)', boxShadow: 'none' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: size === 'sm' ? '5px 12px' : '8px 16px',
      borderRadius: 10,
      fontSize: size === 'sm' ? '0.78rem' : '0.83rem',
      fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'transform 0.1s, opacity 0.15s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      {icon}{children}
    </button>
  );
};

const Panel = ({ children, style = {}, accent = false, className = '' }) => (
  <div className={className} style={{
    background: 'var(--panel-bg,white)',
    border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}`,
    borderRadius: 16, overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px rgba(168,85,247,0.1), 0 4px 20px rgba(168,85,247,0.07)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    {Icon && <Icon size={13} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>
      {children}
    </p>
  </div>
);

const MetaChip = ({ icon: Icon, children }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', background: '#f9fafb', border: '1px solid #f3f4f6' }}>
    <Icon size={11} />{children}
  </div>
);

const InfoRow = ({ label, value }) => {
  if (!value || value === '—') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border,#f9fafb)' }}>
      <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text,#111827)', fontWeight: 700, textAlign: 'right', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
};

const EmptyState = ({ icon: Icon, label }) => (
  <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
    <Icon size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
    <p style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>{label}</p>
  </div>
);

const SkeletonList = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {[1, 2, 3].map(i => (
      <div key={i} style={{ height: 64, borderRadius: 12, background: 'var(--border,#f3f4f6)' }} />
    ))}
  </div>
);

const ConfirmModal = ({ title, subtitle, body, confirmLabel = 'Delete', onConfirm, onCancel, loading }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ background: 'var(--panel-bg,white)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'pdSlideUp 0.2s ease' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Trash2 size={18} color="#ef4444" />
        </div>
        <div>
          <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#a855f7', margin: '0 0 3px' }}>{title}</p>
          {subtitle && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{subtitle}</p>}
        </div>
      </div>
      <p style={{ fontSize: '0.83rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 22 }}>{body}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn variant="outline" onClick={onCancel} disabled={loading}>Cancel</Btn>
        <Btn variant="danger" onClick={onConfirm} disabled={loading} icon={<Trash2 size={13} />}>
          {loading ? 'Deleting…' : confirmLabel}
        </Btn>
      </div>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const ProjectDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const {
    activeProject, participants, links, items, tasks, milestones, forceDeleteMilestones, loading,
    messages, editMessage, deleteMessage, deleteMessages, clearChat,
    fetchProject, fetchMessages, deleteProject, deleteItem, deleteTask, updateTask,
    postMessage, clearActiveProject,
  } = useProjectStore();

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab,            setActiveTab]            = useState('Overview');
  const [showEdit,             setShowEdit]             = useState(false);
  const [showTransfer,         setShowTransfer]         = useState(false);
  const [showCreateItem,       setShowCreateItem]       = useState(false);
  const [editItem,             setEditItem]             = useState(null);
  const [showCreateTask,       setShowCreateTask]       = useState(false);
  const [showCreateMilestone,  setShowCreateMilestone]  = useState(false);
  const [confirmDeleteItem,    setConfirmDeleteItem]    = useState(null);
  const [confirmDeleteTask,    setConfirmDeleteTask]    = useState(null);
  const [selectedMilestones,   setSelectedMilestones]  = useState([]);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [msgHeight,            setMsgHeight]            = useState('0px');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pollingRef = useRef(null);
  const msgRef     = useRef(null);

  // ── Derived permissions ───────────────────────────────────────────────────
  const isAdminOwner = user?.role === 'super_admin' ||
    Number(activeProject?.owner_admin_id) === Number(user?.id) ||
    participants.some(p =>
      p.participant_type === 'admin' &&
      Number(p.admin_user_id) === Number(user?.id) &&
      p.role === 'admin_owner' &&
      p.status === 'active'
    );

  const canDelete = user?.role === 'super_admin' ||
    (user?.role === 'admin' && participants.some(p =>
      p.participant_type === 'admin' &&
      Number(p.admin_user_id) === Number(user?.id) &&
      ['invited', 'active'].includes(p.status)
    ));

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchProject(id);
    return () => clearActiveProject();
  }, [id]);

  useEffect(() => {
    clearInterval(pollingRef.current);
    if (activeTab === 'Messages') {
      fetchMessages(id);
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') fetchMessages(id);
      }, POLL_INTERVAL);
    }
    return () => clearInterval(pollingRef.current);
  }, [activeTab, id]);

  // Measure the messages container's top edge after it mounts,
  // then set height to fill exactly to the viewport bottom — zero guesswork.
  useEffect(() => {
    if (activeTab !== 'Messages') return;
    const raf = requestAnimationFrame(() => {
      if (msgRef.current) {
        const top = msgRef.current.getBoundingClientRect().top;
        setMsgHeight(`${window.innerHeight - top}px`);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleEditMessage    = (msgId, text) => editMessage(id, msgId, text);
  const handleDeleteMessage  = (msgId)       => deleteMessage(id, msgId);
  const handleDeleteMessages = (ids)         => deleteMessages(id, ids);
  const handleClearChat      = ()            => clearChat(id);

  const handleDeleteItem = async () => {
    const res = await deleteItem(Number(id), confirmDeleteItem.id);
    if (res.success) toast.success('Item deleted.');
    else toast.error(res.error || 'Failed to delete item.');
    setConfirmDeleteItem(null);
  };

  const handleDeleteTask = async () => {
    const res = await deleteTask(id, confirmDeleteTask.id);
    if (res.success) toast.success('Task deleted.');
    else toast.error(res.error || 'Failed to delete task.');
    setConfirmDeleteTask(null);
  };

  const handleDeleteProject = async () => {
    const res = await deleteProject(id);
    if (res.success) { toast.success('Project moved to trash.'); navigate('/admin/projects/list'); }
    else toast.error(res.error || 'Failed to delete project.');
    setConfirmDeleteProject(false);
  };

  const handleStatusChange = async (task, newStatus) => {
    const res = await updateTask(id, task.id, { status: newStatus });
    if (!res.success) toast.error(res.error || 'Failed to update task.');
  };

  const handleTaskUpdate = async (task, patch) => {
    const res = await updateTask(id, task.id, patch);
    if (!res.success) toast.error(res.error || 'Failed to update task.');
    return res;
  };

  const toggleSelect = milestoneId =>
    setSelectedMilestones(prev =>
      prev.includes(milestoneId) ? prev.filter(m => m !== milestoneId) : [...prev, milestoneId]
    );

  const handleBulkDelete = async () => {
    if (!confirm('Permanently delete selected milestones?')) return;
    const res = await forceDeleteMilestones(id, selectedMilestones);
    if (res.success) { toast.success('Milestones deleted'); setSelectedMilestones([]); }
    else toast.error(res.error || 'Failed to delete milestones');
  };

  const handleSendMessage = async (data) => {
    const res = await postMessage(id, data);
    if (!res.success) toast.error(res.error || 'Failed to send message.');
  };

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loading.project && !activeProject) {
    return (
      <AdminLayout>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
          {[80, 44, 400].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 14, background: 'var(--border,#f3f4f6)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      </AdminLayout>
    );
  }

  if (!activeProject) {
    return (
      <AdminLayout>
        <EmptyState icon={Shield} label="Project not found." />
      </AdminLayout>
    );
  }

  const project = activeProject;
  const tabCounts = {
    Items: items.length, Tasks: tasks.length, Milestones: milestones.length,
    Messages: messages.length, Participants: participants.length,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <style>{`
        @keyframes pdFadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pdSlideUp { from{opacity:0;transform:translateY(16px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        .pd-panel{animation:pdFadeUp 0.25s ease both}
        .pd-panel:nth-child(1){animation-delay:0.04s}
        .pd-panel:nth-child(2){animation-delay:0.08s}
        .pd-panel:nth-child(3){animation-delay:0.12s}
        .pd-overview{display:grid;grid-template-columns:1fr 272px;gap:20px;align-items:start}
        @media(max-width:900px){.pd-overview{grid-template-columns:1fr}}
        .pd-tabs{display:flex;gap:2px;border-bottom:2px solid var(--border,#f3f4f6);overflow-x:auto;padding-bottom:0;scrollbar-width:none}
        .pd-tabs::-webkit-scrollbar{display:none}
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/admin/projects/list')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, padding: 0, marginBottom: 14 }}>
          <ChevronLeft size={14} /> Back to Projects
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#a855f7', margin: '0 0 5px' }}>
              {project.title}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {project.project_number}
              {project.customer && ` · ${(project.customer.first_name || '')} ${(project.customer.last_name || '')}`.trim()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="outline" size="sm" icon={<Edit2 size={13} />} onClick={() => setShowEdit(true)}>Edit</Btn>
            {isAdminOwner && (
              <Btn variant="outline" size="sm" icon={<ArrowLeftRight size={13} />} onClick={() => setShowTransfer(true)}>Transfer</Btn>
            )}
            {canDelete && (
              <Btn variant="red_outline" size="sm" icon={<Trash2 size={13} />} onClick={() => setConfirmDeleteProject(true)}>Delete</Btn>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <ProjectStatusBadge status={project.status} />
          <ProjectPriorityBadge priority={project.priority} showDot />
          {project.target_end_date && <MetaChip icon={Calendar}>Target: {formatDate(project.target_end_date)}</MetaChip>}
          {project.owner_admin?.name && <MetaChip icon={User}>Owner: {project.owner_admin.name}</MetaChip>}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="pd-tabs" style={{ marginBottom: activeTab === 'Messages' ? 0 : 24 }}>
        {TABS.map(({ key, icon: Icon }) => {
          const active = activeTab === key;
          const count  = tabCounts[key];
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 14px', borderRadius: '10px 10px 0 0',
              fontSize: '0.78rem', fontWeight: active ? 800 : 600,
              color: active ? purple : '#9ca3af',
              background: active ? purpleLt : 'transparent',
              border: 'none',
              borderBottom: active ? `2px solid ${purple}` : '2px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -2,
              transition: 'color 0.15s, background 0.15s',
            }}>
              <Icon size={13} />
              {key}
              {count > 0 && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: 9999,
                  background: active ? purple : '#f3f4f6',
                  color: active ? 'white' : '#9ca3af',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <div className="pd-overview">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel className="pd-panel">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Shield}>Project Details</SectionLabel>
              </div>
              <div style={{ padding: '18px 20px' }}>
                {project.description
                  ? <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.7, margin: 0 }}>{project.description}</p>
                  : <p style={{ fontSize: '0.83rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>No description provided.</p>}
              </div>
            </Panel>
            <Panel className="pd-panel">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
                <SectionLabel icon={Activity}>Recent Activity</SectionLabel>
              </div>
              <div style={{ padding: '18px 20px' }}>
                <ActivityFeed project={project} limit={5} />
              </div>
            </Panel>
          </div>
          <Panel className="pd-panel" accent>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border,#f3f4f6)' }}>
              <SectionLabel icon={Shield}>Info</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <InfoRow label="Customer"    value={project.customer?.name} />
              <InfoRow label="Owner"       value={project.owner_admin?.name || 'Unassigned'} />
              <InfoRow label="Currency"    value={project.base_currency} />
              <InfoRow label="Start Date"  value={formatDate(project.start_date)} />
              <InfoRow label="Target Date" value={formatDate(project.target_end_date)} />
              <InfoRow label="Delivery"    value={project.delivery_location} />
              <InfoRow label="Created"     value={formatDate(project.created_at)} />
            </div>
          </Panel>
        </div>
      )}

      {/* ── ITEMS ────────────────────────────────────────────────────────── */}
      {activeTab === 'Items' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" icon={<Plus size={14} />} onClick={() => setShowCreateItem(true)}>Add Item</Btn>
          </div>
          <ProjectItemsTable
            items={items} loading={loading.items}
            onEdit={item => { setEditItem(item); setShowCreateItem(false); }}
            onDelete={item => setConfirmDeleteItem(item)}
          />
        </div>
      )}

      {/* ── TASKS ────────────────────────────────────────────────────────── */}
      {activeTab === 'Tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" icon={<Plus size={14} />} onClick={() => setShowCreateTask(true)}>Create Task</Btn>
          </div>
          {loading.tasks ? <SkeletonList />
            : tasks.length === 0 ? <EmptyState icon={CheckSquare} label="No tasks yet." />
            : tasks.map(task => (
                <TaskCard key={task.id} task={task}
                  onStatusChange={handleStatusChange}
                  onUpdate={handleTaskUpdate}
                  onDelete={t => setConfirmDeleteTask(t)}
                />
              ))}
        </div>
      )}

      {/* ── MILESTONES ───────────────────────────────────────────────────── */}
      {activeTab === 'Milestones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              {selectedMilestones.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{selectedMilestones.length} selected</span>
                  <Btn variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handleBulkDelete}>Delete Selected</Btn>
                </div>
              )}
            </div>
            <Btn variant="ghost" icon={<Plus size={14} />} onClick={() => setShowCreateMilestone(true)}>Create Milestone</Btn>
          </div>
          {loading.milestones ? <SkeletonList />
            : milestones.length === 0 ? <EmptyState icon={Flag} label="No milestones yet." />
            : milestones.map(m => (
                <MilestoneCard key={m.id} milestone={m} projectId={id}
                  selected={selectedMilestones.includes(m.id)}
                  onSelect={toggleSelect}
                  canApprove canViewFinance isAdmin
                />
              ))}
        </div>
      )}

      {/* ── FINANCE ──────────────────────────────────────────────────────── */}
      {activeTab === 'Finance' && (
        <ProjectFinanceTab project={project} items={items} milestones={milestones} />
      )}

      {/* ── MESSAGES ─────────────────────────────────────────────────────── */}
      {activeTab === 'Messages' && (
        <div
          ref={msgRef}
          style={{
            display: 'flex', flexDirection: 'column',
            height: msgHeight,
            width: '100%',
            overflow: 'hidden',
          }}>
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            <MessageThread
              messages={messages}
              loading={loading.messages}
              currentUserId={user?.id}
              userRole={user?.role}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onDeleteMessages={handleDeleteMessages}
              onClearChat={handleClearChat}
            />
          </div>
          <MessageComposer onSend={handleSendMessage} loading={loading.submitting} isAdmin />
        </div>
      )}

      {/* ── PARTICIPANTS ─────────────────────────────────────────────────── */}
      {activeTab === 'Participants' && (
        <div style={{ maxWidth: 680 }}>
          <ParticipantsPanel project={project} />
        </div>
      )}

      {/* ── LINKS ────────────────────────────────────────────────────────── */}
      {activeTab === 'Links' && (
        <div style={{ maxWidth: 680 }}>
          <ProjectLinksPanel project={project} />
        </div>
      )}

      {/* ── ACTIVITY ─────────────────────────────────────────────────────── */}
      {activeTab === 'Activity' && (
        <div style={{ maxWidth: 680 }}>
          <ActivityFeed project={project} limit={50} />
        </div>
      )}

      {/* ── MODALS ───────────────────────────────────────────────────────── */}
      {showEdit && <EditProjectModal project={project} onClose={() => setShowEdit(false)} />}
      {showTransfer && <TransferOwnershipModal project={project} onClose={() => setShowTransfer(false)} />}
      {(showCreateItem || editItem) && (
        <CreateItemModal
          project={project}
          editItem={editItem || null}
          onClose={() => { setShowCreateItem(false); setEditItem(null); }}
        />
      )}
      {showCreateTask && <CreateTaskModal project={project} onClose={() => setShowCreateTask(false)} />}
      {showCreateMilestone && <CreateMilestoneModal project={project} onClose={() => setShowCreateMilestone(false)} />}

      {/* ── CONFIRM DIALOGS ──────────────────────────────────────────────── */}
      {confirmDeleteProject && (
        <ConfirmModal
          title="Delete Project"
          subtitle="This will move the project to trash"
          body={<>Are you sure you want to delete <strong style={{ color: 'var(--text,#111827)' }}>{project.title}</strong>? It can be restored from the trash by an admin.</>}
          confirmLabel="Move to Trash"
          onConfirm={handleDeleteProject}
          onCancel={() => setConfirmDeleteProject(false)}
          loading={loading.submitting}
        />
      )}
      {confirmDeleteItem && (
        <ConfirmModal
          title="Delete Item"
          body={<>Delete <strong style={{ color: 'var(--text,#111827)' }}>{confirmDeleteItem.description}</strong>? This cannot be undone.</>}
          confirmLabel="Delete"
          onConfirm={handleDeleteItem}
          onCancel={() => setConfirmDeleteItem(null)}
          loading={loading.submitting}
        />
      )}
      {confirmDeleteTask && (
        <ConfirmModal
          title="Delete Task"
          body={<>Delete <strong style={{ color: 'var(--text,#111827)' }}>{confirmDeleteTask.title}</strong>? This cannot be undone.</>}
          confirmLabel="Delete"
          onConfirm={handleDeleteTask}
          onCancel={() => setConfirmDeleteTask(null)}
          loading={loading.submitting}
        />
      )}
    </AdminLayout>
  );
};

export default ProjectDetail;