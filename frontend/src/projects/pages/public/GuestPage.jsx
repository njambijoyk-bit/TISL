import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import projectsAPI from '../../../_shared/api/projects';

const box = { maxWidth: 640, margin: '40px auto', padding: 24, background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' };
const button = { padding: '6px 12px', borderRadius: 9, border: '1px solid var(--color-primary-600)', background: 'var(--surface-card)', color: 'var(--text-primary)', cursor: 'pointer', font: 'inherit', fontSize: 13 };
const link = { color: 'var(--color-primary-600)' };
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const STATE = { open: 'Waiting for you', done: 'Done', declined: 'Declined' };

/**
 * A guest link (docs/PROJECTS_STAGE9_SPEC.md, build 9.6): opened from the email or a link someone sent, no sign-in; the long code is the key and
 * it stops working on its end day. Read-only: the files shared on the work and what is asked of this guest.
 */
export default function GuestPage() {
  const { token } = useParams();
  const [g, setG] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.guestPage(token).then(setG).catch((e) => setProblem(e?.response?.data?.message || 'This link could not be opened.')); }, [token]);
  if (!g) return <main style={box}>{problem ? <p role="alert">{problem}</p> : <p>Opening…</p>}</main>;
  const download = async (f) => {
    try {
      const blob = await projectsAPI.guestFile(token, f.id);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setProblem(e?.response?.status === 410 ? 'This link has ended.' : 'That file could not be downloaded.'); }
  };

  return (
    <main style={{ padding: '0 16px', minHeight: '100vh', background: 'var(--bg-primary, var(--surface-hover))' }}>
      <div style={box} data-guest-page>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{g.company} · {g.project}</p>
        <h1 style={{ margin: '6px 0 4px', fontSize: 21 }}>Documents shared with {g.name}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>This link works until {day(g.ends_on)}. Each opening is recorded.</p>
        {g.requests.length > 0 && (
          <section data-guest-requests style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Asked of you</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 14 }}>
              {g.requests.map((r) => (
                <li key={r.link}>{r.state === 'open' ? <a href={r.link} style={link}>{r.what}</a> : r.what} <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>· {r.kind === 'file' ? 'a file' : 'a sign-off'}{r.due_on ? ` · by ${day(r.due_on)}` : ''} · {STATE[r.state]}</span></li>
              ))}
            </ul>
          </section>
        )}
        <section data-guest-files>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Documents</h2>
          {g.files.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Nothing is shared yet.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {g.files.map((f) => (
                <li key={f.id} data-guest-file={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                  <span>{f.name} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {size(f.size)}{f.versions > 1 ? ` · version ${f.versions}` : ''}</span></span>
                  <button type="button" onClick={() => download(f)} style={button}>Download</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {problem && <p role="alert" style={{ marginTop: 12 }}>{problem}</p>}
      </div>
    </main>
  );
}
