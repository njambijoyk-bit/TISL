import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message } from '../../lib/format';
import { hm } from '../../lib/tasks';
import { Btn, Chip, Notice, Panel, PanelTitle } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';
import GrowthPanel from '../../components/GrowthPanel';
import ChecklistsPanel from '../../components/ChecklistsPanel';
import { PersonScorecard } from '../../components/PeopleInsights';

const link = { color: 'var(--color-primary-500)', textDecoration: 'none', fontWeight: 600 };

/**
 * One person (docs/PROJECTS_STAGE8_SPEC.md, build 8.1): their tasks, this week's time by day, what HR says about them (skills, certificates),
 * and the work they are on. Build 8.3 adds their goals, reviews and one-to-ones below, for the person and the managers above them.
 */
export default function ProjectsPerson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setP((await projectsAPI.teamPerson(id)).person); setProblem(''); } catch (e) { setProblem(message(e, 'This person could not be opened.')); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const header = <PageHeader title={p ? p.name : 'Person'} subtitle={p ? [p.job_title, p.department].filter(Boolean).join(' · ') : ''} actions={<Btn onClick={() => navigate(p?.me ? '/admin/projects/my-work' : '/admin/projects/team')}>{p?.me ? 'My Work' : 'Team'}</Btn>} />;
  if (problem) return <AdminLayout><ProjectKeys />{header}<Notice status="problem">{problem}</Notice></AdminLayout>;
  if (!p) return <AdminLayout><ProjectKeys />{header}</AdminLayout>;
  const max = Math.max(60, ...p.days.map((x) => x.minutes));

  return (
    <AdminLayout><ProjectKeys />
      {header}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }} data-person-page>
        <PersonScorecard userId={Number(id)} />
        <Panel data-person-tasks>
          <PanelTitle hint={`${p.tasks.open} open${p.tasks.late ? `, ${p.tasks.late} late` : ''}`}>Tasks</PanelTitle>
          {p.task_list.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing open.</p>}
          <div style={{ display: 'grid', gap: 6 }}>
            {p.task_list.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
                <Link to={`/admin/projects/${t.project_id}?tab=work&task=${t.id}`} style={{ ...link, fontWeight: 500 }}>{t.ref} {t.title}</Link>
                {t.due_date && <Chip status={t.late ? 'problem' : 'neutral'}>{day(t.due_date)}</Chip>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel data-person-week>
          <PanelTitle hint={`${hm(p.week.minutes)} of ${hm(p.week.capacity)}`}>This week</PanelTitle>
          <div role="img" aria-label="Time logged each day this week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', height: 110 }}>
            {p.days.map((x) => (
              <div key={x.date} style={{ display: 'grid', gap: 4, justifyItems: 'center', height: '100%', alignContent: 'end' }}>
                <div title={`${day(x.date)}: ${hm(x.minutes)}`} style={{ width: '70%', height: `${Math.max(2, (x.minutes / max) * 80)}px`, borderRadius: 4, background: p.away.includes(x.date) ? 'var(--line-strong)' : 'var(--color-primary-500)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(x.date).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>{p.dates} key {p.dates === 1 ? 'date' : 'dates'} and {p.meetings} {p.meetings === 1 ? 'meeting' : 'meetings'} this week{p.away.length ? `; away ${p.away.map((d) => day(d)).join(', ')}` : ''}.</p>
        </Panel>
        <Panel data-person-hr>
          <PanelTitle hint="From their HR record">Skills and certificates</PanelTitle>
          {p.skills.length > 0 ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{p.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div> : <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--text-secondary)' }}>No skills on their record.</p>}
          {p.certificates.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No certificates on their record.</p>}
          {p.certificates.map((c, i) => {
            const soon = c.expires_on && c.expires_on <= new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
            const gone = c.expires_on && c.expires_on < new Date().toISOString().slice(0, 10);
            return (
              <div key={`${c.name}${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, padding: '4px 0' }} data-certificate={c.name}>
                <span>{c.name}{c.issuer ? <span style={{ color: 'var(--text-secondary)' }}> · {c.issuer}</span> : null}</span>
                {c.expires_on ? <Chip status={gone ? 'problem' : soon ? 'warning' : 'neutral'}>{gone ? 'Ran out' : 'Runs out'} {day(c.expires_on)}</Chip> : <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No end date</span>}
              </div>
            );
          })}
        </Panel>
        <Panel>
          <PanelTitle>On</PanelTitle>
          {p.work.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No open work you can see.</p>}
          <div style={{ display: 'grid', gap: 6 }}>{p.work.map((w) => <Link key={w.id} to={`/admin/projects/${w.id}`} style={{ ...link, fontWeight: 500, fontSize: 13.5 }}>{w.number} {w.title}</Link>)}</div>
        </Panel>
      </div>
      <ChecklistsPanel key={`c${p.id}`} userId={p.id} />
      <GrowthPanel key={p.id} userId={p.id} work={p.work} />
    </AdminLayout>
  );
}
