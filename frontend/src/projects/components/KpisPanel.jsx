import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const UNIT = { pct: '%', count: '', days: ' days', hours: ' h' };
const ABOUT = { work: 'A piece of work', person: 'A person', company: 'The company' };
const blank = { measure: 'tasks_on_time', name: '', industry_key: '', target_good: '', target_warn: '', client_sees: false, is_active: true };

/**
 * KPIs (docs/PROJECTS_STAGE12_SPEC.md, build 12.1): a measure the system works out, with a green and an amber target, where it applies and
 * whether the client sees it. Targets are percentages, counts, days or hours, never amounts.
 */
export default function KpisPanel() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [show, setShow] = useState('all');
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.kpis().then(setD).catch((e) => setProblem(message(e, 'The KPIs could not be loaded.'))); }, []);
  if (!d?.kpis) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!d.ready) return <Notice status="warning">KPIs need database script 269.</Notice>;
  const measure = (k) => d.measures.find((m) => m.key === k);
  const m = form ? measure(form.measure) : null;
  const industry = (k) => d.industries.find((i) => i.key === k)?.name ?? k;
  const target = (k) => (k.higher ? `≥ ${k.target_good}${UNIT[k.unit]}` : `≤ ${k.target_good}${UNIT[k.unit]}`);
  const amber = (k) => (k.higher ? `≥ ${k.target_warn}${UNIT[k.unit]}` : `≤ ${k.target_warn}${UNIT[k.unit]}`);
  const save = async (e) => {
    e.preventDefault();
    try { setD(await projectsAPI.saveKpi(form.id ?? null, { ...form, industry_key: form.industry_key || null, target_good: Number(form.target_good), target_warn: Number(form.target_warn) })); setForm(null); setProblem(''); toast.success('Saved'); } catch (err) { setProblem(message(err, 'The KPI could not be saved.')); }
  };
  const rows = d.kpis.filter((k) => show === 'all' || (show === 'everywhere' ? !k.industry : k.industry === show));

  return (
    <Panel data-kpis>
      <PanelTitle hint="Worked out from the work itself; money measures are read from Books when shown. A target is never an amount." right={d.can.change && !form ? <Btn small onClick={() => setForm({ ...blank })}>Add a KPI</Btn> : null}>KPIs</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={save} data-kpi-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
          <Field label="Measures" htmlFor="kp-m" style={{ gridColumn: 'span 2' }}><SelectInput id="kp-m" value={form.measure} onChange={(e) => setForm({ ...form, measure: e.target.value, industry_key: measure(e.target.value).about === 'work' ? form.industry_key : '', client_sees: false })}>
            {['work', 'person', 'company'].map((a) => <optgroup key={a} label={ABOUT[a]}>{d.measures.filter((x) => x.about === a).map((x) => <option key={x.key} value={x.key}>{x.name}{x.books ? ' (from Books)' : ''}</option>)}</optgroup>)}
          </SelectInput></Field>
          <Field label="Name (optional)" htmlFor="kp-n"><TextInput id="kp-n" value={form.name} maxLength={120} placeholder={m?.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Applies to" htmlFor="kp-i"><SelectInput id="kp-i" value={form.industry_key} disabled={m?.about !== 'work'} onChange={(e) => setForm({ ...form, industry_key: e.target.value })}><option value="">Every industry</option>{d.industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>
          <Field label={`Green ${m?.higher ? 'from' : 'up to'}${UNIT[m?.unit] ? ` (${UNIT[m.unit].trim()})` : ''}`} htmlFor="kp-g"><TextInput id="kp-g" type="number" step="any" value={form.target_good} onChange={(e) => setForm({ ...form, target_good: e.target.value })} required /></Field>
          <Field label={`Amber ${m?.higher ? 'from' : 'up to'}${UNIT[m?.unit] ? ` (${UNIT[m.unit].trim()})` : ''}`} htmlFor="kp-w"><TextInput id="kp-w" type="number" step="any" value={form.target_warn} onChange={(e) => setForm({ ...form, target_warn: e.target.value })} required /></Field>
          {m?.about === 'work' && <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.client_sees} onChange={(e) => setForm({ ...form, client_sees: e.target.checked })} /> The client sees it</label>}
          <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>{m?.how}. {m?.higher ? 'Higher is better; past amber is red.' : 'Lower is better; past amber is red.'}</p>
          <span style={{ display: 'flex', gap: 6 }}><Btn type="submit" small variant="primary">Save the KPI</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      <Field label="Show" htmlFor="kp-show" style={{ maxWidth: 260, marginBottom: 8 }}><SelectInput id="kp-show" value={show} onChange={(e) => setShow(e.target.value)}><option value="all">All</option><option value="everywhere">Every industry</option>{d.industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>
      <DataTable minWidth={720}>
        <thead><tr><th style={th}>KPI</th><th style={th}>About</th><th style={th}>Applies to</th><th style={th}>Green</th><th style={th}>Amber</th><th style={th}>Client</th><th style={th} /></tr></thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id} data-kpi={k.key}>
              <td style={td}><strong>{k.name}</strong>{k.books && <> <Chip status="warning">from Books</Chip></>}{!k.is_active && <> <Chip>Off</Chip></>}</td>
              <td style={td}>{ABOUT[k.about]}</td>
              <td style={td}>{k.type ?? (k.industry ? industry(k.industry) : 'Every industry')}</td>
              <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{target(k)}</td>
              <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{amber(k)}</td>
              <td style={td}>{k.client_sees ? 'Yes' : ''}</td>
              <td style={td}>{d.can.change && <span style={{ display: 'flex', gap: 4 }}><Btn small variant="quiet" onClick={() => setForm({ id: k.id, measure: k.measure, name: k.name, industry_key: k.industry ?? '', target_good: k.target_good, target_warn: k.target_warn, client_sees: k.client_sees, is_active: k.is_active })}>Change</Btn>
                <Btn small variant="quiet" onClick={async () => { try { setD(await projectsAPI.saveKpi(k.id, { is_active: !k.is_active })); } catch (e) { setProblem(message(e, 'That could not be saved.')); } }}>{k.is_active ? 'Switch off' : 'Switch on'}</Btn></span>}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
