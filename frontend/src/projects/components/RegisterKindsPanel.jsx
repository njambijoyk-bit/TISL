import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, TextInput } from './ui';

/** Register kinds in Configuration (docs/PROJECTS_STAGE9_SPEC.md, build 9.4): a name and the statuses its lines can have. */
export default function RegisterKindsPanel() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.registerKinds().then(setData).catch((e) => setProblem(message(e, 'The register kinds could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async (body) => { try { setData(await projectsAPI.saveRegisterKind(body.id ?? null, body)); setEdit(null); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'It could not be saved.')); } };

  return (
    <Panel data-register-kinds>
      <PanelTitle hint="The lists a piece of work can keep: drawings, documents, permits..." right={data.can.change && !edit ? <Btn small onClick={() => setEdit({ name: '', statuses: '' })}>Add a kind</Btn> : null}>Registers</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {edit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <Field label="Name" htmlFor="rk-name"><TextInput id="rk-name" value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Statuses, separated by commas" htmlFor="rk-st"><TextInput id="rk-st" value={edit.statuses} onChange={(e) => setEdit({ ...edit, statuses: e.target.value })} style={{ minWidth: 320 }} /></Field>
          <Btn small variant="primary" onClick={() => save(edit)}>Save</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn>
        </div>
      )}
      {data.kinds.map((k) => (
        <div key={k.id} data-register-kind={k.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <span><strong>{k.name}</strong> <span style={{ color: 'var(--text-secondary)' }}>· {k.statuses.join(', ')}{k.is_active ? '' : ' · switched off'}</span></span>
          {data.can.change && <span style={{ display: 'flex', gap: 4 }}><Btn small variant="quiet" onClick={() => setEdit({ ...k, statuses: k.statuses.join(', ') })}>Change</Btn><Btn small variant="quiet" onClick={() => save({ ...k, is_active: !k.is_active })}>{k.is_active ? 'Switch off' : 'Switch on'}</Btn></span>}
        </div>
      ))}
    </Panel>
  );
}
