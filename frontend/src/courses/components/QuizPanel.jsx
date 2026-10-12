import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../core/components/admin/ui/Form';
import coursesAPI from '../../_shared/api/courses';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import Pill from './Pill';

const KINDS = { single: 'One right answer', multiple: 'Several right answers', truefalse: 'True or false', short: 'Short text' };

function QuestionForm({ offeringId, lessonId, question, onClose, onDone }) {
  const [f, setF] = useState({ kind: question?.kind ?? 'single', body: question?.body ?? '', points: question?.points ?? 1, explanation: question?.explanation ?? '',
    options: question?.options?.length ? question.options : [{ id: 'o1', text: '' }, { id: 'o2', text: '' }], correct: question?.correct ?? [], accepted: question?.kind === 'short' ? (question.correct ?? []).join('\n') : '' });
  const [busy, setBusy] = useState(false);
  const choice = f.kind === 'single' || f.kind === 'multiple';
  const toggle = (id) => setF((x) => ({ ...x, correct: f.kind === 'single' ? [id] : x.correct.includes(id) ? x.correct.filter((i) => i !== id) : [...x.correct, id] }));
  const save = async () => {
    setBusy(true);
    try {
      const payload = { kind: f.kind, body: f.body, points: Number(f.points), explanation: f.explanation };
      if (choice) { payload.options = f.options.filter((o) => o.text.trim()); payload.correct = f.correct.filter((c) => payload.options.some((o) => o.id === c)); } else if (f.kind === 'truefalse') payload.correct = f.correct.slice(0, 1); else payload.correct = f.accepted.split('\n').map((x) => x.trim()).filter(Boolean);
      await coursesAPI.saveQuestion(offeringId, lessonId, payload, question?.id); toast.success('Question saved.'); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the question'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={question ? 'Edit question' : 'Add a question'} onClose={onClose} width={620} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save question" busy={busy} disabled={!f.body.trim()} />}>
      <FormStack>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <Field label="Kind" htmlFor="qq-kind"><SelectInput id="qq-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, correct: [] })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="Points" htmlFor="qq-pts"><TextInput id="qq-pts" inputMode="numeric" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></Field>
        </div>
        <Field label="Question" htmlFor="qq-body"><TextArea id="qq-body" rows={3} maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        {choice && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            <legend style={{ fontSize: '0.72rem', fontWeight: 800, marginBottom: 4 }}>Choices (tick the right {f.kind === 'single' ? 'one' : 'ones'})</legend>
            {f.options.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type={f.kind === 'single' ? 'radio' : 'checkbox'} name="qq-correct" aria-label={`Choice ${i + 1} is right`} checked={f.correct.includes(o.id)} onChange={() => toggle(o.id)} />
                <TextInput aria-label={`Choice ${i + 1}`} maxLength={300} value={o.text} onChange={(e) => setF((x) => ({ ...x, options: x.options.map((y) => (y.id === o.id ? { ...y, text: e.target.value } : y)) }))} />
                <button type="button" aria-label={`Remove choice ${i + 1}`} style={{ ...btnGhost, color: colors.danger }} disabled={f.options.length <= 2} onClick={() => setF((x) => ({ ...x, options: x.options.filter((y) => y.id !== o.id), correct: x.correct.filter((c) => c !== o.id) }))}><Trash2 size={13} aria-hidden="true" /></button>
              </div>
            ))}
            {f.options.length < 10 && <div><button type="button" style={btnGhost} onClick={() => setF((x) => ({ ...x, options: [...x.options, { id: `o${Date.now().toString(36)}`, text: '' }] }))}>Add a choice</button></div>}
          </fieldset>
        )}
        {f.kind === 'truefalse' && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 14 }}>
            <legend style={{ fontSize: '0.72rem', fontWeight: 800, marginBottom: 4 }}>The statement is</legend>
            {['true', 'false'].map((v) => <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" name="qq-tf" checked={f.correct[0] === v} onChange={() => setF({ ...f, correct: [v] })} /> {v === 'true' ? 'True' : 'False'}</label>)}
          </fieldset>
        )}
        {f.kind === 'short' && <Field label="Accepted answers (one on each line)" htmlFor="qq-acc" hint="Empty: you mark each answer yourself. With a list, a matching answer (ignoring capitals and spaces) is marked right at once."><TextArea id="qq-acc" rows={3} value={f.accepted} onChange={(e) => setF({ ...f, accepted: e.target.value })} /></Field>}
        <Field label="Explanation (shown with the answer)" htmlFor="qq-exp"><TextInput id="qq-exp" maxLength={1000} value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} /></Field>
      </FormStack>
    </Modal>
  );
}

