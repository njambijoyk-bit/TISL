import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message, money } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Advances and retention on a piece of work (docs/PROJECTS_STAGE4_SPEC.md, build 4.7). Only the percentage and the ledgers are kept here; what is
 * held or unused is read from the books. Retention comes off each bill before tax and is released (a serious action) back onto the client's
 * account. An advance is received into cash or bank and used on bills until it is gone.
 */
export default function TermsPanel({ projectId, currency, onChange }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(null);   // null | 'terms' | 'advance' | 'release'
  const [form, setForm] = useState({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData((await projectsAPI.terms(projectId)).terms); } catch { setData(null); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data?.ready) return null;
  const f = (n) => money(n, currency);
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const open = (m, v) => { setMode(m); setForm(v); setProblem(''); };
  const run = async (call, done) => {
    setBusy(true);
    try { setData((await call()).terms); setMode(null); toast.success(done); onChange?.(); } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const from = (l) => (l?.from ? ` (${l.from === 'this work' ? 'chosen for this work' : `as ${l.from}`})` : '');
  const box = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginTop: 12 };
  const line = (label, value, attr) => <div {...attr} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}><span style={{ color: 'var(--text-secondary)' }}>{label}</span><strong style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</strong></div>;

  return (
    <Panel style={{ marginTop: 16 }} data-terms>
      <PanelTitle hint="Taken off each bill as it is billed, as journals in the books." right={(data.can.retention || data.can.advance) && !mode && <Btn small onClick={() => open('terms', { retention_percent: data.retention_percent ?? '', retention_ledger_id: data.retention_ledger?.from === 'this work' ? String(data.retention_ledger.id) : '', advance_ledger_id: data.advance_ledger ? String(data.advance_ledger.id) : '' })}>Change</Btn>}>Advances and retention</PanelTitle>
      {line('Retention', data.retention_percent ? `${data.retention_percent}% of each bill, before tax` : 'None', { 'data-retention': true })}
      {line('Retention ledger', data.retention_ledger ? `${data.retention_ledger.name}${from(data.retention_ledger)}` : (data.retention_mode === 'client' ? "The client's: none chosen yet" : 'None chosen in Configuration'))}
      {line('Retention held', f(data.retention_held), { 'data-retention-held': true })}
      {line('Advances ledger', data.advance_ledger?.name ?? 'None')}
      {line('Advance not yet used', f(data.advance_unused), { 'data-advance-unused': true })}
      {!mode && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {data.can.advance && data.advance_ledger && <Btn small onClick={() => open('advance', { amount: '', ledger_id: '', from: '', reference: '', date: today() })}>Receive an advance</Btn>}
          {data.can.retention && data.retention_held > 0 && <Btn small onClick={() => open('release', { amount: String(data.retention_held), date: today() })}>Release retention</Btn>}
        </div>
      )}
      {mode === 'terms' && (
        <form style={box} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.saveTerms(projectId, { ...(data.can.retention ? { retention_percent: form.retention_percent === '' ? null : Number(form.retention_percent), retention_ledger_id: form.retention_ledger_id ? Number(form.retention_ledger_id) : null } : {}), ...(data.can.advance ? { advance_ledger_id: form.advance_ledger_id ? Number(form.advance_ledger_id) : null } : {}) }), 'Saved'); }}>
          {data.can.retention && <>
            <Field label="Retention (%)" htmlFor="tm-pct"><TextInput id="tm-pct" type="number" min={0} max={50} step="0.001" value={form.retention_percent} onChange={(e) => set({ retention_percent: e.target.value })} /></Field>
            <Field label="Retention ledger" htmlFor="tm-rl"><SelectInput id="tm-rl" value={form.retention_ledger_id} onChange={(e) => set({ retention_ledger_id: e.target.value })}>
              <option value="">{data.retention_mode === 'client' ? "The client's (as their other work)" : 'The company\'s (Configuration)'}</option>
              {data.options.retention_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectInput></Field>
          </>}
          {data.can.advance && <Field label="Advances ledger" htmlFor="tm-al"><SelectInput id="tm-al" value={form.advance_ledger_id} onChange={(e) => set({ advance_ledger_id: e.target.value })}><option value="">None</option>{data.options.advance_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
          {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Save</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
        </form>
      )}
      {mode === 'advance' && (
        <form style={box} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.receiveAdvance(projectId, { ...form, amount: Number(form.amount), ledger_id: Number(form.ledger_id) }), 'The advance is in the books'); }}>
          <Field label="Amount" htmlFor="ad-amount"><TextInput id="ad-amount" type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} required /></Field>
          <Field label="Paid into" htmlFor="ad-into"><SelectInput id="ad-into" value={form.ledger_id} onChange={(e) => set({ ledger_id: e.target.value })} required><option value="">Choose…</option>{data.options.cash_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>
          <Field label="From (optional)" htmlFor="ad-from"><TextInput id="ad-from" value={form.from} maxLength={120} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field label="Date" htmlFor="ad-date"><TextInput id="ad-date" type="date" max={today()} value={form.date} onChange={(e) => set({ date: e.target.value })} required /></Field>
          <Field label="Reference (optional)" htmlFor="ad-ref"><TextInput id="ad-ref" value={form.reference} maxLength={60} onChange={(e) => set({ reference: e.target.value })} /></Field>
          <span style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--text-secondary)' }}>A journal is posted: into the ledger chosen, owed back through {data.advance_ledger?.name} until bills use it.</span>
          {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Record it</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
        </form>
      )}
      {mode === 'release' && (
        <form style={box} data-release onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.releaseRetention(projectId, { amount: Number(form.amount), date: form.date }), 'Released onto the client\'s account'); }}>
          <Field label="Amount to release" htmlFor="rl-amount" hint={Number(form.amount) > data.retention_held ? 'More than is held.' : `Held: ${f(data.retention_held)}`}><TextInput id="rl-amount" type="number" min={0.01} max={data.retention_held} step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} required /></Field>
          <Field label="Date" htmlFor="rl-date"><TextInput id="rl-date" type="date" max={today()} value={form.date} onChange={(e) => set({ date: e.target.value })} required /></Field>
          <span style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--text-secondary)' }}>It goes back onto the client's account in the books, for them to pay.</span>
          {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy} disabled={Number(form.amount) > data.retention_held}>Release it</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
        </form>
      )}
    </Panel>
  );
}
