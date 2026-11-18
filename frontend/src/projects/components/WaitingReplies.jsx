import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Notice, Panel, SelectInput } from './ui';

const when = (at) => (at ? new Date(String(at).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Replies nothing could match (docs/PROJECTS_STAGE6_SPEC.md, build 6.5): an email with no reply address we know, a WhatsApp message from a number
 * with no open conversation (or more than one). Someone with `projects.messages.moderate` files each into a conversation, as from one of its
 * people, or throws it away. The conversations its sender is already in are offered first.
 */
export default function WaitingReplies({ onChanged }) {
  const [data, setData] = useState(null);
  const [pick, setPick] = useState({});
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.waitingReplies().then(setData).catch((e) => setProblem(message(e, 'The waiting replies could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const done = (r, text) => { setData(r); setProblem(''); toast.success(text); onChanged?.(); };
  const file = async (w) => {
    const [thread, contact] = (pick[w.id] ?? '').split(':').map(Number);
    if (!thread) { setProblem('Choose the conversation it belongs to.'); return; }
    try { done(await projectsAPI.fileReply(w.id, thread, contact), 'Filed into the conversation'); } catch (e) { setProblem(message(e, 'It could not be filed.')); }
  };
  const discard = async (w) => { try { done(await projectsAPI.discardReply(w.id, 'Thrown away'), 'Thrown away'); } catch (e) { setProblem(message(e, 'It could not be thrown away.')); } };

  return (
    <Panel data-waiting-replies style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Replies that came in but could not be matched to a conversation. Nothing is lost: file each one, or throw it away.</div>
      {problem && <Notice status="problem">{problem}</Notice>}
      {data.replies.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing is waiting.</p>}
      {data.replies.map((w) => (
        <div key={w.id} data-reply={w.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <Chip status="info">{w.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</Chip>
            <strong>{w.from_name ? `${w.from_name} · ` : ''}{w.from}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>{when(w.received_at)}</span>
          </div>
          {w.subject && <div style={{ fontSize: 13, fontWeight: 600 }}>{w.subject}</div>}
          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{w.body}</div>
          {w.note && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Why it waits: {w.note}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <SelectInput aria-label={`File reply ${w.id} into`} value={pick[w.id] ?? ''} onChange={(e) => setPick({ ...pick, [w.id]: e.target.value })} style={{ width: 'auto', maxWidth: 380 }}>
              <option value="">{w.matches.length ? 'Choose a conversation' : 'No conversation has this sender'}</option>
              {w.matches.map((m) => <option key={`${m.thread_id}:${m.contact_id}`} value={`${m.thread_id}:${m.contact_id}`}>{m.label} · from {m.contact}</option>)}
            </SelectInput>
            <Btn small variant="primary" disabled={!pick[w.id]} onClick={() => file(w)}>File it</Btn>
            <Btn small variant="quiet" onClick={() => discard(w)}>Throw it away</Btn>
          </div>
        </div>
      ))}
    </Panel>
  );
}
