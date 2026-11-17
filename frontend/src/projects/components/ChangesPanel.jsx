import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const TONE = { draft: 'neutral', submitted: 'warning', approved: 'good', rejected: 'problem', withdrawn: 'neutral' };
const blank = () => ({ title: '', reason: '', changes_price: false, effects: [] });
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)' };

/**
 * Changes (docs/PROJECTS_STAGE5_SPEC.md, build 5.5): what and why, and what a change does to scope lines, key dates and tasks, and whether it
 * changes the price. Sent for a decision, approved by someone other than whoever raised it, and applied in one step. A change that alters the
 * price opens Books' sales order form filled in.
 */
export default function ChangesPanel({ projectId, word }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [deciding, setDeciding] = useState(null);   // { id, step, note }
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.changes(projectId)); } catch (e) { setProblem(message(e, 'The changes could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const o = data.options;
  const run = async (call, done) => {
    setBusy(true);
    try { const r = await call(); setData(r); setProblem(''); toast.success(done); return r; } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); return null; } finally { setBusy(false); }
  };
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const setEffect = (i, patch) => set({ effects: form.effects.map((e, n) => (n === i ? { ...e, ...patch, data: { ...e.data, ...(patch.data || {}) } } : e)) });
  const save = async (e, thenSubmit = false) => {
    e?.preventDefault();
    const body = { title: form.title, reason: form.reason, changes_price: form.changes_price, effects: form.effects.map((x) => ({ kind: x.kind, target_id: x.target_id ? Number(x.target_id) : null, data: x.data })) };
    const r = await run(() => (form.id ? projectsAPI.editChange(projectId, form.id, body) : projectsAPI.raiseChange(projectId, body)), form.id ? 'Saved' : 'Change raised');
    if (!r) return;
    const id = form.id ?? r.changes[0]?.id;
    setForm(null);
    if (thenSubmit && id) await run(() => projectsAPI.changeStep(projectId, id, 'submit'), 'Sent for a decision');
  };
  const decide = async (c, step, note) => {
    const r = await run(() => projectsAPI.changeStep(projectId, c.id, step, { note }), { approve: 'Approved, and applied', reject: 'Rejected', withdraw: 'Withdrawn', submit: 'Sent for a decision' }[step]);
    if (r) setDeciding(null);
    if (r?.order_needed) toast('It changes the price: Books\' sales order form is opening for it.');
    if (r?.order_needed) openOrder(c.id);
  };
  const openOrder = async (id) => {
    try { const { order } = await projectsAPI.changeOrderForm(id); navigate(`/admin/books/vouchers/new?type=${order.voucher_type_id}&project_change=${id}`); }
    catch (e) { setProblem(message(e, 'The sales order could not be opened.')); }
  };
  const one = (word ? word('change') : 'Change').toLowerCase();
  const target = (kind) => (kind === 'scope_alter' ? o.scope_lines : kind === 'date_move' ? o.key_dates : kind === 'task_move' ? o.tasks : []);

  return (
    <Panel data-changes>
      <PanelTitle hint="A change says what and why. Someone other than whoever raised it decides; approving applies it in one step."
        right={data.can.raise && !form && <Btn small variant="primary" onClick={() => { setForm(blank()); setProblem(''); }}>Raise a {one}</Btn>}>{word ? word('change', true) : 'Changes'}</PanelTitle>

      {form && (
        <form onSubmit={save} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }} data-change-form>
          <Field label="What changes" htmlFor="ch-title"><TextInput id="ch-title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} required /></Field>
          <Field label="Why (optional)" htmlFor="ch-reason"><textarea id="ch-reason" rows={2} maxLength={3000} value={form.reason} onChange={(e) => set({ reason: e.target.value })} style={area} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}><input type="checkbox" id="ch-price" checked={form.changes_price} onChange={(e) => set({ changes_price: e.target.checked })} style={{ accentColor: 'var(--color-primary-500)' }} />It changes the price (a Books sales order is raised for it once approved)</label>
          {form.effects.map((x, i) => (
            <div key={i} data-effect={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'end', padding: 10, borderRadius: 8, background: 'var(--surface-card)' }}>
              <Field label="It" htmlFor={`ef-kind-${i}`}><SelectInput id={`ef-kind-${i}`} value={x.kind} onChange={(e) => setEffect(i, { kind: e.target.value, target_id: '', data: {} })}>{Object.entries(data.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
              {x.kind !== 'scope_add' && <Field label="Which" htmlFor={`ef-target-${i}`}><SelectInput id={`ef-target-${i}`} value={x.target_id} onChange={(e) => setEffect(i, { target_id: e.target.value })} required><option value="">Choose…</option>{target(x.kind).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</SelectInput></Field>}
              {x.kind === 'scope_add' && <>
                <Field label="Code" htmlFor={`ef-code-${i}`}><TextInput id={`ef-code-${i}`} value={x.data.code ?? ''} onChange={(e) => setEffect(i, { data: { code: e.target.value } })} /></Field>
                <Field label="Description" htmlFor={`ef-desc-${i}`}><TextInput id={`ef-desc-${i}`} value={x.data.description ?? ''} onChange={(e) => setEffect(i, { data: { description: e.target.value } })} required /></Field>
                <Field label="Unit" htmlFor={`ef-unit-${i}`}><TextInput id={`ef-unit-${i}`} value={x.data.unit ?? ''} onChange={(e) => setEffect(i, { data: { unit: e.target.value } })} /></Field>
                <Field label="Quantity" htmlFor={`ef-qty-${i}`}><TextInput id={`ef-qty-${i}`} type="number" min={0} step="any" value={x.data.quantity ?? ''} onChange={(e) => setEffect(i, { data: { quantity: e.target.value } })} /></Field>
              </>}
              {x.kind === 'scope_alter' && <Field label="New quantity" htmlFor={`ef-nq-${i}`}><TextInput id={`ef-nq-${i}`} type="number" min={0} step="any" value={x.data.quantity ?? ''} onChange={(e) => setEffect(i, { data: { quantity: e.target.value } })} /></Field>}
              {x.kind === 'date_move' && <>
                <Field label="New date" htmlFor={`ef-date-${i}`}><TextInput id={`ef-date-${i}`} type="date" value={x.data.date ?? ''} onChange={(e) => setEffect(i, { data: { date: e.target.value } })} required /></Field>
                <Field label="Time (optional)" htmlFor={`ef-time-${i}`}><TextInput id={`ef-time-${i}`} type="time" value={x.data.time ?? ''} onChange={(e) => setEffect(i, { data: { time: e.target.value } })} /></Field>
              </>}
              {x.kind === 'task_move' && <Field label="Due" htmlFor={`ef-due-${i}`}><TextInput id={`ef-due-${i}`} type="date" value={x.data.due_date ?? ''} onChange={(e) => setEffect(i, { data: { due_date: e.target.value } })} required /></Field>}
              <Btn small variant="quiet" aria-label={`Remove what change line ${i + 1} does`} onClick={() => set({ effects: form.effects.filter((_, n) => n !== i) })}>Remove</Btn>
            </div>
          ))}
          <div><Btn small onClick={() => set({ effects: [...form.effects, { kind: 'scope_add', target_id: '', data: {} }] })}>Add what it does</Btn></div>
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn type="submit" small busy={busy}>Save as a draft</Btn>
            <Btn small variant="primary" busy={busy} onClick={() => save(null, true)}>Save and send for a decision</Btn>
            <Btn small onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </form>
      )}

      {data.changes.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing raised yet.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {data.changes.map((c) => (
          <article key={c.id} data-change={c.ref} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong>{c.ref} · {c.title}</strong>
              <Chip status={TONE[c.state]}>{data.states[c.state]}</Chip>
              {c.changes_price && <Chip status="warning">Changes the price</Chip>}
              {c.order && <Chip status="info">Sales order {c.order.number}</Chip>}
            </div>
            {c.reason && <p style={{ margin: 0, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{c.reason}</p>}
            {c.effects.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: 'grid', gap: 2 }}>{c.effects.map((e) => <li key={e.id}>{e.what}{e.applied ? ' ✓' : ''}</li>)}</ul>}
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Raised by {c.raised_by}{c.decided_by ? ` · ${data.states[c.state].toLowerCase()} by ${c.decided_by} on ${day(c.decided_at)}${c.decision_note ? `: ${c.decision_note}` : ''}` : ''}</span>
            {deciding?.id === c.id ? (
              <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); decide(c, deciding.step, deciding.note); }}>
                <Field label={deciding.step === 'approve' ? 'Note (optional)' : 'Why not'} htmlFor="ch-note"><TextInput id="ch-note" value={deciding.note} maxLength={300} onChange={(e) => setDeciding({ ...deciding, note: e.target.value })} required={deciding.step === 'reject'} style={{ width: 260 }} /></Field>
                <Btn type="submit" small variant={deciding.step === 'approve' ? 'primary' : 'danger'} busy={busy}>{deciding.step === 'approve' ? 'Approve and apply it' : 'Reject it'}</Btn>
                <Btn small onClick={() => setDeciding(null)}>Cancel</Btn>
              </form>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.can.edit && <Btn small onClick={() => setForm({ id: c.id, title: c.title, reason: c.reason ?? '', changes_price: c.changes_price, effects: c.effects.map((e) => ({ kind: e.kind, target_id: e.target_id ?? '', data: e.kind === 'date_move' ? { date: e.data.starts_at?.slice(0, 10), time: e.data.all_day ? '' : e.data.starts_at?.slice(11, 16) } : e.data })) })}>Change</Btn>}
                {c.can.edit && <Btn small variant="primary" busy={busy} onClick={() => decide(c, 'submit')}>Send for a decision</Btn>}
                {c.can.decide && <Btn small variant="primary" onClick={() => setDeciding({ id: c.id, step: 'approve', note: '' })}>Approve</Btn>}
                {c.can.decide && <Btn small variant="danger" onClick={() => setDeciding({ id: c.id, step: 'reject', note: '' })}>Reject</Btn>}
                {c.can.withdraw && <Btn small variant="quiet" busy={busy} onClick={() => decide(c, 'withdraw')}>Withdraw</Btn>}
                {c.state === 'approved' && c.changes_price && !c.order && data.can.approve && <Btn small busy={busy} onClick={() => openOrder(c.id)}>Raise its sales order in Books</Btn>}
                {c.state === 'submitted' && c.mine && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Waiting for someone else to decide.</span>}
              </div>
            )}
          </article>
        ))}
      </div>
      {problem && !form && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
    </Panel>
  );
}
