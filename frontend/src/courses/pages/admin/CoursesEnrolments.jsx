import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import CoursesNav from '../../components/CoursesNav';
import Pill from '../../components/Pill';
import UserPicker from '../../components/UserPicker';

const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TONE = { pending: 'warn', active: 'ok', completed: 'ok', cancelled: 'neutral', refunded: 'neutral' };

function EnrolForm({ offerings, onClose, onDone }) {
  const [offeringId, setOfferingId] = useState('');
  const [fees, setFees] = useState([]);
  const [student, setStudent] = useState(null);
  const [payer, setPayer] = useState(null);
  const [optional, setOptional] = useState([]);
  const [disc, setDisc] = useState({ pct: '', note: '' });
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFees([]); setOptional([]); setQuote(null); if (offeringId) coursesAPI.fees(offeringId).then((r) => setFees(r.fees.filter((x) => x.is_optional && x.is_active))).catch(() => setFees([])); }, [offeringId]);
  const body = () => ({ student_user_id: student?.id, payer_user_id: payer?.id, optional_fee_ids: optional, discount_pct: disc.pct === '' ? undefined : Number(disc.pct) });
  useEffect(() => {
    setQuote(null);
    if (!offeringId || !student) return undefined;
    const t = setTimeout(() => { coursesAPI.quote(offeringId, body()).then(setQuote).catch((e) => toast.error(errMsg(e, 'Could not work out the cost'), { duration: 6000 })); }, 300);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeringId, student, payer, optional, disc.pct]);
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.enrol(offeringId, { ...body(), discount_note: disc.note || undefined }); toast.success(r.message); onDone(r.enrolment); } catch (e) { toast.error(errMsg(e, 'Could not enrol'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Enrol a student" onClose={onClose} width={640} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Enrol" busy={busy} disabled={!offeringId || !student || (disc.pct !== '' && Number(disc.pct) > 0 && !disc.note.trim())} />}>
      <FormStack>
        <Field label="Offering" htmlFor="en-off"><SelectInput id="en-off" value={offeringId} onChange={(e) => setOfferingId(e.target.value)}><option value="">Choose</option>{offerings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</SelectInput></Field>
        <Field label="Student" htmlFor="en-stu" hint={student ? `Chosen: ${student.name}` : 'Search by name or email.'}><UserPicker id="en-stu" onPick={setStudent} /></Field>
        <Field label="Invoice goes to (if not the student)" htmlFor="en-pay" hint={payer ? `Chosen: ${payer.name}` : 'Leave empty when the student pays.'}><UserPicker id="en-pay" onPick={setPayer} /></Field>
        {fees.length > 0 && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            <legend style={{ fontSize: '0.72rem', fontWeight: 800, marginBottom: 4 }}>Extras</legend>
            {fees.map((x) => <label key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={optional.includes(x.id)} onChange={() => setOptional((o) => (o.includes(x.id) ? o.filter((i) => i !== x.id) : [...o, x.id]))} /> {x.name} · {money(x.amount)}</label>)}
          </fieldset>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <Field label="Discount (%)" htmlFor="en-dp"><TextInput id="en-dp" inputMode="decimal" value={disc.pct} onChange={(e) => setDisc({ ...disc, pct: e.target.value })} /></Field>
          <Field label="Why" htmlFor="en-dn" hint="Needed with a discount."><TextInput id="en-dn" maxLength={200} value={disc.note} onChange={(e) => setDisc({ ...disc, note: e.target.value })} /></Field>
        </div>
        {quote && (
          <section style={{ ...card, padding: 12, display: 'grid', gap: 4, fontSize: '0.86rem' }} data-testid="enrol-quote">
            {quote.lines.map((l) => <div key={l.fee_id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l.name}</span><span>{money(l.amount)}</span></div>)}
            {quote.skipped.length > 0 && <div style={{ color: colors.textMuted }}>Not charged again: {quote.skipped.join(', ')}</div>}
            {quote.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>−{money(quote.discount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Total with tax</span><span>{money(quote.total)}</span></div>
            {quote.schedule.map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: colors.textMuted }}><span>{r.label} · {r.due_date}</span><span>{money(r.amount)}</span></div>)}
          </section>
        )}
      </FormStack>
    </Modal>
  );
}

function PayForm({ enrolment, methods, onClose, onDone }) {
  const [amount, setAmount] = useState(String(enrolment.next_due || enrolment.balance));
  const [method, setMethod] = useState(methods[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.takePayment(enrolment.id, [{ payment_method_id: Number(method), amount: Number(amount), reference: ref || undefined }]); toast.success(r.message); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not record the payment'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Take a payment for ${enrolment.number}`} subtitle={`${enrolment.student} · ${money(enrolment.balance)} still to pay`} onClose={onClose} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Record payment" busy={busy} disabled={!method || !(Number(amount) > 0)} />}>
      <FormStack>
        <Field label="Amount" htmlFor="pm-amt"><TextInput id="pm-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid by" htmlFor="pm-m"><SelectInput id="pm-m" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
        <Field label="Reference" htmlFor="pm-r" hint="The M-Pesa code, cheque number…"><TextInput id="pm-r" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </FormStack>
    </Modal>
  );
}

export default function CoursesEnrolments() {
  const user = useAuthStore((s) => s.user);
  const [meta, setMeta] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState({ q: '', status: '', offering_id: '' });
  const [form, setForm] = useState(false);
  const [pay, setPay] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => coursesAPI.enrolments(filter).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load'))), [filter]);
  useEffect(() => { coursesAPI.enrolMeta().then(setMeta).catch(() => {}); coursesAPI.offerings({ status: 'published' }).then((r) => setOfferings(r.offerings)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  if (!hasAnyPermission(user, ['courses.enrol', 'courses.manage', 'courses.refund'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the enrolments" /></div></AdminLayout>;
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };
  const cancel = (e) => { const reason = window.prompt('Why is it cancelled? (optional)'); if (reason === null) return; run(() => coursesAPI.cancelEnrolment(e.id, reason), 'Enrolment cancelled.'); };
  const refund = (e) => {
    if (!window.confirm(`Refund ${e.number}? A credit note is made for the refundable fees and the enrolment ends.`)) return;
    const reason = window.prompt('Why is it refunded? (optional)') ?? '';
    run(() => coursesAPI.refundEnrolment(e.id, { reason, force: !e.refund_open }), 'Refunded: the credit note is in the books.');
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="courses-enrolments">
        <CoursesNav />
        <HubHeader title="Enrolments" description="Who is enrolled, what they owe and have paid. Every enrolment is an invoice in the books; payments, discounts and refunds are books documents." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 153_courses_fees.sql to switch enrolments on.</p>}
        {data?.ready && meta && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              {meta.can_enrol && <button type="button" style={btnPrimary} onClick={() => setForm(true)}><Plus size={14} aria-hidden="true" /> Enrol a student</button>}
              <TextInput aria-label="Search" placeholder="Number, name or email" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ maxWidth: 220 }} />
              <SelectInput aria-label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={{ maxWidth: 190 }}><option value="">Any status</option>{Object.entries(meta.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
              <SelectInput aria-label="Offering" value={filter.offering_id} onChange={(e) => setFilter({ ...filter, offering_id: e.target.value })} style={{ maxWidth: 220 }}><option value="">All offerings</option>{offerings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</SelectInput>
            </div>
            {data.enrolments.length === 0 && <p style={{ color: colors.textMuted }}>No enrolments yet.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              {data.enrolments.map((e) => (
                <article key={e.id} data-enrolment={e.number} style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}><strong>{e.student}</strong> <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{e.number} · {e.offering}{e.payer ? ` · invoiced to ${e.payer}` : ''}</span></div>
                    <Pill tone={TONE[e.status]}>{e.status_label}</Pill>
                    {e.access_paused && <Pill tone="danger">Access on hold</Pill>}
                    <span style={{ fontSize: '0.84rem' }}>{money(e.paid_total)} of {money(e.total)}</span>
                    <button type="button" style={btnGhost} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide' : 'Details'}</button>
                    {meta.can_enrol && ['pending', 'active'].includes(e.status) && e.balance > 0 && <button type="button" style={btnPrimary} onClick={() => setPay(e)}>Take payment</button>}
                    {meta.can_enrol && ['pending', 'active'].includes(e.status) && e.paid_total <= 0 && <button type="button" style={btnGhost} onClick={() => cancel(e)}>Cancel</button>}
                    {meta.can_refund && e.can_refund && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => refund(e)}>Refund</button>}
                  </div>
                  {open === e.id && (
                    <div style={{ display: 'grid', gap: 4, fontSize: '0.84rem' }}>
                      {e.lines.map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l.name}{!l.refundable ? ' (not refundable)' : ''}</span><span>{money(l.amount)}</span></div>)}
                      {e.discount_pct > 0 && <div style={{ color: colors.textMuted }}>Discount {e.discount_pct}%: {e.discount_note}</div>}
                      {e.instalments.map((i) => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', color: i.late ? colors.danger : colors.textMuted }}><span>{i.label} · due {i.due_date}{i.late ? ' · late' : ''}</span><span>{money(i.paid_amount)} / {money(i.amount)}{i.paid ? ' ✓' : ''}</span></div>)}
                      {e.cancel_reason && <div style={{ color: colors.textMuted }}>{e.cancel_reason}</div>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      {form && <EnrolForm offerings={offerings} onClose={() => setForm(false)} onDone={() => { setForm(false); load(); }} />}
      {pay && meta && <PayForm enrolment={pay} methods={meta.payment_methods} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
    </AdminLayout>
  );
}
