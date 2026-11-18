import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

/**
 * Casebook kinds and where each goes (docs/PROJECTS_STAGE8_SPEC.md, build 8.5; owner's choice 3). Six ways: everyone who handles cases, a named
 * person, the reporter's manager (or their manager when it is about the manager), the head of a department, the company owners (whoever holds the
 * owner-only "reveal a hidden name" permission), or someone outside by email. A report never goes to anyone it is about.
 */
export default function CasebookKindsPanel() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.casebookKinds().then(setData).catch((e) => setProblem(message(e, 'The casebook kinds could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async () => { try { setData(await projectsAPI.saveCasebookKind(edit.id ?? null, edit)); setEdit(null); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'It could not be saved.')); } };
  const where = (k) => (k.route === 'person' ? data.staff.find((u) => u.id === k.route_user_id)?.name : k.route === 'department' ? `head of ${data.departments.find((d) => d.id === k.route_department_id)?.name ?? 'a department'}` : k.route === 'outside' ? `${k.route_name ?? 'someone'} (${k.route_email})` : data.routes[k.route]);

  return (
    <Panel data-casebook-kinds>
      <PanelTitle hint="Where each kind of report goes. Never to anyone a report is about." right={data.can.change && !edit ? <Btn small onClick={() => setEdit({ name: '', route: 'handlers', client_flag: false })}>Add a kind</Btn> : null}>Casebook</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {edit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }} data-kind-editor>
          <Field label="Kind" htmlFor="ck-name"><TextInput id="ck-name" value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Goes to" htmlFor="ck-route"><SelectInput id="ck-route" value={edit.route} onChange={(e) => setEdit({ ...edit, route: e.target.value })}>{Object.entries(data.routes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          {edit.route === 'person' && <Field label="Person" htmlFor="ck-person"><SelectInput id="ck-person" value={edit.route_user_id ?? ''} onChange={(e) => setEdit({ ...edit, route_user_id: Number(e.target.value) })}><option value="">Choose</option>{data.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>}
          {edit.route === 'department' && <Field label="Department" htmlFor="ck-dept"><SelectInput id="ck-dept" value={edit.route_department_id ?? ''} onChange={(e) => setEdit({ ...edit, route_department_id: Number(e.target.value) })}><option value="">Choose</option>{data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectInput></Field>}
          {edit.route === 'outside' && <>
            <Field label="Their email" htmlFor="ck-email"><TextInput id="ck-email" type="email" value={edit.route_email ?? ''} onChange={(e) => setEdit({ ...edit, route_email: e.target.value })} /></Field>
            <Field label="Who they are" htmlFor="ck-who"><TextInput id="ck-who" value={edit.route_name ?? ''} placeholder="Our counsellor" onChange={(e) => setEdit({ ...edit, route_name: e.target.value })} /></Field>
          </>}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={!!edit.client_flag} onChange={(e) => setEdit({ ...edit, client_flag: e.target.checked })} /> May raise a client flag</label>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn small variant="primary" onClick={save}>Save</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn></span>
        </div>
      )}
      {data.kinds.map((k) => (
        <div key={k.id} data-kind={k.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5, flexWrap: 'wrap' }}>
          <span><strong>{k.name}</strong> <span style={{ color: 'var(--text-secondary)' }}>· goes to {where(k)}{k.client_flag ? ' · may raise a client flag' : ''}{k.is_active ? '' : ' · switched off'}</span></span>
          {data.can.change && <Btn small variant="quiet" onClick={() => setEdit({ ...k })}>Change</Btn>}
        </div>
      ))}
    </Panel>
  );
}
