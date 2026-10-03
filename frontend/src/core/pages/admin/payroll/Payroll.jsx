import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions } from '../../../components/admin/ui/Form';
import payrollAPI from '../../../../_shared/api/payroll';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money } from '../../../components/admin/books/booksFmt';

/**
 * Payroll. A run works out every payslip for a month from the basic salary, verified attendance (unpaid absence, overtime) and the components set up under
 * Payroll settings. Approving posts one journal to the books; paying records the money leaving the bank. Attendance that is not verified blocks approval
 * unless you accept paying that person as it stands.
 */

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const TONE = { draft: '#b45309', approved: '#1d4ed8', paid: '#15803d', cancelled: '#6b7280' };
const monthName = (iso) => new Date(iso).toLocaleString([], { month: 'long', year: 'numeric' });

function Payslip({ line, run, onClose }) {
  const by = (k) => line.breakdown.filter((b) => b.kind === k && b.amount > 0);
  return (
    <Modal title={`Payslip — ${line.name}`} subtitle={`${run.number} · ${monthName(run.period_start)}`} onClose={onClose}>
      <style>{'@media print { body * { visibility: hidden !important; } #payslip, #payslip * { visibility: visible !important; } #payslip { position: absolute; left: 0; top: 0; width: 100%; } }'}</style>
      <div id="payslip" style={{ fontSize: '0.84rem', display: 'grid', gap: 6 }}>
        <Row l="Basic pay" v={line.basic} />
        {line.absence_deduction > 0 && <Row l={`Unpaid absence (${line.days_unpaid} day${line.days_unpaid === 1 ? '' : 's'})`} v={-line.absence_deduction} />}
        {line.overtime_pay > 0 && <Row l={`Overtime (${line.overtime_hours} h)`} v={line.overtime_pay} />}
        {by('earning').map((b) => <Row key={b.name} l={b.name} v={b.amount} />)}
        {line.adjustments.filter((a) => a.kind === 'earning').map((a, i) => <Row key={`e${i}`} l={a.description} v={a.amount} />)}
        <Row l="Gross pay" v={line.gross} bold />
        {by('deduction').map((b) => <Row key={b.name} l={b.name} v={-b.amount} />)}
        {line.adjustments.filter((a) => a.kind === 'deduction').map((a, i) => <Row key={`d${i}`} l={a.description} v={-a.amount} />)}
        <Row l="Net pay" v={line.net} bold />
        <div style={{ color: colors.textFaint, fontSize: '0.72rem', marginTop: 6 }}>Taxable pay {money(line.taxable)}{line.employer_cost > 0 ? ` · employer contributions ${money(line.employer_cost)}` : ''}</div>
      </div>
      <ModalActions onCancel={onClose} submitLabel="Print" onSubmit={() => window.print()} />
    </Modal>
  );
}
const Row = ({ l, v, bold }) => <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 800 : 400, borderTop: bold ? '1px solid #e5e7eb' : 'none', paddingTop: bold ? 4 : 0 }}><span>{l}</span><span>{money(v)}</span></div>;

function PayModal({ run, sources, onClose, onDone }) {
  const [from, setFrom] = useState(sources[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { const r = await payrollAPI.pay(run.id, { from_ledger_id: Number(from) }); toast.success(r.message); onDone(r); } catch (e) { toast.error(errMsg(e, 'Could not pay')); } finally { setBusy(false); } };
  return (
    <Modal title={`Pay ${run.number}`} subtitle={`Net pay ${money(run.total_net)}. Download the bank list to upload to your bank.`} onClose={onClose}>
      <FormStack>
        <Field label="Pay from"><SelectInput value={from} onChange={(e) => setFrom(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.balance)}</option>)}</SelectInput></Field>
        <ModalActions onCancel={onClose} submitLabel="Mark as paid" busyLabel="Saving…" busy={busy} onSubmit={go} />
      </FormStack>
    </Modal>
  );
}

