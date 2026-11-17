import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { check } from './uiTokens';
import DoneForm from './DoneForm';

/**
 * The history of a relationship and what is next (docs/PROJECTS_STAGE3_SPEC.md, build 3.4). `type` is lead | customer | party | opportunity;
 * `id` that record. Their contacts are offered to say who it was with. An opportunity's entries are written to the lead or client it is for.
 */
const when = (s) => `${day(s)} ${s.slice(11, 16)}`;

export default function HistoryPanel({ type, id, onChanged }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);   // null | 'log' | 'next' | { done: followUp } | { edit: entry }
  const [form, setForm] = useState({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState([]);   // theirs, to say who it was with

  const load = useCallback(async () => {
    try { setData(await projectsAPI.history(type, id)); setFailed(''); } catch (e) { setFailed(e?.response?.status === 403 ? '' : message(e, 'The history could not be loaded. Try again.')); }
  }, [type, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (type === 'opportunity') return;
    projectsAPI.contacts(type, id).then((r) => setContacts(r.contacts)).catch(() => setContacts([]));
  }, [type, id]);

  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const open = (m, f = {}) => { setMode(m); setForm(f); setProblem(''); };
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setMode(null); setProblem(''); toast.success(done); onChanged?.(); } catch (e) { setProblem(message(e, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return null;
  const can = data.can.write;

  return (
    <Panel style={{ marginBottom: 16 }} data-history={type}>
      <PanelTitle
        hint="What was said and done, and what happens next."
        right={can && !mode && (
          <div style={{ display: 'flex', gap: 6 }}>
            {data.can.next && <Btn small onClick={() => open('next', { what: '', due_on: in7, owner_id: '' })}>Set a next action</Btn>}
            <Btn small variant="primary" onClick={() => open('log', { kind: 'call', summary: '', contact_id: '', team_only: false })}>Log a call or note</Btn>
          </div>
        )}
      >
        History
      </PanelTitle>

      {data.can.next && (
        <div style={{ marginBottom: 12 }}>
          {data.next.length === 0 && <Notice status="warning">Nothing is planned next.</Notice>}
          {data.next.map((n) => (
            mode?.done?.id === n.id
              ? <DoneForm key={n.id} followUp={n} kinds={data.kinds} owners={data.owners} onCancel={() => setMode(null)} onDone={async (d) => { setData(await projectsAPI.doneNext(n.id, d)); setMode(null); toast.success('Done'); onChanged?.(); }} />
              : (
                <div key={n.id} data-next={n.what} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 6, fontSize: 13.5 }}>
                  <span><strong>Next:</strong> {n.what} <span style={{ color: 'var(--text-secondary)' }}>· {n.owner.name}</span></span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Chip status={n.late ? 'problem' : n.today ? 'warning' : 'neutral'}>{n.late ? `${n.days_late} ${n.days_late === 1 ? 'day' : 'days'} late` : n.today ? 'Today' : day(n.due_on)}</Chip>
                    {can && !mode && <Btn small variant="primary" aria-label={`Mark "${n.what}" done`} onClick={() => open({ done: n })}>Done</Btn>}
                  </span>
                </div>
              )
          ))}
        </div>
      )}

      {mode === 'next' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.setNext(type, id, { ...form, owner_id: form.owner_id ? Number(form.owner_id) : undefined }), 'Next action set'); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label="What is next" htmlFor="next-what"><TextInput id="next-what" value={form.what} maxLength={200} onChange={(e) => setForm({ ...form, what: e.target.value })} required autoFocus /></Field>
          <Field label="By" htmlFor="next-due"><TextInput id="next-due" type="date" value={form.due_on} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, due_on: e.target.value })} required /></Field>
          <Field label="Whose" htmlFor="next-owner"><SelectInput id="next-owner" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}><option value="">Mine</option>{data.owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Set it</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
        </form>
      )}

      {(mode === 'log' || mode?.edit) && (
        <form onSubmit={(e) => { e.preventDefault(); const d = { ...form, contact_id: form.contact_id ? Number(form.contact_id) : null }; run(() => (mode.edit ? projectsAPI.changeHistory(mode.edit.id, d) : projectsAPI.addHistory(type, id, d)), mode.edit ? 'Saved' : 'Logged'); }}
          style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field label="It was a" htmlFor="log-kind"><SelectInput id="log-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(data.kinds).map(([k, name]) => <option key={k} value={k}>{name}</option>)}</SelectInput></Field>
            {contacts.length > 0 && <Field label="With" htmlFor="log-contact"><SelectInput id="log-contact" value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}><option value="">Not one person</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>}
          </div>
          <Field label="What was said or done" htmlFor="log-summary"><textarea id="log-summary" value={form.summary} maxLength={5000} rows={3} onChange={(e) => setForm({ ...form, summary: e.target.value })} required autoFocus
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 13.5, resize: 'vertical', boxSizing: 'border-box' }} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={!!form.team_only} onChange={(e) => setForm({ ...form, team_only: e.target.checked })} />Team only: never shown to the client</label>
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>{mode.edit ? 'Save' : 'Log it'}</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
        </form>
      )}
      {problem && mode === 'next' && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}

      {data.entries.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing written down yet.</p>}
      <div style={{ display: 'grid', gap: 2 }}>
        {data.entries.map((e) => (
          <div key={e.id} data-entry={e.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 110px) 1fr', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5, alignItems: 'start' }}>
            <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{when(e.happened_at)}</span>
            <span style={{ minWidth: 0 }}>
              <strong>{e.kind_name}</strong> · {e.by}{e.contact ? ` with ${e.contact.name}` : ''}
              {e.project && <> · <Link to={`/admin/projects/${e.project.id}`} style={{ color: 'var(--color-primary-500)' }}>{e.project.number}</Link></>}
              {e.opportunity && type !== 'opportunity' && <span style={{ color: 'var(--text-secondary)' }}> · {e.opportunity.title}</span>}
              {e.team_only && <Chip style={{ marginLeft: 6 }}>Team only</Chip>}
              <span style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 2 }}>{e.summary}</span>
            {e.mine && can && !mode && (
              <span style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <Btn small variant="quiet" aria-label={`Change the entry of ${when(e.happened_at)}`} onClick={() => open({ edit: e }, { kind: e.kind, summary: e.summary, contact_id: e.contact?.id || '', team_only: e.team_only })}>Change</Btn>
                <Btn small variant="quiet" aria-label={`Remove the entry of ${when(e.happened_at)}`} onClick={() => run(() => projectsAPI.removeHistory(e.id), 'Removed')}>Remove</Btn>
              </span>
            )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
