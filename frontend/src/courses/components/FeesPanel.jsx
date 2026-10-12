import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../core/components/admin/tax/SalesAccountSelect';
import coursesAPI from '../../_shared/api/courses';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import Pill from './Pill';

const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function FeeForm({ offering, fee, kinds, onClose, onDone }) {
  const [f, setF] = useState({ kind: fee?.kind ?? 'tuition', name: fee?.name ?? '', amount: fee?.amount ?? '', ledger_id: fee?.ledger_id ?? '', is_optional: fee?.is_optional ?? false,
    once_per_student: fee?.once_per_student ?? false, refundable: fee?.refundable ?? true, is_active: fee?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const pickKind = (e) => { const kind = e.target.value; setF((x) => ({ ...x, kind, name: x.name || kinds[kind], once_per_student: kind === 'registration' ? true : x.once_per_student, refundable: kind === 'registration' ? false : x.refundable })); };
  const save = async () => {
    setBusy(true);
    try { await coursesAPI.saveFee(offering.id, { ...f, amount: Number(f.amount), ledger_id: Number(f.ledger_id) }, fee?.id); toast.success('Fee saved.'); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not save the fee'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={fee ? `Edit ${fee.name}` : 'Add a fee'} onClose={onClose} width={560} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save fee" busy={busy} disabled={!f.name.trim() || !f.amount || !f.ledger_id} />}>
      <FormStack>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Kind" htmlFor="fe-kind"><SelectInput id="fe-kind" value={f.kind} onChange={pickKind}>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="Amount (before tax)" htmlFor="fe-amt"><TextInput id="fe-amt" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        </div>
        <Field label="Name on the invoice" htmlFor="fe-name"><TextInput id="fe-name" maxLength={120} value={f.name} onChange={set('name')} /></Field>
        <SalesAccountSelect kind="sales" scope={f.kind === 'materials' ? 'product' : 'service'} label="Booked under (it decides the tax)" value={f.ledger_id} onChange={(v) => setF((x) => ({ ...x, ledger_id: v }))} required />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_optional} onChange={set('is_optional')} disabled={f.once_per_student} /> The student chooses it (a kit, an exam)</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.once_per_student} onChange={set('once_per_student')} disabled={f.is_optional} /> Charged once per student (not again on their next enrolment)</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.refundable} onChange={set('refundable')} /> Refunded when the enrolment is refunded</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> On (new enrolments are charged it)</label>
      </FormStack>
    </Modal>
  );
}

/** Fees and the payment plan of an offering: what is charged, in how many payments, and when access opens. Money goes through the books. */
export default function FeesPanel({ offering, onChanged }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState({ deposit_pct: offering.deposit_pct ?? '', instalments: offering.instalments ?? '', instalment_days: offering.instalment_days ?? 30, grant_on: offering.grant_on ?? 'paid',
    grace_days: offering.grace_days ?? 7, refund_days: offering.refund_days ?? '', capacity: offering.capacity ?? '' });
  const load = useCallback(() => coursesAPI.fees(offering.id).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the fees'))), [offering.id]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setPlan((x) => ({ ...x, [k]: e.target.value }));
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const savePlan = async () => {
    try {
      await coursesAPI.saveOffering(offering.id, { deposit_pct: num(plan.deposit_pct), instalments: num(plan.instalments), instalment_days: num(plan.instalment_days), grant_on: plan.grant_on, grace_days: num(plan.grace_days), refund_days: num(plan.refund_days), capacity: num(plan.capacity) });
      toast.success('Payment plan saved.'); onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not save the plan'), { duration: 8000 }); }
  };
  if (!data) return <p>Loading…</p>;
  if (!data.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 153_courses_fees.sql to switch fees on.</p>;
  const total = data.fees.filter((x) => x.is_active && !x.is_optional).reduce((n, x) => n + x.amount, 0);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Fees {data.fees.length > 0 && <span style={{ color: colors.textMuted, fontWeight: 600, fontSize: '0.82rem' }}>· {money(total)} before tax for the required ones</span>}</strong>
          <button type="button" style={btnPrimary} onClick={() => setForm({})}><Plus size={14} aria-hidden="true" /> Add a fee</button>
        </div>
        {data.fees.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.86rem' }}>No fees: enrolling is free and opens access at once.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {data.fees.map((x) => (
            <li key={x.id} data-fee={x.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6, opacity: x.is_active ? 1 : 0.55 }}>
              <span style={{ flex: 1, minWidth: 180 }}><strong>{x.name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{x.kind_label} · {x.ledger}</span></span>
              <strong>{money(x.amount)}</strong>
              {x.is_optional && <Pill>Optional</Pill>}
              {x.once_per_student && <Pill>Once per student</Pill>}
              {!x.refundable && <Pill tone="warn">Not refundable</Pill>}
              {!x.is_active && <Pill tone="danger">Off</Pill>}
              <button type="button" style={btnGhost} onClick={() => setForm(x)}>Edit</button>
              <button type="button" aria-label={`Remove ${x.name}`} style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('Remove this fee?') && coursesAPI.removeFee(offering.id, x.id).then(load).catch((e) => toast.error(errMsg(e, 'Could not remove it'), { duration: 8000 }))}><Trash2 size={13} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
        <strong>Payment plan and places</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Field label="Deposit (% of the total)" htmlFor="pp-dep" hint="Empty: no deposit."><TextInput id="pp-dep" inputMode="decimal" value={plan.deposit_pct} onChange={set('deposit_pct')} /></Field>
          <Field label="Instalments" htmlFor="pp-n" hint="Payments the rest is split into."><TextInput id="pp-n" inputMode="numeric" value={plan.instalments} onChange={set('instalments')} /></Field>
          <Field label="Days between payments" htmlFor="pp-gap"><TextInput id="pp-gap" inputMode="numeric" value={plan.instalment_days} onChange={set('instalment_days')} /></Field>
          <Field label="Access opens" htmlFor="pp-grant"><SelectInput id="pp-grant" value={plan.grant_on} onChange={set('grant_on')}><option value="paid">When paid in full</option><option value="deposit">At the deposit (first payment)</option></SelectInput></Field>
          <Field label="Days a payment may be late" htmlFor="pp-grace" hint="Then access is held back."><TextInput id="pp-grace" inputMode="numeric" value={plan.grace_days} onChange={set('grace_days')} /></Field>
          <Field label="Refund window (days)" htmlFor="pp-ref" hint="Empty: always open to staff."><TextInput id="pp-ref" inputMode="numeric" value={plan.refund_days} onChange={set('refund_days')} /></Field>
          <Field label="Places" htmlFor="pp-cap" hint="Empty: no limit."><TextInput id="pp-cap" inputMode="numeric" value={plan.capacity} onChange={set('capacity')} /></Field>
        </div>
        <div><button type="button" style={btnPrimary} onClick={savePlan}>Save the plan</button></div>
      </section>
      {form && <FeeForm offering={offering} fee={form.id ? form : null} kinds={data.kinds} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
    </div>
  );
}
