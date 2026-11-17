import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, DataTable, Notice, Panel, PanelTitle, SelectInput } from './ui';
import { td, th } from './uiTokens';

/**
 * Money settings (docs/PROJECTS_STAGE4_SPEC.md, build 4.1): whether bills are posted or prepared as drafts, where retention goes by default,
 * and on each kind of Books voucher whether a project is required, optional or not shown. Out of the box: drafts, one company ledger, optional.
 */
const RULE = { required: 'Required', optional: 'Optional', none: 'Not shown' };

function Radio({ name, value, current, onChange, disabled, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5 }}>
      <input type="radio" name={name} value={value} checked={current === value} disabled={disabled} onChange={() => onChange(value)} style={{ accentColor: 'var(--color-primary-500)', marginTop: 3 }} />
      <span>{children}</span>
    </label>
  );
}

export default function MoneySettingsPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.moneySettings().then((d) => { setData(d); setForm(d.money); }).catch((e) => setProblem(message(e, 'The money settings could not be loaded.'))); }, []);
  if (!form) return problem ? <Notice status="problem">{problem}</Notice> : <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const can = data.can.change;
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const d = await projectsAPI.saveMoneySettings(form); setData(d); setForm(d.money); toast.success('Saved'); } catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel as="form" onSubmit={save}>
      <PanelTitle hint="Every amount stays in the books. These decide how Projects prepares vouchers there.">Money</PanelTitle>
      {!can && <Notice style={{ marginBottom: 12 }}>You can see these settings but may not change them.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 16 }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>When a bill is raised from a project</legend>
          <Radio name="bill_mode" value="post" current={form.bill_mode} onChange={(v) => set({ bill_mode: v })} disabled={!can}>Post the voucher<span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>Needs the permission to bill, and follows the serious-action rules.</span></Radio>
          <Radio name="bill_mode" value="draft" current={form.bill_mode} onChange={(v) => set({ bill_mode: v })} disabled={!can}>Prepare a draft<span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>It waits in Books for someone who may post it.</span></Radio>
        </fieldset>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Retention goes to</legend>
          <Radio name="retention_mode" value="company" current={form.retention_mode} onChange={(v) => set({ retention_mode: v })} disabled={!can}>One company retention ledger</Radio>
          <Radio name="retention_mode" value="client" current={form.retention_mode} onChange={(v) => set({ retention_mode: v })} disabled={!can}>A ledger per client</Radio>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>A piece of work can choose differently for itself.</span>
        </fieldset>
      </div>

      <strong style={{ display: 'block', fontSize: 13.5, marginBottom: 4 }}>A project on Books vouchers</strong>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-secondary)' }}>The project picker fills the voucher's cost centre. Required is asked only on the Books voucher form: the shop, the till and payment gateways are never held to it.</p>
      <DataTable minWidth={420}>
        <thead><tr><th style={th}>Kind of voucher</th><th style={th}>Project</th></tr></thead>
        <tbody>
          {data.voucher_types.map((t) => (
            <tr key={t.key} data-voucher-type={t.key}>
              <td style={{ ...td, fontWeight: 600 }}>{t.label}</td>
              <td style={td}>
                <SelectInput aria-label={`Project on a ${t.label}`} value={form.voucher_project[t.key]} disabled={!can} onChange={(e) => set({ voucher_project: { ...form.voucher_project, [t.key]: e.target.value } })} style={{ width: 'auto' }}>
                  {Object.entries(RULE).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </SelectInput>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {problem && <Notice status="problem" style={{ marginTop: 12 }}>{problem}</Notice>}
      {can && <div style={{ marginTop: 14 }}><Btn type="submit" variant="primary" busy={busy}>Save the money settings</Btn></div>}
    </Panel>
  );
}
