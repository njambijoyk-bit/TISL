import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, TextInput } from './ui';

const area = { width: '100%', boxSizing: 'border-box', minHeight: 110, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)' };

/** Inspection kinds (docs/PROJECTS_STAGE10_SPEC.md, build 10.6): a name and its questions, one a line. Each is passed, failed or not applicable. */
export default function InspectionKindsPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);   // { id, name, questions, is_active }
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.inspectionKinds().then(setData).catch((e) => setProblem(message(e, 'The inspection kinds could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async (e) => {
    e.preventDefault();
    try { setData(await projectsAPI.saveInspectionKind(form.id, { name: form.name, questions: form.questions, is_active: form.is_active })); setForm(null); setProblem(''); toast.success('Saved'); } catch (err) { setProblem(message(err, 'That could not be saved.')); }
  };
  return (
    <Panel data-inspection-kinds>
      <PanelTitle hint="Each question is passed, failed or not applicable; a failed one becomes a snag." right={data.can.change && !form ? <Btn small onClick={() => setForm({ id: null, name: '', questions: '', is_active: true })}>Add a kind</Btn> : null}>Inspection kinds</PanelTitle>
      {!data.ready && <Notice status="warning">These need database script 267.</Notice>}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={save} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <Field label="Name" htmlFor="ik-name"><TextInput id="ik-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Questions, one a line" htmlFor="ik-q"><textarea id="ik-q" style={area} value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} required /></Field>
          <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Offered</label>
          <span style={{ display: 'flex', gap: 6 }}><Btn type="submit" small variant="primary">Save</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      {data.kinds.map((k) => (
        <div key={k.id} data-inspection-kind={k.name} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span><strong>{k.name}</strong>{!k.is_active && ' (not offered)'} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {k.questions.length} {k.questions.length === 1 ? 'question' : 'questions'}</span></span>
          {data.can.change && <Btn small variant="quiet" onClick={() => setForm({ id: k.id, name: k.name, questions: k.questions.join('\n'), is_active: k.is_active })}>Change</Btn>}
        </div>
      ))}
    </Panel>
  );
}
