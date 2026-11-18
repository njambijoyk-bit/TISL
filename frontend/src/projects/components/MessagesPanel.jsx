import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, SelectInput, TextInput } from './ui';

const TONE = { team: 'neutral', client: 'info', others: 'warning' };
const when = (at) => { if (!at) return ''; const d = new Date(at.replace(' ', 'T')); return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };

/**
 * The Messages tab (docs/PROJECTS_STAGE6_SPEC.md, build 6.1): conversations on a piece of work with the team, the client or other parties.
 * A message in a client or others conversation goes to its contacts through the Notifier; what was sent where shows under it.
 */
export default function MessagesPanel({ projectId }) {
  const [list, setList] = useState(null);
  const [state, setState] = useState('open');
  const [openId, setOpenId] = useState(() => Number(new URLSearchParams(window.location.search).get('thread')) || null);
  const [thread, setThread] = useState(null);
  const [starting, setStarting] = useState(null);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  const load = useCallback(async () => { try { setList(await projectsAPI.threads(projectId, { state })); } catch (e) { setProblem(message(e, 'The conversations could not be loaded.')); } }, [projectId, state]);
  const loadThread = useCallback(async (id) => { try { setThread((await projectsAPI.thread(projectId, id)).thread); } catch (e) { setProblem(message(e, 'This conversation could not be opened.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openId) loadThread(openId); else setThread(null); }, [openId, loadThread]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [thread?.messages?.length]);
  if (!list) return problem ? <Notice status="problem">{problem}</Notice> : null;

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try { const r = await projectsAPI.postMessage(projectId, thread.id, draft); setThread(r.thread); setDraft(''); setProblem(''); load(); }
    catch (err) { setProblem(message(err, 'The message could not be sent. Try again.')); } finally { setBusy(false); }
  };
  const begin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await projectsAPI.startThread(projectId, { ...starting, contacts: starting.contacts, owner_id: starting.owner_id || null });
      setStarting(null); setOpenId(r.thread.id); setThread(r.thread); toast.success('Conversation started'); load();
    } catch (err) { setProblem(message(err, 'It could not be started. Try again.')); } finally { setBusy(false); }
  };
  const contacts = starting && starting.audience !== 'team' ? list.contacts[starting.audience] ?? [] : [];
  const to = thread && thread.audience !== 'team' ? thread.contacts.map((c) => c.name).join(', ') : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }} data-messages>
      <div style={{ display: 'grid', gap: 8 }}>
        {list.can.start && !starting && <Btn variant="primary" small onClick={() => { setStarting({ subject: '', audience: Object.keys(list.audiences)[0] ?? 'team', contacts: [], owner_id: '', body: '' }); setProblem(''); }}>New conversation</Btn>}
        <SelectInput aria-label="Which conversations" value={state} onChange={(e) => setState(e.target.value)}><option value="open">Open</option><option value="closed">Closed</option><option value="all">All</option></SelectInput>
        {list.threads.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No conversations{state === 'open' ? ' open' : ''}.</p>}
        {list.threads.map((t) => (
          <button key={t.id} type="button" onClick={() => { setStarting(null); setOpenId(t.id); }} data-thread={t.subject}
            style={{ textAlign: 'left', border: `1px solid ${openId === t.id ? 'var(--color-primary-500)' : 'var(--line)'}`, background: openId === t.id ? 'var(--surface-hover)' : 'var(--surface-card)', borderRadius: 10, padding: 9, cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><strong style={{ fontSize: 13.5 }}>{t.subject}</strong>{t.unread > 0 && <Chip status="info">{t.unread}</Chip>}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}><Chip status={TONE[t.audience]}>{list.audiences[t.audience] ?? t.audience}</Chip>{t.contacts.map((c) => c.name).join(', ')}{t.state === 'closed' && <Chip>Closed</Chip>}</span>
            {t.last && <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.last.from}: {t.last.text ?? 'removed'}</span>}
          </button>
        ))}
      </div>

      <div style={{ minWidth: 0 }}>
        {starting && (
          <Panel as="form" onSubmit={begin} data-new-thread>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <Field label="Subject" htmlFor="th-subject" style={{ gridColumn: '1 / -1' }}><TextInput id="th-subject" value={starting.subject} maxLength={200} onChange={(e) => setStarting({ ...starting, subject: e.target.value })} required /></Field>
              <Field label="With" htmlFor="th-audience"><SelectInput id="th-audience" value={starting.audience} onChange={(e) => setStarting({ ...starting, audience: e.target.value, contacts: [] })}>{Object.entries(list.audiences).map(([k, l]) => <option key={k} value={k}>{k === 'team' ? 'The team only' : k === 'client' ? 'The client' : 'Other parties'}{` (${l})`}</option>)}</SelectInput></Field>
              <Field label="Who answers it" htmlFor="th-owner"><SelectInput id="th-owner" value={starting.owner_id} onChange={(e) => setStarting({ ...starting, owner_id: e.target.value })}><option value="">Me</option>{list.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>
            </div>
            {starting.audience !== 'team' && (
              <div role="group" aria-label="Contacts" style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{starting.audience === 'client' ? "The client's contacts" : "The other parties' contacts"}</span>
                {contacts.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No contacts yet. Add them on the {starting.audience === 'client' ? 'client' : 'Parties tab'} first.</span>}
                {contacts.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                    <input type="checkbox" checked={starting.contacts.includes(c.id)} disabled={!c.reachable} onChange={(e) => setStarting({ ...starting, contacts: e.target.checked ? [...starting.contacts, c.id] : starting.contacts.filter((x) => x !== c.id) })} />
                    {c.name}{c.party ? ` · ${c.party}` : ''}<span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{c.reachable ? ` ${[c.email, c.phone].filter(Boolean).join(' · ')}` : ' no email or phone'}</span>
                  </label>
                ))}
              </div>
            )}
            <Field label="First message" htmlFor="th-body" style={{ marginTop: 10 }}><textarea id="th-body" rows={4} maxLength={10000} value={starting.body} onChange={(e) => setStarting({ ...starting, body: e.target.value })} required style={area} /></Field>
            {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Btn type="submit" variant="primary" small busy={busy}>Start it</Btn><Btn small onClick={() => setStarting(null)}>Cancel</Btn></div>
          </Panel>
        )}
        {!starting && !thread && <Panel><p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Choose a conversation, or start one.</p></Panel>}
        {!starting && thread && (
          <Panel data-thread-open={thread.subject}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong style={{ fontSize: 15 }}>{thread.subject}</strong>
                <Chip status={TONE[thread.audience]}>{thread.audience === 'team' ? 'Team' : thread.audience === 'client' ? 'Client' : 'Others'}</Chip>
                {thread.owner && <Chip>Answered by {thread.owner.name}</Chip>}
                {thread.state === 'closed' && <Chip>Closed</Chip>}
              </span>
              {thread.can.write && <Btn small variant="quiet" onClick={async () => { try { setThread((await projectsAPI.changeThread(projectId, thread.id, { state: thread.state === 'open' ? 'closed' : 'open' })).thread); load(); } catch (e) { setProblem(message(e, 'It could not be changed.')); } }}>{thread.state === 'open' ? 'Close it' : 'Open it again'}</Btn>}
            </div>
            <div style={{ display: 'grid', gap: 10, maxHeight: 460, overflowY: 'auto', padding: '2px 2px 8px' }}>
              {thread.messages.map((m) => (
                <div key={m.id} data-message={m.id} style={{ justifySelf: m.mine ? 'end' : 'start', maxWidth: '82%', borderRadius: 12, padding: '8px 11px', background: m.mine ? 'var(--surface-hover)' : 'var(--surface-input)', border: m.from.type === 'contact' ? '1px dashed var(--line-strong)' : '1px solid transparent', display: 'grid', gap: 4 }}>
                  {m.removed ? <em style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Removed by {m.removed.by}</em> : <span style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</span>}
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {m.from.name} · {when(m.at)}{m.edited ? ' · edited' : ''}{m.via !== 'app' ? ` · replied by ${m.via === 'whatsapp' ? 'WhatsApp' : 'email'}` : ''}
                    {m.sent_to?.length > 0 && ` · ${m.sent_to.map((s) => (s.channels.length ? `sent to ${s.contact} by ${s.channels.join(' and ')}` : `${s.contact} could not be reached`)).join('; ')}`}
                  </span>
                </div>
              ))}
              <span ref={end} />
            </div>
            {thread.can.write ? (
              <form onSubmit={send} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <textarea aria-label="Your message" rows={3} maxLength={10000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message" style={area}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Btn type="submit" variant="primary" small busy={busy} disabled={!draft.trim()}>{to ? `Send to ${to}` : 'Send to the team'}</Btn>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ctrl+Enter sends.</span>
                </div>
              </form>
            ) : <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>You can read this conversation but not write in it.</p>}
            {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
          </Panel>
        )}
      </div>
    </div>
  );
}