function AdjustForm({ run, line, ledgers, onSaved }) {
  const [rows, setRows] = useState(line.adjustments.map((a) => ({ ...a })));
  const [accept, setAccept] = useState(line.accepted_unverified);
  const set = (i, k, v) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    try { const r = await payrollAPI.adjust(run.id, { user_id: line.user_id, adjustments: rows.filter((x) => Number(x.amount) > 0), accept_unverified: accept }); toast.success(r.message); onSaved(r); } catch (e) { toast.error(errMsg(e, 'Could not save')); }
  };
  return (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
      {line.unverified_days > 0 && (
        <label style={{ fontSize: '0.78rem', color: '#92400e' }}><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> {line.unverified_days} working day(s) are not verified in attendance — pay as it stands</label>
      )}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Description (Bonus, Advance recovered…)" value={r.description} onChange={(e) => set(i, 'description', e.target.value)} style={{ flex: 2, minWidth: 180, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
          <select value={r.kind} onChange={(e) => set(i, 'kind', e.target.value)} style={{ padding: 6, borderRadius: 6 }}><option value="earning">Added</option><option value="deduction">Taken off</option></select>
          <input type="number" min="0" step="0.01" placeholder="Amount" value={r.amount} onChange={(e) => set(i, 'amount', e.target.value)} style={{ width: 110, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
          {r.kind === 'deduction' && <select value={r.ledger_id ?? ''} onChange={(e) => set(i, 'ledger_id', e.target.value ? Number(e.target.value) : null)} style={{ padding: 6, borderRadius: 6, maxWidth: 200 }}><option value="">Credit to…</option>{ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
          <button type="button" style={small} onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}>×</button>
        </div>
      ))}
      <div><button type="button" style={small} onClick={() => setRows((rs) => [...rs, { description: '', amount: '', kind: 'earning', ledger_id: null }])}>+ Add a bonus or deduction</button><button type="button" style={btnPrimary} onClick={save}>Save</button></div>
    </div>
  );
}

