import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const blankStep = () => ({ text: '', who: 'manager', who_user_id: '', who_permission: '', day_offset: 0 });

/**
 * Joining and leaving checklists in Configuration (docs/PROJECTS_STAGE8_SPEC.md, build 8.4): each step says who does it and when, in days from
 * the start or leaving date. A leaving checklist always keeps "Hand over their work" and "Take them off their work".
 */
export default function ChecklistTemplatesPanel() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.checklistTemplates().then(setData).catch((e) => setProblem(message(e, 'The checklists could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async () => {
    try { setData(await projectsAPI.saveChecklistTemplate(edit.id ?? null, { ...edit, steps: edit.steps.map((s) => ({ ...s, day_offset: Number(s.day_offset) || 0, who_user_id: s.who_user_id || null })) })); setEdit(null); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'It could not be saved.')); }
  };
  const step = (i, k, v) => setEdit({ ...edit, steps: edit.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });

  return (
    <Panel data-checklist-templates>
      <PanelTitle hint="Days are counted from the first or leaving day; a minus number is before it." right={data.can.change && !edit ? <span style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setEdit({ kind: 'joining', name: '', steps: [blankStep()] })}>New joining checklist</Btn><Btn small onClick={() => setEdit({ kind: 'leaving', name: '', steps: [blankStep()] })}>New leaving checklist</Btn></span> : null}>Joining and leaving checklists</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {edit ? (
        <div style={{ display: 'grid', gap: 8 }} data-template-editor>
          <Field label="Name" htmlFor="ct-name"><TextInput id="ct-name" value={edit.name} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          {edit.steps.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr) 90px', gap: 6, alignItems: 'center' }}>
              <TextInput aria-label={`Step ${i + 1}`} value={s.text} disabled={!!s.action} onChange={(e) => step(i, 'text', e.target.value)} />
              <SelectInput aria-label={`Who does step ${i + 1}`} value={s.who} onChange={(e) => step(i, 'who', e.target.value)}>{Object.entries(data.who).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
              {s.who === 'named' ? <SelectInput aria-label={`Who is named for step ${i + 1}`} value={s.who_user_id ?? ''} onChange={(e) => step(i, 'who_user_id', Number(e.target.value))}><option value="">Choose</option>{data.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput>
                : s.who === 'permission' ? <TextInput aria-label={`Permission for step ${i + 1}`} value={s.who_permission ?? ''} placeholder="e.g. hr.manage" onChange={(e) => step(i, 'who_permission', e.target.value)} /> : <span />}
              <TextInput aria-label={`Days for step ${i + 1}`} type="number" value={s.day_offset} onChange={(e) => step(i, 'day_offset', e.target.value)} />
            </div>
          ))}
          <span style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setEdit({ ...edit, steps: [...edit.steps, blankStep()] })}>Add a step</Btn><Btn small variant="primary" onClick={save}>Save</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn></span>
        </div>
      ) : data.templates.map((t) => (
        <div key={t.id} data-template={t.name} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 13.5 }}>{t.name} <Chip>{data.kinds[t.kind]}</Chip></strong>{data.can.change && <Btn small variant="quiet" onClick={() => setEdit({ ...t, steps: t.steps.map((s) => ({ ...s })) })}>Change</Btn>}</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{t.steps.map((s) => <li key={s.id}>{s.text} <span style={{ color: 'var(--text-secondary)' }}>· {s.who === 'named' ? s.who_name : s.who === 'permission' ? `anyone with ${s.who_permission}` : data.who[s.who].toLowerCase()} · day {s.day_offset >= 0 ? `+${s.day_offset}` : s.day_offset}</span></li>)}</ol>
        </div>
      ))}
    </Panel>
  );
}
