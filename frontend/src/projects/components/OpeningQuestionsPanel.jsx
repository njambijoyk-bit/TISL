import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

/** The opening check's questions (docs/PROJECTS_STAGE11_SPEC.md, build 11.2), for a whole industry or one kind of work. */
export default function OpeningQuestionsPanel({ industries = [], startIndustry }) {
  const [industry, setIndustry] = useState(startIndustry || industries[0]?.key || '');
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { if (industry) projectsAPI.openingQuestions(industry).then(setD).catch((e) => setProblem(message(e, 'The questions could not be loaded.'))); }, [industry]);
  if (!d?.questions) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async (id, body) => { try { setD(await projectsAPI.saveOpeningQuestion(id, { industry, ...body })); setForm(null); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'That could not be saved.')); } };
  const typeName = (id) => d.types.find((t) => t.id === id)?.name;

  return (
    <Panel data-opening-questions>
      <PanelTitle hint="Asked before work begins. A question that must be yes stops the check passing when answered no." right={d.can.change && !form ? <Btn small onClick={() => setForm({ type_id: '', question: '', must_be_yes: true })}>Add a question</Btn> : null}>{d.name}</PanelTitle>
      {industries.length > 1 && <Field label="Industry" htmlFor="oq-ind" style={{ maxWidth: 300, marginBottom: 10 }}><SelectInput id="oq-ind" value={industry} onChange={(e) => setIndustry(e.target.value)}>{industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={(e) => { e.preventDefault(); save(null, { ...form, type_id: form.type_id ? Number(form.type_id) : null }); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Field label="Question" htmlFor="oq-q"><TextInput id="oq-q" value={form.question} maxLength={300} onChange={(e) => setForm({ ...form, question: e.target.value })} required /></Field>
          <Field label="For" htmlFor="oq-for"><SelectInput id="oq-for" value={form.type_id} onChange={(e) => setForm({ ...form, type_id: e.target.value })}><option value="">Every kind of work</option>{d.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput></Field>
          <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.must_be_yes} onChange={(e) => setForm({ ...form, must_be_yes: e.target.checked })} /> Must be yes</label>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Add it</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      {d.questions.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No questions: there is no check for this industry.</p>}
      {d.questions.map((q) => (
        <div key={q.id} data-opening-q={q.question} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <span>{q.question} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {q.type_id ? typeName(q.type_id) : 'every kind of work'}</span> {q.must_be_yes && <Chip status="info">Must be yes</Chip>} {!q.is_active && <Chip>Not asked</Chip>}</span>
          {d.can.change && <Btn small variant="quiet" onClick={() => save(q.id, { question: q.question, must_be_yes: q.must_be_yes, is_active: !q.is_active })}>{q.is_active ? 'Stop asking' : 'Ask it again'}</Btn>}
        </div>
      ))}
    </Panel>
  );
}