function RunView({ id, onBack, onChanged }) {
  const [run, setRun] = useState(null);
  const [cfg, setCfg] = useState({ ledgers: [], sources: [] });
  const [open, setOpen] = useState(null);
  const [slip, setSlip] = useState(null);
  const [paying, setPaying] = useState(false);
  const load = useCallback(() => payrollAPI.show(id).then(setRun).catch((e) => toast.error(errMsg(e, 'Could not load the run'))), [id]);
  useEffect(() => { load(); payrollAPI.settings().then(setCfg).catch(() => {}); }, [load]);
  const act = async (fn, ask) => {
    if (ask && !window.confirm(ask)) return;
    try { const r = await fn(); toast.success(r.message); setRun(r); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not do that'), { duration: 8000 }); }
  };
  const download = async () => { const b = await payrollAPI.csv(id); const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = `${run.number}-bank-list.csv`; a.click(); URL.revokeObjectURL(url); };
  if (!run) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const draft = run.status === 'draft';
  const unv = run.lines.filter((l) => l.unverified_days > 0 && !l.accepted_unverified).length;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={small} onClick={onBack}>‹ All runs</button>
        <strong style={{ fontSize: '1.05rem' }}>{run.number} — {monthName(run.period_start)}</strong>
        <span style={{ color: TONE[run.status], fontWeight: 700, textTransform: 'capitalize' }}>{run.status}</span>
        <span style={{ marginLeft: 'auto' }}>
          {draft && <><button type="button" style={small} onClick={() => act(() => payrollAPI.refresh(id))}>Work out again</button><button type="button" style={btnPrimary} onClick={() => act(() => payrollAPI.approve(id), 'Approve and post this payroll to the books?')}>Approve</button></>}
          {run.status === 'approved' && <button type="button" style={btnPrimary} onClick={() => setPaying(true)}>Pay</button>}
          {run.status !== 'draft' && run.status !== 'cancelled' && <button type="button" style={small} onClick={download}>Bank list (CSV)</button>}
          {run.status !== 'cancelled' && <button type="button" style={small} onClick={() => act(() => payrollAPI.cancel(id), run.status === 'draft' ? 'Cancel this draft?' : 'Cancel this payroll? Its journal (and payment) will be cancelled.')}>Cancel</button>}
        </span>
      </div>
      {(run.journal || run.payment) && (
        <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>
          Posted to the books as {run.journal && <Link to={`/admin/books/vouchers/${run.journal.id}`}>{run.journal.number}</Link>}{run.journal?.status === 'cancelled' ? ' (cancelled)' : ''}
          {run.payment && <> · paid with <Link to={`/admin/books/vouchers/${run.payment.id}`}>{run.payment.number}</Link>{run.payment.status === 'cancelled' ? ' (cancelled)' : ''}</>}
          . <span style={{ color: colors.textFaint }}>To undo it, use Cancel here — it cancels the payment first, then the journal.</span>
        </div>
      )}
      {run.active_components === 0 && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>No deduction is switched on yet, so only basic pay is worked out. Set them up in <Link to="/admin/payroll/settings">Payroll settings</Link>, then "Work out again".</p>}
      {draft && unv > 0 && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>{unv} {unv === 1 ? 'person has' : 'people have'} attendance that is not fully verified. Verify it in <Link to="/admin/attendance">Attendance</Link>, then "Work out again" — or open their line and accept paying them as it stands.</p>}
      <section style={{ ...card, padding: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Employee</th><th style={{ ...th, textAlign: 'right' }}>Basic</th><th style={{ ...th, textAlign: 'right' }}>Unpaid days</th><th style={{ ...th, textAlign: 'right' }}>Overtime</th><th style={{ ...th, textAlign: 'right' }}>Gross</th><th style={{ ...th, textAlign: 'right' }}>Deductions</th><th style={{ ...th, textAlign: 'right' }}>Net pay</th><th style={{ ...th, textAlign: 'right' }}>Employer cost</th><th style={th} /></tr></thead>
          <tbody>
            {run.lines.map((l) => (
              <Fragment key={l.user_id}>
                <tr onClick={() => setOpen(open === l.user_id ? null : l.user_id)} style={{ cursor: 'pointer', background: open === l.user_id ? '#f9fafb' : undefined }}>
                  <td style={td}><strong>{l.name}</strong>{l.unverified_days > 0 && <span style={{ color: l.accepted_unverified ? '#6b7280' : '#b45309', fontSize: '0.7rem' }}> · {l.unverified_days} unverified{l.accepted_unverified ? ' (accepted)' : ''}</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(l.basic)}</td><td style={{ ...td, textAlign: 'right' }}>{l.days_unpaid || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{l.overtime_pay ? money(l.overtime_pay) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(l.gross)}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.total_deductions)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(l.net)}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.employer_cost)}</td>
                  <td style={td}><button type="button" style={small} onClick={(e) => { e.stopPropagation(); setSlip(l); }}>Payslip</button></td>
                </tr>
                {open === l.user_id && (
                  <tr><td colSpan={9} style={{ background: '#f9fafb', padding: '4px 10px 12px' }}>
                    <div style={{ fontSize: '0.78rem', color: colors.textMuted, marginBottom: 6 }}>{l.breakdown.filter((b) => b.amount > 0).map((b) => `${b.name} ${money(b.amount)}${b.kind === 'employer' ? ' (employer)' : ''}`).join(' · ') || 'No components apply.'}</div>
                    {draft && <AdjustForm run={run} line={l} ledgers={cfg.ledgers} onSaved={(r) => { setRun(r); onChanged(); }} />}
                  </td></tr>
                )}
              </Fragment>
            ))}
            <tr><td style={{ ...td, fontWeight: 800 }}>Total</td><td style={td} /><td style={td} /><td style={td} /><td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{money(run.total_gross)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{money(run.total_deductions)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{money(run.total_net)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{money(run.total_employer)}</td><td style={td} /></tr>
          </tbody>
        </table>
      </section>
      {slip && <Payslip line={slip} run={run} onClose={() => setSlip(null)} />}
      {paying && <PayModal run={run} sources={cfg.sources} onClose={() => setPaying(false)} onDone={(r) => { setPaying(false); setRun(r); onChanged(); }} />}
    </div>
  );
}

export default function Payroll() {
  const [data, setData] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => payrollAPI.list().then(setData).catch((e) => setError(errMsg(e, 'Could not load payroll'))), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => { setBusy(true); try { const r = await payrollAPI.create(month); toast.success(r.message); await load(); setView(r.id); } catch (e) { toast.error(errMsg(e, 'Could not start the run')); } finally { setBusy(false); } };
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Payroll" description="A month's payslips from salaries and verified attendance. Approving posts one journal to the books; paying records the bank payment." action={<Link to="/admin/payroll/settings" style={{ ...btnGhost, textDecoration: 'none' }}>Payroll settings</Link>} />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {data && !data.table_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 64_payroll.sql to use payroll.</p>}
        {view ? <RunView id={view} onBack={() => setView(null)} onChanged={load} /> : data?.table_ready && (
          <div style={{ display: 'grid', gap: 14 }}>
            {data.active_components === 0 && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>No deduction is switched on yet. Check the starter rates in <Link to="/admin/payroll/settings">Payroll settings</Link> and switch on the ones you use.</p>}
            <section style={{ ...card, padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Start a payroll</strong>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
              <button type="button" style={btnPrimary} disabled={busy} onClick={create}>{busy ? 'Working it out…' : 'Work out the payroll'}</button>
              <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{data.payees} people have a salary on their employee record.</span>
            </section>
            <section style={{ ...card, padding: 8 }}>
              {!data.runs.length ? <p style={{ padding: 14, color: colors.textMuted, fontSize: '0.84rem' }}>No payroll yet.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Run</th><th style={th}>Month</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Gross</th><th style={{ ...th, textAlign: 'right' }}>Net pay</th><th style={{ ...th, textAlign: 'right' }}>Employer cost</th></tr></thead>
                  <tbody>{data.runs.map((r) => (
                    <tr key={r.id} onClick={() => setView(r.id)} style={{ cursor: 'pointer' }}>
                      <td style={td}><strong>{r.number}</strong></td><td style={td}>{monthName(r.period_start)}</td><td style={{ ...td, color: TONE[r.status], fontWeight: 700, textTransform: 'capitalize' }}>{r.status}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(r.total_gross)}</td><td style={{ ...td, textAlign: 'right' }}>{money(r.total_net)}</td><td style={{ ...td, textAlign: 'right' }}>{money(r.total_employer)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
