import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, SelectInput } from './ui';

/** Site settings (docs/PROJECTS_STAGE10_SPEC.md, build 10.3): where a certified subcontract claim is billed, and where its retention is held. */
export default function SiteSettingsPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.siteSettings().then((d) => { setData(d); setForm(d.site); }).catch((e) => setProblem(message(e, 'The site settings could not be loaded.'))); }, []);
  if (!form) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const can = data.can.change;
  const save = async (e) => {
    e.preventDefault();
    try { const d = await projectsAPI.saveSiteSettings(form); setData(d); setForm(d.site); setProblem(''); toast.success('Saved'); } catch (err) { setProblem(message(err, 'That could not be saved.')); }
  };
  return (
    <Panel as="form" onSubmit={save} data-site-settings>
      <PanelTitle hint="Certifying a subcontractor's claim posts a supplier bill to the first and holds retention in the second.">Subcontracts</PanelTitle>
      {!data.ready && <Notice status="warning" style={{ marginBottom: 12 }}>These need database script 267.</Notice>}
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <Field label="Subcontract costs go to" htmlFor="ss-cost"><SelectInput id="ss-cost" value={form.sub_cost_ledger_id} disabled={!can} onChange={(e) => setForm({ ...form, sub_cost_ledger_id: Number(e.target.value) })}>
          <option value={0}>Not chosen</option>{data.cost_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>
        <Field label="Retention is held in" htmlFor="ss-ret"><SelectInput id="ss-ret" value={form.sub_retention_ledger_id} disabled={!can} onChange={(e) => setForm({ ...form, sub_retention_ledger_id: Number(e.target.value) })}>
          <option value={0}>Not chosen</option>{data.retention_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>
      </div>
      {can && <Btn type="submit" variant="primary" small style={{ marginTop: 12 }}>Save</Btn>}
    </Panel>
  );
}
