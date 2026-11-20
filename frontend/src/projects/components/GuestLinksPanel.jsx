import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, TextInput } from './ui';

const STATE = { live: ['good', 'Live'], ended: ['neutral', 'Ended'], ran_out: ['neutral', 'Ran out'] };
const VISIT = { opened: 'Opened the page', file: 'Downloaded', answered: 'Answered a request' };
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Guest links on the Files tab (docs/PROJECTS_STAGE9_SPEC.md, build 9.6): someone outside who is not the client gets a read-only page with the
 * shared files and what is asked of them, until an end day at most 90 days away. Every opening is listed; a link can be ended at any time.
 */
export default function GuestLinksPanel({ projectId, onChanged }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [visits, setVisits] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.guestLinks(projectId)); } catch (e) { setProblem(message(e, 'The guest links could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data?.links) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.can.give && data.links.length === 0) return null;
  const give = async (e) => {
    e.preventDefault();
    try { setData(await projectsAPI.giveGuestLink(projectId, { name: form.name, email: form.email || null, ends_on: form.ends_on })); setForm(null); setProblem(''); onChanged?.(); toast.success(form.email ? 'Link given and emailed' : 'Link given'); } catch (err) { setProblem(message(err, 'The link could not be given.')); }
  };
  const end = async (l) => { try { setData(await projectsAPI.endGuestLink(projectId, l.id)); onChanged?.(); toast.success('Link ended'); } catch (e) { setProblem(message(e, 'It could not be ended.')); } };
  const showVisits = async (l) => { if (visits?.id === l.id) { setVisits(null); return; } try { setVisits({ id: l.id, rows: (await projectsAPI.guestVisits(projectId, l.id)).visits }); } catch (e) { setProblem(message(e, 'The openings could not be loaded.')); } };
  const copy = async (l) => { const url = `${window.location.origin}${l.link}`; try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { window.prompt('Copy the link', url); } };

  return (
    <Panel data-guest-links style={{ marginBottom: 14 }}>
      <PanelTitle hint={`Read-only: the ${data.shared === 1 ? 'one shared file' : `${data.shared} shared files`} and what you ask of them. ${data.max_days} days at most.`}
        right={data.can.give && !form ? <Btn small onClick={() => setForm({ name: '', email: '', ends_on: inDays(30) })}>Give a guest link</Btn> : null}>Guest links</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {form && (
        <form onSubmit={give} data-guest-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Field label="For" htmlFor="gl-name"><TextInput id="gl-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Email (optional)" htmlFor="gl-email" hint="The link is emailed to them"><TextInput id="gl-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Ends on" htmlFor="gl-ends"><TextInput id="gl-ends" type="date" value={form.ends_on} min={inDays(0)} max={inDays(data.max_days)} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} required /></Field>
          <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Give the link</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
        </form>
      )}
      {data.links.length === 0 && !form && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No guest links yet.</p>}
      {data.links.map((l) => (
        <div key={l.id} data-guest-link={l.name} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong>{l.name}</strong><Chip status={STATE[l.state][0]}>{STATE[l.state][1]}</Chip>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.email ? `${l.email} · ` : ''}until {day(l.ends_on)} · {l.visits === 1 ? 'opened once' : `opened ${l.visits} times`}{l.by ? ` · given by ${l.by}` : ''}</span>
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              {l.link && <Btn small variant="quiet" onClick={() => copy(l)}>Copy the link</Btn>}
              <Btn small variant="quiet" aria-expanded={visits?.id === l.id} onClick={() => showVisits(l)}>Openings</Btn>
              {l.state === 'live' && data.can.give && <Btn small variant="danger" onClick={() => end(l)}>End it now</Btn>}
            </span>
          </div>
          {visits?.id === l.id && (
            <ul data-guest-visits style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {visits.rows.length === 0 ? <li>Not opened yet.</li> : visits.rows.map((v, i) => <li key={i}>{VISIT[v.what] ?? v.what}{v.file ? ` ${v.file}` : ''} · {v.at?.slice(0, 16)}{v.ip ? ` · ${v.ip}` : ''}</li>)}
            </ul>
          )}
        </div>
      ))}
    </Panel>
  );
}
