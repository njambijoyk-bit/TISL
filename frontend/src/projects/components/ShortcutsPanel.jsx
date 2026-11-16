import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Notice, Panel, PanelTitle, TextInput } from './ui';

/**
 * The shortcut keys as settings (docs/PROJECTS_STAGE1_SPEC.md, build 1.9): the company's, changed by someone who holds that permission, and
 * each person's own on top. `onChanged` tells the page the keys in use changed, so they work at once.
 */
const GROUPS = [['go', 'Go to: press G, then the letter'], ['on', 'On an open piece of work: hold Shift and press the letter']];

function KeyGrid({ data, values, onChange, prefix, disabled }) {
  return GROUPS.map(([group, title]) => (
    <fieldset key={group} style={{ border: 'none', margin: '0 0 12px', padding: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', padding: 0, marginBottom: 8 }}>{title}</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px 18px' }}>
        {Object.entries(data.keys).filter(([, k]) => k.group === group).map(([key, k]) => (
          <label key={key} htmlFor={`${prefix}-${key}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}>
            <span>{k.what}</span>
            <TextInput id={`${prefix}-${key}`} value={values[key] ?? ''} maxLength={1} disabled={disabled} onChange={(e) => onChange({ ...values, [key]: e.target.value.toUpperCase() })}
              style={{ width: 46, textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }} />
          </label>
        ))}
      </div>
    </fieldset>
  ));
}

export default function ShortcutsPanel({ onChanged }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [company, setCompany] = useState({});
  const [mine, setMine] = useState({});
  const [problem, setProblem] = useState({ company: '', mine: '' });

  const take = useCallback((d) => { setData(d); setCompany(d.company); setMine(d.in_use); setProblem({ company: '', mine: '' }); }, []);
  useEffect(() => { projectsAPI.shortcuts().then(take).catch((e) => setFailed(message(e, 'The keys could not be loaded. Try again.'))); }, [take]);

  const save = async (which, call, done) => {
    try { take(await call()); toast.success(done); onChanged(); } catch (e) { setProblem((p) => ({ ...p, [which]: message(e, 'Those keys could not be saved.') })); }
  };

  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading the keys…</p></Panel>;
  const hasOwn = Object.keys(data.mine).length > 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <Panel as="form" onSubmit={(e) => { e.preventDefault(); save('mine', () => projectsAPI.saveMyShortcuts(mine), 'Your keys are saved'); }}>
        <PanelTitle hint={hasOwn ? 'You have keys of your own. They change only your screens.' : 'You are using the company\'s keys. Change any letter to make it your own.'}>My keys</PanelTitle>
        <KeyGrid data={data} values={mine} onChange={(v) => { setMine(v); setProblem((p) => ({ ...p, mine: '' })); }} prefix="my-key" />
        {problem.mine && <Notice status="problem" style={{ marginBottom: 12 }}>{problem.mine}</Notice>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn type="submit" variant="primary">Save my keys</Btn>
          {hasOwn && <Btn onClick={() => save('mine', () => projectsAPI.saveMyShortcuts(null), 'You are using the company\'s keys again')}>Use the company's keys</Btn>}
        </div>
      </Panel>

      <Panel as="form" onSubmit={(e) => { e.preventDefault(); save('company', () => projectsAPI.saveShortcuts(company), 'The company\'s keys are saved'); }}>
        <PanelTitle hint={data.can.company ? 'What everyone gets unless they set their own.' : 'What everyone gets unless they set their own. You may not change these.'}>The company's keys</PanelTitle>
        <KeyGrid data={data} values={company} onChange={(v) => { setCompany(v); setProblem((p) => ({ ...p, company: '' })); }} prefix="company-key" disabled={!data.can.company} />
        {problem.company && <Notice status="problem" style={{ marginBottom: 12 }}>{problem.company}</Notice>}
        {data.can.company && <Btn type="submit" variant="primary">Save the company's keys</Btn>}
      </Panel>

      <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
        Shift with {data.taken_with_shift.join(', ')} already does something everywhere in TISL, so those letters cannot be used with Shift here. Press Shift+A on any page to see every key that works there.
        The keys TISL shares stay as they are: F2 new, F7 trash, F8 filters, F9 export, F12 configuration, / search.
      </p>
    </div>
  );
}
