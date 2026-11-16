import { useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { check } from './uiTokens';
import HoursEditor from './HoursEditor';

/**
 * The company's access settings (docs/PROJECTS_STAGE2_SPEC.md, build 2.2): how early a lead is warned of an end date, the hours a new piece
 * of work starts with, and short passes outside hours. `value` is the saved settings; `onSaved(page)` gets the configuration page back.
 */
/** the numbers for locked areas and approvals: [setting, what it is, least, most] */
const NUMBERS = [
  ['unlock_minutes', 'A locked area stays open for this many minutes', 1, 480],
  ['lock_tries', 'Wrong passwords in a row before a wait', 2, 20],
  ['lock_wait_minutes', 'The wait after too many wrong passwords, in minutes', 1, 1440],
  ['approval_hours', 'A request for approval stays open for this many hours', 1, 168],
];

export default function AccessSettingsPanel({ value, canEdit, onSaved, thing }) {
  const [form, setForm] = useState({ warn_days: value.warn_days, read_outside_hours: value.read_outside_hours, passes: value.passes, pass_minutes: value.pass_minutes,
    unlock_minutes: value.unlock_minutes, lock_tries: value.lock_tries, lock_wait_minutes: value.lock_wait_minutes, approval_hours: value.approval_hours });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };

  const save = async (days) => {
    setBusy(true);
    try { onSaved(await projectsAPI.saveAccessSettings({ ...form, ...Object.fromEntries(NUMBERS.map(([k]) => [k, Number(form[k])])), warn_days: Number(form.warn_days), pass_minutes: Number(form.pass_minutes), default_hours: days })); toast.success('Saved'); setProblem(''); }
    catch (e) { setProblem(message(e, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel>
      <PanelTitle hint={`These are where every new ${thing} starts. Each one can then be given its own hours on its Access tab.`}>Access</PanelTitle>
      {!canEdit && <Notice style={{ marginBottom: 12 }}>You can see these settings but may not change them.</Notice>}
      <fieldset disabled={!canEdit} style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field label="Warn the lead this many days before someone's end date" htmlFor="access-warn" hint="0 switches the warning off.">
            <TextInput id="access-warn" type="number" min={0} max={90} value={form.warn_days} onChange={(e) => set({ warn_days: e.target.value })} required />
          </Field>
          <Field label="A pass outside hours lasts this many minutes" htmlFor="access-pass" hint="It ends by itself.">
            <TextInput id="access-pass" type="number" min={5} max={1440} value={form.pass_minutes} onChange={(e) => set({ pass_minutes: e.target.value })} required disabled={!form.passes} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {NUMBERS.map(([k, label, min, max]) => (
            <Field key={k} label={label} htmlFor={`access-${k}`}><TextInput id={`access-${k}`} type="number" min={min} max={max} value={form[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} required /></Field>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={form.passes} onChange={(e) => set({ passes: e.target.checked })} />Someone outside the hours can ask to be let in for a short while</label>
        <div>
          <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 13.5 }}>Hours a new {thing} starts with</p>
          <HoursEditor prefix="default-hours" value={value.default_hours} busy={busy} onSave={save} saveLabel="Save access settings">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={form.read_outside_hours} onChange={(e) => set({ read_outside_hours: e.target.checked })} />Outside the hours people can still read, but not change</label>
            {problem && <Notice status="problem">{problem}</Notice>}
          </HoursEditor>
        </div>
      </fieldset>
    </Panel>
  );
}
