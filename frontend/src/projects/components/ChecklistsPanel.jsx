import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

/**
 * Joining and leaving checklists on a person's page (docs/PROJECTS_STAGE8_SPEC.md, build 8.4). Someone with the permission runs one; each step
 * goes to whoever does it and is ticked there or on My Work. "Hand over their work" opens the hand-over filled in; ticking "Take them off their
 * work" ends their places on the leaving date.
 */
export default function ChecklistsPanel({ userId }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.checklists(userId)); } catch (e) { setProblem(message(e, 'The checklists could not be loaded.')); } }, [userId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.checklists || (data.checklists.length === 0 && !data.templates?.length)) return null;
  const tick = async (i) => { try { const r = await projectsAPI.tickChecklist(i.id, !i.done); toast.success(r.message); load(); } catch (e) { setProblem(message(e, 'That step could not be changed.')); } };

  return (
    <Panel style={{ marginTop: 16 }} data-checklists>
      <PanelTitle hint="Joining and leaving: each step goes to whoever does it." right={data.templates.length > 0 && !form ? <Btn small onClick={() => setForm({ template_id: data.templates[0].id, on_date: '' })}>Start a checklist</Btn> : null}>Checklists</PanelTitle>
      {form && (
        <form onSubmit={async (e) => { e.preventDefault(); try { setData(await projectsAPI.startChecklist(userId, form)); setForm(null); setProblem(''); toast.success('Started. Everyone with a step is told.'); } catch (err) { setProblem(message(err, 'It could not be started.')); } }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <Field label="Checklist" htmlFor="cl-tpl"><SelectInput id="cl-tpl" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: Number(e.target.value) })}>{data.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}</SelectInput></Field>
          <Field label={data.templates.find((t) => t.id === form.template_id)?.kind === 'leaving' ? 'Leaving day' : 'First day'} htmlFor="cl-day"><TextInput id="cl-day" type="date" value={form.on_date} onChange={(e) => setForm({ ...form, on_date: e.target.value })} required /></Field>
          <Btn type="submit" small variant="primary">Start it</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn>
        </form>
      )}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {data.checklists.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None run for them yet.</p>}
      {data.checklists.map((c) => (
        <div key={c.id} data-checklist={c.name} style={{ display: 'grid', gap: 6, borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5 }}>{c.name} · {c.kind === 'leaving' ? 'leaving' : 'starting'} {day(c.on_date)}</strong>
            <span style={{ display: 'flex', gap: 6 }}><Chip status={c.state === 'done' ? 'good' : c.state === 'cancelled' ? 'neutral' : 'info'}>{c.state === 'done' ? 'Done' : c.state === 'cancelled' ? 'Cancelled' : `${c.items.filter((i) => i.done).length} of ${c.items.length} done`}</Chip>
              {c.can.cancel && <Btn small variant="quiet" onClick={async () => { await projectsAPI.cancelChecklist(c.id); load(); }}>Cancel it</Btn>}</span>
          </div>
          {c.items.map((i) => (
            <label key={i.id} data-step={i.text} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, flexWrap: 'wrap' }}>
              <input type="checkbox" checked={i.done} disabled={!i.mine || c.state !== 'open'} onChange={() => tick(i)} aria-label={i.text} />
              <span style={{ textDecoration: i.done ? 'line-through' : 'none' }}>{i.text}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i.who} · {day(i.due_on)}{i.done_by ? ` · done by ${i.done_by}` : ''}</span>
              {i.late && <Chip status="problem">Late</Chip>}
              {i.action === 'handover' && !i.done && c.state === 'open' && <Link to={`/admin/projects/handover?from=${userId}`} style={{ fontSize: 12.5, color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>Hand it over</Link>}
            </label>
          ))}
        </div>
      ))}
    </Panel>
  );
}
