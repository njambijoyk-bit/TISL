import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import Tabs from '../../../core/components/admin/ui/Tabs';
import eventsAPI, { eventsPlanAPI } from '../../../_shared/api/events';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { colors } from '../../../_shared/theme/tokens';
import PlanCrud from '../../components/plan/PlanCrud';
import OverviewPanel from '../../components/plan/OverviewPanel';
import TasksPanel from '../../components/plan/TasksPanel';
import GuestsPanel from '../../components/plan/GuestsPanel';
import BookingsPanel from '../../components/plan/BookingsPanel';
import PromotePanel from '../../components/plan/PromotePanel';
import MediaPanel from '../../components/admin/MediaPanel';

const money = (n) => Number(n || 0).toLocaleString();
const PROGRAMME = [{ key: 'day_on', label: 'Day', type: 'date' }, { key: 'starts_at', label: 'From (14:30)' }, { key: 'ends_at', label: 'To' }, { key: 'title', label: 'What happens', wide: true }, { key: 'location', label: 'Where' },
  { key: 'responsible', label: 'Who is responsible' }, { key: 'equipment', label: 'Equipment needed', wide: true }, { key: 'notes', label: 'Notes', wide: true }];
const BUDGET = [{ key: 'category', label: 'Category' }, { key: 'item', label: 'What for' }, { key: 'supplier', label: 'Supplier' }, { key: 'estimated', label: 'Estimated', type: 'number' }, { key: 'approved', label: 'Approved', type: 'number' },
  { key: 'committed', label: 'Committed', type: 'number', hint: 'Promised to a supplier.' }, { key: 'actual', label: 'Spent so far', type: 'number' }, { key: 'notes', label: 'Notes', wide: true }];
const TEAM = [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role', hint: 'Coordinator, photographer, usher…' }, { key: 'email', label: 'Their account email (optional)', hint: 'Links the person to their login.' }, { key: 'phone', label: 'Phone' },
  { key: 'sees_budget', label: 'Can see the budget', type: 'checkbox', hint: 'Leave off for a photographer or an usher.' }];
const MILESTONE = [{ key: 'title', label: 'Milestone', wide: true }, { key: 'due_on', label: 'Due', type: 'date' }, { key: 'client_visible', label: 'Show to the client', type: 'checkbox', blank: true }, { key: 'done', label: 'Done', type: 'checkbox' }];

/** The planning workspace of one event: overview, tasks, milestones, running order, budget, team, guests, vendors and venues, pictures and documents, and promotion. */
export default function EventPlan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canEdit = hasPermission(user, 'events.edit');
  const [ev, setEv] = useState(null);
  const [budgetOk, setBudgetOk] = useState(true);
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    eventsAPI.show(id).then(setEv).catch((e) => { toast.error(errMsg(e, 'Could not open the event')); navigate('/admin/events', { replace: true }); });
    eventsPlanAPI.overview(id).then((o) => setBudgetOk(o.can_see_budget)).catch(() => {});
  }, [id, navigate]);

  const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'tasks', label: 'Tasks' }, { id: 'milestones', label: 'Milestones' }, { id: 'programme', label: 'Running order' }, ...(budgetOk ? [{ id: 'budget', label: 'Budget' }] : []),
    { id: 'team', label: 'Team' }, { id: 'guests', label: 'Guests' }, { id: 'bookings', label: 'Vendors and venues' }, { id: 'files', label: 'Pictures and documents' }, { id: 'promote', label: 'Promote' }];

  return (
    <AdminLayout>
      <div style={{ padding: '24px 24px 48px', maxWidth: 1050, margin: '0 auto' }}>
        <Link to={`/admin/events/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 12 }}><ArrowLeft size={14} /> Event details</Link>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: colors.primary }}>{ev?.title ?? 'Planning'}</h1>
        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: colors.textMuted }}>The private workspace for this event. Guests and the public see none of it, except what you choose to show.</p>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'overview' && <OverviewPanel eventId={id} canEdit={canEdit} />}
        {tab === 'tasks' && <TasksPanel eventId={id} canEdit={canEdit} />}
        {tab === 'milestones' && <PlanCrud eventId={id} what="milestones" title="milestone" addLabel="Add a milestone" canEdit={canEdit} fields={MILESTONE} empty="No milestones yet."
          columns={[{ key: 'title', label: 'Milestone', render: (m) => <span style={{ textDecoration: m.done_at ? 'line-through' : 'none' }}>{m.title}</span> }, { key: 'due_on', label: 'Due' }, { key: 'done_at', label: 'Done', render: (m) => (m.done_at ? String(m.done_at).slice(0, 10) : '—') }, { key: 'client_visible', label: 'Client sees it', render: (m) => (m.client_visible ? 'Yes' : 'No') }]} />}
        {tab === 'programme' && <PlanCrud eventId={id} what="programme" title="item" addLabel="Add to the running order" canEdit={canEdit} fields={PROGRAMME} empty="The running order is empty."
          columns={[{ key: 'day_on', label: 'Day' }, { key: 'starts_at', label: 'Time', render: (p) => [p.starts_at, p.ends_at].filter(Boolean).join(' – ') }, { key: 'title', label: 'What happens' }, { key: 'location', label: 'Where' }, { key: 'responsible', label: 'Who' }]} />}
        {tab === 'budget' && budgetOk && <PlanCrud eventId={id} what="budget" title="budget line" addLabel="Add a budget line" canEdit={canEdit} fields={BUDGET} pick={(r) => r.lines} empty="No budget lines yet."
          header={(r) => (
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: '0.86rem' }}>
              {[['Estimated', r.totals.estimated], ['Approved', r.totals.approved], ['Committed', r.totals.committed], ['Spent', r.totals.actual], ['Left', r.totals.remaining]].map(([l, v]) => <span key={l}><strong style={{ fontSize: '1.15rem', color: l === 'Left' && r.totals.warning ? colors.danger : undefined }}>{money(v)}</strong><br /><span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>{l}</span></span>)}
            </div>)}
          columns={[{ key: 'category', label: 'Category' }, { key: 'item', label: 'What for', render: (l) => <span>{l.item}{l.supplier ? <em style={{ color: colors.textFaint }}> · {l.supplier}</em> : ''}</span> }, { key: 'estimated', label: 'Est.', align: 'right', render: (l) => money(l.estimated) },
            { key: 'approved', label: 'Approved', align: 'right', render: (l) => money(l.approved) }, { key: 'committed', label: 'Committed', align: 'right', render: (l) => money(l.committed) }, { key: 'actual', label: 'Spent', align: 'right', render: (l) => money(l.actual) }]} />}
        {tab === 'team' && <PlanCrud eventId={id} what="team" title="person" addLabel="Add a team member" canEdit={canEdit} fields={TEAM} empty="No team yet."
          columns={[{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'phone', label: 'Phone' }, { key: 'sees_budget', label: 'Sees the budget', render: (t) => (t.sees_budget ? 'Yes' : 'No') }]} />}
        {tab === 'guests' && <GuestsPanel eventId={id} canEdit={canEdit} />}
        {tab === 'bookings' && <BookingsPanel eventId={id} canEdit={canEdit} />}
        {tab === 'files' && <MediaPanel type="event" id={Number(id)} readOnly={!canEdit} />}
        {tab === 'promote' && <PromotePanel eventId={id} canEdit={canEdit} published={ev?.status === 'published'} />}
      </div>
    </AdminLayout>
  );
}