/** Build a quiz: its rules and its questions. */
export function QuizEditor({ offering, lesson, onClose }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [rules, setRules] = useState(null);
  const load = useCallback(() => coursesAPI.quiz(offering.id, lesson.id).then((r) => { setD(r); setRules((x) => x ?? { pass_pct: r.quiz.pass_pct, max_attempts: r.quiz.max_attempts ?? '', time_limit_minutes: r.quiz.time_limit_minutes ?? '', shuffle: r.quiz.shuffle, show_answers: r.quiz.show_answers, instructions: r.quiz.instructions ?? '' }); }).catch((e) => toast.error(errMsg(e, 'Could not load the quiz'))), [offering.id, lesson.id]);
  useEffect(() => { load(); }, [load]);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const saveRules = async () => {
    try { await coursesAPI.saveQuizSettings(offering.id, lesson.id, { pass_pct: Number(rules.pass_pct), max_attempts: num(rules.max_attempts), time_limit_minutes: num(rules.time_limit_minutes), shuffle: rules.shuffle, show_answers: rules.show_answers, instructions: rules.instructions }); toast.success('Quiz rules saved.'); } catch (e) { toast.error(errMsg(e, 'Could not save the rules'), { duration: 8000 }); }
  };
  const move = async (i, dir) => {
    const ids = d.questions.map((q) => q.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { setD(await coursesAPI.reorderQuestions(offering.id, lesson.id, ids)); } catch (e) { toast.error(errMsg(e, 'Could not reorder')); }
  };

  return (
    <Modal title={`Quiz: ${lesson.title}`} onClose={onClose} width={720} footer={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" style={btnPrimary} onClick={onClose}>Done</button></div>}>
      {!d || !rules ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gap: 14 }}>
          <section style={{ ...card, padding: 12, display: 'grid', gap: 8 }}>
            <strong>Rules</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Field label="Pass mark (%)" htmlFor="qr-pass"><TextInput id="qr-pass" inputMode="numeric" value={rules.pass_pct} onChange={(e) => setRules({ ...rules, pass_pct: e.target.value })} /></Field>
              <Field label="Attempts" htmlFor="qr-att" hint="Empty: unlimited."><TextInput id="qr-att" inputMode="numeric" value={rules.max_attempts} onChange={(e) => setRules({ ...rules, max_attempts: e.target.value })} /></Field>
              <Field label="Time limit (min)" htmlFor="qr-time" hint="Empty: none."><TextInput id="qr-time" inputMode="numeric" value={rules.time_limit_minutes} onChange={(e) => setRules({ ...rules, time_limit_minutes: e.target.value })} /></Field>
              <Field label="Show the answers" htmlFor="qr-show"><SelectInput id="qr-show" value={rules.show_answers} onChange={(e) => setRules({ ...rules, show_answers: e.target.value })}><option value="never">Never</option><option value="after_pass">After the student passes</option><option value="after_each">After every attempt</option></SelectInput></Field>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={rules.shuffle} onChange={(e) => setRules({ ...rules, shuffle: e.target.checked })} /> Shuffle the questions and choices</label>
            <Field label="Instructions" htmlFor="qr-ins"><TextInput id="qr-ins" maxLength={1000} value={rules.instructions} onChange={(e) => setRules({ ...rules, instructions: e.target.value })} /></Field>
            <div><button type="button" style={btnPrimary} onClick={saveRules}>Save the rules</button></div>
          </section>
          <section style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Questions ({d.questions.length})</strong><button type="button" style={btnPrimary} onClick={() => setForm({})}><Plus size={14} aria-hidden="true" /> Add a question</button></div>
            {d.questions.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>No questions yet.</p>}
            {d.questions.map((q, i) => (
              <div key={q.id} data-question={q.body} style={{ ...card, padding: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200 }}>{i + 1}. {q.body}<div style={{ fontSize: '0.76rem', color: colors.textMuted }}>{q.kind_label} · {q.points} point{q.points === 1 ? '' : 's'}{q.kind === 'short' && q.correct.length === 0 ? ' · you mark it' : ''}</div></span>
                <button type="button" aria-label="Move up" style={btnGhost} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label="Move down" style={btnGhost} disabled={i === d.questions.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" style={btnGhost} onClick={() => setForm(q)}>Edit</button>
                <button type="button" aria-label="Remove question" style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('Remove this question?') && coursesAPI.removeQuestion(offering.id, lesson.id, q.id).then(setD).catch((e) => toast.error(errMsg(e, 'Could not remove it'), { duration: 8000 }))}><Trash2 size={13} aria-hidden="true" /></button>
              </div>
            ))}
          </section>
        </div>
      )}
      {form && <QuestionForm offeringId={offering.id} lessonId={lesson.id} question={form.id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
    </Modal>
  );
}

function Review({ offering, attemptId, onClose, onSaved }) {
  const [d, setD] = useState(null);
  const [pts, setPts] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { coursesAPI.attempt(offering.id, attemptId).then((r) => { setD(r); setPts(Object.fromEntries(r.questions.map((q) => [q.id, { points: q.earned ?? '', comment: q.comment ?? '' }]))); }).catch((e) => toast.error(errMsg(e, 'Could not load it'))); }, [offering.id, attemptId]);
  const show = (q) => {
    const opt = (id) => q.options.find((o) => o.id === id)?.text ?? id;
    if (q.given == null || q.given === '') return <em>No answer</em>;
    if (Array.isArray(q.given)) return q.given.map(opt).join(', ');
    return q.kind === 'single' ? opt(q.given) : String(q.given);
  };
  const right = (q) => (q.kind === 'short' ? (q.correct.length ? q.correct.join(' / ') : '—') : q.kind === 'truefalse' ? q.correct[0] : q.correct.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', '));
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.markAttempt(offering.id, attemptId, d.questions.map((q) => ({ question_id: q.id, points: Number(pts[q.id]?.points ?? 0), comment: pts[q.id]?.comment || undefined }))); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save the marks'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={d ? `${d.attempt.student} · attempt ${d.attempt.attempt_no}` : 'Attempt'} subtitle={d?.attempt.score_pct != null ? `${d.attempt.score_pct}% · ${d.attempt.passed ? 'passed' : 'not passed'} (pass mark ${d.attempt.pass_pct}%)` : `Pass mark ${d?.attempt.pass_pct ?? ''}%`} onClose={onClose} width={720}
      footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save the marks" busy={busy} disabled={!d || d.questions.some((q) => pts[q.id]?.points === '' || pts[q.id]?.points == null)} />}>
      {!d ? <p>Loading…</p> : d.questions.map((q, i) => (
        <div key={q.id} data-question={q.body} style={{ borderTop: '1px solid rgba(148,163,184,0.2)', padding: '10px 0', display: 'grid', gap: 4 }}>
          <strong>{i + 1}. {q.body}</strong>
          <span style={{ fontSize: '0.86rem' }}>Answer: {show(q)}</span>
          <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>Right: {right(q)}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input aria-label={`Points for question ${i + 1}`} inputMode="decimal" value={pts[q.id]?.points ?? ''} onChange={(e) => setPts({ ...pts, [q.id]: { ...pts[q.id], points: e.target.value } })} style={{ width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)', font: 'inherit' }} /> of {q.points}
            {q.auto && <Pill>Marked by the platform</Pill>}
            <input aria-label={`Comment on question ${i + 1}`} placeholder="Comment" maxLength={500} value={pts[q.id]?.comment ?? ''} onChange={(e) => setPts({ ...pts, [q.id]: { ...pts[q.id], comment: e.target.value } })} style={{ flex: 1, minWidth: 160, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)', font: 'inherit' }} />
          </div>
        </div>
      ))}
    </Modal>
  );
}

