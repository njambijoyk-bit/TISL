import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * The rate card (docs/PROJECTS_STAGE5_SPEC.md, build 5.8): which Books service package a person's time is billed at, for the company or for one
 * piece of work. The price shown is Books'. Most specific wins on the day the time was worked.
 */
export default function RatesPanel({ projectId = null }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.rates(projectId)); } catch (e) { setProblem(message(e, 'The rate card could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return null;
  const pkg = (p) => `${p.service} · ${p.name}${p.price !== null && p.price !== undefined ? ` · ${money(p.price)}${p.unit ? ` per ${p.unit}` : ''}` : ''}`;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setData(await projectsAPI.saveRate(projectId, { service_variant_id: Number(form.service_variant_id), user_id: form.who.startsWith('u') ? Number(form.who.slice(1)) : null, project_role_id: form.who.startsWith('r') ? Number(form.who.slice(1)) : null, valid_from: form.valid_from || null, valid_to: form.valid_to || null }));
      setForm(null); setProblem(''); toast.success('Rate added');
    } catch (err) { setProblem(message(err, 'The rate could not be added.')); } finally { setBusy(false); }
  };

  return (
    <Panel style={{ marginTop: 16 }} data-rates>
      <PanelTitle hint={projectId ? 'For this work. Most specific wins; the company card covers the rest.' : 'Each rate is a Books service package; Books keeps the price, its tax and its ledger. Most specific wins: this work, then the person, their role, everyone.'}
        right={data.can.change && !form && <Btn small onClick={() => { setForm({ who: '', service_variant_id: '', valid_from: '', valid_to: '' }); setProblem(''); }}>Add a rate</Btn>}>{projectId ? 'Rates on this work' : 'Rate card'}</PanelTitle>
      {form && (
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label="For" htmlFor="rt-who"><SelectInput id="rt-who" value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })}>
            <option value="">Everyone</option>
            <optgroup label="A person">{data.people.map((u) => <option key={`u${u.id}`} value={`u${u.id}`}>{u.name}</option>)}</optgroup>
            <optgroup label="A project role">{data.roles.map((r) => <option key={`r${r.id}`} value={`r${r.id}`}>{r.name}</option>)}</optgroup>
          </SelectInput></Field>
          <Field label="Billed at (Books package)" htmlFor="rt-pkg" style={{ gridColumn: 'span 2' }}><SelectInput id="rt-pkg" value={form.service_variant_id} onChange={(e) => setForm({ ...form, service_variant_id: e.target.value })} required><option value="">Choose…</option>{data.packages.map((p) => <option key={p.id} value={p.id}>{pkg(p)}</option>)}</SelectInput></Field>
          <Field label="From (optional)" htmlFor="rt-from"><TextInput id="rt-from" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
          <Field label="To (optional)" htmlFor="rt-to"><TextInput id="rt-to" type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></Field>
          {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" small variant="primary" busy={busy}>Add it</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></div>
        </form>
      )}
      {data.rates.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>{projectId ? 'None: the company rate card applies.' : 'No rates yet. Without one, time cannot be billed.'}</p>}
      {data.rates.length > 0 && (
        <DataTable minWidth={560}>
          <thead><tr><th style={th}>For</th><th style={th}>Billed at</th><th style={th}>When</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.rates.map((r) => (
              <tr key={r.id} data-rate={r.who}>
                <td style={td}>{r.who}</td>
                <td style={td}>{r.package.gone ? <Chip status="warning">{r.package.name}</Chip> : pkg(r.package)}</td>
                <td style={td}>{r.valid_from || r.valid_to ? `${r.valid_from ? `from ${day(r.valid_from)}` : ''}${r.valid_to ? ` to ${day(r.valid_to)}` : ''}` : 'Always'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{data.can.change && <Btn small variant="quiet" aria-label={`Remove the rate for ${r.who}`} onClick={async () => { try { setData(await projectsAPI.deleteRate(projectId, r.id)); toast.success('Removed'); } catch (err) { setProblem(message(err, 'It could not be removed.')); } }}>Remove</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}
