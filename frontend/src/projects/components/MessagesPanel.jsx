import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { command, complete, typing } from '../lib/composer';
import { hm } from '../lib/tasks';
import { Btn, Chip, Field, Notice, Panel, SelectInput, TextInput } from './ui';
import FollowButton from './FollowButton';

const TONE = { team: 'neutral', client: 'info', others: 'warning' };
const when = (at) => { if (!at) return ''; const d = new Date(at.replace(' ', 'T')); return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };

/**
 * The Messages tab (docs/PROJECTS_STAGE6_SPEC.md, build 6.1): conversations on a piece of work with the team, the client or other parties.
 * A message in a client or others conversation goes to its contacts through the Notifier; what was sent where shows under it. Build 6.2 adds
 * @mentions and #tags with suggestions, /task and /time, editing for 15 minutes (or moderating), and tags on a conversation. Build 6.3 adds
 * following the work and each conversation.
 */
export default function MessagesPanel({ projectId }) {
  const [list, setList] = useState(null);
  const [state, setState] = useState('open');
  const [openId, setOpenId] = useState(() => Number(new URLSearchParams(window.location.search).get('thread')) || null);
  const [thread, setThread] = useState(null);
  const [starting, setStarting] = useState(null);
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState([]);   // people chosen from the @ suggestions
  const [at, setAt] = useState(null);   // what is being typed after @ or #
  const [editing, setEditing] = useState(null);   // { id, body }
  const [tagging, setTagging] = useState(false);
  const box = useRef(null);
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
    const cmd = command(draft);
    setBusy(true);
    try {
      if (cmd?.cmd === 'time') {
        if (!cmd.minutes) { setProblem('Say how long, like /time 1h30 or /time 45m.'); return; }
        await projectsAPI.logTime({ project_id: projectId, minutes: cmd.minutes, note: cmd.note || thread.subject });
        toast.success(`Logged ${hm(cmd.minutes)} on this work`); setDraft(''); setProblem(''); return;
      }
      if (cmd?.cmd === 'meet') { toast('Meetings arrive with build 6.6.'); return; }
      const r = await projectsAPI.postMessage(projectId, thread.id, draft, mentions.filter((m) => draft.includes(`@${m.name}`)).map((m) => m.id));
      if (cmd?.cmd === 'task') {
        const made = await projectsAPI.messageToTask(projectId, thread.id, r.thread.messages.at(-1).id);
        setThread(made.thread); toast.success('Made into a task');
      } else setThread(r.thread);
      setDraft(''); setMentions([]); setProblem(''); load();
    } catch (err) { setProblem(message(err, 'The message could not be sent. Try again.')); } finally { setBusy(false); }
  };
  const suggestions = !at || !thread ? [] : at.sign === '@'
    ? (thread.people ?? []).filter((u) => u.name.toLowerCase().includes(at.word.toLowerCase())).slice(0, 6).map((u) => ({ key: `u${u.id}`, label: u.name, insert: u.name, person: u }))
    : (thread.tag_list ?? []).filter((g) => g.key.includes(at.word.toLowerCase()) || g.name.toLowerCase().includes(at.word.toLowerCase())).slice(0, 6).map((g) => ({ key: `t${g.id}`, label: `#${g.key} · ${g.name}`, insert: g.key }));
  const pick = (sug) => {
    setDraft(complete(draft, at, sug.insert));
    if (sug.person) setMentions([...mentions.filter((m) => m.id !== sug.person.id), sug.person]);
    setAt(null); box.current?.focus();
  };
  const act = async (call, done) => { try { setThread((await call()).thread); if (done) toast.success(done); load(); } catch (err) { setProblem(message(err, 'That could not be done.')); } };
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
        {list.following && <FollowButton what="this work" state={list.following} onChange={async (on) => setList({ ...list, following: (await projectsAPI.follow(projectId, 'project', projectId, on)).following })} />}
        <SelectInput aria-label="Which conversations" value={state} onChange={(e) => setState(e.target.value)}><option value="open">Open</option><option value="closed">Closed</option><option value="all">All</option></SelectInput>
        {list.threads.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No conversations{state === 'open' ? ' open' : ''}.</p>}
        {list.threads.map((t) => (
          <button key={t.id} type="button" onClick={() => { setStarting(null); setOpenId(t.id); }} data-thread={t.subject}
            style={{ textAlign: 'left', border: `1px solid ${openId === t.id ? 'var(--color-primary-500)' : 'var(--line)'}`, background: openId === t.id ? 'var(--surface-hover)' : 'var(--surface-card)', borderRadius: 10, padding: 9, cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><strong style={{ fontSize: 13.5 }}>{t.subject}</strong>{t.unread > 0 && <Chip status="info">{t.unread}</Chip>}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}><Chip status={TONE[t.audience]}>{list.audiences[t.audience] ?? t.audience}</Chip>{(t.tags ?? []).map((g) => <Chip key={g.id} status={g.status ?? 'neutral'}>#{g.key}</Chip>)}{t.contacts.map((c) => c.name).join(', ')}{t.state === 'closed' && <Chip>Closed</Chip>}</span>
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
                {thread.tags.map((g) => <Chip key={g.id} status={g.status ?? 'neutral'}>#{g.key}</Chip>)}
                {thread.can.write && <Btn small variant="quiet" aria-expanded={tagging} onClick={() => setTagging(!tagging)}>Tags</Btn>}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
              {thread.following && <FollowButton what="this conversation" state={thread.following} onChange={async (on) => setThread({ ...thread, following: (await projectsAPI.follow(projectId, 'thread', thread.id, on)).following })} />}
              {thread.can.write && <Btn small variant="quiet" onClick={async () => { try { setThread((await projectsAPI.changeThread(projectId, thread.id, { state: thread.state === 'open' ? 'closed' : 'open' })).thread); load(); } catch (e) { setProblem(message(e, 'It could not be changed.')); } }}>{thread.state === 'open' ? 'Close it' : 'Open it again'}</Btn>}
              </span>
            </div>
            {tagging && (
              <div role="group" aria-label="Tags on this conversation" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }} data-tag-editor>
                {(thread.tag_list ?? []).map((g) => { const on = thread.tags.some((x) => x.id === g.id); return <Btn key={g.id} small variant={on ? 'primary' : 'plain'} aria-pressed={on} onClick={() => act(() => projectsAPI.tagThread(projectId, thread.id, on ? thread.tags.filter((x) => x.id !== g.id).map((x) => x.id) : [...thread.tags.map((x) => x.id), g.id]))}>#{g.key}</Btn>; })}
              </div>
            )}
            <div style={{ display: 'grid', gap: 10, maxHeight: 460, overflowY: 'auto', padding: '2px 2px 8px' }}>
              {thread.messages.map((m) => (
                <div key={m.id} data-message={m.id} style={{ justifySelf: m.mine ? 'end' : 'start', maxWidth: '82%', borderRadius: 12, padding: '8px 11px', background: m.mine ? 'var(--surface-hover)' : 'var(--surface-input)', border: m.from.type === 'contact' ? '1px dashed var(--line-strong)' : '1px solid transparent', display: 'grid', gap: 4 }}>
                  {m.removed ? <em style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Removed by {m.removed.by}</em> : editing?.id === m.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); act(() => projectsAPI.editMessage(projectId, thread.id, m.id, editing.body), 'Changed').then(() => setEditing(null)); }} style={{ display: 'grid', gap: 6 }}>
                      <textarea aria-label="Change the message" rows={3} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} style={area} />
                      <span style={{ display: 'flex', gap: 6 }}><Btn type="submit" small variant="primary">Save</Btn><Btn small onClick={() => setEditing(null)}>Cancel</Btn></span>
                    </form>
                  ) : <span style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</span>}
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {m.from.name} · {when(m.at)}{m.edited ? ' · edited' : ''}{m.via !== 'app' ? ` · replied by ${m.via === 'whatsapp' ? 'WhatsApp' : 'email'}` : ''}
                    {m.sent_to?.length > 0 && ` · ${m.sent_to.map((s) => (s.channels.length ? `sent to ${s.contact} by ${s.channels.join(' and ')}` : `${s.contact} could not be reached`)).join('; ')}`}
                  </span>
                  {!m.removed && editing?.id !== m.id && (m.can_change || (thread.can.write && !m.task_id)) && (
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {m.can_change && <Btn small variant="quiet" aria-label={`Change message ${m.id}`} onClick={() => setEditing({ id: m.id, body: m.body })}>Change</Btn>}
                      {m.can_change && <Btn small variant="quiet" aria-label={`Remove message ${m.id}`} onClick={() => act(() => projectsAPI.removeMessage(projectId, thread.id, m.id), 'Removed')}>Remove</Btn>}
                      {thread.can.write && !m.task_id && <Btn small variant="quiet" aria-label={`Make message ${m.id} a task`} onClick={() => act(() => projectsAPI.messageToTask(projectId, thread.id, m.id), 'Made into a task')}>Make a task</Btn>}
                    </span>
                  )}
                  {m.task_id && <span style={{ fontSize: 11.5 }}><Chip status="good">Made into a task</Chip></span>}
                </div>
              ))}
              <span ref={end} />
            </div>
            {thread.can.write ? (
              <form onSubmit={send} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <div style={{ position: 'relative' }}>
                  <textarea ref={box} aria-label="Your message" rows={3} maxLength={10000} value={draft} placeholder="Write a message. @ someone, # a tag, /task, /time 1h30"
                    onChange={(e) => { setDraft(e.target.value); setAt(typing(e.target.value, e.target.selectionStart)); }} style={area}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); if (e.key === 'Escape') setAt(null); }} />
                  {suggestions.length > 0 && (
                    <div role="listbox" aria-label={at.sign === '@' ? 'People' : 'Tags'} data-suggestions style={{ position: 'absolute', left: 8, bottom: '100%', zIndex: 5, background: 'var(--surface-card)', border: '1px solid var(--line-strong)', borderRadius: 9, padding: 4, display: 'grid', minWidth: 200 }}>
                      {suggestions.map((g) => <button key={g.key} type="button" role="option" aria-selected="false" onClick={() => pick(g)} style={{ textAlign: 'left', background: 'none', border: 0, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>{g.label}</button>)}
                    </div>
                  )}
                </div>
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
