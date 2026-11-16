import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * The lists an owner manages (docs/PROJECTS_STAGE3_SPEC.md, build 3.1): sources, lost reasons, contact roles, party roles, flags and trades.
 * A row is switched off, never deleted, so what already uses it keeps its name.
 */
const STATUS = { info: 'Information', good: 'Good', warning: 'Warning', problem: 'Problem' };

export default function ListsPanel() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [list, setList] = useState('source');
  const [form, setForm] = useState({ name: '', industry: '', status: 'warning' });
  const [renaming, setRenaming] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { projectsAPI.lists().then(setData).catch((e) => setFailed(message(e, 'The lists could not be loaded. Try again.'))); }, []);
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setProblem(''); setRenaming(null); if (done) toast.success(done); return true; }
    catch (e) { setProblem(message(e, 'That could not be done. Try again.')); return false; } finally { setBusy(false); }
  };

  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const current = data.lists.find((l) => l.key === list);
  const rows = data.rows[list] || [];
  const can = data.can.change && data.ready;
  const industry = (key) => data.industries.find((i) => i.key === key)?.name;
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => projectsAPI.addToList(list, { name: form.name, industry: form.industry || null, status: form.status }), 'Added')) setForm({ ...form, name: '' });
  };

  return (
    <Panel>
      <PanelTitle hint="The choices people pick from across leads, clients, parties and the directory.">Lists</PanelTitle>
      {!data.ready && <Notice status="warning" style={{ marginBottom: 12 }}>These lists need database script 259.</Notice>}
      <div role="group" aria-label="Which list" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {data.lists.map((l) => <Btn key={l.key} small variant={list === l.key ? 'primary' : 'plain'} aria-pressed={list === l.key} onClick={() => { setList(l.key); setProblem(''); setRenaming(null); }}>{l.name}</Btn>)}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>{current.hint}</p>

      {can && (
        <form onSubmit={add} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label="Add to this list" htmlFor="list-name" style={{ flex: '1 1 220px' }}><TextInput id="list-name" value={form.name} maxLength={80} onChange={(e) => { setForm({ ...form, name: e.target.value }); setProblem(''); }} required /></Field>
          {list === 'party_role' && <Field label="For which industry" htmlFor="list-industry"><SelectInput id="list-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}><option value="">Every industry</option>{data.industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>}
          {list === 'flag' && <Field label="Shown as" htmlFor="list-status"><SelectInput id="list-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</SelectInput></Field>}
          <Btn type="submit" variant="primary" small busy={busy}>Add</Btn>
        </form>
      )}
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}

      <DataTable minWidth={520}>
        <thead><tr><th style={th}>Name</th>{list === 'party_role' && <th style={th}>Industry</th>}{list === 'flag' && <th style={th}>Shown as</th>}<th style={th}>Offered</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} data-row={r.name}>
              <td style={{ ...td, fontWeight: 600 }}>
                {renaming?.id === r.id
                  ? <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeListRow(list, r.id, { name: renaming.name }), 'Renamed'); }} style={{ display: 'flex', gap: 6 }}>
                    <TextInput aria-label={`New name for ${r.name}`} value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} required autoFocus />
                    <Btn type="submit" small variant="primary" busy={busy}>Save</Btn><Btn small onClick={() => setRenaming(null)}>Cancel</Btn>
                  </form>
                  : r.name}
              </td>
              {list === 'party_role' && <td style={td}>{r.industry ? industry(r.industry) : <span style={{ color: 'var(--text-secondary)' }}>Every industry</span>}</td>}
              {list === 'flag' && <td style={td}><Chip status={r.status}>{STATUS[r.status]}</Chip></td>}
              <td style={td}><Chip status={r.is_active ? 'good' : 'neutral'}>{r.is_active ? 'Yes' : 'Off'}</Chip></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {can && renaming?.id !== r.id && (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <Btn small disabled={i === 0} aria-label={`Move ${r.name} up`} onClick={() => run(() => projectsAPI.changeListRow(list, r.id, { move: 'up' }))}>Up</Btn>
                    <Btn small disabled={i === rows.length - 1} aria-label={`Move ${r.name} down`} onClick={() => run(() => projectsAPI.changeListRow(list, r.id, { move: 'down' }))}>Down</Btn>
                    <Btn small aria-label={`Rename ${r.name}`} onClick={() => setRenaming({ id: r.id, name: r.name })}>Rename</Btn>
                    <Btn small aria-label={`${r.is_active ? 'Switch off' : 'Switch on'} ${r.name}`} onClick={() => run(() => projectsAPI.changeListRow(list, r.id, { is_active: !r.is_active }), r.is_active ? 'Switched off' : 'Switched on')}>{r.is_active ? 'Switch off' : 'Switch on'}</Btn>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
