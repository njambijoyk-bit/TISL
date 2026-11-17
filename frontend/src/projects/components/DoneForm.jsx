import { useState } from 'react';
import { Btn, Field, Notice, SelectInput, TextInput } from './ui';
import { check } from './uiTokens';

/**
 * Marking a next action done (build 3.4): what happened (kept in the history) and what is next, unless the person says nothing more is
 * planned. `onDone(data)` sends it; it answers a refusal by throwing, which is shown here.
 */
export default function DoneForm({ followUp, kinds, owners, onDone, onCancel, prefix = 'done' }) {
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [form, setForm] = useState({ kind: 'call', summary: '', next_what: '', next_due: in7, next_owner_id: followUp.owner.id, no_next: false });
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onDone({ ...form, next_owner_id: Number(form.next_owner_id) }); } catch (err) { setProblem(err?.response?.data?.message || 'That could not be done. Try again.'); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)' }} data-done-form={followUp.id}>
      <strong style={{ fontSize: 13.5 }}>Done: {followUp.what}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
        <Field label="It was a" htmlFor={`${prefix}-kind`}><SelectInput id={`${prefix}-kind`} value={form.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(kinds).map(([k, name]) => <option key={k} value={k}>{name}</option>)}</SelectInput></Field>
        <Field label="What happened (kept in the history)" htmlFor={`${prefix}-summary`}><TextInput id={`${prefix}-summary`} value={form.summary} maxLength={5000} onChange={(e) => set({ summary: e.target.value })} autoFocus /></Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={form.no_next} onChange={(e) => set({ no_next: e.target.checked })} />Nothing more is planned</label>
      {!form.no_next && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Field label="What is next" htmlFor={`${prefix}-next`}><TextInput id={`${prefix}-next`} value={form.next_what} maxLength={200} onChange={(e) => set({ next_what: e.target.value })} required /></Field>
          <Field label="By" htmlFor={`${prefix}-due`}><TextInput id={`${prefix}-due`} type="date" value={form.next_due} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ next_due: e.target.value })} required /></Field>
          <Field label="Whose" htmlFor={`${prefix}-owner`}><SelectInput id={`${prefix}-owner`} value={form.next_owner_id} onChange={(e) => set({ next_owner_id: e.target.value })}>{owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>
        </div>
      )}
      {problem && <Notice status="problem">{problem}</Notice>}
      <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Mark it done</Btn><Btn small onClick={onCancel}>Cancel</Btn></div>
    </form>
  );
}
