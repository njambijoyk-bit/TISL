import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { check } from './uiTokens';
import KnownNotice from './KnownNotice';

/**
 * The people at a client, a lead or another party (docs/PROJECTS_STAGE3_SPEC.md, build 3.3), each there for one or more reasons from the
 * list an owner manages, and one of them the main contact. `type` is customer | lead | party; `id` is that record.
 */
const EMPTY = { name: '', job_title: '', email: '', phone: '', roles: [], is_main: false };

export default function ContactsPanel({ type, id, title = 'People there' }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [editing, setEditing] = useState(null);   // null | 'new' | a contact
  const [form, setForm] = useState(EMPTY);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.contacts(type, id)); setFailed(''); } catch (e) { setFailed(e?.response?.status === 403 ? '' : message(e, 'The contacts could not be loaded. Try again.')); if (e?.response?.status === 403) setData(null); }
  }, [type, id]);
  useEffect(() => { load(); }, [load]);

  const open = (c) => { setEditing(c || 'new'); setForm(c ? { name: c.name, job_title: c.job_title || '', email: c.email || '', phone: c.phone || '', roles: c.roles.map((r) => r.key), is_main: c.is_main } : EMPTY); setProblem(''); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setData(editing === 'new' ? await projectsAPI.addContact(type, id, form) : await projectsAPI.changeContact(editing.id, form));
      toast.success(editing === 'new' ? 'Added' : 'Saved'); setEditing(null);
    } catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };
  const remove = async (c) => {
    setBusy(true);
    try { setData(await projectsAPI.removeContact(c.id)); toast.success(`${c.name} removed`); setEditing(null); } catch (err) { toast.error(message(err, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };

  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return null;
  const can = data.can.change;

  return (
    <Panel style={{ marginBottom: 16 }} data-contacts={type}>
      <PanelTitle hint="One of them is the main contact." right={can && !editing && <Btn small variant="primary" onClick={() => open(null)}>Add contact</Btn>}>{title}</PanelTitle>

      {editing && (
        <form onSubmit={save} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <Field label="Name" htmlFor="contact-name"><TextInput id="contact-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></Field>
            <Field label="Job title" htmlFor="contact-title"><TextInput id="contact-title" value={form.job_title} maxLength={120} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></Field>
            <Field label="Email" htmlFor="contact-email"><TextInput id="contact-email" type="email" value={form.email} maxLength={160} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="contact-phone"><TextInput id="contact-phone" value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>There for</legend>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {data.roles.map((r) => (
                <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                  <input type="checkbox" style={check} checked={form.roles.includes(r.key)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, r.key] : form.roles.filter((k) => k !== r.key) })} />{r.name}
                </label>
              ))}
            </div>
          </fieldset>
          {!(editing !== 'new' && editing.is_main) && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={form.is_main} onChange={(e) => setForm({ ...form, is_main: e.target.checked })} />The main contact</label>}
          {editing === 'new' && <KnownNotice name={form.name} email={form.email} phone={form.phone} />}
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn type="submit" variant="primary" small busy={busy}>{editing === 'new' ? 'Add' : 'Save'}</Btn>
            <Btn small onClick={() => setEditing(null)}>Cancel</Btn>
            {editing !== 'new' && <Btn small variant="danger" busy={busy} onClick={() => remove(editing)}>Remove {editing.name}</Btn>}
          </div>
        </form>
      )}

      {data.contacts.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No one yet.</p>}
      {data.contacts.map((c) => (
        <div key={c.id} data-contact={c.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <span style={{ minWidth: 0 }}>
            <strong>{c.name}</strong>{c.job_title && <span style={{ color: 'var(--text-secondary)' }}> · {c.job_title}</span>}
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
          </span>
          <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {c.is_main && <Chip status="info">Main contact</Chip>}
            {c.roles.map((r) => <Chip key={r.key}>{r.name}</Chip>)}
            {can && !editing && <Btn small aria-label={`Change ${c.name}`} onClick={() => open(c)}>Change</Btn>}
          </span>
        </div>
      ))}
    </Panel>
  );
}
