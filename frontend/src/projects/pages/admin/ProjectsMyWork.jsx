import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message, PRIORITY } from '../../lib/format';
import { hm, STATUS_TONE } from '../../lib/tasks';
import { clock, TIMER_CHANGED } from '../../lib/timer';
import { Btn, Chip, Notice, Panel, PanelTitle } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

const GROUPS = [['late', 'Late'], ['today', 'Today'], ['week', 'Later this week'], ['later', 'Later, or no date']];
const link = { color: 'var(--color-primary-500)', textDecoration: 'none', fontWeight: 600, fontSize: 13 };

/**
 * My Work (docs/PROJECTS_STAGE5_SPEC.md, build 5.10): each person's home in Projects. Their timer, their tasks by when, key dates coming up on their
 * work, their follow-ups due, this week's time, and what waits for them. G then M opens it.
 */
export default function ProjectsMyWork() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.myWork()); setProblem(''); } catch (e) { setProblem(message(e, 'My Work could not be loaded. Try again.')); } }, []);
  useEffect(() => { load(); window.addEventListener(TIMER_CHANGED, load); return () => window.removeEventListener(TIMER_CHANGED, load); }, [load]);

  const header = <PageHeader title="My Work" subtitle="What is yours to do in Projects" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />;
  if (problem) return <AdminLayout><ProjectKeys />{header}<Notice status="problem">{problem}</Notice></AdminLayout>;
  if (!data) return <AdminLayout><ProjectKeys />{header}</AdminLayout>;
  if (!data.ready) return <AdminLayout><ProjectKeys />{header}<Notice status="warning">My Work needs database script 261.</Notice></AdminLayout>;
  const count = GROUPS.reduce((n, [k]) => n + data.tasks[k].length, 0);
  const w = data.waiting;

  return (
    <AdminLayout><ProjectKeys />
      {header}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Panel data-mw-week>
          <PanelTitle hint={`${day(data.week.from)} to ${day(data.week.to)}`} right={<Link to="/admin/projects/timesheet" style={link}>Timesheet</Link>}>This week</PanelTitle>
          <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{hm(data.week.minutes)}</div>
          {data.timer && <p style={{ margin: '6px 0 0', fontSize: 13 }}>Timer on {data.timer.task ?? data.timer.project} · {clock(data.timer.seconds)}</p>}
          {data.week.can_submit && <Btn small variant="primary" busy={busy} style={{ marginTop: 10 }} onClick={async () => { setBusy(true); try { await projectsAPI.submitWeek(data.week.from); toast.success('Week submitted'); load(); } catch (e) { toast.error(message(e, 'It could not be submitted.')); } finally { setBusy(false); } }}>Submit the week</Btn>}
        </Panel>
        <Panel data-mw-waiting>
          <PanelTitle hint="Decisions others are waiting on">Waiting for you</PanelTitle>
          <div style={{ display: 'grid', gap: 8, fontSize: 13.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Link to="/admin/projects/timesheet?view=approve" style={link}>Time to approve</Link><strong>{w.time}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Changes to decide on</span><strong>{w.changes}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Link to="/admin/projects/approvals" style={link}>Approvals</Link><strong>{w.approvals}</strong></div>
            {w.messages != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><Link to="/admin/projects/inbox?unread=1" style={link}>Conversations to read</Link><strong>{w.messages}</strong></div>}
          </div>
        </Panel>
        <Panel data-mw-dates>
          <PanelTitle hint="On your work, the next 30 days">Key dates</PanelTitle>
          {data.dates.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing coming up.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {data.dates.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }} data-mw-date={d.title}>
                <Link to={`/admin/projects/${d.project_id}?tab=work&part=dates`} style={{ ...link, fontWeight: 500 }}>{d.project} · {d.title}</Link>
                {d.state === 'missed' ? <Chip status="problem">Missed</Chip> : <Chip status={d.days <= 7 ? 'warning' : 'neutral'}>{d.days === 0 ? 'Today' : d.days === 1 ? 'Tomorrow' : `In ${d.days} days`}</Chip>}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel data-mw-tasks>
        <PanelTitle hint={`${count} open ${count === 1 ? 'task' : 'tasks'} given to you`}>Your tasks</PanelTitle>
        {count === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing given to you right now.</p>}
        <div style={{ display: 'grid', gap: 14 }}>
          {GROUPS.filter(([k]) => data.tasks[k].length).map(([k, label]) => (
            <section key={k} data-mw-group={k}>
              <h3 style={{ margin: '0 0 6px', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: k === 'late' ? 'var(--status-error)' : 'var(--text-secondary)' }}>{label} · {data.tasks[k].length}</h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {data.tasks[k].map((t) => (
                  <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
                    <Link to={`/admin/projects/${t.project_id}?tab=work&task=${t.id}`} style={link}>{t.ref} {t.title}</Link>
                    <Chip status={STATUS_TONE[t.status]}>{t.status_name}</Chip>
                    {t.priority !== 'medium' && t.priority !== 'low' && <Chip status={PRIORITY[t.priority].status}>{PRIORITY[t.priority].label}</Chip>}
                    {t.due_date && <span style={{ color: 'var(--text-secondary)' }}>due {day(t.due_date)}</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Panel>

      {data.follow_ups.length > 0 && (
        <Panel style={{ marginTop: 16 }} data-mw-follow-ups>
          <PanelTitle hint="Next actions on leads, clients and opportunities, due or late" right={<Link to="/admin/projects/follow-ups" style={link}>All of them</Link>}>Follow-ups</PanelTitle>
          <div style={{ display: 'grid', gap: 6 }}>
            {data.follow_ups.map((f) => (
              <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
                {f.subject?.url ? <Link to={f.subject.url} style={link}>{f.subject.name}</Link> : <strong>{f.subject?.name}</strong>}
                <span>{f.what}</span>
                <Chip status={f.late ? 'problem' : 'warning'}>{f.late ? 'Late' : 'Today'}</Chip>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </AdminLayout>
  );
}
