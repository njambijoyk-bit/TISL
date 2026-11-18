import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const TONE = { on_track: 'good', at_risk: 'warning', done: 'good', dropped: 'neutral' };
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Goals, reviews and one-to-ones on a person's page (docs/PROJECTS_STAGE8_SPEC.md, build 8.3). Seen by the person and the managers above them
 * with the permission; nobody else. The person updates their goals' progress, comments on and acknowledges reviews, and adds to one-to-one
 * notes; each writer may keep a private note on a one-to-one that only they see.
 */
export default function GrowthPanel({ userId, work = [] }) {
  const [g, setG] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [goalForm, setGoalForm] = useState(null);
  const [reviewForm, setReviewForm] = useState(null);
  const [meetForm, setMeetForm] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setG(await projectsAPI.growth(userId)); } catch (e) { if (e?.response?.status === 404) setHidden(true); else setProblem(message(e, 'Goals and reviews could not be loaded.')); } }, [userId]);
  useEffect(() => { load(); }, [load]);
  if (hidden) return null;
  if (!g) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const run = async (call, done) => { try { setG(await call()); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be saved.')); return false; } };
  const mine = g.can.self;

  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 16 }} data-growth>
      {problem && <Notice status="problem">{problem}</Notice>}
      <Panel data-goals>
        <PanelTitle hint={mine ? 'Set by your manager. Keep how far along each is up to date.' : 'What they are working towards'} right={g.can.manage && !goalForm ? <Btn small onClick={() => setGoalForm({ title: '', measure: '', due_on: '' })}>Set a goal</Btn> : null}>Goals</PanelTitle>
        {goalForm && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => projectsAPI.saveGoal(userId, null, goalForm), 'Goal set')) setGoalForm(null); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
            <Field label="Goal" htmlFor="gl-title"><TextInput id="gl-title" value={goalForm.title} maxLength={200} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} required /></Field>
            <Field label="How it is measured" htmlFor="gl-measure"><TextInput id="gl-measure" value={goalForm.measure} maxLength={300} onChange={(e) => setGoalForm({ ...goalForm, measure: e.target.value })} /></Field>
            <Field label="By" htmlFor="gl-due"><TextInput id="gl-due" type="date" value={goalForm.due_on} onChange={(e) => setGoalForm({ ...goalForm, due_on: e.target.value })} /></Field>
            <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Set it</Btn><Btn small onClick={() => setGoalForm(null)}>Cancel</Btn></span>
          </form>
        )}
        {g.goals.length === 0 && !goalForm && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No goals yet.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {g.goals.map((x) => (
            <div key={x.id} data-goal={x.title} style={{ display: 'grid', gap: 4, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>{x.title}</strong>
                <span style={{ display: 'flex', gap: 6 }}><Chip status={TONE[x.state]}>{g.states[x.state]}</Chip>{x.due_on && <Chip>By {day(x.due_on)}</Chip>}</span>
              </div>
              {x.measure && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{x.measure}</span>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div role="progressbar" aria-label={`${x.title} progress`} aria-valuenow={x.progress} aria-valuemin={0} aria-valuemax={100} style={{ flex: '1 1 160px', height: 8, borderRadius: 4, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                  <div style={{ width: `${x.progress}%`, height: '100%', background: 'var(--color-primary-500)' }} />
                </div>
                <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{x.progress}%</span>
                {(mine || g.can.manage) && <>
                  <SelectInput aria-label={`How far along ${x.title} is`} value={String(Math.round(x.progress / 10) * 10)} onChange={(e) => run(() => projectsAPI.saveGoal(userId, x.id, { progress: Number(e.target.value) }), 'Updated')} style={{ width: 'auto', fontSize: 12.5, padding: '3px 6px' }}>
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => <option key={n} value={n}>{n}%</option>)}
                  </SelectInput>
                  <SelectInput aria-label={`How ${x.title} is going`} value={x.state} onChange={(e) => run(() => projectsAPI.saveGoal(userId, x.id, { state: e.target.value }), 'Updated')} style={{ width: 'auto', fontSize: 12.5, padding: '3px 6px' }}>
                    {Object.entries(g.states).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </SelectInput>
                </>}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel data-reviews>
        <PanelTitle hint={mine ? 'Read each one, add your words, and acknowledge it.' : 'A draft stays yours until you share it.'} right={g.can.manage && !reviewForm ? <Btn small onClick={() => setReviewForm({ period: '', body: '' })}>Write a review</Btn> : null}>Reviews</PanelTitle>
        {reviewForm && (
          <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <Field label="Period" htmlFor="rv-period"><TextInput id="rv-period" value={reviewForm.period} placeholder="2026, second half" maxLength={60} onChange={(e) => setReviewForm({ ...reviewForm, period: e.target.value })} /></Field>
            <textarea aria-label="The review" rows={6} value={reviewForm.body} onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })} style={area} />
            <span style={{ display: 'flex', gap: 6 }}>
              <Btn small onClick={async () => { if (await run(() => projectsAPI.saveReview(userId, reviewForm.id ?? null, reviewForm), 'Saved as a draft')) setReviewForm(null); }}>Save the draft</Btn>
              <Btn small variant="primary" onClick={async () => { if (await run(() => projectsAPI.saveReview(userId, reviewForm.id ?? null, { ...reviewForm, share: true }), 'Shared with them')) setReviewForm(null); }}>Share it with them</Btn>
              <Btn small onClick={() => setReviewForm(null)}>Cancel</Btn>
            </span>
          </form>
        )}
        {g.reviews.length === 0 && !reviewForm && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No reviews yet.</p>}
        {g.reviews.map((r) => <Review key={r.id} r={r} mine={mine} manage={g.can.manage} onEdit={() => setReviewForm({ id: r.id, period: r.period, body: r.body })} onSave={(body, done) => run(() => projectsAPI.saveReview(userId, r.id, body), done)} />)}
      </Panel>

      <Panel data-one-to-ones>
        <PanelTitle hint="Notes are shared between the two of you. A private note is seen only by whoever writes it." right={g.can.manage && !meetForm ? <Btn small onClick={() => setMeetForm({ held_on: today(), notes: '', actions: [{ text: '', who: userId }], private_note: '' })}>Record a one-to-one</Btn> : null}>One-to-ones</PanelTitle>
        {meetForm && <MeetEditor form={meetForm} setForm={setMeetForm} manage onCancel={() => setMeetForm(null)} onSave={async () => { if (await run(() => projectsAPI.saveOneToOne(userId, null, meetForm), 'Recorded')) setMeetForm(null); }} />}
        {g.one_to_ones.length === 0 && !meetForm && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None recorded yet.</p>}
        {g.one_to_ones.map((o) => <OneToOne key={o.id} o={o} userId={userId} manage={g.can.manage} work={work} run={run} />)}
      </Panel>
    </div>
  );
}

function Review({ r, mine, manage, onEdit, onSave }) {
  const [comment, setComment] = useState(r.comment ?? '');
  return (
    <div data-review={r.period} style={{ display: 'grid', gap: 6, borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>{r.period}</strong>
        <span style={{ display: 'flex', gap: 6 }}>{!r.shared_at ? <Chip status="warning">Draft</Chip> : r.acknowledged_at ? <Chip status="good">Acknowledged</Chip> : <Chip status="info">Shared</Chip>}</span>
      </div>
      <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{r.body}</div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Written by {r.written_by}</span>
      {r.comment && !mine && <div style={{ fontSize: 13, padding: 8, borderRadius: 8, background: 'var(--surface-hover)' }}><strong>Their words:</strong> {r.comment}</div>}
      {manage && !r.acknowledged_at && <span><Btn small onClick={onEdit}>{r.shared_at ? 'Change it' : 'Change or share it'}</Btn></span>}
      {mine && r.shared_at && (
        <div style={{ display: 'grid', gap: 6 }}>
          <textarea aria-label={`Your words on ${r.period}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} style={area} placeholder="Your words on it (optional)" />
          <span style={{ display: 'flex', gap: 6 }}>
            <Btn small onClick={() => onSave({ comment }, 'Saved')}>Save my words</Btn>
            {!r.acknowledged_at && <Btn small variant="primary" onClick={() => onSave({ comment, acknowledge: true }, 'Acknowledged')}>Acknowledge it</Btn>}
          </span>
        </div>
      )}
    </div>
  );
}

function MeetEditor({ form, setForm, manage, onSave, onCancel }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      {manage && <Field label="Day you met" htmlFor="oo-day"><TextInput id="oo-day" type="date" value={form.held_on} onChange={(e) => setForm({ ...form, held_on: e.target.value })} /></Field>}
      <textarea aria-label="Shared notes" rows={4} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={area} placeholder="What you talked about (both of you see this)" />
      {manage && (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 12.5 }}>Action points</strong>
          {form.actions.map((a, i) => <TextInput key={i} aria-label={`Action point ${i + 1}`} value={a.text} onChange={(e) => setForm({ ...form, actions: form.actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />)}
          <span><Btn small onClick={() => setForm({ ...form, actions: [...form.actions, { text: '', who: form.actions[0]?.who ?? null }] })}>Add an action point</Btn></span>
        </div>
      )}
      <textarea aria-label="My private note" rows={2} value={form.private_note ?? ''} onChange={(e) => setForm({ ...form, private_note: e.target.value })} style={area} placeholder="A private note only you will see (optional)" />
      <span style={{ display: 'flex', gap: 6 }}><Btn small variant="primary" onClick={onSave}>Save</Btn><Btn small onClick={onCancel}>Cancel</Btn></span>
    </div>
  );
}

function OneToOne({ o, userId, manage, work, run }) {
  const [edit, setEdit] = useState(null);
  const [taskFor, setTaskFor] = useState(null);
  const [project, setProject] = useState(work[0]?.id ?? '');
  if (edit) return <MeetEditor form={edit} setForm={setEdit} manage={manage} onCancel={() => setEdit(null)} onSave={async () => { if (await run(() => projectsAPI.saveOneToOne(userId, o.id, manage ? edit : { notes: edit.notes, private_note: edit.private_note }), 'Saved')) setEdit(null); }} />;
  return (
    <div data-one-to-one={o.held_on} style={{ display: 'grid', gap: 6, borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 13.5 }}>{day(o.held_on)} with {o.manager}</strong><Btn small variant="quiet" onClick={() => setEdit({ held_on: o.held_on, notes: o.notes ?? '', actions: o.actions.length ? o.actions : [{ text: '', who: userId }], private_note: o.private_note ?? '' })}>Add to it</Btn></div>
      {o.notes && <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{o.notes}</div>}
      {o.actions.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {o.actions.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
              <span>• {a.text}</span>
              {a.task_id ? <Chip status="good">A task</Chip> : manage && (taskFor === i ? (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <SelectInput aria-label="On which piece of work" value={project} onChange={(e) => setProject(e.target.value)} style={{ width: 'auto', fontSize: 12.5, padding: '3px 6px' }}>{work.map((w) => <option key={w.id} value={w.id}>{w.number} {w.title}</option>)}</SelectInput>
                  <Btn small variant="primary" disabled={!project} onClick={async () => { if (await run(() => projectsAPI.oneToOneTask(userId, o.id, i, Number(project)), 'Made into a task')) setTaskFor(null); }}>Make it a task</Btn>
                </span>
              ) : work.length > 0 && <Btn small variant="quiet" onClick={() => setTaskFor(i)}>Make it a task</Btn>)}
            </div>
          ))}
        </div>
      )}
      {o.private_note && <div style={{ fontSize: 12.5, padding: 8, borderRadius: 8, background: 'var(--surface-hover)' }}><strong>Your private note:</strong> {o.private_note}</div>}
    </div>
  );
}
