import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const ANSWER = [['pass', 'Passed', 'good'], ['fail', 'Failed', 'problem'], ['na', 'Not applicable', 'neutral']];
const big = { minHeight: 42, padding: '9px 13px', fontSize: 14 };

/** One inspection: each question answered with a tap, a note and a photo; finished with the inspector's typed name. */
function Inspection({ projectId, id, onBack, onDone }) {
  const [d, setD] = useState(null);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const camera = useRef(null);
  const photoFor = useRef(null);
  useEffect(() => { projectsAPI.inspection(projectId, id).then(setD).catch((e) => setProblem(message(e, 'The inspection could not be loaded.'))); }, [projectId, id]);
  if (!d) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const run = async (fn, done) => { try { setD(await fn()); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const i = d.inspection;
  return (
    <Panel data-inspection={i.id}>
      <PanelTitle hint={`${i.area ?? 'No area named'} · ${day(i.done_on)}${i.inspector ? ` · ${i.inspector}` : ''}`} right={<Btn small variant="quiet" onClick={onBack}>All inspections</Btn>}>{i.kind}</PanelTitle>
      {i.state === 'done' && <div data-inspection-outcome style={{ marginBottom: 10 }}><Notice status={i.outcome === 'passed' ? 'good' : 'problem'}>{i.outcome === 'passed' ? 'Passed.' : 'Failed. Each failed answer is now a snag.'}</Notice></div>}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {d.answers.map((a) => (
        <div key={a.no} data-answer={a.no} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 14.5 }}><strong>{a.no}.</strong> {a.question}{a.snag && <> <Chip status={a.snag.state === 'closed' ? 'good' : 'warning'}>Snag {a.snag.number}</Chip></>}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {ANSWER.map(([k, l, tone]) => d.can.answer
              ? <Btn key={k} style={big} variant={a.answer === k ? 'primary' : 'plain'} aria-pressed={a.answer === k} onClick={() => run(() => projectsAPI.answerInspection(projectId, i.id, a.no, { answer: k, note: a.note }))}>{l}</Btn>
              : a.answer === k && <Chip key={k} status={tone}>{l}</Chip>)}
            {d.can.answer && <Btn style={big} variant="quiet" onClick={() => { photoFor.current = a.no; camera.current?.click(); }}>{a.file ? 'Photo ✓' : '+ Photo'}</Btn>}
            {!d.can.answer && a.file && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Photo: {a.file.name}</span>}
          </div>
          {d.can.answer ? <TextInput aria-label={`Note on question ${a.no}`} placeholder="A note (what is wrong, where)" defaultValue={a.note ?? ''} onBlur={(e) => e.target.value !== (a.note ?? '') && run(() => projectsAPI.answerInspection(projectId, i.id, a.no, { answer: a.answer, note: e.target.value }))} style={big} />
            : a.note && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{a.note}</span>}
        </div>
      ))}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take a photo for the question" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f && photoFor.current) run(() => projectsAPI.inspectionPhoto(projectId, i.id, photoFor.current, f), 'Photo kept in Files'); }} />
      {d.can.answer && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <TextInput aria-label="Type your full name to finish" placeholder="Type your full name to finish" value={name} onChange={(e) => setName(e.target.value)} style={{ ...big, flex: 1, minWidth: 200 }} />
          <Btn variant="primary" style={big} onClick={async () => { if (await run(() => projectsAPI.finishInspection(projectId, i.id, name), 'Inspection finished')) onDone?.(); }}>Finish</Btn>
        </div>
      )}
    </Panel>
  );
}

/** Inspections on a piece of work (docs/PROJECTS_STAGE10_SPEC.md, build 10.6). */
export default function InspectionsPanel({ projectId, word = (k) => k }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.inspections(projectId)); } catch (e) { setProblem(message(e, 'The inspections could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice>The site is not set up yet. Run script 267.</Notice>;
  if (open) return <Inspection projectId={projectId} id={open} onBack={() => { setOpen(null); load(); }} onDone={load} />;
  const start = async (e) => {
    e.preventDefault();
    try { const r = await projectsAPI.startInspection(projectId, { kind_id: Number(form.kind_id), area: form.area || null, done_on: form.done_on || null }); setForm(null); setProblem(''); setOpen(r.inspection.id); } catch (err) { setProblem(message(err, 'It could not be started.')); }
  };
  return (
    <Panel data-inspections>
      <PanelTitle hint="A failed answer becomes a snag" right={data.can.inspect && !form && data.kinds.length > 0 ? <Btn small onClick={() => setForm({ kind_id: data.kinds[0].id, area: '', done_on: '' })}>Start an inspection</Btn> : null}>{word('inspection', true)}</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={start} data-inspection-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Field label="Kind" htmlFor="in-kind"><SelectInput id="in-kind" value={form.kind_id} onChange={(e) => setForm({ ...form, kind_id: e.target.value })}>{data.kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</SelectInput></Field>
          <Field label="Where (optional)" htmlFor="in-area"><TextInput id="in-area" value={form.area} maxLength={160} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
          <Field label="Day (optional)" htmlFor="in-day"><TextInput id="in-day" type="date" value={form.done_on} onChange={(e) => setForm({ ...form, done_on: e.target.value })} /></Field>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Start</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      {data.inspections.length === 0 && !form && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No inspections yet.</p>}
      {data.inspections.map((i) => (
        <div key={i.id} data-inspection-row={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <button type="button" onClick={() => setOpen(i.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--text-primary)', textAlign: 'left' }}><strong>{i.kind}</strong> <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {i.area ?? 'no area'} · {day(i.done_on)}{i.inspector ? ` · ${i.inspector}` : ''}</span></button>
          <span style={{ display: 'flex', gap: 6 }}>{i.failed > 0 && <Chip status="warning">{i.failed} {i.failed === 1 ? 'snag' : 'snags'}</Chip>}<Chip status={i.state === 'draft' ? 'info' : i.outcome === 'passed' ? 'good' : 'problem'}>{i.state === 'draft' ? 'In progress' : i.outcome === 'passed' ? 'Passed' : 'Failed'}</Chip></span>
        </div>
      ))}
    </Panel>
  );
}
