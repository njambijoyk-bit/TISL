import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';
import KnownNotice from './KnownNotice';

/**
 * Who else is on a piece of work (docs/PROJECTS_STAGE3_SPEC.md, build 3.3): the client's own contacts to call for it, and the other parties
 * (the other side, consultants, authorities), each in a role that follows the industry. A party is one record reused across pieces of work.
 * A warning shows when a party is also a lead or a client.
 */
export default function PartiesPanel({ projectId, word }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);   // null | 'party' | 'contact'
  const [form, setForm] = useState({ party: null, name: '', kind: 'organisation', phone: '', email: '', role_id: '', note: '', contact_id: '' });
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.parties(projectId)); setFailed(''); } catch (e) { setFailed(message(e, 'This could not be loaded. Try again.')); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (mode !== 'party' || form.party || q.trim().length < 2) { setFound([]); return undefined; }
    let live = true;
    const id = setTimeout(() => { projectsAPI.findParties(q).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, mode, form.party]);

  const open = (m) => { setMode(m); setProblem(''); setQ(''); setForm({ party: null, name: '', kind: 'organisation', phone: '', email: '', role_id: '', note: '', contact_id: '' }); };
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setMode(null); setProblem(''); toast.success(done); } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const addParty = (e) => {
    e.preventDefault();
    const base = { role_id: Number(form.role_id), note: form.note };
    run(() => projectsAPI.addParty(projectId, form.party ? { ...base, party_id: form.party.id } : { ...base, name: q, kind: form.kind, phone: form.phone, email: form.email }), 'Added');
  };

  if (failed) return <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  if (!data.ready) return <Notice status="warning">Other parties need database script 259.</Notice>;
  const can = data.can.change;
  const thing = word('project', false, true);

  return (
    <>
      <Panel style={{ marginBottom: 16 }}>
        <PanelTitle hint={`The client's people to call for this ${thing}.`} right={can && !mode && data.available_contacts.length > 0 && <Btn small onClick={() => open('contact')}>Add from the client</Btn>}>Client contacts on this</PanelTitle>
        {mode === 'contact' && (
          <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.addPartyContact(projectId, { contact_id: Number(form.contact_id), note: form.note }), 'Added'); }} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
            <Field label="Contact" htmlFor="pc-contact"><SelectInput id="pc-contact" value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} required><option value="">Choose…</option>{data.available_contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
            <Field label="For what, on this (optional)" htmlFor="pc-note" style={{ flex: '1 1 200px' }}><TextInput id="pc-note" value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <Btn type="submit" variant="primary" small busy={busy}>Add</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
          </form>
        )}
        {data.client_contacts.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None chosen. The client's main contact is the one to call.</p>}
        {data.client_contacts.map((c) => (
          <div key={c.id} data-client-contact={c.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
            <span><strong>{c.name}</strong>{c.job_title && ` · ${c.job_title}`}{c.note && <span style={{ color: 'var(--text-secondary)' }}> · {c.note}</span>}<span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</span></span>
            {can && <Btn small aria-label={`Take ${c.name} off this`} busy={busy} onClick={() => run(() => projectsAPI.removePartyContact(projectId, c.id), 'Taken off')}>Take off</Btn>}
          </div>
        ))}
      </Panel>

      <Panel>
        <PanelTitle hint="Anyone on this who is neither the client nor your staff." right={can && !mode && <Btn small variant="primary" onClick={() => open('party')}>Add a party</Btn>}>Other parties</PanelTitle>
        {mode === 'party' && (
          <form onSubmit={addParty} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <Field label="Party" htmlFor="party-name" hint={form.party ? 'Already known. Their details are kept on one record.' : 'Type to find one already known, or a new name.'}>
                {form.party
                  ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 36 }}><strong style={{ fontSize: 13.5 }}>{form.party.name}</strong><Btn small onClick={() => setForm({ ...form, party: null })}>Change</Btn></div>
                  : <><TextInput id="party-name" value={q} maxLength={160} onChange={(e) => setQ(e.target.value)} autoComplete="off" required autoFocus />
                    {found.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{found.map((p) => <Btn key={p.id} small onClick={() => { setForm({ ...form, party: p }); setQ(''); }}>{p.name}{p.detail ? ` · ${p.detail}` : ''}</Btn>)}</div>}</>}
              </Field>
              <Field label="What they are on this" htmlFor="party-role"><SelectInput id="party-role" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} required><option value="">Choose…</option>{data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>
              {!form.party && <Field label="A person or an organisation" htmlFor="party-kind"><SelectInput id="party-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="organisation">An organisation</option><option value="person">A person</option></SelectInput></Field>}
              {!form.party && <Field label="Phone" htmlFor="party-phone"><TextInput id="party-phone" value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>}
              {!form.party && <Field label="Email" htmlFor="party-email"><TextInput id="party-email" type="email" value={form.email} maxLength={160} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
              <Field label="Note (optional)" htmlFor="party-note"><TextInput id="party-note" value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            </div>
            {!form.party && <KnownNotice name={q} email={form.email} phone={form.phone} />}
            {problem && <Notice status="problem">{problem}</Notice>}
            <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Add the party</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
          </form>
        )}
        {problem && mode !== 'party' && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
        {data.parties.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No other parties.</p>}
        {data.parties.length > 0 && (
          <DataTable minWidth={640}>
            <thead><tr><th style={th}>Party</th><th style={th}>Role here</th><th style={th}>Their contact</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.parties.map((p) => (
                <tr key={p.id} data-party={p.name}>
                  <td style={td}>
                    <strong>{p.name}</strong>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{[p.phone, p.email].filter(Boolean).join(' · ')}{p.note ? `${p.phone || p.email ? ' · ' : ''}${p.note}` : ''}</span>
                    {p.also.map((a) => <Chip key={a} status="warning" style={{ marginTop: 4 }}>{a}</Chip>)}
                  </td>
                  <td style={td}><Chip>{p.role}</Chip></td>
                  <td style={td}>{p.contact ? <>{p.contact.name}{p.contact.phone && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{p.contact.phone}</span>}</> : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{can && <Btn small aria-label={`Take ${p.name} off this`} busy={busy} onClick={() => run(() => projectsAPI.removeParty(projectId, p.id), 'Taken off')}>Take off</Btn>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </>
  );
}
