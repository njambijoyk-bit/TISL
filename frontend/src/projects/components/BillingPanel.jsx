import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const STATE = { billed: ['good', 'Billed'], due: ['warning', 'Due'], waiting: ['neutral', 'Not yet'] };
const blank = () => ({ key: Math.random().toString(36).slice(2), name: '', share: '', due_kind: 'manual', due_on: '', phase_id: '', stage_id: '' });

/**
 * The billing plan (docs/PROJECTS_STAGE4_SPEC.md, build 4.6): stages as shares of the agreed value, each falling due on a date, when a phase is
 * done, when the work reaches a stage, or when someone bills it. No amount is kept: each is worked out from the agreed value. Billing a stage
 * posts a sales invoice in Books, or opens Books' sales form filled in, as the money setting says. Retention and advances (build 4.7) are taken
 * off each bill as it is billed; a stage shows what came off, and offers to try again when that could not be done then.
 */
export default function BillingPanel({ projectId, currency, onBilled }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);   // { stages, income_ledger_id } while the plan is being changed
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData((await projectsAPI.billing(projectId)).billing); } catch { setData(null); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data?.ready) return null;
  const f = (n) => (n === null || n === undefined ? <span style={{ color: 'var(--text-secondary)' }}>·</span> : money(n, currency));
  const when = (s) => (s.due_kind === 'date' ? `On ${day(s.due_on)}` : s.due_kind === 'phase' ? `When ${s.phase?.name ?? 'the phase'} is done` : s.due_kind === 'stage' ? `At ${s.stage?.name ?? 'the stage'}` : 'When billed');
  const total = edit ? edit.stages.reduce((n, s) => n + (Number(s.share) || 0), 0) + data.stages.filter((s) => s.state === 'billed').reduce((n, s) => n + s.share, 0) : data.shares;

  const start = () => { setEdit({ income_ledger_id: data.income_chosen ? String(data.income_ledger?.id ?? '') : '', stages: data.stages.filter((s) => s.state !== 'billed').map((s) => ({ key: String(s.id), id: s.id, name: s.name, share: String(s.share), due_kind: s.due_kind, due_on: s.due_on ?? '', phase_id: s.phase ? String(s.phase.id) : '', stage_id: s.stage ? String(s.stage.id) : '' })) }); setProblem(''); };
  const setRow = (key, patch) => { setEdit({ ...edit, stages: edit.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) }); setProblem(''); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const kept = data.stages.filter((s) => s.state === 'billed').map((s) => ({ id: s.id }));
      const stages = [...kept, ...edit.stages.map((s) => ({ id: s.id, name: s.name, share: Number(s.share), due_kind: s.due_kind, due_on: s.due_on || null, phase_id: s.phase_id ? Number(s.phase_id) : null, stage_id: s.stage_id ? Number(s.stage_id) : null }))];
      setData((await projectsAPI.saveBilling(projectId, { stages, income_ledger_id: edit.income_ledger_id ? Number(edit.income_ledger_id) : null })).billing);
      setEdit(null); toast.success('The billing plan is saved');
    } catch (err) { setProblem(message(err, 'The plan could not be saved. Try again.')); } finally { setBusy(false); }
  };
  const bill = async (s) => {
    setBusy(true); setProblem('');
    try {
      const r = await projectsAPI.billStage(projectId, s.id);
      if (r.mode === 'draft') { navigate(`/admin/books/vouchers/new?type=${r.form.voucher_type_id}&project_bill=${s.id}`); return; }
      setData(r.billing); toast.success(`${r.voucher.number} is posted in the books`); onBilled?.();
    } catch (err) { setProblem(message(err, 'That stage could not be billed. Try again.')); } finally { setBusy(false); }
  };

  const deduct = async (s) => {
    setBusy(true); setProblem('');
    try { setData((await projectsAPI.deductStage(projectId, s.id)).billing); toast.success('Taken off the bill in the books'); onBilled?.(); }
    catch (err) { setProblem(message(err, 'That could not be taken off. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel style={{ marginTop: 16 }} data-billing>
      <PanelTitle
        hint={data.basis ? `Shares of the agreed value: ${money(data.basis.net, currency)} before tax, from the linked ${data.basis.from}.` : 'Shares of the agreed value. Link the quotation or sales order to this work first.'}
        right={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Chip status="info">{data.mode === 'post' ? 'Bills are posted' : 'Bills open on the Books form'}</Chip>{data.can.plan && data.basis && !edit && <Btn small onClick={start}>{data.stages.length ? 'Change the plan' : 'Make a plan'}</Btn>}</span>}
      >
        Billing plan
      </PanelTitle>
      {!edit && data.stages.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No billing plan yet.</p>}
      {!edit && data.stages.length > 0 && (
        <DataTable minWidth={640}>
          <thead><tr><th style={th}>Stage</th><th style={{ ...th, textAlign: 'right' }}>Share</th><th style={th}>Falls due</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>State</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.stages.map((s) => (
              <tr key={s.id} data-stage={s.name}>
                <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.share}%</td>
                <td style={td}>{when(s)}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f(s.amount)}</td>
                <td style={td}><Chip status={STATE[s.state][0]}>{STATE[s.state][1]}</Chip>{s.voucher && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.voucher.number}{s.voucher.status === 'cancelled' ? ' (cancelled)' : ''}</span>}
                  {s.retention > 0 && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>less {money(s.retention, currency)} retention</span>}
                  {s.advance > 0 && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>less {money(s.advance, currency)} advance</span>}</td>
                <td style={{ ...td, textAlign: 'right' }}>{s.state !== 'billed' && data.can.bill && <Btn small busy={busy} aria-label={`Bill ${s.name}`} onClick={() => bill(s)}>{data.mode === 'post' ? 'Bill it' : 'Open in Books'}</Btn>}
                  {s.owing && data.can.plan && <Btn small busy={busy} aria-label={`Take retention and advance off ${s.name}`} onClick={() => deduct(s)}>Take retention and advance off</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {!edit && data.stages.length > 0 && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>{total}% of the agreed value is planned. Bills go to {data.income_ledger?.name ?? 'an income ledger still to be chosen'}; the ledger decides the tax, as on the Books form.</p>}
      {edit && (
        <form onSubmit={save} style={{ display: 'grid', gap: 10 }}>
          {data.stages.filter((s) => s.state === 'billed').map((s) => <div key={s.id} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.name} · {s.share}% · billed as {s.voucher?.number}, kept as it is</div>)}
          {edit.stages.map((s, i) => (
            <div key={s.key} data-edit-stage={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'end', padding: 10, borderRadius: 10, background: 'var(--surface-input)' }}>
              <Field label="Stage" htmlFor={`bs-name-${i}`}><TextInput id={`bs-name-${i}`} value={s.name} maxLength={120} onChange={(e) => setRow(s.key, { name: e.target.value })} required /></Field>
              <Field label="Share (%)" htmlFor={`bs-share-${i}`}><TextInput id={`bs-share-${i}`} type="number" min={0.0001} max={100} step="0.0001" value={s.share} onChange={(e) => setRow(s.key, { share: e.target.value })} required /></Field>
              <Field label="Falls due" htmlFor={`bs-kind-${i}`}><SelectInput id={`bs-kind-${i}`} value={s.due_kind} onChange={(e) => setRow(s.key, { due_kind: e.target.value })}>{Object.entries(data.options.due_kinds).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</SelectInput></Field>
              {s.due_kind === 'date' && <Field label="Date" htmlFor={`bs-date-${i}`}><TextInput id={`bs-date-${i}`} type="date" value={s.due_on} onChange={(e) => setRow(s.key, { due_on: e.target.value })} required /></Field>}
              {s.due_kind === 'phase' && <Field label="Phase" htmlFor={`bs-phase-${i}`}><SelectInput id={`bs-phase-${i}`} value={s.phase_id} onChange={(e) => setRow(s.key, { phase_id: e.target.value })} required><option value="">Choose…</option>{data.options.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>}
              {s.due_kind === 'stage' && <Field label="Stage of the work" htmlFor={`bs-stage-${i}`}><SelectInput id={`bs-stage-${i}`} value={s.stage_id} onChange={(e) => setRow(s.key, { stage_id: e.target.value })} required><option value="">Choose…</option>{data.options.stages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>}
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', paddingBottom: 8 }}>{data.basis && Number(s.share) > 0 ? money(Math.round(data.basis.net * Number(s.share)) / 100, currency) : ''}</div>
              <Btn small variant="quiet" aria-label={`Remove ${s.name || 'this stage'}`} onClick={() => setEdit({ ...edit, stages: edit.stages.filter((x) => x.key !== s.key) })}>Remove</Btn>
            </div>
          ))}
          <div><Btn small onClick={() => setEdit({ ...edit, stages: [...edit.stages, blank()] })}>Add a stage</Btn></div>
          <Field label="Income ledger bills go to" htmlFor="bs-income" hint={data.basis ? 'Left empty: the one the agreed order mostly uses.' : undefined}>
            <SelectInput id="bs-income" value={edit.income_ledger_id} onChange={(e) => setEdit({ ...edit, income_ledger_id: e.target.value })}>
              <option value="">{data.income_ledger && !data.income_chosen ? `As the agreed order: ${data.income_ledger.name}` : 'As the agreed order'}</option>
              {data.options.income_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectInput>
          </Field>
          <div data-shares style={{ fontSize: 13, color: total > 100.0001 ? 'var(--status-error)' : 'var(--text-secondary)' }}>{Math.round(total * 10000) / 10000}% of the agreed value planned{total > 100.0001 ? ': no more than 100%' : ''}</div>
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy} disabled={total > 100.0001}>Save the plan</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn></div>
        </form>
      )}
      {!edit && problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
    </Panel>
  );
}
