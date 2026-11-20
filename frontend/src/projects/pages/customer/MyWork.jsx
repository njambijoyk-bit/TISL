import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import projectsAPI from '../../../_shared/api/projects';
import { message, money } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle } from '../../components/ui';
import { td, th } from '../../components/uiTokens';

const page = { maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', display: 'grid', gap: 14 };
const link = { color: 'var(--color-primary-600)', fontSize: 14 };
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ANSWER = { yes: ['good', 'Coming'], no: ['problem', 'Not coming'], maybe: ['neutral', 'Maybe'] };
const PHASE = { done: 'good', active: 'info', blocked: 'problem' };

/**
 * The client portal (docs/PROJECTS_STAGE9_SPEC.md, build 9.5): a customer signed in sees their own pieces of work: the stage it is at, the
 * meetings they are asked to, the files the team chose to share, what is asked of them and the invoices on it (read from the books).
 */
export function MyWorkList() {
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.portalWork().then(setData).catch((e) => setProblem(message(e, 'Your work could not be loaded.'))); }, []);
  if (!data) return <div style={page}>{problem ? <Notice status="problem">{problem}</Notice> : <p>Loading…</p>}</div>;

  return (
    <div style={page} data-my-work>
      <h1 style={{ margin: 0, fontSize: 24 }}>My work</h1>
      {data.work.length === 0 ? <Notice>There is no work with us under your account yet.</Notice> : (
        <Panel>
          <DataTable minWidth={480}>
            <thead><tr><th style={th}>Work</th><th style={th}>Stage</th><th style={th}>Asked of you</th></tr></thead>
            <tbody>
              {data.work.map((w) => (
                <tr key={w.id} data-my-work-row={w.id}>
                  <td style={td}><Link to={`/my-work/${w.id}`} style={link}>{w.title}</Link>{w.number && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · {w.number}</span>}</td>
                  <td style={td}>{w.stage ?? '—'}</td>
                  <td style={td}>{w.waiting > 0 ? <Chip status="warning">{w.waiting} waiting</Chip> : <span style={{ color: 'var(--text-secondary)' }}>Nothing</span>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}
    </div>
  );
}

export function MyWorkOne({ id }) {
  const [w, setW] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.portalWorkOne(id).then(setW).catch((e) => setProblem(message(e, 'This work could not be loaded.'))); }, [id]);
  if (!w) return <div style={page}>{problem ? <Notice status="problem">{problem}</Notice> : <p>Loading…</p>}</div>;
  const download = async (f) => {
    try {
      const blob = await projectsAPI.portalWorkFile(id, f.id);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setProblem(message(e, 'That file could not be downloaded.')); }
  };

  return (
    <div style={page} data-my-work-one>
      <p style={{ margin: 0, fontSize: 13 }}><Link to="/my-work" style={link}>My work</Link></p>
      <h1 style={{ margin: 0, fontSize: 24 }}>{w.work.title}</h1>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
        {[w.work.number, w.work.start_date && `Started ${day(w.work.start_date)}`, w.work.due_date && `Due ${day(w.work.due_date)}`].filter(Boolean).join(' · ')}
      </p>
      {problem && <Notice status="problem">{problem}</Notice>}

      {w.stages.length > 0 && (
        <Panel data-my-stages>
          <PanelTitle>Where it is</PanelTitle>
          <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
            {w.stages.map((s) => <li key={s.name} aria-current={s.now ? 'step' : undefined}><Chip status={s.now ? 'info' : s.past ? 'good' : 'neutral'}>{s.name}</Chip></li>)}
          </ol>
          {w.phases.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 14 }}>
              {w.phases.map((p) => <li key={p.name}>{p.name} <Chip status={PHASE[p.state] ?? 'neutral'}>{p.state}</Chip></li>)}
            </ul>
          )}
        </Panel>
      )}

      {w.requests.length > 0 && (
        <Panel data-my-requests>
          <PanelTitle hint="Each opens a page where you send the file or sign off.">Asked of you</PanelTitle>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {w.requests.map((r) => (
              <li key={r.link}><a href={r.link} style={link}>{r.what}</a> <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{r.kind === 'file' ? 'a file' : 'a sign-off'}{r.due_on ? ` · by ${day(r.due_on)}` : ''}{r.of ? ` · for ${r.of}` : ''}</span></li>
            ))}
          </ul>
        </Panel>
      )}

      {w.meetings.length > 0 && (
        <Panel data-my-meetings>
          <PanelTitle>Meetings</PanelTitle>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 14 }}>
            {w.meetings.map((m, i) => (
              <li key={i}>
                <strong>{m.title}</strong> · {when(m.starts_at)}{m.location ? ` · ${m.location}` : ''}
                {m.online_link && <> · <a href={m.online_link} target="_blank" rel="noreferrer" style={link}>Join online</a></>}
                {ANSWER[m.answer] && <> · <Chip status={ANSWER[m.answer][0]}>{ANSWER[m.answer][1]}</Chip></>}
                {m.answer_link && <> · <a href={m.answer_link} style={link}>Answer</a></>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel data-my-files>
        <PanelTitle hint="The documents the team shared with you.">Documents</PanelTitle>
        {w.files.length === 0 ? <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>Nothing shared yet.</p> : (
          <DataTable minWidth={420}>
            <thead><tr><th style={th}>Document</th><th style={th}>Size</th><th style={th}>Shared</th><th style={th} /></tr></thead>
            <tbody>
              {w.files.map((f) => (
                <tr key={f.id} data-my-file={f.name}>
                  <td style={td}>{f.name}{f.versions > 1 && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}> · version {f.versions}</span>}</td>
                  <td style={td}>{size(f.size)}</td>
                  <td style={td}>{day(f.shared_at)}</td>
                  <td style={td}><Btn small onClick={() => download(f)}>Download</Btn></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {w.scorecard?.length > 0 && (
        <Panel data-my-scorecard>
          <PanelTitle hint="How your work is going, worked out from the work itself.">How it is going</PanelTitle>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 14 }}>
            {w.scorecard.map((k) => <li key={k.name}>{k.name}: <strong>{k.value === null ? 'not measured yet' : `${Number(k.value).toLocaleString('en-GB', { maximumFractionDigits: 1 })}${{ pct: '%', days: ' days', hours: ' h' }[k.unit] ?? ''}`}</strong> <Chip status={{ good: 'good', warn: 'warning', bad: 'problem' }[k.status] ?? 'neutral'}>{{ good: 'On track', warn: 'Needs watching', bad: 'Off track' }[k.status] ?? 'Not measured'}</Chip></li>)}
          </ul>
        </Panel>
      )}

      {w.snags?.length > 0 && (
        <Panel data-my-snags>
          <PanelTitle hint="Things to put right that the team shared with you.">Snags</PanelTitle>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 14 }}>
            {w.snags.map((n) => <li key={n.number}>{n.title}{n.area ? ` · ${n.area}` : ''} <Chip status={n.state === 'closed' ? 'good' : n.state === 'fixed' ? 'info' : 'warning'}>{n.state === 'closed' ? 'Done' : n.state === 'fixed' ? 'Fixed, being checked' : 'Open'}</Chip></li>)}
          </ul>
        </Panel>
      )}

      {w.invoices.length > 0 && (
        <Panel data-my-invoices>
          <PanelTitle right={<Link to="/my-account" style={link}>Pay from My account</Link>}>Invoices</PanelTitle>
          <DataTable minWidth={420}>
            <thead><tr><th style={th}>Invoice</th><th style={th}>Date</th><th style={th}>Total</th><th style={th}>Still to pay</th></tr></thead>
            <tbody>
              {w.invoices.map((i) => (
                <tr key={i.number} data-my-invoice={i.number}>
                  <td style={td}>{i.number}</td>
                  <td style={td}>{day(i.date)}</td>
                  <td style={td}>{i.total == null ? '—' : money(i.total)}</td>
                  <td style={td}>{i.open > 0 ? <Chip status="warning">{money(i.open)}</Chip> : <Chip status="good">Paid</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}
    </div>
  );
}

/** /my-work and /my-work/:id, with the shop's header and footer. */
export default function MyWork() {
  const { id } = useParams();
  return (
    <>
      <Header />
      <main style={{ minHeight: '70vh', background: 'var(--bg-primary, var(--surface-hover))' }}>{id ? <MyWorkOne id={id} /> : <MyWorkList />}</main>
      <Footer />
    </>
  );
}
