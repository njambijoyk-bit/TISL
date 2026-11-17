import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, PRIORITY } from '../lib/format';
import { hm, STATUS_TONE } from '../lib/tasks';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { startTimer } from '../lib/timer';

const box = { display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 };

/**
 * One task (build 5.1): its details, status, checklist, subtasks and what it waits for. Someone who manages tasks changes everything; someone the
 * task is given to moves its status and ticks its checklist. Starting it before what it waits for is done asks why.
 */
export default function TaskPanel({ projectId, taskId, list, onChanged, onClose, onOpen, pending = null }) {
  const [t, setT] = useState(null);
  const [edit, setEdit] = useState(null);
  const [why, setWhy] = useState(null);   // { status, text } when a reason is needed
  const [check, setCheck] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const load = useCallback(async () => {
    try { setT((await projectsAPI.task(projectId, taskId)).task); setProblem(''); } catch (e) { setProblem(message(e, 'This task could not be opened.')); }
  }, [projectId, taskId]);
  useEffect(() => { setEdit(null); setWhy(pending); setSure(false); load(); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps -- a move refused on the board arrives once, with the panel

  const run = async (call, done) => {
    setBusy(true);
    try { const r = await call(); if (r?.task) setT(r.task); setProblem(''); if (done) toast.success(done); onChanged?.(); return true; }
    catch (e) {
      if (e?.response?.data?.needs_reason) { setWhy((w) => ({ status: w?.status, text: '', message: e.response.data.message })); return false; }
      setProblem(message(e, 'That could not be done. Try again.')); return false;
    } finally { setBusy(false); }
  };
  if (!t) return problem ? <Notice status="problem" style={{ marginTop: 12 }}>{problem}</Notice> : null;
  const S = list.statuses;
  const move = (status, reason) => { setWhy((w) => (w ? { ...w, status } : { status, text: '' })); run(() => projectsAPI.moveTask(projectId, t.id, status, reason), `Now ${S[status]}`).then((ok) => ok && setWhy(null)); };
  const startEdit = () => setEdit({ title: t.title, description: t.description ?? '', phase_id: t.phase_id ?? '', parent_id: t.parent_id ?? '', priority: t.priority, start_date: t.start_date ?? '', due_date: t.due_date ?? '',
    estimate_hours: t.estimate_minutes != null ? String(t.estimate_minutes / 60) : '', billable: t.billable === null ? '' : t.billable ? '1' : '0', people: t.people.map((x) => x.id), waits_for: t.waits_for.map((x) => x.id) });
  const others = list.tasks.filter((x) => x.id !== t.id);

  return (
    <Panel style={{ marginTop: 16 }} data-task={t.ref}>
      <PanelTitle hint={`${t.ref}${t.phase_id ? ` · ${list.phases.find((p) => p.id === t.phase_id)?.name ?? ''}` : ''}`} right={<Btn small onClick={onClose}>Close</Btn>}>{t.title}</PanelTitle>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Chip status={STATUS_TONE[t.status]}>{S[t.status]}</Chip>
        {t.priority !== 'medium' && <Chip status={PRIORITY[t.priority].status}>{PRIORITY[t.priority].label} priority</Chip>}
        {t.overdue && <Chip status="problem">Overdue</Chip>}
        {t.due_date && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Due {day(t.due_date)}</span>}
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Logged {hm(t.logged_minutes)}{t.estimate_minutes ? ` of ${hm(t.estimate_minutes)}` : ''}</span>
        {t.billable === false && <Chip>Not billable</Chip>}
      </div>
      {t.description && !edit && <p style={{ margin: '0 0 12px', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{t.description}</p>}
      {t.people.length > 0 && !edit && <p style={{ margin: '0 0 12px', fontSize: 13.5 }}><span style={{ color: 'var(--text-secondary)' }}>People: </span>{t.people.map((x) => x.name).join(', ')}</p>}
      {t.waits_for.length > 0 && !edit && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5 }} data-waits>
          <span style={{ color: 'var(--text-secondary)' }}>Starts when done: </span>
          {t.waits_for.map((w, i) => <span key={w.id}>{i > 0 && ', '}<button type="button" onClick={() => onOpen(w.id)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-primary-500)', cursor: 'pointer', font: 'inherit' }}>{w.ref}</button>{w.open ? '' : ' (done)'}</span>)}
        </p>
      )}

      {t.can.time && !edit && !['done', 'cancelled'].includes(t.status) && (
        <div style={{ marginBottom: 8 }}><Btn small aria-label={`Start a timer on ${t.ref}`} onClick={() => startTimer({ project_id: projectId, task_id: t.id })}>Start a timer on it</Btn></div>
      )}
      {t.can.work && !edit && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} data-moves>
          {Object.entries(S).filter(([k]) => k !== t.status).map(([k, label]) => <Btn key={k} small busy={busy} onClick={() => move(k)}>{k === 'done' ? 'Mark done' : k === 'cancelled' ? 'Cancel it' : label}</Btn>)}
        </div>
      )}
      {why?.message && (
        <form style={{ ...box, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); move(why.status, why.text); }} data-why>
          <Notice status="warning">{why.message}</Notice>
          <Field label="Why it goes ahead" htmlFor="task-why"><TextInput id="task-why" value={why.text} maxLength={200} onChange={(e) => setWhy({ ...why, text: e.target.value })} required /></Field>
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" small variant="primary" busy={busy}>Go ahead, {S[why.status]}</Btn><Btn small onClick={() => setWhy(null)}>Leave it</Btn></div>
        </form>
      )}

      {edit && (
        <form style={{ ...box, marginBottom: 12 }} onSubmit={(e) => {
          e.preventDefault();
          run(() => projectsAPI.updateTask(projectId, t.id, { ...edit, phase_id: edit.phase_id || null, parent_id: edit.parent_id || null, billable: edit.billable === '' ? null : edit.billable === '1' }), 'Saved').then((ok) => ok && setEdit(null));
        }}>
          <Field label="Title" htmlFor="te-title"><TextInput id="te-title" value={edit.title} maxLength={200} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required /></Field>
          <Field label="What it is (optional)" htmlFor="te-desc"><textarea id="te-desc" value={edit.description} maxLength={5000} rows={3} onChange={(e) => setEdit({ ...edit, description: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-strong)', borderRadius: 9, padding: '8px 10px', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)' }} /></Field>
          <div style={grid}>
            <Field label="Priority" htmlFor="te-pri"><SelectInput id="te-pri" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>{Object.entries(list.priorities).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
            <Field label="Phase" htmlFor="te-phase"><SelectInput id="te-phase" value={edit.phase_id} onChange={(e) => setEdit({ ...edit, phase_id: e.target.value })}><option value="">None</option>{list.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>
            <Field label="Under task" htmlFor="te-parent"><SelectInput id="te-parent" value={edit.parent_id} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value })}><option value="">None (a task of its own)</option>{others.map((x) => <option key={x.id} value={x.id}>{x.ref} {x.title}</option>)}</SelectInput></Field>
            <Field label="Starts" htmlFor="te-start"><TextInput id="te-start" type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} /></Field>
            <Field label="Due" htmlFor="te-due"><TextInput id="te-due" type="date" value={edit.due_date} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></Field>
            <Field label="Estimate (hours)" htmlFor="te-est"><TextInput id="te-est" type="number" min={0} step="0.25" value={edit.estimate_hours} onChange={(e) => setEdit({ ...edit, estimate_hours: e.target.value })} /></Field>
            <Field label="Billable" htmlFor="te-bill"><SelectInput id="te-bill" value={edit.billable} onChange={(e) => setEdit({ ...edit, billable: e.target.value })}><option value="">As the work ({list.billable_default ? 'billable' : 'not billable'})</option><option value="1">Billable</option><option value="0">Not billable</option></SelectInput></Field>
          </div>
          <PeoplePicker people={list.people} value={edit.people} onChange={(people) => setEdit({ ...edit, people })} />
          <Field label="Starts when these are done" htmlFor="te-waits">
            <SelectInput id="te-waits" multiple value={edit.waits_for.map(String)} onChange={(e) => setEdit({ ...edit, waits_for: [...e.target.selectedOptions].map((o) => Number(o.value)) })} style={{ minHeight: 80 }}>
              {others.map((x) => <option key={x.id} value={x.id}>{x.ref} {x.title}</option>)}
            </SelectInput>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" small variant="primary" busy={busy}>Save</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn></div>
        </form>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }} data-checklist>
        <strong style={{ fontSize: 13.5 }}>Checklist {t.checks.total > 0 && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {t.checks.done} of {t.checks.total}</span>}</strong>
        {t.checklist.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
            <input type="checkbox" id={`check-${c.id}`} checked={c.done} disabled={!t.can.work || busy} onChange={(e) => run(() => projectsAPI.tickTaskCheck(projectId, t.id, c.id, e.target.checked))} />
            <label htmlFor={`check-${c.id}`} style={{ flex: 1, textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--text-secondary)' : 'inherit' }}>{c.text}</label>
            {t.can.work && <Btn small variant="quiet" aria-label={`Remove ${c.text}`} onClick={() => run(() => projectsAPI.removeTaskCheck(projectId, t.id, c.id))}>×</Btn>}
          </div>
        ))}
        {t.can.work && (
          <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.addTaskCheck(projectId, t.id, check)).then((ok) => ok && setCheck('')); }}>
            <TextInput id="task-check" aria-label="New checklist line" placeholder="Add a line" value={check} maxLength={200} onChange={(e) => setCheck(e.target.value)} style={{ flex: 1 }} />
            <Btn type="submit" small busy={busy} disabled={!check.trim()}>Add</Btn>
          </form>
        )}
      </div>

      {t.subtasks.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          <strong style={{ fontSize: 13.5 }}>Subtasks</strong>
          {t.subtasks.map((s) => <button key={s.id} type="button" onClick={() => onOpen(s.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}><Chip status={STATUS_TONE[s.status]}>{S[s.status]}</Chip><span>{s.ref} {s.title}</span></button>)}
        </div>
      )}

      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      {t.can.manage && !edit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small onClick={startEdit}>Change</Btn>
          {!sure && <Btn small variant="danger" onClick={() => setSure(true)}>Delete</Btn>}
          {sure && <><Btn small variant="danger" busy={busy} onClick={async () => { try { const r = await projectsAPI.deleteTask(projectId, t.id); toast.success(r.message); onChanged?.(); onClose(); } catch (e) { setProblem(message(e, 'It could not be deleted.')); setSure(false); } }}>Yes, delete it{t.subtasks.length ? ' and its subtasks' : ''}</Btn><Btn small onClick={() => setSure(false)}>Keep it</Btn></>}
        </div>
      )}
    </Panel>
  );
}

/** Who a task is given to: people on the work, as toggles. */
export function PeoplePicker({ people, value, onChange }) {
  if (!people.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }} role="group" aria-label="People">
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>People</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {people.map((u) => {
          const on = value.includes(u.id);
          return <Btn key={u.id} small variant={on ? 'primary' : 'plain'} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}>{u.name}</Btn>;
        })}
      </div>
    </div>
  );
}
