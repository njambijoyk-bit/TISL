import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const blank = () => ({ title: '', kind: '', date: '', time: '', responsible_id: '', phase_id: '', task_id: '', warn_days: '' });
const when = (d) => `${day(d.starts_at)}${d.all_day ? '' : `, ${d.starts_at.slice(11, 16)}`}`;
const soon = (d) => {
  if (d.state === 'done') return <Chip status="good">Done</Chip>;
  if (d.state === 'missed') return <Chip status="problem">Missed</Chip>;
  if (d.days === 0) return <Chip status="warning">Today</Chip>;
  if (d.days === 1) return <Chip status="warning">Tomorrow</Chip>;
  return d.days <= 7 ? <Chip status="warning">In {d.days} days</Chip> : <Chip>In {d.days} days</Chip>;
};

/**
 * Key dates (docs/PROJECTS_STAGE5_SPEC.md, build 5.4): what must not slip, with warnings before, on the day and when missed, on everyone's
 * calendar. Moving one asks why and keeps where it was.
 */
export default function KeyDatesPanel({ projectId, word }) {
  const [data, setData] = useState(null);
  const [past, setPast] = useState(false);
  const [form, setForm] = useState(null);
  const [moving, setMoving] = useState(null);   // { id, date, time, reason }
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.keyDates(projectId, past ? { past: 1 } : {})); } catch (e) { setProblem(message(e, 'The key dates could not be loaded.')); } }, [projectId, past]);
  useEffect(() => { load(); }, [load]);
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setProblem(''); toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); return false; } finally { setBusy(false); }
  };
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const name = word ? word('key_date', true) : 'Key dates';
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const save = (e) => {
    e.preventDefault();
    const body = { ...form, responsible_id: form.responsible_id || null, phase_id: form.phase_id || null, task_id: form.task_id || null };
    run(() => (form.id ? projectsAPI.changeKeyDate(projectId, form.id, body) : projectsAPI.addKeyDate(projectId, body)), form.id ? 'Saved' : 'Added').then((ok) => ok && setForm(null));
  };

  return (
    <Panel data-key-dates>
      <PanelTitle hint={`Warnings ${data.warn_days.split(',').join(', ')} days before unless a date has its own, on the day, and when missed.`}
        right={<span style={{ display: 'inline-flex', gap: 8 }}><Btn small variant="quiet" aria-pressed={past} onClick={() => setPast(!past)}>{past ? 'Hide old ones' : 'Show old ones'}</Btn>{data.can.manage && !form && <Btn small variant="primary" onClick={() => { setForm(blank()); setProblem(''); }}>Add a date</Btn>}</span>}>{name}</PanelTitle>

      {form && (
        <form onSubmit={save} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }} data-key-date-form>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <Field label="What it is" htmlFor="kd-title" style={{ gridColumn: 'span 2' }}><TextInput id="kd-title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} required /></Field>
            <Field label="Kind" htmlFor="kd-kind"><SelectInput id="kd-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value })}><option value="">None</option>{data.kinds.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</SelectInput></Field>
            {!form.id && <Field label="Date" htmlFor="kd-date"><TextInput id="kd-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required /></Field>}
            {!form.id && <Field label="Time (empty: all day)" htmlFor="kd-time"><TextInput id="kd-time" type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} /></Field>}
            <Field label="Responsible" htmlFor="kd-who"><SelectInput id="kd-who" value={form.responsible_id} onChange={(e) => set({ responsible_id: e.target.value })}><option value="">Nobody in particular</option>{data.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>
            {data.phases.length > 0 && <Field label="Phase" htmlFor="kd-phase"><SelectInput id="kd-phase" value={form.phase_id} onChange={(e) => set({ phase_id: e.target.value })}><option value="">None</option>{data.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>}
            {data.tasks.length > 0 && <Field label="Task" htmlFor="kd-task"><SelectInput id="kd-task" value={form.task_id} onChange={(e) => set({ task_id: e.target.value })}><option value="">None</option>{data.tasks.map((t) => <option key={t.id} value={t.id}>{t.ref} {t.title}</option>)}</SelectInput></Field>}
            <Field label="Its own warnings (days before)" htmlFor="kd-warn" hint={`Empty: ${data.warn_days}`}><TextInput id="kd-warn" value={form.warn_days} onChange={(e) => set({ warn_days: e.target.value })} placeholder={data.warn_days} /></Field>
          </div>
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" small variant="primary" busy={busy}>{form.id ? 'Save' : 'Add the date'}</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></div>
        </form>
      )}

      {data.dates.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No key dates{past ? '' : ' coming up'}.</p>}
      {data.dates.length > 0 && (
        <DataTable minWidth={760}>
          <thead><tr><th style={th}>When</th><th style={th}>What</th><th style={th}>Responsible</th><th style={th}>State</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.dates.map((d) => (
              <tr key={d.id} data-key-date={d.title}>
                <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{when(d)}{d.moved_from && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }} title={d.move_reason ?? ''}>moved from {day(d.moved_from)}{d.moved_by ? ` by ${d.moved_by}` : ''}: {d.move_reason}</span>}{d.made_by_rule && <span data-made-by-rule style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>made by the rule "{d.made_by_rule}"</span>}</td>
                <td style={td}><strong style={{ fontWeight: 600 }}>{d.title}</strong>{d.kind_name && <Chip style={{ marginLeft: 6 }}>{d.kind_name}</Chip>}{d.task && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{d.task.ref} {d.task.title}</span>}</td>
                <td style={td}>{d.responsible?.name ?? <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                <td style={td}>{soon(d)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {moving?.id === d.id ? (
                    <form style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeKeyDate(projectId, d.id, { date: moving.date, time: moving.time, reason: moving.reason }), 'Moved').then((ok) => ok && setMoving(null)); }}>
                      <TextInput aria-label="New date" type="date" value={moving.date} onChange={(e) => setMoving({ ...moving, date: e.target.value })} required style={{ width: 150 }} />
                      <TextInput aria-label="New time (empty: all day)" type="time" value={moving.time} onChange={(e) => setMoving({ ...moving, time: e.target.value })} style={{ width: 110 }} />
                      <TextInput aria-label="Why it moved" placeholder="Why it moved" value={moving.reason} maxLength={200} onChange={(e) => setMoving({ ...moving, reason: e.target.value })} required style={{ width: 170 }} />
                      <Btn type="submit" small variant="primary" busy={busy}>Move it</Btn><Btn small onClick={() => setMoving(null)}>×</Btn>
                    </form>
                  ) : data.can.manage && (
                    <>
                      {d.state !== 'done' && <Btn small aria-label={`Mark ${d.title} done`} onClick={() => run(() => projectsAPI.changeKeyDate(projectId, d.id, { done: true }), 'Marked done')}>Done</Btn>}
                      {d.state === 'done' && <Btn small variant="quiet" aria-label={`Reopen ${d.title}`} onClick={() => run(() => projectsAPI.changeKeyDate(projectId, d.id, { done: false }), 'Reopened')}>Reopen</Btn>}
                      {d.state !== 'done' && <Btn small variant="quiet" aria-label={`Move ${d.title}`} onClick={() => setMoving({ id: d.id, date: d.starts_at.slice(0, 10), time: d.all_day ? '' : d.starts_at.slice(11, 16), reason: '' })}>Move</Btn>}
                      <Btn small variant="quiet" aria-label={`Change ${d.title}`} onClick={() => setForm({ id: d.id, title: d.title, kind: d.kind ?? '', responsible_id: d.responsible?.id ?? '', phase_id: d.phase_id ?? '', task_id: d.task?.id ?? '', warn_days: d.warn_days ?? '' })}>Change</Btn>
                      <Btn small variant="quiet" aria-label={`Delete ${d.title}`} onClick={() => run(() => projectsAPI.deleteKeyDate(projectId, d.id), 'Deleted')}>Delete</Btn>
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