/** The quiz attempts of an offering: those waiting for marks first, then the rest. */
export function MarkingPanel({ offering }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => coursesAPI.attempts(offering.id).then(setD).catch(() => setD({ ready: false, attempts: [] })), [offering.id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p>Loading…</p>;
  if (!d.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 158_courses_quizzes.sql to switch quizzes on.</p>;

  return (
    <section style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
      <strong>Quiz attempts</strong>
      {d.attempts.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>Nobody has handed in a quiz yet.</p>}
      {d.attempts.map((a) => (
        <div key={a.id} data-attempt={a.student} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
          <span style={{ flex: 1, minWidth: 200 }}><strong>{a.student}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{a.quiz} · attempt {a.attempt_no}</span></span>
          {a.status === 'submitted' ? <Pill tone="warn">Waiting for your marks</Pill> : <Pill tone={a.passed ? 'ok' : 'danger'}>{a.score_pct}% · {a.passed ? 'passed' : 'not passed'}</Pill>}
          <button type="button" style={a.status === 'submitted' ? btnPrimary : btnGhost} onClick={() => setOpen(a.id)}>{a.status === 'submitted' ? 'Mark' : 'Review'}</button>
        </div>
      ))}
      {open && <Review offering={offering} attemptId={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </section>
  );
}
