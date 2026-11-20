import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput } from './ui';

const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', lineHeight: 1.5 };
const STATE = { draft: ['warning', 'Draft'], sent: ['good', 'Sent'], discarded: ['neutral', 'Thrown away'] };
const week = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Weekly updates (docs/PROJECTS_STAGE12_SPEC.md, build 12.6): each Friday Mimi drafts the week's update for the client. The lead reads it,
 * changes it and sends it as a message in a client conversation, or throws it away. Nothing is sent by itself.
 */
export default function UpdatesPanel({ projectId }) {
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [thread, setThread] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const take = (r) => { setD(r); const draft = r.updates.find((u) => u.state === 'draft'); setText(draft?.body ?? ''); };
  useEffect(() => { projectsAPI.updates(projectId).then(take).catch(() => setD(false)); }, [projectId]);
  if (!d || !d.ready) return null;
  const draft = d.updates.find((u) => u.state === 'draft');
  const past = d.updates.filter((u) => u.state !== 'draft').slice(0, 4);
  const act = async (what, ok) => {
    setBusy(true);
    try { take(await projectsAPI.decideUpdate(projectId, draft.id, what, what === 'send' ? { body: text, thread_id: thread || null } : what === 'save' ? { body: text } : {})); setProblem(''); toast.success(ok); } catch (e) { setProblem(message(e, 'That could not be done.')); }
    setBusy(false);
  };
  const make = async () => { setBusy(true); try { take(await projectsAPI.draftUpdate(projectId)); setProblem(''); } catch (e) { setProblem(message(e, 'The update could not be drafted.')); } setBusy(false); };

  return (
    <Panel data-updates>
      <PanelTitle hint="Mimi drafts it on Fridays from the week's work. You send it, or throw it away." right={!draft ? <Btn small busy={busy} onClick={make}>Draft this week's</Btn> : null}>Weekly update</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {draft ? (
        <div data-update-draft style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Week of {week(draft.week)} · {draft.by_ai ? 'written by Mimi' : 'written from the week\'s facts (no AI)'}</span>
          <Field label="The update" htmlFor="up-body"><textarea id="up-body" rows={8} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} style={area} /></Field>
          {d.threads.length > 0 && (
            <Field label="Send it in" htmlFor="up-thread"><SelectInput id="up-thread" value={thread} onChange={(e) => setThread(e.target.value)}><option value="">The latest client conversation</option>{d.threads.map((t) => <option key={t.id} value={t.id}>{t.subject}</option>)}</SelectInput></Field>
          )}
          {d.threads.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>It starts a "Weekly updates" conversation with the client's main contact.</span>}
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Btn small variant="primary" busy={busy} disabled={!text.trim()} onClick={() => act('send', 'Sent to the client')}>Send to the client</Btn>
            <Btn small busy={busy} disabled={text === draft.body} onClick={() => act('save', 'Saved')}>Save changes</Btn>
            <Btn small variant="quiet" busy={busy} onClick={make}>Draft again</Btn>
            <Btn small variant="quiet" busy={busy} onClick={() => act('discard', 'Thrown away')}>Throw away</Btn>
          </span>
        </div>
      ) : <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>No draft waiting.</p>}
      {past.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {past.map((u) => <li key={u.id} data-update={u.id}>Week of {week(u.week)} <Chip status={STATE[u.state][0]}>{STATE[u.state][1]}</Chip>{u.decided_by ? ` by ${u.decided_by}` : ''}</li>)}
        </ul>
      )}
    </Panel>
  );
}
