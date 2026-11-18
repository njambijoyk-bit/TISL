import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const STATUS = { '': 'Plain', info: 'Information', good: 'Good', warning: 'Warning', problem: 'Problem' };

/**
 * Link roles (docs/PROJECTS_STAGE7_SPEC.md, build 7.1): what a linked record is to a piece of work. "Agreed value" adds up the linked quotations
 * and sales orders read from the books; the others are words the company chooses. Each is shown as one of the named statuses.
 */
export default function LinkRolesPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: '', status: '' });
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.linkRoles().then(setData).catch((e) => setProblem(message(e, 'The link roles could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async (id, body) => { try { setData(await projectsAPI.saveLinkRole(id, body)); setProblem(''); toast.success('Saved'); return true; } catch (e) { setProblem(message(e, 'That could not be saved.')); return false; } };

  return (
    <Panel data-link-roles>
      <PanelTitle hint='What a linked record is to the work. Links marked "Agreed value" are added up on the Links tab.'>Link roles</PanelTitle>
      {data.can.change && (
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }} onSubmit={async (e) => { e.preventDefault(); if (await save(null, form)) setForm({ name: '', status: '' }); }}>
          <Field label="Name" htmlFor="lr-name"><TextInput id="lr-name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Shown as" htmlFor="lr-status"><SelectInput id="lr-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          <Btn type="submit" small variant="primary">Add the role</Btn>
        </form>
      )}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      <DataTable minWidth={420}>
        <thead><tr><th style={th}>Role</th><th style={th}>Shown as</th><th style={th}>Offered</th></tr></thead>
        <tbody>
          {data.roles.map((r) => (
            <tr key={r.id} data-link-role={r.key}>
              <td style={td}><Chip status={r.status ?? 'neutral'}>{r.name}</Chip></td>
              <td style={td}>
                <SelectInput aria-label={`How ${r.name} is shown`} value={r.status ?? ''} disabled={!data.can.change} onChange={(e) => save(r.id, { name: r.name, status: e.target.value || null, is_active: r.is_active })} style={{ width: 'auto' }}>
                  {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectInput>
              </td>
              <td style={td}><input type="checkbox" aria-label={`Offer ${r.name}`} checked={r.is_active} disabled={!data.can.change || r.key === 'agreed_value'} onChange={(e) => save(r.id, { name: r.name, status: r.status, is_active: e.target.checked })} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
