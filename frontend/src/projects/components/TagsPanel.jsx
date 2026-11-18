import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const STATUS = { '': 'Plain', info: 'Information', good: 'Good', warning: 'Warning', problem: 'Problem' };

/** Conversation tags (docs/PROJECTS_STAGE6_SPEC.md, build 6.2): the company's list, typed after # in a message. Each is shown as one of the named statuses. */
export default function TagsPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: '', key: '', status: '' });
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.conversationTags().then(setData).catch((e) => setProblem(message(e, 'The tags could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async (id, body) => { try { setData(await projectsAPI.saveConversationTag(id, body)); setProblem(''); toast.success('Saved'); return true; } catch (e) { setProblem(message(e, 'That could not be saved.')); return false; } };

  return (
    <Panel data-tags>
      <PanelTitle hint="Typed after # in a message. The inbox filters by them.">Conversation tags</PanelTitle>
      {data.can.change && (
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }} onSubmit={async (e) => { e.preventDefault(); if (await save(null, form)) setForm({ name: '', key: '', status: '' }); }}>
          <Field label="Name" htmlFor="tag-name"><TextInput id="tag-name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Typed as # (optional)" htmlFor="tag-key"><TextInput id="tag-key" value={form.key} maxLength={40} onChange={(e) => setForm({ ...form, key: e.target.value })} /></Field>
          <Field label="Shown as" htmlFor="tag-status"><SelectInput id="tag-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          <Btn type="submit" small variant="primary">Add the tag</Btn>
        </form>
      )}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      <DataTable minWidth={420}>
        <thead><tr><th style={th}>Tag</th><th style={th}>Name</th><th style={th}>Offered</th></tr></thead>
        <tbody>
          {data.tags.map((t) => (
            <tr key={t.id} data-tag={t.key}>
              <td style={td}><Chip status={t.status ?? 'neutral'}>#{t.key}</Chip></td>
              <td style={td}>{t.name}</td>
              <td style={td}><input type="checkbox" aria-label={`Offer #${t.key}`} checked={t.is_active} disabled={!data.can.change} onChange={(e) => save(t.id, { name: t.name, key: t.key, status: t.status, is_active: e.target.checked })} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
