import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, PRIORITY } from '../lib/format';
import { hm, STATUS_TONE } from '../lib/tasks';
import { Btn, Chip, DataTable, Field, Notice, Panel, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';
import TaskPanel, { PeoplePicker } from './TaskPanel';

const blank = () => ({ title: '', phase_id: '', parent_id: '', priority: 'medium', due_date: '', estimate_hours: '', people: [] });

/**
 * The Work tab (docs/PROJECTS_STAGE5_SPEC.md, build 5.1): the tasks on a piece of work, grouped by phase, subtasks under their task. Filters keep
 * a matching subtask's parents so it shows where it belongs. Opening a task shows its panel below.
 */
export default function WorkPanel({ projectId, word }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [f, setF] = useState({ mine: false, overdue: false, status: '', phase_id: '', q: '' });
  const [adding, setAdding] = useState(null);
  const [open, setOpen] = useState(() => Number(new URLSearchParams(window.location.search).get('task')) || null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, v === true ? 1 : v]));
    try { setData(await projectsAPI.tasks(projectId, params)); setFailed(''); } catch (e) { setFailed(message(e, 'The tasks could not be loaded. Try again.')); }
  }, [projectId, f]);
  useEffect(() => { const id = setTimeout(load, f.q ? 250 : 0); return () => clearTimeout(id); }, [load, f.q]);

  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return null;
  const S = data.statuses;
  const task = word ? word('task') : 'Task';
  const phaseName = (id) => data.phases.find((p) => p.id === id)?.name;
  // top-level tasks group by phase; subtasks stay under their parent wherever it is
  const groups = [];
  let current = null;
  const byPhase = [...data.tasks];
  const tops = byPhase.filter((t) => t.depth === 0).sort((a, b) => (data.phases.findIndex((p) => p.id === a.phase_id) + 1 || 999) - (data.phases.findIndex((p) => p.id === b.phase_id) + 1 || 999));
  const childrenOf = (id) => { const out = []; const walk = (pid) => byPhase.filter((t) => t.parent_id === pid).forEach((c) => { out.push(c); walk(c.id); }); walk(id); return out; };
  tops.forEach((t) => {
    const key = t.phase_id ?? 0;
    if (!current || current.key !== key) { current = { key, name: t.phase_id ? phaseName(t.phase_id) : 'No phase', rows: [] }; groups.push(current); }
    current.rows.push(t, ...childrenOf(t.id));
  });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await projectsAPI.createTask(projectId, { ...adding, phase_id: adding.phase_id || null, parent_id: adding.parent_id || null, due_date: adding.due_date || null });
      setAdding(null); setProblem(''); toast.success(`${r.task.ref} added`); load();
    } catch (err) { setProblem(message(err, 'The task could not be added. Try again.')); } finally { setBusy(false); }
  };
  const filtered = f.mine || f.overdue || f.status || f.phase_id || f.q;

  return (
    <div style={{ display: 'grid', gap: 12 }} data-work>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <Btn small variant={f.mine ? 'primary' : 'plain'} aria-pressed={f.mine} onClick={() => setF({ ...f, mine: !f.mine })}>Mine</Btn>
          <Btn small variant={f.overdue ? 'primary' : 'plain'} aria-pressed={f.overdue} onClick={() => setF({ ...f, overdue: !f.overdue })}>Overdue</Btn>
          <SelectInput aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={{ width: 'auto' }}><option value="">Any status</option>{Object.entries(S).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
          {data.phases.length > 0 && <SelectInput aria-label="Phase" value={f.phase_id} onChange={(e) => setF({ ...f, phase_id: e.target.value })} style={{ width: 'auto' }}><option value="">Every phase</option>{data.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput>}
          <TextInput aria-label="Search tasks" placeholder="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} style={{ width: 180 }} />
        </div>
        {data.can.manage && !adding && <Btn variant="primary" small onClick={() => { setAdding(blank()); setProblem(''); }}>New {task.toLowerCase()}</Btn>}
      </div>

      {adding && (
        <Panel as="form" onSubmit={save} data-new-task>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label="Title" htmlFor="nt-title" style={{ gridColumn: '1 / -1' }}><TextInput id="nt-title" value={adding.title} maxLength={200} onChange={(e) => setAdding({ ...adding, title: e.target.value })} required autoFocus /></Field>
            <Field label="Phase" htmlFor="nt-phase"><SelectInput id="nt-phase" value={adding.phase_id} onChange={(e) => setAdding({ ...adding, phase_id: e.target.value })}><option value="">None</option>{data.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>
            <Field label="Under task" htmlFor="nt-parent"><SelectInput id="nt-parent" value={adding.parent_id} onChange={(e) => setAdding({ ...adding, parent_id: e.target.value })}><option value="">None (a task of its own)</option>{data.tasks.map((x) => <option key={x.id} value={x.id}>{x.ref} {x.title}</option>)}</SelectInput></Field>
            <Field label="Priority" htmlFor="nt-pri"><SelectInput id="nt-pri" value={adding.priority} onChange={(e) => setAdding({ ...adding, priority: e.target.value })}>{Object.entries(data.priorities).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
            <Field label="Due" htmlFor="nt-due"><TextInput id="nt-due" type="date" value={adding.due_date} onChange={(e) => setAdding({ ...adding, due_date: e.target.value })} /></Field>
            <Field label="Estimate (hours)" htmlFor="nt-est"><TextInput id="nt-est" type="number" min={0} step="0.25" value={adding.estimate_hours} onChange={(e) => setAdding({ ...adding, estimate_hours: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 10 }}><PeoplePicker people={data.people} value={adding.people} onChange={(people) => setAdding({ ...adding, people })} /></div>
          {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Btn type="submit" variant="primary" small busy={busy}>Add the {task.toLowerCase()}</Btn><Btn small onClick={() => setAdding(null)}>Cancel</Btn></div>
        </Panel>
      )}

      {data.tasks.length === 0 && <Panel><p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>{filtered ? 'Nothing matches.' : `No ${word ? word('task', true).toLowerCase() : 'tasks'} yet.`}{!filtered && data.can.manage ? ` Add one with New ${task.toLowerCase()}.` : ''}</p></Panel>}
      {data.tasks.length > 0 && (
        <Panel style={{ padding: 0 }}>
          <DataTable minWidth={760}>
            <thead><tr><th style={th}>{task}</th><th style={th}>People</th><th style={th}>Status</th><th style={th}>Due</th><th style={{ ...th, textAlign: 'right' }}>Estimate</th><th style={{ ...th, textAlign: 'right' }}>Logged</th></tr></thead>
            <tbody>
              {groups.map((g) => [
                data.phases.length > 0 && <tr key={`g${g.key}`}><td colSpan={6} style={{ ...td, background: 'var(--surface-input)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{g.name}</td></tr>,
                ...g.rows.map((t) => (
                  <tr key={t.id} data-task-row={t.ref} style={{ opacity: t.matches === false ? 0.6 : 1, background: open === t.id ? 'var(--surface-hover)' : undefined }}>
                    <td style={{ ...td, paddingLeft: 12 + t.depth * 22 }}>
                      <button type="button" onClick={() => setOpen(t.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}>
                        <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>T{t.number}</span><strong style={{ fontWeight: t.depth ? 500 : 600, textDecoration: t.status === 'cancelled' ? 'line-through' : 'none' }}>{t.title}</strong>
                      </button>
                      <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, flexWrap: 'wrap', verticalAlign: 'middle' }}>
                        {t.checks.total > 0 && <Chip>{t.checks.done} of {t.checks.total} checks</Chip>}
                        {t.waits_for.some((w) => w.open) && <Chip status="warning">waits for {t.waits_for.filter((w) => w.open).map((w) => w.ref.split('-').pop()).join(', ')}</Chip>}
                        {t.priority !== 'medium' && t.priority !== 'low' && <Chip status={PRIORITY[t.priority].status}>{PRIORITY[t.priority].label}</Chip>}
                      </span>
                    </td>
                    <td style={td}>{t.people.map((x) => x.name).join(', ') || <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                    <td style={td}><Chip status={STATUS_TONE[t.status]}>{S[t.status]}</Chip></td>
                    <td style={td}>{t.overdue ? <Chip status="problem">Overdue · {day(t.due_date)}</Chip> : t.due_date ? day(t.due_date) : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hm(t.estimate_minutes)}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hm(t.logged_minutes)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </DataTable>
        </Panel>
      )}
      {open && <TaskPanel key={open} projectId={projectId} taskId={open} list={data} onChanged={load} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </div>
  );
}
