import { useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * The locks on a piece of work (build 2.3), on its Access tab: each area, whether it is locked and who set the password. Someone who may set
 * access can lock an area, change or remove a lock with its password, and, when the password is lost, ask for a reset that a second person
 * must approve. `locks` is the list from the server; `onChanged(locks)` gets the list back after a change.
 */
const FORMS = {
  lock: { title: (l) => `Lock ${l}`, fields: ['password'], save: 'Lock it', done: 'Locked' },
  change: { title: (l) => `Change the password of ${l}`, fields: ['current', 'password'], save: 'Change the password', done: 'The password is changed' },
  remove: { title: (l) => `Take the lock off ${l}`, fields: ['current'], save: 'Remove the lock', done: 'The lock is off' },
  reset: { title: (l) => `Ask for a reset of ${l}`, fields: ['reason'], save: 'Ask for a reset', done: 'Asked. Someone else must approve it.' },
  finish: { title: (l) => `Set the new password of ${l}`, fields: ['password'], save: 'Set the new password', done: 'The new password is set' },
};
const LABELS = { password: 'New password (at least 8 characters)', current: 'Current password', reason: 'Why it needs resetting' };

export default function LocksSection({ projectId, locks, canSet, onChanged }) {
  const [form, setForm] = useState(null);   // { kind, lock }
  const [values, setValues] = useState({ password: '', current: '', reason: '' });
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (kind, lock) => { setForm({ kind, lock }); setValues({ password: '', current: '', reason: '' }); setProblem(''); };

  const submit = async (e) => {
    e.preventDefault();
    const { kind, lock } = form;
    const call = {
      lock: () => projectsAPI.setLock(projectId, lock.area, { password: values.password }),
      change: () => projectsAPI.setLock(projectId, lock.area, { password: values.password, current: values.current }),
      finish: () => projectsAPI.setLock(projectId, lock.area, { password: values.password, after_reset: true }),
      remove: () => projectsAPI.removeLock(projectId, lock.area, values.current),
      reset: () => projectsAPI.askLockReset(projectId, lock.area, values.reason),
    }[kind];
    setBusy(true);
    try { onChanged(await call()); toast.success(FORMS[kind].done); setForm(null); }
    catch (err) { setProblem(message(err, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Locked areas</h3>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>A locked area asks everyone for its own password, the lead included. A lost password is reset only when a second person approves.</p>

      {form && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <p style={{ gridColumn: '1 / -1', margin: 0, fontWeight: 600, fontSize: 13.5 }}>{FORMS[form.kind].title(form.lock.label)}</p>
          {FORMS[form.kind].fields.map((f) => (
            <Field key={f} label={LABELS[f]} htmlFor={`lock-${f}`}>
              <TextInput id={`lock-${f}`} type={f === 'reason' ? 'text' : 'password'} autoComplete={f === 'reason' ? 'off' : 'new-password'} minLength={f === 'password' ? 8 : undefined} maxLength={f === 'reason' ? 300 : 200}
                value={values[f]} onChange={(e) => { setValues({ ...values, [f]: e.target.value }); setProblem(''); }} required />
            </Field>
          ))}
          {form.kind === 'lock' && <span style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--text-secondary)' }}>Give the password to the people who should have it. It cannot be shown again, by anyone.</span>}
          {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <Btn type="submit" variant={form.kind === 'remove' ? 'danger' : 'primary'} small busy={busy}>{FORMS[form.kind].save}</Btn>
            <Btn small onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </form>
      )}

      <DataTable minWidth={620}>
        <thead><tr><th style={th}>Area</th><th style={th}>Now</th><th style={th}>Password set</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {locks.map((l) => (
            <tr key={l.area} data-lock={l.area}>
              <td style={{ ...td, fontWeight: 600 }}>{l.label}</td>
              <td style={td}>
                <Chip status={l.locked ? 'problem' : 'neutral'}>{l.locked ? 'Locked' : 'Open'}</Chip>
                {l.reset && <Chip status={l.reset.status === 'approved' ? 'good' : 'warning'} style={{ marginLeft: 6 }}>{l.reset.status === 'approved' ? 'Reset approved' : `Reset asked by ${l.reset.asked_by}`}</Chip>}
              </td>
              <td style={td}>{l.locked ? `${day(l.set_at)}${l.set_by ? `, ${l.set_by}` : ''}` : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {canSet && !l.locked && <Btn small aria-label={`Lock ${l.label}`} onClick={() => open('lock', l)}>Lock</Btn>}
                {canSet && l.locked && l.reset?.status === 'approved' && l.reset.mine && <Btn small variant="primary" aria-label={`Set the new password of ${l.label}`} onClick={() => open('finish', l)}>Set the new password</Btn>}
                {canSet && l.locked && !(l.reset?.status === 'approved' && l.reset.mine) && (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <Btn small aria-label={`Change the password of ${l.label}`} onClick={() => open('change', l)}>Change</Btn>
                    <Btn small aria-label={`Take the lock off ${l.label}`} onClick={() => open('remove', l)}>Remove</Btn>
                    {!l.reset && <Btn small aria-label={`Ask for a reset of ${l.label}`} onClick={() => open('reset', l)}>Lost it</Btn>}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
