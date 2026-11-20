import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const blank = { name: '', trigger_kind: 'date_set', trigger_value: '', make_kind: '', make_title: '', offset_days: '', working_days: false, warn_days: '' };

/**
 * Date rules (docs/PROJECTS_STAGE11_SPEC.md, build 11.3): when a key date of one kind is set or done, or a work enters a stage, a key date of
 * another kind is made so many days later. Moving the first moves the one made from it until someone moves that by hand.
 */
export default function DateRulesPanel({ industries = [], startIndustry }) {
  const [industry, setIndustry] = useState(startIndustry || industries[0]?.key || '');
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { if (industry) projectsAPI.dateRules(industry).then(setD).catch((e) => setProblem(message(e, 'The date rules could not be loaded.'))); }, [industry]);
  if (!d?.rules) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const kindName = (k) => d.date_kinds.find((x) => x.key === k)?.name ?? k;
  const describe = (r) => `${r.trigger_kind === 'stage' ? `Entering "${r.trigger_value}"` : `${kindName(r.trigger_value)} ${r.trigger_kind === 'date_done' ? 'done' : 'set'}`} → "${r.make_title}" ${r.offset_days} ${r.working_days ? 'working ' : ''}days later`;
  const save = async (e) => {
    e.preventDefault();
    try { setD(await projectsAPI.saveDateRule(form.id ?? null, { ...form, industry, offset_days: Number(form.offset_days || 0) })); setForm(null); setProblem(''); toast.success('Saved'); } catch (err) { setProblem(message(err, 'The rule could not be saved.')); }
  };

  return (
    <Panel data-date-rules>
      <PanelTitle hint="A key date made by a rule says so, and moves with the date it came from until someone moves it." right={d.can.change && !form ? <Btn small onClick={() => setForm({ ...blank, trigger_value: d.date_kinds[0]?.key ?? '' })}>Add a rule</Btn> : null}>Date rules</PanelTitle>
      {industries.length > 1 && <Field label="Industry" htmlFor="dr-ind" style={{ maxWidth: 300, marginBottom: 10 }}><SelectInput id="dr-ind" value={industry} onChange={(e) => setIndustry(e.target.value)}>{industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>}
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={save} data-date-rule-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Field label="When" htmlFor="dr-when"><SelectInput id="dr-when" value={form.trigger_kind} onChange={(e) => setForm({ ...form, trigger_kind: e.target.value, trigger_value: e.target.value === 'stage' ? (d.stages[0] ?? '') : (d.date_kinds[0]?.key ?? '') })}>{Object.entries(d.triggers).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          <Field label={form.trigger_kind === 'stage' ? 'Stage' : 'Kind of date'} htmlFor="dr-value"><SelectInput id="dr-value" value={form.trigger_value} onChange={(e) => setForm({ ...form, trigger_value: e.target.value })}>
            {form.trigger_kind === 'stage' ? d.stages.map((s) => <option key={s} value={s}>{s}</option>) : d.date_kinds.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</SelectInput></Field>
          <Field label="Make the date" htmlFor="dr-title"><TextInput id="dr-title" value={form.make_title} maxLength={200} onChange={(e) => setForm({ ...form, make_title: e.target.value })} required /></Field>
          <Field label="Of kind" htmlFor="dr-kind"><SelectInput id="dr-kind" value={form.make_kind} onChange={(e) => setForm({ ...form, make_kind: e.target.value })}><option value="">None</option>{d.date_kinds.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}</SelectInput></Field>
          <Field label="Days later" htmlFor="dr-days"><TextInput id="dr-days" type="number" min="0" value={form.offset_days} onChange={(e) => setForm({ ...form, offset_days: e.target.value })} required /></Field>
          <Field label="Warn days (optional)" htmlFor="dr-warn"><TextInput id="dr-warn" value={form.warn_days} placeholder="14,7,1" onChange={(e) => setForm({ ...form, warn_days: e.target.value })} /></Field>
          <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.working_days} onChange={(e) => setForm({ ...form, working_days: e.target.checked })} /> Working days only</label>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Save the rule</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      {d.rules.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No date rules for this industry.</p>}
      {d.rules.map((r) => (
        <div key={r.id} data-date-rule={r.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <span>{describe(r)}{r.warn_days ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> · warn {r.warn_days} days before</span> : null} {!r.is_active && <Chip>Off</Chip>}</span>
          {d.can.change && <span style={{ display: 'flex', gap: 4 }}><Btn small variant="quiet" onClick={() => setForm({ ...blank, ...r, make_kind: r.make_kind ?? '', warn_days: r.warn_days ?? '' })}>Change</Btn><Btn small variant="quiet" onClick={async () => { try { setD(await projectsAPI.saveDateRule(r.id, { is_active: !r.is_active })); } catch (e) { setProblem(message(e, 'That could not be saved.')); } }}>{r.is_active ? 'Switch off' : 'Switch on'}</Btn></span>}
        </div>
      ))}
    </Panel>
  );
}
