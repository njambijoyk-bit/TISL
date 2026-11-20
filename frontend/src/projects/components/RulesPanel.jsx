import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const DO = { tell: 'Tell', task: 'Make a task', date: 'Make a key date', follow: 'Add a follower', tag: 'Tag the conversation', flag: 'Flag the client' };
const OUTCOME = { done: 'good', skipped: 'warning', failed: 'problem' };
const blank = { name: '', trigger_event: 'work_started', trigger_value: '', conditions: {}, actions: [{ do: 'tell', who: 'lead' }], is_active: false, max_per_day: 50 };
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const muted = { color: 'var(--text-secondary)', fontSize: 13 };

/**
 * Rules (docs/PROJECTS_STAGE12_SPEC.md, build 12.5): when something happens, if the work matches, then tell someone, make a task or a key date,
 * add a follower, tag the conversation or flag the client. A rule never takes a serious action, touches Books, deletes or moves a stage.
 * Try one first to see what it would have done in the last 30 days.
 */
export default function RulesPanel() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [tried, setTried] = useState({});
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.rules().then(setD).catch((e) => setProblem(message(e, 'The rules could not be loaded.'))); }, []);
  if (!d?.rules) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!d.ready) return <Notice status="warning">Rules need database script 269.</Notice>;
  const event = (k) => d.events.find((e) => e.key === k);
  const ev = form ? event(form.trigger_event) : null;
  const who = (a) => (a.who === 'user' ? 'a person' : (d.who[a.who] ?? a.who)).toLowerCase();
  const says = (a) => ({ tell: `tell ${who(a)}`, task: `make the task "${a.title}" for ${who(a)}, due in ${a.days ?? 1} day(s)`, date: `make the key date "${a.title}" in ${a.days ?? 7} days`,
    follow: `${who(a)} follows the work`, tag: `tag the conversation #${a.tag}`, flag: `flag the client: ${d.flags.find((f) => f.key === a.flag)?.name ?? a.flag}` }[a.do]);
  const setAction = (i, patch) => setForm({ ...form, actions: form.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const save = async (e) => {
    e.preventDefault();
    try { setD(await projectsAPI.saveRule(form.id ?? null, form)); setForm(null); setProblem(''); toast.success('Saved'); } catch (err) { setProblem(message(err, 'The rule could not be saved.')); }
  };
  const trial = async (r) => { try { setTried({ ...tried, [r.id]: await projectsAPI.tryRule(r.id) }); } catch (e) { setProblem(message(e, 'The rule could not be tried.')); } };
  const toggle = async (r) => { try { setD(await projectsAPI.saveRule(r.id, { is_active: !r.is_active })); } catch (e) { setProblem(message(e, 'That could not be saved.')); } };

  return (
    <Panel data-rules>
      <PanelTitle hint="When something happens, if the work matches, then do these things. Rules only tell, make tasks and dates, follow, tag and flag." right={d.can.change && !form ? <Btn small onClick={() => setForm({ ...blank })}>Add a rule</Btn> : null}>Rules</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}

      {form && (
        <form onSubmit={save} data-rule-form style={{ display: 'grid', gap: 10, marginBottom: 14, padding: 12, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            <Field label="Name" htmlFor="ru-n"><TextInput id="ru-n" value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="When" htmlFor="ru-e"><SelectInput id="ru-e" value={form.trigger_event} onChange={(e) => setForm({ ...form, trigger_event: e.target.value, trigger_value: '' })}>{d.events.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</SelectInput></Field>
            {ev?.value && <Field label={ev.value} htmlFor="ru-v"><TextInput id="ru-v" value={form.trigger_value ?? ''} maxLength={120} onChange={(e) => setForm({ ...form, trigger_value: e.target.value })} /></Field>}
            <Field label="At most, runs a day" htmlFor="ru-m"><TextInput id="ru-m" type="number" min={1} max={500} value={form.max_per_day} onChange={(e) => setForm({ ...form, max_per_day: e.target.value })} /></Field>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>If (leave empty for every work)</legend>
            <Field label="Industry" htmlFor="ru-i"><SelectInput id="ru-i" value={form.conditions.industry ?? ''} onChange={(e) => setForm({ ...form, conditions: { ...form.conditions, industry: e.target.value || undefined } })}><option value="">Any</option>{d.industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>
            <Field label="Priority" htmlFor="ru-p"><SelectInput id="ru-p" value={form.conditions.priority?.[0] ?? ''} onChange={(e) => setForm({ ...form, conditions: { ...form.conditions, priority: e.target.value ? [e.target.value] : undefined } })}><option value="">Any</option>{['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}</SelectInput></Field>
            <Field label="At the stage" htmlFor="ru-s"><TextInput id="ru-s" value={form.conditions.stage ?? ''} placeholder="Any" onChange={(e) => setForm({ ...form, conditions: { ...form.conditions, stage: e.target.value || undefined } })} /></Field>
          </fieldset>
          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Then</strong>
            {form.actions.map((a, i) => (
              <div key={i} data-rule-action={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'end' }}>
                <Field label="Do" htmlFor={`ru-a${i}`}><SelectInput id={`ru-a${i}`} value={a.do} onChange={(e) => setAction(i, { do: e.target.value })}>{Object.entries(DO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
                {['tell', 'task', 'follow'].includes(a.do) && <Field label="Who" htmlFor={`ru-w${i}`}><SelectInput id={`ru-w${i}`} value={a.who ?? 'lead'} onChange={(e) => setAction(i, { who: e.target.value })}>{Object.entries(d.who).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>}
                {['task', 'date'].includes(a.do) && <Field label="Title" htmlFor={`ru-t${i}`}><TextInput id={`ru-t${i}`} value={a.title ?? ''} maxLength={200} onChange={(e) => setAction(i, { title: e.target.value })} /></Field>}
                {['task', 'date'].includes(a.do) && <Field label="In days" htmlFor={`ru-d${i}`}><TextInput id={`ru-d${i}`} type="number" min={0} max={365} style={{ width: 80 }} value={a.days ?? ''} onChange={(e) => setAction(i, { days: e.target.value })} /></Field>}
                {a.do === 'tell' && <Field label="Message (optional)" htmlFor={`ru-x${i}`}><TextInput id={`ru-x${i}`} value={a.message ?? ''} maxLength={500} onChange={(e) => setAction(i, { message: e.target.value })} /></Field>}
                {a.do === 'tag' && <Field label="Tag" htmlFor={`ru-g${i}`}><SelectInput id={`ru-g${i}`} value={a.tag ?? ''} onChange={(e) => setAction(i, { tag: e.target.value })}><option value="">Choose…</option>{d.tags.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</SelectInput></Field>}
                {a.do === 'flag' && <Field label="Flag" htmlFor={`ru-f${i}`}><SelectInput id={`ru-f${i}`} value={a.flag ?? ''} onChange={(e) => setAction(i, { flag: e.target.value })}><option value="">Choose…</option>{d.flags.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}</SelectInput></Field>}
                {form.actions.length > 1 && <Btn small variant="quiet" onClick={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })}>Remove</Btn>}
              </div>
            ))}
            {form.actions.length < 6 && <span><Btn small variant="quiet" onClick={() => setForm({ ...form, actions: [...form.actions, { do: 'tell', who: 'lead' }] })}>Add another</Btn></span>}
          </div>
          <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Switched on</label>
          <span style={{ display: 'flex', gap: 6 }}><Btn type="submit" small variant="primary">Save the rule</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}

      {d.rules.length === 0 ? <p style={muted}>No rules yet.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {d.rules.map((r) => (
            <li key={r.id} data-rule={r.key ?? r.id} style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <span><strong>{r.name}</strong> <Chip status={r.is_active ? 'good' : 'neutral'}>{r.is_active ? 'On' : 'Off'}</Chip>{r.runs_today > 0 && <span style={muted}> · {r.runs_today} today</span>}</span>
                {d.can.change && <span style={{ display: 'flex', gap: 4 }}>
                  <Btn small variant="quiet" onClick={() => trial(r)}>Try it</Btn>
                  <Btn small variant="quiet" onClick={() => setForm({ ...r, trigger_value: r.trigger_value ?? '', conditions: Array.isArray(r.conditions) ? {} : r.conditions })}>Change</Btn>
                  <Btn small variant="quiet" onClick={() => toggle(r)}>{r.is_active ? 'Switch off' : 'Switch on'}</Btn>
                </span>}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 14 }}>
                <span style={muted}>When</span> {event(r.trigger_event)?.name.toLowerCase()}{r.trigger_value ? `: ${r.trigger_value}` : ''}
                {r.conditions?.industry && <>, <span style={muted}>if</span> {d.industries.find((i) => i.key === r.conditions.industry)?.name}</>}
                , <span style={muted}>then</span> {r.actions.map(says).join('; ')}.
              </p>
              {tried[r.id] && (
                <div data-rule-tried={r.id} style={{ marginTop: 6 }}><Notice status="info">In the last 30 days it would have run {tried[r.id].runs} time{tried[r.id].runs === 1 ? '' : 's'}.{tried[r.id].examples.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{tried[r.id].examples.map((x) => <li key={x}>{x}</li>)}</ul>}</Notice></div>
              )}
              {r.last_runs.length > 0 && (
                <details style={{ marginTop: 4 }}><summary style={{ ...muted, cursor: 'pointer' }}>Last runs</summary>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{r.last_runs.map((x, i) => <li key={i}>{when(x.created_at)} · {x.subject} <Chip status={OUTCOME[x.outcome]}>{x.outcome}</Chip>{x.note ? ` ${x.note}` : ''}</li>)}</ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
