import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

/**
 * Work and time settings (docs/PROJECTS_STAGE5_SPEC.md): whether work is billable unless a task says otherwise, how time is rounded, when a
 * forgotten timer stops, what happens when time is more than Attendance says was worked, who approves time, key date warnings, the weekly
 * reminder and splitting pay by timesheets (off until switched on).
 */
export default function WorkSettingsPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.workSettings().then((d) => { setData(d); setForm(d.work); }).catch((e) => setProblem(message(e, 'The work settings could not be loaded.'))); }, []);
  if (!form) return problem ? <Notice status="problem">{problem}</Notice> : <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const can = data.can.change;
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const d = await projectsAPI.saveWorkSettings({ ...form, rounding: Number(form.rounding), timer_cap_hours: Number(form.timer_cap_hours) }); setData(d); setForm(d.work); toast.success('Saved'); }
    catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };
  const tick = (key, label, hint) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 }}>
      <input type="checkbox" id={`ws-${key}`} checked={!!form[key]} disabled={!can} onChange={(e) => set({ [key]: e.target.checked })} style={{ accentColor: 'var(--color-primary-500)', marginTop: 3 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{hint}</span>}</span>
    </label>
  );

  return (
    <Panel as="form" onSubmit={save} data-work-settings>
      <PanelTitle hint="Tasks, time and key dates on every piece of work.">Work and time</PanelTitle>
      {!can && <Notice style={{ marginBottom: 12 }}>You can see these settings but may not change them.</Notice>}
      {!data.ready && <Notice status="warning" style={{ marginBottom: 12 }}>These need database script 261.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <Field label="Round time up to" htmlFor="ws-rounding"><SelectInput id="ws-rounding" value={form.rounding} disabled={!can} onChange={(e) => set({ rounding: e.target.value })}>
          <option value={0}>The exact minute</option><option value={1}>1 minute</option><option value={6}>6 minutes (a tenth of an hour)</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option>
        </SelectInput></Field>
        <Field label="A forgotten timer stops after (hours)" htmlFor="ws-cap"><TextInput id="ws-cap" type="number" min={1} max={24} value={form.timer_cap_hours} disabled={!can} onChange={(e) => set({ timer_cap_hours: e.target.value })} /></Field>
        <Field label="Time beyond what Attendance says was worked" htmlFor="ws-att"><SelectInput id="ws-att" value={form.attendance_check} disabled={!can} onChange={(e) => set({ attendance_check: e.target.value })}>
          <option value="warn">Warn</option><option value="refuse">Refuse it</option><option value="off">Do not check</option>
        </SelectInput></Field>
        <Field label="Who approves time" htmlFor="ws-approve"><SelectInput id="ws-approve" value={form.approve_by} disabled={!can} onChange={(e) => set({ approve_by: e.target.value })}>
          <option value="lead">The leads of the work it is on</option><option value="manager">The person's manager</option>
        </SelectInput></Field>
        <Field label="Key date warnings (days before)" htmlFor="ws-warn" hint="For example 14,7,1. A date can have its own."><TextInput id="ws-warn" value={form.warn_days} disabled={!can} onChange={(e) => set({ warn_days: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {tick('billable_default', 'Work is billable unless a task says otherwise')}
        {tick('week_reminder', 'Remind people whose week is not submitted')}
        {tick('payroll_split', 'Split pay by timesheets', 'A payroll run splits each person\'s pay across the work they logged approved time on. Off until you switch it on.')}
      </div>
      {problem && <Notice status="problem" style={{ marginTop: 12 }}>{problem}</Notice>}
      {can && <div style={{ marginTop: 14 }}><Btn type="submit" variant="primary" busy={busy}>Save</Btn></div>}
    </Panel>
  );
}
