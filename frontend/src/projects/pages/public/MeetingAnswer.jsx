import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import projectsAPI from '../../../_shared/api/projects';
import api from '../../../_shared/api/axios';

const ANSWERS = [['yes', 'Yes, I will come'], ['maybe', 'Maybe'], ['no', 'No, I cannot come']];
const box = { maxWidth: 560, margin: '40px auto', padding: 24, background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' };
const fmt = (s) => new Date(String(s).replace(' ', 'T')).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * A meeting invitation's answer page (docs/PROJECTS_STAGE6_SPEC.md, build 6.6): an outside contact opens the link from their invitation, sees the
 * meeting and answers yes, no or maybe without signing in. The long code in the link is the key; it can also download the calendar file.
 */
export default function MeetingAnswer() {
  const { token } = useParams();
  const [m, setM] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { projectsAPI.publicMeeting(token).then(setM).catch((e) => setProblem(e?.response?.data?.message || 'This invitation could not be opened.')); }, [token]);
  const answer = async (a) => {
    setBusy(a);
    try { setM(await projectsAPI.answerPublicMeeting(token, a)); setProblem(''); } catch (e) { setProblem(e?.response?.data?.message || 'Your answer could not be saved. Try again.'); } finally { setBusy(''); }
  };
  if (!m) return <main style={box}>{problem ? <p role="alert">{problem}</p> : <p>Opening the invitation…</p>}</main>;
  const open = m.state === 'planned';

  return (
    <main style={{ padding: '0 16px', background: 'var(--bg-primary, var(--surface-hover))', minHeight: '100vh' }}>
      <div style={box} data-meeting-answer>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{m.company} · {m.project}</p>
        <h1 style={{ margin: '6px 0 12px', fontSize: 22 }}>{m.title}</h1>
        {m.state === 'cancelled' && <p role="status" style={{ padding: 10, borderRadius: 9, background: 'var(--surface-hover)' }}>This meeting was cancelled.</p>}
        <div style={{ display: 'grid', gap: 6, fontSize: 14.5 }}>
          <div><strong>When:</strong> {fmt(m.starts_at)} to {new Date(String(m.ends_at).replace(' ', 'T')).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          {m.location && <div><strong>Where:</strong> {m.location}</div>}
          {m.online_link && <div><strong>Online:</strong> <a href={m.online_link} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-600)' }}>{m.online_link}</a></div>}
          <div><strong>Organised by:</strong> {m.organiser}</div>
          {m.agenda && <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}><strong>Agenda</strong><br />{m.agenda}</div>}
        </div>
        {open && (
          <div role="group" aria-label="Your answer" style={{ marginTop: 18, display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{m.who ? `${m.who}, can you come?` : 'Can you come?'}</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ANSWERS.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={m.response === k} disabled={!!busy} onClick={() => answer(k)}
                  style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${m.response === k ? 'var(--color-primary-600)' : 'var(--line-strong)'}`, background: m.response === k ? 'var(--color-primary-600)' : 'var(--surface-card)', color: m.response === k ? 'var(--text-inverse, var(--surface-card))' : 'var(--text-primary)', cursor: 'pointer', font: 'inherit' }}>
                  {busy === k ? 'Saving…' : label}
                </button>
              ))}
            </div>
            {m.response !== 'pending' && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Thank you. Your answer is "{m.answers[m.response]}". You can change it here until the meeting.</p>}
          </div>
        )}
        {problem && <p role="alert" style={{ marginTop: 12 }}>{problem}</p>}
        <p style={{ marginTop: 18, fontSize: 13 }}><a href={`${String(api.defaults.baseURL).replace(/\/$/, '')}/meetings/${token}/ics`} style={{ color: 'var(--color-primary-600)' }}>Add it to my calendar</a></p>
      </div>
    </main>
  );
}
