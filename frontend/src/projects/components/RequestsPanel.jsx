import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const TONE = { open: 'info', done: 'good', declined: 'problem', cancelled: 'neutral' };
const WORD = { open: 'Waiting', done: 'Done', declined: 'Declined', cancelled: 'Cancelled' };

/**
 * Asking for files and sign-off on the Files tab (docs/PROJECTS_STAGE9_SPEC.md, build 9.3). Ask someone on the work (answered here) or a contact
 * (answered on their own link, no sign-in). A sign-off is on one exact version, with the signer's typed name, a note, the time and their address.
 */
export default function RequestsPanel({ projectId, files = [], ask = null, onAsked, onChanged }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [answering, setAnswering] = useState(null);
  const [problem, setProblem] = useState('');
  const picker = useRef(null);
  const load = useCallback(async () => { try { setData(await projectsAPI.requests(projectId)); } catch (e) { setProblem(message(e, 'The requests could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (ask) { setForm({ kind: 'signoff', what: `Sign off ${ask.name}`, who: '', file_id: ask.id, due_on: '' }); onAsked?.(); } }, [ask, onAsked]);
  if (!data?.requests) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const send = async (e) => {
    e.preventDefault();
    const [type, id] = form.who.split(':');
    try { setData(await projectsAPI.askRequest(projectId, { kind: form.kind, what: form.what, due_on: form.due_on || null, file_id: form.file_id || null, [{ u: 'user_id', c: 'contact_id', g: 'guest_link_id' }[type]]: Number(id) })); setForm(null); setProblem(''); toast.success('Asked. They are told.'); } catch (err) { setProblem(message(err, 'It could not be asked.')); }
  };
  const answer = async (r, body, file) => { try { setData(await projectsAPI.answerRequest(projectId, r.id, body, file)); setAnswering(null); setProblem(''); toast.success('Answered'); onChanged?.(); } catch (e) { setProblem(message(e, 'It could not be answered.')); } };

  return (
    <Panel data-requests style={{ marginBottom: 14 }}>
      <PanelTitle hint="Files and sign-offs asked of the team, the client and other parties" right={data.can.ask && !form ? <Btn small onClick={() => setForm({ kind: 'file', what: '', who: '', file_id: '', due_on: '' })}>Ask for a file</Btn> : null}>Requests</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={send} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }} data-request-form>
          <Field label="What" htmlFor="rq-kind"><SelectInput id="rq-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="file">A file</option><option value="signoff">A sign-off</option></SelectInput></Field>
          {form.kind === 'signoff' && <Field label="On the file" htmlFor="rq-file"><SelectInput id="rq-file" value={form.file_id} onChange={(e) => setForm({ ...form, file_id: Number(e.target.value) })} required><option value="">Choose</option>{files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</SelectInput></Field>}
          <Field label="Say what" htmlFor="rq-what"><TextInput id="rq-what" value={form.what} maxLength={300} onChange={(e) => setForm({ ...form, what: e.target.value })} required /></Field>
          <Field label="Of whom" htmlFor="rq-who"><SelectInput id="rq-who" value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} required><option value="">Choose</option>
            <optgroup label="On the work">{data.people.map((u) => <option key={`u${u.id}`} value={`u:${u.id}`}>{u.name}</option>)}</optgroup>
            <optgroup label="Contacts (by email)">{data.contacts.map((c) => <option key={`c${c.id}`} value={`c:${c.id}`}>{c.name}{c.party ? ` (${c.party})` : ''}</option>)}</optgroup>
            {data.guests?.length > 0 && <optgroup label="Guests (on their guest link)">{data.guests.map((g) => <option key={`g${g.id}`} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}
          </SelectInput></Field>
          <Field label="By (optional)" htmlFor="rq-due"><TextInput id="rq-due" type="date" value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} /></Field>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Ask</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      {data.requests.length === 0 && !form && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing asked yet.</p>}
      {data.requests.map((r) => (
        <div key={r.id} data-request={r.what} style={{ display: 'grid', gap: 4, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip>{r.kind === 'file' ? 'File' : 'Sign-off'}</Chip><strong>{r.what}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>of {r.of}{r.guest ? ' (guest)' : r.outside ? ' (by email)' : ''}{r.due_on ? ` · by ${day(r.due_on)}` : ''}{r.file ? ` · ${r.file.name}${r.version ? `, version ${r.version}` : ''}` : ''}</span>
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {r.late && <Chip status="problem">Late</Chip>}<Chip status={TONE[r.state]}>{WORD[r.state]}</Chip>
              {r.newer && <Chip status="warning">The file has changed since</Chip>}
              {r.state === 'open' && data.can.ask && <Btn small variant="quiet" onClick={async () => { try { setData(await projectsAPI.cancelRequest(projectId, r.id)); } catch (e) { setProblem(message(e, 'It could not be cancelled.')); } }}>Cancel</Btn>}
              {r.mine && <Btn small variant="primary" onClick={() => (r.kind === 'file' ? (setAnswering(r), picker.current?.click()) : setAnswering({ ...r, name: '', note: '' }))}>{r.kind === 'file' ? 'Send the file' : 'Answer'}</Btn>}
            </span>
          </div>
          {r.answer && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{r.state === 'declined' ? 'Declined' : r.kind === 'file' ? 'Sent' : 'Signed off'} by {r.answer.name} · {r.answer.at?.slice(0, 16)}{r.answer.note ? ` · "${r.answer.note}"` : ''}</span>}
          {answering?.id === r.id && r.kind === 'signoff' && (
            <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 9, background: 'var(--surface-hover)' }}>
              <TextInput aria-label="Type your full name to sign" placeholder="Type your full name to sign" value={answering.name} onChange={(e) => setAnswering({ ...answering, name: e.target.value })} />
              <TextInput aria-label="A note" placeholder="A note (needed when you decline)" value={answering.note} onChange={(e) => setAnswering({ ...answering, note: e.target.value })} />
              <span style={{ display: 'flex', gap: 6 }}><Btn small variant="primary" onClick={() => answer(r, { decision: 'approve', name: answering.name, note: answering.note })}>Approve</Btn><Btn small variant="danger" onClick={() => answer(r, { decision: 'decline', name: answering.name, note: answering.note })}>Decline</Btn><Btn small onClick={() => setAnswering(null)}>Cancel</Btn></span>
            </div>
          )}
        </div>
      ))}
      <input ref={picker} type="file" hidden aria-label="Choose the file to send" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f && answering) answer(answering, {}, f); }} />
    </Panel>
  );
}
