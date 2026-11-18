import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message } from '../../lib/format';
import { hm } from '../../lib/tasks';
import { Btn, Chip, DataTable, Notice, SelectInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * The team view (docs/PROJECTS_STAGE8_SPEC.md, build 8.1): who is carrying what this week. The viewer, everyone below them in HR's manager line,
 * and with "see all work" everyone on the work they can see. G then E opens it. The filters live in the address.
 */
export default function ProjectsTeam() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState('');
  const query = params.toString();
  const load = useCallback(async () => { try { setData(await projectsAPI.team(Object.fromEntries(new URLSearchParams(query)))); setProblem(''); } catch (e) { setProblem(message(e, 'The team could not be loaded.')); } }, [query]);
  useEffect(() => { load(); }, [load]);
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const header = <PageHeader title="Team" subtitle={data ? `Week of ${day(data.week.from)}` : 'Who is carrying what'} actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />;
  if (problem) return <AdminLayout><ProjectKeys />{header}<Notice status="problem">{problem}</Notice></AdminLayout>;
  if (!data) return <AdminLayout><ProjectKeys />{header}</AdminLayout>;

  return (
    <AdminLayout><ProjectKeys />
      {header}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <SelectInput aria-label="Department" value={params.get('department') ?? ''} onChange={(e) => set('department', e.target.value)} style={{ width: 'auto' }}><option value="">Every department</option>{data.departments.map((d) => <option key={d} value={d}>{d}</option>)}</SelectInput>
        <SelectInput aria-label="Skill" value={params.get('skill') ?? ''} onChange={(e) => set('skill', e.target.value)} style={{ width: 'auto' }}><option value="">Any skill</option>{data.skills.map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput>
        <SelectInput aria-label="Piece of work" value={params.get('project_id') ?? ''} onChange={(e) => set('project_id', e.target.value)} style={{ width: 'auto', maxWidth: 260 }}><option value="">All work</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.title}</option>)}</SelectInput>
        <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!params.get('late')} onChange={(e) => set('late', e.target.checked ? '1' : '')} /> Has late tasks</label>
        <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!params.get('over')} onChange={(e) => set('over', e.target.checked ? '1' : '')} /> Over their hours</label>
      </div>
      <DataTable minWidth={860}>
        <thead><tr><th style={th}>Person</th><th style={th}>Tasks</th><th style={th}>This week</th><th style={th}>Dates and meetings</th><th style={th}>Away</th><th style={th}>On</th></tr></thead>
        <tbody>
          {data.people.length === 0 && <tr><td style={td} colSpan={6}>Nobody here with these filters.</td></tr>}
          {data.people.map((p) => {
            const over = p.week.minutes > p.week.capacity;
            return (
              <tr key={p.id} data-person={p.name}>
                <td style={td}>
                  <Link to={`/admin/projects/team/${p.id}`} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{p.name}</Link>{p.me ? ' (you)' : ''}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{[p.job_title, p.department].filter(Boolean).join(' · ')}</div>
                  {p.skills.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{p.skills.slice(0, 4).map((s) => <Chip key={s}>{s}</Chip>)}</div>}
                  {p.expiring > 0 && <div style={{ marginTop: 4 }}><Chip status="warning">{p.expiring === 1 ? 'A certificate runs out soon' : `${p.expiring} certificates run out soon`}</Chip></div>}
                </td>
                <td style={td}>{p.tasks.open} open{p.tasks.late > 0 && <> · <Chip status="problem">{p.tasks.late} late</Chip></>}</td>
                <td style={td}><span style={{ fontVariantNumeric: 'tabular-nums' }}>{hm(p.week.minutes)} of {hm(p.week.capacity)}</span>{over && <> <Chip status="warning">Over</Chip></>}</td>
                <td style={td}>{p.dates} {p.dates === 1 ? 'date' : 'dates'} · {p.meetings} {p.meetings === 1 ? 'meeting' : 'meetings'}</td>
                <td style={td}>{p.away.length ? p.away.map((d) => day(d)).join(', ') : '—'}</td>
                <td style={td}>{p.work.length === 0 ? '—' : p.work.slice(0, 3).map((w) => w.number).join(', ') + (p.work.length > 3 ? ` and ${p.work.length - 3} more` : '')}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </AdminLayout>
  );
}
