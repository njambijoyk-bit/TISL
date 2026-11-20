import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const KIND = { phase: 'Phase', task: 'Task', date: 'Key date' };
const cell = { padding: '4px 6px', fontSize: 12.5, width: '100%' };
const blank = (kind) => ({ kind, title: '', parent_ref: '', offset_days: '', estimate_minutes: '', date_kind: '', warn_days: '' });

/**
 * How work starts (docs/PROJECTS_STAGE11_SPEC.md, build 11.1): per kind of work, whether it starts confidential, whether the opening check must
 * pass before it leaves its first stage, and its work templates: phases, tasks due so many days after the start, and key dates.
 */
export default function WorkTemplatesPanel() {
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState('');
  useEffect(() => { projectsAPI.options().then((o) => { const names = Object.fromEntries((o.industries ?? []).map((i) => [i.key, i.name])); setTypes((o.types ?? []).map((t) => ({ ...t, industry_name: (o.industries ?? []).length > 1 ? names[t.industry] : null }))); }).catch(() => setTypes([])); }, []);
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);   // { id, name, is_default, items }
  const [problem, setProblem] = useState('');
  useEffect(() => { if (!typeId && types[0]) setTypeId(types[0].id); }, [types, typeId]);
  useEffect(() => { if (typeId) projectsAPI.typeTemplates(typeId).then((d) => { setData(d); setEdit(null); setProblem(''); }).catch((e) => setProblem(message(e, 'The templates could not be loaded.'))); }, [typeId]);
  if (!types.length) return null;
  const can = data?.can?.change;
  const settings = async (patch) => { try { setData(await projectsAPI.saveTypeSettings(typeId, patch)); toast.success('Saved'); } catch (e) { setProblem(message(e, 'That could not be saved.')); } };
  const save = async () => {
    try {
      const items = edit.items.map((i) => ({ ...i, offset_days: i.offset_days === '' ? null : Number(i.offset_days), estimate_minutes: i.estimate_minutes === '' ? null : Number(i.estimate_minutes) }));
      setData(await projectsAPI.saveWorkTemplate(edit.id, { type_id: typeId, name: edit.name, is_default: edit.is_default, items })); setEdit(null); setProblem(''); toast.success('Template saved');
    } catch (e) { setProblem(message(e, 'The template could not be saved.')); }
  };
  const setItem = (n, patch) => setEdit((e) => ({ ...e, items: e.items.map((i, k) => (k === n ? { ...i, ...patch } : i)) }));
  const phasesAbove = (n) => edit.items.slice(0, n).filter((i) => i.kind === 'phase' && i.title).map((i) => i.title);

  return (
    <Panel data-work-templates>
      <PanelTitle hint="Chosen when a piece of work starts; its phases, tasks and key dates are made from the start date.">How work starts</PanelTitle>
      <Field label="Kind of work" htmlFor="wt-type" style={{ maxWidth: 360, marginBottom: 12 }}>
        <SelectInput id="wt-type" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>{types.map((t) => <option key={t.id} value={t.id}>{t.industry_name ? `${t.industry_name}: ` : ''}{t.name}</option>)}</SelectInput>
      </Field>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {data && !data.ready && <Notice status="warning">These need database script 268.</Notice>}
      {data?.ready && <>
        <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
          <label style={{ fontSize: 13.5, display: 'flex', gap: 8 }}><input type="checkbox" checked={data.settings.confidential_default} disabled={!can} onChange={(e) => settings({ confidential_default: e.target.checked })} /> New work of this kind starts confidential</label>
          <label style={{ fontSize: 13.5, display: 'flex', gap: 8 }}><input type="checkbox" checked={data.settings.opening_required} disabled={!can} onChange={(e) => settings({ opening_required: e.target.checked })} /> The opening check must pass before it leaves its first stage</label>
        </div>
        {!edit && data.templates.map((t) => (
          <div key={t.id} data-work-template={t.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
            <span><strong>{t.name}</strong> {t.is_default && <Chip status="info">Usual</Chip>} {!t.is_active && <Chip>Not offered</Chip>} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {['phase', 'task', 'date'].map((k) => `${t.items.filter((i) => i.kind === k).length} ${KIND[k].toLowerCase()}s`).join(', ')}</span></span>
            {can && <Btn small variant="quiet" onClick={() => setEdit({ id: t.id, name: t.name, is_default: t.is_default, items: t.items.map((i) => ({ ...blank(i.kind), ...i, parent_ref: i.parent_ref ?? '', offset_days: i.offset_days ?? '', estimate_minutes: i.estimate_minutes ?? '', date_kind: i.date_kind ?? '', warn_days: i.warn_days ?? '' })) })}>Change</Btn>}
          </div>
        ))}
        {!edit && data.templates.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No templates for this kind of work: it starts empty.</p>}
        {can && !edit && <Btn small style={{ marginTop: 10 }} onClick={() => setEdit({ id: null, name: '', is_default: data.templates.length === 0, items: [blank('phase')] })}>Add a template</Btn>}
        {edit && (
          <div data-template-editor style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <Field label="Template name" htmlFor="wt-name"><TextInput id="wt-name" value={edit.name} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> The usual one</label>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                <thead><tr>{['', 'Name', 'Under', 'Days after the start', 'Estimate (min)', 'Kind of date', 'Warn days', ''].map((h, k) => <th key={k} style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--text-secondary)', padding: '4px 6px' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {edit.items.map((i, n) => (
                    <tr key={n} data-template-line={n}>
                      <td style={{ fontSize: 12, padding: '4px 6px' }}><Chip>{KIND[i.kind]}</Chip></td>
                      <td><TextInput aria-label={`Line ${n + 1} name`} value={i.title} onChange={(e) => setItem(n, { title: e.target.value })} style={cell} /></td>
                      <td><SelectInput aria-label={`Line ${n + 1} under`} value={i.parent_ref} onChange={(e) => setItem(n, { parent_ref: e.target.value })} style={cell}><option value="">At the top</option>{phasesAbove(n).map((p) => <option key={p} value={p}>{p}</option>)}</SelectInput></td>
                      <td>{i.kind !== 'phase' && <TextInput aria-label={`Line ${n + 1} days`} type="number" min="0" value={i.offset_days} onChange={(e) => setItem(n, { offset_days: e.target.value })} style={cell} />}</td>
                      <td>{i.kind === 'task' && <TextInput aria-label={`Line ${n + 1} estimate`} type="number" min="0" value={i.estimate_minutes} onChange={(e) => setItem(n, { estimate_minutes: e.target.value })} style={cell} />}</td>
                      <td>{i.kind === 'date' && <SelectInput aria-label={`Line ${n + 1} kind of date`} value={i.date_kind} onChange={(e) => setItem(n, { date_kind: e.target.value })} style={cell}><option value="">None</option>{data.date_kinds.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</SelectInput>}</td>
                      <td>{i.kind === 'date' && <TextInput aria-label={`Line ${n + 1} warn days`} value={i.warn_days} placeholder="7,1" onChange={(e) => setItem(n, { warn_days: e.target.value })} style={cell} />}</td>
                      <td><Btn small variant="quiet" aria-label={`Take off line ${n + 1}`} onClick={() => setEdit((e) => ({ ...e, items: e.items.filter((_, k) => k !== n) }))}>✕</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(KIND).map(([k, l]) => <Btn key={k} small onClick={() => setEdit((e) => ({ ...e, items: [...e.items, blank(k)] }))}>+ {l}</Btn>)}
              <span style={{ flex: 1 }} />
              <Btn small variant="primary" onClick={save}>Save the template</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn>
            </div>
          </div>
        )}
      </>}
    </Panel>
  );
}
