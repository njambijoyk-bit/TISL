import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const STATE = { open: ['warning', 'Open'], fixed: ['info', 'Fixed, to check'], closed: ['good', 'Closed'] };
const big = { minHeight: 40, padding: '8px 12px', fontSize: 13.5 };

/**
 * Snags (docs/PROJECTS_STAGE10_SPEC.md, build 10.7): what, where, a photo, given to someone on the work or a subcontract, by a day. Whoever has
 * it marks it fixed; whoever may inspect closes it or opens it again. A snag shared with the client shows on their portal.
 */
export default function SnagsPanel({ projectId, word = (k) => k }) {
  const [state, setState] = useState('open');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [problem, setProblem] = useState('');
  const camera = useRef(null);
  const load = useCallback(async () => { try { setData(await projectsAPI.snags(projectId, state)); } catch (e) { setProblem(message(e, 'The snags could not be loaded.')); } }, [projectId, state]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice>The site is not set up yet. Run script 267.</Notice>;
  const run = async (fn, done) => { try { await fn(); await load(); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const raise = async (e) => {
    e.preventDefault();
    const [k, id] = String(form.given || '').split(':');
    if (await run(() => projectsAPI.raiseSnag(projectId, { title: form.title, area: form.area, due_on: form.due_on, shared: form.shared, [k === 's' ? 'subcontract_id' : 'user_id']: id ? Number(id) : null }, photo), 'Raised')) { setForm(null); setPhoto(null); }
  };
  const w = word('snag', true);

  return (
    <Panel data-snags>
      <PanelTitle hint="Given to someone on the work or a subcontract; fixed, then checked and closed" right={data.can.manage && !form ? <Btn small onClick={() => setForm({ title: '', area: '', given: '', due_on: '', shared: false })}>Raise a snag</Btn> : null}>{w}</PanelTitle>
      <div role="tablist" aria-label={`Which ${w.toLowerCase()}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(STATE).map(([k, [, l]]) => <Btn key={k} small role="tab" aria-selected={state === k} variant={state === k ? 'primary' : 'plain'} onClick={() => setState(k)}>{l} ({data.counts[k]})</Btn>)}
      </div>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={raise} data-snag-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Field label="What" htmlFor="sn-title"><TextInput id="sn-title" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} required style={big} /></Field>
          <Field label="Where (optional)" htmlFor="sn-area"><TextInput id="sn-area" value={form.area} maxLength={160} onChange={(e) => setForm({ ...form, area: e.target.value })} style={big} /></Field>
          <Field label="Given to" htmlFor="sn-given"><SelectInput id="sn-given" value={form.given} onChange={(e) => setForm({ ...form, given: e.target.value })} style={big}><option value="">Nobody yet</option>
            <optgroup label="On the work">{data.people.map((p) => <option key={`u${p.id}`} value={`u:${p.id}`}>{p.name}</option>)}</optgroup>
            {data.subcontracts.length > 0 && <optgroup label="Subcontracts">{data.subcontracts.map((s) => <option key={`s${s.id}`} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>}
          </SelectInput></Field>
          <Field label="By (optional)" htmlFor="sn-due"><TextInput id="sn-due" type="date" value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} style={big} /></Field>
          {data.can.photos && <Field label="Photo (optional)" htmlFor="sn-photo"><input id="sn-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files[0] ?? null)} /></Field>}
          <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} /> The client sees it</label>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Raise it</Btn><Btn small onClick={() => { setForm(null); setPhoto(null); }}>Cancel</Btn></span>
        </form>
      )}
      {data.snags.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None here.</p>}
      {data.snags.map((s) => (
        <div key={s.id} data-snag={s.number} style={{ display: 'grid', gap: 4, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><strong>{s.number}. {s.title}</strong> <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.area ? `· ${s.area} ` : ''}{s.given ? `· ${s.given.name} ` : '· given to nobody yet '}{s.due_on ? `· by ${day(s.due_on)}` : ''}{s.from_inspection ? ' · from an inspection' : ''}{s.file ? ` · photo ${s.file.name}` : ''}</span></span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {s.late && <Chip status="problem">Late</Chip>}{s.shared && <Chip>Client sees it</Chip>}<Chip status={STATE[s.state][0]}>{STATE[s.state][1]}</Chip>
              {s.state === 'open' && (s.mine || data.can.manage) && <Btn small variant="primary" onClick={() => { const note = window.prompt('What was done? (optional)') ?? null; if (note !== null) run(() => projectsAPI.fixSnag(projectId, s.id, note), 'Marked fixed'); }}>Mark fixed</Btn>}
              {s.state === 'fixed' && data.can.manage && <Btn small variant="primary" onClick={() => run(() => projectsAPI.closeSnag(projectId, s.id), 'Closed')}>Close</Btn>}
              {s.state !== 'open' && data.can.manage && <Btn small variant="quiet" onClick={() => { const note = window.prompt('Why is it opened again?'); if (note) run(() => projectsAPI.reopenSnag(projectId, s.id, note), 'Opened again'); }}>Open again</Btn>}
              {data.can.manage && <Btn small variant="quiet" onClick={() => run(() => projectsAPI.saveSnag(projectId, s.id, { shared: !s.shared }), s.shared ? 'The client no longer sees it' : 'The client sees it')}>{s.shared ? 'Stop sharing' : 'Share with the client'}</Btn>}
              {(s.mine || data.can.manage) && data.can.photos && <Btn small variant="quiet" onClick={() => { camera.current.dataset.snag = s.id; camera.current.click(); }}>Photo</Btn>}
            </span>
          </div>
          {s.fixed_note && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.fixed_by ? `${s.fixed_by}: ` : ''}{s.fixed_note}</span>}
        </div>
      ))}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take a photo of the snag" onChange={(e) => { const f = e.target.files[0]; const id = Number(e.target.dataset.snag); e.target.value = ''; if (f && id) run(() => projectsAPI.snagPhoto(projectId, id, f), 'Photo kept in Files'); }} />
    </Panel>
  );
}
