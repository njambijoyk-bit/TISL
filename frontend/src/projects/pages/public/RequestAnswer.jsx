import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../../_shared/api/axios';
import projectsAPI from '../../../_shared/api/projects';

const box = { maxWidth: 560, margin: '40px auto', padding: 24, background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' };
const input = { padding: '9px 11px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'inherit', width: '100%', boxSizing: 'border-box' };
const button = (on) => ({ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--color-primary-600)', background: on ? 'var(--color-primary-600)' : 'var(--surface-card)', color: on ? 'var(--text-inverse)' : 'var(--text-primary)', cursor: 'pointer', font: 'inherit' });

/**
 * A file or sign-off asked of someone outside (docs/PROJECTS_STAGE9_SPEC.md, build 9.3): opened from the email, no sign-in; the long code in the
 * link is the key. They send the file, or look at the exact version and approve or decline it with their typed name.
 */
export default function RequestAnswer() {
  const { token } = useParams();
  const [r, setR] = useState(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.publicRequest(token).then(setR).catch((e) => setProblem(e?.response?.data?.message || 'This link could not be opened.')); }, [token]);
  const send = async (body, f) => {
    setBusy(true);
    try { setR(await projectsAPI.answerPublicRequest(token, body, f)); setProblem(''); } catch (e) { setProblem(e?.response?.data?.message || 'It could not be sent. Try again.'); } finally { setBusy(false); }
  };
  if (!r) return <main style={box}>{problem ? <p role="alert">{problem}</p> : <p>Opening…</p>}</main>;
  const fileUrl = `${String(api.defaults.baseURL).replace(/\/$/, '')}/requests/${token}/file`;

  return (
    <main style={{ padding: '0 16px', minHeight: '100vh', background: 'var(--bg-primary, var(--surface-hover))' }}>
      <div style={box} data-request-answer>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{r.company} · {r.project}</p>
        <h1 style={{ margin: '6px 0 12px', fontSize: 21 }}>{r.what}</h1>
        {r.due_on && <p style={{ margin: '0 0 10px', fontSize: 14 }}>By {new Date(r.due_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        {r.state !== 'open' ? (
          <p role="status" style={{ padding: 10, borderRadius: 9, background: 'var(--surface-hover)' }}>{r.state === 'declined' ? 'Declined' : r.kind === 'file' ? 'Sent' : 'Signed off'}{r.answer?.name ? ` by ${r.answer.name}` : ''}. Thank you.</p>
        ) : r.kind === 'file' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="file" aria-label="Choose the file" onChange={(e) => setFile(e.target.files[0] ?? null)} />
            <input aria-label="A note (optional)" placeholder="A note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={input} />
            <span><button type="button" disabled={!file || busy} onClick={() => send({ note }, file)} style={button(true)}>{busy ? 'Sending…' : 'Send it'}</button></span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14 }}><a href={fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-600)' }}>Open {r.file?.name} (version {r.file?.version})</a></p>
            <input aria-label="Type your full name to sign" placeholder="Type your full name to sign" value={name} onChange={(e) => setName(e.target.value)} style={input} />
            <input aria-label="A note" placeholder="A note (needed when you decline)" value={note} onChange={(e) => setNote(e.target.value)} style={input} />
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy} onClick={() => send({ decision: 'approve', name, note })} style={button(true)}>Approve</button>
              <button type="button" disabled={busy} onClick={() => send({ decision: 'decline', name, note })} style={button(false)}>Decline</button>
            </span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Your typed name, the time and your internet address are kept with this exact version.</p>
          </div>
        )}
        {problem && <p role="alert" style={{ marginTop: 12 }}>{problem}</p>}
      </div>
    </main>
  );
}
