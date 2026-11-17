import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { hm } from '../lib/tasks';
import { startTimer, TIMER_CHANGED } from '../lib/timer';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const today = () => new Date().toISOString().slice(0, 10);
const STATE = { draft: ['Draft', 'neutral'], submitted: ['Submitted', 'info'], approved: ['Approved', 'good'], returned: ['Sent back', 'warning'] };

/**
 * Time on a piece of work (docs/PROJECTS_STAGE5_SPEC.md, build 5.6): a person's own, or everyone's for those who approve time here. Log time
 * (rounded up to the company's step), start a timer, change or delete a draft. What Attendance says is shown as a warning, or refuses, as set.
 */
export default function TimePanel({ projectId, presetTask = null }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [warn, setWarn] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.projectTime(projectId)); } catch (e) { setProblem(message(e, 'The time could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); window.addEventListener(TIMER_CHANGED, load); return () => window.removeEventListener(TIMER_CHANGED, load); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { project_id: projectId, work_date: form.work_date, hours: Number(form.hours), task_id: form.task_id || null, note: form.note, billable: form.billable === '' ? null : form.billable === '1',
        ...(form.user_id ? { user_id: Number(form.user_id), reason: form.reason } : {}) };
      const r = form.id ? await projectsAPI.changeTime(form.id, { ...body, minutes: Number(form.hours) * 60 }) : await projectsAPI.logTime(body);
      setWarn(r.warnings ?? []); setForm(null); setProblem(''); toast.success(form.id ? 'Saved' : `Logged ${hm(r.minutes)}`); load();
    } catch (err) { setProblem(message(err, 'The time could not be saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel data-time>
      <PanelTitle hint={`${data.everyone ? 'Everyone\'s time here' : 'Your time here'}: ${hm(data.totals.minutes)}, of which ${hm(data.totals.billable)} billable. Rounded up to ${data.rounding ? `${data.rounding} minutes` : 'the minute'}.`}
        right={data.can.log && !form && (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <Btn small onClick={() => startTimer({ project_id: projectId, task_id: presetTask })}>Start a timer</Btn>
            <Btn small variant="primary" onClick={() => { setForm({ work_date: today(), hours: '', task_id: presetTask ?? '', note: '', billable: '', user_id: '', reason: '' }); setProblem(''); }}>Log time</Btn>
          </span>
        )}>Time</PanelTitle>
      {warn.length > 0 && <Notice status="warning" style={{ marginBottom: 12 }}>{warn.join(' ')}</Notice>}

      {form && (
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }} data-time-form>
          {data.can.others && !form.id && <Field label="Whose time" htmlFor="tm-who"><SelectInput id="tm-who" value={form.user_id} onChange={(e) => set({ user_id: e.target.value })}><option value="">Mine</option>{data.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>}
          <Field label="Day" htmlFor="tm-date"><TextInput id="tm-date" type="date" max={today()} value={form.work_date} onChange={(e) => set({ work_date: e.target.value })} required /></Field>
          <Field label="Hours" htmlFor="tm-hours"><TextInput id="tm-hours" type="number" min={0.01} max={24} step="any" value={form.hours} onChange={(e) => set({ hours: e.target.value })} required /></Field>
          <Field label="Task" htmlFor="tm-task"><SelectInput id="tm-task" value={form.task_id} onChange={(e) => set({ task_id: e.target.value })}><option value="">The work in general</option>{data.tasks.map((t) => <option key={t.id} value={t.id}>{t.ref} {t.title}</option>)}</SelectInput></Field>
          <Field label="Billable" htmlFor="tm-bill"><SelectInput id="tm-bill" value={form.billable} onChange={(e) => set({ billable: e.target.value })}><option value="">As the task or the work</option><option value="1">Billable</option><option value="0">Not billable</option></SelectInput></Field>
          <Field label="What was done" htmlFor="tm-note" style={{ gridColumn: '1 / -1' }}><TextInput id="tm-note" value={form.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} /></Field>
          {form.user_id && <Field label="Why you are logging it for them" htmlFor="tm-reason" style={{ gridColumn: '1 / -1' }}><TextInput id="tm-reason" value={form.reason} maxLength={200} onChange={(e) => set({ reason: e.target.value })} required /></Field>}
          {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" small variant="primary" busy={busy}>{form.id ? 'Save' : 'Log it'}</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></div>
        </form>
      )}

      {data.entries.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No time logged yet.</p>}
      {data.entries.length > 0 && (
        <DataTable minWidth={720}>
          <thead><tr><th style={th}>Day</th>{data.everyone && <th style={th}>Who</th>}<th style={th}>On</th><th style={{ ...th, textAlign: 'right' }}>Time</th><th style={th}>State</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id} data-entry={e.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{day(e.work_date)}</td>
                {data.everyone && <td style={td}>{e.person}</td>}
                <td style={td}>{e.task ? `${e.task.ref} ${e.task.title}` : 'The work in general'}{e.note && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.note}</span>}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{hm(e.minutes)}{!e.billable && <Chip style={{ marginLeft: 6 }}>Not billable</Chip>}{e.source === 'timer' && <Chip style={{ marginLeft: 6 }}>Timer</Chip>}</td>
                <td style={td}><Chip status={STATE[e.state][1]}>{STATE[e.state][0]}</Chip>{e.entered_by_someone_else && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>logged for them</span>}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {['draft', 'returned'].includes(e.state) && (e.user_id === data.me || !data.everyone || data.can.others) && data.can.log && (
                    <>
                      <Btn small variant="quiet" aria-label={`Change the time on ${day(e.work_date)}`} onClick={() => setForm({ id: e.id, work_date: e.work_date, hours: String(e.minutes / 60), task_id: e.task?.id ?? '', note: e.note ?? '', billable: e.billable ? '1' : '0', user_id: '', reason: '' })}>Change</Btn>
                      <Btn small variant="quiet" aria-label={`Delete the time on ${day(e.work_date)}`} onClick={async () => { try { await projectsAPI.deleteTime(e.id); toast.success('Deleted'); load(); } catch (err) { setProblem(message(err, 'It could not be deleted.')); } }}>Delete</Btn>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {problem && !form && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
    </Panel>
  );
}
