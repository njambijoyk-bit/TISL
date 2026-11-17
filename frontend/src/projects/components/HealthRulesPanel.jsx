import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { check } from './uiTokens';

/** The rules that colour a client's health (build 3.5). The worst rule decides; 0 switches a rule off. Flags decide by how each is shown. */
const NUMBERS = [
  ['contact_amber_days', 'No contact for this many days: amber'], ['contact_red_days', 'No contact for this many days: red'],
  ['late_red_days', 'A next action late by this many days: red (any lateness is amber)'],
  ['overdue_amber_days', 'Money overdue in the books for this many days: amber'], ['overdue_red_days', 'Money overdue for this many days: red'],
];

export default function HealthRulesPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.healthRules().then((d) => { setData(d); setForm(d.health); }).catch((e) => setProblem(message(e, 'The rules could not be loaded. Try again.'))); }, []);
  if (!form) return problem ? <Notice status="problem">{problem}</Notice> : <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const d = await projectsAPI.saveHealthRules({ ...Object.fromEntries(NUMBERS.map(([k]) => [k, Number(form[k])])), nothing_planned_amber: form.nothing_planned_amber }); setData(d); setForm(d.health); setProblem(''); toast.success('Saved'); }
    catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel as="form" onSubmit={save}>
      <PanelTitle hint="Green, amber or red. The worst rule decides, and the client page always says which rule it was. 0 switches a rule off.">Client health</PanelTitle>
      <fieldset disabled={!data.can.change} style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {NUMBERS.map(([k, label]) => <Field key={k} label={label} htmlFor={`health-${k}`}><TextInput id={`health-${k}`} type="number" min={0} max={3650} value={form[k]} onChange={(e) => { setForm({ ...form, [k]: e.target.value }); setProblem(''); }} required /></Field>)}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={form.nothing_planned_amber} onChange={(e) => setForm({ ...form, nothing_planned_amber: e.target.checked })} />Nothing planned next: amber</label>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>Flags decide by how each is shown: a flag shown as a problem makes a client red, one shown as a warning amber. Set that under Lists.</p>
        {problem && <Notice status="problem">{problem}</Notice>}
        {data.can.change && <div><Btn type="submit" variant="primary" busy={busy}>Save the health rules</Btn></div>}
      </fieldset>
    </Panel>
  );
}
